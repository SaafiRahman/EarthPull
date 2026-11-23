# Game Design

Back to [[00 Home]]. Source: [[Roadmap]] (game design spec). Decisions behind this note live in [[Decisions]].

**Earthpull is a free browser gacha game where every real place on Earth is a card, and everyone's pulls fill in one shared world map.** Version 1 is pack opening, numbered copies, a personal collection and a shared world map. Battles and trading wait for v2.

## Rarity tiers and caps
Cards use serial-numbered print runs, like real trading cards. Commons are unlimited; every higher tier has a fixed cap. The caps are starting values to tune in the beta (Phase 3, see [[Roadmap]]).

| Tier | Copies | What lands here | Pull odds per card (start) |
|---|---|---|---|
| Common | Unlimited, no number | Small towns, minor features | 70% |
| Rare | /1000 | Mid-size cities, notable lakes and peaks | 22% |
| Epic | /100 | Major cities, national parks | 6.5% |
| Legendary | /10 | Capitals, world-famous mountains and rivers | 1.4% |
| Mythic | 1/1 | About 50 icons: Everest, Eiffel Tower, Niagara Falls | 0.1% |

- When a numbered card's cap is reached, it is "minted out" and can drop only as a lower-tier variant or not at all.
- The pull screen reveals the serial last ("#7 of 10") for drama.
- How minting stays safe under load: see [[Architecture#The minting transaction]].

## Stats
Computed from real data in the [[Data Pipeline]].

| Stat | Source | Notes |
|---|---|---|
| HP | Population | Log-scaled so megacities don't break everything |
| Defense | Elevation | Mountains and highland towns are tanks |
| Attack | Wikipedia page views, last 12 months | Fame = power; produces the funny matchups |
| Chill | Average annual temperature, inverted | Colder = higher |
| Type | Climate or biome | Coastal, Tundra, Desert, Mountain, Urban, Forest |

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
- Battles (a whole game of its own)
- Paid packs or any real-money mechanic
- Native mobile apps (the site should work well on phones instead)

The planned v2 order is in [[Launch & Marketing#Version 2 features (in order)]].
