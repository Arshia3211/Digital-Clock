/**
 * Converts a WOFF/TTF into a three.js `typeface.json`, subsetted to only the
 * glyphs the clock can ever render. Full-alphabet typeface files run 200-400KB;
 * thirteen glyphs comes in around 10KB.
 *
 * Outline command order matters: three's FontLoader reads curves as
 * `q endX endY ctrlX ctrlY` and `b endX endY c1X c1Y c2X c2Y` — end point FIRST.
 */
import opentype from 'opentype.js'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = resolve(root, 'node_modules/@fontsource/outfit/files/outfit-latin-700-normal.woff')
const OUT = resolve(root, 'public/fonts/outfit-clock.typeface.json')

// digits + colon + AM/PM letters + space
const CHARS = [...'0123456789:APM ']

const r = (n) => Math.round(n)

function outline(path) {
  const out = []
  for (const c of path.commands) {
    switch (c.type) {
      case 'M': out.push('m', r(c.x), r(c.y)); break
      case 'L': out.push('l', r(c.x), r(c.y)); break
      case 'Q': out.push('q', r(c.x), r(c.y), r(c.x1), r(c.y1)); break
      case 'C': out.push('b', r(c.x), r(c.y), r(c.x1), r(c.y1), r(c.x2), r(c.y2)); break
      case 'Z': break // three closes subpaths implicitly
    }
  }
  return out.join(' ')
}

const font = opentype.parse(
  readFileSync(SRC).buffer.slice(0) // Buffer -> ArrayBuffer
)

const em = font.unitsPerEm
const glyphs = {}

for (const ch of CHARS) {
  const g = font.charToGlyph(ch)
  if (!g || (g.index === 0 && ch !== ' ')) {
    throw new Error(`missing glyph for ${JSON.stringify(ch)}`)
  }
  const path = g.path ?? g.getPath(0, 0, em)
  const bb = g.getBoundingBox?.() ?? { x1: 0, x2: 0 }
  glyphs[ch] = {
    ha: r(g.advanceWidth),
    x_min: r(bb.x1 || 0),
    x_max: r(bb.x2 || 0),
    o: outline(path),
  }
}

const head = font.tables.head
const data = {
  glyphs,
  familyName: 'OutfitClock',
  ascender: r(font.ascender),
  descender: r(font.descender),
  underlinePosition: r(font.tables.post?.underlinePosition ?? -100),
  underlineThickness: r(font.tables.post?.underlineThickness ?? 50),
  boundingBox: { yMin: r(head.yMin), xMin: r(head.xMin), yMax: r(head.yMax), xMax: r(head.xMax) },
  resolution: em,
  original_font_information: { full_font_name: 'Outfit Bold (subset: 0-9 : A P M)' },
  cssFontWeight: 'bold',
  cssFontStyle: 'normal',
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(data))

const sample = glyphs['8'].o.split(' ').length
console.log(`unitsPerEm=${em}  glyphs=${Object.keys(glyphs).length}  "8" tokens=${sample}`)
console.log(`ha(0)=${glyphs['0'].ha} ha(1)=${glyphs['1'].ha}  (tabular figures: ${glyphs['0'].ha === glyphs['1'].ha ? 'YES' : 'NO'})`)
console.log(`wrote ${OUT} (${(JSON.stringify(data).length / 1024).toFixed(1)} KB)`)
