import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { View, ActivityIndicator, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  // null = not checked yet, true = row exists, false = row missing (needs setup)
  const [profileReady, setProfileReady] = useState<boolean | null>(null);
  const segments = useSegments();
  const router = useRouter();

  // One-time cleanup: cancel accumulated develop notifications from before this fix
  useEffect(() => {
    Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
  }, []);

  useEffect(() => {
    // Get the current session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setInitialized(true);
      if (session?.user?.id) registerPushToken(session.user.id);
    });

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (!session) setProfileReady(null);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Check whether a DB row exists whenever the session user changes
  useEffect(() => {
    if (!session) { setProfileReady(null); return; }
    setProfileReady(null); // reset while checking
    api.get('/users/me')
      .then(() => setProfileReady(true))
      .catch(() => setProfileReady(false));
  }, [session?.user?.id]);

  useEffect(() => {
    if (!initialized || (session && profileReady === null)) return;

    const inAuthGroup = segments[0] === '(auth)';
    const onSetupScreen = segments[0] === 'setup-username';
    const inTabs = segments[0] === '(tabs)';

    if (!session) {
      if (!inAuthGroup) router.replace('/(auth)/login');
    } else if (!profileReady) {
      // Has a session but no DB row — ask them to pick a username.
      // Don't redirect if already in tabs (handles post-setup navigation).
      if (!onSetupScreen && !inTabs) router.replace('/setup-username');
    } else {
      // Profile exists — leave auth / setup screens
      if (inAuthGroup || onSetupScreen) router.replace('/(tabs)/camera');
    }
  }, [session, initialized, profileReady, segments]);

  async function registerPushToken(userId: string) {
    if (Platform.OS === 'web') return;
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') return;
      const projectId =
        (Constants.expoConfig?.extra as Record<string, any>)?.eas?.projectId ??
        Constants.easConfig?.projectId;
      const { data: token } = await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : undefined
      );
      if (token) {
        await api.patch('/users/push-token', { push_token: token });
      }
    } catch (e) {
      console.log('Push token registration skipped:', e);
    }
  }

  // Show a blank loading screen while we check auth state and profile
  if (!initialized || (session && profileReady === null)) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#f5f0e8" />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
