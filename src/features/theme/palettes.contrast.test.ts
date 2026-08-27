import { describe, expect, it } from 'vitest'
import {
  compositeOver,
  contrastBehindScrim,
  contrastRatio,
  contrastSrgb,
  oklchToSrgb,
} from '@/lib/color'
import type { Oklch, RGB } from '@/lib/color'
import type { Palette } from '@/types'
import { mixOklch } from '@/lib/color'
import { rampAt, resolvePalette } from './resolvePalette'
import { PINNED_DARK, PINNED_LIGHT, RAMP } from './palettes'

/**
 * The palette changes continuously for 24 hours, which means "I checked the
 * colours and they looked fine" is not a claim anyone can honestly make. This
 * walks the entire ramp in 5-minute steps and asserts WCAG AA at every point.
 *
 * If one of these fails, the palette is wrong — not the test.
 */

const STEP_MINUTES = 5
const samples = Array.from(
  { length: (24 * 60) / STEP_MINUTES },
  (_, i) => (i * STEP_MINUTES) / 60,
)

const label = (h: number) =>
  `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`

/** Asserts a ratio across the whole day, reporting every failing timestamp. */
function assertAcrossDay(
  what: string,
  min: number,
  ratio: (p: Palette) => number,
) {
  const failures = samples
    .map((h) => ({ h, r: ratio(rampAt(h)) }))
    .filter((s) => s.r < min)
    .map((s) => `${label(s.h)} = ${s.r.toFixed(2)}:1`)
  expect(
    failures,
    `${what} fell below ${min}:1 at ${failures.length} sample(s):\n${failures.join('\n')}`,
  ).toEqual([])
}

/** The control chip as the browser will actually composite it over the sky. */
const chipOver = (p: Palette, sky: Oklch) => compositeOver(p.surface, p.surfaceAlpha, sky)

/**
 * Chip labels are drawn at less than full opacity, so measuring the authored
 * foreground colour overstates their contrast. This is the value in
 * `global.css`; the two have to move together.
 */
const CHIP_LABEL_OPACITY = 0.85

/** The label as drawn: fg at its real opacity, over the chip, over the sky. */
function chipLabel(p: Palette, sky: Oklch): RGB {
  const chip = chipOver(p, sky)
  const fg = oklchToSrgb(p.fg)
  return [
    fg[0] * CHIP_LABEL_OPACITY + chip[0] * (1 - CHIP_LABEL_OPACITY),
    fg[1] * CHIP_LABEL_OPACITY + chip[1] * (1 - CHIP_LABEL_OPACITY),
    fg[2] * CHIP_LABEL_OPACITY + chip[2] * (1 - CHIP_LABEL_OPACITY),
  ] as RGB
}

describe('palette contrast across the full day', () => {
  it('keeps the digits at AA against the sky directly behind them', () => {
    assertAcrossDay('digit vs scrimmed bgMid', 4.5, (p) =>
      contrastBehindScrim(p.digit, p.bgMid, p.halo),
    )
  })

  it('keeps body foreground at AA against the sky behind it', () => {
    assertAcrossDay('fg vs scrimmed bgMid', 4.5, (p) =>
      contrastBehindScrim(p.fg, p.bgMid, p.halo),
    )
  })

  it('keeps the muted date line at AA — "secondary" is not an excuse for 3:1 text', () => {
    assertAcrossDay('fgMuted vs scrimmed bgMid', 4.5, (p) =>
      contrastBehindScrim(p.fgMuted, p.bgMid, p.halo),
    )
    /*
     * The date line sits at roughly 57% of viewport height. The gradient's mid
     * stop is at 52% and its bottom at 100%, so it catches about a tenth of the
     * horizon colour — and it is close enough beneath the digits to still be
     * inside the scrim at close to full strength. Both numbers are geometry,
     * not taste, and both were wrong on the first attempt.
     */
    assertAcrossDay('fgMuted vs scrimmed lower sky', 4.5, (p) =>
      contrastBehindScrim(p.fgMuted, mixOklch(p.bgMid, p.bgBottom, 0.1), p.halo * 0.88),
    )
  })

  it('keeps the accent usable as a focus ring (3:1, non-text UI)', () => {
    assertAcrossDay('accent vs scrimmed bgMid', 3, (p) =>
      contrastBehindScrim(p.accent, p.bgMid, p.halo),
    )
  })

  /**
   * The controls sit top-right, against the brightest part of the sky. Testing
   * `fg` against `bgTop` directly would be the wrong measurement — nothing
   * renders there uncovered. What renders is the chip, so that is what is
   * measured, composited exactly as CSS will composite it.
   */
  it('keeps control labels readable on the chip over the brightest sky', () => {
    assertAcrossDay('chip label vs chip', 4.5, (p) =>
      contrastSrgb(chipLabel(p, p.bgTop), chipOver(p, p.bgTop)),
    )
  })
})

