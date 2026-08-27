import { PNG } from 'pngjs'

const lin = (v) => {
  const x = v / 255
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
}
const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)

const percentile = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * p)))]
}

/**
 * Measures contrast on the PIXELS THE USER ACTUALLY SEES.
 *
 * The palette unit test proves the AUTHORED colours meet AA. It cannot prove
 * the RENDERED ones do, because the renderer multiplies the digit's albedo by
 * whatever the lights are doing — and at 2am the lights are barely doing
 * anything. That gap is where a "verified accessible" palette quietly becomes
 * an unreadable clock.
 *
 * So this reads back the real framebuffer, takes a high percentile of the
 * luminance inside the digit block as the glyph faces and the median of the
 * sky beside it as the background, and computes the WCAG ratio between them.
 */
export function measureClockContrast(pngBuffer, rect, lightOnDark) {
  const img = PNG.sync.read(pngBuffer)
  const at = (x, y) => {
    const i = (img.width * y + x) << 2
    return lum(img.data[i], img.data[i + 1], img.data[i + 2])
  }

  const x0 = Math.max(0, Math.round(rect.x))
  const y0 = Math.max(0, Math.round(rect.y))
  const x1 = Math.min(img.width - 1, Math.round(rect.x + rect.width))
  const y1 = Math.min(img.height - 1, Math.round(rect.y + rect.height))

  const inside = []
  for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 2) inside.push(at(x, y))

  // Sky sampled beside the block, at the same height, so any vertical gradient
  // is compared like for like.
  const bandW = Math.max(12, Math.round(rect.width * 0.25))
  const sxStart = Math.max(0, x0 - bandW - 8)
  const sky = []
  for (let y = y0; y <= y1; y += 2)
    for (let x = sxStart; x < Math.max(sxStart + bandW, 1); x += 2) sky.push(at(x, y))

  // Glyphs cover roughly 40% of the block, so the top/bottom sixth of the
  // luminance distribution is comfortably inside a glyph face rather than on an
  // antialiased edge or a specular highlight.
  const ink = lightOnDark ? percentile(inside, 0.86) : percentile(inside, 0.14)
  const bg = percentile(sky, 0.5)

  const hi = Math.max(ink, bg)
  const lo = Math.min(ink, bg)
  return {
    ratio: (hi + 0.05) / (lo + 0.05),
    inkLuminance: ink,
    bgLuminance: bg,
  }
}
