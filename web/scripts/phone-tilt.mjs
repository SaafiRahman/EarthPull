// Phone tilt test: open a pack, reveal it, then fake the motion sensor tilting the phone left and right and check
// the cards follow (CSS variables on <html>, a screenshot per position).
//   node scripts/phone-tilt.mjs [outDir]      (dev server must be running on http://localhost:5173)
import { mkdirSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const OUT = process.argv[2] || '../minimap-previews/phone-tilt'
mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 412, height: 800, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const cdp = await page.createCDPSession()
  const orient = (beta, gamma) => cdp.send('DeviceOrientation.setDeviceOrientationOverride', { alpha: 0, beta, gamma })
  await orient(50, 0) // held upright-ish, as people do
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0' })
  await page.evaluate(() => localStorage.setItem('ptp-demo-v1', JSON.stringify({ packs: 3, nextRefill: null, owned: [], mints: {}, hometown: null, here: null, localDay: null, opened: 1 })))
  await page.reload({ waitUntil: 'networkidle0' })
  for (const b of await page.$$('button')) {
    if (await b.evaluate((e) => e.textContent.includes('Open a pack') && e.getClientRects().length > 0)) { await b.tap(); break }
  }
  const pack = await page.waitForSelector('.pack')
  await sleep(1300)
  await pack.tap()
  await sleep(4200)
  for (const b of await page.$$('button')) {
    if (await b.evaluate((e) => e.textContent.includes('Reveal all') && e.getClientRects().length > 0)) { await b.tap(); break }
  }
  await sleep(1500)
  for (const [name, beta, gamma] of [['level', 50, 0], ['tilt-right', 50, 22], ['tilt-left', 50, -22], ['tilt-forward', 66, 0]]) {
    await orient(beta, gamma)
    await sleep(500)
    const v = await page.evaluate(() => {
      const st = getComputedStyle(document.documentElement)
      return { on: document.documentElement.classList.contains('motion-tilt'), ry: st.getPropertyValue('--gry'), rx: st.getPropertyValue('--grx'), mx: st.getPropertyValue('--gmx') }
    })
    console.log(name.padEnd(13), JSON.stringify(v))
    await page.screenshot({ path: `${OUT}/${name}.png` })
  }
} finally {
  await browser.close()
}
