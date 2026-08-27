import type { Palette } from '@/types'
import { hoursFrom, localNow, subscribeResync, subscribeTick, timeOfDayFrom } from '@/features/time'
import { useSettings } from '@/features/settings/settingsStore'
import { mixOklch } from '@/lib/color'
import { resolvePalette } from './resolvePalette'
import { useScrub } from './scrubStore'
import { applyCssVars } from './applyCssVars'

/**
 * Drives the palette, and is deliberately demand-driven rather than always-on.
 *
 * In steady state the ramp moves about 0.001% per frame — completely
 * imperceptible — so there is no reason to hold a requestAnimationFrame loop
 * open for it. The engine simply takes one damped step per second on the clock
 * tick and applies it. The loop only spins up when something is actually moving
 * fast: a theme change, or a drag on the day scrubber.
 *
 * That matters more than it sounds. This is a page people leave open for hours.
 */

const LAMBDA = 5.5 // damping rate; ~99% converged in one second
const APPLY_INTERVAL = 1000 / 12 // CSS custom property writes per second
const SETTLED = 0.0015
const KICK = 0.02

const hoursNow = () =>
  useScrub.getState().hours ?? hoursFrom(timeOfDayFrom(localNow()))

const target = (): Palette => resolvePalette(hoursNow(), useSettings.getState().theme)

let current: Palette = target()

export const getPalette = () => current

/** Distance in the few channels that actually signal "still moving". */
function distance(a: Palette, b: Palette) {
  return (
    Math.abs(a.bgMid[0] - b.bgMid[0]) +
    Math.abs(a.bgMid[1] - b.bgMid[1]) +
    Math.abs(a.fg[0] - b.fg[0]) +
    Math.abs(a.keyIntensity - b.keyIntensity) * 0.2 +
    Math.abs(a.digitEmissive - b.digitEmissive)
  )
}

function step(dt: number) {
  const t = target()
  const k = 1 - Math.exp(-LAMBDA * Math.min(dt, 0.25))
  current = mixPaletteFast(current, t, k)
  return distance(current, t)
}

/** Same maths as resolvePalette's mixer, kept local to avoid re-exporting it. */
function mixPaletteFast(a: Palette, b: Palette, t: number): Palette {
  const c = (k: keyof Palette) => mixOklch(a[k] as never, b[k] as never, t)
  const n = (k: keyof Palette) => (a[k] as number) + ((b[k] as number) - (a[k] as number)) * t
  return {
    phase: b.phase,
    at: n('at'),
    bgTop: c('bgTop'),
    bgMid: c('bgMid'),
    bgBottom: c('bgBottom'),
    halo: n('halo'),
    fg: c('fg'),
    fgMuted: c('fgMuted'),
    accent: c('accent'),
    surface: c('surface'),
    surfaceAlpha: n('surfaceAlpha'),
    digit: c('digit'),
    digitEmissive: n('digitEmissive'),
    keyLight: c('keyLight'),
    keyIntensity: n('keyIntensity'),
    keyElevation: n('keyElevation'),
    keyAzimuth: a.keyAzimuth + (((b.keyAzimuth - a.keyAzimuth) % 360 + 540) % 360 - 180) * t,
    ambient: c('ambient'),
    ambientIntensity: n('ambientIntensity'),
    rimLight: c('rimLight'),
    rimIntensity: n('rimIntensity'),
    particle: c('particle'),
    particleOpacity: n('particleOpacity'),
    particleSpeed: n('particleSpeed'),
  }
}

let raf: number | null = null
let lastFrame = 0
let lastApply = 0

function loop(now: number) {
  const dt = lastFrame ? (now - lastFrame) / 1000 : 1 / 60
  lastFrame = now

  const d = step(dt)

  if (now - lastApply >= APPLY_INTERVAL) {
    applyCssVars(current)
    lastApply = now
  }

  const scrubbing = useScrub.getState().hours !== null
  if (scrubbing || d > SETTLED) {
    raf = requestAnimationFrame(loop)
  } else {
    applyCssVars(current)
    raf = null
    lastFrame = 0
  }
}

/** Spin the loop up. Safe to call repeatedly. */
export function kickPalette() {
  if (raf !== null || document.visibilityState === 'hidden') return
  lastFrame = 0
  raf = requestAnimationFrame(loop)
}

/** Jump straight to the target — used on resync, where animating would be a lie. */
export function snapPalette() {
  current = target()
  applyCssVars(current)
}

export function startPaletteEngine() {
  snapPalette()

  const unsubTick = subscribeTick(() => {
    if (raf !== null) return // the loop is already driving it
    const d = step(1)
    applyCssVars(current)
    if (d > KICK) kickPalette()
  })

  const unsubResync = subscribeResync(snapPalette)
  const unsubTheme = useSettings.subscribe(kickPalette)
  const unsubScrub = useScrub.subscribe(kickPalette)

  const onVisible = () => {
    if (document.visibilityState === 'hidden') {
      if (raf !== null) cancelAnimationFrame(raf)
      raf = null
      lastFrame = 0
    } else {
      snapPalette()
    }
  }
  document.addEventListener('visibilitychange', onVisible)

  return () => {
    unsubTick()
    unsubResync()
    unsubTheme()
    unsubScrub()
    document.removeEventListener('visibilitychange', onVisible)
    if (raf !== null) cancelAnimationFrame(raf)
    raf = null
  }
}
