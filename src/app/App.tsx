import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Shell } from '@/ui/Shell'
import { useSettings } from '@/features/settings/settingsStore'
import { useWebGLSupport } from '@/hooks/useWebGLSupport'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useShortcuts } from '@/hooks/useShortcuts'

/**
 * three.js and its React bindings are roughly 180KB gzipped. Loading them
 * eagerly would mean an empty screen for a second or two on a phone, for a
 * clock that the DOM can already draw correctly and beautifully.
 *
 * So the shell paints first and the scene arrives afterwards and fades in over
 * it. The same decision gives us the no-WebGL path for free: if the scene never
 * loads, nothing is missing — the page is simply the 2D clock.
 */
const Scene = lazy(() => import('@/scene/Scene'))

export default function App() {
  const webgl = useWebGLSupport()
  const reduced = useReducedMotion()
  const [sceneReady, setSceneReady] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [status, setStatus] = useState('')

  const { hour12, theme, motion, setHour12, cycleTheme, setMotion } = useSettings()

  // Announce user-initiated changes only. This is what a polite live region is
  // for — not for shouting the time every second.
  useEffect(() => {
    setStatus(`Time format: ${hour12 ? '12-hour' : '24-hour'}`)
  }, [hour12])
  useEffect(() => {
    setStatus(
      theme === 'auto'
        ? 'Theme now follows the time of day'
        : `Theme: ${theme}`,
    )
  }, [theme])
  useEffect(() => {
    document.documentElement.dataset.motion = motion === 'reduced' ? 'reduced' : ''
  }, [motion])

  const shortcuts = useMemo(
    () => ({
      f: () => setHour12(!hour12),
      t: cycleTheme,
      i: () => setInfoOpen((v) => !v),
      m: () => {
        const next = motion === 'reduced' ? 'system' : 'reduced'
        setMotion(next)
        setStatus(next === 'reduced' ? 'Reduced motion on' : 'Reduced motion follows your system')
      },
      escape: () => setInfoOpen(false),
    }),
    [hour12, motion, setHour12, cycleTheme, setMotion],
  )
  useShortcuts(shortcuts)

  return (
    <>
      <div className="sky" aria-hidden="true" />

      {webgl && (
        <Suspense fallback={null}>
          <Scene
            reducedMotion={reduced}
            onReady={() => setSceneReady(true)}
            // A lost context is not an error state: fade the DOM clock back in
            // and most people will never notice it happened.
            onContextLost={() => setSceneReady(false)}
          />
        </Suspense>
      )}

      <Shell
        sceneReady={sceneReady}
        status={status}
        infoOpen={infoOpen}
        setInfoOpen={setInfoOpen}
      />
    </>
  )
}
