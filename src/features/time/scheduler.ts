/**
 * A self-correcting boundary scheduler.
 *
 * `setInterval(fn, 1000)` drifts: the callback takes time, browsers throttle
 * background tabs, and the error accumulates. This re-anchors to the wall clock
 * after every tick, so the next fire is aimed at a real second boundary and
 * drift can never compound — including after the tab has been throttled for an
 * hour, where it simply fires late once and then realigns.
 */
export function createBoundaryScheduler(
  onTick: (nowMs: number) => void,
  intervalMs = 1000,
) {
  let handle: ReturnType<typeof setTimeout> | null = null
  let running = false

  const schedule = () => {
    const now = Date.now()
    // +2ms of slack: setTimeout is allowed to fire fractionally early, and
    // landing before the boundary would show the previous second.
    const delay = intervalMs - (now % intervalMs) + 2
    handle = setTimeout(fire, delay)
  }

  const fire = () => {
    if (!running) return
    onTick(Date.now())
    schedule()
  }

  return {
    start() {
      if (running) return
      running = true
      schedule()
    },
    stop() {
      running = false
      if (handle !== null) clearTimeout(handle)
      handle = null
    },
    /** Fire immediately and re-anchor — used when returning from a hidden tab. */
    resync() {
      if (!running) return
      if (handle !== null) clearTimeout(handle)
      onTick(Date.now())
      schedule()
    },
    get running() {
      return running
    },
  }
}
