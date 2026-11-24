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
| 2026-11-23 | Worldwide neighbourhood rule | Flag a place within ~15 km of a much bigger place; drop it only if Wikidata (by GeoNames ID) agrees it's a neighbourhood. National boundaries only where a country is messy | Works without per-country data; on Canada, boundaries alone and Wikidata alone each got real towns wrong. See [[Data Pipeline#Going global]] |
| 2026-11-23 | Built landmarks | Include structures: towers, buildings, bridges and similar, not just natural features | Developer: they're really important to have, and they should be high-rarity cards |
| 2026-11-23 | Query engine for big Wikidata walks | QLever (public, University of Freiburg) for the structures query; query.wikidata.org for the rest | The structure-subclass walk times out on query.wikidata.org; QLever does it in seconds. If QLever is down, the cached result in `data/raw/` still works |
| 2026-11-23 | Memorials | Allowed as cards (National War Memorial, Wolfe-Montcalm Monument...). Cemeteries, graves, prisons, residential schools and hospitals stay excluded | Developer's call; changes the roadmap's "exclude memorial sites" rule |
| 2026-11-23 | Identify pipeline requests to Wikimedia | User-Agent `PullThePlanetPipeline/0.1 (https://github.com/SaafiRahman/EarthPull)` | Wikimedia's policy asks for a contact; anonymous scripts were throttled to ~13 h for Canada. Developer approved using the repo URL (no email) |
| 2026-11-23 | Fame score | English + French Wikipedia views, last 12 complete months, real users only | Quebec places often have only, or mainly, a French article |
| 2026-11-23 | News spikes in fame | Fame = median month x 12 (en + fr views per month). The plain 12-month total is kept as `views_12mo` for reference. (Earlier the same day: keep the plain total; changed by the developer.) | One news spike shouldn't make a card famous: Tumbler Ridge drops from 499k to 48k, CN Tower stays at 444k |
| 2026-11-23 | Rarity method | Fame ranked within each type (town, nature, built). Towns and nature: top 0.5% Legendary, next 4.5% Epic, next 20% Rare, rest Common. Floors: national capital Legendary; provincial capitals and national parks Epic. Starting values, tuned in the beta | Types get very different view counts; floors follow the roadmap's tier examples |
| 2026-11-23 | Built rarity | Built landmarks are never Common: top 3% Legendary, next 17% Epic, rest Rare. Arenas and stadiums stay in by fame | Developer: structures are high-rarity cards; kept as drafted |
| 2026-11-23 | Offshore platforms | Not cards (Ocean Ranger, Hibernia) | Ocean Ranger is a disaster site (84 deaths); Hibernia can't be visited |
| 2026-11-23 | Canadian Mythics | Niagara Falls, CN Tower, Rocky Mountains (in `pipeline/mythics.csv`) | Developer's picks; the rest of Canada's icons stay Legendary to save Mythic slots for the world |
| 2026-11-23 | No stats, no battles | Cards show real facts (population, elevation, height, area or length, average temperature, fame) instead of 1–100 stats; battles dropped from v2; trading stays a v2 idea | Developer: the game is about collecting, maybe trading; a battle system isn't needed. Wikigacha has battles, but our hooks are the map, numbered copies and local cards |
| 2026-11-23 | Gone places | Drop places that are demolished, destroyed or never built (CalgaryNEXT); keep ones that closed but still stand (Montreal Forum) | Cards are real places you can visit |
| 2026-11-24 | Places you can't visit | Undersea features and lakes that no longer exist are dropped like demolished buildings | Same reason as gone places: cards are real places you can visit |
| 2026-11-24 | English cards | Flavour lines from French-only Wikipedia articles are translated into English; translations live in `pipeline/flavour_en.csv`, keyed by the French line | Developer: "translate it on english". One language on cards; keying by the French text flags lines that change on Wikipedia instead of showing a stale translation |
| 2026-11-24 | Launch pool: North America | Launch with every North American country (Canada, US, Mexico, Central America, the Caribbean, Greenland); add other regions after launch | Developer's call. WikiGacha's pool is effectively every Wikipedia article (~7M in English), so a pool of a few hundred thousand places is small, not too big |
| 2026-11-24 | Phase 1 gate | The gate is "runs for any country with one command, run for North America", not a card count; the 150–200k figure was a starting cap, not a target | Lets the game ship with the launch region and grow country by country |
| 2026-11-24 | Mini-maps | Pre-rendered images (not live maps). Common cards get a wide "where is it" map from Natural Earth; Rare-and-up cards without a photo will get a detailed OpenStreetMap map | Developer chose pre-rendered and went with the recommended split. Natural Earth has no small lakes or islands up close; OpenStreetMap does but costs one query per card |
| 2026-11-23 | Worldwide ranking | Rank fame within each country, not against the whole world | Every country gets its own Legendaries and Epics, which suits local packs |
| 2026-11-23 | Git | Commits only under the developer's own git identity, no AI attribution lines, pushes need the developer's OK | Developer's rule for this repo |

## Open
Each has the roadmap's recommendation.
- [ ] **Minimum age.** Recommended: 13+, with a birth-year check at sign-up. Collecting emails from children under 13 brings extra legal requirements.
- [ ] **Usernames.** Recommended: usernames are public on "discovered by" credits and leaderboards, so filter profanity at sign-up, add a report button, and allow renaming an account that breaks the rules.
- [ ] **Season policy.** Recommended: state publicly that Season 1 cards are never reprinted or taken away, except for botting. Later seasons add new variants instead.
- [ ] **Launch scope.** Recommended: the whole world at launch (more shareable), not Canada first. (Building the Phase 1 pipeline on Canada first is separate from launch scope.)
- [ ] **Local packs (idea, 2026-11-23).** Details to settle: v1 or v2; the radius ("near you"); how often a local pack is available; what "worth more" means for a Local-tagged copy (rarer variant, display only, or more points); how location is checked within the privacy rules (coarse IP region, never stored exactly) and how to stop VPN or GPS spoofing from faking travel. See [[Game Design#Sharing hooks]].
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
