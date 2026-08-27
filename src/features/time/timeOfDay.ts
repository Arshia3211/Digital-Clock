import type { PhaseName } from '@/types'

export const DAY_MS = 86_400_000

/** Normalised position through the local day, 0 = midnight, [0,1). */
export const timeOfDayFrom = (localMs: number) =>
  (((localMs % DAY_MS) + DAY_MS) % DAY_MS) / DAY_MS

export const hoursFrom = (t: number) => t * 24

export function phaseAt(hours: number): PhaseName {
  if (hours < 4.5) return 'night'
  if (hours < 6.5) return 'dawn'
  if (hours < 8.25) return 'sunrise'
  if (hours < 11) return 'morning'
  if (hours < 14.5) return 'midday'
  if (hours < 16.5) return 'afternoon'
  if (hours < 19) return 'golden'
  if (hours < 22) return 'dusk'
  return 'night'
}
