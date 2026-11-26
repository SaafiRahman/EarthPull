// Screenshots of the card preview page (/#cards): the whole page, plus each row on its own.
//   node scripts/shot-cards.mjs [outDir]      (dev server must be running on http://localhost:5173)
import { mkdirSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] || '../minimap-previews/cards'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] })
try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 })
  await page.goto('http://localhost:5173/#cards', { waitUntil: 'networkidle0' })
  await page.evaluate(() => document.fonts.ready)
  await new Promise((r) => setTimeout(r, 1500))
  const rows = await page.$$('section')
  for (let i = 0; i < rows.length; i++) {
    const file = `${OUT}/row-${i + 1}.png`
    await rows[i].screenshot({ path: file })
    console.log('screenshot', file)
  }
  // One card up close, with the pointer over it so the tilt and light show
  const cards = await page.$$('section:nth-of-type(2) .tcg')
  if (cards[1]) {
    await cards[1].evaluate((el) => el.scrollIntoView({ block: 'center' }))
    const box = await cards[1].boundingBox()
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.3)
    await new Promise((r) => setTimeout(r, 500))
    await page.screenshot({ path: `${OUT}/tilt-foil.png`, clip: { x: box.x - 20, y: box.y - 20, width: box.width + 40, height: box.height + 40 } })
    console.log('screenshot', `${OUT}/tilt-foil.png`)
  }
  console.log(errors.length ? `Errors:\n${errors.join('\n')}` : 'No console or page errors.')
} finally {
  await browser.close()
}
