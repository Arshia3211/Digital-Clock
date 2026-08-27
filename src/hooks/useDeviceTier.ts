import type { DeviceTier } from '@/types'

interface NavigatorWithHints extends Navigator {
  deviceMemory?: number
}

let cached: DeviceTier | null = null

/**
 * A deliberately coarse capability guess, used only to pick starting quality.
 * Precise GPU detection is not reliably possible from JavaScript, and pretending
 * otherwise produces worse results than an honest heuristic plus a runtime
 * performance monitor that can step the tier down once it has real frame times.
 */
export function deviceTier(): DeviceTier {
  if (cached) return cached

  const nav = navigator as NavigatorWithHints
  const cores = nav.hardwareConcurrency ?? 4
  const memory = nav.deviceMemory ?? 4
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const small = Math.min(window.innerWidth, window.innerHeight) < 500

  let score = 0
  if (cores >= 8) score += 2
  else if (cores >= 5) score += 1
  if (memory >= 8) score += 2
  else if (memory >= 4) score += 1
  if (!coarse) score += 1
  if (small) score -= 1

  cached = score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low'
  return cached
}

/** Manual override via ?tier=low — invaluable when you only own a fast phone. */
export function tierFromQuery(): DeviceTier | null {
  const q = new URLSearchParams(location.search).get('tier')
  return q === 'low' || q === 'medium' || q === 'high' ? q : null
}

export const resolvedTier = (): DeviceTier => tierFromQuery() ?? deviceTier()
