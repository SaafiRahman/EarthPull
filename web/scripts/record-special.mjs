// Record the reveal of a special card (Epic, Legendary or Mythic) as screencast frames, opening packs until one holds
// that tier. Phone-sized by default.
//   node scripts/record-special.mjs [tier] [outDir] [desktop]      then python scripts/frames-to-mp4.py <outDir> <mp4>
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const TIER = process.argv[2] || 'Epic'
const TRACE = process.env.TRACE // write a Chrome performance trace of the reveal here
const OUT = process.argv[3] || `../minimap-previews/special/${TIER.toLowerCase()}-frames`
const DESKTOP = process.argv[4] === 'desktop'
const FOIL = process.env.FOIL === '1' // only a foil of that tier
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
try {
  const page = await browser.newPage()
  await page.setViewport(DESKTOP ? { width: 1100, height: 760 } : { width: 412, height: 915, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' })
  const tap = async (el) => (DESKTOP ? el.click() : el.tap())
  let target = null
  for (let n = 0; n < 400 && !target; n++) {
    await page.evaluate(() => localStorage.setItem('ptp-demo-v1', JSON.stringify({ packs: 3, nextRefill: null, owned: [], mints: {}, hometown: null, here: null, localDay: null, opened: 1 })))
    // Roll packs in the page until the best card is the tier we want (cheap: no animation)
    const found = await page.evaluate(async (tier, foil) => {
      const { loadPool } = await import('/src/data.ts')
      const g = await import('/src/game.ts')
      const pool = await loadPool()
      for (let seed = 1; seed < 50000; seed++) {
        let a = seed
        const rand = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
        const { pulls } = g.openPack(pool, { ...g.newState(), opened: 1 }, rand)
        if (pulls.at(-1).card.tier === tier && (!foil || pulls.at(-1).foil)) return seed
      }
      return 0
    }, TIER, FOIL)
    if (!found) throw new Error(`no ${TIER} pack found`)
    await page.reload({ waitUntil: 'networkidle0' })
    // Seed Math.random so the real pack matches the one found above
    await page.evaluate((seed) => {
      let a = seed
      Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
    }, found)
    for (const h of await page.$$('button')) if ((await h.evaluate((e) => e.textContent)).includes('Open a pack')) { await tap(h); break }
    const pack = await page.waitForSelector('.pack')
    await sleep(1300)
    await tap(pack)
    await sleep(4200)
    const btns = await page.$$('button.flip:not(.flipped)')
    target = btns.at(-1) ?? null
  }
  if (!DESKTOP) { await target.evaluate((el) => el.scrollIntoView({ inline: 'center', block: 'nearest' })); await sleep(900) }
  const cdp = await page.createCDPSession()
  const frames = []
  cdp.on('Page.screencastFrame', async (f) => {
    frames.push({ t: f.metadata.timestamp, data: f.data })
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, everyNthFrame: 1 })
  let wobble = null
  if (process.env.GYRO === '1') { // wobble an emulated phone the whole time, like a hand holding it
    let k = 0
    wobble = setInterval(() => { k++; cdp.send('DeviceOrientation.setDeviceOrientationOverride', { alpha: 0, beta: 40 + Math.sin(k / 4) * 12, gamma: Math.cos(k / 5) * 15 }).catch(() => {}) }, 33)
  }
  await sleep(500)
  await page.evaluate(() => { window.__f = []; const f = (t) => { window.__f.push(t); requestAnimationFrame(f) }; requestAnimationFrame(f) })
  if (TRACE) await page.tracing.start({ path: TRACE, categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink', 'cc', 'gpu'] })
  await tap(target)
  await sleep(TIER === 'Epic' ? 2600 : TIER === 'Mythic' ? 12500 : 8000)
  if (TIER !== 'Epic') { await page.touchscreen.tap(200, 450).catch(() => page.mouse.click(200, 450)); await sleep(2500) } // back to the pack
  const fr = await page.evaluate(() => window.__f)
  const t0 = fr[0]
  console.log('long frames (s, ms):', fr.slice(1).map((t, i) => [((fr[i] - t0) / 1000).toFixed(2), Math.round(t - fr[i])]).filter(([, d]) => d > 40).map((x) => x.join(' ')).join(' | '))
  if (wobble) clearInterval(wobble)
  await cdp.send('Page.stopScreencast')
  if (TRACE) await page.tracing.stop()
  await page.screenshot({ path: `${OUT}/after.png` })
  frames.forEach((f, i) => writeFileSync(`${OUT}/${String(i).padStart(5, '0')}_${f.t.toFixed(4)}.jpg`, Buffer.from(f.data, 'base64')))
  console.log(`${frames.length} frames over ${(frames.at(-1).t - frames[0].t).toFixed(1)} s -> ${OUT}`)
} finally {
  await browser.close()
}
