import { create } from 'zustand'

export type SlotKind = 'digit' | 'colon' | 'period'

export interface Slot {
  id: string
  kind: SlotKind
  /** True for the empty padding cell in front of a single-digit 12-hour hour. */
  blank: boolean
  /** This slot's type size relative to the block's, straight from CSS. */
  scale: number
  /** Horizontal centre of the slot, in CSS pixels from the viewport's left edge. */
  centerX: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface DigitLayout {
  slots: Slot[]
  /** The whole digit block's box, in CSS pixels. */
  rect: Rect
  /** CSS font-size, which maps 1:1 onto three's TextGeometry `size`. */
  fontSizePx: number
  /** Vertical centre of the digits' INK, not of their line box. */
  inkCenterY: number
  /** Cap height in CSS pixels. */
  inkHeightPx: number
}

interface LayoutState {
  /**
   * Where the DOM clock has laid its digits out.
   *
   * The DOM clock stays in the layout even when the 3D one is showing — it just
   * fades to zero opacity — and the scene mirrors it slot by slot. So the
   * browser does the responsive typography (one `clamp()`, one place) and the
   * scene follows, instead of the same breakpoints being reimplemented as
   * camera arithmetic and drifting out of agreement.
   *
   * It also means the load handoff cannot pop: the 3D digits appear exactly
   * where the 2D ones already were.
   */
  digits: DigitLayout | null
  setDigits: (d: DigitLayout) => void
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.5

export const useLayout = create<LayoutState>((set) => ({
  digits: null,
  setDigits: (digits) =>
    set((s) => {
      const p = s.digits
      if (
        p &&
        p.slots.length === digits.slots.length &&
        near(p.fontSizePx, digits.fontSizePx) &&
        near(p.rect.x, digits.rect.x) &&
        near(p.rect.width, digits.rect.width) &&
        near(p.inkCenterY, digits.inkCenterY) &&
        near(p.inkHeightPx, digits.inkHeightPx) &&
        p.slots.every(
          (sl, i) =>
            sl.kind === digits.slots[i].kind &&
            sl.blank === digits.slots[i].blank &&
            near(sl.scale * 100, digits.slots[i].scale * 100) &&
            near(sl.centerX, digits.slots[i].centerX),
        )
      ) {
        return s
      }
      return { digits }
    }),
}))
