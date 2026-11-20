import {
  BadRequestException, Body, Controller, Delete, Get, Injectable, NotFoundException, Param, ParseIntPipe, Patch, Post,
  Put, Query, Request, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Type } from 'class-transformer';
import {
  IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength,
} from 'class-validator';
import { In, Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { MOBILE_PATTERN, PINCODE_PATTERN } from '../users/user-profile.dto';
import {
  STORE_ROLES, StoreAddress, StoreCartItem, StoreCategory, StoreOrder, StoreOrderEvent, StoreOrderItem, StoreProduct, StoreReview,
  StoreShop,
} from './store.entities';
import { StoreCoreService, StoreUser, round2 } from './store-core.service';

export class ProductQueryDto {
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() categoryId?: number;
  @IsOptional() @Type(() => Number) @IsInt() shopId?: number;
  @IsOptional() @IsIn(['new', 'price_asc', 'price_desc', 'rating']) sort?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

export class ShopQueryDto {
  @IsOptional() @IsString() @MaxLength(80) q?: string;
  @IsOptional() @IsString() @MaxLength(10) pincode?: string;
}

/** The pack a cart line is for, for example "500 g"; empty for the plain unit. */
const packOf = (p: StoreProduct, label: string) => (label ? (p.packs ?? []).find((x) => x.label === label) ?? null : null);

export class CartAddDto {
  @IsInt() productId: number;
  @IsOptional() @IsString() @MaxLength(20) pack?: string;
  @IsOptional() @IsInt() @Min(1) @Max(99) quantity?: number;
}

export class CartSetDto {
  @IsInt() @Min(0) @Max(99) quantity: number;
  @IsOptional() @IsString() @MaxLength(20) pack?: string;
}

export class AddressDto {
  @IsOptional() @IsString() @MaxLength(30) label?: string;
  @IsString() @MinLength(2) @MaxLength(100) fullName: string;
  @Matches(MOBILE_PATTERN, { message: 'Enter a valid 10-digit mobile number' }) phone: string;
  @IsString() @MinLength(3) @MaxLength(300) line1: string;
  @IsOptional() @IsString() @MaxLength(150) landmark?: string;
  @IsString() @MaxLength(80) city: string;
  @Matches(PINCODE_PATTERN, { message: 'Pincode must be 6 digits' }) pincode: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class CheckoutDto {
  /** Needed for delivery; a pickup order has no address. */
  @IsOptional() @IsInt() addressId?: number;
  @IsOptional() @IsIn(['delivery', 'pickup']) fulfillment?: 'delivery' | 'pickup';
  @IsOptional() @IsString() @MaxLength(40) deliverySlot?: string;
  @IsOptional() @IsIn(['cod', 'upi', 'card']) paymentMethod?: 'cod' | 'upi' | 'card';
  @IsOptional() @IsString() @MaxLength(300) notes?: string;
}

export class CancelDto {
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class ReviewDto {
  @IsInt() @Min(1) @Max(5) rating: number;
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
}

@Injectable()
export class StoreCustomerService {
  constructor(
    private readonly core: StoreCoreService,
    @InjectRepository(StoreCategory) private readonly categories: Repository<StoreCategory>,
    @InjectRepository(StoreCartItem) private readonly cart: Repository<StoreCartItem>,
    @InjectRepository(StoreAddress) private readonly addresses: Repository<StoreAddress>,
    @InjectRepository(StoreReview) private readonly reviews: Repository<StoreReview>,
  ) {}

  // ── Catalogue ────────────────────────────────────────────────────────────

  listCategories() {
    return this.categories.find({ where: { isActive: true }, order: { sortOrder: 'ASC', name: 'ASC' } });
  }

  async listProducts(q: ProductQueryDto) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const qb = this.core.products
      .createQueryBuilder('p')
      .innerJoin(StoreShop, 's', 's.id = p.shopId')
      .select(['p.id', 'p.shopId', 'p.categoryId', 'p.name', 'p.nameTa', 'p.brand', 'p.unit', 'p.packs', 'p.mrp', 'p.price', 'p.stock', 'p.imageUrl', 'p.ratingAvg', 'p.ratingCount'])
      .addSelect('s.name', 'shopName')
      .where('p.isActive = :on AND s.isActive = :on AND s.isOpen = :on', { on: true });
    if (q.q) qb.andWhere('(p.name LIKE :q OR p.nameTa LIKE :q OR p.brand LIKE :q OR p.barcode = :exact)', { q: `%${q.q}%`, exact: q.q });
    if (q.categoryId) qb.andWhere('p.categoryId = :c', { c: q.categoryId });
    if (q.shopId) qb.andWhere('p.shopId = :s', { s: q.shopId });
    const order: Record<string, [string, 'ASC' | 'DESC']> = {
      new: ['p.id', 'DESC'], price_asc: ['p.price', 'ASC'], price_desc: ['p.price', 'DESC'], rating: ['p.ratingAvg', 'DESC'],
    };
    const [col, dir] = order[q.sort ?? 'new'];
    qb.orderBy(col, dir).offset((page - 1) * limit).limit(limit);
    const total = await qb.getCount();
    const { entities, raw } = await qb.getRawAndEntities();
    const data = entities.map((p, i) => ({ ...p, shopName: raw[i]?.shopName ?? '' }));
    return { data, total, page, limit };
  }

  async productDetail(id: number) {
    const p = await this.core.products.findOne({ where: { id, isActive: true } });
    if (!p) throw new NotFoundException('Product not found');
    const [shop, reviews] = await Promise.all([
      this.core.shops.findOne({ where: { id: p.shopId } }),
      this.reviews.find({ where: { productId: id }, order: { id: 'DESC' }, take: 20 }),
    ]);
    const names = reviews.length ? await this.core.users.find({ where: { id: In(reviews.map((r) => r.userId)) } }) : [];
    const nameOf = new Map(names.map((u) => [u.id, u.name]));
    // the purchase price is private to the shop owner
    const { purchasePrice: _private, ...publicProduct } = p;
    return {
      ...publicProduct,
      shop: shop && { id: shop.id, name: shop.name, city: shop.city, isOpen: shop.isOpen, deliveryFee: shop.deliveryFee, freeDeliveryAbove: shop.freeDeliveryAbove, minOrder: shop.minOrder },
      reviews: reviews.map((r) => ({ ...r, userName: nameOf.get(r.userId) ?? 'Customer' })),
    };
  }

  listShops(q: ShopQueryDto) {
    const qb = this.core.shops.createQueryBuilder('s').where('s.isActive = :on', { on: true });
    if (q.q) qb.andWhere('s.name LIKE :q', { q: `%${q.q}%` });
    if (q.pincode) qb.andWhere('s.pincode = :pin', { pin: q.pincode });
    return qb.orderBy('s.isOpen', 'DESC').addOrderBy('s.name', 'ASC').getMany();
  }

  async shopDetail(id: number) {
    const s = await this.core.shops.findOne({ where: { id, isActive: true } });
    if (!s) throw new NotFoundException('Shop not found');
    return s;
  }

  // ── Cart ──────────────────────────────────────────────────────────────────

  /** The cart with live prices, grouped by shop with the delivery fee each shop would charge. */
  async getCart(userId: number) {
    const rows = await this.cart.find({ where: { userId }, order: { id: 'ASC' } });
    if (!rows.length) return { groups: [], itemCount: 0, subtotal: 0, deliveryFee: 0, total: 0 };
    const products = await this.core.products.find({ where: { id: In(rows.map((r) => r.productId)) } });
    const shops = await this.core.shops.find({ where: { id: In([...new Set(products.map((p) => p.shopId))]) } });
    const productOf = new Map(products.map((p) => [p.id, p]));
    const groups = shops.map((shop) => {
      const items = rows
        .map((r) => ({ r, p: productOf.get(r.productId) }))
        .filter((x): x is { r: StoreCartItem; p: StoreProduct } => !!x.p && x.p.shopId === shop.id)
        .map(({ r, p }) => {
          const pack = packOf(p, r.packLabel);
          const packQty = pack?.qty ?? 1;
          const price = pack ? pack.price : p.price;
          // how many of this pack the shelf can still give
          const packsLeft = Math.floor(p.stock / packQty);
          return {
            productId: p.id, pack: pack ? pack.label : '', packQty, name: p.name, unit: pack ? pack.label : p.unit,
            imageUrl: p.imageUrl, price, mrp: pack ? Math.max(round2(p.mrp * pack.qty), pack.price) : p.mrp,
            stock: packsLeft, available: p.isActive && packsLeft >= 1, quantity: r.quantity,
            lineTotal: round2(price * r.quantity),
          };
        });
      const subtotal = round2(items.reduce((n, i) => n + i.lineTotal, 0));
      const deliveryFee = shop.freeDeliveryAbove > 0 && subtotal >= shop.freeDeliveryAbove ? 0 : shop.deliveryFee;
      return {
        shop: { id: shop.id, name: shop.name, isOpen: shop.isOpen, minOrder: shop.minOrder, freeDeliveryAbove: shop.freeDeliveryAbove },
        items, subtotal, deliveryFee, total: round2(subtotal + deliveryFee),
      };
    }).filter((g) => g.items.length);
    return {
      groups,
      itemCount: groups.reduce((n, g) => n + g.items.reduce((m, i) => m + i.quantity, 0), 0),
      subtotal: round2(groups.reduce((n, g) => n + g.subtotal, 0)),
      deliveryFee: round2(groups.reduce((n, g) => n + g.deliveryFee, 0)),
      total: round2(groups.reduce((n, g) => n + g.total, 0)),
    };
  }

  async addToCart(userId: number, dto: CartAddDto) {
    const p = await this.core.products.findOne({ where: { id: dto.productId, isActive: true } });
    if (!p) throw new NotFoundException('Product not found');
    const label = dto.pack?.trim() ?? '';
    const pack = packOf(p, label);
    // a product without packs ignores the label (an old order's unit); one with packs must match
    if (label && !pack && p.packs?.length) throw new BadRequestException('That pack size is not sold');
    const packLabel = pack ? pack.label : '';
    const existing = await this.cart.findOne({ where: { userId, productId: p.id, packLabel } });
    const quantity = Math.min((existing?.quantity ?? 0) + (dto.quantity ?? 1), 99);
    if (quantity * (pack?.qty ?? 1) > p.stock) throw new BadRequestException(`Only ${p.stock} ${p.unit} of ${p.name} in stock`);
    await this.cart.save(existing ? Object.assign(existing, { quantity }) : this.cart.create({ userId, productId: p.id, packLabel, quantity }));
    return this.getCart(userId);
  }

  async setCartQuantity(userId: number, productId: number, quantity: number, packLabel = '') {
    const row = await this.cart.findOne({ where: { userId, productId, packLabel } });
    if (!row) throw new NotFoundException('That item is not in your cart');
    if (quantity === 0) {
      await this.cart.remove(row);
    } else {
      const p = await this.core.products.findOne({ where: { id: productId } });
      if (p && quantity * (packOf(p, packLabel)?.qty ?? 1) > p.stock) throw new BadRequestException(`Only ${p.stock} ${p.unit} of ${p.name} in stock`);
      row.quantity = quantity;
      await this.cart.save(row);
    }
    return this.getCart(userId);
  }

  async clearCart(userId: number) {
    await this.cart.delete({ userId });
    return this.getCart(userId);
  }

  // ── Addresses ────────────────────────────────────────────────────────────

  listAddresses(userId: number) {
    return this.addresses.find({ where: { userId }, order: { isDefault: 'DESC', id: 'DESC' } });
  }

  async saveAddress(userId: number, dto: AddressDto, id?: number) {
    let row: StoreAddress;
    if (id) {
      const found = await this.addresses.findOne({ where: { id, userId } });
      if (!found) throw new NotFoundException('Address not found');
      row = Object.assign(found, dto);
    } else {
      const first = (await this.addresses.count({ where: { userId } })) === 0;
      row = this.addresses.create({ ...dto, label: dto.label ?? 'Home', userId, isDefault: dto.isDefault ?? first });
    }
    if (row.isDefault) await this.addresses.update({ userId }, { isDefault: false });
    return this.addresses.save(row);
  }

  async removeAddress(userId: number, id: number) {
    const res = await this.addresses.delete({ id, userId });
    if (!res.affected) throw new NotFoundException('Address not found');
    return { deleted: 1 };
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  /** Turn the cart into one order per shop. Stock is taken at once and given back if the order is cancelled. */
  async checkout(user: StoreUser, dto: CheckoutDto) {
    const pickup = dto.fulfillment === 'pickup';
    const address = dto.addressId ? await this.addresses.findOne({ where: { id: dto.addressId, userId: user.id } }) : null;
    if (!pickup && !address) throw new BadRequestException('Choose a delivery address');
    const me = pickup ? await this.core.users.findOne({ where: { id: user.id } }) : null;
    const cart = await this.getCart(user.id);
    if (!cart.groups.length) throw new BadRequestException('Your cart is empty');

    for (const g of cart.groups) {
      if (!g.shop.isOpen) throw new BadRequestException(`${g.shop.name} is closed right now`);
      if (g.subtotal < g.shop.minOrder) {
        throw new BadRequestException(`${g.shop.name} needs a minimum order of ₹${g.shop.minOrder}`);
      }
      const gone = g.items.find((i) => !i.available || i.quantity > i.stock);
      if (gone) throw new BadRequestException(`${gone.name} is no longer available in the quantity you chose`);
    }

    const created = await this.core.dataSource.transaction(async (m) => {
      const out: StoreOrder[] = [];
      for (const g of cart.groups) {
        const order = await m.save(
          m.create(StoreOrder, {
            // a placeholder (the column holds 24 characters); the real number needs the new row's id, set just below
            orderNo: `T${Date.now().toString(36)}${g.shop.id.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`.slice(0, 24),
            customerId: user.id,
            shopId: g.shop.id,
            status: 'placed',
            paymentMethod: dto.paymentMethod ?? 'cod',
            paymentStatus: 'pending',
            subtotal: g.subtotal,
            // collecting at the shop costs no delivery fee
            deliveryFee: pickup ? 0 : g.deliveryFee,
            total: pickup ? g.subtotal : g.total,
            shipName: address?.fullName ?? me?.name ?? user.name,
            shipPhone: address?.phone ?? me?.mobile ?? '',
            shipAddress: address ? [address.line1, address.landmark, address.city].filter(Boolean).join(', ') : 'Pickup at the shop',
            shipPincode: address?.pincode ?? '',
            fulfillment: pickup ? 'pickup' : 'delivery',
            deliverySlot: dto.deliverySlot?.trim() || null,
            notes: dto.notes?.trim() || null,
            deliveryCode: String(Math.floor(1000 + Math.random() * 9000)),
          }),
        );
        order.orderNo = `NS-${new Date().getFullYear()}-${String(order.id).padStart(6, '0')}`;
        await m.save(order);
        for (const i of g.items) {
          // the WHERE keeps two people from buying the last unit at the same time
          const res = await m.createQueryBuilder().update(StoreProduct)
            .set({ stock: () => `stock - ${i.quantity * i.packQty}` })
            .where('id = :id AND stock >= :q', { id: i.productId, q: i.quantity * i.packQty })
            .execute();
          if (!res.affected) throw new BadRequestException(`${i.name} just went out of stock`);
          await m.save(m.create(StoreOrderItem, {
            orderId: order.id, productId: i.productId, name: i.name, unit: i.unit, packQty: i.packQty,
            price: i.price, quantity: i.quantity, lineTotal: i.lineTotal,
          }));
        }
        await m.save(m.create(StoreOrderEvent, { orderId: order.id, status: 'placed', byUserId: user.id, note: null }));
        out.push(order);
      }
      await m.delete(StoreCartItem, { userId: user.id });
      return out;
    });

    for (const o of created) {
      await this.core.notifyShop(o.shopId, 'New order', `${o.orderNo} · ₹${o.total} from ${user.name}`);
    }
    return { orders: created.map((o) => ({ id: o.id, orderNo: o.orderNo, total: o.total, deliveryCode: o.deliveryCode })) };
  }

  cancelOrder(user: StoreUser, id: number, reason?: string) {
    return this.core.transition(id, 'cancelled', user, { reason });
  }

  async myOrders(userId: number, status?: string) {
    const where: Record<string, unknown> = { customerId: userId };
    if (status === 'active') where.status = In(['placed', 'accepted', 'packing', 'ready', 'out_for_delivery']);
    else if (status === 'past') where.status = In(['delivered', 'cancelled', 'rejected']);
    const rows = await this.core.orders.find({ where, order: { id: 'DESC' }, take: 100 });
    return this.core.withItems(rows);
  }

  async myOrder(userId: number, id: number) {
    const order = await this.core.orders.findOne({ where: { id, customerId: userId } });
    if (!order) throw new NotFoundException('Order not found');
    return this.core.view(order);
  }

  // ── Reviews ───────────────────────────────────────────────────────────────

  async review(userId: number, productId: number, dto: ReviewDto) {
    const bought = await this.core.orders.createQueryBuilder('o')
      .innerJoin('store_order_items', 'i', 'i.order_id = o.id')
      .where('o.customer_id = :userId AND o.status = :st AND i.product_id = :productId', { userId, st: 'delivered', productId })
      .getCount();
    if (!bought) throw new BadRequestException('You can review a product after it has been delivered to you');
    const existing = await this.reviews.findOne({ where: { productId, userId } });
    await this.reviews.save(existing
      ? Object.assign(existing, { rating: dto.rating, comment: dto.comment ?? null })
      : this.reviews.create({ productId, userId, rating: dto.rating, comment: dto.comment ?? null }));
    const all = await this.reviews.find({ where: { productId } });
    await this.core.products.update(productId, {
      ratingCount: all.length,
      ratingAvg: round2(all.reduce((n, r) => n + r.rating, 0) / all.length),
    });
    return this.productDetail(productId);
  }
}

@ApiTags('store-customer')
@Controller('store')
export class StoreCustomerController {
  constructor(private readonly s: StoreCustomerService) {}

  // public browsing (no sign-in needed)
  @Get('categories') @ApiOperation({ summary: 'Product categories' })
  categories() { return this.s.listCategories(); }

  @Get('products') @ApiOperation({ summary: 'Browse and search products' })
  products(@Query() q: ProductQueryDto) { return this.s.listProducts(q); }

  @Get('products/:id') @ApiOperation({ summary: 'Product with shop and reviews' })
  product(@Param('id', ParseIntPipe) id: number) { return this.s.productDetail(id); }

  @Get('shops') @ApiOperation({ summary: 'Shops, optionally by name or pincode' })
  shops(@Query() q: ShopQueryDto) { return this.s.listShops(q); }

  @Get('shops/:id') @ApiOperation({ summary: 'One shop' })
  shop(@Param('id', ParseIntPipe) id: number) { return this.s.shopDetail(id); }
}

@ApiTags('store-customer')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(STORE_ROLES.CUSTOMER)
@Controller('store/me')
export class StoreCustomerMeController {
  constructor(private readonly s: StoreCustomerService) {}

  @Get('cart') cart(@Request() req) { return this.s.getCart(req.user.id); }
  @Post('cart') addToCart(@Body() b: CartAddDto, @Request() req) { return this.s.addToCart(req.user.id, b); }
  @Patch('cart/:productId') setQty(@Param('productId', ParseIntPipe) pid: number, @Body() b: CartSetDto, @Request() req) {
    return this.s.setCartQuantity(req.user.id, pid, b.quantity, b.pack?.trim() ?? '');
  }
  @Delete('cart') clearCart(@Request() req) { return this.s.clearCart(req.user.id); }

  @Get('addresses') addresses(@Request() req) { return this.s.listAddresses(req.user.id); }
  @Post('addresses') addAddress(@Body() b: AddressDto, @Request() req) { return this.s.saveAddress(req.user.id, b); }
  @Put('addresses/:id') editAddress(@Param('id', ParseIntPipe) id: number, @Body() b: AddressDto, @Request() req) {
    return this.s.saveAddress(req.user.id, b, id);
  }
  @Delete('addresses/:id') removeAddress(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.s.removeAddress(req.user.id, id);
  }

  @Post('orders/checkout') @ApiOperation({ summary: 'Place orders for everything in the cart (one per shop)' })
  checkout(@Body() b: CheckoutDto, @Request() req) { return this.s.checkout(req.user, b); }

  @Get('orders') orders(@Query('status') status: string | undefined, @Request() req) { return this.s.myOrders(req.user.id, status); }
  @Get('orders/:id') order(@Param('id', ParseIntPipe) id: number, @Request() req) { return this.s.myOrder(req.user.id, id); }
  @Post('orders/:id/cancel') async cancel(@Param('id', ParseIntPipe) id: number, @Body() b: CancelDto, @Request() req) {
    await this.s.cancelOrder(req.user, id, b.reason);
    return this.s.myOrder(req.user.id, id);
  }

  @Post('products/:id/review') review(@Param('id', ParseIntPipe) id: number, @Body() b: ReviewDto, @Request() req) {
    return this.s.review(req.user.id, id, b);
  }
}
