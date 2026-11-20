import { create } from 'zustand';
import { authService } from '../services/auth.service';
import { setUnauthorizedHandler, tokenStore } from '../services/api';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  /** True once the saved sign-in has been checked at start-up. */
  ready: boolean;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,

  async bootstrap() {
    try {
      const token = await tokenStore.load();
      if (token) set({ user: await authService.me() });
    } catch (err) {
      // only a rejected token ends the saved sign-in; being offline keeps it for next time
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) await tokenStore.clear();
      set({ user: null });
    } finally {
      set({ ready: true });
    }
  },

  async login(email, password) {
    const user = await authService.login(email, password);
    set({ user });
    return user;
  },

  async logout() {
    await authService.logout();
    set({ user: null });
  },
}));

// A rejected token anywhere in the app sends the user back to the sign-in screen.
setUnauthorizedHandler(() => {
  void tokenStore.clear();
  useAuth.setState({ user: null });
});

/** Where each role lands after signing in. */
export const homeFor = (role: string | undefined) => {
  if (role === 'admin') return '/(admin)/overview';
  if (role === 'shop_owner') return '/(shop-owner)/dashboard';
  if (role === 'shop_worker') return '/(labour)/dashboard';
  return '/(customer)/home';
};
