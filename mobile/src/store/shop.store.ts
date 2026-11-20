import { create } from 'zustand';

/** The shop the customer is ordering from. Products on Home are limited to it. */
export const useShopChoice = create<{
  shop: { id: number; name: string } | null;
  choose: (shop: { id: number; name: string } | null) => void;
}>((set) => ({
  shop: null,
  choose: (shop) => set({ shop }),
}));
