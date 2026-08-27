import { useEffect, useRef } from 'react'
import { DayScrubber } from './DayScrubber'
import styles from './InfoPanel.module.css'

interface Props {
  open: boolean
  onClose: () => void
  /** True when the clock cannot step aside far enough to clear a side panel. */
  asSheet?: boolean
}

export function InfoPanel({ open, onClose, asSheet }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreTo.current = document.activeElement as HTMLElement
    ref.current?.querySelector<HTMLElement>('button, input, a')?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (e.key !== 'Tab' || !ref.current) return
      // Focus trap: without this, Tab walks out of the panel and into a
      // canvas-covered page with nothing visible to focus.
      const items = ref.current.querySelectorAll<HTMLElement>(
        'button, input, a[href], [tabindex]:not([tabindex="-1"])',
      )
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      restoreTo.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div className={styles.scrim} onPointerDown={onClose} aria-hidden="true" />
      <div
        ref={ref}
        className={`panel ${styles.panel} ${asSheet ? styles.sheet : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="About this clock"
      >
        <div className={styles.head}>
          <h2 className={styles.title}>About</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"
              fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M3 3l8 8M11 3l-8 8" />
            </svg>
          </button>
        </div>

        <p className={styles.body}>
          The scene is not a backdrop with a clock on it. Every colour, the angle
          and warmth of the light, the fog and the drifting motes are all derived
          from one value: the current local time of day. Dawn is cold and rose;
          midday is bright and flat; the evening light rakes in low and warm.
        </p>

        <DayScrubber />

        <dl className={styles.meta}>
          <div>
            <dt>Built with</dt>
            <dd>React, TypeScript, three.js, React Three Fiber</dd>
          </div>
          <div>
            <dt>Keyboard</dt>
            <dd>
              <kbd>F</kbd> format · <kbd>T</kbd> theme · <kbd>M</kbd> motion ·{' '}
              <kbd>I</kbd> this panel · <kbd>Esc</kbd> close
            </dd>
          </div>
        </dl>
      </div>
    </>
  )
}
