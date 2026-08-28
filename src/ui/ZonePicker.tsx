import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useSettings } from '@/features/settings/settingsStore'
import { getMinuteIndex, now, subscribeTick, zoneTimeOfDay } from '@/features/time'
import { zoneParts } from '@/features/time/zoneParts'
import {
  matchZones,
  offsetLabel,
  systemTimeZone,
  zoneOffset,
  type Zone,
} from '@/features/time/zones'
import { skyAt } from '@/features/theme/resolvePalette'
import { oklchToCss } from '@/lib/color'
import styles from './ZonePicker.module.css'

/**
 * Swatch gradients, cached in five-minute buckets.
 *
 * Zones cluster onto about forty distinct offsets, so eighty rows only ever
 * need forty gradients — and the sky does not visibly change within five
 * minutes, so the cache survives the once-a-second re-render that keeps the
 * listed times ticking.
 */
/** Enough to fill the list before anyone can look at it. */
const FIRST_PAINT_ROWS = 40

const gradients = new Map<number, string>()

function skyGradient(hours: number): string {
  const bucket = Math.round(hours * 12)
  let g = gradients.get(bucket)
  if (!g) {
    const s = skyAt(bucket / 12)
    g =
      `linear-gradient(180deg, ${oklchToCss(s.top)} 0%, ` +
      `${oklchToCss(s.mid)} 52%, ${oklchToCss(s.bottom)} 100%)`
    gradients.set(bucket, g)
  }
  return g
}

interface Props {
  open: boolean
  onClose: () => void
}

/**
 * Every IANA zone the platform knows, presented as a list of skies.
 *
 * The point of the swatch is not decoration. This project's whole idea is that
 * the scene is a function of the local time of day, which means choosing a zone
 * is choosing a sky — and a list that shows you that is a list you can scan for
 * "somewhere it is currently evening", which a dropdown of strings is not.
 *
 * Each swatch is the real palette for that zone's current hour, drawn from the
 * same ramp the scene uses. Nothing here is illustrative.
 */
