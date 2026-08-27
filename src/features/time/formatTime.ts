import type { TimeParts } from '@/types'

/**
 * All formatting goes through Intl. No manual offset arithmetic anywhere in
 * this project: DST, half-hour zones and historical offset changes are the
 * platform's problem, not ours.
 */

const cache = new Map<string, Intl.DateTimeFormat>()

function fmt(key: string, opts: Intl.DateTimeFormatOptions, locale?: string) {
  // DateTimeFormat construction is expensive; these are reused for the life of
  // the page and only re-created when the user changes format or timezone.
  const k = `${locale ?? ''}|${key}`
  let f = cache.get(k)
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts)
    cache.set(k, f)
  }
  return f
}

export interface FormatOptions {
  hour12: boolean
  timeZone: string
  locale?: string
}

const pick = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) =>
  parts.find((p) => p.type === type)?.value ?? ''

/** The user's own IANA zone. Never inferred from getTimezoneOffset(). */
export const systemTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

/**
 * Milliseconds to add to a UTC instant to get that zone's wall-clock reading.
 * Derived by formatting the instant in the zone and reading it back as UTC,
 * which is the only approach that survives DST and non-hour offsets.
 */
export function zoneOffsetMs(timeZone: string, atMs: number): number {
  const p = fmt(`off:${timeZone}`, {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }, 'en-US').formatToParts(new Date(atMs))

  const n = (t: Intl.DateTimeFormatPartTypes) => Number(pick(p, t))
  // 'en-US' with hour12:false emits hour 24 for midnight; normalise it.
  const hour = n('hour') % 24
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), hour, n('minute'), n('second'))
  return asUtc - Math.floor(atMs / 1000) * 1000
}

export function formatTime(ms: number, o: FormatOptions): TimeParts {
  const d = new Date(ms)
  const { timeZone, hour12, locale } = o
  const tag = `${timeZone}|${hour12}`

  const timeParts = fmt(`t:${tag}`, {
    timeZone,
    hour12,
    hourCycle: hour12 ? 'h12' : 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }, 'en-US').formatToParts(d)

  const rawHour = pick(timeParts, 'hour')
  // In 12-hour mode a leading zero reads as a mistake ("02:15 PM"), but the
  // digit slot still needs two positions or the layout jumps at 9->10.
  const hour = hour12 ? rawHour.replace(/^0/, ' ') : rawHour.padStart(2, '0')

  const dateLong = fmt(`d:${timeZone}`, {
    timeZone, weekday: 'long', day: 'numeric', month: 'long',
  }, locale).format(d)

  const dateShort = fmt(`ds:${timeZone}`, {
    timeZone, weekday: 'short', day: 'numeric', month: 'short',
  }, locale).format(d)

  const spokenTime = fmt(`sp:${tag}`, {
    timeZone, hour12, hour: 'numeric', minute: '2-digit',
  }, locale).format(d)

  return {
    hour,
    minute: pick(timeParts, 'minute'),
    second: pick(timeParts, 'second'),
    dayPeriod: hour12 ? pick(timeParts, 'dayPeriod').toUpperCase() : '',
    date: dateLong,
    dateShort,
    iso: isoInZone(ms, timeZone),
    spoken: `${spokenTime}, ${dateLong}`,
  }
}

/** ISO 8601 local time with offset, for <time datetime="...">. */
export function isoInZone(ms: number, timeZone: string): string {
  const off = zoneOffsetMs(timeZone, ms)
  const local = new Date(ms + off)
  const p = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0')
  const mins = Math.round(off / 60000)
  const sign = mins < 0 ? '-' : '+'
  const tz = mins === 0 ? 'Z' : `${sign}${p(Math.trunc(Math.abs(mins) / 60))}:${p(Math.abs(mins) % 60)}`
  return (
    `${p(local.getUTCFullYear(), 4)}-${p(local.getUTCMonth() + 1)}-${p(local.getUTCDate())}` +
    `T${p(local.getUTCHours())}:${p(local.getUTCMinutes())}:${p(local.getUTCSeconds())}${tz}`
  )
}
