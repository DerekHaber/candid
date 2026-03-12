import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import EmojiKeyboard from 'rn-emoji-keyboard';

export type ReactionGroup = { emoji: string; count: number; iMine: boolean };

type Props = {
  photoId: string;
  groups: ReactionGroup[];
  currentUserId: string;
  onReact: (photoId: string, emoji: string) => void;
  style?: object;
};

const QUICK_EMOJIS = ['❤️', '😂', '🔥'];

export default function ReactionPicker({ photoId, groups, currentUserId, onReact, style }: Props) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  function handleQuick(emoji: string) {
    onReact(photoId, emoji);
  }

  function handleEmojiSelected(emojiObj: { emoji: string }) {
    onReact(photoId, emojiObj.emoji);
    setKeyboardOpen(false);
  }

  return (
    <View style={[styles.wrapper, style]}>
      <View style={styles.row}>
        {/* Scrollable reaction pills */}
        {groups.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pillsContainer}
          >
            {groups.map(group => (
              <TouchableOpacity
                key={group.emoji}
                style={[styles.pill, group.iMine ? styles.pillMine : styles.pillOther]}
                onPress={() => onReact(photoId, group.emoji)}
                activeOpacity={0.7}
              >
                <Text style={styles.pillEmoji}>{group.emoji}</Text>
                <Text style={[styles.pillCount, group.iMine ? styles.pillCountMine : styles.pillCountOther]}>
                  {group.count}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Quick-add buttons */}
        <View style={styles.quickRow}>
          {QUICK_EMOJIS.map(emoji => (
            <TouchableOpacity
              key={emoji}
              style={styles.quickBtn}
              onPress={() => handleQuick(emoji)}
              activeOpacity={0.7}
            >
              <Text style={styles.quickEmoji}>{emoji}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.plusBtn}
            onPress={() => setKeyboardOpen(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.plusText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Full emoji keyboard — uses its own internal modal */}
      <EmojiKeyboard
        open={keyboardOpen}
        onClose={() => setKeyboardOpen(false)}
        onEmojiSelected={handleEmojiSelected}
        theme={{
          backdrop: 'rgba(0,0,0,0.6)',
          knob: '#555',
          container: '#141414',
          header: '#888',
          skinTonesContainer: '#1e1e1e',
          category: {
            icon: '#888',
            iconActive: '#f5f0e8',
            container: '#141414',
            containerActive: '#252525',
          },
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pillsContainer: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  pillMine: { backgroundColor: '#f5f0e8' },
  pillOther: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#252525' },
  pillEmoji: { fontSize: 14 },
  pillCount: { fontSize: 12, fontWeight: '600' },
  pillCountMine: { color: '#0a0a0a' },
  pillCountOther: { color: '#888' },
  quickRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  quickBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#141414',
  },
  quickEmoji: { fontSize: 16 },
  plusBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    backgroundColor: '#141414',
  },
  plusText: { color: '#888', fontSize: 18, lineHeight: 20 },
});
