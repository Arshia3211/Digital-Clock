/**
 * The clock digits for a given zone, straight from Intl.
 *
 * This replaces an arithmetic fast path that added a cached UTC offset to a
 * timestamp. That path was correct and cross-validated, but it existed on a
 * false premise: `Intl.formatToParts` was assumed to cost ~2ms, which turned
 * out to be the cost of CONSTRUCTING a formatter. A warm one costs 0.0075ms —
 * 0.05% of a 60fps frame. The shortcut was buying nothing and costing a second
 * code path that could silently disagree with the first.
 *
 * Two things keep it genuinely cheap:
 *
 *  1. Hours, minutes and seconds change ONCE PER SECOND, so Intl is called once
 *     per second, not once per frame. The other fifty-nine frames read a cached
 *     struct and do no work at all.
 *  2. The cache holds `hour24` rather than a display hour, so the 12/24-hour
 *     choice is derived arithmetically and never becomes part of the cache key.
 *     Two callers wanting different formats in the same second still share one
 *     Intl call.
 *
 * Sub-second precision, which Intl does not provide, comes from the timestamp's
 * own millisecond remainder. That is zone-independent: every current IANA
 * offset is a whole number of minutes.
 */

export interface ZoneParts {
  /** Two display characters. Space-padded in 12-hour mode so the slot pitch holds. */
  h0: string
  h1: string
  m0: string
  m1: string
  s0: string
  s1: string
  /** 0..59 */
  seconds: number
  minutes: number
  /** 0..23, independent of display format. */
  hour24: number
  isPm: boolean
  /** Continuous position through the current minute, 0..1. */
  minuteFraction: number
  /** Continuous position through the current second, 0..1. */
  secondFraction: number
}

const D = '0123456789'

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      // h23 rather than the en-US default: hour12:false alone still emits "24"
      // for midnight in some ICU builds.
      hourCycle: 'h23',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(timeZone, f)
  }
  return f
}

// One second's worth of resolved values, shared by every caller.
let cacheKey = ''
let cH = 0
let cM = 0
let cS = 0

function resolve(nowMs: number, timeZone: string) {
  const key = `${Math.floor(nowMs / 1000)}|${timeZone}`
  if (key === cacheKey) return

  const parts = formatterFor(timeZone).formatToParts(nowMs)
  for (const p of parts) {
    if (p.type === 'hour') cH = +p.value % 24
    else if (p.type === 'minute') cM = +p.value
    else if (p.type === 'second') cS = +p.value
  }
  cacheKey = key
}

export function zoneParts(
  nowMs: number,
  timeZone: string,
  hour12: boolean,
  out?: ZoneParts,
): ZoneParts {
  resolve(nowMs, timeZone)
  const o = out ?? ({} as ZoneParts)

  const display = hour12 ? ((cH + 11) % 12) + 1 : cH
  const tens = Math.floor(display / 10)

  o.h0 = hour12 && tens === 0 ? ' ' : D[tens]
  o.h1 = D[display % 10]
  o.m0 = D[Math.floor(cM / 10)]
  o.m1 = D[cM % 10]
  o.s0 = D[Math.floor(cS / 10)]
  o.s1 = D[cS % 10]

  o.seconds = cS
  o.minutes = cM
  o.hour24 = cH
  o.isPm = cH >= 12

  const ms = ((nowMs % 1000) + 1000) % 1000
  o.secondFraction = ms / 1000
  o.minuteFraction = (cS + ms / 1000) / 60

  return o
}

/** Position through the local day, in hours (0..24), for the palette ramp. */
export function zoneTimeOfDay(nowMs: number, timeZone: string): number {
  resolve(nowMs, timeZone)
  const ms = ((nowMs % 1000) + 1000) % 1000
  return cH + cM / 60 + (cS + ms / 1000) / 3600
}
