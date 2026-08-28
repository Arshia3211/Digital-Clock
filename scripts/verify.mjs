/**
 * Behavioural checks: the things a screenshot cannot tell you.
 *
 * Controls, keyboard, focus management, persistence, and — most importantly —
 * the no-WebGL path, which is easy to claim and easy to have quietly broken.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
import { measureClockContrast } from './pixelContrast.mjs'

const URL = process.env.URL ?? 'http://localhost:4173/'
const OUT = '.shots'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
})

let failed = 0
const check = (name, pass, detail = '') => {
  if (!pass) failed++
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`)
}

async function newPage(opts = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    ...opts,
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  return { ctx, page, errors }
}

const bgMid = (page) =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--bg-mid').trim(),
  )

const clockText = (page) => page.$eval('main > div:first-child', (el) => el.textContent.trim())

/**
 * Compare two rgb() strings with a tolerance. Exact equality is wrong here: the
 * palette is a continuous function of the wall clock, so a few seconds of test
 * runtime legitimately moves a channel by one.
 */
const sameColour = (a, b, tol = 3) => {
  const nums = (v) => (v.match(/[0-9.]+/g) ?? []).slice(0, 3).map(Number)
  const x = nums(a)
  const y = nums(b)
  return x.length === 3 && y.length === 3 && x.every((n, i) => Math.abs(n - y[i]) <= tol)
}

/**
 * Wait for the palette to stop moving rather than guessing at a duration.
 *
 * The engine eases between palettes over roughly a second, so a fixed timeout
 * samples a colour that is still in transit and compares it against a settled
 * one later — a test that fails for reasons that have nothing to do with the
 * code. Polling until two consecutive reads agree removes the guess entirely.
 */
async function settled(page, timeout = 6000) {
  const start = Date.now()
  let last = null
  let stable = 0
  while (Date.now() - start < timeout) {
    const v = await bgMid(page)
    stable = v === last ? stable + 1 : 0
    last = v
    if (stable >= 3) return v
    await page.waitForTimeout(120)
  }
  return last
}

// ── Controls, keyboard and focus ───────────────────────────────────────────
{
  const { ctx, page, errors } = await newPage()
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)

  // Format toggle
  const before = await clockText(page)
  await page.click('[role="radiogroup"] button:not([aria-checked="true"])')
  await page.waitForTimeout(250)
  const after = await clockText(page)
  check('format toggle changes the displayed time', before !== after, `${before} -> ${after}`)

  const is24 = await page.$eval('[role="radiogroup"]', (el) =>
    el.querySelector('[aria-checked="true"]').textContent.trim(),
  )
  check(
    'format matches what the control claims',
    is24 === '24h' ? !/AM|PM/.test(after) : /AM|PM/.test(after),
    `${is24} -> "${after}"`,
  )

  // Keyboard shortcut for format
  const beforeF = await clockText(page)
  await page.keyboard.press('f')
  await page.waitForTimeout(250)
  check('F toggles format', beforeF !== (await clockText(page)))

  // Theme cycling
  const themeAuto = await settled(page)
  await page.keyboard.press('t')
  const themeLight = await settled(page)
  check('T switches to the pinned light theme', themeAuto !== themeLight, themeLight)
  await page.screenshot({ path: `${OUT}/theme-light.png` })

  await page.keyboard.press('t')
  const themeDark = await settled(page)
  check('T again switches to dark', themeDark !== themeLight, themeDark)
  await page.screenshot({ path: `${OUT}/theme-dark.png` })

  // Persistence
  await page.reload({ waitUntil: 'networkidle' })
  const themeAfterReload = await settled(page)
  check('theme survives a reload', sameColour(themeAfterReload, themeDark),
    `${themeDark} -> ${themeAfterReload}`)

  // Info panel: open by keyboard, focus trapped, Esc restores focus
  await page.keyboard.press('i')
  await page.waitForTimeout(400)
  check('I opens the info panel', (await page.$('[role="dialog"]')) !== null)
  await page.screenshot({ path: `${OUT}/info-panel.png` })

  const focusInside = await page.evaluate(
    () => document.querySelector('[role="dialog"]')?.contains(document.activeElement) ?? false,
  )
  check('focus moves into the panel', focusInside)

  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  check('Escape closes the panel', (await page.$('[role="dialog"]')) === null)

  check('no page errors during interaction', errors.length === 0, errors.join('; '))
  await ctx.close()
}

