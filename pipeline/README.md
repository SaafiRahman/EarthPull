# Data pipeline

Turns free public datasets into the card pool, for any country in `countries.py` (all of North America).
Plan and known data issues: `vault/Data Pipeline.md`.

## Setup

```
python -m venv pipeline/.venv
pipeline/.venv/Scripts/python -m pip install -r pipeline/requirements.txt   # Windows
# macOS/Linux: pipeline/.venv/bin/python -m pip install -r pipeline/requirements.txt
```

Two files are downloaded by hand into `pipeline/data/raw/`: WorldClim 2.1 `wc2.1_10m_bio_1.tif` (in `worldclim/`,
from https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_10m_bio.zip) and the Natural Earth 1:10m
zips (in `naturalearth/`: land, lakes, lakes_north_america, rivers_lake_centerlines, rivers_north_america,
admin_1_states_provinces).

## One command

```
python pipeline/run.py CA                # one country
python pipeline/run.py all               # every country in countries.py
python pipeline/run.py US --from facts   # resume at a later step
```

## Steps

Every step takes `--country CC` (except step 3) and reads and writes `data/interim/<CC>/`.
"Local language" is the country's own Wikipedia next to English (`countries.py`: French for Canada, Spanish for Mexico).

| Step | Script | Output in `data/interim/<CC>/` |
|---|---|---|
| 1. GeoNames towns of one country, cleaned; region (ISO 3166-2) from the GeoNames admin1 code | `geonames.py` | `geonames.parquet` |
| 2. Link towns to Wikidata by GeoNames ID; drop neighbourhoods (near a much bigger town and Wikidata says so) | `towns.py` | `towns.parquet`, `towns_checked.csv` |
| 3. Natural and built landmarks for every country at once (QLever); home country and region from the point, "also in" from Wikidata's countries | `landmarks.py` | `landmarks.parquet`, `structures.parquet` (+ `data/interim/structures_excluded.csv`) |
| 4. Page views, English + local language, 12 months; combined pool | `pageviews.py` | `pool.parquet` |
| 4b. Drop gone places: demolished, destroyed, never built; hand fixes in `overrides.csv` | `gone.py` | `pool_clean.parquet`, `gone.csv` |
| 5. Rarity: fame rank within type, floors, hand-picked Mythics (`mythics.csv`) | `rarity.py` | `rarity.parquet` |
| 6. Card facts: population, elevation (terrain height where missing), height or prominence, area or length, average temperature; impossible values blanked, hand fixes in `fact_fixes.csv` | `facts.py` | `cards.parquet` |
| 7. Flavour: one line per card from the Wikipedia intro (English, else local language), credited; local-language lines use the English translations in `flavour_en.csv` (lang, src, en) | `flavour.py` | `flavour.parquet`, `flavour_untranslated.csv` |
| 7b. Card images: a free photo with author and licence (Wikidata image, else the article's lead image, checked on Commons); `--download` saves 640 px WebP copies | `images.py`, then `images.py --download` | `images.parquet`, `data/export/images/photo/` |
| 7c. Mini-maps for cards with no photo, from Natural Earth | `minimap.py` | `data/export/images/minimap/` |
| 8. Export: one JSON file per region (`CA-ON.json`, ...) plus `index.json`; unique labels for same-name cards; facts-based flavour where there is no article; a sample for front-end work | `export.py` | `data/export/<CC>/`, `pipeline/sample/cards_sample_<cc>.json` |

Downloads and Wikidata answers are cached in `data/raw/`. Everything under `data/` is git-ignored and can be rebuilt.

## Data credits

GeoNames (geonames.org), CC BY 4.0. Wikidata, CC0. Wikipedia text, CC BY-SA 4.0. Wikimedia Commons photos, credited per card.
Natural Earth, public domain. WorldClim 2.1. Copernicus DEM via Open-Meteo.
