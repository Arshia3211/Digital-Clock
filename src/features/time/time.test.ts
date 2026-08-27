import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatTime, isoInZone, zoneOffsetMs } from './formatTime'
import { DAY_MS, phaseAt, timeOfDayFrom } from './timeOfDay'
import { createBoundaryScheduler } from './scheduler'

const utc = (...a: [number, number, number?, number?, number?, number?, number?]) =>
  Date.UTC(...a)

describe('12/24-hour formatting', () => {
  const at = (ms: number, hour12: boolean) => formatTime(ms, { hour12, timeZone: 'UTC' })

  it('renders noon as 12 PM, not 00 PM', () => {
    const t = at(utc(2025, 0, 15, 12, 0, 0), true)
    expect(t.hour).toBe('12')
    expect(t.dayPeriod).toBe('PM')
  })

  it('renders midnight as 12 AM in 12-hour mode', () => {
    const t = at(utc(2025, 0, 15, 0, 0, 0), true)
    expect(t.hour).toBe('12')
    expect(t.dayPeriod).toBe('AM')
  })

  it('renders midnight as 00 in 24-hour mode, with no day period', () => {
    const t = at(utc(2025, 0, 15, 0, 0, 0), false)
    expect(t.hour).toBe('00')
    expect(t.dayPeriod).toBe('')
  })

  it('space-pads single-digit 12-hour values so the slot width never jumps', () => {
    expect(at(utc(2025, 0, 15, 14, 5, 0), true).hour).toBe(' 2')
    expect(at(utc(2025, 0, 15, 22, 5, 0), true).hour).toBe('10')
    // Both are two characters wide: 9 -> 10 must not shift the layout.
    expect(at(utc(2025, 0, 15, 21, 0, 0), true).hour).toHaveLength(2)
    expect(at(utc(2025, 0, 15, 22, 0, 0), true).hour).toHaveLength(2)
  })

  it('zero-pads 24-hour values', () => {
    expect(at(utc(2025, 0, 15, 5, 7, 3), false).hour).toBe('05')
    expect(at(utc(2025, 0, 15, 5, 7, 3), false).minute).toBe('07')
    expect(at(utc(2025, 0, 15, 5, 7, 3), false).second).toBe('03')
  })
})

describe('timezone offsets via Intl', () => {
  it('reads whole-hour zones', () => {
    expect(zoneOffsetMs('UTC', utc(2025, 5, 1))).toBe(0)
    expect(zoneOffsetMs('Asia/Tokyo', utc(2025, 5, 1))).toBe(9 * 3600_000)
  })

  it('reads non-hour zones without special-casing them', () => {
    expect(zoneOffsetMs('Asia/Karachi', utc(2025, 5, 1))).toBe(5 * 3600_000)
    expect(zoneOffsetMs('Asia/Kolkata', utc(2025, 5, 1))).toBe(5.5 * 3600_000)
    expect(zoneOffsetMs('Asia/Kathmandu', utc(2025, 5, 1))).toBe(5.75 * 3600_000)
  })

  it('follows DST spring-forward at the exact instant', () => {
    // 2025-03-09, New York jumps 01:59:59 EST -> 03:00:00 EDT.
    expect(zoneOffsetMs('America/New_York', utc(2025, 2, 9, 6, 59, 59))).toBe(-5 * 3600_000)
    expect(zoneOffsetMs('America/New_York', utc(2025, 2, 9, 7, 0, 0))).toBe(-4 * 3600_000)
  })

  it('handles the ambiguous repeated hour at fall-back', () => {
    // 2025-11-02: 01:00 happens twice in New York, once at -4 and once at -5.
    const first = formatTime(utc(2025, 10, 2, 5, 30), { hour12: false, timeZone: 'America/New_York' })
    const second = formatTime(utc(2025, 10, 2, 6, 30), { hour12: false, timeZone: 'America/New_York' })
    expect(first.hour).toBe('01')
    expect(second.hour).toBe('01')
    // Same wall clock, different real instants — the ISO offsets must differ.
    expect(first.iso).not.toBe(second.iso)
  })

  it('emits ISO 8601 with the correct offset', () => {
    expect(isoInZone(utc(2025, 0, 15, 12, 0, 0), 'UTC')).toBe('2025-01-15T12:00:00Z')
    expect(isoInZone(utc(2025, 0, 15, 12, 0, 0), 'Asia/Kolkata')).toBe('2025-01-15T17:30:00+05:30')
    expect(isoInZone(utc(2025, 0, 15, 12, 0, 0), 'America/New_York')).toBe('2025-01-15T07:00:00-05:00')
  })
})

describe('time of day', () => {
  it('wraps at midnight without a discontinuity in position', () => {
    expect(timeOfDayFrom(0)).toBe(0)
    expect(timeOfDayFrom(DAY_MS - 1)).toBeCloseTo(1, 4)
    expect(timeOfDayFrom(DAY_MS)).toBe(0)
  })

  it('handles negative local times (zones west of UTC before the epoch)', () => {
    expect(timeOfDayFrom(-1)).toBeCloseTo(1, 4)
    expect(timeOfDayFrom(-DAY_MS / 2)).toBeCloseTo(0.5, 6)
  })

  it('names phases at their boundaries', () => {
    expect(phaseAt(0)).toBe('night')
    expect(phaseAt(5)).toBe('dawn')
    expect(phaseAt(9)).toBe('morning')
    expect(phaseAt(13)).toBe('midday')
    expect(phaseAt(18)).toBe('golden')
    expect(phaseAt(21)).toBe('dusk')
    expect(phaseAt(23.5)).toBe('night')
  })
})

describe('boundary scheduler', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('fires on second boundaries and does not accumulate drift', () => {
    vi.setSystemTime(new Date(utc(2025, 0, 15, 12, 0, 0, 0)))
    const seen: number[] = []
    const s = createBoundaryScheduler((ms) => seen.push(ms))
    s.start()

    vi.advanceTimersByTime(10_000)
    s.stop()

    expect(seen.length).toBeGreaterThanOrEqual(9)
    // Every tick lands within a few ms after a real second boundary. A naive
    // setInterval would slide further out with each iteration.
    for (const ms of seen) expect(ms % 1000).toBeLessThan(10)
  })

  it('re-anchors instead of catching up after the tab was throttled', () => {
    vi.setSystemTime(new Date(utc(2025, 0, 15, 12, 0, 0, 0)))
    const seen: number[] = []
    const s = createBoundaryScheduler((ms) => seen.push(ms))
    s.start()
    vi.advanceTimersByTime(1000)
    seen.length = 0

    // Simulate 40 minutes of throttling: the clock moved, timers did not.
    vi.setSystemTime(new Date(utc(2025, 0, 15, 12, 40, 0, 0)))
    vi.advanceTimersByTime(1000)

    // One late tick, then straight back onto the boundary — not 2400 replays.
    expect(seen.length).toBeLessThanOrEqual(2)
    expect(seen[0]).toBeGreaterThanOrEqual(utc(2025, 0, 15, 12, 40, 0, 0))
  })

  it('stops cleanly', () => {
    vi.setSystemTime(new Date(utc(2025, 0, 15, 12, 0, 0, 0)))
    let n = 0
    const s = createBoundaryScheduler(() => n++)
    s.start()
    vi.advanceTimersByTime(3000)
    const at = n
    s.stop()
    vi.advanceTimersByTime(10_000)
    expect(n).toBe(at)
    expect(s.running).toBe(false)
  })
})
