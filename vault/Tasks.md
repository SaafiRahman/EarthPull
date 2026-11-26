# Tasks

Back to [[00 Home]]. Source: [[Roadmap]]. Track tasks here as they start and finish. The [GitHub Projects board](https://github.com/users/SaafiRahman/projects/4) mirrors this list; this note is the source of truth, so update the board to match.

## Current: Phase 0, ideation and validation (1 week)
- [x] Pick a name: **Pull the Planet** (2026-11-23). Shortlist was Earthpull, Placedex, Pull the Planet, Atlasdex. Check .com, .gg and .io availability and that the handle is free on TikTok, X and Reddit. (Open in [[Decisions]].)
  - [x] Research domain availability; results and recommendation in [[Decisions#Phase 0 research (2026-11-23)]] (2026-11-23)
  - [ ] Check and claim `pulltheplanet` on X, TikTok and Reddit (couldn't be checked automatically)
- [x] Buy pulltheplanet.com: Cloudflare Registrar, $11.17/yr, auto-renew on, expires 2027-11-23 (2026-11-23)
  - [ ] Confirm registrant contact is verified: Cloudflare → Domain Registration → Manage Domains → pulltheplanet.com shows no warning (developer got no email and saw no warning on the zone overview, 2026-11-24; the registration page is the one to check)
  - [ ] Turn on two-factor login on the Cloudflare account
- [x] Do a final competitor search on Product Hunt, itch.io, r/WebGames and r/incremental_games for "places gacha" or "city card pack" games. Done 2026-11-23; found CityDeck, a close match. See [[Decisions#Competitor search]].
- ~~Paper prototype: print 30 fake cards and have 5 friends open "packs".~~ **Dropped 2026-11-23**; the Phase 3 private beta is the first real test. The materials already made stay in `prototype/out/` (card PDF) and can be reused.
- ~~Interest test: show a mock-up of the hometown pull to 20 people.~~ **Dropped 2026-11-23**, same reason. The mock-up (`prototype/out/hometown-pull-mockup.png`) can be reused for build-in-public posts.
- [x] Set up the repo, a GitHub Projects board with the roadmap, and a dev log. (2026-11-23)
  - [x] Repo with vault, `CLAUDE.md` and `.gitignore` (2026-11-23)
  - [x] Dev log in `vault/Dev Log/` (2026-11-23)
  - [x] First commit (2026-11-23)
  - [x] Push to GitHub (2026-11-23)
  - [x] GitHub Projects board: "Pull the Planet Roadmap" (was "Earthpull Roadmap"), https://github.com/users/SaafiRahman/projects/4 (2026-11-23)

- [ ] Play CityDeck for 20 minutes and note what it does well
- [ ] Add CityDeck to the competitor table in [[Roadmap]]

**Gate to Phase 1:** name and domain secured. **Met 2026-11-23** (Pull the Planet, pulltheplanet.com). The handle check is left over but doesn't block Phase 1.

## Current: Phase 1, data pipeline (3 weeks, about 20 hours)
Started 2026-11-23, in parallel with the open Phase 0 name and domain tasks. Canada first; the launch pool is all of North America (developer, 2026-11-24). Details in [[Data Pipeline]].
- [x] Set up `pipeline/` (Python venv, pandas/GeoPandas, `requirements.txt`, README) (2026-11-23)
- [x] Download and clean GeoNames, filtered to Canada; drop duplicates and alternate-name noise: `pipeline/geonames.py` + `drop_neighbourhoods_ca.py`, **1,567 places** (2026-11-23)
  - [x] Show the developer a 20-row sample (2026-11-23)
  - [x] Developer chose Statistics Canada boundaries to drop neighbourhoods coded as towns (2026-11-23)
  - [x] Drop neighbourhoods using 2021 census subdivision boundaries: `pipeline/statcan_csd.py` + `drop_neighbourhoods_ca.py`, 1,681 → 1,520 (2026-11-23)
  - [x] Developer review: the 15 km rule also drops real towns (Georgetown, Simcoe, Mount Pearl). Chosen fix: check each candidate against Wikidata, since a hand allow-list won't scale globally (2026-11-23)
  - [x] Wikidata check on drop candidates: `pipeline/wikidata_places.py`; 160 flagged → 60 kept as real towns, 100 dropped (2026-11-23)
  - [x] Drop places with population 0: 14 dropped (2026-11-23)
  - [ ] Later: debatable drops to revisit (Virgil, Cookstown, Lively; Nepean, which Wikidata now calls a neighbourhood)
- [x] Pull landmark categories from Wikidata and join them to Wikipedia article titles (Canada): `pipeline/wikidata_ca.py` (2026-11-23)
  - [x] Link towns to Wikidata by GeoNames ID (P1566): 1,250 of 1,667 linked, 1,208 with an English article (2026-11-23)
  - [x] Landmarks with an English or French Wikipedia article: 9,789 (2026-11-23)
  - [x] Decide: worldwide neighbourhood rule: approved 2026-11-23 (see [[Decisions]]); build it when the pipeline goes past Canada
  - [x] Decide: built landmarks: yes, and they should be high rarity (2026-11-23)
  - [x] Pull built landmarks for Canada: `pipeline/structures_ca.py`, **2,052 structures** (2026-11-23)
  - [x] Developer: keep memorials as cards (2026-11-23); 21 added, incl. the National War Memorial
  - [x] At the rarity step: make sure structures land in high tiers (done 2026-11-23: no Common structures, wider top tiers)
  - [ ] Wikipedia titles for the 417 towns with no Wikidata item linked by GeoNames ID (name-match fallback)
- [x] Private preview map of the Canada candidate cards: [Canada Card Pool](https://claude.ai/artifact/117bnRr4gnePifssV7qQMX) (2026-11-23). Retired 2026-11-24 with the Statistics Canada files it was built from (`export_preview.py` removed)
- ~~Redraw the preview map with a detailed coastline~~ Not needed (developer, 2026-11-23): the preview is a throwaway; the real app uses MapLibre with proper vector tiles (see [[Architecture]]). The data fixes below still apply.
- [ ] Pipeline: drop items more than ~25 km outside Canada (wrong-country tags such as the Seattle Times Building and the Adirondack Mountains, which are in New York but tagged Quebec). (Done 2026-11-23: disaster sites, wrecks and offshore platforms are now excluded.)
- [x] Developer: keep offshore landmarks like the Hibernia platform? No: offshore platforms are not cards (2026-11-23)
- [x] (done 2026-11-24, export) Same-name cards need a place in the name: two "CN Tower" cards (Toronto, and a skyscraper in Edmonton). Use the Wikipedia title's disambiguation or add the town at export
- [x] Drop never-built structures (CalgaryNEXT): done 2026-11-23 by hand fix in `pipeline/overrides.csv`
- [ ] Pick the rest of the ~50 Mythics when the pool goes worldwide (3 Canadian so far)
- [ ] Before launch: check location accuracy across the whole pool, not just Canada
- [x] Fetch page views for every place that has an article; places without one get a fame score of zero. (done 2026-11-23 for Canada: 13,391 candidates in `pool_ca.parquet`)
- [x] Re-fetch page views with monthly numbers; fame = median month x 12 (done 2026-11-23, developer's decision) One-month spikes inflate the 12-month total (Tumbler Ridge 444k of 499k in one month; BMO Field and Gordie Howe Bridge too). Use median month x 12 instead of the sum? Needs a re-fetch that keeps monthly numbers (~1 h for Canada; the bulk dumps give months anyway)
- [x] Cross-border landmarks (Appalachian Mountains, Lake Ontario, Great Lakes; the Rocky Mountains card's point is in Idaho): decided 2026-11-24, home by point plus "also in" (see [[Decisions]]); they count their whole article's views
- [x] Assign rarity by fame percentile within the pool, then hand-pick the roughly 50 Mythics. (done 2026-11-23 for Canada: `rarity_ca.py`; Mythics so far Niagara Falls, CN Tower, Rocky Mountains)
- [ ] ~~Compute stats (log-scale population, normalise each stat to 1–100).~~ Replaced 2026-11-23 by card facts (developer)
- [x] Drop gone places: demolished, destroyed or never built (Wikidata classes, Wikipedia categories, redirected articles); keep closed-but-standing (done 2026-11-23: `gone_ca.py`, 501 dropped, 12,887 cards left)
- [x] (done 2026-11-24) Collect card facts: population, elevation (terrain height where missing), height or prominence, area or length, average temperature (WorldClim), fame
- [x] (done 2026-11-24) Fix step 3's elevation: `landmarks.py` takes Wikidata's unit-converted value (QLever `psn:`), so peaks entered in feet come out in metres
- [x] (done 2026-11-24) Generate flavour: a one-line fact per card from the Wikipedia summary, trimmed (`flavour_ca.py`, 97% of cards)
- [x] (done 2026-11-24) Flavour for cards with no Wikipedia line (444): written from their facts at export
- [x] French flavour lines translated into English (developer, 2026-11-24): 1,538 lines, hand translations in `pipeline/flavour_en.csv`
- [ ] Developer: decide whether to rewrite flavour into livelier facts later (beta)
- [ ] Found while translating: Lac à la Loutre (Montreal) "existed until the 19th century" (gone place, not caught); Grayling Fork Black River is in Alaska (wrong country; fixed 2026-11-24 by homing landmarks by their point)
- [ ] (in progress 2026-11-24) North America: make every step take a country code (scripts are `_ca` now) and replace the Statistics Canada neighbourhood rule with one that works anywhere. Plan:
  - [x] Country table: Wikidata item, local Wikipedia language(s) per country (CA fr, MX es, GL da, HT fr, AW nl...) (`countries.py`, 41 countries, IDs checked against Wikidata 2026-11-24)
  - [x] Regions from Natural Earth admin-1 (ISO 3166-2 codes) for every card, replacing StatCan; drop points well outside the country (wrong-country cards) (`regions.py`; towns keep GeoNames' province via Natural Earth's GeoNames codes, landmarks use their point)
  - [x] Neighbourhoods without census boundaries (`towns.py`): candidates are towns within 15 km of one 3x bigger; Wikidata decides. Canada: 1,567 towns, same count as before, 20 swapped each way (Montreal boroughs and Ottawa suburbs now dropped; Virgil, Cookstown, Lively now kept; Brant and Gabriola wrongly dropped)
  - [x] (done 2026-11-24) Every step takes --country and writes to data/interim/<CC>/; English plus the local Wikipedia instead of English + French. Scripts lost their `_ca` suffix; the old Canada-only scripts and the throwaway preview exporter were removed
  - [x] (done 2026-11-24) Rerun Canada through `run.py CA` and compare: **12,789 cards** (was 12,882). 116 gone: 112 border landmarks now homed in the US, Greenland or Saint Pierre by their point (Rocky Mountains, Lake Superior, Adirondacks, Ambassador Bridge) plus the known Ottawa-village town swaps; 23 added (town swaps, a few landmarks). Rarity changed for 68 cards
  - [x] (done 2026-11-25) Run the US through `run.py`: **55,851 cards** (30,804 Common, 20,037 Rare, 4,364 Epic, 645 Legendary, 1 Mythic: Rocky Mountains), 51 regions, 39.8 MB. Took ~21 h with crashes and a 7 h stall; ~10 h of real work
  - [x] (done 2026-11-26) Run Mexico and the rest of North America through `run.py`: all 41 countries and territories done, **86,389 cards** (US 56,493, Canada 12,863, Mexico 10,366, the other 38 together 6,667)
  - [x] (done 2026-11-26) Mythics for Mexico: Teotihuacan and Chichén Itzá. Every other country gets its most famous unshared card as a Mythic automatically
  - [x] (done 2026-11-26) Port-au-Prince has fame 0 (no article matched). Cause: GeoNames lists many Latin American and Caribbean cities twice (populated place + municipality) and Wikidata hangs the real article on the municipality's ID, so the town joins to an article-less stub. Fix in `towns.py` (`admin_twins`): a town without an article takes the article of the same-named admin area within 30 km (smallest admin level with an article wins; "Municipio de X" and "X Municipio" count as X). Fixed towns: Haiti 74 of 103, Dominican Republic 119/153, Cuba 99/126, Nicaragua 109/134, Honduras 210/449, Puerto Rico 47/175, Mexico ~384/3,656 (the rest are mostly villages), Guatemala 308/322, Canada 157. Reran towns and pageviews onward for all 41: 86,383 cards; Port-au-Prince now Legendary (288k), Santiago de Cuba, Bayamón, Quetzaltenango Epic
- [ ] (in progress 2026-11-26) 100-card sample review: page at https://claude.ai/artifact/2GshHv9UX2QzjCoeXtRAsm (private; seed 20261126). My pass: 4 wrong cards (#24 Terminal Bridge demolished 1987, #68 MAXIMA balloon telescope is not a place, #58 Malmstrom Air Force Base as a town, #63 Barbuda Parish duplicates Barbuda); ~10 town flavour lines are only "The population was X at the 2020 census", and 2 contradict the population fact (#4 Royal City, #73 Breinigsville). Developer approved: skip census flavour lines, drop parishes, drop demolished places, Wikidata population (rerunning all 41 now). Military bases stay; experiments and abandoned projects dropped (MAXIMA, Sudbury Neutrino Observatory, MiniBooNE, DUNE, Disney's America, Cape Wind). Rerun done: 86,345 cards. Card design will get a redesign later (developer)
- [x] (done 2026-11-26) Jamoncillo (MX hill, wd:Q5810921) links to the Wikipedia article on the candy, not the hill: fix the link or drop it (found 2026-11-26)
- Order of the open work (developer, 2026-11-26): easiest first: Port-au-Prince links, then the 100-card review, then translation, then bulk data
  - [x] (done 2026-11-26) Translate the 4,368 Spanish, French, Dutch and Danish flavour lines into English (23 left blank as unusable: "This article is about…", census-only lines). `flavour_en.csv` now 5,909 rows; every country has 0 untranslated lines. Reran flavour to export for 22 countries. Plan (developer approved 2026-11-26): Claude translates in batches of 200 into `pipeline/flavour_en.csv`, small countries first, Mexico last; check each batch; rerun flavour to export; developer reviews 20 random lines
  - [x] (done 2026-11-25) Fill in US terrain heights Open-Meteo's quota cut off: the rerun got them all. A local elevation grid is still needed for the world
  - [ ] Before going past North America: switch to bulk data (developer, 2026-11-25). Plan written 2026-11-26: [[Bulk Data Plan]], waiting for the developer's OK. The pipeline asks APIs one place at a time (~0.6 s a card; the US is ~10 h clean, the world would be ~70-130 h). Use Wikimedia's monthly page-view dump files instead of one request per article, and the Wikidata dump or bigger bulk queries for names, facts and elevation; run mini-maps in parallel. Downloads are tens of GB
  - Sizes found 2026-11-24: GeoNames towns US 17,348, MX 8,944, CA 3,009 (32,498 in North America); US natural landmarks with an English article ~23,900; US structures in 3+ languages ~26,400; Mexico natural landmarks ~650
  - [x] (done 2026-11-24) Landmarks for all of North America at once: home country by point, "also in" from Wikidata's countries (developer, 2026-11-24). `landmarks.py`: 37,677 natural and 19,373 built landmarks in 41 countries; 873 border landmarks tagged "also in"
  - [ ] Developer decision after the US run: with ~26,000 US buildings, keep "every building is at least Rare"?
- [ ] North America: translate flavour from Spanish, French, Dutch and Danish articles (expect far more Spanish lines than the 1,538 French ones; plan the approach before running)
- [x] (done 2026-11-24, untested end to end) North America: one command runs the whole pipeline for a list of countries: `python pipeline/run.py CA US` or `run.py all`
- [x] (done 2026-11-24) Export the card pool as static JSON (split by region) for Cloud Storage, plus a small sample file for front-end development (`export_ca.py`; sample in `pipeline/sample/cards_sample_ca.json`)
- [x] (done 2026-11-24) Card images: Wikidata image → Commons thumbnail + author + licence; reject maps, flags, logos and tiny images; mini-map render for the rest. Check the photo vs mini-map split on a sample first. **Split checked 2026-11-24 (`images_ca.py`, lookups only):** 51% of cards have a usable photo (built 94%, towns 66%, nature 39%; Legendary 96%, Epic 93%, Rare 82%, Common 32%). Developer chose pre-rendered mini-maps; 6,538 photos downloaded (382 MB as 640 px WebP), 6,344 wide mini-maps drawn (53 MB), all wired into the export
- [ ] Detailed mini-maps from OpenStreetMap for Rare-and-up cards with no photo (~900 in Canada): the real shape of the lake or island; needs an "© OpenStreetMap contributors" credit
- [ ] Mini-maps: terrain shading so mountain cards aren't flat; small islands missing from Natural Earth put the pin in the sea (Low Island)
- [ ] Card frame (Phase 2): photos come in many shapes (panoramas), so crop to fit
- [ ] (in progress 2026-11-26) Card redesign, collectible TCG style (developer). Research done: [[Card Design Research]]. No full art; rarity in the frame (developer)
  - [ ] (in progress 2026-11-26) New card face on `/#cards`: tier frames, rarity symbols, facts box, flavour, collector number, serial stamp; Foil and Local stamp variants. First version built 2026-11-26 (`Card.tsx`, card section of `index.css`; index now carries 3 facts and a collector number per card); screenshots in `minimap-previews/cards/` (`node scripts/shot-cards.mjs`). Developer: Mythic not recognisable enough; redone 2026-11-26 as black and gold with a racing edge light, prismatic glow, sparkles, gold name, photo gleam and a "Mythic · One of One" ribbon (rainbow is now foil's alone). Video: `node scripts/record-card.mjs Mythic` + `python scripts/frames-to-mp4.py` → `minimap-previews/card-video/mythic.mp4`. Developer liked the tilt (2026-11-26): keep it on every card
  - [x] (done 2026-11-26) Wire Foil and Local into the demo: foil roll (5%) in `game.ts`; foil runs numbered separately; later the same day after trying Legendary caps (/10, then /100 + foil /5) the developer chose: only Mythics limited (1 of 1, no foil); Rare, Epic and Legendary numbered in pull order without a cap; checked: a Mythic drops exactly once, a Legendary keeps dropping, a daily local pack (50 km, then 150 km, then the province or state; same odds; every card stamped Local; "Demo: I'm somewhere else" to fake travel), variants listed separately in the collection with a Foil/Local filter, one map pin per place. Checked on the real pool with `node scripts/check-variants.mjs` (foil 4.75% of 20,000; Halifax and Toronto 99-100% of local cards within 50 km, Wawa 91%) and the playthrough (no console errors)
  - [ ] Server: only Mythics are capped now (Rare, Epic and Legendary numbered without a cap): update `openPack` and its tests; roll and store the variant (foil, Local) in `openPack` (foil serials as their own documents, e.g. `serials/{cardId}~foil_{n}`), plus a daily local pack function; publish variant odds
  - [ ] Local pack fallback in huge regions: Fairbanks' last fallback (all of Alaska) reaches 2,563 km for a few Legendaries. Developer to decide whether to cap it (found 2026-11-26)

- [ ] (in progress 2026-11-26) North America proof of concept (`web/`): browser-only demo with pack opening (flip, rarity glow, serial last, timer refills), collection grid with filters, MapLibre map of owned cards, hometown first pack. See [[Decisions]] 2026-11-26
  - [x] (done 2026-11-26) First version built: Vite + React + TypeScript + Tailwind + MapLibre (OpenFreeMap dark tiles). Typechecks and builds; game logic tested on the real pool (odds match over 100,000 pulls, each Mythic pulled once, Legendary serials stay within /10, refills cap at 3, hometown card lands within 50 km). Run: `cd web && npm run dev`, open http://localhost:5173
  - [x] (done 2026-11-26) Automated playthrough with puppeteer-core driving the installed Chrome (`web/scripts/playthrough.mjs`, screenshots to `minimap-previews/playthrough/`). Found and fixed: flipped cards stayed face down (entrance animation overrode the flip), the MapLibre worker failed to load under Vite pre-bundling, last card oversized on phones, phone footer too tall. Now no console errors
  - [ ] Developer plays it and gives feedback; cards need a redesign (developer, 2026-11-26)
  - [x] (done 2026-11-26) Photo credits can be messy (Fort Knox: "Work permit Original author= Cliff"): clean the Commons author field in `images.py`
  - [x] (done 2026-11-26) Border landmarks on the wrong side of a state line (Statue of Liberty in NJ, Gateway Arch in IL): `fix_regions` in `landmarks.py` moved 233 to Wikidata's region; `region_fixes.csv` for hand fixes
  - [ ] Before the world: make `fix_regions` query only landmarks within 10 km of another region (QLever rate limits)
  - [ ] ~490 photo credits still carry "User:"/"talk" leftovers

- Plan while the developer is away (2026-11-26, design on hold until they're home): 1) data clean-up, 2) Phase 2 server logic against the Firebase emulator, 3) clean-machine pipeline test
  - [x] (done 2026-11-26) Phase 2 server logic in `server/` (Cloud Functions `openPack`, `setHometown`; Firestore rules; tests on the emulator with `npm test` in `server/functions`). 10/10 tests pass: 500 simultaneous claims on a Legendary give serials 1-10 once, a Mythic claims once, 500 players opening packs at once get no duplicate serials, sold-out pools fill with Commons, 3-pack limit and refill, hometown card within 50 km, rules block reads of others' data and all client writes. Minting redesigned after the load test (see [[Architecture#Minting a numbered copy]])
  - [ ] Hook the web demo up to the functions (sign-in, call `openPack`) once the developer creates the Firebase project

**Gate to Phase 2 (updated 2026-11-24; all but the clean-machine run met 2026-11-26):** the pipeline runs end to end for any country with one command from a clean machine, it has been run for all of North America (the launch pool), and a random sample of 100 cards looks right.

## Before Phase 2
- [ ] Settle the open questions in [[Decisions]].
- [ ] Decide the details of local packs (developer's idea, 2026-11-23): see [[Decisions#Open]]
- [x] (done 2026-11-26) Turn Point Light (a Washington lighthouse) is a Canadian card: Wikidata gives it Canada only and Natural Earth's border puts its point in BC (found 2026-11-24)
- [ ] Rocky Mountains Mythic now belongs to the US card pool (its point is in Idaho): check Mythics when the US runs
- [x] (done 2026-11-26) Mount Uniacke (Nova Scotia): the town and the mountain share one Wikidata item; the duplicate rule kept only the mountain. Check which is right (found 2026-11-25)
- [x] (done 2026-11-26) Caribbean Netherlands (Bonaire, Sint Eustatius, Saba) has only 8 cards (towns) and no landmarks: its items are located in the islands, not in "Caribbean Netherlands" (found 2026-11-25)
