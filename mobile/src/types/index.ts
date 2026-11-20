export type Role = 'customer' | 'shop_owner' | 'shop_worker' | string;

export interface User {
  id: number;
  name: string;
  email: string;
  mobile: string | null;
  role: Role;
  userCode?: string | null;
}

export type OrderStatus =
  | 'placed'
  | 'accepted'
  | 'packing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'rejected';

export type PaymentMethod = 'cod' | 'upi' | 'card';
export type PaymentStatus = 'pending' | 'paid' | 'refunded';

export interface Category {
  id: number;
  name: string;
  icon: string;
}

export interface Shop {
  id: number;
  name: string;
  description: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
  logoUrl: string | null;
  isOpen: boolean;
  deliveryFee: number;
  freeDeliveryAbove: number;
  minOrder: number;
}

/** One pack size with its own price, such as 500 g for ₹31. `qty` is how much of the unit it holds (0.5 kg). */
export interface Pack {
  label: string;
  qty: number;
  price: number;
}

export interface Product {
  id: number;
  shopId: number;
  categoryId: number | null;
  name: string;
  /** Tamil name. */
  nameTa?: string | null;
  /** Pack-wise prices; `price` is then the common price of one whole unit. */
  packs?: Pack[] | null;
  brand: string | null;
  description?: string | null;
  /** Owner only. */
  purchasePrice?: number | null;
  expiryDate?: string | null;
  barcode?: string | null;
  unit: string;
  mrp: number;
  price: number;
  stock: number;
  lowStockLevel?: number;
  imageUrl: string | null;
  isActive?: boolean;
  ratingAvg: number;
  ratingCount: number;
  shopName?: string;
}

export interface Review {
  id: number;
  rating: number;
  comment: string | null;
  userName: string;
  createdAt: string;
}

export interface ProductDetail extends Product {
  shop: Pick<Shop, 'id' | 'name' | 'city' | 'isOpen' | 'deliveryFee' | 'freeDeliveryAbove' | 'minOrder'> | null;
  reviews: Review[];
}

export interface Paged<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface CartLine {
  productId: number;
  /** The pack label, empty for the plain unit. */
  pack: string;
  packQty: number;
  name: string;
  unit: string;
  imageUrl: string | null;
  price: number;
  mrp: number;
  stock: number;
  available: boolean;
  quantity: number;
  lineTotal: number;
}

export interface CartGroup {
  shop: Pick<Shop, 'id' | 'name' | 'isOpen' | 'minOrder' | 'freeDeliveryAbove'>;
  items: CartLine[];
  subtotal: number;
  deliveryFee: number;
  total: number;
}

export interface Cart {
  groups: CartGroup[];
  itemCount: number;
  subtotal: number;
  deliveryFee: number;
  total: number;
}

export interface Address {
  id: number;
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  landmark: string | null;
  city: string;
  pincode: string;
  isDefault: boolean;
}

export type AddressInput = Omit<Address, 'id' | 'landmark' | 'isDefault'> & { landmark?: string; isDefault?: boolean };

export interface OrderItem {
  id: number;
  productId: number;
  name: string;
  unit: string;
  price: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderEvent {
  id: number;
  status: OrderStatus;
  note: string | null;
  byName: string | null;
  createdAt: string;
}

export interface Order {
  id: number;
  orderNo: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  subtotal: number;
  deliveryFee: number;
  total: number;
  shipName: string;
  shipPhone: string;
  shipAddress: string;
  shipPincode: string;
  notes: string | null;
  fulfillment?: 'delivery' | 'pickup';
  deliverySlot?: string | null;
  assignedWorkerId: number | null;
  /** Only sent to the customer: the 4-digit code the delivery person asks for. */
  deliveryCode?: string;
  cancelReason: string | null;
  placedAt: string;
  deliveredAt: string | null;
  shopId: number;
  shopName?: string;
  items: OrderItem[];
}

export interface OrderDetail extends Order {
  events: OrderEvent[];
  shop: { id: number; name: string; phone: string | null; address: string | null } | null;
  customer: { id: number; name: string; mobile: string | null } | null;
  worker: { id: number; name: string; mobile: string | null } | null;
}

export interface AppNotification {
  id: number;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface OwnerDashboard {
  shop: { id: number; name: string; isOpen: boolean };
  newOrders: number;
  activeOrders: number;
  ordersToday: number;
  deliveredToday: number;
  salesToday: number;
  lowStock: number;
  outOfStock: number;
  expirySoon: number;
  workers: number;
}

export interface Report {
  from: string;
  to: string;
  orders: number;
  delivered: number;
  cancelled: number;
  sales: number;
  averageOrder: number;
  byStatus: Record<string, number>;
  daily: Array<{ date: string; orders: number; sales: number }>;
  topProducts: Array<{ name: string; quantity: number; amount: number }>;
}

export interface Worker {
  id: number;
  name: string;
  email: string;
  mobile: string | null;
  isActive: boolean;
  delivered: number;
}

export interface WorkerDashboard {
  shop: { id: number; name: string };
  waiting: number;
  assignedToMe: number;
  deliveredToday: number;
  deliveredTotal: number;
  cashCollectedToday: number;
}

export interface ProductInput {
  name: string;
  categoryId?: number;
  brand?: string;
  description?: string;
  unit?: string;
  mrp: number;
  price: number;
  stock?: number;
  lowStockLevel?: number;
  imageUrl?: string;
  nameTa?: string;
  packs?: Pack[];
  purchasePrice?: number;
  expiryDate?: string;
  barcode?: string;
  isActive?: boolean;
}
