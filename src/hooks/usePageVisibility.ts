import { useSyncExternalStore } from 'react'

const subscribe = (cb: () => void) => {
  document.addEventListener('visibilitychange', cb)
  window.addEventListener('focus', cb)
  window.addEventListener('blur', cb)
  return () => {
    document.removeEventListener('visibilitychange', cb)
    window.removeEventListener('focus', cb)
    window.removeEventListener('blur', cb)
  }
}

const isVisible = () => document.visibilityState === 'visible'

/** Drives the render loop on and off. This page gets left open for hours. */
export function usePageVisibility() {
  return useSyncExternalStore(subscribe, isVisible, () => true)
}
