import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { useAppStore, restoreAuth } from '../store';
import { authApi, apiErrorMessage } from '../services/api';

// Prevent splash screen auto-hiding until session restore is done.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  const setAuth = useAppStore((s) => s.setAuth);
  const clearAuth = useAppStore((s) => s.clearAuth);
  const setSessionRestored = useAppStore((s) => s.setSessionRestored);

  // On first mount: attempt to restore the previous session from AsyncStorage.
  // If the stored access token is still valid, pre-populate the store.
  // If it's expired, try the refresh token. If that fails, clear and force login.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await restoreAuth();
      if (cancelled) return;

      if (stored?.accessToken) {
        try {
          // Pre-populate store with stored credentials so the /me request is authenticated
          setAuth(stored.accessToken, stored.refreshToken, stored.user);
          // Validate the stored token by calling /me.
          const user = await authApi.me();
          if (!cancelled) {
            setAuth(stored.accessToken, stored.refreshToken, user);
          }
        } catch {
          // Token may be expired — try to refresh.
          if (stored.refreshToken) {
            try {
              const session = await authApi.refresh(stored.refreshToken);
              if (!cancelled) {
                setAuth(session.access_token, session.refresh_token ?? null, session.user);
              }
            } catch {
              if (!cancelled) clearAuth();
            }
          } else {
            if (!cancelled) clearAuth();
          }
        }
      }

      if (!cancelled) setSessionRestored();
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
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
