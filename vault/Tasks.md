# Tasks

Back to [[00 Home]]. Source: [[Roadmap]]. Track tasks here as they start and finish. The [GitHub Projects board](https://github.com/users/SaafiRahman/projects/4) mirrors this list; this note is the source of truth, so update the board to match.

## Current: Phase 0, ideation and validation (1 week)
- [x] Pick a name: **Pull the Planet** (2026-11-23). Shortlist was Earthpull, Placedex, Pull the Planet, Atlasdex. Check .com, .gg and .io availability and that the handle is free on TikTok, X and Reddit. (Open in [[Decisions]].)
  - [x] Research domain availability; results and recommendation in [[Decisions#Phase 0 research (2026-11-23)]] (2026-11-23)
  - [ ] Check and claim `pulltheplanet` on X, TikTok and Reddit (couldn't be checked automatically)
- [x] Buy pulltheplanet.com: Cloudflare Registrar, $11.17/yr, auto-renew on, expires 2027-11-23 (2026-11-23)
  - [ ] Click the registrant verification email from Cloudflare/ICANN (within about 15 days, or the domain can be suspended)
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
Started 2026-11-23, in parallel with the open Phase 0 name and domain tasks. Canada only for now. Details in [[Data Pipeline]].
- [x] Set up `pipeline/` (Python venv, pandas/GeoPandas, `requirements.txt`, README) (2026-11-23)
- [ ] Download and clean GeoNames, filtered to Canada; drop duplicates and alternate-name noise (in progress 2026-11-23): `pipeline/geonames.py`, 1,681 places
  - [x] Show the developer a 20-row sample (2026-11-23)
  - [ ] Developer review of the sample, then decide how to drop neighbourhoods that GeoNames codes as towns (see [[Data Pipeline#Known data issues]])
- [ ] Pull landmark categories from Wikidata and join them to Wikipedia article titles.
- [ ] Fetch page views for every place that has an article; places without one get a fame score of zero.
- [ ] Assign rarity by fame percentile within the pool, then hand-pick the roughly 50 Mythics.
- [ ] Compute stats (log-scale population, normalise each stat to 1–100).
- [ ] Generate flavour: a one-line fact per card from the Wikipedia summary, trimmed.
- [ ] Export the card pool as static JSON (split by region) for Cloud Storage, plus a small sample file for front-end development.
- [ ] Card images: Wikidata image → Commons thumbnail + author + licence; reject maps, flags, logos and tiny images; mini-map render for the rest. Check the photo vs mini-map split on a sample first.

**Gate to Phase 2:** the script runs end to end from a clean machine, and a random sample of 100 cards looks right.

## Before Phase 2
- [ ] Settle the open questions in [[Decisions]].
