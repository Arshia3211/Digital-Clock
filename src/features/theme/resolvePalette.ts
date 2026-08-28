import type { Palette, ThemeMode } from '@/types'
import { mixOklch } from '@/lib/color'
import type { Oklch } from '@/lib/color'
import { lerp, lerpAngle, smoothstep } from '@/lib/clamp'
import { PINNED_DARK, PINNED_LIGHT, RAMP } from './palettes'

const DAY = 24

/**
 * How hard to desaturate through a wide hue transition. Tuned on the
 * With the afternoon keyframe in place no leg exceeds about 100 degrees, so
 * this is a safety net for the theme crossfades rather than the thing holding
 * the ramp together. It was 0.95 for one commit, and desaturating hard enough
 * to hide a 174-degree arc turned out to be treating the symptom.
 */
const CHROMA_DIP = 0.5

function mixPalette(a: Palette, b: Palette, t: number): Palette {
  const c = (ka: keyof Palette) => mixOklch(a[ka] as never, b[ka] as never, t, CHROMA_DIP)
  const n = (kn: keyof Palette) => lerp(a[kn] as number, b[kn] as number, t)
  return {
    phase: t < 0.5 ? a.phase : b.phase,
    at: lerp(a.at, b.at, t),

    bgTop: c('bgTop'),
    bgMid: c('bgMid'),
    bgBottom: c('bgBottom'),
    halo: n('halo'),
    fg: c('fg'),
    fgMuted: c('fgMuted'),
    accent: c('accent'),
    surface: c('surface'),
    surfaceAlpha: n('surfaceAlpha'),

    digit: c('digit'),
    digitEmissive: n('digitEmissive'),

    keyLight: c('keyLight'),
    keyIntensity: n('keyIntensity'),
    keyElevation: n('keyElevation'),
    // The sun sweeps past 360 -> 0 during the night; a plain lerp would send it
    // racing backwards across the sky.
    keyAzimuth: lerpAngle(a.keyAzimuth, b.keyAzimuth, t),

    ambient: c('ambient'),
    ambientIntensity: n('ambientIntensity'),
    rimLight: c('rimLight'),
    rimIntensity: n('rimIntensity'),


    particle: c('particle'),
    particleOpacity: n('particleOpacity'),
    particleSpeed: n('particleSpeed'),
  }
}

/**
 * The ramp, sampled continuously and circularly. `hours` may be any real
 * number; 23:30 interpolates forward into 00:30 rather than rewinding through
 * the whole day.
 */
export function rampAt(hours: number): Palette {
  const h = ((hours % DAY) + DAY) % DAY

  let i = RAMP.length - 1
  for (let k = 0; k < RAMP.length; k++) {
    if (RAMP[k].at > h) {
      i = (k - 1 + RAMP.length) % RAMP.length
      break
    }
  }

  const a = RAMP[i]
  const b = RAMP[(i + 1) % RAMP.length]
  // Wrap the span if it crosses midnight (e.g. dusk 20:00 -> night 00:30).
  const span = (b.at - a.at + DAY) % DAY || DAY
  const elapsed = (h - a.at + DAY) % DAY

  return mixPalette(a, b, smoothstep(elapsed / span))
}

/**
 * `blend` is the theme-override crossfade, driven over ~600ms when the user
 * cycles the theme. At 0 the ramp is showing; at 1 the pinned palette is.
 */
export function resolvePalette(hours: number, mode: ThemeMode, blend = 1): Palette {
  const ramp = rampAt(hours)
  if (mode === 'auto' || blend <= 0) return ramp
  const pinned = mode === 'dark' ? PINNED_DARK : PINNED_LIGHT
  return blend >= 1 ? pinned : mixPalette(ramp, pinned, blend)
}

/**
 * Just the three sky stops at a given hour.
 *
 * `rampAt` interpolates twenty-six fields — light angles, intensities, particle
 * speeds — all of which are wasted work when the caller only wants to paint a
 * 38x26 pixel gradient. The zone picker draws one of these per row and
 * re-renders every second, so the difference is worth a second function.
 */
export function skyAt(hours: number): { top: Oklch; mid: Oklch; bottom: Oklch } {
  const h = ((hours % DAY) + DAY) % DAY

  let i = RAMP.length - 1
  for (let k = 0; k < RAMP.length; k++) {
    if (RAMP[k].at > h) {
      i = (k - 1 + RAMP.length) % RAMP.length
      break
    }
  }

  const a = RAMP[i]
  const b = RAMP[(i + 1) % RAMP.length]
  const span = (b.at - a.at + DAY) % DAY || DAY
  const t = smoothstep(((h - a.at + DAY) % DAY) / span)

  return {
    top: mixOklch(a.bgTop, b.bgTop, t, CHROMA_DIP),
    mid: mixOklch(a.bgMid, b.bgMid, t, CHROMA_DIP),
    bottom: mixOklch(a.bgBottom, b.bgBottom, t, CHROMA_DIP),
  }
}
