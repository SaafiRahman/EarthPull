// Screenshot the map in every style with a filled collection.
//   node scripts/map-styles.mjs [outDir]      (dev server must be running on http://localhost:5173)
import { mkdirSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] || '../minimap-previews/map-styles'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const errors = []
const clickText = async (page, text) => {
  for (const h of await page.$$('button')) {
    if ((await h.evaluate((el) => el.textContent?.trim() ?? '')).includes(text)) return h.click()
  }
  throw new Error(`No button "${text}"`)
}

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--hide-scrollbars'] })
try {
  const page = await browser.newPage()
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.setViewport({ width: 1280, height: 860 })
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' })
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle0' })
  await clickText(page, 'Skip')
  for (let k = 0; k < 15; k++) {
    await clickText(page, 'Demo: add a pack now')
    await clickText(page, 'Open a pack')
    await sleep(300)
    await clickText(page, 'Reveal all')
    await sleep(200)
    await clickText(page, 'Done')
  }
  await clickText(page, 'Map')
  for (const id of ['liberty', 'bright', 'positron', 'fiord', 'dark']) {
    await page.click(`#map-style-${id}`)
    await sleep(6000)
    await page.screenshot({ path: `${OUT}/${id}.png` })
    console.log('screenshot', id)
  }
} finally {
  await browser.close()
}
console.log(errors.length ? `errors:\n${[...new Set(errors)].join('\n')}` : 'No errors.')
