# Bulk Data Plan

Written 2026-11-26. Status: **proposed, waiting for the developer's OK.** Part of [[Data Pipeline]]; decision in [[Decisions]] (2026-11-25, "Bulk data before the world").

## Why
The pipeline asks web APIs about one place (or a small batch) at a time. North America (86k cards) took about 10 hours of clean run time for the US alone, plus stalls. The world is maybe 5–10x the cards, so per-place calls would take days and keep hitting rate limits (Open-Meteo's daily quota stalled the US run for 7 hours).

## Where the time goes now
| Step | What it calls | Problem at world scale |
|---|---|---|
| towns | Wikidata SPARQL in batches of 250 (fine), plus one SPARQL query per town that sits near a bigger town (neighbourhood check) | the per-town queries: tens of thousands worldwide, 0.5 s+ each, 60 s timeouts |
| landmarks | big SPARQL queries per class, all countries at once (WDQS + QLever) | WDQS cuts queries at 60 s; the world will exceed it for big classes |
| pageviews | one Wikimedia REST call per article per language | ~1–2 million articles worldwide; hours, and throttling |
| gone / flavour | Wikipedia API, 20–50 titles per call | OK, just slower; keep |
| facts | Wikidata entities 50 per call (OK) + Open-Meteo terrain height per point | Open-Meteo quota: ~10,000 points a day |
| images / photos | Commons API per image + one download per photo | photos can't be avoided; run in parallel |
| translation | Claude translating lines by hand | 4,368 lines took a session; the world could be 100k+ lines |

## The plan, step by step

1. **Page views from monthly dump files** (biggest win).
   Wikimedia publishes one file per month with every article's views (`pageviews-YYYYMM-user.bz2`, 5.4 GB each, 12 files ≈ 64 GB).
   Download one month at a time, stream it, keep only the wikis we use (English + each country's local language), write the 12 monthly counts into `pageviews.sqlite`, delete the file.
   Disk peak ~6 GB. Replaces ~1–2 million API calls with 12 downloads; fame is computed exactly as now (median month × 12).
2. **Terrain height from a local elevation grid** instead of Open-Meteo.
   Download a global DEM once (GMTED2010 at 7.5 arc-seconds, ~1–2 GB; or Copernicus GLO-90 tiles for only the land we need) and read heights with `rasterio`, like the WorldClim temperature grid already does.
   Removes the daily quota entirely.
3. **Wikidata through QLever for every big query** (no full dump).
   QLever already answers our bulk queries and has no 60-second cutoff. Move the landmark queries and the town GeoNames-ID join there; run them per continent if needed.
   The full Wikidata dump (104 GB compressed, days to process on this PC) is the fallback only if QLever can't handle the world.
4. **Neighbourhood check in bulk.**
   Replace the one-query-per-town lookup with one QLever query per country that fetches every place item with a coordinate, label and class, then match locally (same name within 5 km), as `wikidata_places.py` does now.
5. **Run steps in parallel by country.**
   Countries are independent after landmarks. Run 3–4 at once with separate cache files (or one SQLite cache with locking) so two processes never write the same JSON cache.
6. **Photos:** download with a small worker pool (4–8) and resume from what's on disk. Wikimedia's limits stay the cap.
7. **Translation at world scale: needs a developer decision.**
   Options: (a) English-only flavour: cards without an English article get a line built from their facts; (b) machine translation with an API (costs money, must ask first); (c) Claude translates in batches like today (slow, free, good quality).

## Order of work
1. Page-view dumps (step 1) and test on Canada: fame must match the current numbers.
2. Local DEM (step 2), test on the US terrain heights already cached.
3. QLever for landmarks and towns (steps 3–4), test on Mexico.
4. Parallel runs (step 5) and photo pool (step 6).
5. Rerun all of North America and compare card counts and rarities with today's (86,345 cards).
6. Then pick the first region outside North America.

## Risks
- Dump file formats change now and then; the parser must fail loudly, not silently drop views.
- QLever is a free public service: if it goes down, the world run waits. Keep the WDQS path as a fallback.
- 64 GB of downloads: fine on this PC (450 GB free), but it takes a few hours on a home connection.

## Open questions for the developer
- OK to download ~64 GB of page-view dumps and a ~1–2 GB elevation grid?
- Translation for the world: (a), (b) or (c)?
- First region after North America?
