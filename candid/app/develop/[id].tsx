import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Animated,
  Pressable,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { api } from '../../lib/api';
import VintageOverlay from '../components/VintageOverlay';
import FilteredImage from '../components/FilteredImage';

const { width } = Dimensions.get('window');
const PHOTO_WIDTH = width - 48;
const PHOTO_HEIGHT = PHOTO_WIDTH * (4 / 3);

type Phase = 'loading' | 'pending' | 'developing' | 'developed';

export default function DevelopScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [storagePath, setStoragePath] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'photo' | 'video'>('photo');
  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);

  const progress = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef<Animated.CompositeAnimation | null>(null);
  const blurOpacity = useRef(new Animated.Value(1)).current;

  // Pre-load video as soon as the signed URL is available so it's ready when revealed
  const videoPlayer = useVideoPlayer(
    mediaType === 'video' ? signedUrl : null,
    p => { p.loop = true; p.muted = true; }
  );

  // Start playback the moment the blur finishes revealing the video
  useEffect(() => {
    if (phase === 'developed' && mediaType === 'video') {
      videoPlayer.play();
    }
  }, [phase, mediaType]);

  useEffect(() => {
    fetchPhoto();
  }, [id]);

  async function fetchPhoto() {
    try {
      const data = await api.get(`/photos/${id}`);
      if (!data?.signedUrl) { router.back(); return; }

      setStoragePath(data.storage_path);
      const mt = (data.media_type ?? 'photo') as 'photo' | 'video';
      setMediaType(mt);
      setSignedUrl(data.signedUrl);

      if (mt === 'video') {
        try {
          const { uri: thumb } = await VideoThumbnails.getThumbnailAsync(data.signedUrl, { time: 0 });
          setThumbnailUri(thumb);
        } catch {
          // thumbnail failed — develop screen will show placeholder blur
        }
      }

      setPhase('pending');
    } catch {
      router.back();
    }
  }

  function onPressIn() {
    if (phase !== 'pending') return;
    setPhase('developing');
    progressAnim.current = Animated.timing(progress, {
      toValue: 1,
      duration: 3000,
      useNativeDriver: false,
    });
    progressAnim.current.start(({ finished }) => {
      if (finished) reveal();
    });
  }

  function onPressOut() {
    if (phase !== 'developing') return;
    progressAnim.current?.stop();
    setPhase('pending');
    Animated.timing(progress, { toValue: 0, duration: 300, useNativeDriver: false }).start();
  }

  function reveal() {
    Animated.timing(blurOpacity, {
      toValue: 0,
      duration: 1400,
      useNativeDriver: true,
    }).start(() => setPhase('developed'));
  }

  async function save(shareToFeed: boolean) {
    if (!id) return;
    setSaving(true);

    Notifications.cancelScheduledNotificationAsync(`develop-${id}`).catch(() => {});

    const update: Record<string, unknown> = { developed: true };
    if (shareToFeed) {
      update.shared_to_feed = true;
      if (caption.trim()) update.caption = caption.trim();
    }

    try {
      await api.patch(`/photos/${id}`, update);
    } catch {
      Alert.alert('Error', 'Could not save photo.');
      setSaving(false);
      return;
    }

    if (shareToFeed) {
      api.post('/notify-friends', { photoId: id }).catch(() => {});
    }

    router.replace('/(tabs)/journal');
  }

  async function deletePhoto() {
    Alert.alert('Delete', 'This will permanently delete the media.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/photos/${id}`);
          } catch {
            Alert.alert('Error', 'Could not delete.'); return;
          }
          router.replace('/(tabs)/darkroom');
        },
      },
    ]);
  }

  if (phase === 'loading' || !signedUrl) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#f5f0e8" />
      </View>
    );
  }

  const progressWidth = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const blurSource = mediaType === 'video' ? thumbnailUri : signedUrl;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={28} color="#f5f0e8" />
      </TouchableOpacity>

      <View style={styles.polaroid}>
        <View style={styles.photoContainer}>
          {/* Sharp content underneath */}
          {mediaType === 'video' ? (
            <>
              <VideoView
                player={videoPlayer}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                nativeControls={false}
              />
              <VintageOverlay />
            </>
          ) : (
            <FilteredImage uri={signedUrl} width={PHOTO_WIDTH} height={PHOTO_HEIGHT} />
          )}

          {/* Blur overlay — fades out on develop */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: blurOpacity }]} pointerEvents="none">
            {blurSource ? (
              <Image
                source={{ uri: blurSource }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
                blurRadius={22}
              />
            ) : (
              // Fallback blur for videos with no thumbnail
              <View style={styles.videoBlurFallback}>
                <Ionicons name="videocam" size={40} color="#333" />
              </View>
            )}
            <VintageOverlay />
            <View style={styles.vignette} />
          </Animated.View>
        </View>

        <View style={styles.strip}>
          {(phase === 'pending' || phase === 'developing') && (
            <View style={styles.stripContent}>
              <View style={styles.progressTrack}>
                <Animated.View style={[styles.progressBar, { width: progressWidth }]} />
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.developButton,
                  (phase === 'developing' || pressed) && styles.developButtonActive,
                ]}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
              >
                <Text style={styles.developButtonText}>
                  {phase === 'developing' ? 'hold...' : 'hold to develop'}
                </Text>
              </Pressable>
            </View>
          )}

          {phase === 'developed' && (
            <View style={styles.stripContent}>
              <TextInput
                style={styles.captionInput}
                placeholder="add a caption..."
                placeholderTextColor="#aaa"
                value={caption}
                onChangeText={setCaption}
                maxLength={200}
              />
              <View style={styles.actions}>
                <TouchableOpacity style={styles.shareButton} onPress={() => save(true)} disabled={saving}>
                  <Text style={styles.shareButtonText}>share to feed</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.keepButton} onPress={() => save(false)} disabled={saving}>
                  <Text style={styles.keepButtonText}>keep private</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>

      <TouchableOpacity style={styles.deleteLink} onPress={deletePhoto}>
        <Text style={styles.deleteLinkText}>delete</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  centered: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  backButton: { position: 'absolute', top: 56, left: 16, padding: 8, zIndex: 10 },
  polaroid: {
    width: PHOTO_WIDTH,
    backgroundColor: '#e8e4dc',
    borderRadius: 2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 12,
  },
  photoContainer: { width: PHOTO_WIDTH, height: PHOTO_HEIGHT, overflow: 'hidden' },
videoBlurFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  strip: { backgroundColor: '#e8e4dc', paddingHorizontal: 16, paddingVertical: 14 },
  stripContent: { gap: 12 },
  progressTrack: { height: 2, backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: 1, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: '#333', borderRadius: 1 },
  developButton: { backgroundColor: '#1a1a1a', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  developButtonActive: { backgroundColor: '#333' },
  developButtonText: { color: '#f5f0e8', fontSize: 14, letterSpacing: 2, fontWeight: '500' },
  captionInput: {
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#1a1a1a',
    fontSize: 14,
    letterSpacing: 0.3,
  },
  actions: { flexDirection: 'row', gap: 10 },
  shareButton: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  shareButtonText: { color: '#f5f0e8', fontSize: 13, letterSpacing: 1, fontWeight: '500' },
  keepButton: { flex: 1, borderWidth: 1, borderColor: 'rgba(0,0,0,0.2)', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  keepButtonText: { color: '#555', fontSize: 13, letterSpacing: 1 },
  deleteLink: { marginTop: 20, padding: 8 },
  deleteLinkText: { color: '#555', fontSize: 13, letterSpacing: 1 },
});
