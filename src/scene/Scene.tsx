import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useLayout } from '@/features/theme/layoutStore'
import { useSettings } from '@/features/settings/settingsStore'
import { useScrub } from '@/features/theme/scrubStore'
import { subscribeTick } from '@/features/time'
import { resolvedTier } from '@/hooks/useDeviceTier'
import { usePageVisibility } from '@/hooks/usePageVisibility'
import { damp } from '@/lib/damp'
import { clamp } from '@/lib/clamp'
import type { DeviceTier } from '@/types'
import { PerformanceGuard } from './PerformanceGuard'
import { Backdrop } from './Backdrop'
import { SceneLighting } from './SceneLighting'
import { ClockDigits } from './ClockDigits'
import { Particles } from './Particles'
import { frustumAt, placeDigits } from './framing'
import { loadGlyphs, type GlyphSet } from './digitGeometry'

/**
 * A narrow field of view. The three.js default of 75 degrees distorts badly at
 * the frame edges and reads as a video game; 35 reads as a product shot. It is
 * the most-skipped setting in unconsidered three.js scenes.
 */
const FOV = 35
const CAMERA_Z = 8

/** Above 2 renders pixels nobody can resolve, at four times the cost. */
const MAX_DPR: Record<DeviceTier, number> = { high: 2, medium: 2, low: 1.75 }

function useGlyphs(tier: DeviceTier) {
  const [set, setSet] = useState<GlyphSet | null>(null)
  useEffect(() => {
    let live = true
    loadGlyphs(tier)
      .then((g) => live && setSet(g))
      .catch((e) => console.warn('[tick] glyphs failed to load', e))
    return () => {
      live = false
    }
  }, [tier])
  return set
}

/** Fires once real frames are on screen, so the crossfade starts on content. */
function ReadySignal({ onReady }: { onReady: () => void }) {
  const frames = useRef(0)
  useFrame(() => {
    if (frames.current < 0) return
    if (++frames.current >= 2) {
      frames.current = -1
      onReady()
    }
  })
  return null
}

/**
 * Under reduced motion the scene has nothing to animate between events, so the
 * render loop switches to on-demand and is woken by the clock tick instead of
 * running sixty times a second. On a page people leave open all day that is a
 * real battery saving, not a micro-optimisation.
 */
function DemandDriver() {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    // Wrapped: zustand hands subscribers the new state, and invalidate reads
    // its first argument as a frame count.
    const wake = () => invalidate()
    const unsubTick = subscribeTick(wake)
    const unsubScrub = useScrub.subscribe(wake)
    const unsubSettings = useSettings.subscribe(wake)
    invalidate()
    return () => {
      unsubTick()
      unsubScrub()
      unsubSettings()
    }
  }, [invalidate])
  return null
}

function ContextGuard({ onLost }: { onLost: () => void }) {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const el = gl.domElement
    const lost = (e: Event) => {
      // Without preventDefault the browser will not attempt a restore at all.
      e.preventDefault()
      onLost()
    }
    el.addEventListener('webglcontextlost', lost)
    return () => el.removeEventListener('webglcontextlost', lost)
  }, [gl, onLost])
  return null
}

interface ContentProps {
  glyphs: GlyphSet
  tier: DeviceTier
  reducedMotion: boolean
}

