import { zoneOffsetMs, systemTimeZone } from './formatTime'

/**
 * The IANA timezone database, as the browser already has it.
 *
 * `Intl.supportedValuesOf` returns every zone the platform knows — around 420
 * of them — so there is no list to ship, no list to maintain, and no list to go
 * stale when a country next changes its mind about DST. The fallback exists
 * only for engines that predate it.
 */

const FALLBACK = [
  'UTC',
  'Africa/Cairo', 'Africa/Johannesburg', 'Africa/Lagos', 'Africa/Nairobi',
  'America/Anchorage', 'America/Argentina/Buenos_Aires', 'America/Bogota',
  'America/Chicago', 'America/Denver', 'America/Halifax', 'America/Los_Angeles',
  'America/Mexico_City', 'America/New_York', 'America/Sao_Paulo', 'America/Toronto',
  'Asia/Bangkok', 'Asia/Dhaka', 'Asia/Dubai', 'Asia/Hong_Kong', 'Asia/Jakarta',
  'Asia/Jerusalem', 'Asia/Kabul', 'Asia/Karachi', 'Asia/Kathmandu', 'Asia/Kolkata',
  'Asia/Manila', 'Asia/Riyadh', 'Asia/Seoul', 'Asia/Shanghai', 'Asia/Singapore',
  'Asia/Tehran', 'Asia/Tokyo', 'Atlantic/Reykjavik', 'Australia/Adelaide',
  'Australia/Brisbane', 'Australia/Perth', 'Australia/Sydney', 'Europe/Amsterdam',
  'Europe/Athens', 'Europe/Berlin', 'Europe/Dublin', 'Europe/Istanbul',
  'Europe/Lisbon', 'Europe/London', 'Europe/Madrid', 'Europe/Moscow',
  'Europe/Paris', 'Europe/Rome', 'Europe/Stockholm', 'Europe/Warsaw',
  'Europe/Zurich', 'Pacific/Auckland', 'Pacific/Chatham', 'Pacific/Fiji',
  'Pacific/Honolulu',
]

/**
 * Modern names for zones the platform still reports under a historical one.
 *
 * `Intl.supportedValuesOf` returns whatever spelling the host's ICU build
 * canonicalised to, and several of those are decades out of date: Node hands
 * back Asia/Calcutta, Asia/Saigon, Europe/Kiev and Atlantic/Faeroe. Showing
 * someone "Calcutta" in 2026 is not a rendering detail, it is wrong.
 *
 * The ID is left exactly as the platform gave it — Intl accepts both spellings
 * and the host's own canonical form is the safest thing to store — and only the
 * displayed city changes. Search matches both, so typing either name works.
 */
const RENAMED: Record<string, string> = {
  'Africa/Asmera': 'Asmara',
  'America/Godthab': 'Nuuk',
  'Asia/Calcutta': 'Kolkata',
  'Asia/Katmandu': 'Kathmandu',
  'Asia/Rangoon': 'Yangon',
  'Asia/Saigon': 'Ho Chi Minh City',
  'Atlantic/Faeroe': 'Faroe Islands',
  'Europe/Kiev': 'Kyiv',
  'Pacific/Enderbury': 'Enderbury Island',
  'Pacific/Ponape': 'Pohnpei',
  'Pacific/Truk': 'Chuuk',
}

export interface Zone {
  /**
   * The IANA identifier, and the ONLY thing this application ever stores,
   * compares or puts in a URL. Everything else on this object is presentation.
   */
  id: string
  /**
   * A friendly city name. Display only — deliberately named `label` rather than
   * `city` so the type itself says it is not the identity.
   */
  label: string
  /** First segment of the id: "Asia". Used to group the list. */
  region: string
  /** Lowercased haystack for matching, including any historical spelling. */
  search: string
}

let cached: Zone[] | null = null

