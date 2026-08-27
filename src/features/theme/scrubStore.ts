import { create } from 'zustand'

interface ScrubState {
  /** Hours 0..24 while the user is dragging the day scrubber, else null. */
  hours: number | null
  set: (h: number | null) => void
}

/**
 * The palette moves through its full range once every 24 hours, which means a
 * visitor who stays for forty seconds sees a still frame of it. This lets them
 * run a whole day in about twenty seconds instead.
 *
 * It started as a development tool for tuning the ramp and stayed because
 * without it the central idea of the project is imperceptible.
 */
export const useScrub = create<ScrubState>((set) => ({
  hours: null,
  set: (hours) => set({ hours }),
}))
