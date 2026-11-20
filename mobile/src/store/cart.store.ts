import { create } from 'zustand';
import { customerService } from '../services/customer.service';
import type { Cart } from '../types';

const EMPTY: Cart = { groups: [], itemCount: 0, subtotal: 0, deliveryFee: 0, total: 0 };

interface CartState {
  cart: Cart;
  loading: boolean;
  refresh: () => Promise<void>;
  add: (productId: number, quantity?: number, pack?: string) => Promise<void>;
  setQuantity: (productId: number, quantity: number, pack?: string) => Promise<void>;
  clear: () => Promise<void>;
  /** Put the items of an earlier order back in the cart; items that are gone are skipped. */
  repeat: (items: Array<{ productId: number; quantity: number; unit?: string }>) => Promise<{ added: number; skipped: number }>;
  reset: () => void;
}

export const useCart = create<CartState>((set) => ({
  cart: EMPTY,
  loading: false,

  async refresh() {
    set({ loading: true });
    try {
      set({ cart: await customerService.cart() });
    } finally {
      set({ loading: false });
    }
  },
  async add(productId, quantity = 1, pack) {
    set({ cart: await customerService.addToCart(productId, quantity, pack) });
  },
  async setQuantity(productId, quantity, pack) {
    set({ cart: await customerService.setCartQuantity(productId, quantity, pack) });
  },
  async clear() {
    set({ cart: await customerService.clearCart() });
  },
  async repeat(items) {
    let added = 0;
    let skipped = 0;
    for (const i of items) {
      try {
        set({ cart: await customerService.addToCart(i.productId, Math.min(99, Math.max(1, Math.round(i.quantity))), i.unit) });
        added += 1;
      } catch {
        skipped += 1; // out of stock, hidden or removed by the shop
      }
    }
    return { added, skipped };
  },
  reset: () => set({ cart: EMPTY }),
}));
