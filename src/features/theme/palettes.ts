import type { Palette } from '@/types'

/**
 * The 24-hour ramp. Single source of truth for every colour and light parameter
 * in the project — the DOM overlay reads it as CSS custom properties, the WebGL
 * scene reads it as uniforms.
 *
 * It is built on one observation about real skies, which the first version got
 * wrong: THE ZENITH STAYS BLUE ALL DAY. Only the horizon swings warm. Painting
 * the whole gradient orange at golden hour is what made the first attempt look
 * like Mars rather than like evening.
 *
 * So the three stops have three different jobs:
 *
 *   bgTop     the zenith. Blue family from dawn to dusk, hue 240-286. It only
 *             changes lightness and chroma; the hue barely moves all day.
 *   bgMid     the band the digits sit in. Moderate, and darkened further by the
 *             halo below.
 *   bgBottom  the horizon, where the warmth lives. Orange at dawn and golden
 *             hour, magenta at dusk, and a near-neutral pale haze in the middle
 *             of the day — which is what a real hazy horizon looks like, and
 *             which also keeps its hue from mattering while it travels between
 *             warm and cool.
 *
 * That last point is structural, not decorative. Rotating a saturated horizon
 * from orange to blue has to cross either green or magenta; letting the chroma
 * fall to almost nothing in the middle of the day means it crosses neither.
 *
 * The other constraint is contrast. A real midday sky is far too bright for
 * light text, and flipping the foreground dark twice a day cannot be done
 * without a window where neither colour reaches AA. So the sky is allowed to be
 * genuinely bright and `halo` — a wide, soft darkening under the clock — scales
 * with it. `palettes.contrast.test.ts` models that multiply exactly, and
 * `npm run shoot` measures the pixels that actually come out.
 */

