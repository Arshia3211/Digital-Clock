import { useRef } from 'react'
import { useSettings } from '@/features/settings/settingsStore'
import styles from './Controls.module.css'

const OPTIONS = [
  { value: false, label: '24h' },
  { value: true, label: '12h' },
] as const

/**
 * A real radiogroup, not two buttons pretending. Arrow keys move between the
 * options and only the selected one is in the tab order, which is what a screen
 * reader user expects from a segmented control.
 */
export function FormatToggle() {
  const hour12 = useSettings((s) => s.hour12)
  const setHour12 = useSettings((s) => s.setHour12)
  const ref = useRef<HTMLDivElement>(null)

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
    e.preventDefault()
    setHour12(!hour12)
    // Keep focus on the option that is now checked.
    requestAnimationFrame(() =>
      ref.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus(),
    )
  }

  return (
    <div
      ref={ref}
      className={styles.segmented}
      role="radiogroup"
      aria-label="Time format"
      onKeyDown={onKeyDown}
    >
      <span
        className={styles.indicator}
        style={{ transform: `translateX(${hour12 ? '100%' : '0%'})` }}
        aria-hidden="true"
      />
      {OPTIONS.map((o) => (
        <button
          key={o.label}
          type="button"
          role="radio"
          aria-checked={hour12 === o.value}
          tabIndex={hour12 === o.value ? 0 : -1}
          className="chip-button"
          onClick={() => setHour12(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
