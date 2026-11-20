import { api } from './api';
import type {
  Category, Order, OrderDetail, OrderStatus, OwnerDashboard, Paged, Product, ProductInput, Report, Shop, Worker,
} from '../types';

export interface ShopInput {
  name?: string;
  description?: string;
  phone?: string;
  address?: string;
  city?: string;
  pincode?: string;
  isOpen?: boolean;
  deliveryFee?: number;
  freeDeliveryAbove?: number;
  minOrder?: number;
}

/** Send a photo picked on the phone; returns the path the product should save as its image. */
export const uploadPhoto = async (uri: string, mimeType?: string | null) => {
  const type = mimeType && mimeType.startsWith('image/') ? mimeType : 'image/jpeg';
  const form = new FormData();
  form.append('file', { uri, name: `photo.${type.split('/')[1] || 'jpg'}`, type } as unknown as Blob);
  const { data } = await api.post<{ url: string }>('/store/owner/upload', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 60000 });
  return data.url;
};

export const ownerService = {
  dashboard: async () => (await api.get<OwnerDashboard>('/store/owner/dashboard')).data,
  report: async (from: string, to: string) => (await api.get<Report>('/store/owner/reports', { params: { from, to } })).data,

  shop: async () => (await api.get<Shop>('/store/owner/shop')).data,
  updateShop: async (input: ShopInput) => (await api.patch<Shop>('/store/owner/shop', input)).data,

  categories: async () => (await api.get<Category[]>('/store/categories')).data,
  products: async (params: { q?: string; filter?: 'low' | 'out'; page?: number; limit?: number }) =>
    (await api.get<Paged<Product>>('/store/owner/products', { params })).data,
  createProduct: async (input: ProductInput) => (await api.post<Product>('/store/owner/products', input)).data,
  updateProduct: async (id: number, input: ProductInput) => (await api.put<Product>(`/store/owner/products/${id}`, input)).data,
  adjustStock: async (id: number, change: number) => (await api.patch<Product>(`/store/owner/products/${id}/stock`, { change })).data,
  removeProduct: async (id: number) => (await api.delete<{ deleted: number; hidden: number }>(`/store/owner/products/${id}`)).data,

  orders: async (status?: string) => (await api.get<Order[]>('/store/owner/orders', { params: { status } })).data,
  order: async (id: number) => (await api.get<OrderDetail>(`/store/owner/orders/${id}`)).data,
  setStatus: async (id: number, status: OrderStatus, reason?: string, code?: string) =>
    (await api.patch<OrderDetail>(`/store/owner/orders/${id}/status`, { status, reason, code })).data,
  assign: async (id: number, workerId: number) => (await api.patch<OrderDetail>(`/store/owner/orders/${id}/assign`, { workerId })).data,
  setPayment: async (id: number, status: 'paid' | 'pending') =>
    (await api.patch<OrderDetail>(`/store/owner/orders/${id}/payment`, { status })).data,

  workers: async () => (await api.get<Worker[]>('/store/owner/workers')).data,
  addWorker: async (input: { name: string; email: string; mobile: string; password: string }) =>
    (await api.post<Worker>('/store/owner/workers', input)).data,
  editWorker: async (id: number, input: { name?: string; isActive?: boolean; password?: string }) =>
    (await api.patch<Worker[]>(`/store/owner/workers/${id}`, input)).data,
};
