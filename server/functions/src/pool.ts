// The card pool on the server: the same compact index the web demo uses (web/scripts/build-index.mjs), loaded once
// per function instance. In production it comes from Cloud Storage; locally from a file path (POOL_FILE).
import { readFileSync } from 'node:fs'

export const TIERS = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic'] as const
export type Tier = (typeof TIERS)[number]

// Game Design: copies per tier and pull odds per card slot (starting values, tuned in the beta).
export const CAPS: Record<Tier, number | null> = { Common: null, Rare: 1000, Epic: 100, Legendary: 10, Mythic: 1 }
export const ODDS: Record<Tier, number> = { Common: 0.7, Rare: 0.22, Epic: 0.065, Legendary: 0.014, Mythic: 0.001 }

export interface PoolCard { id: string; tier: Tier; lat: number; lon: number }
export interface Pool { byId: Map<string, PoolCard>; byTier: Record<Tier, PoolCard[]>; cards: PoolCard[] }

type Row = [string, string, number, string, string, number, number, string, string]

export function makePool(cards: PoolCard[]): Pool {
  const byTier = Object.fromEntries(TIERS.map((t) => [t, [] as PoolCard[]])) as Record<Tier, PoolCard[]>
  for (const c of cards) byTier[c.tier].push(c)
  return { cards, byId: new Map(cards.map((c) => [c.id, c])), byTier }
}

export function poolFromIndex(json: { cards: Row[] }): Pool {
  return makePool(json.cards.map(([id, , t, , , lat, lon]) => ({ id, tier: TIERS[t], lat, lon })))
}

let cached: Pool | null = null
export function loadPool(): Pool {
  if (!cached) {
    const file = process.env.POOL_FILE ?? new URL('../../../../web/public/data/index.json', import.meta.url)
    cached = poolFromIndex(JSON.parse(readFileSync(file, 'utf8')))
  }
  return cached
}
