# Pull the Planet: Home

Index of the project brain. Read this, [[Tasks]] and the latest [[Dev Log/2026-11-26|Dev Log]] note at the start of every session.

**Pull the Planet (named 2026-11-23; working name was Earthpull) is a free browser gacha game where every real place on Earth is a card, and everyone's pulls fill in one shared world map.** Launch target: early May 2027.

## Current phase
**Phase 1: Data pipeline** (started 2026-11-23). Phase 0's gate was met on 2026-11-23: the name is Pull the Planet and pulltheplanet.com is registered. Earlier, the paper prototype and interest test were dropped, and the share test moves to the Phase 3 beta. Phase 1, the [[Data Pipeline]], has started on Canada; the launch pool is all of North America (decided 2026-11-24).

**Gate to Phase 2 (updated 2026-11-24):** the pipeline runs end to end for any country with one command from a clean machine, it has been run for all of North America (the launch pool), and a random sample of 100 cards looks right.

## What to do next
**Start with the Handoff section of [[Dev Log/2026-11-26]]** (session of 2026-11-26 ended mid-rerun; it lists exact next steps).
1. Developer: verify the domain's registrant email, and claim `pulltheplanet` on X, TikTok and Reddit.
2. Phase 1: the pipeline runs for any country with one command (`run.py`) and has been run for all of North America on 2026-11-26: 86,389 cards in 41 countries and territories. The 100-card sample review was done on 2026-11-26 with fixes, (86,345 cards). Left for the Phase 2 gate: run the pipeline once on a clean machine (never tested). Every country now has at least one Mythic (46 in North America). All flavour lines are in English (translated 2026-11-26). Also open: switching to bulk data before going past North America. See [[Tasks]].

## Preview
- North America demo (2026-11-26): `cd web && npm run dev`, then http://localhost:5173. See `web/README.md`.
- [Canada Card Pool](https://claude.ai/artifact/117bnRr4gnePifssV7qQMX): private map of every candidate card so far (built 2026-11-23). Only the developer can open it unless shared.

## Notes
- [[Bulk Data Plan]]: how the pipeline scales past North America (proposed 2026-11-26)
- [[Roadmap]]: the full roadmap and source of truth (phases 0–6, gates, risks)
- [[Decisions]]: decided choices and open questions, with dates and reasons
- [[Game Design]]: rarity tiers and caps, card facts, card art, core loop, sharing hooks, maps and friends, out of scope for v1
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
- [[Dev Log/2026-11-24]]: card facts, flavour and export for Canada; bad-data checks; launch pool is North America
- [[Dev Log/2026-11-23]]: vault set up, filled in from the roadmap, first push, GitHub Projects board

## Rules for this vault
- It is committed to GitHub. Never put secrets (API keys, passwords, tokens) or personal information here.
- Use absolute dates (YYYY-MM-DD), not "today" or "last week".