export const RAMP: readonly Palette[] = [
  {
    phase: 'night',
    at: 0.5,
    bgTop: [0.07, 0.03, 272],
    bgMid: [0.12, 0.042, 266],
    bgBottom: [0.18, 0.05, 262],
    halo: 0.1,
    fg: [0.97, 0.008, 270],
    fgMuted: [0.83, 0.02, 268],
    accent: [0.82, 0.09, 276],
    surface: [0.34, 0.035, 272],
    surfaceAlpha: 0.3,
    digit: [0.94, 0.012, 272],
    digitEmissive: 0.34,
    keyLight: [0.6, 0.05, 262],
    keyIntensity: 0.12,
    keyElevation: -10,
    keyAzimuth: 200,
    ambient: [0.38, 0.04, 268],
    ambientIntensity: 0.4,
    rimLight: [0.8, 0.05, 252],
    rimIntensity: 1,
    particle: [0.86, 0.04, 258],
    particleOpacity: 0.6,
    particleSpeed: 0.35,
  },
  {
    phase: 'dawn',
    at: 5.5,
    bgTop: [0.26, 0.08, 274],
    bgMid: [0.36, 0.075, 300],
    bgBottom: [0.5, 0.115, 30],
    halo: 0.16,
    fg: [0.97, 0.012, 330],
    fgMuted: [0.88, 0.028, 330],
    accent: [0.84, 0.11, 22],
    surface: [0.2, 0.05, 320],
    surfaceAlpha: 0.46,
    digit: [0.95, 0.015, 335],
    digitEmissive: 0.14,
    keyLight: [0.78, 0.11, 38],
    keyIntensity: 0.95,
    keyElevation: 3,
    keyAzimuth: 95,
    ambient: [0.52, 0.05, 300],
    ambientIntensity: 0.55,
    rimLight: [0.7, 0.06, 262],
    rimIntensity: 0.5,
    particle: [0.92, 0.05, 30],
    particleOpacity: 0.45,
    particleSpeed: 0.5,
  },
  {
    phase: 'sunrise',
    at: 7.25,
    bgTop: [0.46, 0.095, 252],
    bgMid: [0.48, 0.078, 240],
    bgBottom: [0.6, 0.075, 48],
    halo: 0.3,
    fg: [0.98, 0.012, 250],
    fgMuted: [0.93, 0.02, 250],
    accent: [0.85, 0.1, 40],
    surface: [0.19, 0.045, 250],
    surfaceAlpha: 0.55,
    digit: [0.96, 0.012, 250],
    digitEmissive: 0.12,
    keyLight: [0.9, 0.08, 52],
    keyIntensity: 1.3,
    keyElevation: 16,
    keyAzimuth: 108,
    ambient: [0.6, 0.045, 250],
    ambientIntensity: 0.57,
    rimLight: [0.7, 0.045, 265],
    rimIntensity: 0.4,
    particle: [0.94, 0.045, 45],
    particleOpacity: 0.36,
    particleSpeed: 0.56,
  },
  {
    phase: 'morning',
    at: 9.5,
    bgTop: [0.62, 0.11, 244],
    bgMid: [0.56, 0.08, 238],
    bgBottom: [0.66, 0.016, 60],
    halo: 0.42,
    fg: [0.985, 0.008, 242],
    fgMuted: [0.955, 0.012, 242],
    accent: [0.84, 0.1, 232],
    surface: [0.16, 0.04, 242],
    surfaceAlpha: 0.62,
    digit: [0.97, 0.01, 242],
    digitEmissive: 0.08,
    keyLight: [0.95, 0.04, 78],
    keyIntensity: 1.6,
    keyElevation: 38,
    keyAzimuth: 128,
    ambient: [0.66, 0.04, 242],
    ambientIntensity: 0.6,
    rimLight: [0.72, 0.03, 242],
    rimIntensity: 0.28,
    particle: [0.96, 0.03, 70],
    particleOpacity: 0.26,
    particleSpeed: 0.65,
  },
  {
    phase: 'midday',
    at: 13,
    bgTop: [0.68, 0.115, 240],
    bgMid: [0.6, 0.085, 234],
    bgBottom: [0.7, 0.012, 62],
    halo: 0.38,
    fg: [0.99, 0.005, 236],
    fgMuted: [0.96, 0.01, 236],
    accent: [0.85, 0.095, 226],
    surface: [0.15, 0.03, 236],
    surfaceAlpha: 0.68,
    digit: [0.98, 0.006, 236],
    digitEmissive: 0.06,
    keyLight: [0.99, 0.015, 92],
    keyIntensity: 1.9,
    keyElevation: 72,
    keyAzimuth: 180,
    ambient: [0.7, 0.03, 236],
    ambientIntensity: 0.65,
    rimLight: [0.74, 0.02, 236],
    rimIntensity: 0.2,
    particle: [0.98, 0.02, 85],
    particleOpacity: 0.18,
    particleSpeed: 0.8,
  },
  {
    phase: 'afternoon',
    at: 15.75,
    bgTop: [0.65, 0.108, 242],
    bgMid: [0.58, 0.08, 232],
    bgBottom: [0.68, 0.03, 72],
    halo: 0.4,
    fg: [0.985, 0.008, 240],
    fgMuted: [0.955, 0.012, 240],
    accent: [0.85, 0.095, 232],
    surface: [0.16, 0.035, 240],
    surfaceAlpha: 0.63,
    digit: [0.975, 0.008, 240],
    digitEmissive: 0.07,
    keyLight: [0.96, 0.05, 74],
    keyIntensity: 1.8,
    keyElevation: 44,
    keyAzimuth: 218,
    ambient: [0.66, 0.035, 240],
    ambientIntensity: 0.6,
    rimLight: [0.72, 0.03, 240],
    rimIntensity: 0.26,
    particle: [0.97, 0.03, 66],
    particleOpacity: 0.24,
    particleSpeed: 0.66,
  },
  {
    phase: 'golden',
    at: 18,
    bgTop: [0.48, 0.1, 258],
    bgMid: [0.5, 0.06, 330],
    bgBottom: [0.6, 0.14, 45],
    halo: 0.32,
    fg: [0.98, 0.014, 40],
    fgMuted: [0.92, 0.025, 40],
    accent: [0.86, 0.13, 62],
    surface: [0.18, 0.05, 340],
    surfaceAlpha: 0.55,
    digit: [0.96, 0.016, 45],
    digitEmissive: 0.1,
    keyLight: [0.88, 0.13, 45],
    keyIntensity: 1.6,
    keyElevation: 8,
    keyAzimuth: 256,
    ambient: [0.58, 0.07, 320],
    ambientIntensity: 0.5,
    rimLight: [0.68, 0.06, 30],
    rimIntensity: 0.45,
    particle: [0.95, 0.06, 55],
    particleOpacity: 0.5,
    particleSpeed: 0.45,
  },
  {
    phase: 'dusk',
    at: 20.5,
    bgTop: [0.22, 0.085, 286],
    bgMid: [0.28, 0.105, 328],
    bgBottom: [0.34, 0.12, 350],
    halo: 0.16,
    fg: [0.97, 0.012, 320],
    fgMuted: [0.84, 0.03, 320],
    accent: [0.83, 0.12, 330],
    surface: [0.2, 0.06, 320],
    surfaceAlpha: 0.46,
    digit: [0.95, 0.015, 320],
    digitEmissive: 0.2,
    keyLight: [0.72, 0.12, 22],
    keyIntensity: 0.45,
    keyElevation: -4,
    keyAzimuth: 274,
    ambient: [0.46, 0.06, 310],
    ambientIntensity: 0.45,
    rimLight: [0.72, 0.07, 285],
    rimIntensity: 0.7,
    particle: [0.9, 0.05, 320],
    particleOpacity: 0.55,
    particleSpeed: 0.4,
  },
]

