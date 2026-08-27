/**
 * The sky.
 *
 * Three stops at the same positions as the CSS gradient in `global.css`, so the
 * canvas can fade in over the DOM version with no visible seam. Everything else
 * here exists for one of two reasons: banding, or contrast.
 */

export const backdropVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`

export const backdropFragment = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform vec3  uTop;
  uniform vec3  uMid;
  uniform vec3  uBottom;
  uniform vec3  uSun;
  uniform vec2  uSunPos;
  uniform float uSunStrength;
  uniform float uTime;
  uniform float uWarp;
  uniform vec2  uClockCenter;
  uniform vec2  uClockSize;
  uniform float uHalo;
  uniform float uAspect;

  // Cheap hash. Used only for dithering, where quality matters far less than
  // being decorrelated from the gradient itself.
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  // Two octaves of value noise is plenty for a warp this subtle.
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  void main() {
    vec2 uv = vUv;

    // A very low frequency, very low amplitude drift. If you can clearly see
    // this moving, it is turned up too far.
    float w = (noise(uv * 2.0 + vec2(uTime * 0.008, uTime * 0.005)) - 0.5) * uWarp;
    float y = clamp(1.0 - uv.y + w, 0.0, 1.0);

    // Matches linear-gradient(180deg, top 0%, mid 52%, bottom 100%).
    vec3 col = y < 0.52
      ? mix(uTop, uMid, smoothstep(0.0, 0.52, y))
      : mix(uMid, uBottom, smoothstep(0.52, 1.0, y));

    // The implied sun. Not a lens flare — just the sky being brighter where the
    // light is coming from, which is what sells the time of day.
    vec2 d = (uv - uSunPos) * vec2(uAspect, 1.0);
    float sun = exp(-dot(d, d) * 3.2) * uSunStrength;
    col += uSun * sun;

    // The scrim. Wide, soft, and centred on the clock.
    //
    // It does three jobs for one exp(): it grounds a block of glyphs that has no
    // surface to cast onto, it lets the sky be as bright as a real midday sky
    // while the text stays at AA, and it keeps the foreground from ever having
    // to flip light-to-dark. The falloff is deliberately gentle — anything
    // tighter reads as a dark blob with an edge instead of as haze.
    vec2 h = (uv - uClockCenter) / max(uClockSize, vec2(0.001));
    col *= 1.0 - uHalo * exp(-dot(h, h) * 0.8);

    // Dither. Eight-bit output bands a smooth gradient into visible stripes,
    // and that banding is the single thing that makes an otherwise good WebGL
    // gradient look cheap. Two lines, enormous difference.
    col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;

    gl_FragColor = vec4(col, 1.0);
  }
`
