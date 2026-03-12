import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../lib/api';

export type CommentItem = {
  id: string;
  photo_id: string;
  text: string;
  created_at: string;
  users: { username: string } | null;
};

type Props = {
  photoId: string | null;
  currentUserId: string;
  visible: boolean;
  onClose: () => void;
  onCommentAdded?: (photoId: string, comment: CommentItem) => void;
};

export default function CommentSheet({
  photoId,
  currentUserId,
  visible,
  onClose,
  onCommentAdded,
}: Props) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (visible && photoId) {
      fetchComments();
    } else {
      setComments([]);
      setText('');
    }
  }, [visible, photoId]);

  async function fetchComments() {
    if (!photoId) return;
    setLoading(true);
    try {
      const data = await api.get(`/comments?photoId=${photoId}`);
      setComments(data ?? []);
    } catch (e) {
      console.error('fetchComments failed:', e);
    }
    setLoading(false);
  }

  async function sendComment() {
    if (!text.trim() || !photoId || !currentUserId || sending) return;
    setSending(true);
    const trimmed = text.trim();
    setText('');

    try {
      const comment: CommentItem = await api.post('/comments', { photo_id: photoId, text: trimmed });
      setComments(prev => [...prev, comment]);
      onCommentAdded?.(photoId, comment);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } catch {
      setText(trimmed); // restore on error
    }
    setSending(false);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={styles.dismissArea} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>comments</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#555" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator color="#f5f0e8" style={styles.loader} />
          ) : (
            <FlatList
              ref={listRef}
              data={comments}
              keyExtractor={item => item.id}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <Text style={styles.empty}>no comments yet. be the first!</Text>
              }
              renderItem={({ item }) => (
                <View style={styles.comment}>
                  <Text style={styles.commentUsername}>
                    {item.users?.username ?? 'unknown'}
                  </Text>
                  <Text style={styles.commentText}>{item.text}</Text>
                </View>
              )}
            />
          )}

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="add a comment..."
              placeholderTextColor="#555"
              value={text}
              onChangeText={setText}
              maxLength={300}
              returnKeyType="send"
              onSubmitEditing={sendComment}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
              onPress={sendComment}
              disabled={!text.trim() || sending}
            >
              <Ionicons name="arrow-up" size={18} color="#0a0a0a" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  dismissArea: { flex: 1 },
  sheet: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '70%',
    minHeight: 260,
    borderTopWidth: 1,
    borderColor: '#252525',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#333',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e1e',
  },
  title: {
    color: '#f5f0e8',
    fontSize: 15,
    fontWeight: '300',
    letterSpacing: 2,
  },
  closeBtn: { padding: 4 },
  loader: { marginVertical: 32 },
  list: { flex: 1 },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16,
    flexGrow: 1,
  },
  empty: {
    color: '#444',
    fontSize: 14,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 24,
  },
  comment: { gap: 2 },
  commentUsername: {
    color: '#f5f0e8',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  commentText: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 20,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#1e1e1e',
  },
  input: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    color: '#f5f0e8',
    fontSize: 14,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f5f0e8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.3 },
});
