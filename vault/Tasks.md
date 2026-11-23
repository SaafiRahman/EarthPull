# Tasks

Back to [[00 Home]]. Source: [[Roadmap]]. Track tasks here as they start and finish. The [GitHub Projects board](https://github.com/users/SaafiRahman/projects/4) mirrors this list; this note is the source of truth, so update the board to match.

## Current: Phase 0, ideation and validation (1 week)
- [ ] Pick a name. Shortlist: Earthpull, Placedex, Pull the Planet, Atlasdex. Check .com, .gg and .io availability and that the handle is free on TikTok, X and Reddit. (Open in [[Decisions]].)
- [ ] Buy the domain (about $10–40 per year).
- [ ] Do a final competitor search on Product Hunt, itch.io, r/WebGames and r/incremental_games for "places gacha" or "city card pack" games.
- [ ] Paper prototype: print 30 fake cards (mix of tiers, real stats) and have 5 friends open "packs" from a shuffled pile. Watch which cards they react to.
- [ ] Interest test: show a mock-up of one card and the hometown pull to 20 people. Ask "would you open a pack?" and "would you send this to someone?"
- [x] Set up the repo, a GitHub Projects board with the roadmap, and a dev log. (2026-11-23)
  - [x] Repo with vault, `CLAUDE.md` and `.gitignore` (2026-11-23)
  - [x] Dev log in `vault/Dev Log/` (2026-11-23)
  - [x] First commit (2026-11-23)
  - [x] Push to GitHub (2026-11-23)
  - [x] GitHub Projects board: "Earthpull Roadmap", https://github.com/users/SaafiRahman/projects/4 (2026-11-23)

**Gate to Phase 1:** at least 12 of 20 people say they'd share a hometown pull, and the name and domain are secured.

## Upcoming: Phase 1, data pipeline (3 weeks, about 20 hours)
Start on Canada first. Details in [[Data Pipeline]].
- [ ] Download and clean GeoNames; drop duplicates and alternate-name noise.
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
