import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../lib/api';

type BlockedUser = {
  id: string;
  username: string;
};

export default function BlockedUsersScreen() {
  const router = useRouter();
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/blocks')
      .then(setBlocked)
      .catch(() => Alert.alert('Error', 'Could not load blocked users.'))
      .finally(() => setLoading(false));
  }, []);

  async function unblock(user: BlockedUser) {
    Alert.alert(`Unblock @${user.username}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock', onPress: async () => {
          try {
            await api.delete(`/blocks/${user.id}`);
            setBlocked(prev => prev.filter(u => u.id !== user.id));
          } catch {
            Alert.alert('Error', 'Could not unblock user.');
          }
        }
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={26} color="#f5f0e8" />
        </TouchableOpacity>
        <Text style={styles.title}>blocked users</Text>
        <View style={styles.backButton} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#f5f0e8" />
        </View>
      ) : (
        <FlatList
          data={blocked}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>no blocked users.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.username}>@{item.username}</Text>
              <TouchableOpacity style={styles.unblockButton} onPress={() => unblock(item)}>
                <Text style={styles.unblockText}>unblock</Text>
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 60,
    paddingBottom: 16,
  },
  backButton: { padding: 8, width: 44 },
  title: { fontSize: 18, fontWeight: '300', color: '#f5f0e8', letterSpacing: 4 },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
  empty: { paddingTop: 40, alignItems: 'center' },
  emptyText: { color: '#444', fontSize: 14, letterSpacing: 0.5 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  username: { color: '#f5f0e8', fontSize: 15, letterSpacing: 0.3 },
  unblockButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
  },
  unblockText: { color: '#888', fontSize: 13, letterSpacing: 0.5 },
});