function SceneContent({ glyphs, tier, reducedMotion }: ContentProps) {
  const size = useThree((s) => s.size)
  const layout = useLayout((s) => s.digits)

  // The pointer target and its damped value are plain mutable objects, not
  // state: they change every frame and must never reach React.
  const tiltTarget = useRef({ x: 0, y: 0 })
  const tilt = useMemo(() => ({ x: 0, y: 0 }), [])

  useEffect(() => {
    if (reducedMotion || window.matchMedia('(pointer: coarse)').matches) {
      tiltTarget.current.x = 0
      tiltTarget.current.y = 0
      return
    }
    const onMove = (e: PointerEvent) => {
      tiltTarget.current.x = (e.clientX / window.innerWidth) * 2 - 1
      tiltTarget.current.y = (e.clientY / window.innerHeight) * 2 - 1
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [reducedMotion])

  useFrame((_, dt) => {
    // Exponential damping rather than a fixed lerp factor, so the settle feels
    // identical on a 60Hz and a 120Hz display.
    tilt.x = damp(tilt.x, tiltTarget.current.x, 4.5, dt)
    tilt.y = damp(tilt.y, tiltTarget.current.y, 4.5, dt)
  })

  const frustum = useMemo(
    () => frustumAt(CAMERA_Z, FOV, size.height, size.width / size.height),
    [size.height, size.width],
  )

  const placement = useMemo(
    () => (layout ? placeDigits(layout, frustum, size.width, size.height) : null),
    [layout, frustum, size.width, size.height],
  )

  const derived = useMemo(() => {
    if (!placement || !placement.slots.length) return null
    // Blank padding cells and the AM/PM marker are excluded: the track should
    // span the digits, not the whitespace in front of them.
    const xs = placement.slots.filter((s) => s.kind !== 'period' && !s.blank).map((s) => s.x)
    const min = Math.min(...xs)
    const max = Math.max(...xs)
    const cell = 0.66 * placement.scale
    const blockWidth = max - min + cell
    return {
      blockWidth,
      blockCenterX: (min + max) / 2,
      // Normalised screen space for the backdrop halo. The shader uv origin is
      // bottom-left, so y is flipped relative to the DOM measurement.
      haloCenter: [
        0.5 + (min + max) / 2 / frustum.width,
        0.5 + placement.centerY / frustum.height,
      ] as [number, number],
      // Wide enough to take in the date line as well as the digits, since that
      // text has to clear AA against the same sky.
      haloSize: [
        (blockWidth * 1.5) / frustum.width,
        (placement.inkHeight * 4.2) / frustum.height,
      ] as [number, number],
    }
  }, [placement, frustum])

  const bounds = useMemo(
    // Wider than the visible frame: the motes sit well behind the digit plane,
    // where the frustum has spread out, so matching the near-plane extent would
    // leave the corners empty.
    () => [frustum.width * 1.15, frustum.height * 1.15, 1] as [number, number, number],
    [frustum],
  )

  return (
    <>
      <Backdrop
        haloCenter={derived?.haloCenter ?? [0.5, 0.54]}
        haloSize={derived?.haloSize ?? [0.35, 0.2]}
        reducedMotion={reducedMotion}
      />
      <SceneLighting />
      <Particles tier={tier} bounds={bounds} reducedMotion={reducedMotion} />

      {placement && derived && (
        <ClockDigits
          glyphs={glyphs}
          placement={placement}
          reducedMotion={reducedMotion}
          tilt={tilt}
        />
      )}
    </>
  )
}

interface Props {
  reducedMotion: boolean
  onReady: () => void
  onContextLost: () => void
}

export default function Scene({ reducedMotion, onReady, onContextLost }: Props) {
  const tier = useMemo(resolvedTier, [])
  const glyphs = useGlyphs(tier)
  const visible = usePageVisibility()
  const [dpr, setDpr] = useState(() => clamp(window.devicePixelRatio || 1, 1, MAX_DPR[tier]))
  const [ready, setReady] = useState(false)
  const [lost, setLost] = useState(false)

  const handleReady = useCallback(() => {
    setReady(true)
    onReady()
  }, [onReady])

  const handleLost = useCallback(() => {
    setLost(true)
    onContextLost()
  }, [onContextLost])

  // Step resolution down under sustained load rather than dropping frames.
  const decline = useCallback(() => setDpr((d) => Math.max(1, d - 0.25)), [])

  if (lost || !glyphs) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 5,
        opacity: ready ? 1 : 0,
        transition: 'opacity var(--dur-reveal) var(--ease-out)',
      }}
      aria-hidden="true"
    >
      <Canvas
        dpr={dpr}
        // Hidden tab: stop rendering entirely. This page gets left open for
        // hours, and burning GPU behind a background tab is both a battery cost
        // and the first thing anyone checks.
        frameloop={!visible ? 'never' : reducedMotion ? 'demand' : 'always'}
        camera={{ fov: FOV, position: [0, 0, CAMERA_Z], near: 0.1, far: 60 }}
        gl={{
          antialias: true,
          // The backdrop covers every pixel, so there is nothing to composite
          // against and an alpha buffer would be wasted bandwidth.
          alpha: false,
          powerPreference: 'high-performance',
        }}
        flat
      >
        <PerformanceGuard onDecline={decline} onFallback={() => setDpr(1)} />
        <ContextGuard onLost={handleLost} />
        {reducedMotion && <DemandDriver />}
        <ReadySignal onReady={handleReady} />
        <SceneContent glyphs={glyphs} tier={tier} reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  )
}
