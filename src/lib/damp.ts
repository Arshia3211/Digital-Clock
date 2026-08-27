import { clamp01 } from './clamp'

/**
 * Frame-rate independent exponential damping.
 *
 * A raw `lerp(a, b, 0.05)` per frame converges twice as fast on a 120Hz display
 * as on a 60Hz one. This does not. `lambda` is the decay rate: higher = snappier.
 */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  target + (current - target) * Math.exp(-lambda * dt)

export interface SpringState {
  value: number
  velocity: number
}

/**
 * Semi-implicit Euler spring. `stiffness`/`damping` are tuned so that a damping
 * ratio just under 1 gives a single small overshoot — the "settle" that makes a
 * digit roll feel physical rather than animated.
 */
export function stepSpring(
  s: SpringState,
  target: number,
  stiffness: number,
  damping: number,
  dt: number,
) {
  // Clamp dt so a dropped frame or a backgrounded tab cannot explode the integrator.
  const h = Math.min(dt, 1 / 30)
  const a = (target - s.value) * stiffness - s.velocity * damping
  s.velocity += a * h
  s.value += s.velocity * h
  return s
}

export const springSettled = (s: SpringState, target: number, eps = 1e-4) =>
  Math.abs(s.value - target) < eps && Math.abs(s.velocity) < eps

/** Ease-out cubic, for the few places a fixed-duration tween beats a spring. */
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3)

/** Ease-out with a ~6% overshoot, used for the seconds tick. */
export const easeOutOvershoot = (t: number) => {
  const x = clamp01(t)
  const c = 1.9
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2)
}
