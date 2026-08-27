import { createBoundaryScheduler } from './scheduler'
import { systemTimeZone, zoneOffsetMs } from './formatTime'

/**
 * The clock engine.
 *
 * There is exactly one number of truth in this application: a UTC timestamp.
 * Everything else — digits, date, sky colour, sun angle — is derived at the
 * point of use.
 *
 * Two consumers, two very different cadences, and keeping them apart is the
 * whole architecture:
 *
 *   React  -> subscribes to `subscribeTick` but snapshots the MINUTE index, so
 *             useSyncExternalStore bails out 59 times out of 60 and the
 *             component tree re-renders roughly once a minute.
 *   WebGL  -> never subscribes at all. It calls `now()` inside useFrame and
 *             writes straight into uniforms. Zero React involvement.
 */

type Listener = () => void

let offsetMs = 0 // server-time correction; 0 until/unless calibrated
let timeZone = systemTimeZone()
let zoneOffset = zoneOffsetMs(timeZone, Date.now())

// "Which displayed minute is this" — zone-shifted so every code path agrees.
let minuteIndex = Math.floor((Date.now() + offsetMs + zoneOffset) / 60000)

const tickListeners = new Set<Listener>()
const resyncListeners = new Set<Listener>()

/** Authoritative current instant, in UTC milliseconds. */
export const now = () => Date.now() + offsetMs

/**
 * Current instant shifted into the displayed zone. Plain arithmetic — the
 * expensive Intl offset lookup happens once a minute, not once a frame.
 */
export const localNow = () => now() + zoneOffset

export const getTimeZone = () => timeZone
export const getMinuteIndex = () => minuteIndex
export const getServerOffset = () => offsetMs

function refreshZoneOffset(atMs: number) {
  // Recomputed every tick so DST transitions are picked up within a second
  // without any special-case handling.
  zoneOffset = zoneOffsetMs(timeZone, atMs)
}

export function setTimeZone(tz: string) {
  if (tz === timeZone) return
  timeZone = tz
  refreshZoneOffset(now())
  emitResync()
  tickListeners.forEach((l) => l())
}

export function setServerOffset(ms: number) {
  offsetMs = ms
  refreshZoneOffset(now())
  emitResync()
}

function emitResync() {
  minuteIndex = Math.floor(localNow() / 60000)
  resyncListeners.forEach((l) => l())
  tickListeners.forEach((l) => l())
}

const scheduler = createBoundaryScheduler((wall) => {
  const t = wall + offsetMs
  refreshZoneOffset(t)
  const m = Math.floor((t + zoneOffset) / 60000)
  if (m !== minuteIndex) minuteIndex = m
  // Notify unconditionally; React's snapshot equality decides whether the tree
  // actually re-renders.
  tickListeners.forEach((l) => l())
})

/** Per-second notification. Cheap: most ticks end in a bail-out. */
export function subscribeTick(listener: Listener) {
  tickListeners.add(listener)
  return () => void tickListeners.delete(listener)
}

/**
 * Fired when the timeline jumped rather than advanced — tab restored, laptop
 * woken, system clock changed, timezone switched. Animations listen for this
 * and snap to the correct value instead of playing 40 minutes of catch-up.
 */
export function subscribeResync(listener: Listener) {
  resyncListeners.add(listener)
  return () => void resyncListeners.delete(listener)
}

let detachEnv: (() => void) | null = null

export function startClock() {
  if (scheduler.running) return
  refreshZoneOffset(now())
  minuteIndex = Math.floor(localNow() / 60000)
  scheduler.start()

  const resync = () => {
    if (document.visibilityState === 'hidden') return
    refreshZoneOffset(now())
    scheduler.resync()
    emitResync()
  }

  document.addEventListener('visibilitychange', resync)
  window.addEventListener('focus', resync)
  // bfcache restore: without this, a back-navigation shows a frozen clock.
  window.addEventListener('pageshow', resync)

  detachEnv = () => {
    document.removeEventListener('visibilitychange', resync)
    window.removeEventListener('focus', resync)
    window.removeEventListener('pageshow', resync)
  }
}

export function stopClock() {
  scheduler.stop()
  detachEnv?.()
  detachEnv = null
}