describe('pinned theme palettes', () => {
  for (const [name, p] of [
    ['light', PINNED_LIGHT],
    ['dark', PINNED_DARK],
  ] as const) {
    it(`${name}: every text pair meets AA`, () => {
      expect(contrastBehindScrim(p.digit, p.bgMid, p.halo)).toBeGreaterThanOrEqual(4.5)
      expect(contrastBehindScrim(p.fg, p.bgMid, p.halo)).toBeGreaterThanOrEqual(4.5)
      expect(contrastBehindScrim(p.fgMuted, p.bgMid, p.halo)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(p.fgMuted, p.bgBottom)).toBeGreaterThanOrEqual(4.5)
      expect(contrastBehindScrim(p.accent, p.bgMid, p.halo)).toBeGreaterThanOrEqual(3)
      expect(
        contrastSrgb(chipLabel(p, p.bgTop), chipOver(p, p.bgTop)),
      ).toBeGreaterThanOrEqual(4.5)
    })
  }
})

describe('ramp continuity', () => {
  it('does not jump across midnight', () => {
    const before = rampAt(23.999)
    const after = rampAt(0.001)
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(before.bgMid[i] - after.bgMid[i])).toBeLessThan(0.05)
    }
  })

  it('sweeps the sun forward through midnight rather than rewinding', () => {
    let prev = rampAt(0).keyAzimuth
    for (let h = 1 / 6; h < 24; h += 1 / 6) {
      const cur = rampAt(h).keyAzimuth
      // Signed shortest-path delta between consecutive samples.
      const delta = ((cur - prev + 540) % 360) - 180
      expect(Math.abs(delta)).toBeLessThan(20)
      prev = cur
    }
  })

  it('theme blend of 0 is exactly the ramp', () => {
    expect(resolvePalette(9, 'dark', 0)).toEqual(rampAt(9))
  })
})

/**
 * Hue is not covered by any contrast assertion, and it is where the ramp went
 * wrong in a way nothing automated noticed: the midday sky sits at hue 232 and
 * golden hour at 58, and the shortest arc between them runs through 145 —
 * green. At two in the afternoon the sky was green for a while, and every
 * contrast test passed the whole time, because a green sky has exactly the same
 * luminance as the blue one it should have been.
 *
 * `mixOklch`'s chroma dip is the fix. This is the test that would have caught
 * it without someone having to look at a screenshot at the right hour.
 */
describe('the ramp never passes through a hue nobody chose', () => {
  const hueOf = ([r, g, b]: readonly [number, number, number]) => {
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const d = max - min
    // Near-neutral colours have no meaningful hue, and near-neutral is exactly
    // what a wide transition is supposed to pass through.
    if (d < 0.02) return null
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    return (h * 60 + 360) % 360
  }

  const GREEN = [80, 165] as const

  for (const key of ['bgTop', 'bgMid', 'bgBottom'] as const) {
    it(`${key} is never green`, () => {
      const green = samples
        .map((h) => ({ h, hue: hueOf(oklchToSrgb(rampAt(h)[key])) }))
        .filter((s) => s.hue !== null && s.hue > GREEN[0] && s.hue < GREEN[1])
        .map((s) => `${label(s.h)} = hue ${s.hue!.toFixed(0)}`)
      expect(green, `${key} entered the green band at:\n${green.join('\n')}`).toEqual([])
    })
  }

  /**
   * The invariant behind the afternoon keyframe. Two stops of the same gradient
   * must never rotate in opposite directions, and no leg may sit near the
   * 180-degree boundary where "shortest arc" is a coin flip — a one-degree
   * change in an authored hue would otherwise send a stop the whole way round
   * the wheel.
   */
  it('rotates every gradient stop the same way, with no leg near 180 degrees', () => {
    const arc = (from: number, to: number) => ((to - from) % 360 + 540) % 360 - 180

    for (let i = 0; i < RAMP.length; i++) {
      const a = RAMP[i]
      const b = RAMP[(i + 1) % RAMP.length]
      const legs = (['bgTop', 'bgMid', 'bgBottom'] as const).map((k) => ({
        k,
        d: arc(a[k][2], b[k][2]),
      }))

      for (const leg of legs) {
        expect(
          Math.abs(leg.d),
          `${a.phase} -> ${b.phase}: ${leg.k} turns ${leg.d.toFixed(0)} degrees, too close to the 180 flip`,
        ).toBeLessThan(140)
      }

    }
  })
})
