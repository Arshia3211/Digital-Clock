# TICK

**A clock whose world tracks the sun.**

A single-screen, real-time clock built with React, TypeScript and three.js. The
scene isn't a backdrop with a clock on it: every colour, the angle and warmth of
the light, the fog density and the drift of the motes are derived from one value
— the current local time of day.

```
npm install
npm run dev
```

## Features

- Extruded 3D digits, lit by a sky that moves through night, dawn, morning,
  midday, golden hour and dusk.
- All 419 IANA timezones, read from the browser's own database — press `Z`.
- Shareable state in the URL (`?tz=Asia/Tokyo&f=12`).
- Scrub the day to preview any hour.
- 12/24-hour formats, reduced-motion support, and a full no-WebGL fallback.

## Commands

| | |
|---|---|
| `npm run dev` | development server |
| `npm run build` | production build to `dist/` |
| `npm run test` | 67 unit tests |
| `npm run shoot` | screenshots every phase, gates rendered contrast |
| `npm run verify` | controls, keyboard, focus, no-WebGL, hidden-tab rendering |
| `npm run check` | all of the above |

`shoot` and `verify` drive a real browser against `npm run preview`.

## Licence

Code MIT. Outfit is licensed under the SIL Open Font License.
