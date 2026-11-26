# Architecture

Back to [[00 Home]]. Source: [[Roadmap]] (Phase 2 and Phase 4). The stack choice is recorded in [[Decisions]].

Everything that decides what a player pulled runs on the server.

## Stack
| Layer | Choice | Why |
|---|---|---|
| Front end | Next.js (React) + Tailwind on Firebase App Hosting | One platform for hosting and backend |
| Map | MapLibre GL + free vector tiles (OpenFreeMap or MapTiler free tier) | No Google Maps bills |
| Database | Cloud Firestore for user data: pulls, packs, friends | Already known; transactions handle minting |
| Card pool and map layers | Static JSON and tiles in Cloud Storage behind the CDN | Firestore bills per read, so 200,000 cards and map pins must not be read from it on every page load |
| Auth | Firebase Auth (Google + email link) | Built in |
| Server logic | Cloud Functions | Pack rolls and minting never run in the browser |
| Bot protection | Firebase App Check + per-user rate limits | Blocks scripted pack opening |
| Share images | `@vercel/og` (Satori) inside a function | Generates a PNG card per pull for social previews |
| Analytics | PostHog | Funnels and retention; free tier is generous |

## Firestore collections
| Collection | Holds |
|---|---|
| `cards` | The pool from the [[Data Pipeline]], plus `cap` and `minted` counts |
| `users` | Player accounts |
| `pulls` | Who got which card, serial number, timestamp |
| `pack_state` | Packs available, next refill time |
| friendships | Requester, addressee, status |

> Note: the minting code below keeps its counter in a `mintCounts/{cardId}` document, while the collection list puts `minted` on `cards`. Settle which one holds the counter in Phase 2.

## Static card pool on Cloud Storage
- The full card pool (roughly 150,000–200,000 cards) is exported by the [[Data Pipeline]] as static JSON, split by region, and served from Cloud Storage behind the CDN.
- Map tiles and card images are served from a CDN, never from our own server.
- Card thumbnails are copied into Firebase Storage rather than linked live from Wikimedia.
- The world map is cached as pre-built tiles or an aggregated layer, refreshed every minute, instead of querying every pull live.

## Minting a numbered copy
When two people pull the last copy at the same moment, only one may get it. **Updated 2026-11-26** after a load test against the Firestore emulator (code in `server/functions/src/packs.ts`, tests in `server/functions/test/`).

**Each copy is its own document, `serials/{cardId}_{n}`, claimed with `create()`.** Firestore lets exactly one `create()` of a document succeed, so a serial can never be handed out twice, and nobody waits on a lock. A claim that loses tries the next number, up to the cap; when every number up to the cap exists, the card is minted out and the slot re-rolls. `mintCounts/{cardId}.minted` is a running total, bumped with `FieldValue.increment(1)` after each successful claim, and tells the next claim where to start.

```typescript
const start = (await counter.get()).data()?.minted ?? 0
for (let n = start + 1; n <= cap; n++) {
  try { await db.doc(`serials/${card.id}_${n}`).create({ cardId: card.id, serial: n, uid }) }
  catch (e) { if (e.code === ALREADY_EXISTS) continue; throw e }  // someone got n first
  await counter.set({ minted: FieldValue.increment(1), cap }, { merge: true })
  return n
}
return null  // minted out
```

**Why not the original design** (one transaction that reads and bumps a counter per card): with 500 players claiming the same Legendary at once, transactions on that one document hit "lock timeout" and 60-second deadlines instead of queueing; retries with backoff didn't save it (the test ran 34 minutes and still failed). The document-per-serial version passes the same test, plus 500 players opening packs at once on the full pool, in about 24 seconds total. **This is the interview story** (see [[Resume & Metrics]]): the first design looked right on paper and failed under a load test; the fix moves uniqueness from a lock to document identity.

Other server pieces: the pack stock (`pack_state/{uid}`) is taken in a per-player transaction (no contention between players); pulls are written in one batch; security rules let players read only their own state and pulls, everyone read `mintCounts`, and nobody write anything (all writes go through Cloud Functions with the Admin SDK). Serial documents stay private because they carry the owner's uid.

## Data flow
1. The [[Data Pipeline]] builds the card pool and images offline and uploads them to Cloud Storage.
2. The client loads card data and map layers from the CDN.
3. Opening a pack calls a Cloud Function (App Check + rate limit), which rolls the cards and mints numbered copies in the transaction above, writing to `pulls` and `pack_state`.
4. A function generates a share image per pull with `@vercel/og`.
5. Events go to PostHog.

## Environments and operations
Covered in [[Roadmap]] Phase 4: separate staging and production Firebase projects, production deploys only from `main`, budget alerts with a kill switch, Firestore daily backups, busy mode, Sentry and an uptime check.

## Security
- Secrets live in environment config or Firebase secrets, never in the repo or this vault.
