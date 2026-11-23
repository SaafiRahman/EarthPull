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

## The minting transaction
When two people pull the last copy at the same moment, only one may get it. This runs in a Firestore transaction inside a Cloud Function:

```typescript
const serial = await db.runTransaction(async (tx) => {
  const ref = db.doc(`mintCounts/${cardId}`);
  const snap = await tx.get(ref);
  const minted = snap.exists ? snap.data()!.minted : 0;
  if (cap !== null && minted >= cap) return null; // minted out
  tx.set(ref, { minted: minted + 1 }, { merge: true });
  tx.create(db.collection("pulls").doc(), { uid, cardId, serial: minted + 1, at: FieldValue.serverTimestamp() });
  return minted + 1;
});
```

- If two players hit the same card at once, Firestore retries one transaction with fresh data, so serials never repeat.
- A `null` result means the card just minted out, and the function re-rolls that slot.
- One counter document per card can take only about one write per second, which is plenty for numbered cards. Commons have no serials, so they skip the counter entirely.
- This is the main interview story (see [[Resume & Metrics]]).

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
