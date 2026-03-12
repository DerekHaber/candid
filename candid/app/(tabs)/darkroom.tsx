import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';
import { uploadStore } from '../../lib/uploadStore';
import VintageOverlay from '../components/VintageOverlay';

const { width } = Dimensions.get('window');
const COLUMN_GAP = 12;
const H_PADDING = 16;
const CARD_WIDTH = (width - H_PADDING * 2 - COLUMN_GAP) / 2;

type Photo = {
  id: string;
  storage_path: string;
  develop_at: string;
  created_at: string;
  media_type: string;
  signedUrl?: string;
};

type GridItem = { type: 'photo'; data: Photo } | { type: 'pending'; id: string };

function getTimeRemaining(developAt: string): string {
  const remaining = new Date(developAt).getTime() - Date.now();
  if (remaining <= 0) return 'ready';
  const totalMinutes = Math.ceil(remaining / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function isReady(developAt: string) {
  return new Date(developAt).getTime() <= Date.now();
}

export default function DarkroomScreen() {
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);

  useEffect(() => uploadStore.subscribe(setPendingIds), []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  async function load(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    try {
      const rows = await api.get('/photos/developing');
      setPhotos(rows);
    } catch (e) {
      console.error('Darkroom load failed:', e);
    }
    setLoading(false);
    setRefreshing(false);
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#f5f0e8" />
      </View>
    );
  }

  const readyPhotos = photos.filter(p => isReady(p.develop_at));
  const developingPhotos = photos.filter(p => !isReady(p.develop_at));

  const gridItems: GridItem[] = [
    ...pendingIds.map(id => ({ type: 'pending' as const, id })),
    ...readyPhotos.map(data => ({ type: 'photo' as const, data })),
    ...developingPhotos.map(data => ({ type: 'photo' as const, data })),
  ];

  const isEmpty = photos.length === 0 && pendingIds.length === 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>darkroom</Text>
        {(photos.length > 0 || pendingIds.length > 0) && (
          <Text style={styles.subtitle}>
            {[
              pendingIds.length > 0 && `${pendingIds.length} uploading`,
              readyPhotos.length > 0 && `${readyPhotos.length} ready`,
              developingPhotos.length > 0 && `${developingPhotos.length} developing`,
            ].filter(Boolean).join(' · ')}
          </Text>
        )}
      </View>

      {isEmpty ? (
        <View style={styles.emptyState}>
          <Ionicons name="hourglass-outline" size={40} color="#333" />
          <Text style={styles.emptyText}>nothing developing</Text>
          <Text style={styles.emptySubtext}>take some photos and check back soon.</Text>
        </View>
      ) : (
        <FlatList
          data={gridItems}
          keyExtractor={item => item.type === 'pending' ? item.id : item.data.id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          columnWrapperStyle={styles.row}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#f5f0e8" />
          }
          renderItem={({ item }) => {
            if (item.type === 'pending') {
              return (
                <View style={styles.polaroid}>
                  <View style={[styles.photoContainer, styles.photoPlaceholder]}>
                    <ActivityIndicator color="#333" />
                  </View>
                  <View style={styles.strip}>
                    <Text style={styles.countdown}>uploading</Text>
                  </View>
                </View>
              );
            }

            const { data: photo } = item;
            const ready = isReady(photo.develop_at);
            return (
              <TouchableOpacity
                style={styles.polaroid}
                onPress={() => ready && router.push(`/develop/${photo.id}`)}
                activeOpacity={ready ? 0.85 : 1}
                disabled={!ready}
              >
                {/* Photo area */}
                <View style={styles.photoContainer}>
                  {photo.media_type === 'video' ? (
                    <View style={[styles.photo, styles.photoPlaceholder]}>
                      <Ionicons name="videocam-outline" size={24} color="#2a2a2a" />
                    </View>
                  ) : photo.signedUrl ? (
                    <>
                      <Image
                        source={{ uri: photo.signedUrl }}
                        style={styles.photo}
                        resizeMode="cover"
                        blurRadius={ready ? 12 : 22}
                      />
                      <VintageOverlay />
                    </>
                  ) : (
                    <View style={[styles.photo, styles.photoPlaceholder]}>
                      <Ionicons name="film-outline" size={24} color="#2a2a2a" />
                    </View>
                  )}

                  {ready && (
                    <View style={styles.readyBadge}>
                      <Text style={styles.readyBadgeText}>tap to develop</Text>
                    </View>
                  )}
                </View>

                {/* Polaroid white strip */}
                <View style={styles.strip}>
                  {ready ? (
                    <Ionicons name="aperture-outline" size={14} color="#aaa" />
                  ) : (
                    <Text style={styles.countdown}>{getTimeRemaining(photo.develop_at)}</Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    paddingTop: 60,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: H_PADDING,
    marginBottom: 24,
    gap: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: '300',
    color: '#f5f0e8',
    letterSpacing: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#555',
    letterSpacing: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingBottom: 80,
  },
  emptyText: {
    fontSize: 16,
    color: '#444',
    letterSpacing: 1,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#333',
    textAlign: 'center',
    maxWidth: 240,
    lineHeight: 20,
  },
  grid: {
    paddingHorizontal: H_PADDING,
    paddingBottom: 40,
    gap: COLUMN_GAP,
  },
  row: {
    gap: COLUMN_GAP,
  },
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
  photoContainer: {
    width: '100%',
    aspectRatio: 2 / 3,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
readyBadge: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  readyBadgeText: {
    color: '#f5f0e8',
    fontSize: 10,
    letterSpacing: 1,
  },
  strip: {
    height: 36,
    backgroundColor: '#e8e4dc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdown: {
    fontSize: 11,
    color: '#999',
    letterSpacing: 1,
    fontWeight: '300',
  },
});
