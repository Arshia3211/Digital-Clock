import type { Palette } from '@/types'
import { oklchToCss } from '@/lib/color'
import { sunScreenPosition, sunStrength } from './sunPosition'

/**
 * Bridges the palette into CSS. The DOM overlay and the WebGL scene read the
 * same interpolated struct — one as custom properties, one as uniforms — which
 * is what stops the two layers from looking like separate things stacked on
 * top of each other.
 */
export function applyCssVars(p: Palette, el: HTMLElement = document.documentElement) {
  const s = el.style
  s.setProperty('--bg-top', oklchToCss(p.bgTop))
  s.setProperty('--bg-mid', oklchToCss(p.bgMid))
  s.setProperty('--bg-bottom', oklchToCss(p.bgBottom))
  s.setProperty('--fg', oklchToCss(p.fg))
  s.setProperty('--fg-muted', oklchToCss(p.fgMuted))
  s.setProperty('--accent', oklchToCss(p.accent))
  s.setProperty('--digit', oklchToCss(p.digit))
  s.setProperty('--surface', oklchToCss(p.surface, p.surfaceAlpha))
  s.setProperty('--surface-strong', oklchToCss(p.surface, Math.min(1, p.surfaceAlpha + 0.22)))
  s.setProperty('--hairline', oklchToCss(p.fg, 0.14))
  s.setProperty('--halo', p.halo.toFixed(3))
  // Selection tint pulled from the FOREGROUND, not the surface. A surface-based
  // highlight is near-white on a near-white chip in the light theme, which makes
  // the selected option invisible — meaning encoded in a colour that is not
  // actually there.
  s.setProperty('--selected', oklchToCss(p.fg, 0.16))
  s.setProperty('--selected-edge', oklchToCss(p.fg, 0.26))

  // The same implied light source the shader draws, so the canvas fade-in has
  // no seam. CSS measures y from the top; sunScreenPosition returns it from the
  // bottom, like GLSL.
  const sun = sunScreenPosition(p)
  s.setProperty('--sun-x', (sun.x * 100).toFixed(1) + '%')
  s.setProperty('--sun-y', ((1 - sun.y) * 100).toFixed(1) + '%')
  s.setProperty('--sun-color', oklchToCss(p.keyLight, sunStrength(p) * 1.4))

  // Let native UI (scrollbars, focus rings, form controls) match the sky.
  el.style.colorScheme = p.fg[0] > p.bgMid[0] ? 'dark' : 'light'
  el.dataset.phase = p.phase
}
