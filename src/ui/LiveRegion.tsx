import { useRef, useState } from 'react'
import { formatTime, now, useDisplayTime } from '@/features/time'
import { useSettings } from '@/features/settings/settingsStore'

/**
 * Assistive-technology access to the time.
 *
 * Deliberately NOT a live region that announces every second — that is the
 * mistake almost every "accessible clock" makes, and it renders the page
 * unusable. A clock is something you check, not something that shouts. So the
 * time sits in the document as a normal, navigable `<time>` element, plus an
 * explicit on-demand announce control for people who want it read out without
 * hunting for it.
 *
 * The polite region below is used only for changes the USER caused, which is
 * what live regions are actually for.
 */
export function LiveRegion({ status }: { status: string }) {
  const t = useDisplayTime()
  const { hour12, timeZone } = useSettings()
  const [announced, setAnnounced] = useState('')
  const clearTimer = useRef<number>()

  const announce = () => {
    const fresh = formatTime(now(), { hour12, timeZone })
    // Re-set through empty so repeat activations are re-announced.
    setAnnounced('')
    window.clearTimeout(clearTimer.current)
    clearTimer.current = window.setTimeout(() => setAnnounced(`The time is ${fresh.spoken}.`), 60)
  }

  return (
    <>
      <h1 className="sr-only">TICK — a clock whose world tracks the sun</h1>

      <p className="sr-only">
        The current time is{' '}
        <time dateTime={t.iso}>{t.spoken}</time>.
      </p>

      <button type="button" className="sr-only sr-only-focusable" onClick={announce}>
        Announce the current time
      </button>

      <p aria-live="assertive" aria-atomic="true" className="sr-only">
        {announced}
      </p>

      {/* Changes the user made: format, theme, timezone. */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {status}
      </p>
    </>
  )
}
