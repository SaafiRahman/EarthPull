// Close-up of the sealed pack on the pack screen, at the device's real pixel ratio, to check how sharp it is.
//   node scripts/shot-pack.mjs [out.png] [deviceScaleFactor]      (dev server on http://localhost:5173)
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] || '../minimap-previews/pack-closeup.png'
const DPR = Number(process.argv[3] || 1)
mkdirSync(dirname(OUT), { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1100, height: 760, deviceScaleFactor: DPR })
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' })
  await page.evaluate(() => localStorage.setItem('ptp-demo-v1', JSON.stringify({ packs: 3, nextRefill: null, owned: [], mints: {}, hometown: null, here: null, localDay: null, opened: 1 })))
  await page.reload({ waitUntil: 'networkidle0' })
  for (const h of await page.$$('button')) if ((await h.evaluate((e) => e.textContent)).includes('Open a pack')) { await h.click(); break }
  const pack = await page.waitForSelector('.pack')
  await page.evaluate(() => document.fonts.ready)
  await sleep(1200)
  const b = await pack.boundingBox()
  await page.screenshot({ path: OUT, clip: { x: b.x - 10, y: b.y - 10, width: b.width + 20, height: b.height * 0.55 } })
  console.log('screenshot', OUT)
} finally {
  await browser.close()
}
