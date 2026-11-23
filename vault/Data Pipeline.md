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

## Progress (Canada)
- 2026-11-23, step 1: `pipeline/geonames.py` downloads `cities1000` and `admin1CodesASCII`, filters to Canada and cleans. 172,063 worldwide → 3,009 Canadian → 1,681 after dropping neighbourhoods (PPLX, 1,328 rows) and historical, abandoned and destroyed places. Output: `pipeline/data/interim/geonames_ca.parquet` (GeoParquet, EPSG:4326, git-ignored).

- 2026-11-23, step 2: census subdivision boundaries (2021, StatCan ArcGIS REST layer 9; the zip downloads are behind a browser check scripts can't pass). In urban subdivisions, places within 15 km of the place named after the subdivision are dropped: 161 dropped, 1,520 left. Greektown and Williamsville are gone; Dartmouth, Kanata and Fort McMurray are kept. **Over-drops real towns** inside merged municipalities (Georgetown, Stouffville, Ancaster, Stoney Creek, Aylmer); needs review. 16 coastal points fall outside every boundary.
- 2026-11-23, step 2 revised: the boundary rule alone dropped real towns, so each of its candidates is now checked against Wikidata (`pipeline/wikidata_places.py`): same-name items within 5 km, judged by their "instance of" classes. Keep if any is a town, city, village or former municipality, or a settlement with an English or French Wikipedia article; drop if it's a neighbourhood, borough or suburb, or if there's no usable match. Result: 160 flagged → 60 kept (Georgetown, Simcoe, Mount Pearl, Paris, Stoney Creek), 100 dropped (Montréal boroughs, Greektown, Sandy Hill, ByWard Market). Also dropped population-0 places (14). **Canada pool: 1,567 places.** Review file: `pipeline/data/interim/neighbourhood_check_ca.csv`.

## Known data issues
From the risks in the [[Roadmap]]:
- Wrong names, or offensive or sensitive places: sample checks in Phase 1; exclude sensitive categories (cemeteries, memorial sites, disputed borders).
- Licence requirements: credit GeoNames, Wikidata, Wikipedia and the map tile provider on an About page.

Found while building the paper prototype (2026-11-23, 30 places, `prototype/fetch_cards.py`):
- **Missing population in Wikidata:** Tofino has no population claim at all. Fallback to GeoNames `cities1000` (2,516, matches the 2021 census). In Phase 1, GeoNames is the main population source anyway; keep Wikidata as the fallback, not the other way round.
- **Several elevations per place:** Hobart has 1,270 m (probably the city's highest point) and 54 m. Everest has six, from different surveys (8,844 to 8,850 m, one in feet). Rule used: take Wikidata's preferred-rank value if there is one (Everest: 8,848.86 m); otherwise, for towns, the value closest to the terrain height at the coordinate (Open-Meteo elevation API), and for peaks the highest.
- **Natural features have no population:** peaks, lakes and parks get HP 1. Decide in Phase 1 whether that's fine (it's funny) or whether features need a different HP source.
- **Rate limits:** the Wikimedia Pageviews API returned 429 after about 10 requests, and Open-Meteo returned a 503 once. Cache every response and back off; see the cache in `prototype/fetch_cards.py`.
- **GeoNames elevation is mostly blank** (1,632 of 1,681 Canadian places). Use the `dem` column (terrain model height, set for all but 8) for Defense.
- **Neighbourhoods coded as towns:** some city neighbourhoods are coded PPL, not PPLX, so they survive the filter, e.g. Greektown (Vancouver) and Williamsville (Kingston). Fix to decide: drop a place inside a much bigger city's boundary (needs boundary data, e.g. Statistics Canada census subdivisions) or within a few km of a city 10× its size.
- **Population 0:** 14 Canadian places (municipality seats such as Saint-Rémi-de-Tingwick) had population 0. Dropped (decided 2026-11-23).
- **Quebec dominates:** 522 of 1,681 places, because Quebec has many small municipalities. Fine for cards, but it skews per-province rarity percentiles if rarity is assigned per province.
- **No duplicates found** by the same name + province within 5 km rule in Canada; keep the rule for other countries.
- **Wikidata class labels are messy:** "Greektown" is itself a class label, "neighbourhood of Quebec City" contains "city", and many neighbourhoods are tagged with a bare "urban-type settlement". Match municipality labels by prefix, let neighbourhood words win, and require a Wikipedia article for generic settlements.
- **Debatable drops** to revisit: Virgil, Cookstown, Lively (real communities with no clear Wikidata class), and Nepean (a city until 2001; Wikidata now calls it a neighbourhood).
- **Wikidata Query Service** returns 500s now and then; the lookup caches every answer and retries.
- **Elevation 0 m:** Churchill, Manitoba is stored as 0 m in Wikidata, while the terrain model gives 9 m. Small towns' elevations may be rough.
