import { BufferGeometry } from 'three'
import { FontLoader, type Font } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import type { DeviceTier } from '@/types'

/**
 * Every glyph the clock can ever show, built once.
 *
 * The naive `<Text3D>` usage rebuilds its geometry whenever the string changes,
 * which for a clock means tearing down and re-extruding text every single
 * minute — an allocation spike on a timer, and a heap that climbs all afternoon
 * on a page specifically designed to be left open.
 *
 * Instead there are fourteen geometries, created at load and never recreated.
 * A digit slot swaps a geometry REFERENCE; nothing is allocated at runtime.
 *
 * They are built at `size: 1`, where one unit is one em — exactly what CSS
 * font-size means — so a slot only has to scale by the DOM font size in world
 * units to match the 2D clock precisely.
 */

export const GLYPHS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':', 'AM', 'PM'] as const
export type Glyph = (typeof GLYPHS)[number]

const FONT_URL = '/fonts/outfit-clock.typeface.json'

export interface GlyphSet {
  geometries: Map<string, BufferGeometry>
  /** Extrusion depth in em, for positioning things relative to the digit face. */
  depth: number
  dispose: () => void
}

const QUALITY: Record<DeviceTier, { curveSegments: number; bevelSegments: number }> = {
  // The three.js default of 12 curve segments is wasteful at these sizes; the
  // difference between 8 and 12 is invisible and halves the triangle count.
  high: { curveSegments: 8, bevelSegments: 3 },
  medium: { curveSegments: 6, bevelSegments: 2 },
  low: { curveSegments: 4, bevelSegments: 1 },
}

const DEPTH = 0.14

let pending: Promise<GlyphSet> | null = null

async function build(tier: DeviceTier): Promise<GlyphSet> {
  const res = await fetch(FONT_URL)
  if (!res.ok) throw new Error(`glyph font ${res.status}`)
  const font: Font = new FontLoader().parse(await res.json())

  const q = QUALITY[tier]
  const geometries = new Map<string, BufferGeometry>()

  for (const g of GLYPHS) {
    const geo = new TextGeometry(g, {
      font,
      size: 1,
      depth: DEPTH,
      curveSegments: q.curveSegments,
      bevelEnabled: true,
      // A hard 90-degree edge on a letterform this chunky reads as untouched
      // default geometry. A small bevel catching a highlight reads as designed.
      bevelThickness: 0.012,
      bevelSize: 0.012,
      bevelOffset: 0,
      bevelSegments: q.bevelSegments,
    })

    geo.computeBoundingBox()
    const bb = geo.boundingBox!
    // Centre horizontally on the glyph's own ink, matching CSS `text-align:
    // center` inside a fixed-width cell — so a narrow "1" sits centred in its
    // slot instead of hugging the left edge.
    //
    // Y is left alone: TextGeometry already puts the baseline at zero, and every
    // slot shares one baseline. Z is centred so the block rotates about its
    // middle rather than its front face.
    geo.translate(-(bb.min.x + bb.max.x) / 2, 0, -DEPTH / 2)
    geo.computeBoundingBox()
    geo.computeVertexNormals()

    geometries.set(g, geo)
  }

  return {
    geometries,
    depth: DEPTH,
    dispose: () => {
      geometries.forEach((g) => g.dispose())
      geometries.clear()
    },
  }
}

export function loadGlyphs(tier: DeviceTier): Promise<GlyphSet> {
  pending ??= build(tier)
  return pending
}
