import { create } from 'zustand'
import type { ThemeMode } from '@/types'
import { setTimeZone as setClockZone, systemTimeZone } from '@/features/time'
import { readUrlState, writeUrlState } from './urlState'

const KEY = 'tick.settings.v1'

interface Persisted {
  hour12: boolean
  theme: ThemeMode
  motion: 'system' | 'reduced'
  timeZone: string
}

/**
 * Every read and write is wrapped: localStorage throws outright in some
 * privacy modes rather than returning null, and a settings read is not worth
 * taking the page down for.
 */
function load(): Partial<Persisted> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    return {}
  }
}

function save(v: Persisted) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}

/** Default to whatever the user's locale actually uses, not to a hardcoded guess. */
const localePrefersHour12 = () => {
  const hc = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle
  return hc === 'h11' || hc === 'h12'
}

interface SettingsState extends Persisted {
  setHour12: (v: boolean) => void
  cycleTheme: () => void
  setTheme: (t: ThemeMode) => void
  setMotion: (m: 'system' | 'reduced') => void
  setTimeZone: (tz: string) => void
}

// The URL wins over storage: a shared link should show what it says.
const initial = { ...load(), ...readUrlState() }

export const useSettings = create<SettingsState>((set, get) => {
  const persist = () => {
    const { hour12, theme, motion, timeZone } = get()
    save({ hour12, theme, motion, timeZone })
    writeUrlState({ hour12, timeZone }, systemTimeZone())
  }

  return {
    hour12: initial.hour12 ?? localePrefersHour12(),
    theme: initial.theme ?? 'auto',
    motion: initial.motion ?? 'system',
    timeZone: initial.timeZone ?? systemTimeZone(),

    setHour12: (v) => {
      set({ hour12: v })
      persist()
    },
    setTheme: (theme) => {
      set({ theme })
      persist()
    },
    cycleTheme: () => {
      const order: ThemeMode[] = ['auto', 'light', 'dark']
      const next = order[(order.indexOf(get().theme) + 1) % order.length]
      set({ theme: next })
      persist()
    },
    setMotion: (motion) => {
      set({ motion })
      persist()
    },
    setTimeZone: (timeZone) => {
      set({ timeZone })
      setClockZone(timeZone)
      persist()
    },
  }
})

// The clock engine owns the zone for its per-frame offset arithmetic; keep it
// in step with whatever was restored from storage or read off the URL.
setClockZone(useSettings.getState().timeZone)
