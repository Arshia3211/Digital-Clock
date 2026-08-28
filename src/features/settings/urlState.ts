import { isValidZone } from '@/features/time/zones'

/**
 * Shareable state, in the URL.
 *
 * `?tz=Asia/Tokyo&f=24` makes a link to a specific clock — which matters more
 * here than for most settings, because the timezone changes the entire scene.
 * Sending someone a link to Tokyo at midnight sends them the sky as well as the
 * numbers.
 *
 * The URL wins over stored settings on load: an explicit link should show what
 * it says, not what the recipient last chose.
 */

export interface UrlState {
  timeZone?: string
  hour12?: boolean
}

export function readUrlState(): UrlState {
  if (typeof location === 'undefined') return {}
  try {
    const q = new URLSearchParams(location.search)
    const out: UrlState = {}

    const tz = q.get('tz')
    // Validated rather than trusted: an unknown zone would otherwise throw
    // inside Intl on the first format call and take the whole clock down.
    if (tz && isValidZone(tz)) out.timeZone = tz

    const f = q.get('f')
    if (f === '12' || f === '24') out.hour12 = f === '12'

    return out
  } catch {
    return {}
  }
}

export function writeUrlState(s: Required<UrlState>, systemZone: string) {
  if (typeof history === 'undefined') return
  try {
    const q = new URLSearchParams(location.search)

    // Only the non-default is worth carrying, so the address bar stays clean
    // for someone who has not changed anything.
    if (s.timeZone && s.timeZone !== systemZone) q.set('tz', s.timeZone)
    else q.delete('tz')
    q.set('f', s.hour12 ? '12' : '24')

    const qs = q.toString()
    // replaceState, not pushState: changing the format is not a navigation, and
    // filling someone's back button with clock settings is hostile.
    history.replaceState(null, '', qs ? `${location.pathname}?${qs}` : location.pathname)
  } catch {
    /* ignore */
  }
}
