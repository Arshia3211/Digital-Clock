import { useEffect, useState } from 'react'
import { FormatToggle } from './FormatToggle'
import { ThemeToggle } from './ThemeToggle'
import styles from './Controls.module.css'

const IDLE_MS = 4000

/**
 * The complete settings surface: two controls. If a clock needed a settings
 * modal, the design would have gone wrong somewhere earlier.
 */
export function Controls() {
  const [idle, setIdle] = useState(false)

  useEffect(() => {
    // Only fine pointers get the idle fade — see Controls.module.css.
    if (window.matchMedia('(pointer: coarse)').matches) return

    let timer = window.setTimeout(() => setIdle(true), IDLE_MS)
    const wake = () => {
      setIdle(false)
      clearTimeout(timer)
      timer = window.setTimeout(() => setIdle(true), IDLE_MS)
    }
    const events = ['pointermove', 'pointerdown', 'keydown', 'focusin'] as const
    events.forEach((e) => window.addEventListener(e, wake, { passive: true }))
    return () => {
      clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, wake))
    }
  }, [])

  return (
    <div className={`chip ${styles.controls} ${idle ? styles.idle : ''}`}>
      <FormatToggle />
      <span aria-hidden="true" style={{ width: 1, height: 16, background: 'var(--hairline)' }} />
      <ThemeToggle />
    </div>
  )
}
