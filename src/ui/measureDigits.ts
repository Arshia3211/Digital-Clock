import type { DigitLayout, Slot, SlotKind } from '@/features/theme/layoutStore'

let ctx: CanvasRenderingContext2D | null = null

/**
 * Where the digits' ink actually sits, as opposed to where their line box does.
 *
 * A CSS line box is taller than the numerals inside it and is not centred on
 * them — the leading is split around the font's ascent and descent, and digits
 * have no descender. Aligning 3D geometry to the line box would leave it
 * visibly low. Canvas `measureText` reports the real ink extents for the same
 * font at the same size, so the 3D digits can be placed on the actual glyphs
 * rather than on an approximation of them.
 */
export function measureDigits(el: HTMLElement): DigitLayout | null {
  const rect = el.getBoundingClientRect()
  if (!rect.width || !rect.height) return null

  const cs = getComputedStyle(el)
  const fontSizePx = parseFloat(cs.fontSize)

  ctx ??= document.createElement('canvas').getContext('2d')
  if (!ctx) return null
  ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`

  const m = ctx.measureText('0')
  // Firefox only shipped fontBoundingBox* relatively recently; fall back to the
  // usual 0.8/0.2 split rather than mis-positioning everything if it is absent.
  const fontAscent = m.fontBoundingBoxAscent || fontSizePx * 0.8
  const fontDescent = m.fontBoundingBoxDescent || fontSizePx * 0.2
  const capHeight = m.actualBoundingBoxAscent || fontSizePx * 0.72

  const halfLeading = (rect.height - (fontAscent + fontDescent)) / 2
  const baselineY = rect.top + halfLeading + fontAscent
  // Numerals sit entirely above the baseline, so their ink centre is half a cap
  // height above it.
  const inkCenterY = baselineY - capHeight / 2

  const slots: Slot[] = []
  for (const child of Array.from(el.children) as HTMLElement[]) {
    const kind = child.dataset.slot as SlotKind | undefined
    if (!kind) continue
    const r = child.getBoundingClientRect()
    // Relative type size, so the scene can mirror the CSS hierarchy without
    // knowing what it is.
    const childSize = parseFloat(getComputedStyle(child).fontSize) || fontSizePx
    slots.push({
      id: child.dataset.slotId ?? String(slots.length),
      kind,
      blank: child.dataset.blank === 'true',
      scale: childSize / fontSizePx,
      centerX: r.left + r.width / 2,
    })
  }

  return {
    slots,
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    fontSizePx,
    inkCenterY,
    inkHeightPx: capHeight,
  }
}

/**
 * Publishes the scrim's position and size to CSS.
 *
 * The WebGL backdrop centres its darkening on the digit block using exactly
 * these numbers. Writing them out as custom properties lets the DOM sky draw
 * the same ellipse in the same place, so the fallback clock is readable under
 * the same bright midday sky the scene handles — rather than being darkened
 * somewhere approximately similar and failing AA by a third.
 *
 * The multipliers are larger than the shader's because a CSS radial-gradient
 * falls off linearly to its edge while the shader uses a gaussian; these are
 * the values that make the two measure the same.
 */
export function publishScrimGeometry(d: DigitLayout) {
  const s = document.documentElement.style
  const cx = d.rect.x + d.rect.width / 2
  const cy = d.inkCenterY
  s.setProperty('--halo-cx', `${cx.toFixed(1)}px`)
  s.setProperty('--halo-cy', `${cy.toFixed(1)}px`)
  s.setProperty('--halo-rx', `${(d.rect.width * 1.9).toFixed(1)}px`)
  s.setProperty('--halo-ry', `${(d.inkHeightPx * 7).toFixed(1)}px`)
}
