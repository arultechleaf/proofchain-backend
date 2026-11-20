import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Notification } from '../notifications/notification.entity';
import {
  OrderStatus, STORE_ROLES, StoreOrder, StoreOrderEvent, StoreOrderItem, StoreProduct, StoreShop, StoreShopStaff,
} from './store.entities';

export interface StoreUser {
  id: number;
  email: string;
  role: string;
  name: string;
}

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Who may move an order to which status, and from where. */
const FORWARD: Record<string, OrderStatus[]> = {
  placed: ['accepted', 'rejected'],
  accepted: ['packing', 'cancelled'],
  packing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'cancelled'],
  out_for_delivery: ['delivered'],
};

const STATUS_TEXT: Record<OrderStatus, string> = {
  placed: 'placed',
  accepted: 'accepted by the shop',
  packing: 'being packed',
  ready: 'packed and ready',
  out_for_delivery: 'out for delivery',
  delivered: 'delivered',
  cancelled: 'cancelled',
  rejected: 'rejected by the shop',
};

/** Shared helpers: shop lookup, notifications, and the order status machine used by all three roles. */
@Injectable()
export class StoreCoreService {
  private readonly logger = new Logger(StoreCoreService.name);

  constructor(
    private readonly ds: DataSource,
    @InjectRepository(StoreShop) readonly shops: Repository<StoreShop>,
    @InjectRepository(StoreShopStaff) readonly staff: Repository<StoreShopStaff>,
    @InjectRepository(StoreProduct) readonly products: Repository<StoreProduct>,
    @InjectRepository(StoreOrder) readonly orders: Repository<StoreOrder>,
    @InjectRepository(StoreOrderItem) readonly orderItems: Repository<StoreOrderItem>,
    @InjectRepository(StoreOrderEvent) readonly events: Repository<StoreOrderEvent>,
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    @InjectRepository(User) readonly users: Repository<User>,
  ) {}

  /** The shop a shop-owner or shop-worker belongs to. */
  async shopOf(user: StoreUser): Promise<StoreShop> {
    let shop: StoreShop | null = null;
    if (user.role === STORE_ROLES.OWNER) {
      shop = await this.shops.findOne({ where: { ownerId: user.id } });
    } else if (user.role === STORE_ROLES.WORKER) {
      const row = await this.staff.findOne({ where: { userId: user.id, isActive: true } });
      if (row) shop = await this.shops.findOne({ where: { id: row.shopId } });
    }
    if (!shop) throw new ForbiddenException('No shop is linked to this account');
    if (!shop.isActive) throw new ForbiddenException('This shop has been deactivated');
    return shop;
  }

  /** Tell one user about something (never throws: a notification must not break an order). */
  async notify(userId: number | null | undefined, title: string, message: string, link?: string) {
    if (!userId) return;
    try {
      await this.notifications.save(
        this.notifications.create({ userId, type: 'delivery', title, message, link: link ?? null }),
      );
    } catch (err) {
      this.logger.warn(`Could not notify user ${userId}: ${(err as Error).message}`);
    }
  }

  /** Tell the shop owner and every active worker of a shop. */
  async notifyShop(shopId: number, title: string, message: string, exceptUserId?: number) {
    const shop = await this.shops.findOne({ where: { id: shopId } });
    if (!shop) return;
    const workers = await this.staff.find({ where: { shopId, isActive: true } });
    const ids = [shop.ownerId, ...workers.map((w) => w.userId)].filter((id) => id !== exceptUserId);
    await Promise.all([...new Set(ids)].map((id) => this.notify(id, title, message, '/orders')));
  }

  async addEvent(orderId: number, status: OrderStatus, byUserId: number | null, note?: string | null) {
    await this.events.save(this.events.create({ orderId, status, byUserId, note: note ?? null }));
  }

  /** Put the stock of every line back (used when an order is cancelled or rejected). */
  private async restoreStock(orderId: number) {
    const lines = await this.orderItems.find({ where: { orderId } });
    for (const l of lines) {
      await this.products.increment({ id: l.productId }, 'stock', l.quantity * (l.packQty || 1));
    }
  }

