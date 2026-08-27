import { clamp01 } from '@/lib/clamp'
import type { Palette } from '@/types'

/**
 * Where the light appears to be coming from, in normalised screen space.
 *
 * Both the CSS gradient and the backdrop shader draw the same warm spot in the
 * sky, and they have to agree exactly or the canvas fade-in shows a seam. So
 * the mapping lives here rather than being written out twice.
 *
 * Returned with y measured from the BOTTOM, matching GLSL's uv origin. The CSS
 * bridge flips it.
 */
export function sunScreenPosition(p: Palette) {
  return {
    // Azimuth 90deg is due east and sits at the left edge; 270deg due west, right.
    x: clamp01((p.keyAzimuth - 90) / 180),
    // Not a true projection: the horizon is pulled up slightly and the top of
    // the range compressed, because a geometrically correct elevation puts the
    // mid-morning sun visually lower than it reads in a photograph of one.
    y: clamp01((p.keyElevation + 15) / 78),
  }
}

/** How strongly that spot shows. Capped so it never becomes a lens flare. */
export const sunStrength = (p: Palette) => Math.min(0.34, p.keyIntensity * 0.2)
