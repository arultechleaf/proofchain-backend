import { api, tokenStore } from './api';
import type { User } from '../types';

export interface RegisterCustomerInput {
  name: string;
  email: string;
  mobile: string;
  password: string;
}

export interface RegisterOwnerInput extends RegisterCustomerInput {
  shopName: string;
  shopAddress?: string;
  city?: string;
  pincode?: string;
}

const lower = (s: string) => s.trim().toLowerCase();

export const authService = {
  async login(email: string, password: string): Promise<User> {
    const { data } = await api.post<{ accessToken: string; user: User }>('/auth/login', { email: lower(email), password });
    await tokenStore.save(data.accessToken);
    return data.user;
  },
  // short timeout: at start-up an unreachable server must not keep the app on a spinner
  me: async () => (await api.get<User>('/auth/me', { timeout: 8000 })).data,
  sendOtp: (email: string) => api.post('/email-otp/send', { email: lower(email) }),
  verifyOtp: (email: string, otp: string) => api.post('/email-otp/verify', { email: lower(email), otp }),
  registerCustomer: (b: RegisterCustomerInput) => api.post('/store/auth/register-customer', { ...b, email: lower(b.email) }),
  registerOwner: (b: RegisterOwnerInput) => api.post('/store/auth/register-owner', { ...b, email: lower(b.email) }),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email: lower(email) }),
  verifyResetOtp: (email: string, otp: string) => api.post('/auth/verify-reset-otp', { email: lower(email), otp }),
  resetPassword: (email: string, password: string) => api.post('/auth/reset-password', { email: lower(email), password }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
  async logout() {
    try {
      await api.post('/auth/logout');
    } catch {
      /* the token is discarded either way */
    }
    await tokenStore.clear();
  },
};
