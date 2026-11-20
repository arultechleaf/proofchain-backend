import axios from 'axios';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../constants/config';

const TOKEN_KEY = 'ns_token';

export const api = axios.create({ baseURL: API_URL, timeout: 12000 });

let memoryToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

// expo-secure-store has no web implementation, so fall back to localStorage there.
const isWeb = Platform.OS === 'web';
const storage = {
  async get(): Promise<string | null> {
    if (isWeb) return typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
    return SecureStore.getItemAsync(TOKEN_KEY);
  },
  async set(token: string) {
    if (isWeb) return void (typeof localStorage !== 'undefined' && localStorage.setItem(TOKEN_KEY, token));
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  },
  async remove() {
    if (isWeb) return void (typeof localStorage !== 'undefined' && localStorage.removeItem(TOKEN_KEY));
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  },
};

export const tokenStore = {
  async load() {
    memoryToken = await storage.get();
    return memoryToken;
  },
  async save(token: string) {
    memoryToken = token;
    await storage.set(token);
  },
  async clear() {
    memoryToken = null;
    await storage.remove();
  },
};

/** Called when the server says the saved sign-in is no longer valid. */
export const setUnauthorizedHandler = (fn: () => void) => {
  onUnauthorized = fn;
};

api.interceptors.request.use((config) => {
  if (memoryToken) config.headers.Authorization = `Bearer ${memoryToken}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (error) => {
    const url: string = error?.config?.url ?? '';
    if (error?.response?.status === 401 && !url.includes('/auth/login')) onUnauthorized?.();
    return Promise.reject(error);
  },
);
