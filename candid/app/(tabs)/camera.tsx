import { useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  View,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Animated,
  Text,
  Alert,
  PanResponder,
} from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';
import { uploadStore } from '../../lib/uploadStore';

export default function CameraScreen() {
  if (Platform.OS === 'web') {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>camera is only available on mobile.</Text>
      </View>
    );
  }

  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [flashMode, setFlashMode] = useState<'on' | 'off'>('on');
  const [isCapturing, setIsCapturing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const cameraReadyRef = useRef(false);

  const [zoom, setZoom] = useState(0);

  const cameraRef = useRef<CameraView>(null);
  const flashAnim = useRef(new Animated.Value(0)).current;
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingStartedRef = useRef(false);
  const recordIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastZoomRef = useRef(0.1);
  const lastPinchDistanceRef = useRef<number | null>(null);

  function getPinchDistance(touches: { pageX: number; pageY: number }[]) {
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  const pinchResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length === 2,
      onMoveShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length === 2,
      onPanResponderGrant: () => {
        lastPinchDistanceRef.current = null;
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length !== 2) return;
        const dist = getPinchDistance(touches as any);
        if (lastPinchDistanceRef.current !== null) {
          const delta = (dist - lastPinchDistanceRef.current) / 400;
          const next = Math.min(0.35, Math.max(0, lastZoomRef.current + delta));
          lastZoomRef.current = next;
          setZoom(next);
        }
        lastPinchDistanceRef.current = dist;
      },
      onPanResponderRelease: () => {
        lastPinchDistanceRef.current = null;
      },
    })
  ).current;

  function triggerFlash() {
    Animated.sequence([
      Animated.timing(flashAnim, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(flashAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }

  function onShutterPressIn() {
    if (isCapturing || isRecording || !cameraReadyRef.current) return;
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      recordingStartedRef.current = true;
      startRecording();
    }, 250);
  }

  function onShutterPressOut() {
    if (holdTimerRef.current) {
      // Timer still pending — was a tap
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      takePhoto();
      return;
    }
    if (recordingStartedRef.current) {
      stopRecording();
    }
  }

  async function takePhoto() {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    triggerFlash();
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 1, skipProcessing: true });
      if (!photo) return;
      uploadPhoto(photo.uri);
    } catch {
      Alert.alert('Error', 'Could not take photo. Please try again.');
    } finally {
      setIsCapturing(false);
    }
  }

  async function startRecording() {
    if (!cameraRef.current || !cameraReadyRef.current) return;
    setIsRecording(true);
    setRecordSeconds(0);

    recordIntervalRef.current = setInterval(() => {
      setRecordSeconds(s => s + 1);
    }, 1000);

    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: 10 });
      if (video?.uri) {
        uploadVideo(video.uri);
      }
    } catch (e: any) {
      console.error('Recording error:', e?.message ?? e);
    } finally {
      cleanupRecording();
    }
  }

  function stopRecording() {
    cameraRef.current?.stopRecording();
  }

  function cleanupRecording() {
    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }
    recordingStartedRef.current = false;
    setIsRecording(false);
    setRecordSeconds(0);
  }

  async function uploadPhoto(uri: string) {
    const pendingId = `pending-${Date.now()}`;
    uploadStore.add(pendingId);
    try {
      const filename = `${Date.now()}.jpg`;
      const [compressed, { uploadUrl, storagePath }] = await Promise.all([
        ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 1920 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        ),
        api.post('/photos/upload-url', { filename, contentType: 'image/jpeg' }),
      ]);

      let result = await FileSystem.uploadAsync(uploadUrl, compressed.uri, {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { 'Content-Type': 'image/jpeg' },
      });
      if (result.status >= 500) {
        // Transient R2 error — retry once after a short delay
        await new Promise(r => setTimeout(r, 1500));
        result = await FileSystem.uploadAsync(uploadUrl, compressed.uri, {
          httpMethod: 'PUT',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: { 'Content-Type': 'image/jpeg' },
        });
      }
      if (result.status >= 300) throw new Error(`R2 upload failed: ${result.status}`);

      const photo = await api.post('/photos', { storage_path: storagePath, media_type: 'photo' });

      await Notifications.scheduleNotificationAsync({
        identifier: `develop-${photo.id}`,
        content: { title: 'candid', body: 'your photo is ready to develop ✦', sound: true },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Date.now() + 60 * 60 * 1000) },
      });
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      uploadStore.remove(pendingId);
    }
  }

  async function uploadVideo(uri: string) {
    const pendingId = `pending-${Date.now()}`;
    uploadStore.add(pendingId);
    try {
      const ext = uri.split('.').pop()?.toLowerCase() ?? 'mov';
      const contentType = ext === 'mp4' ? 'video/mp4' : 'video/quicktime';
      const filename = `${Date.now()}.${ext}`;

      const { uploadUrl, storagePath } = await api.post('/photos/upload-url', { filename, contentType });

      let result = await FileSystem.uploadAsync(uploadUrl, uri, {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { 'Content-Type': contentType },
      });
      if (result.status >= 500) {
        await new Promise(r => setTimeout(r, 1500));
        result = await FileSystem.uploadAsync(uploadUrl, uri, {
          httpMethod: 'PUT',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: { 'Content-Type': contentType },
        });
      }
      if (result.status >= 300) throw new Error(`R2 upload failed: ${result.status}`);

      const video = await api.post('/photos', { storage_path: storagePath, media_type: 'video' });

      await Notifications.scheduleNotificationAsync({
        identifier: `develop-${video.id}`,
        content: { title: 'candid', body: 'your video is ready to develop ✦', sound: true },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Date.now() + 60 * 60 * 1000) },
      });
    } catch (error) {
      console.error('Video upload failed:', error);
    } finally {
      uploadStore.remove(pendingId);
    }
  }

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Ionicons name="camera-outline" size={48} color="#444" />
        <Text style={styles.permissionText}>camera access required</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>grant access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const remaining = 10 - recordSeconds;

  return (
    <View style={styles.container} {...pinchResponder.panHandlers}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        mode="video"
        flash={flashMode}
        zoom={zoom}
        onCameraReady={() => {
          cameraReadyRef.current = true;
          setZoom(0.1);
        }}
      />

      {/* White flash overlay */}
      <Animated.View style={[styles.flash, { opacity: flashAnim }]} pointerEvents="none" />

      {/* Recording indicator */}
      {isRecording && (
        <View style={styles.recordingBadge}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingTime}>
            0:{remaining.toString().padStart(2, '0')}
          </Text>
        </View>
      )}

      {/* Hint */}
      {!isRecording && !isCapturing && (
        <Text style={styles.hint}>tap photo · hold video</Text>
      )}

      {/* Zoom presets */}
      <View style={styles.zoomPresets}>
        {([{ label: '.5×', value: 0 }, { label: '1×', value: 0.1 }, { label: '2×', value: 0.2 }] as const).map(preset => {
          const active = Math.abs(zoom - preset.value) < 0.05;
          return (
            <TouchableOpacity
              key={preset.label}
              style={[styles.zoomPreset, active && styles.zoomPresetActive]}
              onPress={() => { setZoom(preset.value); lastZoomRef.current = preset.value; }}
              disabled={isRecording}
            >
              <Text style={[styles.zoomPresetText, active && styles.zoomPresetTextActive]}>
                {preset.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Bottom controls */}
      <View style={styles.controls}>
        {/* Flip — hidden while recording */}
        <TouchableOpacity
          style={styles.sideButton}
          onPress={() => setFacing(f => (f === 'back' ? 'front' : 'back'))}
          disabled={isRecording}
        >
          {!isRecording && <Ionicons name="camera-reverse-outline" size={28} color="#f5f0e8" />}
        </TouchableOpacity>

        {/* Shutter */}
        <Pressable
          style={[
            styles.shutterButton,
            isCapturing && styles.shutterDisabled,
            isRecording && styles.shutterRecording,
          ]}
          onPressIn={onShutterPressIn}
          onPressOut={onShutterPressOut}
          disabled={isCapturing}
        >
          <View style={[styles.shutterInner, isRecording && styles.shutterInnerRecording]} />
        </Pressable>

        {/* Flash toggle — hidden while recording */}
        <TouchableOpacity
          style={styles.sideButton}
          onPress={() => setFlashMode(m => (m === 'on' ? 'off' : 'on'))}
          disabled={isRecording}
        >
          {!isRecording && (
            <Ionicons
              name={flashMode === 'on' ? 'flash' : 'flash-off-outline'}
              size={26}
              color={flashMode === 'on' ? '#f5f0e8' : '#555'}
            />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', justifyContent: 'flex-end' },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: '#fff' },
  recordingBadge: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  recordingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff3b30' },
  recordingTime: { color: '#f5f0e8', fontSize: 13, fontWeight: '300', letterSpacing: 1 },
  hint: {
    color: 'rgba(245,240,232,0.35)',
    fontSize: 11,
    letterSpacing: 1.5,
    textAlign: 'center',
    marginBottom: 6,
  },
  zoomPresets: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  zoomPreset: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  zoomPresetActive: {
    backgroundColor: 'rgba(245,240,232,0.18)',
  },
  zoomPresetText: {
    color: 'rgba(245,240,232,0.5)',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  zoomPresetTextActive: {
    color: '#f5f0e8',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 40,
    paddingBottom: 48,
    paddingTop: 24,
  },
  sideButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  shutterButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: '#f5f0e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterRecording: { borderColor: '#ff3b30' },
  shutterDisabled: { opacity: 0.4 },
  shutterInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f5f0e8',
  },
  shutterInnerRecording: {
    backgroundColor: '#ff3b30',
    borderRadius: 10,
    width: 32,
    height: 32,
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 40,
  },
  permissionText: { color: '#555', fontSize: 15, letterSpacing: 1 },
  permissionButton: {
    backgroundColor: '#f5f0e8',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 8,
  },
  permissionButtonText: { color: '#0a0a0a', fontSize: 15, fontWeight: '600', letterSpacing: 1 },
});
