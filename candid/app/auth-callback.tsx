import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';

// Landing screen for email verification deep link: candid://auth-callback?code=XXXX
// _layout.tsx init() already exchanged the code via getInitialURL before this screen
// renders. We just read the established session and navigate.
export default function AuthCallbackScreen() {
  const router = useRouter();

  useEffect(() => {
    async function handleCallback() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/(auth)/login');
        return;
      }
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
