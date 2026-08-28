import { useEffect, useRef, useState } from 'react'
import { useScrub } from '@/features/theme/scrubStore'
import { getTimeZone, now, zoneTimeOfDay } from '@/features/time'
import styles from './InfoPanel.module.css'

const PLAY_SECONDS = 20

const label = (h: number) => {
  const hh = Math.floor(h) % 24
  const mm = Math.floor((h % 1) * 60)
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/**
 * Runs a full day in twenty seconds.
 *
 * This began as a tool for tuning the palette ramp and stayed in the product,
 * because without it the central idea is invisible: the scene changes over
 * twenty-four hours and a visitor sees one still frame of it. Making that
 * legible in fifteen seconds matters more than any other single control here.
 */
export function DayScrubber() {
  const scrub = useScrub((s) => s.hours)
  const set = useScrub((s) => s.set)
  const [playing, setPlaying] = useState(false)
  const raf = useRef<number>()

  const live = scrub ?? zoneTimeOfDay(now(), getTimeZone())

  // Closing the panel while a preview is pinned must hand the sky back. Without
  // this the scene stays stuck at a time that is not the time, and the only way
  // to fix it is to reopen the panel and find the control again.
  useEffect(() => () => useScrub.getState().set(null), [])

  useEffect(() => {
    if (!playing) return
    const from = useScrub.getState().hours ?? zoneTimeOfDay(now(), getTimeZone())
    const start = performance.now()

    const step = (now: number) => {
      const p = (now - start) / (PLAY_SECONDS * 1000)
      if (p >= 1) {
        setPlaying(false)
        set(null) // hand the sky back to the real clock; the engine eases into it
        return
      }
      set((from + p * 24) % 24)
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [playing, set])

  return (
    <div className={styles.scrubber}>
      <div className={styles.scrubHead}>
        <span className={styles.scrubLabel}>
          {scrub === null ? 'Now' : label(live)}
        </span>
        <button
          type="button"
          className={styles.textButton}
          onClick={() => (playing ? (setPlaying(false), set(null)) : setPlaying(true))}
        >
          {playing ? 'Stop' : 'Watch a day'}
        </button>
      </div>

      <input
        type="range"
        min={0}
        max={24}
        step={0.05}
        value={live}
        className={styles.range}
        aria-label="Preview the sky at a different time of day"
        aria-valuetext={scrub === null ? 'Now' : label(live)}
        onChange={(e) => {
          setPlaying(false)
          set(Number(e.target.value))
        }}
        onPointerUp={() => !playing && set(null)}
        onBlur={() => !playing && set(null)}
      />

      <p className={styles.scrubHint}>
        Release to return to the real time.
      </p>
    </div>
  )
}
