/**
 * OKLCH colour utilities.
 *
 * Everything in this project is authored in OKLCH and interpolated there. Two
 * reasons, both practical rather than fashionable:
 *
 *  1. The palette is interpolated continuously across 24 hours. sRGB
 *     interpolation muddies through grey; HSL detours through unintended hues.
 *     OKLab is perceptually even, so a 20-second timelapse has no dead spots.
 *  2. Lightness is a separate, meaningful axis. Pinning foreground L while hue
 *     and chroma drift is what keeps text contrast stable all day (see
 *     `palettes.contrast.test.ts`).
 */

export type Oklch = readonly [l: number, c: number, h: number]
export type RGB = readonly [r: number, g: number, b: number]

const cube = (x: number) => x * x * x

/** OKLCH -> linear sRGB. Values may fall outside [0,1] if out of gamut. */
export function oklchToLinearSrgb([L, C, H]: Oklch): RGB {
  const hr = (H * Math.PI) / 180
  const a = C * Math.cos(hr)
  const b = C * Math.sin(hr)

  const l = cube(L + 0.3963377774 * a + 0.2158037573 * b)
  const m = cube(L - 0.1055613458 * a - 0.0638541728 * b)
  const s = cube(L - 0.0894841775 * a - 1.291485548 * b)

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

const encodeGamma = (c: number) => {
  const x = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  return Math.min(1, Math.max(0, x))
}

/** OKLCH -> gamma-encoded sRGB in [0,1], gamut-clipped. */
export function oklchToSrgb(c: Oklch): RGB {
  const [r, g, b] = oklchToLinearSrgb(c)
  return [encodeGamma(r), encodeGamma(g), encodeGamma(b)]
}

export function oklchToHex(c: Oklch): string {
  const [r, g, b] = oklchToSrgb(c)
  const h = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

export function oklchToCss(c: Oklch, alpha = 1): string {
  const [r, g, b] = oklchToSrgb(c)
  const v = (x: number) => Math.round(x * 255)
  return alpha === 1
    ? `rgb(${v(r)} ${v(g)} ${v(b)})`
    : `rgb(${v(r)} ${v(g)} ${v(b)} / ${alpha})`
}

/**
 * Interpolate in OKLCH, taking the short way round the hue circle.
 *
 * `chromaDip` guards against the failure mode that any hue-arc interpolation
 * has: travelling between two distant hues means passing through every hue in
 * between, and those in-between hues are usually not colours anyone chose.
 *
 * The midday sky sits at hue 232 (blue) and golden hour at 58 (orange). The
 * shortest arc between them runs straight through 145 — green. At two in the
 * afternoon the sky was green, and no contrast test can catch that, because a
 * green sky has exactly the same luminance as the blue one it should have been.
 *
 * The fix is the one a painter would use: desaturate through the transition.
 * Chroma is scaled down toward the midpoint in proportion to how far the hue
 * has to travel, so a wide arc passes through near-neutral rather than through
 * an unintended hue. Narrow arcs are barely affected.
 */
export function mixOklch(a: Oklch, b: Oklch, t: number, chromaDip = 0): Oklch {
  const dh = ((b[2] - a[2]) % 360 + 540) % 360 - 180

  let chroma = a[1] + (b[1] - a[1]) * t
  if (chromaDip > 0) {
    // Triangular weight peaking at the midpoint of the transition.
    const mid = 1 - Math.abs(2 * t - 1)
    chroma *= 1 - (Math.abs(dh) / 180) * mid * chromaDip
  }

  return [a[0] + (b[0] - a[0]) * t, chroma, a[2] + dh * t]
}

/** WCAG 2.1 relative luminance from an OKLCH colour. */
export function relativeLuminance(c: Oklch): number {
  const lin = (v: number) => {
    const x = Math.min(1, Math.max(0, v))
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
  }
  // Round-trip through gamma-encoded sRGB so out-of-gamut colours are measured
  // as they will actually be displayed, not as their unclipped ideal.
  const [r, g, b] = oklchToSrgb(c)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG 2.1 contrast ratio, 1..21. */
export function contrastRatio(a: Oklch, b: Oklch): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Alpha-composite `top` over `bottom` the way the browser will: in
 * gamma-encoded sRGB, not in linear light or OKLab. Used so the contrast test
 * measures the control chip as actually rendered rather than as authored.
 */
export function compositeOver(top: Oklch, alpha: number, bottom: Oklch): RGB {
  const t = oklchToSrgb(top)
  const b = oklchToSrgb(bottom)
  return [
    t[0] * alpha + b[0] * (1 - alpha),
    t[1] * alpha + b[1] * (1 - alpha),
    t[2] * alpha + b[2] * (1 - alpha),
  ]
}

const linearise = (v: number) => {
  const x = Math.min(1, Math.max(0, v))
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
}

export const luminanceSrgb = ([r, g, b]: RGB) =>
  0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b)

export function contrastSrgb(a: RGB, b: RGB): number {
  const la = luminanceSrgb(a)
  const lb = luminanceSrgb(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * Allocation-free OKLCH -> linear sRGB, for use inside the render loop.
 *
 * The array-returning version above allocates on every call. At sixty frames a
 * second across a handful of lights and materials that is thousands of tiny
 * arrays a minute, and the resulting GC sawtooth is exactly the kind of
 * periodic stutter that ruins a scene whose whole point is calm.
 */
export function oklchToLinearSrgbInto(c: Oklch, out: [number, number, number]) {
  const hr = (c[2] * Math.PI) / 180
  const a = c[1] * Math.cos(hr)
  const b = c[1] * Math.sin(hr)
  const L = c[0]

  let l = L + 0.3963377774 * a + 0.2158037573 * b
  let m = L - 0.1055613458 * a - 0.0638541728 * b
  let s = L - 0.0894841775 * a - 1.291485548 * b
  l = l * l * l
  m = m * m * m
  s = s * s * s

  out[0] = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  out[1] = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  out[2] = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  return out
}

/**
 * Contrast against a colour that has been darkened by the scrim.
 *
 * The backdrop shader multiplies the sky by (1 - halo) in linear light before
 * anything is drawn on top of it, so a contrast test that measures the raw
 * palette colour is measuring a sky nobody ever sees. Relative luminance is
 * already linear, so the multiply applies directly to it.
 */
export function contrastBehindScrim(fg: Oklch, bg: Oklch, halo: number): number {
  const lf = relativeLuminance(fg)
  const lb = relativeLuminance(bg) * (1 - halo)
  const [hi, lo] = lf > lb ? [lf, lb] : [lb, lf]
  return (hi + 0.05) / (lo + 0.05)
}