export function ZonePicker({ open, onClose }: Props) {
  const timeZone = useSettings((s) => s.timeZone)
  const setTimeZone = useSettings((s) => s.setTimeZone)
  const hour12 = useSettings((s) => s.hour12)

  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)

  /*
   * One timestamp for the whole render, so every row agrees — refreshed once a
   * MINUTE, because minutes are the precision these rows show. Ticking this
   * every second re-rendered four hundred rows sixty times a minute for a
   * display that changes once, which is what forced the row cap that hid most
   * of the world.
   */
  const minute = useSyncExternalStore(subscribeTick, getMinuteIndex, getMinuteIndex)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tick = useMemo(() => now(), [minute])

  const home = systemTimeZone()
  // Per row, not up front: the cache makes each lookup free once warmed.
  const homeOffset = zoneOffset(home, tick) ?? 0

  const { results, pinnedCount } = useMemo(() => {
    const hits = matchZones(query)
    if (query.trim()) return { results: hits, pinnedCount: 0 }

    // With no query, surface where the viewer actually is, then the zone they
    // are currently viewing if it is somewhere else. Everything follows.
    const ids = [home, timeZone].filter((v, i, a) => a.indexOf(v) === i)
    const pinned = ids
      .map((id) => hits.find((z) => z.id === id))
      .filter((z): z is Zone => Boolean(z))
    const rest = hits.filter((z) => !ids.includes(z.id))
    return { results: [...pinned, ...rest], pinnedCount: pinned.length }
  }, [query, home, timeZone])

  useEffect(() => setActive(0), [query])

  /*
   * Progressive fill.
   *
   * Every zone is in the list, and rendering four hundred rows costs about
   * 215ms — perceptible on a control that should feel instant. So a screenful
   * goes in immediately and the rest arrives over the next few frames, growing
   * threefold each time. The panel is visible and the search box is focused
   * within a frame; by the time anyone has finished reading the first row the
   * whole world is behind it.
   *
   * The alternative was a virtualised list, which would have cost find-in-page,
   * native focus order and scrollIntoView to save work the browser can already
   * skip via content-visibility.
   */
  const [budget, setBudget] = useState(FIRST_PAINT_ROWS)
  useEffect(() => setBudget(FIRST_PAINT_ROWS), [query, open])
  useEffect(() => {
    if (!open || budget >= results.length) return
    const id = requestAnimationFrame(() =>
      // Never fall behind the keyboard cursor, however fast someone holds down
      // the arrow key.
      setBudget((b) => Math.min(results.length, Math.max(b * 3, active + 24))),
    )
    return () => cancelAnimationFrame(id)
  }, [open, budget, results.length, active])

  const visible = results.slice(0, budget)

  useEffect(() => {
    if (!open) return
    restoreTo.current = document.activeElement as HTMLElement
    inputRef.current?.focus()
    return () => restoreTo.current?.focus()
  }, [open])

  // Keep the highlighted row in view when arrowing past the fold.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  const choose = (z: Zone) => {
    setTimeZone(z.id)
    onClose()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault()
      choose(results[active])
    }
  }

  return (
    <>
      <div className={styles.scrim} onPointerDown={onClose} aria-hidden="true" />
      <div
        className={`panel ${styles.panel}`}
        role="dialog"
        aria-modal="true"
        aria-label="Choose a timezone"
        onKeyDown={onKeyDown}
      >
        <h2 className={styles.title}>Select Timezone</h2>

        <input
          ref={inputRef}
          className={styles.search}
          type="text"
          value={query}
          placeholder="Search cities and regions"
          aria-label="Search timezones"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className={styles.list} ref={listRef} role="listbox" aria-label="Timezones">
          {visible.map((z, i) => {
            const off = zoneOffset(z.id, tick)
            if (off === undefined) return null

            // Formatted through Intl for this zone, not by adding the offset.
            // The offset below is only ever a LABEL.
            const p = zoneParts(tick, z.id, hour12)
            const delta = off - homeOffset

            /*
             * A second line only when it carries information. For Asia/Tokyo the
             * friendly name is already the last segment, so repeating it would be
             * noise; for Asia/Calcutta it is "Kolkata", which is the whole reason
             * the friendly label exists.
             */
            const tail = z.id.slice(z.id.lastIndexOf('/') + 1).replace(/_/g, ' ')
            const caption =
              z.id === home ? 'Your location' : z.label !== tail ? z.label : ''

            /*
             * A region heading whenever the identifier's first segment changes.
             * Only while browsing: during a search the results are ranked by
             * relevance, and grouping them would fight the ranking.
             *
             * The pinned rows at the top get their own heading, so a pinned
             * European zone does not make "Europe" appear twice in the list.
             */
            const header = query.trim()
              ? ''
              : i === 0
                ? pinnedCount > 0
                  ? 'Current'
                  : z.region
                : i < pinnedCount
                  ? ''
                  : i === pinnedCount || results[i - 1].region !== z.region
                    ? z.region
                    : ''

            return (
              <Fragment key={z.id}>
              {header && (
                <p className={styles.regionHeader} role="presentation">
                  {header}
                </p>
              )}
              <button
                type="button"
                role="option"
                aria-selected={z.id === timeZone}
                data-active={i === active || undefined}
                className={styles.row}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(z)}
              >
                <span
                  className={styles.sky}
                  aria-hidden="true"
                  style={{ backgroundImage: skyGradient(zoneTimeOfDay(tick, z.id)) }}
                />

                <span className={styles.names}>
                  {/* The identifier IS the row. Everything before the last
                      segment is dimmed so the eye still lands on the place,
                      without the ID being demoted to a subtitle. */}
                  <span className={styles.id}>
                    {z.id.includes('/') && (
                      <span className={styles.idPrefix}>
                        {z.id.slice(0, z.id.lastIndexOf('/') + 1).replace(/_/g, ' ')}
                      </span>
                    )}
                    <span className={styles.idTail}>
                      {z.id.slice(z.id.lastIndexOf('/') + 1).replace(/_/g, ' ')}
                    </span>
                  </span>
                  {caption && <span className={styles.caption}>{caption}</span>}
                </span>

                <span className={styles.times}>
                  <span className={styles.clock}>
                    {p.h0}
                    {p.h1}:{p.m0}
                    {p.m1}
                    {hour12 && <span className={styles.ampm}>{p.isPm ? 'PM' : 'AM'}</span>}
                  </span>
                  <span className={styles.delta}>{offsetLabel(delta)}</span>
                </span>
              </button>
              </Fragment>
            )
          })}

          {!results.length && <p className={styles.empty}>No zone matches “{query}”.</p>}

        </div>

        <p className={styles.hint}>
          The sky follows wherever you choose
          <span className={styles.keys}>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            <kbd>Enter</kbd>
            <kbd>Esc</kbd>
          </span>
        </p>
      </div>
    </>
  )
}
