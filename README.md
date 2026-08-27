# TICK

**A clock whose world tracks the sun.**

A single-screen, real-time clock built with React, TypeScript and three.js. The
scene is not a backdrop with a clock on it: every colour, the angle and warmth
of the light, the fog density and the drift of the motes are derived from one
value — the current local time of day.

```
npm install
npm run dev
```

---

## The idea, and the constraint that produced it

A 3D clock is one of the most common WebGL toy projects there is, and almost all
of them look the same: dark background, glowing digits, bloom. The whole project
is built around one rule that keeps it out of that category.

> Every 3D element must be either **the time itself** or **a consequence of the
> time**. Anything that is neither gets cut.

Particles pass — their density, speed and colour come from the palette, which
comes from the clock. A rotating torus knot in the background would not, so
there isn't one. Neither is there bloom, glass, refraction or post-processing:
they are expensive, they are what every other WebGL clock does, and refractive
digits are *harder to read*.

Dawn is cold and rose. Midday is bright and flat. Evening light rakes in low and
warm, and you can see it on the bevels of the numerals. At 2am the sun is gone
and the glyphs are lit by their own faint emission and a cool rim light.

That change happens over twenty-four hours, which means a visitor sees a still
frame of it. **Open the info panel and press "Watch a day"** — it runs the whole
cycle in twenty seconds. It began as a tool for tuning the palette and stayed
because without it the central idea is invisible.

---

## Architecture

### One number of truth

The entire application holds exactly one piece of time state: a UTC timestamp.
Digits, date, sky colour, sun angle and fog are all derived at the point of use.
Nothing caches "the current hour".

A convenient side effect: overriding `Date.now` is enough to move the whole
world. That is how `scripts/shoot.mjs` photographs every hour of the day.

### The render budget

The clock updates continuously; React does not.

```
                    Date.now()
                        |
      self-correcting setTimeout        requestAnimationFrame
                        |                         |
                   timeStore ------------+--------+
                                         |
         +-------------------------------+-------------------------------+
         v                                                               v
  useSyncExternalStore                                       useFrame reads now()
  snapshot = MINUTE index                                    writes uniforms direct
  -> ~1 render / minute                                      -> 0 React renders
```

`timeStore` notifies once a second, but the snapshot React sees is the *minute*
index — an integer identical on 59 of every 60 notifications, so
`useSyncExternalStore` bails out and the tree does not re-render. Everything
sub-minute (the seconds track, the colon, the sky, the parallax) is animated
against refs and uniforms and never touches React at all.

Open the React DevTools render highlighter and let it run: it flashes once a
minute.

### Why both `setTimeout` and `requestAnimationFrame`

They do different jobs. `setInterval(fn, 1000)` drifts — the callback takes
time, background tabs get throttled, and the error compounds. The scheduler in
`features/time/scheduler.ts` re-anchors to the wall clock after every tick, so
it can fire late once after an hour of throttling and then land straight back on
the boundary. That drives *semantics*. `requestAnimationFrame` drives *pixels*.

Timeline jumps — tab restored, laptop woken, timezone changed — emit a resync,
and animations snap rather than playing forty minutes of catch-up.

### Progressive enhancement, which is also the fallback

three.js is about 180KB gzipped. Loading it eagerly means an empty screen on a
phone for a clock the DOM can already draw. So the shell paints first and the
scene fades in over it.

The same decision produces the no-WebGL path for free. `ui/` never imports from
`scene/` — the DOM clock is a complete, styled, palette-tracking experience with
the entire `scene/` directory deleted. It is not a degraded state; it is the
first second of every visit.

### The 3D digits are fitted to the DOM ones

The DOM clock stays in the layout permanently and only fades to zero opacity.
The scene measures its box and mirrors it slot by slot.

That means the browser does the responsive typography — one `clamp()`, in one
place — and the scene follows, instead of the same breakpoints being
reimplemented as camera arithmetic and drifting out of agreement. It also means
the load handoff cannot pop: the 3D digits appear exactly where the 2D ones
already were.

Two details make it exact rather than approximate:

- **Glyphs are built at `size: 1`**, where one unit is one em — precisely what
  CSS `font-size` means. A slot scales by the DOM font size in world units.
- **Placement uses ink extents, not the line box.** A CSS line box is taller
  than the numerals inside it and is not centred on them. `measureDigits.ts`
  uses canvas `measureText` to find where the glyphs actually sit, so the 3D
  lands on the ink instead of half a leading below it.

### Colour lives in one file

`features/theme/palettes.ts` is the single source for every colour and light
parameter. The DOM reads it as CSS custom properties; the scene reads the same
interpolated struct as uniforms. That is what stops the two layers from looking
like separate things stacked on top of each other.

