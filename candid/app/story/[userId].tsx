import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { api } from '../../lib/api';
import ReactionPicker, { ReactionGroup } from '../components/ReactionPicker';
import FilteredImage from '../components/FilteredImage';
import CommentSheet from '../components/CommentSheet';

type ReactionMap = Map<string, ReactionGroup[]>;

const { width, height } = Dimensions.get('window');
const STORY_DURATION = 5000;

type StoryPhoto = {
  id: string;
  storage_path: string;
  created_at: string;
  caption: string | null;
  signedUrl?: string;
};

type StoryUser = {
  username: string;
  avatar_url: string | null;
};

export default function StoryScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const router = useRouter();

  const [photos, setPhotos] = useState<StoryPhoto[]>([]);
  const [user, setUser] = useState<StoryUser | null>(null);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reactionMap, setReactionMap] = useState<ReactionMap>(new Map());
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressAnimRef = useRef<Animated.CompositeAnimation | null>(null);
  const timerStoppedAt = useRef<number>(0);

  useEffect(() => {
    fetchStory();
  }, [userId]);

  useEffect(() => {
    if (photos.length === 0) return;
    startProgress();
    markViewed(photos[index]?.id);

    return () => {
      progressAnimRef.current?.stop();
      if (progressTimer.current) clearTimeout(progressTimer.current);
    };
  }, [index, photos.length]);

  async function fetchStory() {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id ?? '';
    setCurrentUserId(uid);

    try {
      const [profile, rows] = await Promise.all([
        api.get(`/users/${userId}`),
        api.get(`/stories/${userId}`),
      ]);

      if (!rows || rows.length === 0) { router.back(); return; }

      setUser(profile);

      const photoIds = rows.map((p: any) => p.id);
      const reactionRows = await api.get(`/feed/reactions?photoIds=${photoIds.join(',')}`);

      setPhotos(rows);
      setReactionMap(buildReactionMap(reactionRows ?? [], uid));
      setLoading(false);
    } catch {
      router.back();
    }
  }

  function buildReactionMap(
    rows: { photo_id: string; emoji: string; user_id: string }[],
    uid: string,
  ): ReactionMap {
    const map = new Map<string, ReactionGroup[]>();
    for (const row of rows) {
      const groups = map.get(row.photo_id) ?? [];
      const existing = groups.find(g => g.emoji === row.emoji);
      if (existing) {
        existing.count += 1;
        if (row.user_id === uid) existing.iMine = true;
      } else {
        groups.push({ emoji: row.emoji, count: 1, iMine: row.user_id === uid });
      }
      map.set(row.photo_id, groups);
    }
    return map;
  }

  async function handleReact(photoId: string, emoji: string) {
    if (!currentUserId) return;

    const groups = reactionMap.get(photoId) ?? [];
    const existing = groups.find(g => g.emoji === emoji);
    const isMine = existing?.iMine ?? false;

    const snapshot = (reactionMap.get(photoId) ?? []).map(x => ({ ...x }));

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

  async function markViewed(photoId: string) {
    if (!photoId) return;
    api.post('/story-views', { photoId }).catch(() => {});
  }

  function startProgress(fromValue = 0) {
    progressAnim.setValue(fromValue);
    const remaining = STORY_DURATION * (1 - fromValue);
    progressAnimRef.current = Animated.timing(progressAnim, {
      toValue: 1,
      duration: remaining,
      useNativeDriver: false,
    });
    progressAnimRef.current.start(({ finished }) => {
      if (finished) advance();
    });
  }

  function openPicker() {
    progressAnimRef.current?.stop();
    progressAnim.stopAnimation(val => { timerStoppedAt.current = val; });
    setPickerOpen(true);
  }

  function closePicker() {
    setPickerOpen(false);
    startProgress(timerStoppedAt.current);
  }

  function openComments() {
    progressAnimRef.current?.stop();
    progressAnim.stopAnimation(val => { timerStoppedAt.current = val; });
    setCommentOpen(true);
  }

  function closeComments() {
    setCommentOpen(false);
    startProgress(timerStoppedAt.current);
  }

  function advance() {
    if (index < photos.length - 1) {
      setIndex(i => i + 1);
    } else {
      router.back();
    }
  }

  function goBack() {
    if (index > 0) {
      progressAnimRef.current?.stop();
      setIndex(i => i - 1);
    }
  }

  function goForward() {
    progressAnimRef.current?.stop();
    advance();
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#f5f0e8" />
      </View>
    );
  }

  const current = photos[index];
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      {/* Photo */}
      {current?.signedUrl && (
        <FilteredImage uri={current.signedUrl} width={width} height={height} />
      )}

      {/* Dark gradient at top for readability */}
      <View style={styles.topGradient} pointerEvents="none" />

      {/* Progress bars */}
      <View style={styles.progressContainer}>
        {photos.map((_, i) => (
          <View key={i} style={styles.progressTrack}>
            {i < index && <View style={[styles.progressFill, styles.progressComplete]} />}
            {i === index && <Animated.View style={[styles.progressFill, { width: progressWidth }]} />}
          </View>
        ))}
      </View>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.userInfo}>
          <View style={styles.avatar}>
            {user?.avatar_url ? (
              <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>
                {(user?.username?.[0] ?? '?').toUpperCase()}
              </Text>
            )}
          </View>
          <View>
            <Text style={styles.username}>{user?.username}</Text>
            <Text style={styles.timestamp}>
              {new Date(current.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={26} color="#f5f0e8" />
        </TouchableOpacity>
      </View>

      {/* Caption */}
      {current.caption && (
        <View style={styles.captionContainer}>
          <Text style={styles.caption}>{current.caption}</Text>
        </View>
      )}

      {/* Tap zones: left 40% = back, right 60% = forward */}
      {!pickerOpen && !commentOpen && (
        <View style={styles.tapZones} pointerEvents="box-none">
          <TouchableWithoutFeedback onPress={goBack}>
            <View style={styles.tapLeft} />
          </TouchableWithoutFeedback>
          <TouchableWithoutFeedback onPress={goForward}>
            <View style={styles.tapRight} />
          </TouchableWithoutFeedback>
        </View>
      )}

      {/* Comment + Emoji buttons */}
      {!pickerOpen && !commentOpen && (
        <>
          <TouchableOpacity style={styles.commentBtn} onPress={openComments} activeOpacity={0.8}>
            <Ionicons name="chatbubble-outline" size={20} color="#f5f0e8" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.emojiBtn} onPress={openPicker} activeOpacity={0.8}>
            <Ionicons name="happy-outline" size={22} color="#f5f0e8" />
          </TouchableOpacity>
        </>
      )}

      {/* Reaction picker overlay */}
      {pickerOpen && (
        <>
          <TouchableWithoutFeedback onPress={closePicker}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
          <View style={styles.reactionOverlay} pointerEvents="box-none">
            <ReactionPicker
              photoId={current.id}
              groups={reactionMap.get(current.id) ?? []}
              currentUserId={currentUserId}
              onReact={(photoId, emoji) => { handleReact(photoId, emoji); }}
            />
          </View>
        </>
      )}

      {/* Comment sheet */}
      <CommentSheet
        photoId={current.id}
        currentUserId={currentUserId}
        visible={commentOpen}
        onClose={closeComments}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
topGradient: { ...StyleSheet.absoluteFillObject, height: 140, backgroundColor: 'rgba(0,0,0,0.45)' },
  progressContainer: {
    position: 'absolute',
    top: 56,
    left: 10,
    right: 10,
    flexDirection: 'row',
    gap: 4,
    zIndex: 10,
  },
  progressTrack: {
    flex: 1,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#f5f0e8',
    borderRadius: 1,
  },
  progressComplete: { width: '100%' },
  header: {
    position: 'absolute',
    top: 70,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2a2a2a',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: '#f5f0e8', fontSize: 15, fontWeight: '300' },
  username: { color: '#f5f0e8', fontSize: 14, fontWeight: '500', letterSpacing: 0.5 },
  timestamp: { color: 'rgba(245,240,232,0.6)', fontSize: 11, letterSpacing: 0.5 },
  closeButton: { padding: 6 },
  captionContainer: {
    position: 'absolute',
    bottom: 48,
    left: 16,
    right: 16,
    zIndex: 10,
  },
  caption: {
    color: '#f5f0e8',
    fontSize: 15,
    lineHeight: 22,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  tapZones: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    zIndex: 5,
  },
  tapLeft: { width: '40%', height: '100%' },
  tapRight: { width: '60%', height: '100%' },
  commentBtn: {
    position: 'absolute',
    bottom: 56,
    right: 72,
    zIndex: 15,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiBtn: {
    position: 'absolute',
    bottom: 56,
    right: 20,
    zIndex: 15,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: 'rgba(10,10,10,0.92)',
    paddingBottom: 16,
  },
});
