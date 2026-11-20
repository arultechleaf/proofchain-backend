import { api } from './api';
import type {
  Address, AddressInput, AppNotification, Cart, Category, Order, OrderDetail, Paged, Product, ProductDetail, Shop,
} from '../types';

export interface ProductFilter {
  q?: string;
  categoryId?: number;
  shopId?: number;
  sort?: 'new' | 'price_asc' | 'price_desc' | 'rating';
  page?: number;
  limit?: number;
}

export const customerService = {
  categories: async () => (await api.get<Category[]>('/store/categories')).data,
  products: async (params: ProductFilter) => (await api.get<Paged<Product>>('/store/products', { params })).data,
  product: async (id: number) => (await api.get<ProductDetail>(`/store/products/${id}`)).data,
  shops: async (params?: { q?: string; pincode?: string }) => (await api.get<Shop[]>('/store/shops', { params })).data,

  cart: async () => (await api.get<Cart>('/store/me/cart')).data,
  addToCart: async (productId: number, quantity = 1, pack?: string) =>
    (await api.post<Cart>('/store/me/cart', { productId, quantity, pack: pack || undefined })).data,
  setCartQuantity: async (productId: number, quantity: number, pack?: string) =>
    (await api.patch<Cart>(`/store/me/cart/${productId}`, { quantity, pack: pack || undefined })).data,
  clearCart: async () => (await api.delete<Cart>('/store/me/cart')).data,

  addresses: async () => (await api.get<Address[]>('/store/me/addresses')).data,
  saveAddress: async (input: AddressInput, id?: number) =>
    (id ? await api.put<Address>(`/store/me/addresses/${id}`, input) : await api.post<Address>('/store/me/addresses', input)).data,
  removeAddress: (id: number) => api.delete(`/store/me/addresses/${id}`),

  checkout: async (input: {
    addressId?: number;
    paymentMethod: 'cod' | 'upi' | 'card';
    fulfillment: 'delivery' | 'pickup';
    deliverySlot?: string;
    notes?: string;
  }) =>
    (await api.post<{ orders: Array<{ id: number; orderNo: string; total: number; deliveryCode: string }> }>(
      '/store/me/orders/checkout', { ...input, notes: input.notes || undefined },
    )).data,
  orders: async (status?: 'active' | 'past') => (await api.get<Order[]>('/store/me/orders', { params: { status } })).data,
  order: async (id: number) => (await api.get<OrderDetail>(`/store/me/orders/${id}`)).data,
  cancelOrder: async (id: number, reason?: string) => (await api.post<OrderDetail>(`/store/me/orders/${id}/cancel`, { reason })).data,
  review: async (productId: number, rating: number, comment?: string) =>
    (await api.post<ProductDetail>(`/store/me/products/${productId}/review`, { rating, comment: comment || undefined })).data,
};

export const notificationService = {
  list: async () => (await api.get<{ data: AppNotification[]; unread: number }>('/notifications', { params: { limit: 50 } })).data,
  unread: async () => (await api.get<{ data: { unread: number } }>('/notifications/unread-count')).data.data.unread,
  markAllRead: () => api.post('/notifications/read-all'),
  markRead: (id: number) => api.patch(`/notifications/${id}/read`),
};
