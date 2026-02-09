import { Stack } from 'expo-router';
import { LogBox } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../contexts/AuthContext';
import { OfflineProvider } from '../contexts/OfflineContext';
import ErrorBoundary from '../components/ErrorBoundary';

// Suppress SignalR reconnection noise — handled by retry logic
LogBox.ignoreLogs(['WebSocket failed to connect', 'Failed to start the connection']);

/** Root layout wrapping the app in ErrorBoundary, AuthProvider, OfflineProvider, and SafeAreaProvider */
export default function RootLayout() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <OfflineProvider>
          <SafeAreaProvider>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(app)" />
            </Stack>
          </SafeAreaProvider>
        </OfflineProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
