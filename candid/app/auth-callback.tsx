import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';

// Landing screen for the email verification deep link: candid://auth-callback?code=XXXX
// Exchanges the code, checks profile state, then navigates directly.
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const router = useRouter();

  useEffect(() => {
    async function handleCallback() {
      // Exchange the code for a session. _layout.tsx init() may have already
      // done this via getInitialURL — if so, this call fails silently.
      if (params.code) {
        await supabase.auth
          .exchangeCodeForSession(`candid://auth-callback?code=${params.code}`)
          .catch(() => {});
      }

      // Verify we have a session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/(auth)/login');
        return;
      }

      // Check whether this user has a profile row yet
      try {
        await api.get('/users/me');
        router.replace('/(tabs)/camera');
      } catch (e: any) {
        router.replace(e?.status === 404 ? '/setup-username' : '/(tabs)/camera');
      }
    }

    handleCallback();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#f5f0e8" />
    </View>
  );
}
