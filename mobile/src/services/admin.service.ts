import { api } from './api';
import type { Order, OrderDetail, Product, Shop } from '../types';

export interface AdminOverview {
  shops: number;
  openShops: number;
  products: number;
  customers: number;
  owners: number;
  workers: number;
  orders: number;
  ordersToday: number;
  activeOrders: number;
  sales: number;
  salesToday: number;
}

export interface AdminShop extends Shop {
  isActive: boolean;
  ownerName: string;
  ownerEmail: string;
  ownerMobile: string | null;
  productCount: number;
  orderCount: number;
}

export interface AdminCustomer {
  id: number;
  name: string;
  email: string;
  mobile: string | null;
  isActive: boolean;
  orders: number;
  spent: number;
}

export const adminService = {
  overview: async () => (await api.get<AdminOverview>('/store/admin/overview')).data,
  shops: async () => (await api.get<AdminShop[]>('/store/admin/shops')).data,
  setShopActive: async (id: number, isActive: boolean) => (await api.patch<Shop>(`/store/admin/shops/${id}`, { isActive })).data,
  orders: async (status?: string) =>
    (await api.get<Array<Order & { customerName: string }>>('/store/admin/orders', { params: { status } })).data,
  order: async (id: number) => (await api.get<OrderDetail>(`/store/admin/orders/${id}`)).data,
  products: async (q?: string) => (await api.get<Array<Product & { shopName: string }>>('/store/admin/products', { params: { q } })).data,
  customers: async () => (await api.get<AdminCustomer[]>('/store/admin/customers')).data,
};
