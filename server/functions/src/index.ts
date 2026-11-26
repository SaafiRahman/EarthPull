// Cloud Functions entry points. Players call these from the browser; the functions use the Admin SDK, which
// bypasses the security rules, so only this code can write pack state, serial counters and pulls.
import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { NoPacks, openPack as open } from './packs.js'
import { loadPool } from './pool.js'

initializeApp()
const db = getFirestore()

export const openPack = onCall({ enforceAppCheck: false }, async (req) => {
  // App Check gets enforced in production (Architecture: bot protection); off for the emulator.
  const uid = req.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in to open packs.')
  try {
    return { pulls: await open(db, loadPool(), uid) }
  } catch (e) {
    if (e instanceof NoPacks) throw new HttpsError('resource-exhausted', 'No packs left.', { nextRefill: e.nextRefill })
    throw e
  }
})

export const setHometown = onCall(async (req) => {
  const uid = req.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.')
  const cardId = String(req.data?.cardId ?? '')
  const card = loadPool().byId.get(cardId)
  if (!card || !cardId.startsWith('gn:')) throw new HttpsError('invalid-argument', 'Pick a town from the list.')
  const state = await db.doc(`pack_state/${uid}`).get()
  if ((state.data()?.opened ?? 0) > 0) throw new HttpsError('failed-precondition', 'The hometown pack has already been opened.')
  // Only the town is stored (Game Design privacy rules), never an exact location.
  await db.doc(`users/${uid}`).set({ hometownCard: cardId }, { merge: true })
  return { ok: true }
})
