import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  Color,
  Group,
  LinearSRGBColorSpace,
  Mesh,
  MeshStandardMaterial,
} from 'three'
import { getPalette } from '@/features/theme/paletteEngine'
import { getTimeZone, now, subscribeResync } from '@/features/time'
import { zoneParts, type ZoneParts } from '@/features/time/zoneParts'
import { useSettings } from '@/features/settings/settingsStore'
import { oklchToLinearSrgbInto } from '@/lib/color'
import { stepSpring, type SpringState } from '@/lib/damp'
import type { GlyphSet } from './digitGeometry'
import type { Placement } from './framing'

const scratch: [number, number, number] = [0, 0, 0]
const setLinear = (c: Color, o: readonly [number, number, number]) => {
  oklchToLinearSrgbInto(o as never, scratch)
  c.setRGB(scratch[0], scratch[1], scratch[2], LinearSRGBColorSpace)
}

/** Slots that roll when their value changes. Seconds are excluded on purpose:
 *  a spring landing sixty times a minute stops reading as a moment and starts
 *  reading as a flicker. */
const ROLLING_IDS = ['h0', 'h1', 'm0', 'm1'] as const

const SPRING_STIFFNESS = 220
const SPRING_DAMPING = 21 // just under critical: one small settle, no wobble

interface Props {
  glyphs: GlyphSet
  placement: Placement
  reducedMotion: boolean
  /** Pointer position in [-1, 1], already damped by the parent. */
  tilt: { x: number; y: number }
}

/**
 * The clock, in three dimensions.
 *
 * Nothing here goes through React. The digits are read from the wall clock
 * inside `useFrame`, compared against what each slot is currently showing, and
 * swapped by reassigning a cached geometry. The component tree renders when the
 * LAYOUT changes — a resize, a format switch — and not otherwise.
 */
export function ClockDigits({ glyphs, placement, reducedMotion, tilt }: Props) {
  const hour12 = useSettings((s) => s.hour12)

  const group = useRef<Group>(null)
  const meshes = useRef<Record<string, Mesh | null>>({})
  const shown = useRef<Record<string, string>>({})
  const springs = useRef<Record<string, SpringState>>({})
  const parts = useRef<ZoneParts>(zoneParts(now(), getTimeZone(), hour12))
  const lastHour = useRef(-1)
  const hourRecoil = useRef<SpringState>({ value: 0, velocity: 0 })

  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        // Soft-touch plastic, not glass and not metal. Cheap to render, holds
        // up under every lighting phase, and legible at every hour — which
        // transmission and bloom emphatically are not.
        roughness: 0.42,
        metalness: 0,
        // See SceneLighting: fog here only dimmed the glyphs toward the sky.
        fog: false,
      }),
    [],
  )
  useEffect(() => () => material.dispose(), [material])

  const spring = (id: string) => (springs.current[id] ??= { value: 0, velocity: 0 })

  // A timeline jump — tab restored, laptop woken, timezone changed — must snap.
  // Watching forty minutes of digit rolls catch up would be absurd.
  useEffect(
    () =>
      subscribeResync(() => {
        for (const id of Object.keys(springs.current)) {
          springs.current[id].value = 0
          springs.current[id].velocity = 0
        }
        shown.current = {}
        hourRecoil.current.value = 0
        hourRecoil.current.velocity = 0
      }),
    [],
  )

  // Switching format changes what every slot should show, immediately.
  useEffect(() => {
    shown.current = {}
  }, [hour12])

  const slotById = useMemo(() => {
    const m: Record<string, Placement['slots'][number]> = {}
    for (const s of placement.slots) m[s.id] = s
    return m
  }, [placement])

  const baseY = placement.centerY - placement.inkHeight / 2

  useFrame((_, dt) => {
    const p = getPalette()
    setLinear(material.color, p.digit)
    setLinear(material.emissive, p.digit)
    // At night the sun is below the horizon and the key light is nearly off, so
    // without this the digits would simply go dark. A small emissive keeps them
    // reading as lit objects rather than painted ones.
    material.emissiveIntensity = p.digitEmissive

    const t = zoneParts(now(), getTimeZone(), hour12, parts.current)

    if (lastHour.current !== t.hour24) {
      if (lastHour.current !== -1 && !reducedMotion) hourRecoil.current.velocity = -1.6
      lastHour.current = t.hour24
    }

    const chars: Record<string, string> = {
      h0: t.h0,
      h1: t.h1,
      m0: t.m0,
      m1: t.m1,
      colon: ':',
      colon2: ':',
      s0: t.s0,
      s1: t.s1,
      period: t.isPm ? 'PM' : 'AM',
    }

    for (const id of Object.keys(chars)) {
      const mesh = meshes.current[id]
      const slot = slotById[id]
      if (!mesh || !slot) continue

      const want = chars[id]
      if (shown.current[id] !== want) {
        shown.current[id] = want
        const geo = want === ' ' ? null : glyphs.geometries.get(want)
        mesh.visible = !!geo
        if (geo) mesh.geometry = geo
        // A rollover only animates for the digits; the colon and AM/PM would
        // just be noise.
        if (!reducedMotion && ROLLING_IDS.includes(id as never)) {
          spring(id).value = 1
          spring(id).velocity = 0
        }
      }

      const s = spring(id)
      if (reducedMotion) {
        s.value = 0
        s.velocity = 0
      } else {
        stepSpring(s, 0, SPRING_STIFFNESS, SPRING_DAMPING, dt)
      }

      // Relative size comes from the DOM, so CSS remains the only place the
      // type hierarchy is expressed.
      const scale = placement.scale * slot.scale

      mesh.position.x = slot.x
      // The new glyph drops in from just above and settles. Deliberately NOT a
      // flip: a digit rotated edge-on is unreadable, and the one thing the
      // animation must never do is make the time harder to read.
      mesh.position.y = baseY + s.value * 0.2 * placement.scale
      mesh.position.z = 0
      mesh.rotation.x = -s.value * 0.55
      mesh.scale.setScalar(scale * (1 - s.value * 0.04))

      // The colon sits high in the em box and reads as misaligned against type
      // this large; the same optical nudge the CSS applies.
      if (id === 'colon') mesh.position.y += 0.03 * placement.scale
    }

    // Hour change: the whole block recoils a couple of percent and settles.
    stepSpring(hourRecoil.current, 0, 90, 13, dt)
    const g = group.current
    if (g) {
      g.scale.setScalar(1 + hourRecoil.current.value * 0.02)
      // Tilting the GROUP rather than moving the camera keeps the digits locked
      // to their DOM positions, and showing the extrusion sides reads as more
      // solid than a camera move would.
      g.rotation.y = reducedMotion ? 0 : tilt.x * 0.055
      g.rotation.x = reducedMotion ? 0 : -tilt.y * 0.035
    }
  })

  return (
    <group ref={group}>
      {placement.slots.map((s) => (
        <mesh
          key={s.id}
          ref={(m) => {
            meshes.current[s.id] = m
          }}
          material={material}
          castShadow={false}
          receiveShadow={false}
        />
      ))}
    </group>
  )
}
