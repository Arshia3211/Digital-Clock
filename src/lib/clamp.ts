export const clamp = (v: number, min: number, max: number) =>
  v < min ? min : v > max ? max : v

export const clamp01 = (v: number) => clamp(v, 0, 1)

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export const inverseLerp = (a: number, b: number, v: number) =>
  a === b ? 0 : (v - a) / (b - a)

export const smoothstep = (t: number) => {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}

/** Shortest-path interpolation around a circle of circumference `wrap`. */
export const lerpAngle = (a: number, b: number, t: number, wrap = 360) => {
  let d = ((b - a) % wrap + wrap * 1.5) % wrap - wrap / 2
  return a + d * t
}
