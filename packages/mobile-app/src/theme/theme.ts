/**
 * App Theme Configuration
 * Modern, clean design with green accent (savings theme)
 */

import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

export const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#1B5E20',
    primaryContainer: '#E8F5E9',
    secondary: '#0D47A1',
    secondaryContainer: '#E3F2FD',
    tertiary: '#E65100',
    tertiaryContainer: '#FFF3E0',
    error: '#C62828',
    errorContainer: '#FFCDD2',
    background: '#F8F9FA',
    surface: '#FFFFFF',
    surfaceVariant: '#F1F3F5',
    outline: '#ADB5BD',
    outlineVariant: '#DEE2E6',
    onPrimary: '#FFFFFF',
    onSecondary: '#FFFFFF',
    onBackground: '#212529',
    onSurface: '#212529',
    onSurfaceVariant: '#495057',
  },
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#81C784',
    primaryContainer: '#1B5E20',
    secondary: '#90CAF9',
    secondaryContainer: '#0D47A1',
    tertiary: '#FFB74D',
    tertiaryContainer: '#E65100',
    error: '#EF9A9A',
    errorContainer: '#B71C1C',
    background: '#121212',
    surface: '#1E1E1E',
    surfaceVariant: '#2C2C2C',
    outline: '#6C757D',
    outlineVariant: '#495057',
  },
};

export type AppTheme = typeof lightTheme;

// Design tokens
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
};

// Supermarket brand colors
export const supermarketColors: Record<string, string> = {
  ah: '#00A0E2',
  jumbo: '#FFD700',
  aldi: '#009FE3',
  dirk: '#ED7203',
  vomar: '#ED1C24',
  hoogvliet: '#E31937',
  action: '#0071CE',
  picnic: '#E4262A',
  megafoodstunter: '#2ECC40',
  butlon: '#1A1A2E',
  kruidvat: '#00A651',
  joybuy: '#E4393C',
};
