# Game Design

Back to [[00 Home]]. Source: [[Roadmap]] (game design spec). Decisions behind this note live in [[Decisions]].

**Pull the Planet is a free browser gacha game where every real place on Earth is a card, and everyone's pulls fill in one shared world map.** Version 1 is pack opening, numbered copies, a personal collection and a shared world map. Trading waits for v2; battles are not planned (2026-11-23).

## Rarity tiers and caps
Every copy above Common carries a number in pull order. Only Mythics are limited, to one copy each (developer, 2026-11-26); every other tier is unlimited, so no card but a Mythic ever runs out. The caps are starting values to tune in the beta (Phase 3, see [[Roadmap]]).

| Tier | Copies | Foil copies (2026-11-26) | What lands here | Pull odds per card (start) |
|---|---|---|---|---|
| Common | Unlimited, no number | Unlimited, no number | Small towns, minor features | 70% |
| Rare | Unlimited, numbered in pull order (was /1000) | Unlimited, numbered separately | Mid-size cities, notable lakes and peaks | 22% |
| Epic | Unlimited, numbered in pull order (was /100) | Unlimited, numbered separately | Major cities, national parks | 6.5% |
| Legendary | Unlimited, numbered in pull order (was /10, then /100) | Unlimited, numbered separately | Capitals, world-famous mountains and rivers | 1.4% |
| Mythic | 1/1 | None | About 50 icons: Everest, Eiffel Tower, Niagara Falls | 0.1% |

- **Only Mythics are limited (developer, 2026-11-26):** one copy each. Rare, Epic and Legendary never run out, but each copy carries its pull number, so early copies are low numbers.
- **Foil (developer, 2026-11-26):** about 1 in 20 pulls is foil, numbered as its own run. The Mythic has no foil.

- When a Mythic has been pulled it is "minted out" and never drops again.
- The pull screen reveals the serial last ("#7 of 10") for drama.
- How minting stays safe under load: see [[Architecture#The minting transaction]].

**Built landmarks (2026-11-23):** structures such as towers, buildings and bridges are cards too, and they should be high-rarity cards. Decided at the rarity step: built cards are never Common, and they get wider Epic and Legendary shares (see [[Decisions]]).

## Card facts
**Decided 2026-11-23 (developer): no 1–100 stats and no battle system for now.** Pull the Planet is about collecting (and maybe trading later), so each card shows real facts about the place instead of game stats. Facts are more interesting to collect, give shareable "huh" moments, and need no scales to tune. If battles ever come back, stats can be derived from the same facts.

| Fact | Shown on | Source |
|---|---|---|
| Population | Towns | GeoNames, Wikidata |
| Elevation | Every card | Wikidata, else terrain height at the point |
| Height | Buildings, towers, waterfalls; prominence for mountains | Wikidata |
| Area or length | Lakes, islands, parks, glaciers (area); rivers, bridges, canals (length) | Wikidata |
| Average temperature | Every card | WorldClim climate map, sampled at the point |
| Fame | Every card | Wikipedia views, median month x 12 ([[Decisions]]) |

The paper prototype's 1–100 scales (HP, Defense, Attack, Chill) are retired; they are in the prototype code (`prototype/fetch_cards.py`) if ever needed.

## Card art
**Every card uses a real photo when one exists; places without a usable photo get a generated mini-map instead.**
- **Photos:** from Wikimedia Commons, found through each place's Wikidata image property. Most licences require crediting the author and licence, so every card's detail view shows "Photo: [author], [licence]".
- **Fallback mini-map:** a small rendered map of the place (coastline, terrain shading, rivers, a pin), drawn by our own script from free map data. Small towns with no photo will use this most.
- Both styles share one card frame, so a mini-map card looks deliberate, not like a missing image.
- How images are fetched and stored: [[Data Pipeline#Card images]].

## Core loop
1. Packs refill on a timer: start with 5 cards per pack, 1 pack per 2 hours, holding up to 3.
2. Open a pack: flip animation, rarity glow, serial revealed last.
3. Cards go to your collection and light up on your personal map.
4. Check the world map: every claimed place, who owns its #1, country leaderboards.
5. Share your best pull as an image card.

## Sharing hooks
- **Hometown pack:** your first pack guarantees a card within about 50 km, from coarse IP location (province or country level is stored, never exact location).
- **Discovered by:** the first person to pull any card, commons included, gets their name on it forever.
- **Local packs (developer's idea, 2026-11-23, not yet scheduled):** open a local pack that only gives cards near where you are, each marked with a special "Local" tag showing it was pulled there. Local-tagged copies can be worth more. Travelling unlocks the local pack of wherever you are, so a trip becomes a reason to open packs. Open questions in [[Decisions#Open]].
- **Sets:** complete themed sets for bonus packs and a badge, such as Canada's 13 provincial and territorial capitals, the Great Lakes, or the Seven Summits.

## Maps and friends
**Your collection lives on a full-screen, Google Maps-style map, and friends' collections can be layered on top of yours.** Basic friends features ship in v1, because every invite brings in a new player.

### Your map
- Pannable, zoomable map (MapLibre) with every owned card as a pin coloured by rarity.
- Zoomed out, pins cluster ("47 cards in BC") or regions shade by how many cards you own there.
- Tap a pin to open the card, its serial and stats.
- Progress overlays: "You own 12% of Canada's cities", "3 of 13 capitals".

### Friends (v1)
- Add friends by friend code or invite link.
- Toggle each friend on as a layer in their own colour.
- Compare view: who owns more of each province or country, and which cards they have that you don't.
- Friend leaderboard and a small activity feed ("Alex pulled Banff #4 of 100").

### Privacy rules
- Players can hide their hometown card and badge, since it hints at where they live.
- Friend maps are visible only to accepted friends; public profiles show cards, never locations.
- Never store or display exact user locations; only the region used for the hometown pack.

### Performance
Load pins only for the area on screen, use MapLibre's built-in clustering, and pre-aggregate counts by region so collections of thousands of cards stay fast.

## Out of scope for v1
- Trading (attracts bots and scams; needs moderation)
- Battles (a whole game of its own; not planned at all since 2026-11-23)
- Paid packs or any real-money mechanic
- Native mobile apps (the site should work well on phones instead)

The planned v2 order is in [[Launch & Marketing#Version 2 features (in order)]].
