import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Color, LinearSRGBColorSpace, ShaderMaterial, Vector2 } from 'three'
import { getPalette } from '@/features/theme/paletteEngine'
import { oklchToLinearSrgbInto } from '@/lib/color'
import { sunScreenPosition, sunStrength } from '@/features/theme/sunPosition'
import { backdropFragment, backdropVertex } from './shaders/backdrop'

const scratch: [number, number, number] = [0, 0, 0]

/** Writes an OKLCH palette colour into a three Color without allocating. */
function setLinear(c: Color, o: readonly [number, number, number]) {
  oklchToLinearSrgbInto(o as never, scratch)
  c.setRGB(scratch[0], scratch[1], scratch[2], LinearSRGBColorSpace)
}

interface Props {
  /** Digit block centre and half-size in normalised screen space, for the halo. */
  haloCenter: [number, number]
  haloSize: [number, number]
  reducedMotion: boolean
}

export function Backdrop({ haloCenter, haloSize, reducedMotion }: Props) {
  const size = useThree((s) => s.size)
  const mat = useRef<ShaderMaterial>(null)

  const uniforms = useMemo(
    () => ({
      uTop: { value: new Color() },
      uMid: { value: new Color() },
      uBottom: { value: new Color() },
      uSun: { value: new Color() },
      uSunPos: { value: new Vector2(0.5, 0.9) },
      uSunStrength: { value: 0 },
      uTime: { value: 0 },
      uWarp: { value: 0 },
      uClockCenter: { value: new Vector2(0.5, 0.54) },
      uClockSize: { value: new Vector2(0.4, 0.16) },
      uHalo: { value: 0.16 },
      uAspect: { value: 1 },
    }),
    [],
  )

  useFrame((_, dt) => {
    const p = getPalette()
    const u = uniforms

    setLinear(u.uTop.value, p.bgTop)
    setLinear(u.uMid.value, p.bgMid)
    setLinear(u.uBottom.value, p.bgBottom)
    setLinear(u.uSun.value, p.keyLight)

    const sun = sunScreenPosition(p)
    u.uSunPos.value.set(sun.x, sun.y)
    u.uSunStrength.value = sunStrength(p)

    u.uHalo.value = p.halo
    u.uWarp.value = reducedMotion ? 0 : 0.02
    if (!reducedMotion) u.uTime.value += dt

    u.uAspect.value = size.width / size.height
    u.uClockCenter.value.set(haloCenter[0], haloCenter[1])
    u.uClockSize.value.set(haloSize[0], haloSize[1])
  })

  return (
    // A full-screen triangle-pair in clip space: no camera involvement, no
    // depth, one draw call. `frustumCulled` off because its vertices are
    // already in clip coordinates and the culler would misjudge them.
    <mesh frustumCulled={false} renderOrder={-1}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={mat}
        vertexShader={backdropVertex}
        fragmentShader={backdropFragment}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}
