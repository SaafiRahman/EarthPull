// Demo game state, kept in the browser (localStorage). Packs roll here too; in the real build both move to the server
// (Roadmap Phase 2). Serial numbers are simulated: each numbered card starts with a made-up count of copies already
// claimed by "other players", so pulls feel like they land in a shared world.
import type { Stamp } from './Card'
import { CAPS, FOIL_COMMON_CAP, FOIL_ODDS, ODDS, TIERS, distanceKm, type IndexCard, type Pool, type Tier } from './data'

export const PACK_SIZE = 5
export const MAX_PACKS = 3
export const REFILL_MS = 2 * 60 * 60 * 1000 // one pack every 2 hours
export const HOMETOWN_KM = 50
// Local pack (Decisions 2026-11-26): one a day, cards within 50 km, widening to 150 km, then the province or state.
export const LOCAL_RADII_KM = [50, 150]

export interface Owned {
  id: string; serial: number | null; at: number
  hometown?: boolean
  foil?: boolean
  local?: string // town the local pack was opened in
}
export interface Hometown { id: string; label: string; lat: number; lon: number }

export interface GameState {
  packs: number
  nextRefill: number | null
  owned: Owned[]
  mints: Record<string, number> // copies minted so far, per numbered card ("<id>~foil" for foil Commons)
  hometown: Hometown | null
  here: Hometown | null // where the player is, for local packs (demo: picked by hand; defaults to the hometown)
  localDay: string | null // day the last local pack was opened (YYYY-MM-DD, local time)
  opened: number // normal packs opened, ever
}

const KEY = 'ptp-demo-v1'

export function newState(): GameState {
  return { packs: MAX_PACKS, nextRefill: null, owned: [], mints: {}, hometown: null, here: null, localDay: null, opened: 0 }
}

export function loadState(): GameState {
  try {
    const s = localStorage.getItem(KEY)
    return s ? { ...newState(), ...JSON.parse(s) } : newState()
  } catch {
    return newState()
  }
}

export function saveState(s: GameState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode: play without saving */ }
}

/** Add packs that refilled while away. */
export function refill(s: GameState, now = Date.now()): GameState {
  if (s.packs >= MAX_PACKS) return { ...s, nextRefill: null }
  let { packs, nextRefill } = s
  if (nextRefill == null) nextRefill = now + REFILL_MS
  while (packs < MAX_PACKS && nextRefill <= now) {
    packs += 1
    nextRefill += REFILL_MS
  }
  return { ...s, packs, nextRefill: packs >= MAX_PACKS ? null : nextRefill }
}

const dayOf = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export const whereAmI = (s: GameState) => s.here ?? s.hometown
export const localReady = (s: GameState, now = Date.now()) => !!whereAmI(s) && s.localDay !== dayOf(now)
/** Next local midnight, when a new local pack is ready. */
export function nextLocalAt(now = Date.now()): number {
  const d = new Date(now)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime()
}

/** The sticker a copy carries: Local (place it was opened) or Hometown. */
export function stampOf(o: { local?: string; hometown?: boolean; at: number }, s: GameState): Stamp | undefined {
  if (o.local) return { kind: 'local', place: o.local, date: o.at }
  if (o.hometown) return { kind: 'hometown', place: s.hometown?.label ?? 'Home', date: o.at }
  return undefined
}

// Stable 0..1 number from a card id, so each card's simulated "already claimed" count stays the same.
function hash01(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return ((h >>> 0) % 100000) / 100000
}

function alreadyClaimed(card: IndexCard, foilCommon = false): number {
  if (foilCommon) return Math.floor(hash01(`${card.id}~foil`) * FOIL_COMMON_CAP * 0.2)
  const cap = CAPS[card.tier]
  if (cap == null || card.tier === 'Mythic') return 0
  const f = hash01(card.id)
  return card.tier === 'Legendary' ? Math.floor(f * 4) : Math.floor(f * cap * 0.4)
}

export function mintedSoFar(s: GameState, card: IndexCard): number {
  return s.mints[card.id] ?? alreadyClaimed(card)
}

function rollTier(rand: () => number): Tier {
  let x = rand()
  for (const t of [...TIERS].reverse()) {
    if (x < ODDS[t]) return t
    x -= ODDS[t]
  }
  return 'Common'
}

const pick = <T,>(xs: T[], rand: () => number) => xs[Math.floor(rand() * xs.length)]

export interface Pulled { card: IndexCard; serial: number | null; cap: number | null; hometown?: boolean; foil: boolean; local?: string }

