// Builds web/public/data/index.json: a compact list of every card in the pipeline's export, enough to roll packs,
// search towns and draw the map. Full card details stay in the export's region files and load on demand.
//
//   node scripts/build-index.mjs        (run from web/; also runs before `npm run dev`)
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const EXPORT = join(here, "..", "..", "pipeline", "data", "export");
const OUT = join(here, "..", "public", "data", "index.json");
const COUNTRIES_PY = join(here, "..", "..", "pipeline", "countries.py");

const TIERS = ["Common", "Rare", "Epic", "Legendary", "Mythic"];
const TYPES = { town: "t", nature: "n", built: "b" };

if (!existsSync(EXPORT)) {
  console.error(`No pipeline export at ${EXPORT}. Run the pipeline's export step first.`);
  process.exit(1);
}

// Country names from pipeline/countries.py: ("CA", "Canada", "Q16", "fr")
const countryNames = {};
for (const m of readFileSync(COUNTRIES_PY, "utf8").matchAll(/\("([A-Z]{2})",\s*"([^"]+)",\s*"Q\d+"/g)) countryNames[m[1]] = m[2];

// Up to three facts for the card face's stats box, most telling first, packed as "p1776;e120;t7.8".
const FACT_CODES = { population: "p", height_m: "h", elevation_m: "e", prominence_m: "r", length_km: "l", area_km2: "a", temp_c: "t" };
const FACT_ORDER = {
  town: ["population", "elevation_m", "area_km2", "temp_c"],
  built: ["height_m", "length_km", "elevation_m", "temp_c"],
  nature: ["elevation_m", "prominence_m", "length_km", "area_km2", "height_m", "temp_c"],
};
// Rivers, lakes and islands: their size says more than their height above the sea.
const SIZE_FIRST = /river|creek|stream|lake|reservoir|bay|lagoon|island|archipelago|sound|strait|canal/;
function packFacts(c) {
  let order = FACT_ORDER[c.type] || FACT_ORDER.nature;
  if (c.type === "nature" && SIZE_FIRST.test(c.kind || "")) order = ["length_km", "area_km2", "elevation_m", "temp_c"];
  const out = [];
  for (const k of order) {
    const v = c.facts?.[k];
    if (v == null || out.length >= 3) continue;
    out.push(FACT_CODES[k] + (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10));
  }
  return out.join(";");
}

const regions = {}; // code -> { name, country, file, count }
const rows = [];
for (const cc of readdirSync(EXPORT).filter((d) => /^[A-Z]{2}$/.test(d)).sort()) {
  const idx = JSON.parse(readFileSync(join(EXPORT, cc, "index.json"), "utf8"));
  for (const r of idx.regions) {
    const data = JSON.parse(readFileSync(join(EXPORT, cc, r.file), "utf8"));
    regions[r.code] = { name: r.name, country: cc, file: `${cc}/${r.file}`, count: data.cards.length };
    // Collector number within the region, most famous first (like a set number: "NS 042/318").
    const ranked = [...data.cards].sort((a, b) => (b.fame || 0) - (a.fame || 0) || a.id.localeCompare(b.id));
    const num = new Map(ranked.map((c, i) => [c.id, i + 1]));
    for (const c of data.cards) {
      // [id, label, rarity index, type letter, region code, lat, lon, kind, image path or "", facts, collector number]
      rows.push([c.id, c.label || c.name, TIERS.indexOf(c.rarity), TYPES[c.type] || "n", c.region, c.lat, c.lon,
        c.kind || "", c.image?.file || "", packFacts(c), num.get(c.id)]);
    }
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ built: new Date().toISOString().slice(0, 10), countries: countryNames, regions, cards: rows }));
const byTier = TIERS.map((t, i) => `${t} ${rows.filter((r) => r[2] === i).length}`).join(", ");
console.log(`${rows.length} cards in ${Object.keys(regions).length} regions -> public/data/index.json (${byTier})`);
