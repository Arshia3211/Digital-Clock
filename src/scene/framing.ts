import type { DigitLayout } from '@/features/theme/layoutStore'

export interface Frustum {
  /** World-space extent of the view plane the digits sit on. */
  width: number
  height: number
  /** World units per CSS pixel. */
  unitsPerPixel: number
}

/**
 * The camera is deliberately axis-aligned and never tilts.
 *
 * A tilted camera reads as "physical object on a surface", which is tempting,
 * but it destroys the exact CSS-pixel-to-world mapping that lets the 3D digits
 * land precisely on the DOM ones. The physicality is recovered instead from the
 * bevel, the raking key light and a slight tilt of the digit GROUP toward the
 * cursor — which shows the extrusion sides and reads as more solid than a
 * camera move anyway.
 */
export function frustumAt(distance: number, fovDeg: number, viewportH: number, aspect: number): Frustum {
  const height = 2 * distance * Math.tan((fovDeg * Math.PI) / 360)
  return {
    height,
    width: height * aspect,
    unitsPerPixel: height / viewportH,
  }
}

/** CSS pixel coordinates (viewport origin top-left) -> world XY on the z=0 plane. */
export function pixelToWorld(px: number, py: number, f: Frustum, viewportW: number, viewportH: number) {
  return {
    x: (px / viewportW - 0.5) * f.width,
    y: (0.5 - py / viewportH) * f.height,
  }
}

export interface PlacedSlot {
  id: string
  kind: DigitLayout['slots'][number]['kind']
  blank: boolean
  /** Multiplier on the placement scale for this slot. */
  scale: number
  x: number
  y: number
}

export interface Placement {
  slots: PlacedSlot[]
  /** Uniform scale to apply to unit-sized glyph geometry. */
  scale: number
  centerY: number
  /** Cap height in world units — used to size the halo and the seconds arc. */
  inkHeight: number
}

export function placeDigits(
  layout: DigitLayout,
  f: Frustum,
  viewportW: number,
  viewportH: number,
): Placement {
  const centerY = pixelToWorld(0, layout.inkCenterY, f, viewportW, viewportH).y
  return {
    slots: layout.slots.map((s) => ({
      id: s.id,
      kind: s.kind,
      blank: s.blank,
      scale: s.scale,
      x: pixelToWorld(s.centerX, 0, f, viewportW, viewportH).x,
      y: centerY,
    })),
    // Glyph geometry is built at size 1, where 1 unit == 1 em, which is exactly
    // what CSS font-size means. So the scale is just the font size in world units.
    scale: layout.fontSizePx * f.unitsPerPixel,
    centerY,
    inkHeight: layout.inkHeightPx * f.unitsPerPixel,
  }
}
