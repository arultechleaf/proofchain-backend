import { Platform } from 'react-native';
import Constants from 'expo-constants';

/** The backend runs on port 3002 (APP_PORT in backend/.env). */
const DEFAULT_PORT = 3002;

/**
 * While developing, the phone already talks to the PC to load the app (Metro). That address is the PC's current
 * Wi-Fi address, so the API is assumed to be on the same PC. This keeps working when the PC's IP changes.
 */
const metroHost = (): string | undefined => {
  const hostUri = Constants.expoConfig?.hostUri; // for example "192.168.1.16:8081"
  const host = hostUri?.split(':')[0];
  return host && host !== 'localhost' && host !== '127.0.0.1' ? host : undefined;
};

const auto = (): string => {
  const host = metroHost();
  if (host) return `http://${host}:${DEFAULT_PORT}/api`;
  return Platform.OS === 'android'
    ? `http://10.0.2.2:${DEFAULT_PORT}/api` // the Android emulator's name for the PC
    : `http://localhost:${DEFAULT_PORT}/api`;
};

/** Set EXPO_PUBLIC_API_URL (see .env.example) to force a specific server, for example a deployed one. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || auto()).replace(/\/+$/, '');

/** The server address without /api, for files such as product photos. */
export const API_ORIGIN = API_URL.replace(/\/api$/, '');

/** A product photo as the app can show it: full links stay as they are, uploaded ones get the server address. */
export const imageUri = (url?: string | null): string | null => {
  if (!url) return null;
  return /^https?:\/\//.test(url) ? url : API_ORIGIN + url;
};

export const APP_NAME = 'Namma Store';
export const PAGE_SIZE = 20;
