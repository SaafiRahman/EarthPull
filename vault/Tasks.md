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
- [x] Private preview map of the Canada candidate cards: [Canada Card Pool](https://claude.ai/artifact/117bnRr4gnePifssV7qQMX) (2026-11-23). Rebuild: `python pipeline/export_preview.py`, then republish `preview/index.html`
- ~~Redraw the preview map with a detailed coastline~~ Not needed (developer, 2026-11-23): the preview is a throwaway; the real app uses MapLibre with proper vector tiles (see [[Architecture]]). The data fixes below still apply.
- [ ] Pipeline: drop items more than ~25 km outside Canada (wrong-country tags such as the Seattle Times Building and the Adirondack Mountains, which are in New York but tagged Quebec). (Done 2026-11-23: disaster sites, wrecks and offshore platforms are now excluded.)
- [x] Developer: keep offshore landmarks like the Hibernia platform? No: offshore platforms are not cards (2026-11-23)
- [x] (done 2026-11-24, export) Same-name cards need a place in the name: two "CN Tower" cards (Toronto, and a skyscraper in Edmonton). Use the Wikipedia title's disambiguation or add the town at export
- [x] Drop never-built structures (CalgaryNEXT): done 2026-11-23 by hand fix in `pipeline/overrides.csv`
- [ ] Pick the rest of the ~50 Mythics when the pool goes worldwide (3 Canadian so far)
- [ ] Before launch: check location accuracy across the whole pool, not just Canada
- [x] Fetch page views for every place that has an article; places without one get a fame score of zero. (done 2026-11-23 for Canada: 13,391 candidates in `pool_ca.parquet`)
- [x] Re-fetch page views with monthly numbers; fame = median month x 12 (done 2026-11-23, developer's decision) One-month spikes inflate the 12-month total (Tumbler Ridge 444k of 499k in one month; BMO Field and Gordie Howe Bridge too). Use median month x 12 instead of the sum? Needs a re-fetch that keeps monthly numbers (~1 h for Canada; the bulk dumps give months anyway)
- [ ] Cross-border landmarks (Appalachian Mountains, Lake Ontario, Great Lakes; the Rocky Mountains card's point is in Idaho because Wikidata puts the range's point there): whose card are they, and do they count their whole article's views?
- [x] Assign rarity by fame percentile within the pool, then hand-pick the roughly 50 Mythics. (done 2026-11-23 for Canada: `rarity_ca.py`; Mythics so far Niagara Falls, CN Tower, Rocky Mountains)
- [ ] ~~Compute stats (log-scale population, normalise each stat to 1–100).~~ Replaced 2026-11-23 by card facts (developer)
- [x] Drop gone places: demolished, destroyed or never built (Wikidata classes, Wikipedia categories, redirected articles); keep closed-but-standing (done 2026-11-23: `gone_ca.py`, 501 dropped, 12,887 cards left)
- [x] (done 2026-11-24) Collect card facts: population, elevation (terrain height where missing), height or prominence, area or length, average temperature (WorldClim), fame
- [ ] Fix step 3's elevation: it takes Wikidata P2044 without its unit (some peaks came in feet). Step 6 works around it by preferring the unit-converted value
- [x] (done 2026-11-24) Generate flavour: a one-line fact per card from the Wikipedia summary, trimmed (`flavour_ca.py`, 97% of cards)
- [x] (done 2026-11-24) Flavour for cards with no Wikipedia line (444): written from their facts at export
- [x] French flavour lines translated into English (developer, 2026-11-24): 1,538 lines, hand translations in `pipeline/flavour_en.csv`
- [ ] Developer: decide whether to rewrite flavour into livelier facts later (beta)
- [ ] Found while translating: Lac à la Loutre (Montreal) "existed until the 19th century" (gone place, not caught); Grayling Fork Black River is in Alaska (wrong country)
- [ ] North America: make every step take a country code (scripts are `_ca` now) and replace the Statistics Canada neighbourhood rule with one that works anywhere
- [ ] North America: translate flavour from Spanish, French, Dutch and Danish articles (expect far more Spanish lines than the 1,538 French ones; plan the approach before running)
- [ ] North America: one command runs the whole pipeline for a list of countries
- [x] (done 2026-11-24) Export the card pool as static JSON (split by region) for Cloud Storage, plus a small sample file for front-end development (`export_ca.py`; sample in `pipeline/sample/cards_sample_ca.json`)
- [ ] (in progress 2026-11-24) Card images: Wikidata image → Commons thumbnail + author + licence; reject maps, flags, logos and tiny images; mini-map render for the rest. Check the photo vs mini-map split on a sample first. **Split checked 2026-11-24 (`images_ca.py`, lookups only):** 51% of cards have a usable photo (built 94%, towns 66%, nature 39%; Legendary 96%, Epic 93%, Rare 82%, Common 32%). Next: developer picks how mini-maps are made, then download thumbnails

**Gate to Phase 2 (updated 2026-11-24):** the pipeline runs end to end for any country with one command from a clean machine, it has been run for all of North America (the launch pool), and a random sample of 100 cards looks right.

## Before Phase 2
- [ ] Settle the open questions in [[Decisions]].
- [ ] Decide the details of local packs (developer's idea, 2026-11-23): see [[Decisions#Open]]
