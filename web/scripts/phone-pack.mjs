// Phone test of the pack screen: open a pack by tapping, then swipe through the cards with touch, screenshotting each.
//   node scripts/phone-pack.mjs [outDir] [url]      (dev server must be running)
import { mkdirSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] || '../minimap-previews/phone-pack'
const URL = process.argv[3] || 'http://localhost:5173/'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  // A typical Android phone (the developer's screenshot is 412 x 915 CSS pixels)
  await page.setViewport({ width: 412, height: 915, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await page.goto(URL, { waitUntil: 'networkidle0' })
  await page.evaluate(() => localStorage.setItem('ptp-demo-v1', JSON.stringify({ packs: 3, nextRefill: null, owned: [], mints: {}, hometown: null, here: null, localDay: null, opened: 1 })))
  await page.reload({ waitUntil: 'networkidle0' })
  for (const h of await page.$$('button')) if ((await h.evaluate((e) => e.textContent)).includes('Open a pack')) { await h.tap(); break }
  const pack = await page.waitForSelector('.pack')
  await sleep(1400)
  await page.screenshot({ path: `${OUT}/1-pack.png` })
  await pack.tap()
  await sleep(4000)
  await page.screenshot({ path: `${OUT}/2-first-card.png` })
  // Swipe left four times with a finger
  for (let k = 0; k < 4; k++) {
    await page.touchscreen.touchStart(330, 450)
    for (let i = 1; i <= 8; i++) { await page.touchscreen.touchMove(330 - i * 30, 452); await sleep(16) }
    await page.touchscreen.touchEnd()
    await sleep(1300)
    const state = await page.evaluate(() => ({
      dots: [...document.querySelectorAll('[aria-label^="Card "] > button')].map((b) => b.className.includes('w-6') ? 'O' : '.').join(''),
      flipped: [...document.querySelectorAll('button.flip')].map((b) => (b.classList.contains('flipped') ? 'F' : '-')).join(''),
    }))
    console.log(`after swipe ${k + 1}: dots ${state.dots} flipped ${state.flipped}`)
    await page.screenshot({ path: `${OUT}/${3 + k}-swipe-${k + 1}.png` })
  }
  console.log(errors.length ? `Errors:\n${errors.join('\n')}` : 'No console or page errors.')
} finally {
  await browser.close()
}
