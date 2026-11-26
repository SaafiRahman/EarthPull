// Checks the foil roll and local packs on the real card pool, inside the dev server (so the TypeScript game code runs as-is).
//   node scripts/check-variants.mjs      (dev server must be running on http://localhost:5173)
import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
try {
  const page = await browser.newPage()
  await page.goto('http://localhost:5173/#cards', { waitUntil: 'networkidle0' })
  const report = await page.evaluate(async () => {
    const { loadPool, distanceKm, CAPS, FOIL_CAPS } = await import('/src/data.ts')
    const g = await import('/src/game.ts')
    const pool = await loadPool()
    const out = {}
    const town = (label, region) => {
      const c = pool.cards.find((x) => x.type === 'town' && x.label === label && x.region === region)
      return { id: c.id, label: c.label, lat: c.lat, lon: c.lon }
    }

    // Normal packs: foil rate, foil Common numbering, no duplicate cards in a pack
    let s = { ...g.newState(), packs: 3 }
    let cards = 0, foils = 0, foilCommons = 0, badFoilSerial = 0, dupPacks = 0
    for (let i = 0; i < 4000; i++) {
      s = { ...s, packs: 3 }
      const r = g.openPack(pool, s)
      s = r.state
      if (new Set(r.pulls.map((p) => p.card.id)).size !== r.pulls.length) dupPacks++
      for (const p of r.pulls) {
        cards++
        if (p.foil) foils++
        if (p.foil && p.card.tier === 'Common') foilCommons++
        if (p.foil && p.card.tier === 'Mythic') badFoilSerial++
        // Commons never numbered; numbered tiers within the run they came from
        const cap = (p.foil ? FOIL_CAPS : CAPS)[p.card.tier]
        if (p.card.tier === 'Common' ? p.serial != null
          : cap == null ? (p.serial == null || p.cap != null)
            : (p.serial == null || p.serial > cap || p.cap !== cap)) badFoilSerial++
      }
    }
    // Sell out one Legendary: 100 plain + 5 foil copies, then nothing
    const leg = pool.byTier.Legendary[0]
    const one = { ...pool, byTier: { Common: [], Rare: [], Epic: [], Legendary: [leg], Mythic: [] } }
    const only = { ...pool, byTier: one.byTier }
    let st = g.newState(), plain = 0, foilLeg = 0
    for (let i = 0; i < 160; i++) {
      const r = g.openPack(only, { ...st, packs: 3, mints: { ...st.mints, [leg.id]: st.mints[leg.id] ?? 0, [`${leg.id}~foil`]: st.mints[`${leg.id}~foil`] ?? 0 } }, Math.random)
      st = r.state
      for (const p of r.pulls) { if (p.card.id === leg.id) p.foil ? foilLeg++ : plain++ }
    }
    out.legendarySellOut = { plain, foil: foilLeg, expected: '100 plain, 5 foil' }
    out.normal = { cards, foilRate: +(foils / cards).toFixed(4), foilCommons, badFoilSerial, dupPacks }

    // Local packs: a city and a rural town; distances, tiers, stamps, one a day
    for (const [label, region] of [['Halifax', 'CA-NS'], ['Toronto', 'CA-ON'], ['Wawa', 'CA-ON'], ['Fairbanks', 'US-AK']]) {
      let here
      try { here = town(label, region) } catch { out[label] = 'town not found'; continue }
      const base = { ...g.newState(), here }
      const dist = [], tiers = {}
      let unstamped = 0, outside = 0
      for (let i = 0; i < 400; i++) {
        const r = g.openPack(pool, base, Math.random, 'local')
        for (const p of r.pulls) {
          const d = distanceKm(here.lat, here.lon, p.card.lat, p.card.lon)
          dist.push(d)
          tiers[p.card.tier] = (tiers[p.card.tier] || 0) + 1
          if (p.local !== label) unstamped++
          if (d > 150 && p.card.region !== pool.byId.get(here.id).region) outside++
        }
        if (i === 0) {
          out[`${label}OnceADay`] = !g.localReady(r.state) && g.localReady({ ...r.state, localDay: null })
          out[`${label}PacksUntouched`] = r.state.packs === base.packs
        }
      }
      dist.sort((a, b) => a - b)
      out[label] = {
        cards: dist.length, median_km: Math.round(dist[dist.length >> 1]), max_km: Math.round(dist.at(-1)),
        within50: +(dist.filter((d) => d <= 50).length / dist.length).toFixed(2), tiers, unstamped, outside,
      }
    }
    return out
  })
  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser.close()
}
