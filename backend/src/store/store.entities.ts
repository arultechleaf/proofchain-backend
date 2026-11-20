import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Roles used by the Namma Store mobile app (stored in the existing roles table). */
export const STORE_ROLES = {
  CUSTOMER: 'customer',
  OWNER: 'shop_owner',
  WORKER: 'shop_worker',
} as const;

export type OrderStatus =
  | 'placed'
  | 'accepted'
  | 'packing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'rejected';

export const ORDER_STATUSES: OrderStatus[] = [
  'placed', 'accepted', 'packing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'rejected',
];

export type PaymentMethod = 'cod' | 'upi' | 'card';
export type PaymentStatus = 'pending' | 'paid' | 'refunded';

/** A shop run by one owner. */
@Entity('store_shops')
@Index(['ownerId'], { unique: true })
export class StoreShop {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'owner_id', type: 'int' })
  ownerId: number;

  @Column({ length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  city: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  pincode: string | null;

  @Column({ name: 'logo_url', type: 'varchar', length: 500, nullable: true })
  logoUrl: string | null;

  /** Open shops accept orders. */
  @Column({ name: 'is_open', default: true })
  isOpen: boolean;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'delivery_fee', type: 'double', default: 0 })
  deliveryFee: number;

  /** Orders at or above this amount get free delivery (0 = never free). */
  @Column({ name: 'free_delivery_above', type: 'double', default: 0 })
  freeDeliveryAbove: number;

  @Column({ name: 'min_order', type: 'double', default: 0 })
  minOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

/** A shop's working person (packs and delivers orders). */
@Entity('store_shop_staff')
@Index(['userId'], { unique: true })
@Index(['shopId'])
export class StoreShopStaff {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'shop_id', type: 'int' })
  shopId: number;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('store_categories')
@Index(['name'], { unique: true })
export class StoreCategory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 80 })
  name: string;

  /** Ionicons name shown in the app. */
  @Column({ type: 'varchar', length: 40, default: 'pricetag-outline' })
  icon: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}

@Entity('store_products')
@Index(['shopId'])
@Index(['categoryId'])
export class StoreProduct {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'shop_id', type: 'int' })
  shopId: number;

  @Column({ name: 'category_id', type: 'int', nullable: true })
  categoryId: number | null;

  @Column({ length: 150 })
  name: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  brand: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  description: string | null;

  @Column({ length: 20, default: 'pcs' })
  unit: string;

  /** Printed (maximum) price. */
  @Column({ type: 'double', default: 0 })
  mrp: number;

  /** Selling price. */
  @Column({ type: 'double', default: 0 })
  price: number;

  @Column({ type: 'double', default: 0 })
  stock: number;

  @Column({ name: 'low_stock_level', type: 'double', default: 5 })
  lowStockLevel: number;

  @Column({ name: 'image_url', type: 'varchar', length: 500, nullable: true })
  imageUrl: string | null;

  /**
   * Pack-wise prices: for example 250 g, 500 g, 1 kg. `qty` is how much of the unit one pack holds (0.25 kg), and `price`
   * is what that pack costs. The product's own `price` is the common price for one whole unit.
   */
  @Column({ type: 'simple-json', nullable: true })
  packs: Array<{ label: string; qty: number; price: number }> | null;

  /** Tamil name, shown beside the English one. */
  @Column({ name: 'name_ta', type: 'varchar', length: 150, nullable: true })
  nameTa: string | null;

  /** What the shop paid. Owner only: never sent to customers. */
  @Column({ name: 'purchase_price', type: 'double', nullable: true })
  purchasePrice: number | null;

  /** Best-before date, YYYY-MM-DD. */
  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  barcode: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'rating_avg', type: 'double', default: 0 })
  ratingAvg: number;

  @Column({ name: 'rating_count', type: 'int', default: 0 })
  ratingCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('store_cart_items')
@Index(['userId', 'productId', 'packLabel'], { unique: true })
export class StoreCartItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ name: 'product_id', type: 'int' })
  productId: number;

  /** The chosen pack, such as "500 g". Empty when the product is sold by its plain unit. */
  @Column({ name: 'pack_label', type: 'varchar', length: 20, default: '' })
  packLabel: string;

  /** How many packs. */
  @Column({ type: 'int', default: 1 })
  quantity: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('store_addresses')
@Index(['userId'])
export class StoreAddress {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  /** Home, Work, ... */
  @Column({ length: 30, default: 'Home' })
  label: string;

