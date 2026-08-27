import styles from './Mark.module.css'

/**
 * Identity, and the only place the project says its own name. The dot pulses
 * once per second — the smallest possible proof that the page is live, placed
 * where it cannot compete with the clock.
 */
export function Mark() {
  const delay = `${-((Date.now() % 1000) / 1000).toFixed(3)}s`
  return (
    <div className={styles.mark}>
      <span className={`${styles.dot} pulse`} style={{ animationDelay: delay }} />
      <span className={styles.word}>TICK</span>
    </div>
  )
}
