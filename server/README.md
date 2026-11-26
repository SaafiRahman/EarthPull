# Pull the Planet: server

Cloud Functions and Firestore rules for the real game (Roadmap Phase 2). See `vault/Architecture.md`.

```
cd server/functions
npm install
npm test        # builds, starts the Firestore + Auth emulators, runs test/*.test.ts
```

Needs Java 17+ for the emulators (firebase-tools is pinned to 13; version 15 needs Java 21). The card pool is read from `web/public/data/index.json` (or `POOL_FILE`), so run `npm run dev` in `web/` once first.
