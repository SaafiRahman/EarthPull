# Data Pipeline

Back to [[00 Home]]. Source: [[Roadmap]] (Phase 1). Feeds the stats in [[Game Design#Stats]] and the card pool in [[Architecture]].

**A repeatable script that turns free public datasets into one card-pool table, with rarity and stats for every place.**

## Sources (all free)
| Dataset | Gives | Notes |
|---|---|---|
| [GeoNames](https://download.geonames.org/export/dump/) `cities1000` | Every populated place over 1,000 people: name, coordinates, population, elevation, country, admin region | Bulk download, no API calls needed |
| [Wikidata](https://query.wikidata.org/) | Landmarks, mountains, lakes, rivers, national parks, plus the Wikipedia article link for each place | SPARQL queries; cache results |
| [Wikimedia Pageviews API](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/) | 12 months of views per article (fame score) | Rate-limited; batch it and cache |
| [WorldClim](https://www.worldclim.org/) or Open-Meteo | Average temperature for the Chill stat | Sample a raster at each point |
| Natural Earth or a biome dataset | Type (Coastal, Desert, Tundra…) | Point-in-polygon or distance-to-coast |

## Steps
1. Download and clean GeoNames; drop duplicates and alternate-name noise.
2. Pull landmark categories from Wikidata and join them to Wikipedia article titles.
3. Fetch page views for every place that has an article; places without one get a fame score of zero.
4. Assign rarity by fame percentile within the pool, then hand-pick the roughly 50 Mythics.
5. Compute stats (log-scale population, normalise each stat to 1–100 so cards are comparable).
6. Generate flavour: a one-line fact per card from the Wikipedia summary, trimmed.
7. Export the card pool as static JSON (split by region) for Cloud Storage, plus a small sample file for front-end development.

**Tools:** Python with pandas and GeoPandas, or DuckDB with its spatial extension for speed.

## Card images
- For each card, look up the Wikidata image property, then fetch a thumbnail plus its author and licence from the Commons API.
- Save the thumbnail to Firebase Storage rather than linking to Wikimedia live.
- Reject images that are maps, flags, logos or tiny.
- Cards with no usable photo go to a mini-map render step that outputs one image per card (see [[Game Design#Card art]]).
- Expect a large share of small towns to need the mini-map; check the real split on a sample first.

## Gate to Phase 2
- The script runs end to end from a clean machine.
- A random sample of 100 cards looks right: no broken names, stats in range, sensible rarities.
- Keep the pool to roughly 150,000–200,000 cards to start.

## Known data issues
From the risks in the [[Roadmap]]:
- Wrong names, or offensive or sensitive places: sample checks in Phase 1; exclude sensitive categories (cemeteries, memorial sites, disputed borders).
- Licence requirements: credit GeoNames, Wikidata, Wikipedia and the map tile provider on an About page.

No issues found in real data yet.
