import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get, Injectable, NotFoundException, Param,
  ParseIntPipe, Patch, Post, Put, Query, Request, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength,
  ValidateNested,
} from 'class-validator';
import * as bcrypt from 'bcrypt';
import { In, Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RolePermissionsService } from '../role-permissions/role-permissions.service';
import { UsersService } from '../users/users.service';
import { MOBILE_PATTERN, PINCODE_PATTERN } from '../users/user-profile.dto';
import {
  ORDER_STATUSES, OrderStatus, STORE_ROLES, StoreCategory, StoreOrder, StoreOrderItem, StoreProduct,
} from './store.entities';
import { StoreCoreService, StoreUser, round2 } from './store-core.service';

export class ShopDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @Matches(MOBILE_PATTERN, { message: 'Enter a valid 10-digit mobile number' }) phone?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @Matches(PINCODE_PATTERN, { message: 'Pincode must be 6 digits' }) pincode?: string;
  @IsOptional() @IsString() @MaxLength(500) logoUrl?: string;
  @IsOptional() @IsBoolean() isOpen?: boolean;
  @IsOptional() @IsNumber() @Min(0) deliveryFee?: number;
  @IsOptional() @IsNumber() @Min(0) freeDeliveryAbove?: number;
  @IsOptional() @IsNumber() @Min(0) minOrder?: number;
}

/** One pack size with its own price, such as 500 g for ₹31. */
export class PackDto {
  @IsString() @MinLength(1) @MaxLength(20) label: string;
  /** How much of the product's unit the pack holds, for example 0.5 for 500 g when the unit is kg. */
  @IsNumber() @Min(0.001) qty: number;
  @IsNumber() @Min(0) price: number;
}

export class ProductDto {
  @IsString() @MinLength(2) @MaxLength(150) name: string;
  @IsOptional() @IsInt() categoryId?: number;
  @IsOptional() @IsString() @MaxLength(80) brand?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @IsNumber() @Min(0) mrp: number;
  @IsNumber() @Min(0) price: number;
  @IsOptional() @IsNumber() @Min(0) stock?: number;
  @IsOptional() @IsNumber() @Min(0) lowStockLevel?: number;
  @IsOptional() @IsString() @MaxLength(500) imageUrl?: string;
  @IsOptional() @IsString() @MaxLength(150) nameTa?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(8) @ValidateNested({ each: true }) @Type(() => PackDto) packs?: PackDto[];
  @IsOptional() @IsNumber() @Min(0) purchasePrice?: number;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'The expiry date must look like 2026-12-31' }) expiryDate?: string;
  @IsOptional() @IsString() @MaxLength(40) barcode?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class StockDto {
  /** Positive adds stock, negative removes it. */
  @IsNumber() change: number;
}

export class OwnerProductQueryDto {
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @IsIn(['low', 'out']) filter?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class OrderQueryDto {
  @IsOptional() @IsString() status?: string;
}

export class StatusDto {
  @IsIn(ORDER_STATUSES) status: OrderStatus;
  @IsOptional() @Matches(/^\d{4}$/, { message: 'The delivery code is 4 digits' }) code?: string;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class AssignDto {
  @IsInt() workerId: number;
}

export class PaymentDto {
  @IsIn(['paid', 'pending']) status: 'paid' | 'pending';
}

export class WorkerDto {
  @IsString() @MinLength(2) @MaxLength(100) name: string;
  @IsEmail() email: string;
  @Matches(MOBILE_PATTERN, { message: 'Enter a valid 10-digit mobile number' }) mobile: string;
  @IsString() @MinLength(8) @MaxLength(100) password: string;
}

export class WorkerEditDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(100) password?: string;
}

export class ReportQueryDto {
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}

export class CategoryDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(40) icon?: string;
}

const dayStart = (iso: string) => new Date(`${iso}T00:00:00`);
const dayEnd = (iso: string) => new Date(`${iso}T23:59:59.999`);
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

