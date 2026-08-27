import { describe, expect, it } from 'vitest'
import { fastParts } from './fastParts'
import { formatTime, zoneOffsetMs } from './formatTime'

/**
 * The scene derives its digits arithmetically instead of through Intl, for
 * render-loop cost. That is a second implementation of something that already
 * works, so it only stays honest if it is pinned against the first one.
 */

const ZONES = [
  'UTC',
  'Asia/Karachi',
  'Asia/Kolkata',      // +05:30
  'Asia/Kathmandu',    // +05:45
  'America/New_York',  // DST
  'Australia/Adelaide',// +09:30 with DST
  'Pacific/Chatham',   // +12:45 / +13:45
]

const INSTANTS = [
  Date.UTC(2025, 0, 1, 0, 0, 0),
  Date.UTC(2025, 0, 1, 12, 0, 0),
  Date.UTC(2025, 5, 15, 23, 59, 59),
  Date.UTC(2025, 2, 9, 6, 59, 59),  // moment before US spring-forward
  Date.UTC(2025, 2, 9, 7, 0, 1),    // moment after
  Date.UTC(2025, 10, 2, 5, 30, 0),  // inside the repeated hour
  Date.UTC(2025, 10, 2, 6, 30, 0),
  Date.UTC(1969, 6, 20, 20, 17, 40), // before the epoch: negative timestamps
]

describe('fastParts agrees with the Intl path', () => {
  for (const timeZone of ZONES) {
    for (const hour12 of [false, true]) {
      it(`${timeZone} ${hour12 ? '12h' : '24h'}`, () => {
        for (const ms of INSTANTS) {
          const local = ms + zoneOffsetMs(timeZone, ms)
          const fast = fastParts(local, hour12)
          const slow = formatTime(ms, { hour12, timeZone })

          expect(`${fast.h0}${fast.h1}`, `hour at ${new Date(ms).toISOString()} in ${timeZone}`)
            .toBe(slow.hour)
          expect(`${fast.m0}${fast.m1}`, `minute at ${new Date(ms).toISOString()} in ${timeZone}`)
            .toBe(slow.minute)
          expect(String(fast.seconds).padStart(2, '0')).toBe(slow.second)
          if (hour12) {
            expect(fast.isPm ? 'PM' : 'AM').toBe(slow.dayPeriod)
          }
        }
      })
    }
  }

  it('walks a full day minute by minute without diverging', () => {
    const timeZone = 'Asia/Kathmandu'
    const base = Date.UTC(2025, 6, 4, 0, 0, 0)
    for (let i = 0; i < 1440; i++) {
      const ms = base + i * 60_000
      const local = ms + zoneOffsetMs(timeZone, ms)
      const fast = fastParts(local, false)
      const slow = formatTime(ms, { hour12: false, timeZone })
      expect(`${fast.h0}${fast.h1}:${fast.m0}${fast.m1}`).toBe(`${slow.hour}:${slow.minute}`)
    }
  })

  it('reports continuous fractions that wrap cleanly', () => {
    const p = fastParts(Date.UTC(2025, 0, 1, 0, 0, 30, 500), false)
    expect(p.secondFraction).toBeCloseTo(0.5, 5)
    expect(p.minuteFraction).toBeCloseTo(30.5 / 60, 5)
    expect(fastParts(Date.UTC(2025, 0, 1, 0, 1, 0, 0), false).minuteFraction).toBe(0)
  })
})
