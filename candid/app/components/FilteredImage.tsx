import { useMemo } from 'react';
import { View } from 'react-native';
import {
  Canvas,
  Image,
  useImage,
  Group,
  Rect,
  LinearGradient,
  Turbulence,
  vec,
  Skia,
  TileMode,
} from '@shopify/react-native-skia';

// ─── Color matrix ──────────────────────────────────────────────────────────────
//
//  BASIC         Exposure +0.28 / Contrast +28 → C = 1.10
//                Tone curve S-curve + Blacks -12 → OFS = 0.030 (slight matte lift)
//
//  WHITE BALANCE Temp +12 → R +0.028, B -0.028
//                Tint +7  → G -0.014  (removes green cast, adds magenta)
//
//  VIBRANCE/SAT  Vibrance +22, Saturation +6, HSL net → S = 1.08
//
//  HSL (approx)  Green/Aqua/Blue desaturation net absorbed into S = 1.08 rather
//                than 1.13. Per-hue targeting is not possible in a linear matrix.

const S   = 1.08;
const LR  = 0.299, LG = 0.587, LB = 0.114; // BT.601 luminance
const sr  = (1 - S) * LR, sg = (1 - S) * LG, sb = (1 - S) * LB;
const C   = 1.10;    // exposure + contrast
const OFS = 0.030;   // S-curve matte black lift (5% lift offset by blacks -12)

// prettier-ignore
const FILTER_MATRIX: number[] = [
  (sr+S)*C, sg*C,     sb*C,     0, OFS + 0.028,  // R  (temp +12)
  sr*C,     (sg+S)*C, sb*C,     0, OFS - 0.014,  // G  (tint +7 → magenta)
  sr*C,     sg*C,     (sb+S)*C, 0, OFS - 0.028,  // B  (temp +12)
  0,        0,        0,        1, 0,
];

type Props = {
  uri: string | null | undefined;
  width: number;
  height: number;
};

export default function FilteredImage({ uri, width, height }: Props) {
  const image = useImage(uri ?? null);

  const colorFilter = useMemo(
    () => Skia.ColorFilter.MakeMatrix(FILTER_MATRIX),
    [],
  );

  // Texture +5 / Clarity +6 / Dehaze +2 / Sharpening 20 → near-zero blur
  const softBlur = useMemo(
    () => Skia.ImageFilter.MakeBlur(0.12, 0.12, TileMode.Clamp, null),
    [],
  );

  if (!image) {
    return <View style={{ width, height, backgroundColor: '#1a1a1a' }} />;
  }

  return (
    <Canvas style={{ width, height }} pointerEvents="none">

      {/* ── Base image: graded + clarity ─────────────────────────────────── */}
      <Group colorFilter={colorFilter}>
        <Group imageFilter={softBlur}>
          <Image image={image} x={0} y={0} width={width} height={height} fit="cover" />
        </Group>
      </Group>

      {/* ── Color grading: shadows teal (hue 210, sat 6) ─────────────────── */}
      {/* screen adds most colour to dark/shadow areas */}
      <Group blendMode="screen" opacity={0.06}>
        <Rect x={0} y={0} width={width} height={height} color="rgb(0,50,90)" />
      </Group>

      {/* ── Color grading: midtones warm orange (hue 32, sat 8) ──────────── */}
      {/* overlay peaks at midtones */}
      <Group blendMode="overlay" opacity={0.06}>
        <Rect x={0} y={0} width={width} height={height} color="rgb(255,125,0)" />
      </Group>

      {/* ── Color grading: highlights warm yellow (hue 40, sat 14) ───────── */}
      {/* softLight gently lifts highlights; balance +18 → higher opacity */}
      <Group blendMode="softLight" opacity={0.09}>
        <Rect x={0} y={0} width={width} height={height} color="rgb(255,180,0)" />
      </Group>

      {/* ── Vignette: amount -14, midpoint 40, feather 75 ────────────────── */}
      <Rect x={0} y={0} width={width} height={height}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(0, height)}
          colors={['rgba(0,0,0,0.18)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.18)']}
          positions={[0, 0.28, 0.72, 1]}
        />
      </Rect>
      <Rect x={0} y={0} width={width} height={height}>
        <LinearGradient
          start={vec(0, 0)}
          end={vec(width, 0)}
          colors={['rgba(0,0,0,0.10)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.10)']}
          positions={[0, 0.22, 0.78, 1]}
        />
      </Rect>

      {/* ── Grain: amount 40, size 28, roughness 65 ──────────────────────── */}
      {/* Turbulence gives uneven/rough grain vs FractalNoise smooth grain */}
      <Group blendMode="overlay" opacity={0.25}>
        <Rect x={0} y={0} width={width} height={height}>
          <Turbulence freqX={0.70} freqY={0.70} octaves={3} seed={42} tileWidth={0} tileHeight={0} />
        </Rect>
      </Group>

    </Canvas>
  );
}
