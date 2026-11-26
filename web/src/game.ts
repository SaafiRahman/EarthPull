// Demo game state, kept in the browser (localStorage). Packs roll here too; in the real build both move to the server
// (Roadmap Phase 2). Serial numbers are simulated: each numbered card starts with a made-up count of copies already
// claimed by "other players", so pulls feel like they land in a shared world.
import { CAPS, ODDS, TIERS, distanceKm, type IndexCard, type Pool, type Tier } from './data'

export const PACK_SIZE = 5
export const MAX_PACKS = 3
export const REFILL_MS = 2 * 60 * 60 * 1000 // one pack every 2 hours
export const HOMETOWN_KM = 50

export interface Owned { id: string; serial: number | null; at: number; hometown?: boolean }
export interface Hometown { id: string; label: string; lat: number; lon: number }

export interface GameState {
  packs: number
  nextRefill: number | null
  owned: Owned[]
  mints: Record<string, number> // copies minted so far, per numbered card
  hometown: Hometown | null
  opened: number // packs opened, ever
}

const KEY = 'ptp-demo-v1'

export function newState(): GameState {
  return { packs: MAX_PACKS, nextRefill: null, owned: [], mints: {}, hometown: null, opened: 0 }
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

// Stable 0..1 number from a card id, so each card's simulated "already claimed" count stays the same.
function hash01(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  return ((h >>> 0) % 100000) / 100000
}

function alreadyClaimed(card: IndexCard): number {
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

export interface Pulled { card: IndexCard; serial: number | null; cap: number | null; hometown?: boolean }

/** Open one pack: returns the pulls (worst first, best last) and the new state. */
export function openPack(pool: Pool, s: GameState, rand = Math.random): { pulls: Pulled[]; state: GameState } {
  const mints = { ...s.mints }
  const taken = new Set<string>()
  const pulls: Pulled[] = []

  const claim = (card: IndexCard, hometown = false): boolean => {
    if (taken.has(card.id)) return false
    const cap = CAPS[card.tier]
    let serial: number | null = null
    if (cap != null) {
      const minted = mints[card.id] ?? alreadyClaimed(card)
      if (minted >= cap) return false // minted out: this card can't drop any more
      serial = minted + 1
      mints[card.id] = serial
    }
    taken.add(card.id)
    pulls.push({ card, serial, cap, hometown })
    return true
  }

  // Hometown pack: the first pack holds one card within HOMETOWN_KM of the chosen hometown.
  if (s.opened === 0 && s.hometown) {
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

  while (pulls.length < PACK_SIZE) {
    const card = pick(pool.byTier[rollTier(rand)], rand)
    if (card) claim(card)
  }

  pulls.sort((a, b) => TIERS.indexOf(a.card.tier) - TIERS.indexOf(b.card.tier))
  const now = Date.now()
  const owned = [...s.owned, ...pulls.map((p) => ({ id: p.card.id, serial: p.serial, at: now, hometown: p.hometown }))]
  const packs = s.packs - 1
  const state: GameState = {
    ...s, packs, owned, mints, opened: s.opened + 1,
    nextRefill: s.nextRefill ?? (packs < MAX_PACKS ? now + REFILL_MS : null),
  }
  return { pulls, state }
}
