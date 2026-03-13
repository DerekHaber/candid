import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../lib/supabase';

// This screen is the landing point for the email verification deep link:
//   candid://auth-callback?code=XXXX
// We exchange the code for a session and let _layout.tsx handle routing.
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{ code?: string }>();

  useEffect(() => {
    if (params.code) {
      // Build a full URL so exchangeCodeForSession can parse it
      supabase.auth
        .exchangeCodeForSession(`candid://auth-callback?code=${params.code}`)
        .catch(() => {});
    }
  }, [params.code]);

  return (
    <View style={{ flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color="#f5f0e8" />
    </View>
  );
}