  /**
   * Move an order to a new status. `actor` decides which moves are allowed:
   *  - customer: cancel while the shop has not started packing
   *  - owner: every step of their own shop
   *  - worker: packing, ready, out for delivery, and delivered (with the customer's code) on orders of their shop
   */
  async transition(
    orderId: number,
    to: OrderStatus,
    actor: StoreUser,
    opts: { code?: string; reason?: string } = {},
  ): Promise<StoreOrder> {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    if (actor.role === STORE_ROLES.CUSTOMER) {
      if (order.customerId !== actor.id) throw new NotFoundException('Order not found');
      if (to !== 'cancelled') throw new ForbiddenException('Customers can only cancel an order');
      if (order.status !== 'placed' && order.status !== 'accepted') {
        throw new BadRequestException('This order is already being prepared and can no longer be cancelled');
      }
    } else {
      const shop = await this.shopOf(actor);
      if (order.shopId !== shop.id) throw new NotFoundException('Order not found');
      if (actor.role === STORE_ROLES.WORKER) {
        if (!['packing', 'ready', 'out_for_delivery', 'delivered'].includes(to)) {
          throw new ForbiddenException('Workers cannot do this step');
        }
        if (order.assignedWorkerId && order.assignedWorkerId !== actor.id) {
          throw new ForbiddenException('This order is assigned to another worker');
        }
      }
    }

    if (!(FORWARD[order.status] ?? []).includes(to) && !(to === 'cancelled' && ['placed', 'accepted'].includes(order.status))) {
      throw new BadRequestException(`An order that is ${order.status.replace(/_/g, ' ')} cannot become ${to.replace(/_/g, ' ')}`);
    }

    if (to === 'delivered') {
      if (!opts.code || opts.code !== order.deliveryCode) {
        throw new BadRequestException('Wrong delivery code. Ask the customer for the 4-digit code');
      }
      order.deliveredAt = new Date();
      // cash on delivery is paid at the door
      if (order.paymentMethod === 'cod') order.paymentStatus = 'paid';
    }
    if (to === 'out_for_delivery' && actor.role === STORE_ROLES.WORKER) order.assignedWorkerId = actor.id;
    if ((to === 'cancelled' || to === 'rejected') && opts.reason) order.cancelReason = opts.reason.slice(0, 300);

    order.status = to;
    const saved = await this.orders.save(order);
    await this.addEvent(order.id, to, actor.id, opts.reason ?? null);
    if (to === 'cancelled' || to === 'rejected') await this.restoreStock(order.id);

    // tell the people who care
    if (actor.role !== STORE_ROLES.CUSTOMER) {
      await this.notify(order.customerId, `Order ${order.orderNo}`, `Your order is ${STATUS_TEXT[to]}.`, `/orders/${order.id}`);
    } else {
      await this.notifyShop(order.shopId, `Order ${order.orderNo}`, `The customer cancelled this order.`, actor.id);
    }
    if (to === 'ready') await this.notifyShop(order.shopId, `Order ${order.orderNo}`, 'Packed and ready for delivery.', actor.id);
    return saved;
  }

  /** An order with its lines, timeline and the people involved. */
  async view(order: StoreOrder) {
    const [items, events, shop, customer, worker] = await Promise.all([
      this.orderItems.find({ where: { orderId: order.id }, order: { id: 'ASC' } }),
      this.events.find({ where: { orderId: order.id }, order: { id: 'ASC' } }),
      this.shops.findOne({ where: { id: order.shopId } }),
      this.users.findOne({ where: { id: order.customerId } }),
      order.assignedWorkerId ? this.users.findOne({ where: { id: order.assignedWorkerId } }) : Promise.resolve(null),
    ]);
    const byIds = [...new Set(events.map((e) => e.byUserId).filter((x): x is number => !!x))];
    const byUsers = byIds.length ? await this.users.find({ where: { id: In(byIds) } }) : [];
    const nameOf = new Map(byUsers.map((u) => [u.id, u.name]));
    return {
      ...order,
      items,
      events: events.map((e) => ({ ...e, byName: e.byUserId ? nameOf.get(e.byUserId) ?? null : null })),
      shop: shop ? { id: shop.id, name: shop.name, phone: shop.phone, address: shop.address } : null,
      customer: customer ? { id: customer.id, name: customer.name, mobile: customer.mobile } : null,
      worker: worker ? { id: worker.id, name: worker.name, mobile: worker.mobile } : null,
    };
  }

  /** Orders with their lines attached (for list screens). */
  async withItems(orders: StoreOrder[]) {
    if (!orders.length) return [];
    const lines = await this.orderItems.find({ where: { orderId: In(orders.map((o) => o.id)) } });
    const shopIds = [...new Set(orders.map((o) => o.shopId))];
    const shops = await this.shops.find({ where: { id: In(shopIds) } });
    const shopName = new Map(shops.map((s) => [s.id, s.name]));
    return orders.map((o) => ({
      ...o,
      shopName: shopName.get(o.shopId) ?? '',
      items: lines.filter((l) => l.orderId === o.id),
    }));
  }

  get dataSource() {
    return this.ds;
  }
}
