// Security rules: players can read their own state and pulls, everyone can read serial counts, nobody writes.
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, describe, it } from 'node:test'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'

let env: RulesTestEnvironment

before(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':')
  env = await initializeTestEnvironment({
    projectId: 'demo-ptp-rules',
    firestore: { rules: readFileSync(new URL('../../../firestore.rules', import.meta.url), 'utf8'), host, port: Number(port) },
  })
})
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'pack_state/alice'), { packs: 3 })
    await setDoc(doc(db, 'pulls/p1'), { uid: 'alice', cardId: 'wd:Q9202', serial: 1 })
    await setDoc(doc(db, 'mintCounts/wd:Q9202'), { minted: 1, cap: 1 })
  })
})
after(async () => { await env.cleanup() })

describe('security rules', () => {
  it('a player reads their own pack state and pulls', async () => {
    const db = env.authenticatedContext('alice').firestore()
    await assertSucceeds(getDoc(doc(db, 'pack_state/alice')))
    await assertSucceeds(getDoc(doc(db, 'pulls/p1')))
  })
  it("a player can't read someone else's", async () => {
    const db = env.authenticatedContext('bob').firestore()
    await assertFails(getDoc(doc(db, 'pack_state/alice')))
    await assertFails(getDoc(doc(db, 'pulls/p1')))
  })
  it('nobody can give themselves packs, serials or cards', async () => {
    const db = env.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(db, 'pack_state/alice'), { packs: 99 }))
    await assertFails(setDoc(doc(db, 'mintCounts/wd:Q9202'), { minted: 0 }))
    await assertFails(setDoc(doc(db, 'pulls/forged'), { uid: 'alice', cardId: 'wd:Q9202', serial: 1 }))
  })
  it('serial counts are public', async () => {
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'mintCounts/wd:Q9202')))
  })
})
