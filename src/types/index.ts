import type { Oklch } from '@/lib/color'

export type ThemeMode = 'auto' | 'light' | 'dark'
export type DeviceTier = 'high' | 'medium' | 'low'

/** A formatted instant, ready to render. Never stored — always derived. */
export interface TimeParts {
  /** Two characters, zero-padded in 24h mode, space-padded in 12h mode. */
  hour: string
  minute: string
  second: string
  /** 'AM' | 'PM' in 12-hour mode, '' in 24-hour mode. */
  dayPeriod: string
  /** e.g. "Thursday, 27 August" */
  date: string
  /** e.g. "Thu, 27 Aug" — used below ~360px */
  dateShort: string
  /** Machine-readable ISO 8601, for <time datetime> */
  iso: string
  /** Full sentence for assistive tech, e.g. "2:37 PM, Thursday 27 August" */
  spoken: string
}

export type PhaseName =
  | 'night'
  | 'dawn'
  | 'sunrise'
  | 'morning'
  | 'midday'
  | 'afternoon'
  | 'golden'
  | 'dusk'

/**
 * One keyframe of the 24-hour ramp. Every visible colour and light parameter in
 * the app comes from here — the DOM overlay and the WebGL scene read the same
 * interpolated struct, which is what makes them feel like one object.
 */
export interface Palette {
  phase: PhaseName
  /** Hour of day (0..24) this keyframe is anchored to. */
  at: number

  bgTop: Oklch
  /** The gradient middle stop — the colour actually behind the digits, and
   *  therefore the one the contrast test measures against. */
  bgMid: Oklch
  bgBottom: Oklch

  /**
   * Strength of the soft scrim behind the digits, 0..1.
   *
   * A real midday sky is far too bright for light text, and flipping the
   * foreground to dark twice a day cannot be done without passing through a
   * window where neither colour reaches AA. So the sky is allowed to be
   * genuinely bright and a wide, soft darkening rides underneath the clock —
   * the same thing a designer does when putting white text over a photograph.
   * It scales with sky brightness, which is why it lives in the palette.
   */
  halo: number
  fg: Oklch
  fgMuted: Oklch
  accent: Oklch

  /** Control-chip fill, composited over the sky at `surfaceAlpha`. */
  surface: Oklch
  surfaceAlpha: number

  /** Digit surface colour and how much it self-illuminates when the sun is gone. */
  digit: Oklch
  digitEmissive: number

  keyLight: Oklch
  keyIntensity: number
  /** Degrees above the horizon; drives shadow length and rake. */
  keyElevation: number
  /** Degrees around the vertical axis; drives the warm spot in the sky. */
  keyAzimuth: number

  ambient: Oklch
  ambientIntensity: number
  rimLight: Oklch
  rimIntensity: number


  particle: Oklch
  particleOpacity: number
  particleSpeed: number
}