/** Cards for a local pack, by tier: the nearest ring that has any, else the province or state. */
function localPools(pool: Pool, here: Hometown): Record<Tier, IndexCard[]> {
  const region = pool.byId.get(here.id)?.region
  const rings = LOCAL_RADII_KM.map(() => [] as IndexCard[])
  const inRegion: IndexCard[] = []
  for (const c of pool.cards) {
    const d = distanceKm(here.lat, here.lon, c.lat, c.lon)
    LOCAL_RADII_KM.forEach((r, i) => { if (d <= r) rings[i].push(c) })
    if (c.region === region) inRegion.push(c)
  }
  const out = {} as Record<Tier, IndexCard[]>
  for (const t of TIERS) {
    out[t] = [...rings, inRegion].map((cs) => cs.filter((c) => c.tier === t)).find((cs) => cs.length) ?? []
  }
  return out
}

/**
 * Open one pack: returns the pulls (worst first, best last) and the new state. A normal pack uses up one of the
 * timed packs; a local pack is the day's free one, drawn from near `whereAmI`, every card stamped Local.
 */
export function openPack(pool: Pool, s: GameState, rand = Math.random, kind: 'normal' | 'local' = 'normal'): { pulls: Pulled[]; state: GameState } {
  const mints = { ...s.mints }
  const taken = new Set<string>()
  const pulls: Pulled[] = []
  const here = whereAmI(s)
  const local = kind === 'local' && here ? here : null
  const byTier = local ? localPools(pool, local) : pool.byTier

  const claim = (card: IndexCard, hometown = false): boolean => {
    if (taken.has(card.id)) return false
    let foil = rand() < FOIL_ODDS
    const cap = CAPS[card.tier]
    let serial: number | null = null
    if (cap != null) {
      const minted = mints[card.id] ?? alreadyClaimed(card)
      if (minted >= cap) return false // minted out: this card can't drop any more
      serial = minted + 1
      mints[card.id] = serial
    } else if (foil) {
      const key = `${card.id}~foil`
      const minted = mints[key] ?? alreadyClaimed(card, true)
      if (minted < FOIL_COMMON_CAP) mints[key] = serial = minted + 1
      else foil = false // foils of this Common are all claimed: a plain copy instead
    }
    taken.add(card.id)
    pulls.push({ card, serial, cap: foil && card.tier === 'Common' ? FOIL_COMMON_CAP : cap, hometown, foil, local: local?.label })
    return true
  }

  // Hometown pack: the first normal pack holds one card within HOMETOWN_KM of the chosen hometown.
  if (!local && s.opened === 0 && s.hometown) {
    const h = s.hometown
    const near = pool.cards.filter((c) => c.id !== h.id && distanceKm(h.lat, h.lon, c.lat, c.lon) <= HOMETOWN_KM)
    const home = pool.byId.get(h.id)
    for (let tries = 0; tries < 30 && !pulls.length; tries++) {
      const tier = rollTier(rand)
      const options = near.filter((c) => TIERS.indexOf(c.tier) <= TIERS.indexOf(tier))
      const best = options.filter((c) => c.tier === tier)
      const card = best.length ? pick(best, rand) : options.length ? pick(options, rand) : home
      if (card) claim(card, true)
    }
  }

  for (let tries = 0; pulls.length < PACK_SIZE && tries < 500; tries++) {
    // A rarity with nothing left nearby falls to the next one down (local packs in the countryside)
    let i = TIERS.indexOf(rollTier(rand))
    while (i > 0 && !byTier[TIERS[i]].length) i--
    const card = pick(byTier[TIERS[i]], rand)
    if (card) claim(card)
  }

  const rank = (p: Pulled) => TIERS.indexOf(p.card.tier) * 2 + (p.foil ? 1 : 0)
  pulls.sort((a, b) => rank(a) - rank(b))
  const now = Date.now()
  const owned = [...s.owned, ...pulls.map((p): Owned => ({
    id: p.card.id, serial: p.serial, at: now, hometown: p.hometown || undefined, foil: p.foil || undefined, local: p.local,
  }))]
  if (local) return { pulls, state: { ...s, owned, mints, localDay: dayOf(now) } }
  const packs = s.packs - 1
  const state: GameState = {
    ...s, packs, owned, mints, opened: s.opened + 1,
    nextRefill: s.nextRefill ?? (packs < MAX_PACKS ? now + REFILL_MS : null),
  }
  return { pulls, state }
}
