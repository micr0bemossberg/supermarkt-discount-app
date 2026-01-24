/**
 * App Theme Configuration
 * Using React Native Paper's Material Design 3 theme
 */

import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

export const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#0066CC',
    primaryContainer: '#D1E4FF',
    secondary: '#00A86B',
    secondaryContainer: '#C8E6C9',
    tertiary: '#FFB300',
    tertiaryContainer: '#FFE082',
    error: '#BA1A1A',
    errorContainer: '#FFDAD6',
    background: '#FDFCFF',
    surface: '#FDFCFF',
    surfaceVariant: '#E1E2EC',
    outline: '#74777F',
    outlineVariant: '#C4C6D0',
  },
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#9ECAFF',
    primaryContainer: '#004A77',
    secondary: '#69F0AE',
    secondaryContainer: '#00695C',
    tertiary: '#FFD54F',
    tertiaryContainer: '#F57C00',
    error: '#FFB4AB',
    errorContainer: '#93000A',
    background: '#1A1C1E',
    surface: '#1A1C1E',
    surfaceVariant: '#44474F',
    outline: '#8E9099',
    outlineVariant: '#44474F',
  },
};

export type AppTheme = typeof lightTheme;
