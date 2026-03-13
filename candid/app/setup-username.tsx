import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../lib/api';

export default function SetupUsernameScreen() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (username.trim().length < 3) {
      Alert.alert('Error', 'Username must be at least 3 characters.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/users', { username: username.trim().toLowerCase() });
      router.replace('/(tabs)/camera');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save username.');
    }
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.title}>choose a username</Text>
        <Text style={styles.subtitle}>this is how friends will find you.</Text>

        <TextInput
          style={styles.input}
          placeholder="username"
          placeholderTextColor="#555"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={30}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={submit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#0a0a0a" />
          ) : (
            <Text style={styles.buttonText}>continue</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 16,
  },
  title: { fontSize: 26, fontWeight: '300', color: '#f5f0e8', letterSpacing: 4 },
  subtitle: { fontSize: 14, color: '#555', letterSpacing: 0.5, marginBottom: 8 },
  input: {
    width: '100%',
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
    width: '100%',
    backgroundColor: '#f5f0e8',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#0a0a0a', fontSize: 16, fontWeight: '600', letterSpacing: 1 },
});
