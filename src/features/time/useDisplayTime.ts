import { useMemo, useSyncExternalStore } from 'react'
import { useSettings } from '@/features/settings/settingsStore'
import { formatTime } from './formatTime'
import { getMinuteIndex, now, subscribeTick } from './timeStore'

/**
 * The React-facing view of the clock.
 *
 * The store notifies once a second, but the snapshot returned here is the
 * MINUTE index — an integer identical on 59 of every 60 notifications.
 * `useSyncExternalStore` compares snapshots with Object.is and bails out when
 * they match, so the component tree re-renders roughly once a minute rather
 * than sixty times a second.
 *
 * Everything sub-minute (the seconds track, the colon pulse, the sky) is
 * animated in the render loop against refs and uniforms, never through here.
 *
 * Note `now()` and not `localNow()`: `formatTime` applies the timezone itself
 * through Intl, so handing it an already-shifted timestamp would apply the
 * offset twice. `localNow()` is for the scene's arithmetic path only, which
 * does no Intl work of its own.
 */
export function useDisplayTime() {
  const minute = useSyncExternalStore(subscribeTick, getMinuteIndex, getMinuteIndex)
  const hour12 = useSettings((s) => s.hour12)
  const timeZone = useSettings((s) => s.timeZone)

  return useMemo(
    // `minute` is the cache key, not the value: formatting reads the live clock
    // so the seconds field is accurate at the moment of render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    () => formatTime(now(), { hour12, timeZone }),
    [minute, hour12, timeZone],
  )
}
