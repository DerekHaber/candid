import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '../../lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function signIn() {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) Alert.alert('Sign In Failed', error.message);
    setLoading(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      enabled={!loading}
    >
      <View style={styles.header}>
        <Text style={styles.logo}>candid</Text>
        <Text style={styles.tagline}>moments, unfiltered.</Text>
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
          onPress={signIn}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#0a0a0a" />
          ) : (
            <Text style={styles.buttonText}>sign in</Text>
          )}
        </TouchableOpacity>

        <Link href="/(auth)/signup" asChild>
          <TouchableOpacity style={styles.linkButton}>
            <Text style={styles.linkText}>
              new here?{' '}
              <Text style={styles.linkAccent}>create an account</Text>
            </Text>
          </TouchableOpacity>
        </Link>
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
});
