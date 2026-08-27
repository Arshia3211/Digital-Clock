import { useEffect, useState } from 'react'

let cached: boolean | null = null

/**
 * Probe for a real WebGL context rather than sniffing the browser. The context
 * is created and immediately released; if this returns false the DOM clock is
 * simply the whole experience, which it is already capable of being.
 */
export function detectWebGL(): boolean {
  if (cached !== null) return cached
  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl')
    cached = !!gl
    // Release the probe context immediately — browsers cap how many can exist.
    const lose = (gl as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context')
    lose?.loseContext()
  } catch {
    cached = false
  }
  return cached
}

export function useWebGLSupport() {
  const [ok, setOk] = useState<boolean | null>(null)
  useEffect(() => setOk(detectWebGL()), [])
  return ok
}