Everything is authored and interpolated in **OKLCH** — not for fashion, but
because the palette is interpolated continuously across a day. sRGB
interpolation muddies through grey and HSL detours through unintended hues;
OKLab is perceptually even, so the twenty-second timelapse has no dead spots.
Lightness being a separate axis is also what makes the contrast work below
possible.

The palette engine is demand-driven: in steady state the ramp moves about
0.001% per frame, so it takes one damped step per second on the clock tick. The
`requestAnimationFrame` loop only spins up when something is genuinely moving —
a theme change, or a drag on the scrubber.

---

## Contrast, measured twice

The foreground stays light all day. That is not a style choice: interpolating it
from near-white at night to near-black at midday means passing through a
mid-grey at the same moment the background does, and contrast collapses to
roughly 1:1 twice a day, in the middle of the prettiest transitions. There is no
crossover point where both a light and a dark foreground clear AA, so any flip
spends real minutes below the line.

Which leaves the problem that a real midday sky is far too bright for light text.
The answer is the one a designer reaches for when putting white type over a
photograph: a wide, soft scrim under the clock. It scales with sky brightness, so
it is palette data rather than a constant, and it lets the sky be as bright as it
should be while the text stays measurably readable. Its position and size are
measured once, in the DOM, and handed to both the shader and the CSS gradient —
the first version approximated the CSS one with a hand-picked ellipse and left
the no-WebGL clock at 3.89:1 while the scene sat comfortably above 8:1.

**`npm run test`** walks the full 24 hours in five-minute steps and asserts WCAG
AA for the digits, the body text, the muted date line and the control chip. The
chip is measured as the browser will actually composite it over the sky, because
nothing renders against the raw sky colour up there.

That proves the *authored* colours are sound. It cannot prove the *rendered*
ones are, because the renderer multiplies the digit's albedo by whatever the
lights are doing — and at 2am the lights are barely doing anything. Early in the
build the authored palette passed at 18:1 while the actual pixels sat at 2.5:1.

**`npm run shoot`** closes that gap. It drives a real browser, moves the clock to
each hour, reads back the framebuffer, takes a high percentile of the luminance
inside the digit block as the glyph faces and the median of the sky beside it as
the background, and computes the real ratio.

```
ok   day-1     night     6.94:1     ok   day-14    midday   11.04:1
ok   day-3     dawn      6.65:1     ok   day-15    afternoon 12.81:1
ok   day-6     sunrise   9.45:1     ok   day-17    golden   13.31:1
ok   day-8     morning   7.96:1     ok   day-19    dusk      9.98:1
ok   day-12    midday   10.18:1     ok   day-22    night     6.63:1

worst rendered contrast: 6.63:1
```

WCAG asks 3:1 of text this size. The gate is set at 4.5:1 because a clock that
is merely technically compliant at a glance is not the goal.

### And the thing neither test could see

Contrast is luminance, and luminance is blind to hue. For a while the sky was
**green** between about two and three in the afternoon, and every check passed
the entire time, because a green sky has exactly the same luminance as the blue
one it should have been. It was found by looking at the screen.

The cause is worth knowing if you ever interpolate colour on a hue wheel. Midday
sits near hue 230 and golden hour near 50 — an arc of roughly 180 degrees, which
is the worst possible distance, because "the short way round" becomes a coin
flip. `bgTop` (232 -> 58) went one way and `bgMid` (228 -> 46) went the other:
the top of the sky rotated through green while the middle rotated through
violet. The gradient was not merely the wrong colour, it was internally
incoherent.

The fix is two explicit waypoints — `sunrise` and `afternoon` — so no leg
exceeds about 100 degrees and every stop turns the same way, through the dusty
violet a real sky actually passes through. `mixOklch` also desaturates through
wide arcs, but that is a safety net now rather than the thing holding the ramp
together; leaning on it alone was treating the symptom.

The regression test asserts the outcome (no gradient stop ever lands in the
green band) *and* the invariant (no leg of the ramp turns more than 140
degrees, so no plausible edit can flip a stop the long way round). Writing it
immediately surfaced a second instance of the same bug in `dawn -> morning`,
one twenty-degree edit away from breaking the same way.

---

## Accessibility

The 3D enhances the experience and never becomes the only path to the
information.

- The time is a real `<time>` element with a machine-readable `datetime`, plus
  an on-demand "announce the current time" control. It is **deliberately not a
  live region** — announcing every second is the mistake most accessible-clock
  attempts make, and it renders the page unusable. A clock is something you
  check, not something that shouts. The polite live region is reserved for
  changes the *user* caused.
- The canvas is `aria-hidden`. It carries nothing unavailable in the DOM.
- Full keyboard support with visible focus rings; the format control is a real
  radiogroup; the panel traps focus and restores it on close.