export function allZones(): Zone[] {
  if (cached) return cached

  let ids: string[]
  try {
    ids = (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? FALLBACK
  } catch {
    ids = FALLBACK
  }
  if (!ids.length) ids = FALLBACK

  // The platform list is canonical zone names only, and omits UTC entirely —
  // which is both a legitimate thing to want to view and the fallback
  // systemTimeZone() returns when it cannot identify the host zone.
  if (!ids.includes('UTC')) ids = ['UTC', ...ids]

  cached = ids
    .map((id) => {
      const parts = id.split('/')
      const raw = (parts[parts.length - 1] ?? id).replace(/_/g, ' ')
      const label = RENAMED[id] ?? raw
      const region = parts.length > 1 ? parts[0] : 'UTC'
      // The historical spelling stays in the haystack so someone who knows the
      // zone as Calcutta or Saigon still finds it.
      return {
        id,
        label,
        region,
        search: `${id} ${label} ${raw}`.toLowerCase().replace(/_/g, ' '),
      }
    })
    // Sorted by IDENTIFIER, not by city. Because identifiers begin with their
    // region, this groups the list the way the database itself is organised —
    // Africa/*, America/*, Asia/* — instead of interleaving Abidjan with Adak
    // and Adelaide.
    .sort((a, b) => a.id.localeCompare(b.id))

  return cached
}

export const isValidZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/**
 * Zone offsets, cached per zone.
 *
 * Each one costs an `Intl.DateTimeFormat` construction the first time it is
 * asked for — about 2.4ms — so computing all 418 up front took a full second
 * and the picker visibly hung on open. They are cached individually instead,
 * and warmed in the background during idle time, so by the time anyone presses
 * Z the answer is already there.
 *
 * Offsets only move at DST boundaries, which fall on the hour or half-hour, so
 * a ten-minute lifetime is far more often than necessary and still cheap.
 */
const OFFSET_TTL = 10 * 60_000
const cache = new Map<string, { at: number; ms: number }>()

export function zoneOffset(id: string, nowMs: number): number | undefined {
  const hit = cache.get(id)
  // Absolute difference, not signed. A signed check happily serves an answer
  // computed for July when asked about January, because the difference is
  // negative and every negative number is less than the TTL.
  if (hit && Math.abs(nowMs - hit.at) < OFFSET_TTL) return hit.ms
  try {
    const ms = zoneOffsetMs(id, nowMs)
    cache.set(id, { at: nowMs, ms })
    return ms
  } catch {
    // A zone the formatter cannot handle is simply not offered.
    return undefined
  }
}

export function zoneOffsets(nowMs: number): Map<string, number> {
  const m = new Map<string, number>()
  for (const z of allZones()) {
    const ms = zoneOffset(z.id, nowMs)
    if (ms !== undefined) m.set(z.id, ms)
  }
  return m
}

type Idle = (cb: (d?: { timeRemaining: () => number }) => void) => void

/**
 * Fills the offset cache during idle time, a few zones at a time.
 *
 * Deliberately not a loop over all of them: that is the one-second stall this
 * exists to avoid, just moved somewhere less visible. It yields whenever the
 * frame is running out of room.
 */
export function warmZoneOffsets(nowMs = Date.now()) {
  const zones = allZones()
  let i = 0

  const idle: Idle =
    typeof requestIdleCallback === 'function'
      ? (cb) => requestIdleCallback(cb as IdleRequestCallback, { timeout: 2000 })
      : (cb) => void setTimeout(() => cb(undefined), 32)

  // Always make progress, even on a callback with no budget left. An idle
  // callback that fires because its timeout expired reports timeRemaining() of
  // 0, and a purely budget-driven loop would process nothing and reschedule
  // itself forever. Sixteen lookups is about 30ms — small enough not to be felt,
  // large enough to finish the list in under thirty callbacks.
  const MIN_BATCH = 16

  const step = (deadline?: { timeRemaining: () => number }) => {
    let done = 0
    while (
      i < zones.length &&
      (done < MIN_BATCH || (deadline ? deadline.timeRemaining() > 4 : false))
    ) {
      zoneOffset(zones[i++].id, nowMs)
      done++
    }
    if (i < zones.length) idle(step)
  }

  idle(step)
}

/** "+5:30", "-4", "0" — the difference from the viewer's own zone. */
export function offsetLabel(deltaMs: number): string {
  if (deltaMs === 0) return 'same time'
  const sign = deltaMs < 0 ? '-' : '+'
  const mins = Math.round(Math.abs(deltaMs) / 60000)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${sign}${h}h` : `${sign}${h}h ${m}m`
}

/**
 * Every match, not the first N.
 *
 * This used to cap at 150 rows to keep a once-a-second re-render cheap. Sorted
 * by identifier that meant browsing reached Africa and about two thirds of
 * America and then simply stopped — Asia, Europe, Australia and the Pacific
 * were unreachable unless you happened to type a search. 223 of 419 zones were
 * effectively missing, and a "150 more zones" note at the bottom of a scroll
 * container is not a fix for that.
 *
 * The cap is gone because the reason for it was, in turn, a mistake: the rows
 * show hours and minutes, so they never needed a per-second re-render at all.
 */
export function matchZones(query: string): Zone[] {
  const zones = allZones()
  const q = query.trim().toLowerCase().replace(/_/g, ' ')
  if (!q) return zones

  /*
   * Three tiers, because identifier order and match quality want different
   * things.
   *
   * Sorting the whole list by identifier groups it the way the database does,
   * but it also means "lon" returns Arctic/Longyearbyen before Europe/London —
   * alphabetically correct and obviously not what was meant. So label matches
   * are ranked by how much of the name the query accounted for, while
   * identifier matches keep identifier order, which is what makes typing
   * "europe/" behave like browsing a region.
   */
  const byLabel: Zone[] = []
  const byId: Zone[] = []
  const loose: Zone[] = []

  for (const z of zones) {
    if (z.label.toLowerCase().startsWith(q)) byLabel.push(z)
    else if (z.id.toLowerCase().startsWith(q)) byId.push(z)
    else if (z.search.includes(q)) loose.push(z)
  }

  byLabel.sort((a, b) => a.label.length - b.label.length || a.id.localeCompare(b.id))

  return [...byLabel, ...byId, ...loose]
}

export { systemTimeZone }
