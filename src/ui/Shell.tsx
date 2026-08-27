import { Mark } from './Mark'
import { Controls } from './Controls'
import { ClockFace } from './ClockFace'
import { DateLine } from './DateLine'
import { InfoPanel } from './InfoPanel'
import { LiveRegion } from './LiveRegion'
import { usePanelShift } from './usePanelShift'
import styles from './Shell.module.css'

interface Props {
  sceneReady: boolean
  status: string
  infoOpen: boolean
  setInfoOpen: (v: boolean) => void
}

/**
 * The entire DOM overlay: a mark, two controls, the clock, a date, an info
 * button. Five things.
 *
 * No navbar and no footer — a clock does not need navigation, and adding one is
 * a reflex rather than a decision. Nothing scrolls.
 */
export function Shell({ sceneReady, status, infoOpen, setInfoOpen }: Props) {
  const shift = usePanelShift(infoOpen)
  const asSheet = shift === null

  return (
    <div
      className={styles.shell}
      style={{ '--stage-shift': `${shift ?? 0}px` } as React.CSSProperties}
    >
      <LiveRegion status={status} />

      <header className={styles.header}>
        <Mark />
        <Controls />
      </header>

      <main className={styles.stage}>
        <ClockFace dimmed={sceneReady} remeasureKey={shift ?? 'sheet'} />
        <DateLine />
      </main>

      <button
        type="button"
        className={styles.info}
        onClick={() => setInfoOpen(!infoOpen)}
        aria-expanded={infoOpen}
        aria-label="About this clock"
      >
        <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"
          fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <circle cx="8" cy="8" r="6.4" />
          <path d="M8 7.1v4.1" />
          <circle cx="8" cy="4.8" r="0.75" fill="currentColor" stroke="none" />
        </svg>
      </button>

      <InfoPanel open={infoOpen} onClose={() => setInfoOpen(false)} asSheet={asSheet} />
    </div>
  )
}
