import { useSettings } from '@/features/settings/settingsStore'
import type { ThemeMode } from '@/types'

const LABEL: Record<ThemeMode, string> = {
  auto: 'Theme: following the time of day',
  light: 'Theme: light',
  dark: 'Theme: dark',
}

const NEXT: Record<ThemeMode, string> = {
  auto: 'light',
  light: 'dark',
  dark: 'automatic',
}

function Icon({ mode }: { mode: ThemeMode }) {
  const common = { width: 15, height: 15, viewBox: '0 0 16 16', 'aria-hidden': true } as const
  if (mode === 'dark') {
    return (
      <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="8" cy="8" r="3.1" />
      <path d="M8 1v1.6M8 13.4V15M15 8h-1.6M2.6 8H1M12.9 3.1l-1.1 1.1M4.2 11.8l-1.1 1.1M12.9 12.9l-1.1-1.1M4.2 4.2 3.1 3.1"
        strokeLinecap="round" />
    </svg>
  )
}

/**
 * Cycles auto -> light -> dark. "Auto" is the default and is a real state, not
 * an absence of one: it means the palette follows the sun. The badge exists
 * because an icon alone cannot distinguish "it is light because you asked" from
 * "it is light because it is nine in the morning".
 */
export function ThemeToggle() {
  const theme = useSettings((s) => s.theme)
  const cycleTheme = useSettings((s) => s.cycleTheme)

  return (
    <button
      type="button"
      className="chip-button"
      onClick={cycleTheme}
      aria-label={`${LABEL[theme]}. Activate to switch to ${NEXT[theme]}.`}
      title={LABEL[theme]}
    >
      <Icon mode={theme === 'dark' ? 'dark' : 'light'} />
      <span aria-hidden="true" style={{ fontSize: 'var(--text-2xs)', letterSpacing: '0.1em' }}>
        {theme === 'auto' ? 'AUTO' : theme === 'light' ? 'LIGHT' : 'DARK'}
      </span>
    </button>
  )
}
