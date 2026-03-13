import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { api } from '../../lib/api';

export default function SignupScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function signUp() {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }
    setLoading(true);

    // Sign up with Supabase Auth.
    // emailRedirectTo uses the app's deep link scheme so the verification
    // email opens the app directly. This works in standalone builds — for
    // Expo Go testing, disable email confirmation in the Supabase dashboard
    // (Authentication → Providers → Email → toggle off "Confirm email").
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: 'candid://auth-callback',
      },
    });

    if (signUpError) {
      Alert.alert('Sign Up Failed', signUpError.message);
      setLoading(false);
      return;
    }

    // If email confirmation is enabled, the user object exists but has no
    // session yet — let them know to check their inbox.
    if (data.user && !data.session) {
      Alert.alert(
        'Check your email',
        'We sent you a confirmation link. Tap it to activate your account, then sign in.',
        [{ text: 'OK' }]
      );
    }

    setLoading(false);
    // Auth state change in _layout.tsx will handle navigation automatically
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      enabled={!loading}
    >
      <View style={styles.header}>
        <Text style={styles.logo}>candid</Text>
        <Text style={styles.tagline}>join the circle.</Text>
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="email"
          placeholderTextColor="#555"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoCorrect={false}
        />
        <TextInput
          style={styles.input}
          placeholder="password"
          placeholderTextColor="#555"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={signUp}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#0a0a0a" />
          ) : (
            <Text style={styles.buttonText}>create account</Text>
          )}
        </TouchableOpacity>

        <Link href="/(auth)/login" asChild>
          <TouchableOpacity style={styles.linkButton}>
            <Text style={styles.linkText}>
              already have an account?{' '}
              <Text style={styles.linkAccent}>sign in</Text>
            </Text>
          </TouchableOpacity>
        </Link>

        <Text style={styles.privacyText}>
          by signing up you agree to our{' '}
          <Text
            style={styles.privacyLink}
            onPress={() => Linking.openURL('https://justcandid.net/privacy.html')}
          >
            privacy policy
          </Text>
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  header: {
    alignItems: 'center',
    marginBottom: 56,
  },
  logo: {
    fontSize: 52,
    fontWeight: '300',
    color: '#f5f0e8',
    letterSpacing: 10,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 13,
    color: '#555',
    letterSpacing: 2,
  },
  form: {
    width: '100%',
    gap: 12,
  },
  input: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#252525',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
    color: '#f5f0e8',
    fontSize: 16,
    letterSpacing: 0.3,
  },
  button: {
    backgroundColor: '#f5f0e8',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#0a0a0a',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 1,
  },
  linkButton: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  linkText: {
    color: '#555',
    fontSize: 14,
  },
  linkAccent: {
    color: '#f5f0e8',
  },
  privacyText: {
    color: '#333',
    fontSize: 12,
    textAlign: 'center',
    letterSpacing: 0.3,
    marginTop: 8,
  },
  privacyLink: {
    color: '#555',
    textDecorationLine: 'underline',
  },
});
