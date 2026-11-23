# Decisions

Back to [[00 Home]]. Source for the game decisions: [[Roadmap]] (Decisions section, dated 2026-11-23). The open ones should be settled before Phase 2 starts.

## Decided
| Date | Decision | Choice | Reason |
|---|---|---|---|
| 2026-11-23 | Card art | Real Wikimedia Commons photos where possible; generated mini-map otherwise | See [[Game Design#Card art]] |
| 2026-11-23 | Stack | Firebase (Firestore, Cloud Functions, Auth, App Check, App Hosting) + Next.js + MapLibre | One platform for hosting and backend; see [[Architecture]] |
| 2026-11-23 | Time budget | 5–10 hours a week, solo; launch early May 2027 | Fits around school; launch right after exams |
| 2026-11-23 | Scarcity model | Unlimited commons, numbered caps per tier, about 50 true 1-of-1s | See [[Game Design#Rarity tiers and caps]] |
| 2026-11-23 | Friends | Friend codes, map layers and compare view ship in v1 | Every invite brings in a new player |
| 2026-11-23 | Money | Free; no paid packs or cards | Selling packs is gambling-adjacent and hurts the resume story |
| 2026-11-23 | Project memory | Obsidian vault in `vault/` | Keeps design, decisions and progress in the repo, readable by the developer and by Claude sessions |
| 2026-11-23 | Task board | GitHub Projects ("Earthpull Roadmap"), mirroring [[Tasks]] | Developer's choice over Trello; lives next to the repo. The vault stays the source of truth |
| 2026-11-23 | Git | Commits only under the developer's own git identity, no AI attribution lines, pushes need the developer's OK | Developer's rule for this repo |

## Open
Each has the roadmap's recommendation.
- [ ] **Name and domain.** Shortlist: Earthpull, Placedex, Pull the Planet, Atlasdex. Decide in Phase 0.
- [ ] **Minimum age.** Recommended: 13+, with a birth-year check at sign-up. Collecting emails from children under 13 brings extra legal requirements.
- [ ] **Usernames.** Recommended: usernames are public on "discovered by" credits and leaderboards, so filter profanity at sign-up, add a report button, and allow renaming an account that breaks the rules.
- [ ] **Season policy.** Recommended: state publicly that Season 1 cards are never reprinted or taken away, except for botting. Later seasons add new variants instead.
- [ ] **Launch scope.** Recommended: the whole world at launch (more shareable), not Canada first. (Building the Phase 1 pipeline on Canada first is separate from launch scope.)
- [ ] **Analytics event list.** Write it before Phase 2: page view, sign-up, pack opened, card pulled (tier, serial), share tapped, friend added, map opened. These are the numbers the resume line depends on (see [[Resume & Metrics]]).
