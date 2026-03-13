import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  Platform,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';
import FilteredImage from '../components/FilteredImage';

const { width: screenWidth } = Dimensions.get('window');
const GRID_COLS = 3;
const CELL = (screenWidth - 4) / GRID_COLS;

type UserProfile = {
  id: string;
  username: string;
  avatar_url: string | null;
};

type Post = {
  id: string;
  storage_path: string;
  created_at: string;
  caption: string | null;
  media_type: string;
  signedUrl?: string;
};

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    loadProfile();
  }, [id]);

  async function loadProfile() {
    try {
      const [userData, postsData] = await Promise.all([
        api.get(`/users/${id}`),
        api.get(`/users/${id}/posts`),
      ]);
      setUser(userData);
      setPosts(postsData ?? []);
    } catch (e: any) {
      if (e?.status === 404) {
        Alert.alert('Not found', 'This user no longer exists.');
        router.back();
      } else {
        Alert.alert('Error', 'Could not load profile.');
      }
    }
    setLoading(false);
  }

  function handleMore() {
    if (!user) return;
    const options = [`Report @${user.username}`, `Block @${user.username}`, 'Cancel'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options, destructiveButtonIndex: 1, cancelButtonIndex: 2 },
        async (idx) => {
          if (idx === 0) await submitReport();
          if (idx === 1) await blockUser();
        }
      );
    } else {
      Alert.alert('Options', undefined, [
        { text: `Report @${user.username}`, onPress: submitReport },
        { text: `Block @${user.username}`, style: 'destructive', onPress: blockUser },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  async function submitReport() {
    if (!user) return;
    try {
      await api.post('/reports', { reported_user_id: user.id, reason: 'inappropriate' });
      Alert.alert('Reported', 'Thank you. We will review this.');
    } catch {
      Alert.alert('Error', 'Could not submit report.');
    }
  }

  async function blockUser() {
    if (!user) return;
    Alert.alert(`Block @${user.username}?`, 'They will be removed from your feed and cannot find you.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Block', style: 'destructive', onPress: async () => {
          try {
            await api.post('/blocks', { blocked_id: user.id });
            router.back();
          } catch {
            Alert.alert('Error', 'Could not block user.');
          }
        }
      },
    ]);
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#f5f0e8" />
      </View>
    );
  }

  if (!user) return null;

  return (
    <View style={styles.container}>
      <FlatList
        data={posts}
        keyExtractor={item => item.id}
        numColumns={GRID_COLS}
        contentContainerStyle={styles.grid}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                <Ionicons name="chevron-back" size={26} color="#f5f0e8" />
              </TouchableOpacity>
              <Text style={styles.title}>profile</Text>
              <TouchableOpacity onPress={handleMore} style={styles.moreButton}>
                <Ionicons name="ellipsis-horizontal" size={22} color="#555" />
              </TouchableOpacity>
            </View>

            <View style={styles.avatarSection}>
              <View style={styles.avatar}>
                {user.avatar_url ? (
                  <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarInitial}>
                    {user.username[0].toUpperCase()}
                  </Text>
                )}
              </View>
              <Text style={styles.username}>@{user.username}</Text>
            </View>

            {posts.length > 0 && (
              <Text style={styles.sectionLabel}>photos</Text>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="images-outline" size={36} color="#333" />
            <Text style={styles.emptyText}>no photos shared yet.</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={[styles.cell, index % GRID_COLS !== GRID_COLS - 1 && styles.cellGap]}>
            {item.signedUrl ? (
              <FilteredImage uri={item.signedUrl} width={CELL} height={CELL} />
            ) : (
              <View style={[styles.cell, styles.cellPlaceholder]}>
                <Ionicons name="image-outline" size={20} color="#333" />
              </View>
            )}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: { paddingBottom: 8 },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 60,
    marginBottom: 24,
  },
  backButton: { padding: 8, width: 44 },
  title: { fontSize: 18, fontWeight: '300', color: '#f5f0e8', letterSpacing: 4 },
  moreButton: { padding: 8, width: 44, alignItems: 'flex-end' },
  avatarSection: { alignItems: 'center', gap: 10, marginBottom: 24 },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1e1e1e',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { fontSize: 32, fontWeight: '200', color: '#f5f0e8' },
  username: { fontSize: 14, color: '#555', letterSpacing: 1 },
  sectionLabel: {
    fontSize: 11,
    color: '#333',
    letterSpacing: 2,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  grid: { paddingBottom: 40 },
  cell: { width: CELL, height: CELL, overflow: 'hidden' },
  cellGap: { marginRight: 2 },
  cellPlaceholder: { backgroundColor: '#141414', alignItems: 'center', justifyContent: 'center' },
  emptyState: { alignItems: 'center', gap: 12, paddingTop: 40 },
  emptyText: { color: '#444', fontSize: 14, letterSpacing: 0.5 },
});
