import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActionSheetIOS,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase'; // auth only (signOut)
import { api } from '../lib/api';
import * as FileSystem from 'expo-file-system/legacy';

type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const data = await api.get('/users/me');
      if (data) {
        setProfile(data);
        setDisplayName(data.display_name ?? '');
      }
    } catch (e) {
      console.error('loadProfile failed:', e);
    }
    setLoading(false);
  }

  async function saveProfile() {
    if (!profile) return;
    setSaving(true);

    try {
      await api.patch('/users/me', { display_name: displayName.trim() || null });
      setProfile(prev => prev ? { ...prev, display_name: displayName.trim() || null } : null);
      Alert.alert('Saved', 'Your profile has been updated.');
    } catch {
      Alert.alert('Error', 'Could not save profile.');
    }

    setSaving(false);
  }

  async function pickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to your photo library to set a profile photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return;

    uploadAvatar(result.assets[0].uri);
  }

  async function uploadAvatar(uri: string) {
    if (!profile) return;
    setUploadingAvatar(true);

    try {
      const { uploadUrl, avatarKey } = await api.post('/users/avatar-url', { contentType: 'image/jpeg' });

      const result = await FileSystem.uploadAsync(uploadUrl, uri, {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { 'Content-Type': 'image/jpeg' },
      });
      if (result.status >= 300) throw new Error(`Avatar upload failed: ${result.status}`);

      // Store the R2 key in the DB — the API generates a fresh signed URL on each read
      await api.patch('/users/me', { avatar_url: avatarKey });
      // For immediate local display, fetch a fresh signed URL
      const me = await api.get('/users/me');
      setProfile(prev => prev ? { ...prev, avatar_url: me.avatar_url } : null);
    } catch {
      Alert.alert('Error', 'Could not upload photo.');
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  function confirmDeleteAccount() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: 'Delete account?',
          message: 'This permanently deletes your account and all your photos. This cannot be undone.',
          options: ['Delete my account', 'Cancel'],
          destructiveButtonIndex: 0,
          cancelButtonIndex: 1,
        },
        async (idx) => { if (idx === 0) await deleteAccount(); }
      );
    } else {
      Alert.alert(
        'Delete account?',
        'This permanently deletes your account and all your photos. This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: deleteAccount },
        ]
      );
    }
  }

  async function deleteAccount() {
    try {
      await api.delete('/users/me');
      await supabase.auth.signOut();
    } catch {
      Alert.alert('Error', 'Could not delete account. Please try again.');
    }
  }

  if (loading || !profile) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color="#f5f0e8" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={26} color="#f5f0e8" />
          </TouchableOpacity>
          <Text style={styles.title}>profile</Text>
          <TouchableOpacity onPress={signOut} style={styles.signOutButton}>
            <Text style={styles.signOutText}>sign out</Text>
          </TouchableOpacity>
        </View>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity style={styles.avatarWrapper} onPress={pickAvatar} disabled={uploadingAvatar}>
            {uploadingAvatar ? (
              <View style={styles.avatar}>
                <ActivityIndicator color="#f5f0e8" />
              </View>
            ) : profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarInitial}>
                  {(profile.display_name ?? profile.username)[0].toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.avatarEditBadge}>
              <Ionicons name="camera" size={12} color="#0a0a0a" />
            </View>
          </TouchableOpacity>
          <Text style={styles.username}>@{profile.username}</Text>
        </View>

        {/* Fields */}
        <View style={styles.fields}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>display name</Text>
            <TextInput
              style={styles.fieldInput}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="how friends see your name"
              placeholderTextColor="#444"
              maxLength={40}
            />
            <Text style={styles.fieldHint}>only visible to friends</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>username</Text>
            <View style={styles.fieldInputDisabled}>
              <Text style={styles.fieldInputDisabledText}>@{profile.username}</Text>
            </View>
            <Text style={styles.fieldHint}>used for friend search · cannot be changed yet</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={saveProfile}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#0a0a0a" />
          ) : (
            <Text style={styles.saveButtonText}>save changes</Text>
          )}
        </TouchableOpacity>

        <Link href="/blocked-users" asChild>
          <TouchableOpacity style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>blocked users</Text>
          </TouchableOpacity>
        </Link>

        <TouchableOpacity style={styles.deleteButton} onPress={confirmDeleteAccount}>
          <Text style={styles.deleteButtonText}>delete account</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  centered: { alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingTop: 60, paddingBottom: 40 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 32,
  },
  backButton: { padding: 8, width: 60 },
  title: { fontSize: 22, fontWeight: '300', color: '#f5f0e8', letterSpacing: 4 },
  signOutButton: { width: 60, alignItems: 'flex-end', paddingRight: 8 },
  signOutText: { fontSize: 13, color: '#555', letterSpacing: 0.5 },
  avatarSection: { alignItems: 'center', marginBottom: 40, gap: 10 },
  avatarWrapper: { position: 'relative' },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#1e1e1e',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarInitial: { fontSize: 40, fontWeight: '200', color: '#f5f0e8' },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f5f0e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  username: { fontSize: 14, color: '#555', letterSpacing: 1 },
  fields: { paddingHorizontal: 20, gap: 24, marginBottom: 32 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 11, color: '#555', letterSpacing: 2, textTransform: 'uppercase' },
  fieldInput: {
    backgroundColor: '#141414',
    borderWidth: 1,
    borderColor: '#252525',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#f5f0e8',
    fontSize: 15,
    letterSpacing: 0.3,
  },
  fieldInputDisabled: {
    backgroundColor: '#0e0e0e',
    borderWidth: 1,
    borderColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  fieldInputDisabledText: { color: '#444', fontSize: 15, letterSpacing: 0.3 },
  fieldHint: { fontSize: 11, color: '#333', letterSpacing: 0.5 },
  saveButton: {
    marginHorizontal: 20,
    backgroundColor: '#f5f0e8',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: '#0a0a0a', fontSize: 15, fontWeight: '600', letterSpacing: 1 },
  secondaryButton: { marginTop: 16, marginHorizontal: 20, paddingVertical: 14, alignItems: 'center' },
  secondaryButtonText: { color: '#555', fontSize: 13, letterSpacing: 1 },
  deleteButton: { marginTop: 4, marginHorizontal: 20, paddingVertical: 14, alignItems: 'center' },
  deleteButtonText: { color: '#444', fontSize: 13, letterSpacing: 1 },
});