// ── The no-WebGL path ──────────────────────────────────────────────────────
{
  const { ctx, page, errors } = await newPage()

  // Refuse every WebGL context, which is what a blocked or unsupported browser
  // actually does. The DOM clock must carry the whole experience.
  await page.addInitScript(() => {
    const real = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (typeof type === 'string' && type.includes('webgl')) return null
      return real.call(this, type, ...rest)
    }
  })

  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)

  check('no canvas is mounted', (await page.$('canvas')) === null)

  const text = await clockText(page)
  check('the DOM clock still shows a time', /\d/.test(text), text)

  const opacity = await page.$eval('main > div:first-child', (el) => getComputedStyle(el).opacity)
  check('the DOM clock is fully visible', Number(opacity) === 1, `opacity ${opacity}`)

  const skyPainted = await page.$eval('.sky', (el) => getComputedStyle(el).backgroundImage)
  check('the sky gradient still tracks the palette', skyPainted.includes('gradient'))

  const rect = await page.$eval('main > div:first-child', (el) => {
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })
  const shot = await page.screenshot({ path: `${OUT}/no-webgl.png` })
  const lightOnDark = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement)
    const sum = (v) => {
      const n = v.match(/[0-9.]+/g)
      return n ? Number(n[0]) + Number(n[1]) + Number(n[2]) : 0
    }
    return sum(cs.getPropertyValue('--fg')) > sum(cs.getPropertyValue('--bg-mid'))
  })
  const c = measureClockContrast(shot, rect, lightOnDark)
  check('fallback clock meets AA on rendered pixels', c.ratio >= 4.5, `${c.ratio.toFixed(2)}:1`)

  check('no page errors without WebGL', errors.length === 0, errors.join('; '))
  await ctx.close()
}

// ── Accessibility surface ──────────────────────────────────────────────────
{
  const { ctx, page } = await newPage()
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)

  const time = await page.$eval('time', (el) => ({
    dt: el.getAttribute('datetime'),
    text: el.textContent.trim(),
  }))
  check(
    'a machine-readable <time> carries the current time',
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/.test(time.dt ?? ''),
    time.dt ?? 'missing',
  )
  check('it reads as a sentence for assistive tech', time.text.length > 8, time.text)

  check('the canvas is hidden from assistive tech', await page.evaluate(() => {
    const c = document.querySelector('canvas')
    return !c || c.closest('[aria-hidden="true"]') !== null
  }))

  check(
    'the time is NOT announced every second',
    await page.evaluate(() => {
      const live = [...document.querySelectorAll('[aria-live]')]
      // Nothing that updates per second may be inside a live region.
      return !live.some((el) => el.querySelector('time'))
    }),
  )

  check('there is exactly one h1', (await page.$$('h1')).length === 1)

  // Tab order should reach every control.
  const reached = []
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press('Tab')
    reached.push(
      await page.evaluate(() => {
        const el = document.activeElement
        return el ? `${el.tagName.toLowerCase()}:${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 28)}` : 'none'
      }),
    )
  }
  const unique = [...new Set(reached)]
  check('keyboard reaches the announce, format, theme and info controls', unique.length >= 4,
    unique.join(' | '))

  const ring = await page.evaluate(() => {
    const el = document.activeElement
    return el ? getComputedStyle(el).outlineStyle : 'none'
  })
  check('focused controls draw a visible ring', ring !== 'none', ring)

  await ctx.close()
}

// ── Reduced motion ─────────────────────────────────────────────────────────
{
  const { ctx, page } = await newPage({ reducedMotion: 'reduce' })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)

  const colonAnim = await page.$eval('main > div:first-child > span:nth-child(3)', (el) =>
    getComputedStyle(el).animationName,
  )
  check('the colon stops pulsing under reduced motion', colonAnim === 'none', colonAnim)

  check('the scene still renders (it is a still, not an absence)', (await page.$('canvas')) !== null)
  await ctx.close()
}

