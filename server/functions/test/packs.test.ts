// Runs against the Firestore emulator (npm test starts it). The headline test: many players pulling the same
// numbered card at the same moment never get the same serial, and a card never mints past its cap.
import assert from 'node:assert/strict'
import { after, beforeEach, describe, it } from 'node:test'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { MAX_PACKS, NoPacks, REFILL_MS, mint, openPack } from '../src/packs.js'
import { CAPS, loadPool, makePool, type PoolCard } from '../src/pool.js'

const PROJECT = 'demo-ptp'
initializeApp({ projectId: PROJECT })
const db = getFirestore()

async function clearDb() {
  const host = process.env.FIRESTORE_EMULATOR_HOST
  assert.ok(host, 'run with the Firestore emulator (npm test)')
  await fetch(`http://${host}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' })
}

describe('minting', () => {
  beforeEach(clearDb)

  it('500 simultaneous claims on a Legendary (cap 10) give serials 1-10 exactly once', async () => {
    const card: PoolCard = { id: 'test:legendary', tier: 'Legendary', lat: 0, lon: 0 }
    const results = await Promise.all(Array.from({ length: 500 }, () => mint(db, card)))
    const serials = results.filter((s): s is number => s != null).sort((a, b) => a - b)
    assert.deepEqual(serials, Array.from({ length: 10 }, (_, i) => i + 1))
    assert.equal(results.filter((s) => s == null).length, 490)
    assert.equal((await db.doc('mintCounts/test:legendary').get()).data()?.minted, 10)
    const docs = await db.collection('serials').where('cardId', '==', 'test:legendary').count().get()
    assert.equal(docs.data().count, 10)
  })

  it('a Mythic (1 of 1) can only be claimed once', async () => {
    const card: PoolCard = { id: 'test:mythic', tier: 'Mythic', lat: 0, lon: 0 }
    const results = await Promise.all(Array.from({ length: 200 }, () => mint(db, card)))
    assert.deepEqual(results.filter((s) => s != null), [1])
  })
})

describe('opening packs', () => {
  beforeEach(clearDb)
  const pool = loadPool()

  it('500 players opening packs at once: no duplicate serials, counters match the pulls', async () => {
    const all = (await Promise.all(Array.from({ length: 500 }, (_, i) => openPack(db, pool, `player${i}`)))).flat()
    assert.equal(all.length, 500 * 5)
    const numbered = all.filter((p) => p.serial != null)
    const keys = numbered.map((p) => `${p.cardId}#${p.serial}`)
    assert.equal(new Set(keys).size, keys.length, 'a serial was handed out twice')
    const perCard = new Map<string, number[]>()
    for (const p of numbered) perCard.set(p.cardId, [...(perCard.get(p.cardId) ?? []), p.serial!])
    for (const [id, serials] of perCard) {
      const minted = (await db.doc(`mintCounts/${id}`).get()).data()?.minted
      assert.equal(minted, serials.length, `counter for ${id}`)
      assert.ok(Math.max(...serials) <= CAPS[pool.byId.get(id)!.tier]!, `${id} went past its cap`)
    }
    const stored = await db.collection('pulls').count().get()
    assert.equal(stored.data().count, 2500)
  })

  it('a tiny pool where everything numbered sells out still fills packs with Commons', async () => {
    const tiny = makePool([
      { id: 'c1', tier: 'Common', lat: 0, lon: 0 }, { id: 'c2', tier: 'Common', lat: 0, lon: 0 },
      { id: 'c3', tier: 'Common', lat: 0, lon: 0 }, { id: 'c4', tier: 'Common', lat: 0, lon: 0 },
      { id: 'c5', tier: 'Common', lat: 0, lon: 0 }, { id: 'm1', tier: 'Mythic', lat: 0, lon: 0 },
    ])
    // Every tier roll comes out Mythic (0), card picks vary: the first pack gets the only Mythic, the second can't.
    const mythicRolls = () => { let i = 0; return () => (i++ % 2 === 0 ? 0 : (i * 0.37) % 1) }
    const first = await openPack(db, tiny, 'a', { rand: mythicRolls() })
    const second = await openPack(db, tiny, 'b', { rand: mythicRolls() })
    assert.equal(first.filter((p) => p.cardId === 'm1').length, 1)
    assert.equal(second.filter((p) => p.cardId === 'm1').length, 0)
    assert.equal(second.length, 5)
  })

  it('3 packs, then none until the refill', async () => {
    const now = Date.now()
    for (let i = 0; i < MAX_PACKS; i++) await openPack(db, pool, 'p', { now })
    await assert.rejects(openPack(db, pool, 'p', { now }), NoPacks)
    const later = await openPack(db, pool, 'p', { now: now + REFILL_MS + 1 })
    assert.equal(later.length, 5)
  })

  it('the first pack holds a card within 50 km of the hometown', async () => {
    const halifax = 'gn:6324729' // Halifax, Nova Scotia
    assert.ok(pool.byId.get(halifax), 'Halifax in the pool')
    await db.doc('users/h').set({ hometownCard: halifax })
    const pulls = await openPack(db, pool, 'h')
    const home = pulls.filter((p) => p.hometown)
    assert.equal(home.length, 1)
    const h = pool.byId.get(halifax)!, c = pool.byId.get(home[0].cardId)!
    const km = 111 * Math.hypot((c.lon - h.lon) * Math.cos((h.lat * Math.PI) / 180), c.lat - h.lat)
    assert.ok(km <= 51, `hometown card is ${km.toFixed(0)} km away`)
    const second = await openPack(db, pool, 'h')
    assert.equal(second.filter((p) => p.hometown).length, 0)
  })
})

after(async () => { await clearDb() })
