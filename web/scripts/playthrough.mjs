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
    const t = await h.evaluate((el) => el.textContent?.trim() ?? '')
    if (t.includes(text)) { await h.click(); return true }
  }
  throw new Error(`No ${selector} with text "${text}"`)
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
  await sleep(900)
  await shot(page, 'pack-face-down')

  const cards = await page.$$('button.flip')
  for (let i = 0; i < cards.length; i++) {
    await cards[i].click()
    await sleep(i === cards.length - 1 ? 1600 : 500)
    if (i === 0) await shot(page, 'first-flip')
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
    await sleep(500)
    await clickText(page, 'Reveal all')
    await sleep(900)
    await clickText(page, 'Done')
    await sleep(200)
  }
  await shot(page, 'packs-after')

  await clickText(page, 'Collection')
  await sleep(1500)
  await shot(page, 'collection')

  await clickText(page, 'Map')
  await sleep(6000)
  await shot(page, 'map')

  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await clickText(page, 'Packs')
  await clickText(page, 'Demo: add a pack now')
  await clickText(page, 'Open a pack')
  await sleep(600)
  await clickText(page, 'Reveal all')
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
