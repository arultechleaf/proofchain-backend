import { Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { In } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { StoreCoreService, round2 } from './store-core.service';
import { StoreProduct, StoreShop } from './store.entities';

export class ShopActiveDto {
  @IsBoolean() isActive: boolean;
}

const ACTIVE = ['placed', 'accepted', 'packing', 'ready', 'out_for_delivery'];
const PAST = ['delivered', 'cancelled', 'rejected'];

/** The administrator's view of the whole Namma Store marketplace, for the mobile app. */
@ApiTags('store-admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('store/admin')
export class StoreAdminController {
  constructor(private readonly core: StoreCoreService) {}

  private async countByRole(key: string) {
    return this.core.users.count({ where: { roleRef: { key } } });
  }

  @Get('overview')
  @ApiOperation({ summary: 'Totals across all shops' })
  async overview() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [shops, openShops, products, customers, owners, workers, orders, ordersToday, activeOrders, sales, salesToday] = await Promise.all([
      this.core.shops.count(),
      this.core.shops.count({ where: { isOpen: true, isActive: true } }),
      this.core.products.count(),
      this.countByRole('customer'),
      this.countByRole('shop_owner'),
      this.countByRole('shop_worker'),
      this.core.orders.count(),
      this.core.orders.createQueryBuilder('o').where('o.placedAt >= :s', { s: start }).getCount(),
      this.core.orders.count({ where: { status: In(ACTIVE) } }),
      this.core.orders.createQueryBuilder('o').select('COALESCE(SUM(o.total), 0)', 't').where('o.status = :d', { d: 'delivered' }).getRawOne<{ t: string }>(),
      this.core.orders.createQueryBuilder('o').select('COALESCE(SUM(o.total), 0)', 't')
        .where('o.status = :d AND o.deliveredAt >= :s', { d: 'delivered', s: start }).getRawOne<{ t: string }>(),
    ]);
    return {
      shops, openShops, products, customers, owners, workers, orders, ordersToday, activeOrders,
      sales: round2(Number(sales?.t ?? 0)), salesToday: round2(Number(salesToday?.t ?? 0)),
    };
  }

  @Get('shops')
  @ApiOperation({ summary: 'Every shop with its owner and counts' })
  async shops() {
    const shops = await this.core.shops.find({ order: { id: 'DESC' } });
    if (!shops.length) return [];
    const ids = shops.map((s) => s.id);
    const [owners, productRows, orderRows] = await Promise.all([
      this.core.users.find({ where: { id: In(shops.map((s) => s.ownerId)) } }),
      this.core.products.createQueryBuilder('p').select('p.shopId', 'shopId').addSelect('COUNT(*)', 'n').where('p.shopId IN (:...ids)', { ids }).groupBy('p.shopId').getRawMany<{ shopId: number; n: string }>(),
      this.core.orders.createQueryBuilder('o').select('o.shopId', 'shopId').addSelect('COUNT(*)', 'n').where('o.shopId IN (:...ids)', { ids }).groupBy('o.shopId').getRawMany<{ shopId: number; n: string }>(),
    ]);
    const ownerOf = new Map(owners.map((u) => [u.id, u]));
    const products = new Map(productRows.map((r) => [Number(r.shopId), Number(r.n)]));
    const orders = new Map(orderRows.map((r) => [Number(r.shopId), Number(r.n)]));
    return shops.map((s) => ({
      ...s,
      ownerName: ownerOf.get(s.ownerId)?.name ?? '',
      ownerEmail: ownerOf.get(s.ownerId)?.email ?? '',
      ownerMobile: ownerOf.get(s.ownerId)?.mobile ?? null,
      productCount: products.get(s.id) ?? 0,
      orderCount: orders.get(s.id) ?? 0,
    }));
  }

  @Patch('shops/:id')
  @ApiOperation({ summary: 'Block or unblock a shop' })
  async setShopActive(@Param('id', ParseIntPipe) id: number, @Body() b: ShopActiveDto) {
    const shop = await this.core.shops.findOne({ where: { id } });
    if (!shop) throw new NotFoundException('Shop not found');
    shop.isActive = b.isActive;
    return this.core.shops.save(shop);
  }

  @Get('orders')
  @ApiOperation({ summary: 'Every order, newest first (status: active, past or one status)' })
  async orders(@Query('status') status?: string) {
    const where: Record<string, unknown> = {};
    if (status === 'active') where.status = In(ACTIVE);
    else if (status === 'past') where.status = In(PAST);
    else if (status) where.status = status;
    const rows = await this.core.orders.find({ where, order: { id: 'DESC' }, take: 100 });
    const list = await this.core.withItems(rows);
    const customers = rows.length ? await this.core.users.find({ where: { id: In([...new Set(rows.map((o) => o.customerId))]) } }) : [];
    const nameOf = new Map(customers.map((u) => [u.id, u.name]));
    return list.map((o) => ({ ...o, customerName: nameOf.get(o.customerId) ?? '' }));
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'One order with its timeline and the people involved' })
  async order(@Param('id', ParseIntPipe) id: number) {
    const o = await this.core.orders.findOne({ where: { id } });
    if (!o) throw new NotFoundException('Order not found');
    return this.core.view(o);
  }

  @Get('products')
  @ApiOperation({ summary: 'Every product of every shop' })
  async products(@Query('q') q?: string) {
    const qb = this.core.products.createQueryBuilder('p').innerJoin(StoreShop, 's', 's.id = p.shopId').addSelect('s.name', 'shopName');
    if (q) qb.where('(p.name LIKE :q OR p.nameTa LIKE :q OR p.brand LIKE :q OR p.barcode = :exact)', { q: `%${q}%`, exact: q });
    const { entities, raw } = await qb.orderBy('p.id', 'DESC').limit(100).getRawAndEntities();
    return entities.map((p: StoreProduct, i: number) => ({ ...p, shopName: raw[i]?.shopName ?? '' }));
  }

  @Get('customers')
  @ApiOperation({ summary: 'Every customer with the number of orders and what they spent' })
  async customers() {
    const users = await this.core.users.find({ where: { roleRef: { key: 'customer' } }, order: { id: 'DESC' }, take: 200 });
    if (!users.length) return [];
    const rows = await this.core.orders.createQueryBuilder('o')
      .select('o.customerId', 'customerId').addSelect('COUNT(*)', 'orders')
      .addSelect("COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN o.total ELSE 0 END), 0)", 'spent')
      .where('o.customerId IN (:...ids)', { ids: users.map((u) => u.id) }).groupBy('o.customerId')
      .getRawMany<{ customerId: number; orders: string; spent: string }>();
    const stats = new Map(rows.map((r) => [Number(r.customerId), r]));
    return users.map((u) => ({
      id: u.id, name: u.name, email: u.email, mobile: u.mobile, isActive: u.isActive,
      orders: Number(stats.get(u.id)?.orders ?? 0), spent: round2(Number(stats.get(u.id)?.spent ?? 0)),
    }));
  }
}
