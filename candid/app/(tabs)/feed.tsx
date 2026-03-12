import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { supabase } from '../../lib/supabase';
import { api } from '../../lib/api'; // supabase kept for auth.getSession only
import ReactionPicker, { ReactionGroup } from '../components/ReactionPicker';
import VintageOverlay from '../components/VintageOverlay';
import FilteredImage from '../components/FilteredImage';
import CommentSheet, { CommentItem } from '../components/CommentSheet';

const { width: screenWidth } = Dimensions.get('window');
const PAGE_SIZE = 10;

type FeedPhoto = {
  id: string;
  storage_path: string;
  created_at: string;
  caption: string | null;
  media_type: string;
  users: { username: string; avatar_url: string | null } | null;
  signedUrl?: string;
};

function VideoCard({ signedUrl }: { signedUrl: string }) {
  const player = useVideoPlayer(signedUrl, p => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
  );
}

type StoryUser = {
  id: string;
  username: string;
  avatar_url: string | null;
  hasUnseen: boolean;
};

type PendingCount = number;
type ReactionMap = Map<string, ReactionGroup[]>;
type CommentMap = Map<string, CommentItem[]>;
type CountMap = Map<string, number>;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

export default function FeedScreen() {
  const router = useRouter();
  const [photos, setPhotos] = useState<FeedPhoto[]>([]);
  const [storyUsers, setStoryUsers] = useState<StoryUser[]>([]);
  const [pendingCount, setPendingCount] = useState<PendingCount>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [reactionMap, setReactionMap] = useState<ReactionMap>(new Map());
  const [commentMap, setCommentMap] = useState<CommentMap>(new Map());
  const [commentCountMap, setCommentCountMap] = useState<CountMap>(new Map());
  const [commentSheetPhoto, setCommentSheetPhoto] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const userId = session.user.id;
    setCurrentUserId(userId);

    setCursor(null);
    setHasMore(true);

    await Promise.all([
      loadFeed(null, false, userId),
      loadStoryUsers(),
      loadPendingCount(),
    ]);

    setLoading(false);
    setRefreshing(false);
  }

  async function loadFeed(fromCursor: string | null, append: boolean, userId = currentUserId) {
    const cursorParam = fromCursor ? `&cursor=${encodeURIComponent(fromCursor)}` : '';
    const rows: FeedPhoto[] = await api.get(`/feed?limit=${PAGE_SIZE}${cursorParam}`);

    if (!rows || rows.length === 0) {
      setHasMore(false);
      if (!append) setPhotos([]);
      return;
    }

    setHasMore(rows.length === PAGE_SIZE);
    setCursor(rows[rows.length - 1].created_at);

    const photoIds = rows.map(p => p.id);

    const [reactionRows, commentRows] = await Promise.all([
      api.get(`/feed/reactions?photoIds=${photoIds.join(',')}`),
      api.get(`/feed/comments?photoIds=${photoIds.join(',')}`),
    ]);

    const newReactionMap = buildReactionMap(reactionRows ?? [], userId);
    const { previewMap: newPreviewMap, countMap: newCountMap } = buildCommentMaps(commentRows ?? []);

    if (append) {
      setPhotos(prev => [...prev, ...rows]);
      setReactionMap(prev => new Map([...prev, ...newReactionMap]));
      setCommentMap(prev => new Map([...prev, ...newPreviewMap]));
      setCommentCountMap(prev => new Map([...prev, ...newCountMap]));
    } else {
      setPhotos(rows);
      setReactionMap(newReactionMap);
      setCommentMap(newPreviewMap);
      setCommentCountMap(newCountMap);
    }
  }

  async function loadMore() {
    if (!hasMore || loadingMore || loading) return;

    setLoadingMore(true);
    await loadFeed(cursor, true);
    setLoadingMore(false);
  }

  function buildReactionMap(
    rows: { photo_id: string; emoji: string; user_id: string }[],
    userId: string,
  ): ReactionMap {
    const map = new Map<string, ReactionGroup[]>();
    for (const row of rows) {
      const groups = map.get(row.photo_id) ?? [];
      const existing = groups.find(g => g.emoji === row.emoji);
      if (existing) {
        existing.count += 1;
        if (row.user_id === userId) existing.iMine = true;
      } else {
        groups.push({ emoji: row.emoji, count: 1, iMine: row.user_id === userId });
      }
      map.set(row.photo_id, groups);
    }
    return map;
  }

  function buildCommentMaps(rows: any[]): { previewMap: CommentMap; countMap: CountMap } {
    // rows are newest-first (DESC). Group by photo, take 2 newest, reverse for display order.
    const byPhoto = new Map<string, CommentItem[]>();
    for (const c of rows) {
      const comment: CommentItem = {
        ...c,
        users: Array.isArray(c.users) ? (c.users[0] ?? null) : c.users,
      };
      const arr = byPhoto.get(c.photo_id) ?? [];
      arr.push(comment);
      byPhoto.set(c.photo_id, arr);
    }
    const previewMap: CommentMap = new Map();
    const countMap: CountMap = new Map();
    byPhoto.forEach((comments, photoId) => {
      countMap.set(photoId, comments.length);
      previewMap.set(photoId, comments.slice(0, 2).reverse());
    });
    return { previewMap, countMap };
  }

  function handleCommentAdded(photoId: string, comment: CommentItem) {
    setCommentMap(prev => {
      const next = new Map(prev);
      const existing = next.get(photoId) ?? [];
      next.set(photoId, [...existing, comment].slice(-2));
      return next;
    });
    setCommentCountMap(prev => {
      const next = new Map(prev);
      next.set(photoId, (next.get(photoId) ?? 0) + 1);
      return next;
    });
  }

  async function handleReact(photoId: string, emoji: string) {
    if (!currentUserId) return;

    const groups = reactionMap.get(photoId) ?? [];
    const existing = groups.find(g => g.emoji === emoji);
    const isMine = existing?.iMine ?? false;

    const snapshot = (reactionMap.get(photoId) ?? []).map(x => ({ ...x }));

    // Optimistic update
    setReactionMap(prev => {
      const next = new Map(prev);
      const g = (next.get(photoId) ?? []).map(x => ({ ...x }));
      if (isMine) {
        const idx = g.findIndex(x => x.emoji === emoji);
        if (idx !== -1) {
          if (g[idx].count > 1) { g[idx].count -= 1; g[idx].iMine = false; }
          else g.splice(idx, 1);
        }
      } else {
        const idx = g.findIndex(x => x.emoji === emoji);
        if (idx !== -1) { g[idx].count += 1; g[idx].iMine = true; }
        else g.push({ emoji, count: 1, iMine: true });
      }
      next.set(photoId, g);
      return next;
    });

    try {
      await api.post('/feed/reactions', { photoId, emoji, action: isMine ? 'delete' : 'insert' });
    } catch (e) {
      console.error('Reaction write failed:', e);
      setReactionMap(prev => {
        const next = new Map(prev);
        next.set(photoId, snapshot);
        return next;
      });
    }
  }

  async function loadPendingCount() {
    try {
      const { count } = await api.get('/friends/pending-count');
      setPendingCount(count ?? 0);
    } catch (e) {
      console.error('loadPendingCount failed:', e);
    }
  }

  async function loadStoryUsers() {
    try {
      const users = await api.get('/stories');
      setStoryUsers(users);
    } catch (e) {
      console.error('loadStoryUsers failed:', e);
    }
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
      <FlatList
        data={photos}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#f5f0e8" />
        }
        ListHeaderComponent={
          <View>
            <View style={styles.feedHeader}>
              <Text style={styles.logoText}>candid</Text>
              <TouchableOpacity
                style={styles.friendsButton}
                onPress={() => router.push('/friends')}
              >
                <Ionicons name="person-add-outline" size={22} color="#f5f0e8" />
                {pendingCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {pendingCount > 9 ? '9+' : pendingCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Stories row */}
            {storyUsers.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.storiesRow}
              >
                {storyUsers.map(user => (
                  <TouchableOpacity
                    key={user.id}
                    style={styles.storyItem}
                    onPress={() => router.push(`/story/${user.id}`)}
                  >
                    {/* Ring — amber if unseen, grey if seen */}
                    <View style={[styles.storyRing, user.hasUnseen && styles.storyRingUnseen]}>
                      <View style={styles.storyAvatarInner}>
                        {user.avatar_url ? (
                          <Image source={{ uri: user.avatar_url }} style={styles.storyAvatar} />
                        ) : (
                          <Text style={styles.storyAvatarText}>
                            {user.username[0].toUpperCase()}
                          </Text>
                        )}
                      </View>
                    </View>
                    <Text style={styles.storyUsername} numberOfLines={1}>{user.username}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {storyUsers.length > 0 && <View style={styles.divider} />}
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="images-outline" size={40} color="#333" />
            <Text style={styles.emptyText}>no photos yet.</Text>
            <Text style={styles.emptySubtext}>
              add friends and share developed photos to see them here.
            </Text>
          </View>
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator color="#555" size="small" />
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.avatar}>
                {item.users?.avatar_url ? (
                  <Image source={{ uri: item.users.avatar_url }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarText}>
                    {(item.users?.username?.[0] ?? '?').toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={styles.cardMeta}>
                <Text style={styles.username}>{item.users?.username ?? 'unknown'}</Text>
                <Text style={styles.timestamp}>{timeAgo(item.created_at)}</Text>
              </View>
            </View>

            {item.signedUrl ? (
              <View style={styles.photoContainer}>
                {item.media_type === 'video' ? (
                  <>
                    <VideoCard signedUrl={item.signedUrl} />
                    <VintageOverlay />
                  </>
                ) : (
                  <FilteredImage uri={item.signedUrl} width={screenWidth} height={screenWidth * (4 / 3)} />
                )}
              </View>
            ) : (
              <View style={[styles.photoContainer, styles.photoPlaceholder]}>
                <Ionicons name="image-outline" size={32} color="#333" />
              </View>
            )}

            {item.caption ? (
              <Text style={styles.caption}>{item.caption}</Text>
            ) : null}

            <ReactionPicker
              photoId={item.id}
              groups={reactionMap.get(item.id) ?? []}
              currentUserId={currentUserId}
              onReact={handleReact}
            />

            {/* Comments preview */}
            <View style={styles.commentsSection}>
              {(commentMap.get(item.id) ?? []).map(c => (
                <Text key={c.id} style={styles.commentLine} numberOfLines={2}>
                  <Text style={styles.commentAuthor}>{c.users?.username ?? 'unknown'} </Text>
                  {c.text}
                </Text>
              ))}
              <TouchableOpacity onPress={() => setCommentSheetPhoto(item.id)}>
                {(commentCountMap.get(item.id) ?? 0) > 2 ? (
                  <Text style={styles.viewAllLink}>
                    view all {commentCountMap.get(item.id)} comments
                  </Text>
                ) : (
                  <Text style={styles.addCommentLink}>add a comment...</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      <CommentSheet
        photoId={commentSheetPhoto}
        currentUserId={currentUserId}
        visible={!!commentSheetPhoto}
        onClose={() => setCommentSheetPhoto(null)}
        onCommentAdded={handleCommentAdded}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', paddingTop: 60 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 40 },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  logoText: { fontSize: 28, fontWeight: '300', color: '#f5f0e8', letterSpacing: 8 },
  friendsButton: { padding: 4 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#c8902a',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  storiesRow: { paddingHorizontal: 16, paddingBottom: 16, gap: 16 },
  storyItem: { alignItems: 'center', gap: 6, width: 64 },
  storyRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#333',
    padding: 2,
  },
  storyRingUnseen: {
    borderColor: '#c8902a',
    borderWidth: 2.5,
  },
  storyAvatarInner: {
    flex: 1,
    borderRadius: 28,
    backgroundColor: '#1e1e1e',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  storyAvatar: { width: '100%', height: '100%' },
  storyAvatarText: { color: '#f5f0e8', fontSize: 20, fontWeight: '300' },
  storyUsername: { fontSize: 11, color: '#666', letterSpacing: 0.5, textAlign: 'center', width: '100%' },
  divider: { height: 1, backgroundColor: '#1a1a1a', marginBottom: 8 },
  emptyState: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60, paddingHorizontal: 40 },
  emptyText: { fontSize: 16, color: '#444', letterSpacing: 1 },
  emptySubtext: { fontSize: 13, color: '#333', textAlign: 'center', lineHeight: 20 },
  card: { marginBottom: 32 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: '#f5f0e8', fontSize: 13, fontWeight: '500' },
  cardMeta: { gap: 2 },
  username: { color: '#f5f0e8', fontSize: 14, letterSpacing: 0.5 },
  timestamp: { color: '#555', fontSize: 12, letterSpacing: 0.5 },
  photoContainer: { width: '100%', aspectRatio: 3 / 4 },
  photoPlaceholder: { backgroundColor: '#141414', alignItems: 'center', justifyContent: 'center' },
  caption: { color: '#aaa', fontSize: 14, paddingHorizontal: 16, paddingTop: 10, lineHeight: 20 },
  commentsSection: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, gap: 3 },
  commentLine: { color: '#aaa', fontSize: 13, lineHeight: 18 },
  commentAuthor: { color: '#f5f0e8', fontWeight: '500' },
  viewAllLink: { color: '#555', fontSize: 13, letterSpacing: 0.3, marginTop: 4 },
  addCommentLink: { color: '#3a3a3a', fontSize: 13, letterSpacing: 0.3, marginTop: 4 },
  footer: { paddingVertical: 24, alignItems: 'center' },
});
