import { useSyncExternalStore } from 'react'

const stores = new Map<string, { subscribe: (cb: () => void) => () => void; get: () => boolean }>()

function storeFor(query: string) {
  let s = stores.get(query)
  if (!s) {
    const mql = window.matchMedia(query)
    s = {
      subscribe: (cb) => {
        mql.addEventListener('change', cb)
        return () => mql.removeEventListener('change', cb)
      },
      get: () => mql.matches,
    }
    stores.set(query, s)
  }
  return s
}

/** Live media query. Re-evaluates when the user changes the setting mid-session. */
export function useMediaQuery(query: string, serverFallback = false) {
  const s = typeof window === 'undefined' ? null : storeFor(query)
  return useSyncExternalStore(
    s ? s.subscribe : () => () => {},
    s ? s.get : () => serverFallback,
    () => serverFallback,
  )
}