// ── The day scrubber ───────────────────────────────────────────────────────
{
  const { ctx, page } = await newPage()
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await page.keyboard.press('i')
  await page.waitForTimeout(400)

  const atNow = await settled(page)

  // Drag the scrubber to the middle of the night and to golden hour.
  const setScrub = async (hours) => {
    await page.$eval(
      'input[type="range"]',
      (el, v) => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        ).set
        setter.call(el, String(v))
        el.dispatchEvent(new Event('input', { bubbles: true }))
      },
      hours,
    )
    return settled(page)
  }

  const atNight = await setScrub(1)
  const atGolden = await setScrub(17.5)
  check('scrubbing the day changes the sky', !sameColour(atNight, atGolden), `${atNight} vs ${atGolden}`)
  check('scrubbing away from now actually moves it', !sameColour(atNight, atNow))

  const label = await page.$eval('input[type="range"]', (el) => el.getAttribute('aria-valuetext'))
  check('the scrubber announces the previewed time', /^[0-9]{2}:[0-9]{2}$/.test(label ?? ''), label ?? '')

  // Blur returns control to the real clock.
  await page.$eval('input[type="range"]', (el) => { el.focus(); el.blur() })
  const back = await settled(page)
  check('releasing returns to the real time', sameColour(back, atNow), `${back} vs ${atNow}`)

  await ctx.close()
}

// ── Rendering stops in a hidden tab ────────────────────────────────────────
{
  const { ctx, page } = await newPage()

  // Count animation frames from before any app code runs.
  await page.addInitScript(() => {
    const real = window.requestAnimationFrame.bind(window)
    window.__frames = 0
    window.requestAnimationFrame = (cb) => real((t) => {
      window.__frames++
      return cb(t)
    })
  })

  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('canvas')
  await page.waitForTimeout(1500)

  const start = await page.evaluate(() => window.__frames)
  await page.waitForTimeout(1500)
  const visible = (await page.evaluate(() => window.__frames)) - start
  // SwiftShader is a software rasteriser and runs at a fraction of real GPU
  // speed; the bar here is 'is the loop running at all', not a frame target.
  check('the scene renders while visible', visible > 8, `${visible} frames / 1.5s`)

  // Report the page as hidden, exactly as a backgrounded tab does.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(600)

  const mid = await page.evaluate(() => window.__frames)
  await page.waitForTimeout(1500)
  const hidden = (await page.evaluate(() => window.__frames)) - mid
  check(
    'rendering stops when the tab is hidden',
    hidden < visible * 0.15,
    `${hidden} frames / 1.5s hidden vs ${visible} visible`,
  )

  await ctx.close()
}

