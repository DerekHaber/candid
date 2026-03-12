import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type Props = { pointerEvents?: 'none' | 'box-none' };

export default function VintageOverlay({ pointerEvents = 'none' }: Props) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={pointerEvents}>
      {/* Warm golden cast — Kodak Portra-style; boosts warm tones without washing out color */}
      <View style={styles.warm} />

      {/* Deep teal undertone — Lapse's signature shadow split */}
      <View style={styles.teal} />

      {/* Vignette — top + bottom; reduced opacity so color bleeds through */}
      <LinearGradient
        colors={['rgba(0,0,0,0.38)', 'transparent', 'transparent', 'rgba(0,0,0,0.40)']}
        locations={[0, 0.22, 0.75, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Vignette — left + right */}
      <LinearGradient
        colors={['rgba(0,0,0,0.16)', 'transparent', 'transparent', 'rgba(0,0,0,0.16)']}
        locations={[0, 0.2, 0.8, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Golden amber — Lapse's warm film tone; 0.13 is visible but not overpowering
  warm: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(125, 225, 255, 0.03)',
  },
  // Deep teal — Lapse's cool shadow cast; creates a warm-light / cool-shadow split tone
  teal: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 35, 50, 0.10)',
  },
});
