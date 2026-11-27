// Record a pack opening as frames (Chrome DevTools screencast), for turning into a video.
//   node scripts/record-pack.mjs [outDir] [seed] [width] [height]
// The seed fixes Math.random so the recorded pack is repeatable (seed 32 + Halifax = a Legendary last card).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] || '../minimap-previews/pack-video/frames'
const SEED = Number(process.argv[3] || 32)
const W = Number(process.argv[4] || 1100), H = Number(process.argv[5] || 700)
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const clickText = async (page, text) => {
  for (const h of await page.$$('button')) {
    if ((await h.evaluate((el) => el.textContent?.trim() ?? '')).includes(text)) return h.click()
  }
  throw new Error(`No button "${text}"`)
}

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--hide-scrollbars'] })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: W, height: H, deviceScaleFactor: W < 600 ? 2 : 1 })
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle0' })
  await page.type('#hometown-search', 'Halifax')
  await sleep(300)
  await page.click('[role="dialog"] ul button')
  await sleep(300)
  // Seed Math.random just before opening, so only the pack roll uses it.
  await page.evaluate((seed) => {
    let a = seed
    Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
  }, SEED)
  // Warm the image cache for the seeded pack so photos don't pop in mid-flip
  await sleep(500)

  const cdp = await page.createCDPSession()
  const frames = []
  cdp.on('Page.screencastFrame', async (f) => {
    frames.push({ t: f.metadata.timestamp, data: f.data })
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, everyNthFrame: 1 })
  await sleep(1200)
  await clickText(page, 'Open a pack')
  // The pack floats in; swipe across its top like a player would
  const pack = await page.waitForSelector('.pack')
  await sleep(1600)
  const b = await pack.boundingBox()
  const y = b.y + b.height * 0.11
  await page.mouse.move(b.x + 4, y)
  await page.mouse.down()
  for (let i = 1; i <= 30; i++) {
    await page.mouse.move(b.x + (b.width * i) / 30, y + Math.sin(i / 4) * 2)
    await sleep(22)
  }
  await page.mouse.up()
  await sleep(3200)
  // Commons and Rares flip themselves; tap the special cards still face down
  await sleep(1500)
  for (const c of await page.$$('button.flip:not(.flipped)')) {
    await c.click()
    await sleep(1800)
    // A Legendary or Mythic opens the walkout: let it play, then tap to go back
    const walkout = await page.$('[role="dialog"][aria-label$="reveal"]')
    if (walkout) {
      await sleep(4500)
      await walkout.click()
      await sleep(900)
    }
  }
  await sleep(1000)
  await cdp.send('Page.stopScreencast')
  frames.forEach((f, i) => writeFileSync(`${OUT}/${String(i).padStart(5, '0')}_${f.t.toFixed(4)}.jpg`, Buffer.from(f.data, 'base64')))
  console.log(`${frames.length} frames over ${(frames.at(-1).t - frames[0].t).toFixed(1)} s -> ${OUT}`)
} finally {
  await browser.close()
}
