// Card pool: a compact index (public/data/index.json, built by scripts/build-index.mjs) for rolling packs, search and
// the map, plus full card details loaded on demand from the pipeline's region files (/export/<CC>/<region>.json).

export const TIERS = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'] as const
export type Tier = (typeof TIERS)[number]

// Only the top is capped (developer, 2026-11-26): Legendary /100, Mythic 1/1. Rare and Epic are unlimited but still
// numbered in pull order ("Rare #4,812"); Commons are unlimited and unnumbered.
export const CAPS: Record<Tier, number | null> = { Common: null, Rare: null, Epic: null, Legendary: 100, Mythic: 1 }
export const NUMBERED: Record<Tier, boolean> = { Common: false, Rare: true, Epic: true, Legendary: true, Mythic: true }
// Pull odds per card slot (Game Design, starting values)
export const ODDS: Record<Tier, number> = { Common: 0.7, Rare: 0.22, Epic: 0.065, Legendary: 0.014, Mythic: 0.001 }
// Variants (Decisions 2026-11-26): any card but a Mythic can roll foil. Foils are their own run, numbered separately;
// a capped tier's foil run is sized to the 5% foil odds (Legendary 100 + 5 foil), so both runs sell out together. The Mythic stays a single copy with no foil.
export const FOIL_ODDS = 0.05
export const FOIL_CAPS: Record<Tier, number | null> = { Common: null, Rare: null, Epic: null, Legendary: 5, Mythic: 0 }

export type CardType = 'town' | 'nature' | 'built'
const TYPE_OF: Record<string, CardType> = { t: 'town', n: 'nature', b: 'built' }

export interface IndexCard {
  id: string
  label: string
  tier: Tier
  type: CardType
  region: string // ISO 3166-2 code, e.g. CA-QC
  lat: number
  lon: number
  kind: string
  image: string // path inside /export/, '' if none
  facts: Fact[] // up to three, most telling first
  num: number // collector number within the region (1 = most famous)
}

export type FactKey = 'population' | 'height_m' | 'elevation_m' | 'prominence_m' | 'length_km' | 'area_km2' | 'temp_c'
export interface Fact { key: FactKey; value: number }
const FACT_KEYS: Record<string, FactKey> = {
  p: 'population', h: 'height_m', e: 'elevation_m', r: 'prominence_m', l: 'length_km', a: 'area_km2', t: 'temp_c',
}
const parseFacts = (s: string): Fact[] =>
  s ? s.split(';').map((f) => ({ key: FACT_KEYS[f[0]], value: Number(f.slice(1)) })).filter((f) => f.key) : []

export interface Region { name: string; country: string; file: string; count?: number }

export interface Pool {
  cards: IndexCard[]
  byId: Map<string, IndexCard>
  byTier: Record<Tier, IndexCard[]>
  regions: Record<string, Region>
  countries: Record<string, string>
}

export interface CardDetail {
  id: string
  name: string
  label: string
  type: CardType
  kind: string
  region: string
  country: string
  lat: number
  lon: number
  rarity: Tier
  fame: number
  facts: Record<string, number | null>
  flavour?: { text: string; source: string; lang?: string; title?: string; url?: string; translated?: boolean }
  image?: { kind: 'photo' | 'minimap'; file: string; author?: string; licence?: string; licence_url?: string; page?: string }
}

type Row = [string, string, number, string, string, number, number, string, string, string?, number?]

export async function loadPool(): Promise<Pool> {
  const res = await fetch('/data/index.json')
  if (!res.ok) throw new Error('The card index did not load. Run `npm run dev` from web/ so it gets built.')
  const raw = (await res.json()) as { cards: Row[]; regions: Record<string, Region>; countries: Record<string, string> }
  const cards = raw.cards.map(([id, label, t, ty, region, lat, lon, kind, image, facts, num]): IndexCard => ({
    id, label, tier: TIERS[t], type: TYPE_OF[ty] ?? 'nature', region, lat, lon, kind, image,
    facts: parseFacts(facts ?? ''), num: num ?? 0,
  }))
  const byTier = Object.fromEntries(TIERS.map((t) => [t, [] as IndexCard[]])) as Record<Tier, IndexCard[]>
  for (const c of cards) byTier[c.tier].push(c)
  return { cards, byId: new Map(cards.map((c) => [c.id, c])), byTier, regions: raw.regions, countries: raw.countries }
}

const regionFiles = new Map<string, Promise<Map<string, CardDetail>>>()

export function loadDetail(pool: Pool, id: string): Promise<CardDetail | undefined> {
  const card = pool.byId.get(id)
  if (!card) return Promise.resolve(undefined)
  const file = pool.regions[card.region]?.file
  if (!file) return Promise.resolve(undefined)
  if (!regionFiles.has(file)) {
    regionFiles.set(file, fetch(`/export/${file}`)
      .then((r) => r.json())
      .then((d: { cards: CardDetail[] }) => new Map(d.cards.map((c) => [c.id, c]))))
  }
  return regionFiles.get(file)!.then((m) => m.get(id))
}

export const imageUrl = (path: string) => (path ? `/export/${path}` : '')

export function regionName(pool: Pool, code: string): string {
  return pool.regions[code]?.name ?? code
}

export function countryName(pool: Pool, code: string): string {
  const cc = pool.regions[code]?.country ?? code.slice(0, 2)
  return pool.countries[cc] ?? cc
}

export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = Math.PI / 180
  const h = Math.sin(((bLat - aLat) * r) / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLon - aLon) * r) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}
