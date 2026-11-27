// Phone audit: every main screen at three phone sizes. Reports whether the screen scrolls and whether its main
// buttons are on screen, and saves a screenshot of each.
//   node scripts/phone-audit.mjs [outDir]      (dev server must be running on http://localhost:5173)
import { mkdirSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] || '../minimap-previews/phone-audit'
mkdirSync(OUT, { recursive: true })
const PHONES = [['se', 375, 667], ['iphone', 390, 844], ['android', 412, 915], ['android-bars', 412, 800]]
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
const rows = []
try {
  for (const [name, w, h] of PHONES) {
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.setViewport({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' })
    await page.evaluate(() => localStorage.setItem('ptp-demo-v1', JSON.stringify({ packs: 3, nextRefill: null, owned: [], mints: {}, hometown: { id: 'gn:6324729', label: 'Halifax', lat: 44.65, lon: -63.57 }, here: null, localDay: null, opened: 1 })))
    await page.reload({ waitUntil: 'networkidle0' })
    // Tap the first visible button with this text (the desktop tabs are hidden on phones)
    const tapText = async (text) => {
      for (const b of await page.$$('button')) {
        if (!(await b.evaluate((e, t) => e.textContent.includes(t) && e.getClientRects().length > 0, text))) continue
        await b.tap(); return true
      }
      return false
    }
    // Does the screen scroll, and are these buttons fully on screen?
    const check = async (screen, buttons) => {
      const r = await page.evaluate((buttons) => {
        const main = document.querySelector('main')
        const vh = window.innerHeight
        const btn = {}
        for (const t of buttons) {
          const b = [...document.querySelectorAll('button')].find((e) => e.textContent.includes(t))
          const box = b?.getBoundingClientRect()
          btn[t] = !b ? 'missing' : box.bottom <= vh && box.top >= 0 ? 'on screen' : `OFF (bottom ${Math.round(box.bottom)} > ${vh})`
        }
        return { scrolls: main.scrollHeight > main.clientHeight + 2, over: main.scrollHeight - main.clientHeight, btn }
      }, buttons)
      rows.push({ phone: `${name} ${w}x${h}`, screen, scrolls: r.scrolls ? `yes, ${r.over}px` : 'no', ...r.btn })
      await page.screenshot({ path: `${OUT}/${name}-${screen}.png` })
    }
    await check('home', ['Open a pack', 'Open local pack'])
    await tapText('Open a pack')
    const pack = await page.waitForSelector('.pack')
    await sleep(1300)
    await check('pack', [])
    await pack.tap()
    await sleep(4200)
    await check('cards', ['Reveal all'])
    await tapText('Reveal all')
    await sleep(1500)
    // A Legendary or Mythic opens the walkout on Reveal all? (no: it flips directly) — check the end state
    await check('revealed', ['Done', 'Open another'])
    const card = await page.$('button.flip.flipped')
    if (card) { await card.tap(); await sleep(900); await check('card-detail', ['Close']); await page.keyboard.press('Escape'); await sleep(300) }
    await tapText('Done')
    await sleep(400)
    await tapText('Collection'); await sleep(1200); await check('collection', [])
    await tapText('Map'); await sleep(3000); await check('map', [])
    if (errors.length) rows.push({ phone: name, screen: 'ERRORS', scrolls: errors.join(' | ') })
    await page.close()
  }
} finally {
  await browser.close()
}
console.table(rows)
