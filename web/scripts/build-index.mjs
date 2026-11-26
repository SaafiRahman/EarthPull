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

const regions = {}; // code -> { name, country, file }
const rows = [];
for (const cc of readdirSync(EXPORT).filter((d) => /^[A-Z]{2}$/.test(d)).sort()) {
  const idx = JSON.parse(readFileSync(join(EXPORT, cc, "index.json"), "utf8"));
  for (const r of idx.regions) {
    regions[r.code] = { name: r.name, country: cc, file: `${cc}/${r.file}` };
    const data = JSON.parse(readFileSync(join(EXPORT, cc, r.file), "utf8"));
    for (const c of data.cards) {
      // [id, label, rarity index, type letter, region code, lat, lon, kind, image path or ""]
      rows.push([c.id, c.label || c.name, TIERS.indexOf(c.rarity), TYPES[c.type] || "n", c.region, c.lat, c.lon,
        c.kind || "", c.image?.file || ""]);
    }
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ built: new Date().toISOString().slice(0, 10), countries: countryNames, regions, cards: rows }));
const byTier = TIERS.map((t, i) => `${t} ${rows.filter((r) => r[2] === i).length}`).join(", ");
console.log(`${rows.length} cards in ${Object.keys(regions).length} regions -> public/data/index.json (${byTier})`);
