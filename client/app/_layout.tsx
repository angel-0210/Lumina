import { useFonts } from 'expo-font';
import { Stack, DarkTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useAppStore, restoreAuth } from '../store';
import { authApi, notificationsApi } from '../services/api';
import AppErrorBoundary from '../components/ErrorBoundary';

// Export Expo Router's ErrorBoundary for segment error handling
export { ErrorBoundary } from 'expo-router';

// Configure foreground notification presentation
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// Prevent splash screen auto-hiding until session restore is done.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  const accessToken = useAppStore((s) => s.accessToken);
  const setAuth = useAppStore((s) => s.setAuth);
  const clearAuth = useAppStore((s) => s.clearAuth);
  const setSessionRestored = useAppStore((s) => s.setSessionRestored);

  // Deep-link notification response listener
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      if (data?.topicId) {
        const { router } = require('expo-router');
        router.push(`/mastery/${data.topicId}`);
      } else if (data?.lessonId) {
        const { router } = require('expo-router');
        router.push(`/lesson/${data.lessonId}`);
      }
    });
    return () => subscription.remove();
  }, []);

  // Register push notifications token when authenticated on native mobile
  useEffect(() => {
    const isExpoGo =
      Constants.appOwnership === 'expo' ||
      Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

    if (Platform.OS !== 'web' && accessToken && !isExpoGo) {
      (async () => {
        try {
          const { status: existingStatus } = await Notifications.getPermissionsAsync();
          let finalStatus = existingStatus;
          if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
          }

          if (finalStatus === 'granted') {
            const projectId = Constants.expoConfig?.extra?.eas?.projectId;
            const tokenData = await Notifications.getExpoPushTokenAsync(
              projectId ? { projectId } : undefined
            );
            if (tokenData?.data) {
              await notificationsApi.registerToken(tokenData.data, Platform.OS);
              console.log('[NOTIFICATION] Push token registered successfully.');
            }
          }
        } catch (err) {
          console.log('[NOTIFICATION] Push registration skipped or failed:', err);
        }
      })();
    } else if (isExpoGo) {
      console.log('[NOTIFICATION] Running in Expo Go — remote push notification token registration skipped.');
    }
  }, [accessToken]);

  // On first mount: attempt to restore the previous session from AsyncStorage.
  // Fail-safe timeout guarantees sessionRestored is set even if network/storage stalls.
  useEffect(() => {
    let cancelled = false;
    const timeoutTimer = setTimeout(() => {
      if (!cancelled) {
        console.log('[BOOT] Fail-safe session restore timeout fired');
        setSessionRestored();
      }
    }, 3000);

    (async () => {
      try {
        console.log('[AUTH] Checking stored session...');
        const stored = await restoreAuth();
        if (cancelled) return;

        if (stored?.accessToken) {
          try {
            setAuth(stored.accessToken, stored.refreshToken, stored.user);
            const user = await authApi.me();
            if (!cancelled) {
              setAuth(stored.accessToken, stored.refreshToken, user);
              console.log('[AUTH] Session restored successfully for user:', user.email);
            }
          } catch {
            if (stored.refreshToken) {
              try {
                const session = await authApi.refresh(stored.refreshToken);
                if (!cancelled) {
                  setAuth(session.access_token, session.refresh_token ?? null, session.user);
                  console.log('[AUTH] Token refreshed successfully.');
                }
              } catch {
                if (!cancelled) clearAuth();
              }
            } else {
              if (!cancelled) clearAuth();
            }
          }
        } else {
          console.log('[AUTH] No stored session found.');
        }
      } catch (e) {
        console.error('[AUTH ERROR] Session restore error:', e);
        if (!cancelled) clearAuth();
      } finally {
        clearTimeout(timeoutTimer);
        if (!cancelled) {
          setSessionRestored();
          console.log('[BOOT] Session restore complete');
        }
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutTimer);
    };
  }, []);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <AppErrorBoundary>
      <RootLayoutNav />
    </AppErrorBoundary>
  );
}

function RootLayoutNav() {
  return (
    <ThemeProvider value={DarkTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: '#0d1117',
          },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}

