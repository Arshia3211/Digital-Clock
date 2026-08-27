import { useEffect, useRef, useState } from 'react'
import { useLayout } from '@/features/theme/layoutStore'

const PANEL_MAX = 380
const GAP = 28
/** Below this the panel becomes a bottom sheet and nothing needs to move. */
const SHEET_BREAKPOINT = 520

/**
 * How far the clock steps aside to let the info panel in.
 *
 * Computed from the digit block's measured box rather than from breakpoints,
 * because the block's width depends on a `clamp()` against both viewport axes,
 * the time format, and whether an AM/PM marker is present. Any fixed set of
 * breakpoints is wrong at some combination of those — and "the panel covers the
 * time" is a bad way for a clock to fail.
 *
 * Two things make this trickier than it looks:
 *
 *  1. The measured rect is the SHIFTED rect, because getBoundingClientRect
 *     includes ancestor transforms. Computing the next shift from it without
 *     compensating produces a feedback loop that oscillates between the full
 *     shift and none. So the currently applied shift is added back first.
 *
 *  2. For the same reason this must not re-run on every measurement. The block
 *     is re-measured every frame while it slides, and recomputing mid-slide
 *     would restart the transition against a moving target. The layout is read
 *     imperatively and recomputed only when the panel opens or the window
 *     resizes.
 *
 * Returns null when there is not enough room on the left, and the caller falls
 * back to a bottom sheet.
 */
export function usePanelShift(open: boolean): number | null {
  const [shift, setShift] = useState<number | null>(0)
  const applied = useRef(0)

  useEffect(() => {
    if (!open) {
      applied.current = 0
      setShift(0)
      return
    }

    const compute = () => {
      const rect = useLayout.getState().digits?.rect
      if (!rect) return

      const vw = window.innerWidth
      if (vw <= SHEET_BREAKPOINT) {
        applied.current = 0
        return setShift(null)
      }

      const inset =
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--inset')) || 24
      const panelWidth = Math.min(PANEL_MAX, vw - inset * 2)
      const panelLeft = vw - inset - panelWidth

      // Back out the transform to recover where the block would sit at rest.
      const restX = rect.x + applied.current
      const needed = restX + rect.width + GAP - panelLeft
      if (needed <= 0) {
        applied.current = 0
        return setShift(0)
      }

      // Never push the block past its own left margin. If it will not fit, the
      // panel becomes a sheet rather than the clock being cropped.
      const available = restX - inset
      const next = needed <= available ? needed : null
      applied.current = next ?? 0
      setShift(next)
    }

    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [open])

  return shift
}
