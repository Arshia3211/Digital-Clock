import { useEffect } from 'react'

type Handlers = Record<string, () => void>

/**
 * Single-key shortcuts, guarded so they cannot fire while the user is typing or
 * holding a modifier — otherwise Ctrl+F would silently flip the time format.
 */
export function useShortcuts(handlers: Handlers) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return

      const fn = handlers[e.key.toLowerCase()]
      if (!fn) return
      e.preventDefault()
      fn()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handlers])
}
