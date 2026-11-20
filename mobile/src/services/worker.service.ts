import { api } from './api';
import type { Order, OrderDetail, WorkerDashboard } from '../types';

export const workerService = {
  dashboard: async () => (await api.get<WorkerDashboard>('/store/worker/dashboard')).data,
  orders: async (scope: 'mine' | 'open') => (await api.get<Order[]>('/store/worker/orders', { params: { scope } })).data,
  history: async () => (await api.get<Order[]>('/store/worker/history')).data,
  order: async (id: number) => (await api.get<OrderDetail>(`/store/worker/orders/${id}`)).data,
  claim: async (id: number) => (await api.post<OrderDetail>(`/store/worker/orders/${id}/claim`)).data,
  setStatus: async (id: number, status: 'packing' | 'ready' | 'out_for_delivery' | 'delivered', code?: string) =>
    (await api.patch<OrderDetail>(`/store/worker/orders/${id}/status`, { status, code })).data,
};
