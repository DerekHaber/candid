import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  SectionList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';

type UserResult = {
  id: string;
  username: string;
  relationshipStatus: 'none' | 'pending_sent' | 'pending_received' | 'accepted';
  relationshipId?: string;
};

type Relationship = {
  id: string;
  user_id: string;
  friend_id: string;
  status: string;
};

export default function FriendsScreen() {
  const router = useRouter();

  const [currentUserId, setCurrentUserId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    init();
  }, []);

  // Debounce search
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const timer = setTimeout(() => search(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery, relationships]);

  async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    setCurrentUserId(session.user.id);
    await loadRelationships();
    setLoading(false);
  }

  async function loadRelationships() {
    try {
      const data = await api.get('/friends');
      setRelationships(data ?? []);
    } catch (e) {
      console.error('loadRelationships failed:', e);
    }
  }

  async function search(query: string) {
    if (!currentUserId) return;
    setSearching(true);

    try {
      const data = await api.get(`/users/search?q=${encodeURIComponent(query.trim())}`);

      const results: UserResult[] = (data ?? []).map((user: any) => {
        const rel = relationships.find(
          r => r.user_id === user.id || r.friend_id === user.id
        );
        if (!rel) return { ...user, relationshipStatus: 'none' };
        if (rel.status === 'accepted') return { ...user, relationshipStatus: 'accepted', relationshipId: rel.id };
        const isSender = rel.user_id === currentUserId;
        return {
          ...user,
          relationshipStatus: isSender ? 'pending_sent' : 'pending_received',
          relationshipId: rel.id,
        };
      });

      setSearchResults(results);
    } catch (e) {
      console.error('search failed:', e);
    }
    setSearching(false);
  }

  async function sendRequest(userId: string) {
    try {
      await api.post('/friends', { friend_id: userId });
      await loadRelationships();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  async function acceptRequest(relationshipId: string) {
    try {
      await api.patch(`/friends/${relationshipId}`, { status: 'accepted' });
      await loadRelationships();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  async function removeRelationship(relationshipId: string, isRequest = false) {
    const message = isRequest ? 'Decline this friend request?' : 'Remove this friend?';
    Alert.alert(isRequest ? 'Decline Request' : 'Remove Friend', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: isRequest ? 'Decline' : 'Remove',
        style: 'destructive',
        onPress: async () => {
          await api.delete(`/friends/${relationshipId}`);
          await loadRelationships();
        },
      },
    ]);
  }

  const incoming = relationships.filter(
    r => r.friend_id === currentUserId && r.status === 'pending'
  );
  const friends = relationships.filter(r => r.status === 'accepted');

  // Render a user row in search results
  function renderSearchResult({ item }: { item: UserResult }) {
    return (
      <View style={styles.userRow}>
        <View style={styles.userAvatar}>
          <Text style={styles.userAvatarText}>{item.username[0].toUpperCase()}</Text>
        </View>
        <Text style={styles.userName}>{item.username}</Text>

        {item.relationshipStatus === 'none' && (
          <TouchableOpacity style={styles.addButton} onPress={() => sendRequest(item.id)}>
            <Text style={styles.addButtonText}>add</Text>
          </TouchableOpacity>
        )}
        {item.relationshipStatus === 'pending_sent' && (
          <Text style={styles.pendingLabel}>sent</Text>
        )}
        {item.relationshipStatus === 'pending_received' && (
          <TouchableOpacity
            style={styles.acceptButton}
            onPress={() => item.relationshipId && acceptRequest(item.relationshipId)}
          >
            <Text style={styles.acceptButtonText}>accept</Text>
          </TouchableOpacity>
        )}
        {item.relationshipStatus === 'accepted' && (
          <TouchableOpacity onPress={() => item.relationshipId && removeRelationship(item.relationshipId)}>
            <Ionicons name="checkmark-circle" size={22} color="#c8902a" />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#f5f0e8" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={26} color="#f5f0e8" />
        </TouchableOpacity>
        <Text style={styles.title}>friends</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={16} color="#555" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="search by username"
          placeholderTextColor="#555"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); }}>
            <Ionicons name="close-circle" size={16} color="#555" />
          </TouchableOpacity>
        )}
      </View>

      {/* Search results */}
      {searchQuery.length > 0 ? (
        <View style={styles.section}>
          {searching ? (
            <ActivityIndicator color="#555" style={{ marginTop: 20 }} />
          ) : searchResults.length === 0 ? (
            <Text style={styles.emptyText}>no users found</Text>
          ) : (
            <FlatList
              data={searchResults}
              keyExtractor={item => item.id}
              renderItem={renderSearchResult}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </View>
      ) : (
        <SectionList
          sections={[
            {
              title: 'requests',
              data: incoming,
              show: incoming.length > 0,
            },
            {
              title: 'friends',
              data: friends,
              show: true,
            },
          ].filter(s => s.show)}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionLabel}>{section.title}</Text>
          )}
          renderItem={({ item, section }) => {
            const isIncoming = section.title === 'requests';
            const otherId = item.user_id === currentUserId ? item.friend_id : item.user_id;

            return (
              <FriendRow
                relationshipId={item.id}
                userId={otherId}
                isRequest={isIncoming}
                onAccept={() => acceptRequest(item.id)}
                onRemove={() => removeRelationship(item.id, isIncoming)}
              />
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={40} color="#333" />
              <Text style={styles.emptyText}>no friends yet</Text>
              <Text style={styles.emptySubtext}>search for someone to get started.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// Sub-component to fetch + display a user row for the friends/requests lists
function FriendRow({
  userId,
  isRequest,
  onAccept,
  onRemove,
}: {
  relationshipId: string;
  userId: string;
  isRequest: boolean;
  onAccept: () => void;
  onRemove: () => void;
}) {
  const [username, setUsername] = useState('');

  useEffect(() => {
    api.get(`/users/${userId}`)
      .then(data => { if (data?.username) setUsername(data.username); })
      .catch(() => {});
  }, [userId]);

  if (!username) return null;

  return (
    <View style={styles.userRow}>
      <View style={styles.userAvatar}>
        <Text style={styles.userAvatarText}>{username[0].toUpperCase()}</Text>
      </View>
      <Text style={styles.userName}>{username}</Text>

      {isRequest ? (
        <View style={styles.requestActions}>
          <TouchableOpacity style={styles.acceptButton} onPress={onAccept}>
            <Text style={styles.acceptButtonText}>accept</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.declineButton} onPress={onRemove}>
            <Text style={styles.declineButtonText}>decline</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity onPress={onRemove}>
          <Ionicons name="person-remove-outline" size={18} color="#444" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', paddingTop: 60 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 20,
  },
  backButton: { padding: 8, width: 40 },
  title: { fontSize: 22, fontWeight: '300', color: '#f5f0e8', letterSpacing: 4 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#252525',
    borderRadius: 12,
    marginHorizontal: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    gap: 10,
  },
  searchIcon: { flexShrink: 0 },
  searchInput: { flex: 1, color: '#f5f0e8', fontSize: 15, letterSpacing: 0.3 },
  section: { flex: 1 },
  listContent: { paddingBottom: 40 },
  sectionLabel: {
    fontSize: 11,
    color: '#555',
    letterSpacing: 2,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    textTransform: 'uppercase',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1e1e1e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: { color: '#f5f0e8', fontSize: 16, fontWeight: '300' },
  userName: { flex: 1, color: '#f5f0e8', fontSize: 15, letterSpacing: 0.3 },
  addButton: {
    borderWidth: 1,
    borderColor: '#f5f0e8',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  addButtonText: { color: '#f5f0e8', fontSize: 13, letterSpacing: 1 },
  pendingLabel: { color: '#555', fontSize: 13, letterSpacing: 1 },
  requestActions: { flexDirection: 'row', gap: 8 },
  acceptButton: {
    backgroundColor: '#f5f0e8',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  acceptButtonText: { color: '#0a0a0a', fontSize: 13, fontWeight: '600', letterSpacing: 0.5 },
  declineButton: {
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  declineButtonText: { color: '#555', fontSize: 13, letterSpacing: 0.5 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 15, color: '#444', letterSpacing: 1 },
  emptySubtext: { fontSize: 13, color: '#333', letterSpacing: 0.5 },
});
