// Pack opening on the server (Roadmap Phase 2): everything that decides what a player pulled runs here, never in
// the browser.
//
// Firestore layout
//   pack_state/{uid}   { packs, nextRefill (ms), opened }     one pack per REFILL_MS, at most MAX_PACKS
//   serials/{cardId}_{n} { cardId, serial, uid, at }            one document per numbered copy (the source of truth)
//   mintCounts/{cardId} { minted, cap }                        numbered cards only; running total of copies
//   pulls/{autoId}     { uid, cardId, serial, tier, at, packId, hometown? }
//   users/{uid}        { hometownCard? }                       the town picked for the first (hometown) pack
//
// Minting a numbered copy safely: see mint(). A card that is minted out re-rolls its slot. Commons have no serial.
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { CAPS, ODDS, TIERS, type Pool, type PoolCard, type Tier } from './pool.js'

export const PACK_SIZE = 5
export const MAX_PACKS = 3
export const REFILL_MS = 2 * 60 * 60 * 1000
export const HOMETOWN_KM = 50
const MAX_REROLLS = 50

export class NoPacks extends Error {
  constructor(public nextRefill: number | null) { super('No packs left') }
}

export interface PackState { packs: number; nextRefill: number | null; opened: number }
export interface Pull { cardId: string; tier: Tier; serial: number | null; hometown?: boolean }

export function refill(s: PackState, now: number): PackState {
  if (s.packs >= MAX_PACKS) return { ...s, nextRefill: null }
  let { packs, nextRefill } = s
  if (nextRefill == null) nextRefill = now + REFILL_MS
  while (packs < MAX_PACKS && nextRefill <= now) { packs += 1; nextRefill += REFILL_MS }
  return { ...s, packs, nextRefill: packs >= MAX_PACKS ? null : nextRefill }
}

export function rollTier(rand: () => number): Tier {
  let x = rand()
  for (const t of [...TIERS].reverse()) {
    if (x < ODDS[t]) return t
    x -= ODDS[t]
  }
  return 'Common'
}

function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = Math.PI / 180
  const h = Math.sin(((bLat - aLat) * r) / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLon - aLon) * r) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

/** Take one pack from the player's stock (with refills), in a transaction. Returns how many packs they had opened before. */
async function takePack(db: Firestore, uid: string, now: number): Promise<number> {
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`pack_state/${uid}`)
    const snap = await tx.get(ref)
    const s = refill((snap.data() as PackState | undefined) ?? { packs: MAX_PACKS, nextRefill: null, opened: 0 }, now)
    if (s.packs < 1) throw new NoPacks(s.nextRefill)
    const packs = s.packs - 1
    tx.set(ref, { packs, opened: s.opened + 1, nextRefill: s.nextRefill ?? (packs < MAX_PACKS ? now + REFILL_MS : null) })
    return s.opened
  })
}

const ALREADY_EXISTS = 6 // gRPC status for create() on a document that exists

/** Claim the next copy of a numbered card for `uid`. Returns the serial, or null if the card is minted out.
 *
 *  Each copy is its own document, serials/{cardId}_{n}, claimed with create(). Firestore lets exactly one
 *  create() of a document succeed, so a serial can never be handed out twice, and no claim ever waits on a lock.
 *  A claim that loses simply tries the next number, up to the cap. mintCounts/{cardId}.minted is a running total
 *  (bumped after each successful claim) and tells the next claim where to start looking.
 *
 *  Why not one transaction on a counter (the first design): with 500 players claiming the same Legendary at once,
 *  transactions on the single counter document hit lock timeouts and deadlines instead of queueing (load test,
 *  2026-11-26). */
export async function mint(db: Firestore, card: PoolCard, uid = ''): Promise<number | null> {
  const cap = CAPS[card.tier]
  if (cap == null) throw new Error('Commons are not minted')
  const counter = db.doc(`mintCounts/${card.id}`)
  const start = ((await counter.get()).data()?.minted as number | undefined) ?? 0
  for (let n = start + 1; n <= cap; n++) {
    try {
      await db.doc(`serials/${card.id}_${n}`).create({ cardId: card.id, serial: n, uid, at: FieldValue.serverTimestamp() })
    } catch (e) {
      if ((e as { code?: number }).code === ALREADY_EXISTS) continue // someone got this number first
      throw e
    }
    await counter.set({ minted: FieldValue.increment(1), cap }, { merge: true })
    return n
  }
  return null
}

export async function openPack(db: Firestore, pool: Pool, uid: string, opts: { rand?: () => number; now?: number } = {}): Promise<Pull[]> {
  const rand = opts.rand ?? Math.random
  const now = opts.now ?? Date.now()
  const openedBefore = await takePack(db, uid, now)
  const taken = new Set<string>()
  const pulls: Pull[] = []

  const tryCard = async (card: PoolCard | undefined, hometown = false): Promise<boolean> => {
    if (!card || taken.has(card.id)) return false
    const serial = CAPS[card.tier] == null ? null : await mint(db, card, uid)
    if (CAPS[card.tier] != null && serial == null) return false // minted out: re-roll this slot
    taken.add(card.id)
    pulls.push({ cardId: card.id, tier: card.tier, serial, ...(hometown ? { hometown } : {}) })
    return true
  }
  const pick = (xs: PoolCard[]) => xs[Math.floor(rand() * xs.length)]

  // Hometown pack: the first pack holds one card within HOMETOWN_KM of the player's chosen town.
  if (openedBefore === 0) {
    const home = (await db.doc(`users/${uid}`).get()).data()?.hometownCard as string | undefined
    const h = home ? pool.byId.get(home) : undefined
    if (h) {
      const near = pool.cards.filter((c) => c.id !== h.id && distanceKm(h.lat, h.lon, c.lat, c.lon) <= HOMETOWN_KM)
      for (let i = 0; i < MAX_REROLLS && !pulls.length; i++) {
        const tier = rollTier(rand)
        const options = near.filter((c) => TIERS.indexOf(c.tier) <= TIERS.indexOf(tier))
        const best = options.filter((c) => c.tier === tier)
        await tryCard(best.length ? pick(best) : options.length ? pick(options) : h, true)
      }
    }
  }

  for (let rerolls = 0; pulls.length < PACK_SIZE; rerolls++) {
    // After many minted-out re-rolls (a tiny or nearly sold-out pool), fall back to a Common so a pack always fills.
    const tier = rerolls < MAX_REROLLS ? rollTier(rand) : 'Common'
    await tryCard(pick(pool.byTier[tier]))
    if (rerolls > MAX_REROLLS * 4) throw new Error('Pool too small to fill a pack')
  }

  pulls.sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier))
  const batch = db.batch()
  const packId = db.collection('pulls').doc().id
  for (const p of pulls) batch.create(db.collection('pulls').doc(), { uid, packId, ...p, at: FieldValue.serverTimestamp() })
  await batch.commit()
  return pulls
}
