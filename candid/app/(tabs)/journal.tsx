import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
  RefreshControl,
  TextInput,
  Dimensions,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { captureRef } from 'react-native-view-shot';
import { VideoView, useVideoPlayer } from 'expo-video';
import { api } from '../../lib/api';
import VintageOverlay from '../components/VintageOverlay';
import FilteredImage from '../components/FilteredImage';

function VideoModalPlayer({ signedUrl }: { signedUrl: string }) {
  const player = useVideoPlayer(signedUrl, p => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
  );
}

const { width, height: screenHeight } = Dimensions.get('window');
const H_PADDING = 16;
const GAP = 10;
const CARD_WIDTH = (width - H_PADDING * 2 - GAP) / 2;

type Photo = {
  id: string;
  storage_path: string;
  created_at: string;
  shared_to_feed: boolean;
  caption: string | null;
  media_type: string;
  signedUrl?: string;
};

type PhotoPair = [Photo, Photo | null];
type DaySection = { title: string; data: PhotoPair[] };

function getDayLabel(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'today';
  if (date.toDateString() === yesterday.toDateString()) return 'yesterday';

  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }).toLowerCase();
}

function buildSections(photos: Photo[]): DaySection[] {
  const groups = new Map<string, Photo[]>();
  for (const p of photos) {
    const key = getDayLabel(p.created_at);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  return Array.from(groups.entries()).map(([title, items]) => {
    const pairs: PhotoPair[] = [];
    for (let i = 0; i < items.length; i += 2) {
      pairs.push([items[i], items[i + 1] ?? null]);
    }
    return { title, data: pairs };
  });
}

export default function JournalScreen() {
  const router = useRouter();
  const [sections, setSections] = useState<DaySection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Photo | null>(null);
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);
  const [myAvatarUrl, setMyAvatarUrl] = useState<string | null>(null);
  const photoViewRef = useRef<View>(null);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    try {
      const [photos, me] = await Promise.all([
        api.get('/photos/developed'),
        api.get('/users/me'),
      ]);
      if (me?.avatar_url) setMyAvatarUrl(me.avatar_url);
      setSections(buildSections(photos ?? []));
    } catch (e) {
      console.error('Journal load failed:', e);
    }
    setLoading(false);
    setRefreshing(false);
  }

  function openPhoto(photo: Photo) {
    setSelected(photo);
    setCaption(photo.caption ?? '');
  }

  async function toggleFeed(shareToFeed: boolean) {
    if (!selected) return;
    setSaving(true);

    try {
      await api.patch(`/photos/${selected.id}`, {
        shared_to_feed: shareToFeed,
        caption: shareToFeed ? caption.trim() || null : null,
      });
    } catch {
      Alert.alert('Error', 'Could not update photo.'); setSaving(false); return;
    }

    setSections(prev =>
      prev.map(section => ({
        ...section,
        data: section.data.map(pair =>
          pair.map(p =>
            p?.id === selected.id ? { ...p, shared_to_feed: shareToFeed, caption: caption.trim() || null } : p
          ) as PhotoPair
        ),
      }))
    );
    setSelected(prev => prev ? { ...prev, shared_to_feed: shareToFeed } : null);
    setSaving(false);
  }

  async function downloadPhoto() {
    if (!selected?.signedUrl) return;
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow Candid to save photos to your library.');
      return;
    }
    try {
      if (selected.media_type === 'video') {
        // Can't bake filter into video — download the original file
        const ext = selected.storage_path.split('.').pop() ?? 'mov';
        const localUri = `${FileSystem.cacheDirectory}candid_video.${ext}`;
        await FileSystem.downloadAsync(selected.signedUrl, localUri);
        await MediaLibrary.saveToLibraryAsync(localUri);
      } else {
        // Capture off-screen view (outside Modal) with filter baked in
        const uri = await captureRef(photoViewRef, { format: 'jpg', quality: 0.92 });
        await MediaLibrary.saveToLibraryAsync(uri);
      }
      Alert.alert('Saved', 'Saved to your camera roll.');
    } catch (e) {
      console.error('Save failed:', e);
      Alert.alert('Error', 'Could not save.');
    }
  }

  async function deletePhoto() {
    if (!selected) return;
    Alert.alert('Delete Photo', 'This will permanently delete the photo.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/photos/${selected.id}`);
          } catch {
            Alert.alert('Error', 'Could not delete photo.'); return;
          }
          setSelected(null);
          load();
        },
      },
    ]);
  }

  const renderPhoto = (photo: Photo | null) => {
    if (!photo) return <View style={{ width: CARD_WIDTH }} />;
    return (
      <TouchableOpacity
        style={styles.polaroid}
        onPress={() => openPhoto(photo)}
        activeOpacity={0.85}
      >
        <View style={styles.photoContainer}>
          {photo.signedUrl && photo.media_type !== 'video' ? (
            <FilteredImage uri={photo.signedUrl} width={CARD_WIDTH} height={CARD_WIDTH * (4 / 3)} />
          ) : photo.media_type === 'video' ? (
            <View style={[StyleSheet.absoluteFill, styles.videoThumb]}>
              <Ionicons name="play" size={28} color="rgba(245,240,232,0.85)" />
            </View>
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.photoPlaceholder]}>
              <Ionicons name="image-outline" size={20} color="#333" />
            </View>
          )}
        </View>
        <View style={styles.strip}>
          {photo.media_type === 'video' && (
            <Ionicons name="videocam-outline" size={12} color="#999" style={{ marginRight: photo.shared_to_feed ? 4 : 0 }} />
          )}
          {photo.shared_to_feed && (
            <Ionicons name="people-outline" size={11} color="#999" />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#f5f0e8" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item, index) => `${item[0].id}-${index}`}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#f5f0e8" />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>journal</Text>
            <TouchableOpacity onPress={() => router.push('/profile')} style={styles.profileBtn}>
              {myAvatarUrl ? (
                <Image source={{ uri: myAvatarUrl }} style={styles.profileAvatar} />
              ) : (
                <Ionicons name="person-circle-outline" size={26} color="#555" />
              )}
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="book-outline" size={40} color="#333" />
            <Text style={styles.emptyText}>no developed photos yet.</Text>
            <Text style={styles.emptySubtext}>develop a photo to see it here.</Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.dayLabel}>{section.title}</Text>
        )}
        renderItem={({ item: pair }) => (
          <View style={styles.row}>
            {renderPhoto(pair[0])}
            {renderPhoto(pair[1])}
          </View>
        )}
      />

      {/* Off-screen view used by captureRef — must live outside the Modal UIWindow */}
      <View
        ref={photoViewRef}
        collapsable={false}
        pointerEvents="none"
        style={styles.captureView}
      >
        {selected?.signedUrl && selected.media_type !== 'video' && (
          <FilteredImage uri={selected.signedUrl} width={width} height={width * (4 / 3)} />
        )}
      </View>

      {/* Photo detail modal */}
      <Modal visible={!!selected} animationType="fade" onRequestClose={() => setSelected(null)}>
        {selected && (
          <View style={styles.modal}>
            <TouchableOpacity style={styles.modalClose} onPress={() => setSelected(null)}>
              <Ionicons name="close" size={28} color="#f5f0e8" />
            </TouchableOpacity>

            {selected.signedUrl && (
              <View style={styles.modalPhotoContainer}>
                {selected.media_type === 'video' ? (
                  <>
                    <VideoModalPlayer signedUrl={selected.signedUrl} />
                    <VintageOverlay />
                  </>
                ) : (
                  <FilteredImage uri={selected.signedUrl} width={width} height={screenHeight - 200} />
                )}
              </View>
            )}

            <View style={styles.modalActions}>
              <TextInput
                style={styles.captionInput}
                placeholder="add a caption..."
                placeholderTextColor="#666"
                value={caption}
                onChangeText={setCaption}
                maxLength={200}
              />
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionButton, selected.shared_to_feed && styles.actionButtonActive]}
                  onPress={() => toggleFeed(!selected.shared_to_feed)}
                  disabled={saving}
                >
                  <Ionicons
                    name={selected.shared_to_feed ? 'people' : 'people-outline'}
                    size={16}
                    color={selected.shared_to_feed ? '#0a0a0a' : '#f5f0e8'}
                  />
                  <Text style={[styles.actionButtonText, selected.shared_to_feed && styles.actionButtonTextActive]}>
                    {selected.shared_to_feed ? 'shared' : 'share to feed'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconButton} onPress={downloadPhoto}>
                  <Ionicons name="download-outline" size={16} color="#f5f0e8" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.iconButton} onPress={deletePhoto}>
                  <Ionicons name="trash-outline" size={16} color="#c0392b" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', paddingTop: 60 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: H_PADDING,
    marginBottom: 24,
  },
  title: { fontSize: 28, fontWeight: '300', color: '#f5f0e8', letterSpacing: 4 },
  signOut: { fontSize: 13, color: '#555', letterSpacing: 1 },
  profileBtn: { padding: 2 },
  profileAvatar: { width: 28, height: 28, borderRadius: 14 },
  dayLabel: {
    fontSize: 12,
    color: '#555',
    letterSpacing: 2,
    paddingHorizontal: H_PADDING,
    paddingTop: 20,
    paddingBottom: 10,
  },
  row: { flexDirection: 'row', paddingHorizontal: H_PADDING, gap: GAP, marginBottom: GAP },
  polaroid: {
    width: CARD_WIDTH,
    backgroundColor: '#e8e4dc',
    borderRadius: 2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  photoContainer: { width: CARD_WIDTH, height: CARD_WIDTH * (4 / 3) },
photoPlaceholder: { backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  strip: { height: 30, backgroundColor: '#e8e4dc', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 },
  videoThumb: { backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 80 },
  emptyText: { fontSize: 16, color: '#444', letterSpacing: 1 },
  emptySubtext: { fontSize: 13, color: '#333', letterSpacing: 0.5 },
  // Rendered off-screen so captureRef works outside the Modal UIWindow
  captureView: { position: 'absolute', width, height: width * (4 / 3), left: -(width * 3) },
  modal: { flex: 1, backgroundColor: '#0a0a0a' },
  modalClose: { position: 'absolute', top: 56, right: 20, zIndex: 10, padding: 8 },
  modalPhotoContainer: { flex: 1, marginTop: 60 },
  modalActions: { padding: 20, gap: 12 },
  captionInput: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#252525',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#f5f0e8',
    fontSize: 14,
  },
  actionRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#f5f0e8',
    borderRadius: 10,
    paddingVertical: 13,
  },
  actionButtonActive: { backgroundColor: '#f5f0e8' },
  actionButtonText: { color: '#f5f0e8', fontSize: 14, letterSpacing: 1 },
  actionButtonTextActive: { color: '#0a0a0a' },
  iconButton: {
    width: 48,
    height: 48,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
