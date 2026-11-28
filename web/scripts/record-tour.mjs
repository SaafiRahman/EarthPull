// Record a whole pack opening with the globe tour (effects "full") and count the map data it downloads.
//   node scripts/record-tour.mjs [bestTier] [outDir] [desktop]     then python scripts/frames-to-mp4.py <outDir> <mp4>
// Opens packs (seeded) until the pack's best card is bestTier (default Epic), opens it, waits for the cascade, taps the
// special card if there is one, and on phones swipes through the cards. EFFECTS=light|off to compare.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const TIER = process.argv[2] || 'Epic'
const OUT = process.argv[3] || `../minimap-previews/tour/${TIER.toLowerCase()}-frames`
const DESKTOP = process.argv[4] === 'desktop'
const EFFECTS = process.env.EFFECTS || 'full'
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const rng = (seed) => { let a = seed; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
try {
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.log('pageerror', e.message))
  page.on('console', (m) => { if (m.type() === 'error') console.log('console error', m.text().slice(0, 200)) })
  await page.setViewport(DESKTOP ? { width: 1100, height: 760 } : { width: 412, height: 915, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' })
  const tap = async (el) => (DESKTOP ? el.click() : el.tap())
  await page.evaluate((fx) => {
    localStorage.setItem('ptp-effects', fx)
    localStorage.setItem('ptp-demo-v1', JSON.stringify({ packs: 3, nextRefill: null, owned: [], mints: {}, hometown: null, here: null, localDay: null, opened: 1 }))
  }, EFFECTS)
  const found = await page.evaluate(async (tier, rngSrc) => {
    const rng = eval(rngSrc)
    const { loadPool, TIERS } = await import('/src/data.ts')
    const g = await import('/src/game.ts')
    const pool = await loadPool()
    for (let seed = 1; seed < 50000; seed++) {
      const { pulls } = g.openPack(pool, { ...g.newState(), opened: 1 }, rng(seed))
      const best = pulls.reduce((b, p) => Math.max(b, TIERS.indexOf(p.card.tier)), 0)
      if (TIERS[best] === tier) return { seed, cards: pulls.map((p) => `${p.card.label} (${p.card.tier}, ${p.card.region})`) }
    }
    return null
  }, TIER, rng.toString())
  if (!found) throw new Error(`no ${TIER} pack found`)
  console.log('pack:', found.cards.join(' | '))
  await page.reload({ waitUntil: 'networkidle0' })
  await page.evaluate((seed, rngSrc) => { Math.random = eval(rngSrc)(seed) }, found.seed, rng.toString())

  // Count map bytes (tiles, style, fonts, sprites) from here on
  const cdp = await page.createCDPSession()
  await cdp.send('Network.enable')
  const urls = new Map()
  let mapBytes = 0, mapReqs = 0
  cdp.on('Network.requestWillBeSent', (e) => urls.set(e.requestId, e.request.url))
  const by = {} // bytes and requests per tile zoom level (and fonts, sprites, style)
  const count = (e) => {
    const u = urls.get(e.requestId) ?? ''
    if (!/openfreemap/.test(u)) return
    mapBytes += e.encodedDataLength; mapReqs++
    const z = u.match(/\/(\d+)\/\d+\/\d+(?:\.\w+)?(?:\?|$)/)
    const key = z ? `tiles z${z[1].padStart(2, '0')}` : /font/.test(u) ? 'fonts' : /sprite/.test(u) ? 'sprites' : 'style/other'
    const b = (by[key] ??= [0, 0]); b[0] += e.encodedDataLength; b[1]++
  }
  cdp.on('Network.loadingFinished', count)
  // MapLibre fetches tiles from its web workers, whose requests the page's session doesn't see
  const watchWorker = async (w) => {
    const c = w.client
    c.on('Network.requestWillBeSent', (e) => urls.set(e.requestId, e.request.url))
    c.on('Network.loadingFinished', count)
    await c.send('Network.enable').catch(() => {})
  }
  page.on('workercreated', watchWorker)
  for (const w of page.workers()) await watchWorker(w)
  const frames = []
  cdp.on('Page.screencastFrame', async (f) => {
    frames.push({ t: f.metadata.timestamp, data: f.data })
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, everyNthFrame: 1 })

  for (const h of await page.$$('button')) if ((await h.evaluate((e) => e.textContent)).includes('Open a pack')) { await tap(h); break }
  const pack = await page.waitForSelector('.pack')
  await sleep(1500)
  await tap(pack)
  await sleep(3200) // tear, pop, cards land
  if (DESKTOP) {
    await sleep(5500) // the cascade with the tour
  } else {
    for (let i = 1; i < 5; i++) { // swipe through: each Common or Rare flips once the camera reaches it
      await sleep(1700)
      await page.evaluate((i) => document.querySelectorAll('button.flip')[i]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }), i)
    }
    await sleep(1700)
  }
  const special = await page.$$('button.flip:not(.flipped)')
  if (special.length) {
    const el = special.at(-1)
    if (!DESKTOP) { await el.evaluate((e) => e.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })); await sleep(1200) }
    await tap(el)
    await sleep(TIER === 'Epic' ? 3000 : TIER === 'Mythic' ? 11000 : 9000)
    if (TIER !== 'Epic') { await page.mouse.click(200, 400); await sleep(2000) }
  }
  await cdp.send('Page.stopScreencast')
  await page.screenshot({ path: `${OUT}/after.png` })
  frames.forEach((f, i) => writeFileSync(`${OUT}/${String(i).padStart(5, '0')}_${f.t.toFixed(4)}.jpg`, Buffer.from(f.data, 'base64')))
  for (const [k, [b, n]] of Object.entries(by).sort()) console.log(`  ${k.padEnd(12)} ${(b / 1048576).toFixed(2).padStart(6)} MB  ${n} requests`)
  console.log(`map data this pack: ${(mapBytes / 1048576).toFixed(2)} MB in ${mapReqs} requests (effects ${EFFECTS})`)
  console.log(`${frames.length} frames over ${(frames.at(-1).t - frames[0].t).toFixed(1)} s -> ${OUT}`)
} finally {
  await browser.close()
}
