import { create } from 'zustand';
import type { Product } from '../types';

/** The product being edited, passed from the product list to the product form. */
export const useEditingProduct = create<{ product: Product | null; set: (p: Product | null) => void }>((set) => ({
  product: null,
  set: (product) => set({ product }),
}));