  @Column({ name: 'full_name', length: 100 })
  fullName: string;

  @Column({ length: 15 })
  phone: string;

  @Column({ length: 300 })
  line1: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  landmark: string | null;

  @Column({ length: 80 })
  city: string;

  @Column({ length: 10 })
  pincode: string;

  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('store_orders')
@Index(['customerId'])
@Index(['shopId', 'status'])
@Index(['assignedWorkerId'])
@Index(['orderNo'], { unique: true })
export class StoreOrder {
  @PrimaryGeneratedColumn()
  id: number;

  /** Human-friendly number such as NS-2026-000123. */
  @Column({ name: 'order_no', length: 24 })
  orderNo: string;

  @Column({ name: 'customer_id', type: 'int' })
  customerId: number;

  @Column({ name: 'shop_id', type: 'int' })
  shopId: number;

  @Column({ type: 'varchar', length: 20, default: 'placed' })
  status: OrderStatus;

  @Column({ name: 'payment_method', type: 'varchar', length: 10, default: 'cod' })
  paymentMethod: PaymentMethod;

  @Column({ name: 'payment_status', type: 'varchar', length: 10, default: 'pending' })
  paymentStatus: PaymentStatus;

  @Column({ type: 'double', default: 0 })
  subtotal: number;

  @Column({ name: 'delivery_fee', type: 'double', default: 0 })
  deliveryFee: number;

  @Column({ type: 'double', default: 0 })
  total: number;

  /** Delivery address copied at checkout, so later edits never change an old order. */
  @Column({ name: 'ship_name', length: 100 })
  shipName: string;

  @Column({ name: 'ship_phone', length: 15 })
  shipPhone: string;

  @Column({ name: 'ship_address', length: 600 })
  shipAddress: string;

  @Column({ name: 'ship_pincode', length: 10 })
  shipPincode: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  notes: string | null;

  /** 'delivery' to the address, or 'pickup' at the shop. */
  @Column({ type: 'varchar', length: 10, default: 'delivery' })
  fulfillment: 'delivery' | 'pickup';

  /** The time window the customer chose, for example "10 AM - 12 PM". */
  @Column({ name: 'delivery_slot', type: 'varchar', length: 40, nullable: true })
  deliverySlot: string | null;

  @Column({ name: 'assigned_worker_id', type: 'int', nullable: true })
  assignedWorkerId: number | null;

  /** 4-digit code the customer tells the delivery person. */
  @Column({ name: 'delivery_code', length: 4 })
  deliveryCode: string;

  @Column({ name: 'cancel_reason', type: 'varchar', length: 300, nullable: true })
  cancelReason: string | null;

  @CreateDateColumn({ name: 'placed_at' })
  placedAt: Date;

  @Column({ name: 'delivered_at', type: 'datetime', nullable: true })
  deliveredAt: Date | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('store_order_items')
@Index(['orderId'])
export class StoreOrderItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'order_id', type: 'int' })
  orderId: number;

  @Column({ name: 'product_id', type: 'int' })
  productId: number;

  @Column({ length: 150 })
  name: string;

  @Column({ length: 20, default: 'pcs' })
  unit: string;

  @Column({ type: 'double' })
  price: number;

  @Column({ type: 'int' })
  quantity: number;

  /** How much of the product's unit one pack holds (1 for plain items), used to give stock back on cancel. */
  @Column({ name: 'pack_qty', type: 'double', default: 1 })
  packQty: number;

  @Column({ name: 'line_total', type: 'double' })
  lineTotal: number;
}

/** One line of an order's timeline ("Packed by Ravi at 4:10 pm"). */
@Entity('store_order_events')
@Index(['orderId'])
export class StoreOrderEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'order_id', type: 'int' })
  orderId: number;

  @Column({ type: 'varchar', length: 20 })
  status: OrderStatus;

  @Column({ name: 'by_user_id', type: 'int', nullable: true })
  byUserId: number | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

@Entity('store_reviews')
@Index(['productId'])
@Index(['productId', 'userId'], { unique: true })
export class StoreReview {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'product_id', type: 'int' })
  productId: number;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @Column({ type: 'int' })
  rating: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  comment: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

export const STORE_ENTITIES = [
  StoreShop, StoreShopStaff, StoreCategory, StoreProduct, StoreCartItem, StoreAddress,
  StoreOrder, StoreOrderItem, StoreOrderEvent, StoreReview,
];
