// Frame-rate check of the pack opening on a simulated phone (CPU slowed 4x like a mid-range phone). Records the time
// between animation frames from the tap on the pack until the cards have landed, and reports fps and long frames.
//   node scripts/phone-perf.mjs [label] [extra CSS to inject, to test switching an effect off]
import puppeteer from 'puppeteer-core'

const LABEL = process.argv[2] || 'current'
const CSS = process.argv[3] || ''
const RUNS = 3
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--enable-gpu-rasterization'] })
const results = []
try {
  for (let run = 0; run < RUNS; run++) {
    const page = await browser.newPage()
    await page.setViewport({ width: 412, height: 800, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6 })
    const cdp = await page.createCDPSession()
    await page.goto(process.env.URL || 'http://localhost:5173/', { waitUntil: 'networkidle0' })
    // Same pack every run: a Legendary pack (glows, sparkles), seed found with record-special's search
    await page.evaluate(() => localStorage.setItem('ptp-demo-v1', JSON.stringify({ packs: 3, nextRefill: null, owned: [], mints: {}, hometown: null, here: null, localDay: null, opened: 1 })))
    await page.reload({ waitUntil: 'networkidle0' })
    if (CSS) await page.addStyleTag({ content: CSS })
    await page.evaluate(() => {
      let a = 7
      Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
    })
    for (const b of await page.$$('button')) {
      if (await b.evaluate((e) => e.textContent.includes('Open a pack') && e.getClientRects().length > 0)) { await b.tap(); break }
    }
    const pack = await page.waitForSelector('.pack')
    await sleep(1500)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await page.evaluate(() => {
      window.__frames = []
      let last = performance.now()
      const tick = (t) => { window.__frames.push(t - last); last = t; if (window.__frames.length < 2000) requestAnimationFrame(tick) }
      requestAnimationFrame(tick)
    })
    await pack.tap()
    await sleep(4500)
    const frames = await page.evaluate(() => window.__frames.slice(1))
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    const total = frames.reduce((a, b) => a + b, 0)
    results.push({ fps: (frames.length / total) * 1000, long: frames.filter((f) => f > 50).length, worst: Math.max(...frames) })
    await page.close()
  }
} finally {
  await browser.close()
}
const avg = (k) => results.reduce((a, r) => a + r[k], 0) / results.length
console.log(`${LABEL.padEnd(24)} fps ${avg('fps').toFixed(1)}  frames over 50 ms ${avg('long').toFixed(1)}  worst ${avg('worst').toFixed(0)} ms`)
