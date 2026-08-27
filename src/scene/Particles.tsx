import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending,
  Color,
  LinearSRGBColorSpace,
  NormalBlending,
  Points,
  ShaderMaterial,
} from 'three'
import { getPalette } from '@/features/theme/paletteEngine'
import { oklchToLinearSrgbInto } from '@/lib/color'
import type { DeviceTier } from '@/types'

const scratch: [number, number, number] = [0, 0, 0]

const COUNT: Record<DeviceTier, number> = { high: 520, medium: 280, low: 120 }

/**
 * Depth range, in world units behind the digit plane at z = 0.
 *
 * Keeping every mote behind the glyphs is not an aesthetic preference: with
 * particles in front, dust drifts across the numerals and the one rule the
 * scene must never break — that the 3D never makes the time harder to read —
 * is broken sixty times a second. Behind the plane, the depth test handles it
 * for free.
 */
const DEPTH_NEAR = -1.5
const DEPTH_FAR = -9

const vertex = /* glsl */ `
  attribute vec3  aSeed;
  attribute vec3  aDrift;
  attribute float aSize;

  uniform float uTime;
  uniform float uSpeed;
  uniform vec3  uBounds;
  uniform float uScale;

  varying float vFade;

  void main() {
    vec3 p = aSeed;

    // All motion happens here. Updating a BufferAttribute from JavaScript each
    // frame would mean re-uploading the whole buffer sixty times a second for
    // something the GPU can derive from a single uniform.
    p.y += sin(uTime * aDrift.y * uSpeed + aSeed.x * 3.1) * 0.55;
    p.x += sin(uTime * aDrift.x * uSpeed + aSeed.y * 2.3) * 0.4;
    p.y = mod(p.y + uTime * uSpeed * aDrift.z * 0.35 + uBounds.y, uBounds.y * 2.0) - uBounds.y;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);

    // Dissolve toward the edges of the volume instead of popping at the border.
    vFade = smoothstep(uBounds.y, uBounds.y * 0.62, abs(p.y))
          * smoothstep(uBounds.x, uBounds.x * 0.78, abs(p.x));

    gl_PointSize = aSize * uScale / max(-mv.z, 0.001);
    gl_Position = projectionMatrix * mv;
  }
`

const fragment = /* glsl */ `
  precision mediump float;
  uniform vec3  uColor;
  uniform float uOpacity;
  varying float vFade;

  void main() {
    // A soft round sprite straight from gl_PointCoord: no texture, no fetch,
    // no bytes in the bundle.
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.08, d) * uOpacity * vFade;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
  }
`

interface Props {
  tier: DeviceTier
  bounds: [number, number, number]
  reducedMotion: boolean
}

/**
 * Dust in the light.
 *
 * Passes the test everything in this scene has to pass — is it a consequence of
 * the time? Density, drift rate and colour all come from the palette, so the
 * motes are warm and lazy in afternoon light, nearly invisible at midday, and
 * cool and slow at night. A decorative particle field would have been cut.
 */
export function Particles({ tier, bounds, reducedMotion }: Props) {
  const points = useRef<Points>(null)
  const mat = useRef<ShaderMaterial>(null)
  const count = COUNT[tier]

  const attrs = useMemo(() => {
    const seed = new Float32Array(count * 3)
    const drift = new Float32Array(count * 3)
    const size = new Float32Array(count)

    // A cheap deterministic generator seeded per mount: stable while running,
    // reshuffled on a fresh visit, so returning is not pixel-identical.
    let s = (Date.now() % 100000) + 1
    const rnd = () => {
      s = (s * 16807) % 2147483647
      return s / 2147483647
    }

    for (let i = 0; i < count; i++) {
      seed[i * 3] = (rnd() * 2 - 1) * bounds[0]
      seed[i * 3 + 1] = (rnd() * 2 - 1) * bounds[1]
      seed[i * 3 + 2] = DEPTH_NEAR + rnd() * (DEPTH_FAR - DEPTH_NEAR)
      drift[i * 3] = 0.1 + rnd() * 0.3
      drift[i * 3 + 1] = 0.1 + rnd() * 0.35
      drift[i * 3 + 2] = 0.4 + rnd() * 1.1
      size[i] = 2 + rnd() * 5.5
    }
    return { seed, drift, size }
  }, [count, bounds])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uSpeed: { value: 0.4 },
      uColor: { value: new Color() },
      uOpacity: { value: 0 },
      uBounds: { value: bounds },
      uScale: { value: 17 },
    }),
    [bounds],
  )

  useFrame((_, dt) => {
    const p = getPalette()
    oklchToLinearSrgbInto(p.particle as never, scratch)
    uniforms.uColor.value.setRGB(scratch[0], scratch[1], scratch[2], LinearSRGBColorSpace)
    uniforms.uOpacity.value = p.particleOpacity
    uniforms.uSpeed.value = p.particleSpeed

    // Under reduced motion the field is still rendered, just still. Removing it
    // would make the reduced variant feel like a broken version of the full one
    // rather than a designed alternative.
    if (!reducedMotion) uniforms.uTime.value += dt

    if (mat.current) {
      // Additive reads as glowing motes against a night sky and as blown-out
      // haze in daylight, so the blend mode follows the sky.
      const want = p.bgMid[0] < 0.3 ? AdditiveBlending : NormalBlending
      if (mat.current.blending !== want) {
        mat.current.blending = want
        mat.current.needsUpdate = true
      }
    }
  })

  return (
    <points ref={points} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[attrs.seed, 3]} />
        <bufferAttribute attach="attributes-aSeed" args={[attrs.seed, 3]} />
        <bufferAttribute attach="attributes-aDrift" args={[attrs.drift, 3]} />
        <bufferAttribute attach="attributes-aSize" args={[attrs.size, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={mat}
        vertexShader={vertex}
        fragmentShader={fragment}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </points>
  )
}
