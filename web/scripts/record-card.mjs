// Record one card from the preview page (/#cards) up close, with the pointer sweeping over it, as screencast frames.
//   node scripts/record-card.mjs [tier] [outDir] [seconds]     e.g. node scripts/record-card.mjs Mythic
// Then: python scripts/frames-to-mp4.py <outDir> <video.mp4>
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const TIER = process.argv[2] || 'Mythic'
const OUT = process.argv[3] || `../minimap-previews/card-video/${TIER.toLowerCase()}-frames`
const SECONDS = Number(process.argv[4] || 8)
rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--hide-scrollbars'] })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 560, height: 720, deviceScaleFactor: 1 })
  await page.goto('http://localhost:5173/#cards', { waitUntil: 'networkidle0' })
  await page.evaluate(() => document.fonts.ready)
  // Keep only the first "Plain" card of the tier asked for, centred and large
  // Hide everything except the first "Plain" card of that tier, and show it centred and large. The card stays inside
  // React's root, so pointer events (tilt and light) still reach it.
  const found = await page.evaluate((tier) => {
    const card = [...document.querySelectorAll('section:first-of-type .tcg')].find((el) => el.classList.contains(`tcg-${tier.toLowerCase()}`))
    if (!card) return false
    const cell = card.parentElement
    document.querySelectorAll('section').forEach((s, i) => { if (i > 0) s.style.display = 'none' })
    document.querySelector('section h2').style.display = 'none'
    for (const c of cell.parentElement.children) if (c !== cell) c.style.display = 'none'
    cell.parentElement.style.cssText = 'display:grid;place-items:center;height:100vh'
    cell.style.cssText = 'width:400px;aspect-ratio:5/7'
    cell.id = 'solo'
    document.querySelector('section').parentElement.style.padding = '0'
    return true
  }, TIER)
  if (!found) throw new Error(`No ${TIER} card on /#cards`)
  await sleep(800)

  const cdp = await page.createCDPSession()
  const frames = []
  cdp.on('Page.screencastFrame', async (f) => {
    frames.push({ t: f.metadata.timestamp, data: f.data })
    await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
  })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, everyNthFrame: 1 })
  // Idle first (the card's own animation), then a slow pointer sweep so the tilt and light show
  const idle = SECONDS * 0.4 * 1000
  await sleep(idle)
  const box = await (await page.$('#solo .tcg')).boundingBox()
  const steps = Math.round((SECONDS * 1000 - idle) / 40)
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2
    await page.mouse.move(box.x + box.width * (0.5 + 0.38 * Math.cos(a)), box.y + box.height * (0.5 + 0.38 * Math.sin(a * 2) * 0.8))
    await sleep(40)
  }
  await cdp.send('Page.stopScreencast')
  frames.forEach((f, i) => writeFileSync(`${OUT}/${String(i).padStart(5, '0')}_${f.t.toFixed(4)}.jpg`, Buffer.from(f.data, 'base64')))
  console.log(`${frames.length} frames over ${(frames.at(-1).t - frames[0].t).toFixed(1)} s -> ${OUT}`)
} finally {
  await browser.close()
}
