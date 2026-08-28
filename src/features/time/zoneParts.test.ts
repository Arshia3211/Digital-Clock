import { describe, expect, it } from 'vitest'
import { zoneParts, zoneTimeOfDay } from './zoneParts'
import { formatTime } from './formatTime'

/**
 * This suite began life guarding an arithmetic shortcut against the Intl path
 * it duplicated. The shortcut is gone; the suite stayed, because what it really
 * asserts is that the lean per-frame reader agrees with the full formatter the
 * visible clock uses — across half-hour and quarter-hour zones, both DST
 * transitions, and the repeated hour where one wall time maps to two instants.
 */

const ZONES = [
  'UTC',
  'Asia/Karachi',
  'Asia/Calcutta',      // +05:30
  'Asia/Katmandu',      // +05:45
  'America/New_York',   // DST
  'Australia/Adelaide', // +09:30 with DST
  'Pacific/Chatham',    // +12:45 / +13:45
  'Pacific/Kiritimati', // +14, the far side of the line
]

const INSTANTS = [
  Date.UTC(2026, 0, 1, 0, 0, 0),
  Date.UTC(2026, 0, 1, 12, 0, 0),
  Date.UTC(2026, 5, 15, 23, 59, 59),
  Date.UTC(2026, 2, 8, 6, 59, 59), // moment before US spring-forward
  Date.UTC(2026, 2, 8, 7, 0, 1),   // moment after
  Date.UTC(2026, 10, 1, 5, 30, 0), // inside the repeated hour
  Date.UTC(2026, 10, 1, 6, 30, 0),
  Date.UTC(1969, 6, 20, 20, 17, 40), // before the epoch
]

describe('zoneParts agrees with the full formatter', () => {
  for (const timeZone of ZONES) {
    for (const hour12 of [false, true]) {
      it(`${timeZone} ${hour12 ? '12h' : '24h'}`, () => {
        for (const ms of INSTANTS) {
          const fast = zoneParts(ms, timeZone, hour12)
          const slow = formatTime(ms, { hour12, timeZone })
          const where = `${new Date(ms).toISOString()} in ${timeZone}`

          expect(`${fast.h0}${fast.h1}`, `hour at ${where}`).toBe(slow.hour)
          expect(`${fast.m0}${fast.m1}`, `minute at ${where}`).toBe(slow.minute)
          expect(`${fast.s0}${fast.s1}`, `second at ${where}`).toBe(slow.second)
          if (hour12) expect(fast.isPm ? 'PM' : 'AM').toBe(slow.dayPeriod)
        }
      })
    }
  }

  it('walks a full day minute by minute without diverging', () => {
    const timeZone = 'Asia/Katmandu'
    const base = Date.UTC(2026, 6, 4, 0, 0, 0)
    for (let i = 0; i < 1440; i++) {
      const ms = base + i * 60_000
      const f = zoneParts(ms, timeZone, false)
      const s = formatTime(ms, { hour12: false, timeZone })
      expect(`${f.h0}${f.h1}:${f.m0}${f.m1}`).toBe(`${s.hour}:${s.minute}`)
    }
  })

  it('crosses a DST boundary second by second', () => {
    const timeZone = 'America/New_York'
    // 30 minutes spanning the spring-forward instant.
    const base = Date.UTC(2026, 2, 8, 6, 45, 0)
    for (let i = 0; i < 1800; i += 7) {
      const ms = base + i * 1000
      const f = zoneParts(ms, timeZone, false)
      const s = formatTime(ms, { hour12: false, timeZone })
      expect(`${f.h0}${f.h1}:${f.m0}${f.m1}:${f.s0}${f.s1}`)
        .toBe(`${s.hour}:${s.minute}:${s.second}`)
    }
  })
})

describe('sub-second precision, which Intl does not provide', () => {
  it('reports fractions that wrap cleanly', () => {
    const p = zoneParts(Date.UTC(2026, 0, 1, 0, 0, 30, 500), 'UTC', false)
    expect(p.secondFraction).toBeCloseTo(0.5, 5)
    expect(p.minuteFraction).toBeCloseTo(30.5 / 60, 5)
    expect(zoneParts(Date.UTC(2026, 0, 1, 0, 1, 0, 0), 'UTC', false).minuteFraction).toBe(0)
  })

  it('is continuous across a second boundary', () => {
    const at = Date.UTC(2026, 0, 1, 9, 30, 12)
    const before = zoneParts(at + 999, 'UTC', false)
    expect(before.seconds).toBe(12)
    expect(before.secondFraction).toBeCloseTo(0.999, 3)
    const after = zoneParts(at + 1000, 'UTC', false)
    expect(after.seconds).toBe(13)
    expect(after.secondFraction).toBe(0)
  })
})

describe('time of day for the palette', () => {
  it('matches the hour and minute the clock is showing', () => {
    for (const tz of ['UTC', 'Asia/Calcutta', 'Pacific/Chatham']) {
      const ms = Date.UTC(2026, 3, 9, 3, 20, 0)
      const h = zoneTimeOfDay(ms, tz)
      const p = zoneParts(ms, tz, false)
      expect(Math.floor(h)).toBe(p.hour24)
      expect(Math.round((h % 1) * 60)).toBe(p.minutes)
    }
  })

  it('stays inside the day', () => {
    for (let i = 0; i < 48; i++) {
      const h = zoneTimeOfDay(Date.UTC(2026, 3, 9) + i * 1800_000, 'Asia/Katmandu')
      expect(h).toBeGreaterThanOrEqual(0)
      expect(h).toBeLessThan(24)
    }
  })
})

describe('the once-per-second cache', () => {
  it('does not leak one zone answer into another', () => {
    const ms = Date.UTC(2026, 3, 9, 12, 0, 0)
    // Same instant, same second — the cache key must include the zone.
    const utc = zoneParts(ms, 'UTC', false)
    const tokyo = zoneParts(ms, 'Asia/Tokyo', false)
    const back = zoneParts(ms, 'UTC', false)
    expect(`${utc.h0}${utc.h1}`).toBe('12')
    expect(`${tokyo.h0}${tokyo.h1}`).toBe('21')
    expect(`${back.h0}${back.h1}`).toBe('12')
  })

  it('serves both formats from one resolve without thrashing', () => {
    const ms = Date.UTC(2026, 3, 9, 15, 0, 0)
    const a = zoneParts(ms, 'UTC', false)
    const b = zoneParts(ms, 'UTC', true)
    expect(`${a.h0}${a.h1}`).toBe('15')
    expect(`${b.h0}${b.h1}`).toBe(' 3')
    expect(b.isPm).toBe(true)
  })
})
