import { useDisplayTime, now } from '@/features/time'
import { useSettings } from '@/features/settings/settingsStore'
import { offsetLabel, systemTimeZone, zoneOffset } from '@/features/time/zones'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import styles from './DateLine.module.css'

interface Props {
  onOpenZones: () => void
}

/**
 * Grounds the time, and answers "where".
 *
 * The location control lives here rather than in the top-right chip group for
 * two reasons: it is contextual — "Thursday, August 27, in Karachi" reads as one
 * statement — and a clock quietly showing another city's time without saying so
 * is a genuinely bad failure. When the zone is not the viewer's own, the offset
 * is spelled out beside it.
 */
export function DateLine({ onOpenZones }: Props) {
  const t = useDisplayTime()
  const timeZone = useSettings((s) => s.timeZone)
  // The identifier plus a year is a long line. On narrow screens the DATE
  // shortens; the identifier never does, because shortening it back to a bare
  // city is exactly the thing this control is not.
  const tight = useMediaQuery('(max-width: 700px)')

  const home = systemTimeZone()
  const away = timeZone !== home

  // The identifier, split so the region can recede without being dropped. The
  // control is timezone-first: what it shows and what it stores are the same
  // string, and the city is never a substitute for it.
  const cut = timeZone.lastIndexOf('/')
  const prefix = cut >= 0 ? timeZone.slice(0, cut + 1).replace(/_/g, ' ') : ''
  const tail = timeZone.slice(cut + 1).replace(/_/g, ' ')

  let delta = ''
  if (away) {
    const t = now()
    const a = zoneOffset(timeZone, t)
    const b = zoneOffset(home, t)
    if (a !== undefined && b !== undefined) delta = offsetLabel(a - b)
  }

  return (
    <p className={styles.line}>
      <span aria-hidden="true">{tight ? t.dateShort : t.date}</span>
      <span className={styles.dot} aria-hidden="true" />
      <button
        type="button"
        className={styles.zone}
        onClick={onOpenZones}
        aria-label={`Timezone: ${timeZone}. Choose a different one.`}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"
          fill="none" stroke="currentColor" strokeWidth="1.3">
          <circle cx="8" cy="8" r="6.2" />
          <ellipse cx="8" cy="8" rx="2.6" ry="6.2" />
          <path d="M1.9 6h12.2M1.9 10h12.2" strokeLinecap="round" />
        </svg>
        <span className={styles.zoneId}>
          {prefix && <span className={styles.zonePrefix}>{prefix}</span>}
          {tail}
        </span>
        {delta && <span className={styles.delta}>{delta}</span>}
      </button>
    </p>
  )
}
