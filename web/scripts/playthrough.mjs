// Scripted playthrough of the demo in the installed Chrome (headless), with screenshots and console errors.
//   node scripts/playthrough.mjs [outDir]      (dev server must be running on http://localhost:5173)
import { mkdirSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const URL = 'http://localhost:5173/'
const OUT = process.argv[2] || '../minimap-previews/playthrough'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
mkdirSync(OUT, { recursive: true })

const errors = []
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let n = 0
const shot = async (page, name) => {
  const file = `${OUT}/${String(++n).padStart(2, '0')}-${name}.png`
  await page.screenshot({ path: file })
  console.log('screenshot', file)
}
const clickText = async (page, text, selector = 'button') => {
  const handles = await page.$$(selector)
  for (const h of handles) {
    // Only visible buttons: the header tabs are hidden on phones, the bottom tab bar on desktop
    const ok = await h.evaluate((el, text) => (el.textContent ?? '').includes(text) && el.getClientRects().length > 0, text)
    if (ok) { await h.click(); return true }
  }
  throw new Error(`No ${selector} with text "${text}"`)
}

// Tear the pack open: a real drag across the top strip, or a tap
const tearPack = async (page, { swipe = false, shotName } = {}) => {
  const pack = await page.waitForSelector('.pack')
  await sleep(1300) // the pack flies in and lands first
  if (shotName) await shot(page, shotName)
  const b = await pack.boundingBox()
  if (swipe) {
    const y = b.y + b.height * 0.11
    await page.mouse.move(b.x + 4, y)
    await page.mouse.down()
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(b.x + (b.width * 0.5 * i) / 12, y)
      await sleep(25)
    }
    await shot(page, 'pack-tearing')
    for (let i = 13; i <= 24; i++) {
      await page.mouse.move(b.x + (b.width * i) / 24, y)
      await sleep(25)
    }
    await page.mouse.up()
    await sleep(250)
    await shot(page, 'pack-torn')
  } else {
    await pack.click()
  }
  await sleep(3500)
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] })
try {
  const page = await browser.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`page: ${e.message}`))
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()} ${r.failure()?.errorText}`))
  await page.setViewport({ width: 1280, height: 860 })

  await page.goto(URL, { waitUntil: 'networkidle0' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('#hometown-search')
  await shot(page, 'hometown-picker')

  await page.type('#hometown-search', 'Halifax')
  await sleep(300)
  await shot(page, 'hometown-search')
  await page.click('[role="dialog"] ul button')
  await sleep(400)
  await shot(page, 'packs-ready')

  await clickText(page, 'Open a pack')
  await tearPack(page, { swipe: true, shotName: 'pack' })
  await shot(page, 'pack-face-down')

  // Commons and Rares flip themselves; tap the special cards still face down
  await sleep(1200)
  await shot(page, 'auto-flipped')
  const cards = await page.$$('button.flip')
  for (const c of await page.$$('button.flip:not(.flipped)')) {
    await c.click()
    await sleep(2800) // the charge-up before a special card
    // A Legendary or Mythic opens the walkout: let it play, then tap to go back
    const walkout = await page.$('[role="dialog"][aria-label$="reveal"]')
    if (walkout) {
      await sleep(3500)
      await shot(page, 'walkout')
      await walkout.click()
      await sleep(900)
    }
  }
  await shot(page, 'pack-revealed')

  await cards[cards.length - 1].click()
  await sleep(1200)
  await shot(page, 'card-detail')
  await page.keyboard.press('Escape')
  await sleep(300)
  await clickText(page, 'Done')

  // Open a few more packs quickly to fill the collection
  for (let k = 0; k < 6; k++) {
    await clickText(page, 'Demo: add a pack now')
    await clickText(page, 'Open a pack')
    await tearPack(page)
    await sleep(500)
    await clickText(page, 'Reveal all').catch(() => {}) // not there when every card flipped itself
    await sleep(900)
    await clickText(page, 'Done')
    await sleep(200)
  }
  await shot(page, 'packs-after')

  // Today's local pack (near the hometown), then pretend to travel and open another
  await clickText(page, 'Open local pack')
  await tearPack(page)
  await sleep(500)
  await clickText(page, 'Reveal all').catch(() => {}) // not there when every card flipped itself
  await sleep(1800)
  await shot(page, 'local-pack')
  await clickText(page, 'Done')
  await sleep(300)
  await shot(page, 'local-used')
  await clickText(page, "Demo: I'm somewhere else")
  await page.type('#hometown-search', 'Toronto')
  await sleep(300)
  await page.click('[role="dialog"] ul button')
  await clickText(page, 'Demo: new local pack now')
  await clickText(page, 'Open local pack')
  await tearPack(page)
  await sleep(500)
  await clickText(page, 'Reveal all').catch(() => {}) // not there when every card flipped itself
  await sleep(1500)
  await clickText(page, 'Done')

  await clickText(page, 'Collection')
  await sleep(1500)
  await shot(page, 'collection')
  await page.select('#f-variant', 'local')
  await sleep(800)
  await shot(page, 'collection-local')
  await page.select('#f-variant', '')

  await clickText(page, 'Map')
  await sleep(6000)
  await shot(page, 'map')

  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  // Switching to a phone viewport reloads the page: wait until the card pool has loaded again
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Packs')), { timeout: 30000 })
  await clickText(page, 'Packs')
  await clickText(page, 'Demo: add a pack now')
  await clickText(page, 'Open a pack')
    await tearPack(page)
  await sleep(600)
  await clickText(page, 'Reveal all').catch(() => {}) // not there when every card flipped itself
  await sleep(1800)
  await shot(page, 'phone-pack')
  await clickText(page, 'Done')
  await clickText(page, 'Collection')
  await sleep(1200)
  await shot(page, 'phone-collection')
} finally {
  await browser.close()
}
console.log(errors.length ? `\n${errors.length} errors:\n${[...new Set(errors)].join('\n')}` : '\nNo console or page errors.')
