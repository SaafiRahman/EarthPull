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
| 2026-11-23 | Skip the paper prototype and interest test | Phase 0 gate is now just "name and domain secured"; the Phase 3 private beta is the first test of whether people share pulls | Developer's call. Trade-off: no evidence the hometown hook works until about 15 weeks of building are done, so watch the Phase 3 share numbers closely |
| 2026-11-23 | Start Phase 1 before the Phase 0 gate | Build the pipeline (Canada only) while the name and domain are still open | The pipeline doesn't depend on the name; developer's call |
| 2026-11-23 | Name | **Pull the Planet** (working name Earthpull retired) | Only shortlisted name with the .com free; all three TLDs free; says what the game is. See [[#Phase 0 research (2026-11-23)]] |
| 2026-11-23 | Domain | **pulltheplanet.com** at Cloudflare Registrar, $11.17/yr at cost, auto-renew on, expires 2027-11-23, Cloudflare nameservers | At-cost price with no renewal jump; free WHOIS redaction; DNS works with Firebase App Hosting custom domains. .gg and .io not bought |
| 2026-11-23 | Neighbourhood removal | StatCan census subdivisions flag candidates; Wikidata classes decide keep or drop | A hand allow-list won't scale globally (developer's call); the boundary rule alone dropped real towns like Georgetown and Simcoe |
| 2026-11-23 | Population-0 places | Drop them | Developer's call; they'd all get HP 1 |
| 2026-11-23 | Git | Commits only under the developer's own git identity, no AI attribution lines, pushes need the developer's OK | Developer's rule for this repo |

## Open
Each has the roadmap's recommendation.
- [ ] **Minimum age.** Recommended: 13+, with a birth-year check at sign-up. Collecting emails from children under 13 brings extra legal requirements.
- [ ] **Usernames.** Recommended: usernames are public on "discovered by" credits and leaderboards, so filter profanity at sign-up, add a report button, and allow renaming an account that breaks the rules.
- [ ] **Season policy.** Recommended: state publicly that Season 1 cards are never reprinted or taken away, except for botting. Later seasons add new variants instead.
- [ ] **Launch scope.** Recommended: the whole world at launch (more shareable), not Canada first. (Building the Phase 1 pipeline on Canada first is separate from launch scope.)
- [ ] **Analytics event list.** Write it before Phase 2: page view, sign-up, pack opened, card pulled (tier, serial), share tapped, friend added, map opened. These are the numbers the resume line depends on (see [[Resume & Metrics]]).

## Phase 0 research (2026-11-23)

### Name and domain availability
Domains checked against the registry whois servers (Verisign for .com, nic.io, whois.gg) on 2026-11-23. "Free" means not registered on that date; buy soon, since availability can change.

| Name | .com | .gg | .io | X | TikTok | Reddit (user / subreddit) |
|---|---|---|---|---|---|---|
| Earthpull | Taken: parked at Loopia, no site (renews 2027-10) | Free | Free | Not verified | Not verified | Not verified |
| Placedex | Taken: unrelated WordPress site (renews 2027-08) | Free | Free | Not verified | Not verified | Not verified |
| Pull the Planet | **Free** | Free | Free | Not verified | Not verified | Not verified |
| Atlasdex | Taken: listed for sale on Atom (premium price) | Free | Free | Not verified | Not verified | Not verified |

- Handles could not be checked automatically: X, TikTok and Reddit block scripted lookups, and the Claude in Chrome extension wasn't connected. Check them by hand before buying. Note X and TikTok handles max out at 15 and 24 characters; `pulltheplanet` (13) fits both.
- A web search found no existing game or app using any of the four names.
- Price note: the roadmap budgets $10–40 a year. A .com is at the low end of that; .gg and .io usually cost more, so check the registrar's price before buying.

**Recommendation: Pull the Planet, on pulltheplanet.com.** It's the only shortlisted name with the .com free, all three TLDs are free (buy .gg too if the budget allows, to protect it), it says what the game is, and it fits a launch-post headline. Fallback: keep **Earthpull** on **earthpull.gg** (the .com is parked by someone else, which may cost trust and typed-in traffic). Drop Placedex (.com in use by another business) and Atlasdex (.com for sale at a premium). Confirm the handles first.

### Competitor search
Searched Product Hunt, itch.io, r/WebGames and r/incremental_games topics, plus general web search, for "places gacha" and "city card pack" games.

| Product | What it is | Overlap with us | What we still add |
|---|---|---|---|
| [CityDeck](https://city-deck.com/) (JEMA Games) | **Free browser card game: 5-card packs of 25,000+ real cities from 208 countries, rarity by population, capitals as rarest Legendaries with a real photo, country albums, live auctions.** Newcomers get 6 free packs, then 1 per hour | **High.** Same platform, same pack format, same "capitals are rarest" idea. Not in the roadmap's competitor table | Numbered serials and true 1-of-1s, shared world map of everyone's pulls, hometown first pack, landmarks and natural features (not just cities), stats from real data, "discovered by" |
| [Wikigacha](https://www.wiki-gacha.com/about) | Browser gacha of Wikipedia articles (already in the roadmap) | Medium: some cards are places | Places only, the map, the hometown hook |
| [City Cardz](https://store.steampowered.com/app/4831720) (Steam) | City-card deck game (already in the roadmap) | Low | Free in browser, scarcity |
| [City Cards](https://play.google.com/store/apps/details?id=com.samuellindermann.citycards) (Google Play) | Mobile city-card app | Low to medium (not looked at in depth) | Browser, scarcity, map |
| itch.io: [Geo-Sleeper](https://pierce-porterfield.itch.io/geo-sleeper), [Draft City](https://mort-on.itch.io/draft-city) | Deckbuilder on real city maps; card-based city builder | Low: not collecting | n/a |
| Product Hunt: [World Traveler](https://www.producthunt.com/posts/world-traveler), [Stample](https://www.producthunt.com/products/stample) | Travel cards; GPS check-in stamps with leaderboards | Low: you must visit the places | No travel needed; gacha pulls |

No Reddit threads from r/WebGames or r/incremental_games turned up for this kind of game.

**Takeaway:** CityDeck is close enough that the pitch has to lead with what it doesn't have: **"some places exist only once"** (serials and 1-of-1s), **the shared world map**, and **your hometown in pack one**. "Every city is a card" alone is no longer new. Worth playing CityDeck for 20 minutes before the paper prototype to see what it does well. This doesn't block Phase 0, but update the roadmap's competitor table.
