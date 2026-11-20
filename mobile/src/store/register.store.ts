import { create } from 'zustand';

export interface RegisterDraft {
  kind: 'customer' | 'owner';
  name: string;
  email: string;
  mobile: string;
  password: string;
  shopName: string;
  shopAddress: string;
  city: string;
  pincode: string;
}

const EMPTY: RegisterDraft = {
  kind: 'customer', name: '', email: '', mobile: '', password: '', shopName: '', shopAddress: '', city: '', pincode: '',
};

/** Sign-up details kept between the form and the email-code screen. */
export const useRegisterDraft = create<{ draft: RegisterDraft; set: (d: RegisterDraft) => void; clear: () => void }>((set) => ({
  draft: EMPTY,
  set: (draft) => set({ draft }),
  clear: () => set({ draft: EMPTY }),
}));
