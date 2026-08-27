import { useDisplayTime } from '@/features/time'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import styles from './DateLine.module.css'

/**
 * Grounds the time. Stays in the DOM rather than the canvas: it needs to be
 * crisply readable at small sizes and to reflow for any locale, and SDF text in
 * a 3D scene is worse at both.
 */
export function DateLine() {
  const t = useDisplayTime()
  // Below this the long form wraps, and a wrapped date line looks like a bug.
  const tight = useMediaQuery('(max-width: 380px)')

  return (
    <p className={styles.date} aria-hidden="true">
      {tight ? t.dateShort : t.date}
    </p>
  )
}
