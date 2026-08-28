import { createBoundaryScheduler } from './scheduler'
import { systemTimeZone } from './formatTime'

/**
 * The clock engine.
 *
 * There is exactly one number of truth in this application: a UTC timestamp.
 * Everything else — digits, date, sky colour, sun angle — is derived at the
 * point of use, and derived through `Intl` with the selected IANA zone. The
 * engine holds no offset and does no timezone arithmetic of its own.
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

/**
 * Which minute is being displayed.
 *
 * Measured in UTC on purpose. Every current IANA offset is a whole number of
 * minutes, so the displayed minute changes at exactly the same instant in every
 * zone — which makes this a correct change-detector without the store needing
 * to know or care which zone is selected.
 */
let minuteIndex = Math.floor((Date.now() + offsetMs) / 60000)

const tickListeners = new Set<Listener>()
const resyncListeners = new Set<Listener>()

/** Authoritative current instant, in UTC milliseconds. */
export const now = () => Date.now() + offsetMs

export const getTimeZone = () => timeZone
export const getMinuteIndex = () => minuteIndex
export const getServerOffset = () => offsetMs

export function setTimeZone(tz: string) {
  if (tz === timeZone) return
  timeZone = tz
  // The instant has not moved, but everything derived from it has.
  emitResync()
}

export function setServerOffset(ms: number) {
  offsetMs = ms
  emitResync()
}

function emitResync() {
  minuteIndex = Math.floor(now() / 60000)
  resyncListeners.forEach((l) => l())
  tickListeners.forEach((l) => l())
}

const scheduler = createBoundaryScheduler((wall) => {
  const m = Math.floor((wall + offsetMs) / 60000)
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
  minuteIndex = Math.floor(now() / 60000)
  scheduler.start()

  const resync = () => {
    if (document.visibilityState === 'hidden') return
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
