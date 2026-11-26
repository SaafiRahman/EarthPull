# Pull the Planet: North America demo

A browser-only proof of concept on the North America card pool (86,345 cards): open packs, build a collection, see your places on a map. Packs roll in the browser and the collection is saved in the browser (localStorage); serial numbers are simulated. The real build moves rolling and minting to the server (see `vault/Roadmap.md`, Phase 2).

## Run it

```
cd web
npm install        # first time only
npm run dev
```

Then open http://localhost:5173.

`npm run dev` first rebuilds `public/data/index.json` from the pipeline's export (`pipeline/data/export/`), so the demo always shows the latest pipeline run. Region files and card images are served straight from that folder at `/export/*` (see `vite.config.ts`). The pipeline export must exist; it isn't in git.

## What's in it

| File | What it does |
|---|---|
| `scripts/build-index.mjs` | Compact card index for rolling packs, town search and the map |
| `src/data.ts` | Loads the index; loads full card details from region files on demand |
| `src/game.ts` | Game state, refills (1 pack per 2 h, max 3), pack rolling with the Game Design odds and caps, simulated serials, hometown first pack |
| `src/PackScreen.tsx` | Pack opening: face-down cards glow in their rarity colour, flip, serial revealed last |
| `src/Collection.tsx` | Collection grid with rarity, country and type filters |
| `src/MapView.tsx` | MapLibre map (OpenFreeMap dark tiles) with clustered pins coloured by rarity |
| `src/Hometown.tsx` | First-visit hometown picker |
| `src/CardModal.tsx` | Card detail: flavour text, facts, photo and text credits |

"Demo: add a pack now" under the Open button skips the 2-hour wait. "Start over" in the footer erases the collection.