// ── Timezones ──────────────────────────────────────────────────────────────
{
  // A fixed home zone, so the offsets asserted below are deterministic.
  const { ctx, page, errors } = await newPage({ timezoneId: 'Europe/London' })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1400)

  const homeSky = await settled(page)
  const homeClock = await clockText(page)

  await page.keyboard.press('z')
  await page.waitForSelector('[role="listbox"]', { timeout: 8000 })
  check('Z opens the zone picker', true)

  const first = await page.$eval('[role="option"]', (el) => el.textContent.replace(/\s+/g, ' '))
  check('the home zone is pinned first', first.includes('Europe/London') && /Your location/i.test(first), first)

  const heading = await page.$eval('[role="dialog"] h2', (el) => el.textContent.trim())
  check('the picker is labelled', heading === 'Select Timezone', heading)

  const grouped = await page.$$eval('[role="dialog"] p', (els) =>
    els.map((e) => e.textContent.trim()).filter((t) => /^(Africa|America|Asia|Atlantic|Australia|Europe|Indian|Pacific|Antarctica|Arctic|UTC)$/.test(t)),
  )
  check('zones are grouped by region while browsing', grouped.length > 0, grouped.slice(0, 3).join(', '))

  /*
   * The whole world has to be reachable by scrolling.
   *
   * This list was once capped at 150 rows. Sorted by identifier that meant
   * browsing reached Africa and two thirds of America and then stopped — Asia,
   * Europe, Australia and the Pacific were unreachable unless you guessed to
   * search for them. Everything was loaded; almost none of it could be found.
   */
  let rendered = 0
  for (let i = 0; i < 40; i++) {
    const n = await page.$$eval('[role="option"]', (els) => els.length)
    if (n === rendered && n > 0) break
    rendered = n
    await page.waitForTimeout(120)
  }
  const platformZones = await page.evaluate(() => Intl.supportedValuesOf('timeZone').length + 1)
  check('every zone the platform knows is in the list', rendered >= platformZones,
    `${rendered} rendered vs ${platformZones} known`)

  const regions = await page.$$eval('[role="dialog"] p', (els) =>
    els.map((e) => e.textContent.trim()).filter((t) =>
      /^(Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific|UTC)$/.test(t)))
  check('every region is reachable by scrolling', regions.length >= 11, regions.join(', '))

  await page.$eval('[role="listbox"]', (el) => { el.scrollTop = el.scrollHeight })
  await page.waitForTimeout(250)
  const lastRow = await page.$$eval('[role="option"]', (els) =>
    els[els.length - 1].textContent.replace(/s+/g, ' ').trim())
  check('scrolling reaches the far end of the list', lastRow.includes('UTC'), lastRow)

  const swatch = await page.$eval('[role="option"] span', (el) => getComputedStyle(el).backgroundImage)
  check('each row paints that zone current sky', swatch.includes('gradient'), swatch.slice(0, 48))

  // A region prefix browses that region, in identifier order.
  await page.fill('input[type="text"]', 'europe/')
  await page.waitForTimeout(350)
  const regionHit = await page.$eval('[role="option"]', (el) => el.textContent.replace(/s+/g, ' '))
  check('an identifier prefix browses the region', regionHit.includes('Europe/'), regionHit)

  await page.fill('input[type="text"]', 'tokyo')
  await page.waitForTimeout(350)
  const hit = await page.$eval('[role="option"]', (el) => el.textContent.replace(/\s+/g, ' '))
  check('search finds a zone by identifier', hit.includes('Asia/Tokyo'), hit)

  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  check('choosing a zone closes the picker', (await page.$('[role="listbox"]')) === null)

  const awaySky = await settled(page)
  const awayClock = await clockText(page)
  check('the clock moves to the chosen zone', awayClock !== homeClock, `${homeClock} -> ${awayClock}`)
  // The whole point: the scene is a function of local time, so a different zone
  // is a different sky, not just different numbers.
  check('the SKY moves with it', !sameColour(homeSky, awaySky), `${homeSky} -> ${awaySky}`)

  const line = await page.$eval('main > p', (el) => el.textContent.replace(/\s+/g, ' ').trim())
  // Timezone-first: the IANA identifier is what is displayed, not just a city.
  check('the date line shows the IANA identifier and offset', line.includes('Asia/Tokyo') && line.includes('+8h'), line)

  const url = await page.evaluate(() => location.search)
  const shared = decodeURIComponent(url)
  check('the zone is shareable in the URL', shared.includes('tz=Asia/Tokyo'), url)

  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  check('a shared link restores the zone', (await clockText(page)).slice(0, 2) === awayClock.slice(0, 2))

  check('no page errors around zone switching', errors.length === 0, errors.join('; '))
  await ctx.close()
}

// An unknown zone in the URL must not take the clock down.
{
  const { ctx, page, errors } = await newPage()
  await page.goto(URL + '?tz=Not/AZone', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  check('a bogus tz parameter is ignored, not fatal', /[0-9]/.test(await clockText(page)) && errors.length === 0,
    errors.join('; '))
  await ctx.close()
}

await browser.close()
console.log(failed ? `\n${failed} check(s) failed` : '\nall behavioural checks passed')
process.exit(failed ? 1 : 0)
