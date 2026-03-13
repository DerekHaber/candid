import { useEffect, useState, useCallback } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { View, ActivityIndicator, Platform, TouchableOpacity, Text, Linking, InteractionManager } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Shown after 4s on the loading screen — lets users escape a stuck state
function EscapeHatch() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 4000);
    return () => clearTimeout(t);
  }, []);
  if (!visible) return null;
  return (
    <TouchableOpacity onPress={() => supabase.auth.signOut()} style={{ padding: 16 }}>
      <Text style={{ color: '#444', fontSize: 13, letterSpacing: 1 }}>stuck? tap to sign out</Text>
    </TouchableOpacity>
  );
}

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
    // Handle deep links when the app is already open (e.g. tapping link while app is backgrounded)
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      if (url.includes('code=') || url.includes('access_token=')) {
        supabase.auth.exchangeCodeForSession(url).catch(() => {});
      }
    });

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'TOKEN_REFRESHED' && !session) {
          supabase.auth.signOut();
          return;
        }
        setSession(session);
        if (!session) setProfileReady(null);
      }
    );

    // Init: exchange code from deep link FIRST, then get session.
    // This prevents a race where getSession() resolves before the code
    // exchange completes, causing a double-navigation crash.
    async function init() {
      const url = await Linking.getInitialURL();
      if (url && (url.includes('code=') || url.includes('access_token='))) {
        await supabase.auth.exchangeCodeForSession(url).catch(() => {});
      }
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        supabase.auth.signOut();
        setInitialized(true);
        return;
      }
      setSession(session);
      setInitialized(true);
    }

    init();

    return () => {
      subscription.unsubscribe();
      linkSub.remove();
    };
  }, []);

  const checkProfile = useCallback(async () => {
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 8000)
      );
      await Promise.race([api.get('/users/me'), timeout]);
      setProfileReady(true);
    } catch (e: any) {
      if (e?.message?.toLowerCase().includes('refresh token')) {
        await supabase.auth.signOut();
        return;
      }
      // Only treat a 404 as "no profile" — network errors, timeouts, etc.
      // should not send the user to setup-username
      setProfileReady(e?.status === 404 ? false : true);
    }
  }, []);

  // Register push token only after profile is confirmed and all navigation animations finish.
  // Calling Notifications native APIs during a navigation transition can crash (TurboModule SIGABRT).
  useEffect(() => {
    if (!session?.user?.id || profileReady !== true) return;
    const task = InteractionManager.runAfterInteractions(() => {
      registerPushToken(session.user.id);
    });
    return () => task.cancel();
  }, [session?.user?.id, profileReady]);

  // Check whether a DB row exists whenever the session user changes
  useEffect(() => {
    if (!session) {
      setProfileReady(null);
      return;
    }
    checkProfile();
  }, [session?.user?.id, checkProfile]);

  // Re-check profile if we are navigating and it's not ready yet
  useEffect(() => {
    const onSetupScreen = segments[0] === 'setup-username';
    const inAuthGroup = segments[0] === '(auth)';

    if (session && profileReady === false && !onSetupScreen && !inAuthGroup) {
      checkProfile();
    }
  }, [segments, session, profileReady, checkProfile]);

  useEffect(() => {
    if (!initialized || (session && profileReady === null)) return;

    const inAuthGroup = segments[0] === '(auth)';
    const onSetupScreen = segments[0] === 'setup-username';
    const onCallbackScreen = segments[0] === 'auth-callback';
    const inTabs = segments[0] === '(tabs)';

    if (!session) {
      if (!inAuthGroup && !onCallbackScreen) router.replace('/(auth)/login');
    } else if (profileReady === false) {
      // Has a session but no DB row — ask them to pick a username.
      // Don't redirect if already in tabs (handles post-setup navigation).
      if (!onSetupScreen && !inTabs) router.replace('/setup-username');
    } else if (profileReady === true) {
      // Profile exists — go to app from auth/setup/index screens
      if (inAuthGroup || onSetupScreen || onCallbackScreen || !segments[0]) router.replace('/(tabs)/camera');
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
      <View style={{ flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', gap: 32 }}>
        <ActivityIndicator color="#f5f0e8" />
        <EscapeHatch />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