@Injectable()
export class StoreOwnerService {
  constructor(
    private readonly core: StoreCoreService,
    private readonly usersService: UsersService,
    private readonly roles: RolePermissionsService,
    @InjectRepository(StoreCategory) private readonly categories: Repository<StoreCategory>,
  ) {}

  // ── Shop ──────────────────────────────────────────────────────────────────

  getShop(user: StoreUser) {
    return this.core.shopOf(user);
  }

  async updateShop(user: StoreUser, dto: ShopDto) {
    const shop = await this.core.shopOf(user);
    Object.assign(shop, Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)));
    return this.core.shops.save(shop);
  }

  // ── Dashboard & reports ───────────────────────────────────────────────────

  async dashboard(user: StoreUser) {
    const shop = await this.core.shopOf(user);
    const today = isoDay(new Date());
    const orders = this.core.orders;
    const soon = isoDay(new Date(Date.now() + 7 * 86400000));
    const [newOrders, active, deliveredToday, lowStock, outOfStock, workers, expirySoon] = await Promise.all([
      orders.count({ where: { shopId: shop.id, status: 'placed' } }),
      orders.count({ where: { shopId: shop.id, status: In(['accepted', 'packing', 'ready', 'out_for_delivery']) } }),
      orders.createQueryBuilder('o')
        .where('o.shopId = :id AND o.status = :st AND o.deliveredAt >= :from', { id: shop.id, st: 'delivered', from: dayStart(today) })
        .getMany(),
      this.core.products.createQueryBuilder('p')
        .where('p.shopId = :id AND p.isActive = :on AND p.stock > 0 AND p.stock <= p.lowStockLevel', { id: shop.id, on: true }).getCount(),
      this.core.products.count({ where: { shopId: shop.id, isActive: true, stock: 0 } }),
      this.core.staff.count({ where: { shopId: shop.id, isActive: true } }),
      // sells within a week, or already past its date, and still on the shelf
      this.core.products.createQueryBuilder('p')
        .where('p.shopId = :id AND p.isActive = :on AND p.stock > 0 AND p.expiryDate IS NOT NULL AND p.expiryDate <= :soon', { id: shop.id, on: true, soon })
        .getCount(),
    ]);
    const placedToday = await orders.createQueryBuilder('o')
      .where('o.shopId = :id AND o.placedAt >= :from', { id: shop.id, from: dayStart(today) }).getCount();
    return {
      shop: { id: shop.id, name: shop.name, isOpen: shop.isOpen },
      newOrders, activeOrders: active, ordersToday: placedToday,
      deliveredToday: deliveredToday.length,
      salesToday: round2(deliveredToday.reduce((n, o) => n + o.total, 0)),
      lowStock, outOfStock, workers, expirySoon,
    };
  }

  async report(user: StoreUser, q: ReportQueryDto) {
    const shop = await this.core.shopOf(user);
    const to = q.to ?? isoDay(new Date());
    const from = q.from ?? isoDay(new Date(Date.now() - 6 * 86400000));
    const rows = await this.core.orders.createQueryBuilder('o')
      .where('o.shopId = :id AND o.placedAt >= :from AND o.placedAt <= :to', { id: shop.id, from: dayStart(from), to: dayEnd(to) })
      .getMany();
    const delivered = rows.filter((o) => o.status === 'delivered');
    const byStatus: Record<string, number> = {};
    rows.forEach((o) => { byStatus[o.status] = (byStatus[o.status] ?? 0) + 1; });

    const daily = new Map<string, { date: string; orders: number; sales: number }>();
    for (let d = dayStart(from); d <= dayStart(to); d = new Date(d.getTime() + 86400000)) {
      daily.set(isoDay(d), { date: isoDay(d), orders: 0, sales: 0 });
    }
    rows.forEach((o) => {
      const e = daily.get(isoDay(o.placedAt));
      if (!e) return;
      e.orders += 1;
      if (o.status === 'delivered') e.sales = round2(e.sales + o.total);
    });

    const top = delivered.length
      ? await this.core.orderItems.createQueryBuilder('i')
        .select('i.name', 'name').addSelect('SUM(i.quantity)', 'quantity').addSelect('SUM(i.lineTotal)', 'amount')
        .where('i.orderId IN (:...ids)', { ids: delivered.map((o) => o.id) })
        .groupBy('i.name').orderBy('amount', 'DESC').limit(5).getRawMany()
      : [];

    return {
      from, to,
      orders: rows.length,
      delivered: delivered.length,
      cancelled: (byStatus.cancelled ?? 0) + (byStatus.rejected ?? 0),
      sales: round2(delivered.reduce((n, o) => n + o.total, 0)),
      averageOrder: delivered.length ? round2(delivered.reduce((n, o) => n + o.total, 0) / delivered.length) : 0,
      byStatus,
      daily: [...daily.values()],
      topProducts: top.map((t) => ({ name: t.name, quantity: Number(t.quantity), amount: round2(Number(t.amount)) })),
    };
  }

  // ── Products & inventory ─────────────────────────────────────────────────

  async listProducts(user: StoreUser, q: OwnerProductQueryDto) {
    const shop = await this.core.shopOf(user);
    const page = q.page ?? 1;
    const limit = q.limit ?? 30;
    const qb = this.core.products.createQueryBuilder('p').where('p.shopId = :id', { id: shop.id });
    if (q.q) qb.andWhere('(p.name LIKE :q OR p.brand LIKE :q)', { q: `%${q.q}%` });
    if (q.filter === 'out') qb.andWhere('p.stock <= 0');
    if (q.filter === 'low') qb.andWhere('p.stock > 0 AND p.stock <= p.lowStockLevel');
    qb.orderBy('p.name', 'ASC').skip((page - 1) * limit).take(limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total, page, limit };
  }

  private async ownProduct(user: StoreUser, id: number): Promise<StoreProduct> {
    const shop = await this.core.shopOf(user);
    const p = await this.core.products.findOne({ where: { id, shopId: shop.id } });
    if (!p) throw new NotFoundException('Product not found');
    return p;
  }

  async createProduct(user: StoreUser, dto: ProductDto) {
    const shop = await this.core.shopOf(user);
    if (dto.price > dto.mrp) throw new BadRequestException('The selling price cannot be more than the MRP');
    return this.core.products.save(this.core.products.create({ ...dto, shopId: shop.id }));
  }

  async updateProduct(user: StoreUser, id: number, dto: ProductDto) {
    const p = await this.ownProduct(user, id);
    if (dto.price > dto.mrp) throw new BadRequestException('The selling price cannot be more than the MRP');
    Object.assign(p, Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)));
    return this.core.products.save(p);
  }

  async adjustStock(user: StoreUser, id: number, change: number) {
    const p = await this.ownProduct(user, id);
    if (p.stock + change < 0) throw new BadRequestException(`Only ${p.stock} in stock`);
    p.stock = round2(p.stock + change);
    return this.core.products.save(p);
  }

  async removeProduct(user: StoreUser, id: number) {
    const p = await this.ownProduct(user, id);
    const used = await this.core.orderItems.count({ where: { productId: id } });
    if (used) {
      // it appears in past orders: hide it instead of deleting
      p.isActive = false;
      await this.core.products.save(p);
      return { deleted: 0, hidden: 1 };
    }
    await this.core.products.remove(p);
    return { deleted: 1, hidden: 0 };
  }

  async addCategory(dto: CategoryDto) {
    const name = dto.name.trim();
    if (await this.categories.findOne({ where: { name } })) throw new ConflictException('That category already exists');
    return this.categories.save(this.categories.create({ name, icon: dto.icon ?? 'pricetag-outline' }));
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(user: StoreUser, status?: string) {
    const shop = await this.core.shopOf(user);
    const where: Record<string, unknown> = { shopId: shop.id };
    if (status === 'active') where.status = In(['placed', 'accepted', 'packing', 'ready', 'out_for_delivery']);
    else if (status === 'past') where.status = In(['delivered', 'cancelled', 'rejected']);
    else if (status && (ORDER_STATUSES as string[]).includes(status)) where.status = status;
    const rows = await this.core.orders.find({ where, order: { id: 'DESC' }, take: 100 });
    return this.core.withItems(rows);
  }

  async getOrder(user: StoreUser, id: number) {
    const shop = await this.core.shopOf(user);
    const o = await this.core.orders.findOne({ where: { id, shopId: shop.id } });
    if (!o) throw new NotFoundException('Order not found');
    return this.core.view(o);
  }

  async setStatus(user: StoreUser, id: number, dto: StatusDto) {
    await this.core.transition(id, dto.status, user, { code: dto.code, reason: dto.reason });
    return this.getOrder(user, id);
  }

  async assign(user: StoreUser, id: number, workerId: number) {
    const shop = await this.core.shopOf(user);
    const order = await this.core.orders.findOne({ where: { id, shopId: shop.id } });
    if (!order) throw new NotFoundException('Order not found');
    if (['delivered', 'cancelled', 'rejected'].includes(order.status)) throw new BadRequestException('This order is finished');
    const worker = await this.core.staff.findOne({ where: { shopId: shop.id, userId: workerId, isActive: true } });
    if (!worker) throw new BadRequestException('Choose one of your workers');
    order.assignedWorkerId = workerId;
    await this.core.orders.save(order);
    await this.core.addEvent(order.id, order.status, user.id, 'Assigned to a worker');
    await this.core.notify(workerId, `Order ${order.orderNo}`, 'A new order was assigned to you.', `/orders/${order.id}`);
    return this.getOrder(user, id);
  }

  async setPayment(user: StoreUser, id: number, status: 'paid' | 'pending') {
    const shop = await this.core.shopOf(user);
    const order = await this.core.orders.findOne({ where: { id, shopId: shop.id } });
    if (!order) throw new NotFoundException('Order not found');
    order.paymentStatus = status;
    await this.core.orders.save(order);
    return this.getOrder(user, id);
  }

  // ── Workers ───────────────────────────────────────────────────────────────

  async listWorkers(user: StoreUser) {
    const shop = await this.core.shopOf(user);
    const rows = await this.core.staff.find({ where: { shopId: shop.id }, order: { id: 'ASC' } });
    if (!rows.length) return [];
    const users = await this.core.users.find({ where: { id: In(rows.map((r) => r.userId)) } });
    const byId = new Map(users.map((u) => [u.id, u]));
    const delivered = await this.core.orders.createQueryBuilder('o')
      .select('o.assignedWorkerId', 'workerId').addSelect('COUNT(*)', 'n')
      .where('o.shopId = :id AND o.status = :st', { id: shop.id, st: 'delivered' })
      .groupBy('o.assignedWorkerId').getRawMany();
    const count = new Map(delivered.map((d) => [Number(d.workerId), Number(d.n)]));
    return rows.map((r) => {
      const u = byId.get(r.userId);
      return { id: r.userId, name: u?.name ?? '', email: u?.email ?? '', mobile: u?.mobile ?? null, isActive: r.isActive, delivered: count.get(r.userId) ?? 0 };
    });
  }

  async addWorker(user: StoreUser, dto: WorkerDto) {
    const shop = await this.core.shopOf(user);
    const email = dto.email.trim().toLowerCase();
    if (await this.core.users.findOne({ where: { email } })) throw new ConflictException('An account with this email already exists');
    await this.usersService.assertMobilesFree(dto.mobile, undefined);
    const roleId = await this.roles.roleIdOf(STORE_ROLES.WORKER);
    if (!roleId) throw new BadRequestException('Store roles are not set up yet. Restart the server once.');
    const [first, ...rest] = dto.name.trim().split(/\s+/);
    const worker = await this.core.users.save(this.core.users.create({
      name: dto.name.trim(), firstName: first, lastName: rest.join(' ') || null, email, mobile: dto.mobile,
      userCode: await this.usersService.nextUserCode(),
      passwordHash: await bcrypt.hash(dto.password, 10),
      roleId, companyId: null, isActive: true, mustChangePassword: false,
    }));
    await this.core.staff.save(this.core.staff.create({ shopId: shop.id, userId: worker.id }));
    return { id: worker.id, name: worker.name, email: worker.email, mobile: worker.mobile, isActive: true, delivered: 0 };
  }

  async editWorker(user: StoreUser, workerId: number, dto: WorkerEditDto) {
    const shop = await this.core.shopOf(user);
    const row = await this.core.staff.findOne({ where: { shopId: shop.id, userId: workerId } });
    if (!row) throw new NotFoundException('Worker not found');
    const u = await this.core.users.findOne({ where: { id: workerId } });
    if (!u) throw new NotFoundException('Worker not found');
    if (dto.name) u.name = dto.name.trim();
    if (dto.password) u.passwordHash = await bcrypt.hash(dto.password, 10);
    if (dto.isActive !== undefined) {
      row.isActive = dto.isActive;
      u.isActive = dto.isActive;
      await this.core.staff.save(row);
    }
    await this.core.users.save(u);
    return this.listWorkers(user);
  }
}

