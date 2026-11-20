export const colors = {
  primary: '#15803d',
  primaryDark: '#0f5f2e',
  primaryLight: '#dcfce7',
  accent: '#f59e0b',
  background: '#f4f7f5',
  card: '#ffffff',
  text: '#0f1f17',
  textMuted: '#5f6f66',
  border: '#e2e8e4',
  danger: '#dc2626',
  dangerLight: '#fee2e2',
  warning: '#d97706',
  warningLight: '#fef3c7',
  info: '#2563eb',
  infoLight: '#dbeafe',
  success: '#16a34a',
  white: '#ffffff',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const font = { xs: 11, sm: 13, md: 15, lg: 18, xl: 22, xxl: 28 } as const;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
} as const;
