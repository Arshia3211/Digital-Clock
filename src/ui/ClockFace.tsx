import { useEffect, useRef } from 'react'
import { useDisplayTime, getTimeZone, now, subscribeTick } from '@/features/time'
import { zoneParts } from '@/features/time/zoneParts'
import { useLayout } from '@/features/theme/layoutStore'
import { measureDigits, publishScrimGeometry } from './measureDigits'
import styles from './ClockFace.module.css'

interface Props {
  /** Faded out once the 3D digits have taken over, but never unmounted. */
  dimmed: boolean
  /**
   * Changes whenever something moves the block without resizing it — opening
   * the info panel, for instance. A ResizeObserver cannot see that, because the
   * border box is identical; only the position changed.
   */
  remeasureKey?: number | string
}

/**
 * The DOM clock.
 *
 * This is three things at once, which is why it earns its weight:
 *   - the first thing painted, well before three.js finishes downloading;
 *   - the entire experience when WebGL is unavailable or the context is lost;
 *   - the measuring stick the 3D scene fits itself to.
 *
 * Because of the third role it stays mounted and laid out at all times; only
 * its opacity changes.
 */
export function ClockFace({ dimmed, remeasureKey }: Props) {
  const t = useDisplayTime()
  const ref = useRef<HTMLDivElement>(null)
  const setDigits = useLayout((s) => s.setDigits)

  const s0 = useRef<HTMLSpanElement>(null)
  const s1 = useRef<HTMLSpanElement>(null)

  /*
   * In 12-hour mode a single-digit hour is space-padded so the slot pitch never
   * changes at 9 -> 10. That leading cell is empty, which centres the ROW but
   * leaves the visible time sitting half a cell right of centre. Pulling the row
   * back by half a cell centres the marks people can actually see.
   */
  const padded = t.hour.startsWith(' ')

  /*
   * Seconds are written straight into the DOM once a second.
   *
   * The obvious implementation is to let `useDisplayTime` tick at second
   * granularity, which would re-render the tree sixty times a minute and throw
   * away the render budget the whole architecture is built around. Two
   * textContent writes cost nothing and keep it at one render per minute — the
   * same reasoning that keeps the 3D digits out of React entirely.
   */
  useEffect(() => {
    const write = () => {
      const p = zoneParts(now(), getTimeZone(), false)
      const a = p.s0
      const b = p.s1
      if (s0.current && s0.current.textContent !== a) s0.current.textContent = a
      if (s1.current && s1.current.textContent !== b) s1.current.textContent = b
    }
    write()
    return subscribeTick(write)
  }, [])

  // Slot positions depend on the viewport, the format, and whether the padding
  // cell is present — but NOT on which digits are showing, since every cell is
  // a fixed width. So this re-measures on those, not once a second.
  const shape = `${t.hour.length}:${padded ? 1 : 0}:${t.dayPeriod ? 1 : 0}`

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      // Wait a frame so web-font swap and layout have both settled.
      frame = requestAnimationFrame(() => {
        const m = measureDigits(el)
        if (m) {
          setDigits(m)
          publishScrimGeometry(m)
        }
      })
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    document.fonts?.ready.then(measure).catch(() => {})

    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [setDigits, shape])

  // Track the block across a move. Bounded to the length of the transition —
  // this is not a render loop, it is sixteen frames.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const start = performance.now()
    let raf = 0
    const follow = (now: number) => {
      const m = measureDigits(el)
      if (m) {
        setDigits(m)
        publishScrimGeometry(m)
      }
      if (now - start < 420) raf = requestAnimationFrame(follow)
    }
    raf = requestAnimationFrame(follow)
    return () => cancelAnimationFrame(raf)
  }, [remeasureKey, setDigits])

  // Re-anchor the colon's CSS animation to the wall clock on every render (once
  // a minute) so its pulse cannot drift away from the real second boundary.
  const colonDelay = `${-((Date.now() % 1000) / 1000).toFixed(3)}s`

  return (
    <div
      ref={ref}
      className={styles.face}
      style={{
        opacity: dimmed ? 0 : 1,
        transform: padded ? 'translateX(-0.33em)' : undefined,
      }}
      aria-hidden="true"
    >
      {[...t.hour].map((c, i) => (
        <span
          key={`h${i}`}
          className={styles.digit}
          data-slot="digit"
          data-slot-id={`h${i}`}
          // Marks the padding cell so the block centre is measured across the
          // glyphs rather than the empty space in front of them.
          data-blank={c === ' ' ? 'true' : undefined}
        >
          {c === ' ' ? '\u00A0' : c}
        </span>
      ))}

      <span
        className={`${styles.colon} pulse`}
        style={{ animationDelay: colonDelay }}
        data-slot="colon"
        data-slot-id="colon"
      >
        :
      </span>

      {[...t.minute].map((c, i) => (
        <span key={`m${i}`} className={styles.digit} data-slot="digit" data-slot-id={`m${i}`}>
          {c}
        </span>
      ))}

      <span className={styles.colon} data-slot="colon" data-slot-id="colon2">
        :
      </span>

      <span ref={s0} className={styles.digit} data-slot="digit" data-slot-id="s0">
        {t.second[0]}
      </span>
      <span ref={s1} className={styles.digit} data-slot="digit" data-slot-id="s1">
        {t.second[1]}
      </span>

      {t.dayPeriod && (
        <span className={styles.period} data-slot="period" data-slot-id="period">
          {t.dayPeriod}
        </span>
      )}
    </div>
  )
}