@ApiTags('store-owner')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(STORE_ROLES.OWNER)
@Controller('store/owner')
export class StoreOwnerController {
  constructor(private readonly s: StoreOwnerService) {}

  @Get('dashboard') dashboard(@Request() req) { return this.s.dashboard(req.user); }
  @Get('reports') report(@Query() q: ReportQueryDto, @Request() req) { return this.s.report(req.user, q); }

  @Get('shop') shop(@Request() req) { return this.s.getShop(req.user); }
  @Patch('shop') updateShop(@Body() b: ShopDto, @Request() req) { return this.s.updateShop(req.user, b); }

  @Get('products') products(@Query() q: OwnerProductQueryDto, @Request() req) { return this.s.listProducts(req.user, q); }
  @Post('products') createProduct(@Body() b: ProductDto, @Request() req) { return this.s.createProduct(req.user, b); }
  @Put('products/:id') updateProduct(@Param('id', ParseIntPipe) id: number, @Body() b: ProductDto, @Request() req) {
    return this.s.updateProduct(req.user, id, b);
  }
  @Patch('products/:id/stock') @ApiOperation({ summary: 'Add or remove stock' })
  stock(@Param('id', ParseIntPipe) id: number, @Body() b: StockDto, @Request() req) { return this.s.adjustStock(req.user, id, b.change); }
  @Delete('products/:id') removeProduct(@Param('id', ParseIntPipe) id: number, @Request() req) { return this.s.removeProduct(req.user, id); }
  @Post('categories') addCategory(@Body() b: CategoryDto) { return this.s.addCategory(b); }

