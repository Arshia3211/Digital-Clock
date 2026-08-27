import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'

interface Props {
  /** Called when sustained frame times indicate the device cannot keep up. */
  onDecline: () => void
  /** Called when it is still struggling after several declines. */
  onFallback?: () => void
  targetFps?: number
}

/**
 * Adaptive quality, in forty lines.
 *
 * drei ships a PerformanceMonitor that does this well, but importing it pulled
 * the whole drei barrel into the bundle — 90KB gzipped for one component, in a
 * project that uses nothing else from the library. Since dropping drei removed
 * the last reason to depend on it at all, this is what replaced it.
 *
 * The heuristic is deliberately conservative: a single slow window is a garbage
 * collection or a background tab stealing the GPU, not a slow device. Only a
 * run of consecutive slow windows counts.
 */
export function PerformanceGuard({ onDecline, onFallback, targetFps = 50 }: Props) {
  const frames = useRef(0)
  const elapsed = useRef(0)
  const badWindows = useRef(0)
  const declines = useRef(0)
  const warmup = useRef(0)

  useEffect(() => {
    // Ignore the first second outright: shader compilation and geometry upload
    // make the opening frames unrepresentative of anything.
    warmup.current = 0
  }, [])

  useFrame((_, dt) => {
    if (warmup.current < 1) {
      warmup.current += dt
      return
    }

    frames.current++
    elapsed.current += dt
    if (elapsed.current < 0.75) return

    const fps = frames.current / elapsed.current
    frames.current = 0
    elapsed.current = 0

    if (fps < targetFps) {
      if (++badWindows.current >= 3) {
        badWindows.current = 0
        declines.current++
        if (declines.current >= 4) onFallback?.()
        else onDecline()
      }
    } else {
      badWindows.current = 0
    }
  })

  return null
}
