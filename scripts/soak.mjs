/**
 * Long-session check.
 *
 * The whole argument for pre-building thirteen glyph geometries instead of
 * letting Text3D rebuild them is that a clock gets left open for hours, and
 * re-extruding text once a minute leaks. That is a claim, and claims about
 * memory are worth measuring.
 *
 * The wall clock is accelerated so a minute of real time buys hours of digit
 * rollovers, then the heap is compared after a forced collection.
 */
import { chromium } from 'playwright'

const URL = process.env.URL ?? 'http://localhost:4173/'
const SPEED = Number(process.env.SPEED ?? 240) // clock seconds per real second
const SECONDS = Number(process.env.SECONDS ?? 60)

const browser = await chromium.launch({
  args: [
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
    '--enable-precise-memory-info',
    '--js-flags=--expose-gc',
  ],
})
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()

await page.addInitScript((speed) => {
  const real = Date.now.bind(Date)
  const t0 = real()
  Date.now = () => t0 + (real() - t0) * speed
  // Count rollovers from the app's own side, so the number is what the digits
  // actually did rather than what we assume they did.
  let last = -1
  window.__rollovers = 0
  setInterval(() => {
    const m = Math.floor(Date.now() / 60000)
    if (last !== -1 && m !== last) window.__rollovers += m - last
    last = m
  }, 16)
}, SPEED)

const cdp = await ctx.newCDPSession(page)
const heap = async () => {
  await cdp.send('HeapProfiler.collectGarbage')
  await page.waitForTimeout(400)
  return page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0)
}

await page.goto(URL, { waitUntil: 'networkidle' })
await page.waitForSelector('canvas')
await page.waitForTimeout(4000) // let load allocations settle

const before = await heap()
console.log(`baseline heap        ${(before / 1e6).toFixed(2)} MB`)
console.log(`running ${SECONDS}s at ${SPEED}x ...`)

const samples = []
for (let i = 0; i < SECONDS / 10; i++) {
  await page.waitForTimeout(10_000)
  const used = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0)
  samples.push(used)
  process.stdout.write(`  +${(i + 1) * 10}s  ${(used / 1e6).toFixed(2)} MB\n`)
}

const after = await heap()
const rollovers = await page.evaluate(() => window.__rollovers)
const clockHours = (SECONDS * SPEED) / 3600

const growth = after - before
const pct = (growth / before) * 100

console.log(`\nsimulated            ${clockHours.toFixed(1)} clock-hours, ${rollovers} minute rollovers`)
console.log(`heap after GC        ${(after / 1e6).toFixed(2)} MB`)
console.log(`growth               ${(growth / 1e6).toFixed(2)} MB  (${pct.toFixed(1)}%)`)

const ok = pct < 12
console.log(ok ? '\nok   heap is flat across a long session' : '\nFAIL heap grew across the session')

await browser.close()
process.exit(ok ? 0 : 1)
