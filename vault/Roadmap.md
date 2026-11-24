# Earthpull — Project Roadmap

Nov 23, 2026 · @Saafi

## Overview

**Earthpull is a free browser gacha game where every real place on Earth is a card, and everyone's pulls fill in one shared world map.** The goal is a resume line with real numbers (for example, "Built Earthpull, 25K players in the first month") plus an engineering story worth telling in interviews. Money is not the goal. Earthpull is a working name; see Phase 0. **Update 2026-11-23: the name is Pull the Planet** (see [[Decisions]]).

**One-line pitch:** Open packs, pull real towns, lakes and landmarks, and claim numbered copies before they run out. Some places exist only once.

**Why it can spread:**

- Hometown pride. Your first pack always holds a place near you, so "I pulled my hometown, #3 of 1000" is built in.
- Absurd stats from real data, like a Bolivian village that out-defends Tokyo, make screenshots people share.
- Scarcity. True 1-of-1 cards like Everest create bragging rights and headlines.

**What already exists, and how this differs:**

| Product | What it does | What Earthpull adds |
| --- | --- | --- |
| [Wikigacha](https://www.pcgamesn.com/wikigacha/wikipedia-card-game) | Wikipedia articles as cards; the app has mint numbers and 1-copy legendaries | Real places, a shared world map, the hometown hook |
| [City Cardz](https://store.steampowered.com/app/4831720) | About 600 city cards for deck battles on Steam | Free in the browser, every place on Earth, scarcity |
| [Atlas: Earth](https://gamesbeat.com/after-4-years-atlas-earth-changes-the-game-by-adding-real-world-map-landmarks-that-players-can-buy-exclusive-interview/) | Players buy virtual land and landmarks | Free pulls instead of purchases; a collecting game, not real estate |

## Game design spec

**Version 1 is pack opening, numbered copies, a personal collection and a shared world map. Battles and trading wait for v2.**

### Rarity and serial numbers

Cards use serial-numbered print runs, like real trading cards. Commons are unlimited; every higher tier has a fixed cap. The caps below are starting values to tune in the beta (Phase 3).

| Tier | Copies | What lands here | Pull odds per card (start) |
| --- | --- | --- | --- |
| Common | Unlimited, no number | Small towns, minor features | 70% |
| Rare | /1000 | Mid-size cities, notable lakes and peaks | 22% |
| Epic | /100 | Major cities, national parks | 6.5% |
| Legendary | /10 | Capitals, world-famous mountains and rivers | 1.4% |
| Mythic | 1/1 | About 50 icons: Everest, Eiffel Tower, Niagara Falls | 0.1% |

- When a numbered card's cap is reached, it is "minted out" and can drop only as a lower-tier variant or not at all.
- The pull screen reveals the serial last ("#7 of 10") for drama.

### Stats from real data

**Update 2026-11-23: no 1–100 stats.** Cards show real facts instead (see [[Decisions]] and [[Game Design#Card facts]]); battles are no longer planned for v2.

| Stat | Source | Notes |
| --- | --- | --- |
| HP | Population | Log-scaled so megacities don't break everything |
| Defense | Elevation | Mountains and highland towns are tanks |
| Attack | Wikipedia page views, last 12 months | Fame = power; produces the funny matchups |
| Chill | Average annual temperature, inverted | Colder = higher |
| Type | Climate or biome | Coastal, Tundra, Desert, Mountain, Urban, Forest |

### Card art

**Every card uses a real photo when one exists; places without a usable photo get a generated mini-map instead.**

- **Photos:** from Wikimedia Commons, found through each place's Wikidata image property. All Commons files are free to reuse, but most licences require crediting the author and licence, so every card's detail view shows "Photo: \[author\], \[licence\]".
- **Fallback mini-map:** a small rendered map of the place (coastline, terrain shading, rivers, a pin), drawn by your own script from free map data. Small towns with no photo will use this most.
- Both styles share one card frame, so a mini-map card looks deliberate, not like a missing image.

### Core loop

1. Packs refill on a timer: start with 5 cards per pack, 1 pack per 2 hours, holding up to 3.
2. Open a pack: flip animation, rarity glow, serial revealed last.
3. Cards go to your collection and light up on your personal map.
4. Check the world map: every claimed place, who owns its #1, country leaderboards.
5. Share your best pull as an image card.

### Hooks that drive sharing

- **Hometown pack:** your first pack guarantees a card within about 50 km, from coarse IP location (province or country level is stored, never exact location).
- **Discovered by:** the first person to pull any card, commons included, gets their name on it forever.
- **Sets:** complete themed sets for bonus packs and a badge, such as Canada's 13 provincial and territorial capitals, the Great Lakes, or the Seven Summits.

### Out of scope for v1

- Trading (attracts bots and scams; needs moderation)
- Battles (a whole game of its own)
- Paid packs or any real-money mechanic
- Native mobile apps (the site should work well on phones instead)

### Maps and friends

**Your collection lives on a full-screen, Google Maps-style map, and friends' collections can be layered on top of yours.** Basic friends features ship in v1, because every invite brings in a new player.

**Your map:**

- Pannable, zoomable map (MapLibre) with every owned card as a pin coloured by rarity.
- Zoomed out, pins cluster ("47 cards in BC") or regions shade by how many cards you own there.
- Tap a pin to open the card, its serial and stats.
- Progress overlays: "You own 12% of Canada's cities", "3 of 13 capitals".

**Friends (v1):**

- Add friends by friend code or invite link.
- Toggle each friend on as a layer in their own colour.
- Compare view: who owns more of each province or country, and which cards they have that you don't.
- Friend leaderboard and a small activity feed ("Alex pulled Banff #4 of 100").

**Privacy rules:**

- Players can hide their hometown card and badge, since it hints at where they live.
- Friend maps are visible only to accepted friends; public profiles show cards, never locations.
- Never store or display exact user locations; only the region used for the hometown pack.

**Performance:** load pins only for the area on screen, use MapLibre's built-in clustering, and pre-aggregate counts by region so collections of thousands of cards stay fast.

## Phase 0 — Ideation and validation (1 week)

**Lock the name, prove the core moment is fun on paper, and set up the project before writing real code.** At 5–10 hours a week (about 150 hours of work in total), the plan runs about 5 months, with launch in early May 2027 right after exams; the roadmap below shows every phase and the gate that ends it. Use the winter break to get ahead, and cut scope before moving launch past May.

&#91;embedded content: Earthpull roadmap · 7 phases, 5 gates\]

Each phase ends at a gate; don't start the next phase until its gate is met, and cut scope rather than skip a gate.

- [ ] Pick a name. Shortlist: Earthpull, Placedex, Pull the Planet, Atlasdex. Check .com, .gg and .io availability and that the handle is free on TikTok, X and Reddit.
- [ ] Buy the domain (about $10–40 per year).
- [ ] Do a final competitor search on Product Hunt, itch.io, r/WebGames and r/incremental\_games for "places gacha" or "city card pack" games.
- [ ] ~~Paper prototype: print 30 fake cards (mix of tiers, real stats) and have 5 friends open "packs" from a shuffled pile. Watch which cards they react to.~~ Dropped 2026-11-23.
- [ ] ~~Interest test: show a mock-up of one card and the hometown pull to 20 people. Ask "would you open a pack?" and "would you send this to someone?"~~ Dropped 2026-11-23.
- [ ] Set up the repo, a Trello or GitHub Projects board with this roadmap, and a dev log (screenshots and notes for each week; this becomes launch content later).

**Gate to Phase 1:** ~~at least 12 of 20 people say they'd share a hometown pull, and~~ the name and domain are secured. **Met 2026-11-23.** (Changed 2026-11-23: the Phase 3 private beta is the first test of whether people share pulls.)

## Phase 1 — Data pipeline (3 weeks, about 20 hours)

**Build a repeatable script that turns free public datasets into one card-pool table, with rarity and stats for every place.** This is the GIS-heavy part and a strong resume talking point on its own.

**Sources (all free):**

| Dataset | Gives you | Notes |
| --- | --- | --- |
| [GeoNames](https://download.geonames.org/export/dump/) `cities1000` | Every populated place over 1,000 people: name, coordinates, population, elevation, country, admin region | Bulk download, no API calls needed |
| [Wikidata](https://query.wikidata.org/) | Landmarks, mountains, lakes, rivers, national parks, plus the Wikipedia article link for each place | SPARQL queries; cache results |
| [Wikimedia Pageviews API](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/) | 12 months of views per article (fame score) | Rate-limited; batch it and cache |
| [WorldClim](https://www.worldclim.org/) or Open-Meteo | Average temperature for the Chill stat | Sample a raster at each point |
| Natural Earth or a biome dataset | Type (Coastal, Desert, Tundra…) | Point-in-polygon or distance-to-coast |

**Steps:**

1. Download and clean GeoNames; drop duplicates and alternate-name noise.
2. Pull landmark categories from Wikidata and join them to Wikipedia article titles.
3. Fetch page views for every place that has an article; places without one get a fame score of zero.
4. Assign rarity by fame percentile within the pool, then hand-pick the roughly 50 Mythics.
5. ~~Compute stats (log-scale population, normalise each stat to 1–100 so cards are comparable).~~ **Update 2026-11-23:** collect real facts per card instead (population, height, elevation, area or length, average temperature, fame).
6. Generate flavour: a one-line fact per card from the Wikipedia summary, trimmed.
7. Export the card pool as static JSON (split by region) for Cloud Storage, plus a small sample file for front-end development.

**Card images:** for each card, look up the Wikidata image property, then fetch a thumbnail plus its author and licence from the Commons API. Save the thumbnail to your own storage (Firebase Storage) rather than linking to Wikimedia live. Reject images that are maps, flags, logos or tiny. Cards with no usable photo go to a mini-map render step that outputs one image per card. Expect a large share of small towns to need the mini-map; check the real split on a sample first.

**Tools:** Python with pandas and GeoPandas (you already know these from GIS work), or DuckDB with its spatial extension for speed.

**Gate to Phase 2:** the script runs end to end from a clean machine, and a random sample of 100 cards looks right (no broken names, stats in range, sensible rarities). Keep the pool to roughly 150,000–200,000 cards to start; that is plenty.

**Gate to Phase 2 (updated 2026-11-24):** the pipeline runs end to end for any country with one command from a clean machine, it has been run for all of North America (the launch pool), and a random sample of 100 cards looks right. See [[Decisions]].

## Phase 2 — MVP build (11 weeks, about 80 hours)

**Build the smallest version that delivers the core moment: open a pack, see a numbered real place, share it, see it on the world map.** Everything that decides what you pulled runs on the server.

**Stack:**

| Layer | Choice | Why |
| --- | --- | --- |
| Front end | Next.js (React) + Tailwind on Firebase App Hosting | One platform for hosting and backend |
| Map | MapLibre GL + free vector tiles (OpenFreeMap or MapTiler free tier) | No Google Maps bills |
| Database | Cloud Firestore for user data: pulls, packs, friends | You already know Firebase; transactions handle minting |
| Card pool and map layers | Static JSON and tiles in Cloud Storage behind the CDN | Firestore bills per read, so 200,000 cards and map pins must not be read from it on every page load |
| Auth | Firebase Auth (Google + email link) | Built in |
| Server logic | Cloud Functions | Pack rolls and minting never run in the browser |
| Bot protection | Firebase App Check + per-user rate limits | Blocks scripted pack opening |
| Share images | `@vercel/og` (Satori) inside a function | Generates a PNG card per pull for social previews |
| Analytics | PostHog | Funnels and retention; free tier is generous |

**Core collections:** `cards` (the pool from Phase 1, plus `cap` and `minted` counts), `users`, `pulls` (who got which card, serial number, timestamp), `pack_state` (packs available, next refill time), friendships (requester, addressee, status).

**Minting a numbered copy safely (the interview story):** when two people pull the last copy at the same moment, only one may get it. Do it in a Firestore transaction inside a Cloud Function:

```typescript
const serial = await db.runTransaction(async (tx) => {
  const ref = db.doc(`mintCounts/${cardId}`);
  const snap = await tx.get(ref);
  const minted = snap.exists ? snap.data()!.minted : 0;
  if (cap !== null && minted >= cap) return null; // minted out
  tx.set(ref, { minted: minted + 1 }, { merge: true });
  tx.create(db.collection("pulls").doc(), { uid, cardId, serial: minted + 1, at: FieldValue.serverTimestamp() });
  return minted + 1;
});
```

If two players hit the same card at once, Firestore retries one transaction with fresh data, so serials never repeat. A `null` result means the card just minted out, and the function re-rolls that slot. One counter document per card can take only about one write per second, which is plenty for numbered cards; commons have no serials, so they skip the counter entirely.

**Weekly milestones:**

1. **Weeks 1–2:** project setup, Firestore collections and security rules, card pool uploaded to Cloud Storage, sign-in working, a plain "open pack" button that returns 5 cards as JSON.
2. **Weeks 3–5:** pack timer and refills, atomic minting, card component design (tiers, stats, serial), the pack-opening animation.
3. **Weeks 6–8:** collection page, personal map with clustering and progress overlays, world map of claimed places, card detail page with "discovered by" and owner of #1.
4. **Weeks 9–11:** hometown first pack, friend codes and invite links, friend map layers and compare view, share images and links, leaderboards (most cards, most #1s, by country, friends), privacy settings, mobile polish, PostHog events.

**Gate to Phase 3:** a new player can go from landing page to sharing a card in under 60 seconds on a phone, with no console errors.

## Phase 3 — Private beta and tuning (3 weeks)

**Put the game in front of 30–50 real people, tune the economy from their behaviour, then wipe all pulls before the public launch.** This replaces the A/B test: there won't be enough traffic to split at launch, and changing scarcity rules after launch angers owners.

**Recruit testers:** classmates, friends in other cities and countries (so the world map isn't all one province), a university Discord or club, and 2–3 people who play gacha games seriously.

**Measure (PostHog):**

| Question | Signal | Healthy target |
| --- | --- | --- |
| Is opening packs fun? | Packs opened per player per day | 3 or more |
| Do they come back? | Day-1 and day-7 return rate | 40% and 20% |
| Do they share? | Share-button taps per player | At least 1 in the first session |
| Is scarcity working? | How fast Legendaries and Rares mint out | No tier fully gone in week 1 |
| Where do they drop off? | Landing → first pack → sign-in → second pack funnel | Under 30% lost at sign-in |

**Tune:** pull odds, caps per tier, refill speed, which places are Mythic. Ask testers which pulls made them say something out loud.

**Also in this phase:** fix the bugs testers find, write a two-line FAQ ("What is this?", "Is it free?"), and collect 5–10 of the best tester screenshots to use in launch posts.

**Gate to Phase 4:** day-1 return of 40% or more, at least one unprompted share, and the data wipe script tested.

## Phase 4 — Deployment and infrastructure (2 weeks, then an exam pause)

**Make sure a sudden traffic spike slows the site down instead of breaking it or emptying your wallet.** Viral web toys often crash on their big day; Wplace and Wikigacha both had sign-up or server problems at their peak.

**Hosting and environments:**

- Firebase for everything: App Hosting for the site, Cloud Functions for game logic, Firestore for user data, Cloud Storage plus CDN for card images and map data. Keep separate **staging** and **production** projects.
- Every change goes to staging first; production deploys only from the main branch.
- Serve the map tiles and card images from a CDN, never from your own server.

**Load and cost readiness:**

- [ ] Load-test pack opening with k6 or Artillery: simulate 500 people opening packs at once and confirm no duplicate serials.
- [ ] Cache the world map as pre-built tiles or an aggregated layer, refreshed every minute, instead of querying every pull live.
- [ ] Set budget alerts in Google Cloud and on the tile provider. Firebase budgets only warn, they don't stop spending, so add a small function that turns on busy mode (or disables pack opening) when a budget alert fires. Turn on Firestore daily backups.
- [ ] Prepare a "busy mode": a queue or a friendly "packs are recharging, come back in 10 minutes" screen you can switch on.

**Bot and abuse protection:**

- Sign-in required to keep numbered cards (guests can open one taster pack).
- Firebase App Check on every function call, plus rate limits per account on pack opening.
- Flag accounts that open packs at inhuman speed; numbered cards from flagged accounts can be revoked.

**Monitoring:** Sentry for errors, the Firebase console for load and Firestore reads, a simple uptime check that texts you.

**Legal pages (short and plain):** privacy policy (what you store: email, coarse region, pulls), terms (cards have no cash value, accounts can be removed for botting), and data attributions for GeoNames, Wikidata, Wikipedia and the map tiles, as their licences require.

**Expected cost:** close to $0 a month during beta; budget roughly $25–50 a month after launch for paid database and hosting tiers if traffic is real.

**Gate to Phase 5:** load test passes, budget kill switch tested, backups on, busy mode works, legal pages live.

## Phase 5 — Launch and marketing (2 weeks)

**Launch on a weekday morning with a staggered channel plan, leading every post with a picture of a pull, not a pitch.** Viral web toys spread through screenshots; the link rides along in a comment or bio.

### Two weeks before launch

- [ ] Post 3–5 short build-in-public clips from the dev log on TikTok, YouTube Shorts and Instagram Reels ("I'm turning every place on Earth into a trading card").
- [ ] Start a waitlist on the landing page; promise waitlisters a guaranteed Epic in their first pack.
- [ ] Write every launch post in advance and save them as drafts.
- [ ] Make a 20–30 second launch video: pack opening, a hometown pull, the world map filling in.

### Launch day (Tuesday or Wednesday, about 7–9 am Pacific)

| Time | Channel | Post |
| --- | --- | --- |
| Hour 0 | Waitlist email + friends' group chats | "It's live, go claim your hometown before someone else does" |
| Hour 1 | r/WebGames, r/incremental\_games, r/InternetIsBeautiful | Screenshot of a funny pull; link in the post or first comment per each sub's rules |
| Hour 2 | TikTok, Shorts, Reels | Launch video |
| Hour 3 | X / Bluesky | Launch video + a thread on the minting problem for developers |
| Hour 4 | Hacker News (Show HN) | "Show HN: Every place on Earth is a card, and some exist only once" + the technical write-up |
| Next day | Local subreddits (r/vancouver, r/canada, city subs) | "Someone in this city just pulled our #1 card" style posts with real data |
| Week 2 | Product Hunt | Full launch with screenshots and the video |

Read each subreddit's self-promotion rules first; some require a comment history or only allow posts on certain days.

### Press and creators

- Pitch short emails to writers who covered Wikigacha and Wplace (PC Gamer, PCGamesN, Kotaku, Dexerto, Know Your Meme) with a GIF and one surprising stat from launch week.
- Reach out to geography and map YouTubers and TikTokers, offering them a custom pull or a named set.

**Gate to Phase 6:** launch posts are out, the site stayed up, and you've written down day-1 numbers (visitors, packs opened, shares).

## Phase 6 — Growth, advertising and post-launch (ongoing)

**After launch, growth comes from a steady content rhythm and limited-time events; paid ads are a small experiment, not the engine.**

### Content rhythm

| Cadence | Content | Where |
| --- | --- | --- |
| Daily | "Pull of the day": the rarest or funniest card someone got | TikTok, X, Discord |
| Weekly | World map update: which country is claiming the most | r/MapPorn, r/dataisbeautiful, X |
| Weekly | Stat weirdness: "this town of 2,000 out-defends Tokyo" | TikTok, Shorts |
| Per event | Recap with numbers | Dev log, LinkedIn |

### Events and seasons

- **Themed drops** every 2–3 weeks: a limited set ("Volcanoes of the Pacific", "Canada Day capitals") with its own pack and short window.
- **Country weeks:** a boosted country whose players get bonus packs; post the results map.
- **Season 2** after about 3 months: new card variants (holographic, night-time), keeping Season 1 cards as legacy.
- **Discord server** for collectors to show off and report bugs; it also becomes your feedback channel.

### Paid advertising (small test)

- Budget: $50–100 total, only after organic launch, to learn which audience converts.
- Try: Reddit ads targeting r/geography and gacha subreddits, and boosted TikTok posts of your best-performing organic clip.
- Judge by cost per player who opens a second pack, not by clicks. Stop if it's over about $1.

### Version 2 features (in order)

1. Trading between players (with trade limits and a cooldown).
2. ~~Simple battles using the real stats.~~ Dropped 2026-11-23: no battle system planned; maybe later.
3. Friend leagues: group goals and shared sets, building on v1's friend compare.
4. A Wikipedia fantasy mode, reusing the page-view pipeline.

### Optional monetisation (only if costs grow)

Cosmetic card frames or a "supporter" badge, or a tip jar. Never sell packs or numbered cards for money: that turns it into gambling-adjacent territory and hurts the resume story.

## Metrics and resume story

**Track a few honest numbers from day one so the resume line is specific and defensible in an interview.**

**Numbers to track (PostHog):** total unique players, peak daily players, packs opened, cards minted, day-1 and day-7 retention, shares per player, countries reached, and peak requests per second the site handled.

**Resume line templates** (fill with real numbers only):

- Built and launched Earthpull, a browser collecting game where every real place on Earth is a card; reached \[X\] players in \[Y\] countries within \[Z\] weeks.
- Designed a transactional serial-minting system in Firestore that issued \[N\] numbered cards with zero duplicates under \[P\] concurrent users.
- Built a geospatial data pipeline (GeoNames, Wikidata, Wikipedia page views) generating \[N\] cards with data-derived stats.

**Interview talking points:**

1. Concurrency: why minting is a race condition and how one atomic update solves it.
2. Data engineering: joining messy geographic datasets and scoring fame from page views.
3. Scaling: what broke (or didn't) on launch day, caching the world map, spending caps.
4. Product: how beta data changed the rarity caps, and what drove sharing.

Keep the dev log, launch-day screenshots and the PostHog dashboard; they are your evidence.

## Decisions

**Most of the big choices are made; six smaller ones are still open, each with a recommendation, and they should be settled before Phase 2 starts.**

### Decided

| Decision | Choice |
| --- | --- |
| Card art | Real Wikimedia Commons photos where possible; generated mini-map otherwise |
| Stack | Firebase (Firestore, Cloud Functions, Auth, App Check, App Hosting) + Next.js + MapLibre |
| Time budget | 5–10 hours a week, solo; launch early May 2027 |
| Scarcity model | Unlimited commons, numbered caps per tier, about 50 true 1-of-1s |
| Friends | Friend codes, map layers and compare view ship in v1 |
| Money | Free; no paid packs or cards |

### Open

- [ ] **Name and domain.** Shortlist: Earthpull, Placedex, Pull the Planet, Atlasdex. Decide in Phase 0.
- [ ] **Minimum age.** Recommended: 13+, with a birth-year check at sign-up. Collecting emails from children under 13 brings extra legal requirements.
- [ ] **Usernames.** Recommended: usernames are public on "discovered by" credits and leaderboards, so filter profanity at sign-up, add a report button, and let you rename an account that breaks the rules.
- [ ] **Season policy.** Recommended: state publicly that Season 1 cards are never reprinted or taken away, except for botting. Later seasons add new variants instead.
- [ ] **Launch scope.** Recommended: the whole world at launch (more shareable), not Canada first.
- [ ] **Analytics event list.** Write it before Phase 2: page view, sign-up, pack opened, card pulled (tier, serial), share tapped, friend added, map opened. These are the numbers the resume line depends on.

## Risks and mitigations

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Launch gets little traction | High | Plan for several launches: local subs, then Show HN, then Product Hunt; each event is another shot |
| Someone ships a similar game first | Medium | Move fast on the MVP; the hometown hook and shared map are hard to copy quickly |
| Bots claim all the rare cards | High | Sign-in, App Check, rate limits, revocable cards from flagged accounts |
| Traffic spike crashes the site or runs up bills | Medium | Load test, static card data on the CDN, cached world map, busy mode, budget-triggered kill switch |
| Scarce cards run out and new players feel locked out | Medium | Unlimited commons, "discovered by" for everyone, seasons with new variants |
| Data errors (wrong names, offensive or sensitive places) | Medium | Sample checks in Phase 1; exclude sensitive categories (cemeteries, ~~memorial sites~~, disputed borders). **Update 2026-11-23: memorials are allowed as cards** (see [[Decisions]]) |
| Data licence requirements | Low | Credit GeoNames, Wikidata, Wikipedia and the map tile provider on an About page |
| School workload delays the build | High | Treat dates as targets; cut scope (leaderboards, sets) before cutting the core loop |
