import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider, ActivityIndicator } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { lightTheme, darkTheme } from './src/theme/theme';

// Error boundary to catch and display errors
interface EBState { hasError: boolean; error: Error | null }
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, EBState> {
  state: EBState = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('ErrorBoundary:', error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorText}>{this.state.error?.message}</Text>
          <Text style={styles.errorStack}>{this.state.error?.stack?.substring(0, 800)}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// Lazy import navigator to catch import errors
let AppNavigator: React.FC | null = null;
let importError: string | null = null;

try {
  const nav = require('./src/navigation/AppNavigator');
  AppNavigator = nav.AppNavigator;
} catch (e: any) {
  importError = e.message + '\n' + (e.stack || '').substring(0, 500);
  console.error('Failed to import AppNavigator:', e);
}

function AppContent() {
  const systemColorScheme = useColorScheme();
  const theme = systemColorScheme === 'dark' ? darkTheme : lightTheme;

  if (importError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Import Error</Text>
        <Text style={styles.errorText}>{importError}</Text>
      </View>
    );
  }

  if (!AppNavigator) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Navigator not found</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <ErrorBoundary>
          <AppNavigator />
        </ErrorBoundary>
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
      </PaperProvider>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#cc0000',
    padding: 20,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  errorText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'left',
    fontFamily: 'monospace',
  },
  errorStack: {
    color: '#ffcccc',
    fontSize: 11,
    textAlign: 'left',
    marginTop: 10,
    fontFamily: 'monospace',
  },
});