- `prefers-reduced-motion` produces a **designed still**, not a stripped one:
  parallax off, motes rendered but frozen, digits crossfade instead of rolling,
  and the render loop drops to on-demand. Colour still drifts through the day,
  because a change measured in minutes is not motion — and it is the concept.
- An in-app motion toggle (`M`), because plenty of people who would prefer less
  movement have never found the OS setting.
- Motes are kept strictly *behind* the digit plane so the depth test occludes
  them. Dust drifting across the numerals would break the one rule the scene
  must not break.

---

## Performance

| | |
|---|---|
| Critical path | **64 KB gzipped** (react 47.5 + app 11.1 + css 5.7) |
| Lazy scene | 226 KB gzipped (three 177.7 + r3f 41.0 + scene 7.3) |
| Draw calls | 5 |
| Heap across 266 minute rollovers | **+0.30 MB (3.1%)** |

What actually earns its place:

- **DPR clamped** to 2 (1.75 on the low tier). A 3x device renders nine times
  the pixels; this is usually the whole difference between 30fps and 60fps on a
  phone.
- **The loop stops when the tab is hidden.** `npm run verify` asserts it: 0
  frames in 1.5s hidden. This is a page people leave open for hours.
- **Thirteen glyph geometries, built once.** The naive `Text3D` usage
  re-extrudes text every minute; `npm run soak` accelerates the clock, runs four
  clock-hours of rollovers and compares the heap after a forced collection.
- **Zero allocation in the frame loop** — scratch colour arrays are hoisted to
  module scope.
- **All particle motion in the vertex shader**, from a single uniform.
- **A dithered gradient.** Eight-bit output bands a smooth gradient into visible
  stripes, and that banding is the single thing that makes an otherwise good
  WebGL gradient look cheap. Two lines of shader.

Deliberately skipped: post-processing, shadow maps, textures, instancing, LOD,
GSAP, Framer Motion and any date library. There are five meshes and no textures;
optimising for problems the project does not have is theatre.

`@react-three/drei` was removed once the only thing still used from it was
`PerformanceMonitor` — the barrel import cost 90KB gzipped for one component.
`src/scene/PerformanceGuard.tsx` replaces it in forty lines.

---

## Layout

```
src/
  features/
    time/       pure. no React, no three. timestamps -> parts
    theme/      the palette ramp, and its bridges to CSS and to uniforms
    settings/   format, theme, motion, timezone
  scene/        the only place `three` is imported
  ui/           the only place the DOM is built. never imports scene/
  hooks/        capability and preference detection
  lib/          colour, damping, clamping
```

Two rules enforce the shape: `three` is never imported outside `scene/`, and
`ui/` never imports from `scene/`. The second is what makes the fallback real
rather than aspirational.

---

## Commands

| | |
|---|---|
| `npm run dev` | development server |
| `npm run test` | time engine, palette contrast and hue (46 tests) |
| `npm run shoot` | screenshots every phase, gates rendered contrast |
| `npm run verify` | controls, keyboard, focus, no-WebGL path, hidden-tab rendering |
| `npm run soak` | accelerated long-session heap check |
| `npm run font` | re-subset the typeface into `public/fonts` |
| `npm run check` | all of the above |

`shoot`, `verify` and `soak` drive a real browser against `npm run preview`.

Useful while developing: `?tier=low` forces the low quality tier, and
`HOURS=0,6,12,18 npm run shoot` photographs an arbitrary set of hours.

---

## Notes for anyone reading the source

- **Outfit has no tabular figures** — `0` advances 666 units and `1` only 378.
  Every digit gets a fixed cell and is centred inside it, in both the DOM and
  the 3D, or the layout twitches sideways whenever a 1 appears.
- **In 12-hour mode the hour is space-padded** so the pitch never changes at
  9 -> 10. That leading cell is empty, which centres the row but leaves the
  visible time half a cell right of centre — so the row is pulled back by half a
  cell, and the blank is excluded from the seconds track's span.
- **The camera never tilts.** A tilted camera reads as a physical object on a
  surface, but it destroys the exact pixel-to-world mapping. Solidity comes from
  the bevel, the raking light, and tilting the digit *group* toward the cursor
  instead — which shows the extrusion sides and reads better anyway.
- **The key light is constrained to stay in front of the digit plane.** A
  physically tidy hemisphere puts it behind the glyphs for most of the afternoon
  and renders them as silhouettes.
- **The seconds indicator is a straight track, not an arc.** It was planned as
  an arc; at the proportions this layout produces, a bow subtle enough not to
  collide with the date line is also too subtle to read as a curve.
- **The panel shift is computed from measured geometry**, not breakpoints,
  because the block's width depends on a `clamp()` against both viewport axes,
  the format, and whether AM/PM is present.

## Licence

Code MIT. Outfit is licensed under the SIL Open Font License.