/**
 * Pinned palettes for the manual theme override. These sit outside the ramp so
 * "light" can be a genuinely light palette with dark text — the one place in the
 * project where the foreground flips — without the mid-transition contrast
 * problem described above, because it is a discrete user-chosen state rather
 * than a value the clock passes through twice a day.
 */
export const PINNED_DARK: Palette = {
  ...RAMP[0],
  phase: 'night',
  // Lifted off the ramp's deepest-night anchor. That anchor is correct for 00:30
  // — it is meant to be nearly black, and the eye arrives there gradually. Used
  // as a THEME it is jarring: chosen deliberately in the middle of the
  // afternoon, it reads as a void rather than as a night sky.
  bgTop: [0.14, 0.04, 274],
  bgMid: [0.2, 0.05, 268],
  bgBottom: [0.26, 0.055, 262],
  halo: 0.12,
  keyIntensity: 0.45,
  keyElevation: 22,
  keyAzimuth: 215,
  ambientIntensity: 0.6,
  digitEmissive: 0.4,
  particleOpacity: 0.5,
}

export const PINNED_LIGHT: Palette = {
  phase: 'morning',
  at: 9,
  bgTop: [0.97, 0.008, 250],
  bgMid: [0.93, 0.012, 250],
  bgBottom: [0.87, 0.018, 246],
  // Dark text on a light sky needs no scrim; the contrast is the other way up.
  halo: 0,
  fg: [0.26, 0.03, 258],
  fgMuted: [0.46, 0.03, 256],
  accent: [0.52, 0.14, 262],
  surface: [1, 0.002, 250],
  surfaceAlpha: 0.72,
  digit: [0.3, 0.035, 258],
  digitEmissive: 0.0,
  keyLight: [0.99, 0.01, 90],
  keyIntensity: 1.35,
  keyElevation: 42,
  keyAzimuth: 145,
  ambient: [0.9, 0.01, 250],
  ambientIntensity: 0.85,
  rimLight: [0.8, 0.02, 250],
  rimIntensity: 0.25,
  particle: [0.55, 0.04, 250],
  particleOpacity: 0.28,
  particleSpeed: 0.6,
}
