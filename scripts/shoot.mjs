/**
 * Visual smoke test and rendered-contrast gate.
 *
 * Because the whole project is a function of the time of day, the only way to
 * actually look at it is to move the clock. That turns out to be a one-line
 * override: `Date.now` is the single source of truth in the app, so shifting it
 * shifts the digits, the palette, the sun angle and the fog together.
 *
 *   npm run shoot                 # the six phases plus three viewports
 *   HOURS=0,1,2,3 npm run shoot   # any set of hours
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { measureClockContrast } from './pixelContrast.mjs'

const URL = process.env.URL ?? 'http://localhost:4173/'
const OUT = '.shots'
mkdirSync(OUT, { recursive: true })

const HOURS = process.env.HOURS
  ? process.env.HOURS.split(',').map(Number)
  : [2, 5.5, 9, 13, 17.5, 20]

/*
 * WCAG puts text this large at 3:1, not 4.5:1 — the digits render around 200px.
 * The gate is set higher than the standard requires because a clock that is
 * merely technically compliant at a glance is not the goal.
 */
const MIN_CONTRAST = 4.5

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844 },
  landscape: { width: 844, height: 390 },
}

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})

let failures = 0
const rows = []

async function shoot(name, hours, viewport, extra = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, ...extra })
  const page = await ctx.newPage()

  const problems = []
  page.on('console', (m) => {
    const text = m.text()
    // SwiftShader is a software rasteriser; its performance advisories say
    // nothing about the page.
    if (/GL Driver Message|SwiftShader|GPU stall/.test(text)) return
    if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${text}`)
  })
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`))

  // Shift the wall clock to the target local hour before any app code runs.
  await page.addInitScript((targetHours) => {
    const real = Date.now.bind(Date)
    const probe = new Date()
    const nowHours = probe.getHours() + probe.getMinutes() / 60 + probe.getSeconds() / 3600
    const deltaMs = ((targetHours - nowHours + 24) % 24) * 3600_000
    Date.now = () => real() + deltaMs
  }, hours)

  await page.goto(URL, { waitUntil: 'networkidle' })

  const hasCanvas = await page
    .waitForSelector('canvas', { timeout: 10_000 })
    .then(() => true)
    .catch(() => false)

  // Let the reveal crossfade finish and the palette settle.
  await page.waitForTimeout(1600)

  const domClock = await page.$eval('main', (el) => el.textContent?.trim() ?? '')
  const iso = await page.$eval('time', (el) => el.getAttribute('datetime'))
  const phase = await page.evaluate(() => document.documentElement.dataset.phase)

  // The digit block's box, straight from the DOM clock the 3D one is fitted to,
  // so the measurement lands on the glyphs by construction.
  const rect = await page.$eval('main > div:first-child', (el) => {
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })

  const lightOnDark = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    const sum = (v) => {
      const n = v.match(/[0-9.]+/g)
      return n ? Number(n[0]) + Number(n[1]) + Number(n[2]) : 0
    }
    return sum(cs.getPropertyValue('--fg')) > sum(cs.getPropertyValue('--bg-mid'))
  })

  const file = `${OUT}/${name}.png`
  const shot = await page.screenshot({ path: file })
  const contrast = measureClockContrast(shot, rect, lightOnDark)

  const contrastOk = contrast.ratio >= MIN_CONTRAST
  const ok = hasCanvas && problems.length === 0 && contrastOk
  if (!ok) failures++

  rows.push({ name, hours, phase, domClock, iso, contrast: contrast.ratio, ok, problems })

  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(20)} h=${String(hours).padStart(4)}  ` +
      `${String(phase).padEnd(7)} ${contrast.ratio.toFixed(2).padStart(6)}:1` +
      `${contrastOk ? '' : '  <-- below AA'}  "${domClock}"`,
  )
  for (const p of problems) console.log(`     ! ${p}`)

  await ctx.close()
}

for (const h of HOURS) {
  await shoot(`day-${String(h).replace('.', '-')}`, h, VIEWPORTS.desktop)
}
await shoot('phone-morning', 9, VIEWPORTS.phone, { isMobile: true, hasTouch: true })
await shoot('landscape-golden', 17.5, VIEWPORTS.landscape, { hasTouch: true })
await shoot('reduced-motion', 20, VIEWPORTS.desktop, { reducedMotion: 'reduce' })

await browser.close()

const worst = rows.reduce((a, b) => (a.contrast < b.contrast ? a : b))
console.log(`\nworst rendered contrast: ${worst.contrast.toFixed(2)}:1 at ${worst.name}`)
console.log(failures ? `${failures} check(s) failed` : 'all checks passed')
process.exit(failures ? 1 : 0)