  @Get('orders') orders(@Query() q: OrderQueryDto, @Request() req) { return this.s.listOrders(req.user, q.status); }
  @Get('orders/:id') order(@Param('id', ParseIntPipe) id: number, @Request() req) { return this.s.getOrder(req.user, id); }
  @Patch('orders/:id/status') status(@Param('id', ParseIntPipe) id: number, @Body() b: StatusDto, @Request() req) {
    return this.s.setStatus(req.user, id, b);
  }
  @Patch('orders/:id/assign') assign(@Param('id', ParseIntPipe) id: number, @Body() b: AssignDto, @Request() req) {
    return this.s.assign(req.user, id, b.workerId);
  }
  @Patch('orders/:id/payment') payment(@Param('id', ParseIntPipe) id: number, @Body() b: PaymentDto, @Request() req) {
    return this.s.setPayment(req.user, id, b.status);
  }

  @Get('workers') workers(@Request() req) { return this.s.listWorkers(req.user); }
  @Post('workers') addWorker(@Body() b: WorkerDto, @Request() req) { return this.s.addWorker(req.user, b); }
  @Patch('workers/:id') editWorker(@Param('id', ParseIntPipe) id: number, @Body() b: WorkerEditDto, @Request() req) {
    return this.s.editWorker(req.user, id, b);
  }
}
