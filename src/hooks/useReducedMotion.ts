import { useSettings } from '@/features/settings/settingsStore'
import { useMediaQuery } from './useMediaQuery'

/**
 * Motion preference, from the OS setting OR the in-app toggle.
 *
 * The in-app toggle exists because plenty of people who would prefer less
 * movement have never found the OS setting, and offering it in the product
 * costs almost nothing.
 */
export function useReducedMotion() {
  const system = useMediaQuery('(prefers-reduced-motion: reduce)')
  const override = useSettings((s) => s.motion)
  return override === 'reduced' || system
}

/** Non-reactive read, for use inside the render loop. */
export function reducedMotionNow() {
  if (useSettings.getState().motion === 'reduced') return true
  return typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
