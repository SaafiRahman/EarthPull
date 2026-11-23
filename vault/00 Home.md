# Pull the Planet: Home

Index of the project brain. Read this, [[Tasks]] and the latest [[Dev Log/2026-11-23|Dev Log]] note at the start of every session.

**Pull the Planet (named 2026-11-23; working name was Earthpull) is a free browser gacha game where every real place on Earth is a card, and everyone's pulls fill in one shared world map.** Launch target: early May 2027.

## Current phase
**Phase 1: Data pipeline** (started 2026-11-23). Phase 0's gate was met on 2026-11-23: the name is Pull the Planet and pulltheplanet.com is registered. Earlier, the paper prototype and interest test were dropped, and the share test moves to the Phase 3 beta. Phase 1, the [[Data Pipeline]], has started on Canada only.

**Gate to Phase 2:** the pipeline runs end to end from a clean machine, and a random sample of 100 cards looks right.

## What to do next
1. Developer: verify the domain's registrant email, and claim `pulltheplanet` on X, TikTok and Reddit.
2. Phase 1 on Canada: clean GeoNames, then Wikidata landmarks, page views and stats. See [[Tasks]].

## Notes
- [[Roadmap]]: the full roadmap and source of truth (phases 0–6, gates, risks)
- [[Decisions]]: decided choices and open questions, with dates and reasons
- [[Game Design]]: rarity tiers and caps, stats, card art, core loop, sharing hooks, maps and friends, out of scope for v1
- [[Architecture]]: Firebase stack, Firestore collections, the minting transaction, static card pool
- [[Data Pipeline]]: sources, steps, card images, gate
- [[Tasks]]: current and upcoming tasks (mirrored on the [GitHub Projects board](https://github.com/users/SaafiRahman/projects/4))
- [[Launch & Marketing]]: Phases 5 and 6
- [[Resume & Metrics]]: metrics, resume templates, interview talking points

## Phases at a glance
| Phase | Name | Length |
|---|---|---|
| 0 | Ideation and validation | 1 week |
| 1 | Data pipeline | 3 weeks |
| 2 | MVP build | 11 weeks |
| 3 | Private beta and tuning | 3 weeks |
| 4 | Deployment and infrastructure | 2 weeks, then an exam pause |
| 5 | Launch and marketing | 2 weeks |
| 6 | Growth and post-launch | Ongoing |

## Dev Log
One note per work session in `Dev Log/`, named YYYY-MM-DD.
- [[Dev Log/2026-11-23]]: vault set up, filled in from the roadmap, first push, GitHub Projects board

## Rules for this vault
- It is committed to GitHub. Never put secrets (API keys, passwords, tokens) or personal information here.
- Use absolute dates (YYYY-MM-DD), not "today" or "last week".
