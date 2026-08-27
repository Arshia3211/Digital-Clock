import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color, DirectionalLight, HemisphereLight, LinearSRGBColorSpace } from 'three'
import { getPalette } from '@/features/theme/paletteEngine'
import { oklchToLinearSrgbInto } from '@/lib/color'

const scratch: [number, number, number] = [0, 0, 0]
const setLinear = (c: Color, o: readonly [number, number, number]) => {
  oklchToLinearSrgbInto(o as never, scratch)
  c.setRGB(scratch[0], scratch[1], scratch[2], LinearSRGBColorSpace)
}

const RAD = Math.PI / 180

/**
 * Exposure.
 *
 * Nothing in this scene is lit except the digits — the sky, the motes and the
 * seconds track are all unlit shaders. So these three lights are not simulating
 * an environment, they are controlling how bright the glyphs read, and the
 * palette's intensities are free to be authored as relative values with a
 * single gain applied here.
 *
 * The number is not taste. It is whatever makes `scripts/shoot.mjs` report at
 * least 4.5:1 between the rendered glyph faces and the rendered sky at every
 * hour, which is a thing that can be measured rather than argued about.
 */
const LIGHT_GAIN = 2.4

/**
 * Three lights. That is the entire budget, and it is enough.
 *
 * The key light IS the sun: its angle, colour temperature and intensity are all
 * read from the palette, which is read from the clock. At 06:00 it rakes in low
 * from the east and amber; at 13:00 it is high and neutral; at 02:00 it is gone
 * and the rim light — the moon — is doing the work.
 *
 * No shadow maps and no fog. Four floating glyphs cast almost nothing worth the
 * cost, and
 * the soft halo in the backdrop shader grounds the block better than a shadow
 * could without a visible surface for it to fall on.
 */
export function SceneLighting() {
  const key = useRef<DirectionalLight>(null)
  const rim = useRef<DirectionalLight>(null)
  const hemi = useRef<HemisphereLight>(null)

  useFrame(() => {
    const p = getPalette()

    if (key.current) {
      setLinear(key.current.color, p.keyLight)
      key.current.intensity = p.keyIntensity * LIGHT_GAIN
      // Azimuth sweeps the light left to right across the day and elevation
      // raises it, but Z stays firmly POSITIVE — in front of the digit plane.
      //
      // The obvious formula puts the sun on a true hemisphere around the
      // origin, which is physically tidy and visually wrong: for most of the
      // afternoon it ends up behind the glyphs and renders them as dark
      // silhouettes against a bright sky. The digits are the one thing in this
      // scene that must stay lit at every hour.
      const az = p.keyAzimuth * RAD
      const el = p.keyElevation * RAD
      key.current.position.set(
        -Math.cos(az) * Math.cos(el) * 9,
        Math.sin(el) * 9 + 1.5,
        5 + Math.abs(Math.sin(az)) * 3,
      )
    }

    if (rim.current) {
      setLinear(rim.current.color, p.rimLight)
      rim.current.intensity = p.rimIntensity * LIGHT_GAIN
    }

    if (hemi.current) {
      setLinear(hemi.current.color, p.ambient)
      setLinear(hemi.current.groundColor, p.bgBottom)
      hemi.current.intensity = p.ambientIntensity * LIGHT_GAIN
    }

  })

  return (
    <>
      <hemisphereLight ref={hemi} position={[0, 1, 0]} />
      <directionalLight ref={key} position={[-4, 3, 6]} />
      {/* Behind and to the left: separates the digits from the sky at night,
          when the key light has set and there is nothing else lighting them. */}
      <directionalLight ref={rim} position={[-6, 2, -8]} />
    </>
  )
}
