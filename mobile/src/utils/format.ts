import { API_URL } from '../constants/config';
import { colors } from '../theme';
import type { OrderStatus, PaymentMethod } from '../types';

export const money = (n: number | null | undefined) =>
  '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export const discountPercent = (mrp: number, price: number) =>
  mrp > price && mrp > 0 ? Math.round(((mrp - price) / mrp) * 100) : 0;

export const shortDate = (iso: string | null | undefined) => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export const dateTime = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) +
    ', ' +
    d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
  );
};

export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const STATUS_LABEL: Record<OrderStatus, string> = {
  placed: 'Order placed',
  accepted: 'Accepted',
  packing: 'Packing',
  ready: 'Ready for pickup',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  rejected: 'Rejected',
};

export const STATUS_COLOR: Record<OrderStatus, { fg: string; bg: string }> = {
  placed: { fg: colors.info, bg: colors.infoLight },
  accepted: { fg: colors.info, bg: colors.infoLight },
  packing: { fg: colors.warning, bg: colors.warningLight },
  ready: { fg: colors.warning, bg: colors.warningLight },
  out_for_delivery: { fg: '#7c3aed', bg: '#ede9fe' },
  delivered: { fg: colors.success, bg: colors.primaryLight },
  cancelled: { fg: colors.danger, bg: colors.dangerLight },
  rejected: { fg: colors.danger, bg: colors.dangerLight },
};

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cod: 'Cash on delivery',
  upi: 'UPI',
  card: 'Card',
};

/** The message from a failed API call, ready to show to the user. */
export const errorText = (err: unknown, fallback = 'Something went wrong. Please try again.') => {
  const e = err as { response?: { data?: { message?: string | string[] } }; message?: string; code?: string };
  const m = e?.response?.data?.message;
  if (Array.isArray(m)) return m[0];
  if (m) return m;
  if (e?.code === 'ERR_NETWORK' || e?.message === 'Network Error') {
    return `Cannot reach the server at ${API_URL}. Check that the phone and PC are on the same Wi-Fi and the API address is right.`;
  }
  return fallback;
};
