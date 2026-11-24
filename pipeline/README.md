# Data pipeline

Turns free public datasets into the card pool. Plan and known data issues: `vault/Data Pipeline.md`.

## Setup

```
python -m venv pipeline/.venv
pipeline/.venv/Scripts/python -m pip install -r pipeline/requirements.txt   # Windows
# macOS/Linux: pipeline/.venv/bin/python -m pip install -r pipeline/requirements.txt
```

## Steps

| Step | Script | Output |
|---|---|---|
| 1. GeoNames, one country, cleaned | `python pipeline/geonames.py --country CA` | `data/interim/geonames_ca.parquet` |
| 2. Drop neighbourhoods (Canada): StatCan census subdivisions + Wikidata check | `python pipeline/drop_neighbourhoods_ca.py` | `data/interim/places_ca.parquet`, `neighbourhood_check_ca.csv` |
| 3. Wikidata: towns by GeoNames ID, natural landmarks (Canada) | `python pipeline/wikidata_ca.py` | `data/interim/towns_wikidata_ca.parquet`, `landmarks_ca.parquet` |
| 3b. Built landmarks via QLever (Canada) | `python pipeline/structures_ca.py` | `data/interim/structures_ca.parquet`, `structures_excluded_ca.csv` |
| 4. Page views, en + fr, 12 months; combined pool (Canada) | `python pipeline/pageviews_ca.py` | `data/interim/pool_ca.parquet` |
| 4b. Drop gone places: demolished, destroyed, never built (Canada); hand fixes in `overrides.csv` | `python pipeline/gone_ca.py` | `data/interim/pool_clean_ca.parquet`, `gone_ca.csv` |
| 5. Rarity: fame rank within type, floors, hand-picked Mythics (`mythics.csv`) (Canada) | `python pipeline/rarity_ca.py` | `data/interim/rarity_ca.parquet` |
| 6. Card facts: population, elevation (terrain height where missing), height or prominence, area or length, average temperature (WorldClim 2.1 `wc2.1_10m_bio_1.tif` in `data/raw/worldclim/`); impossible values blanked, hand fixes in `fact_fixes.csv` (Canada) | `python pipeline/facts_ca.py` | `data/interim/cards_ca.parquet` |
| 7. Flavour: one line per card from the Wikipedia intro (English, else French), with its source article for the CC BY-SA credit; French lines use the English translations in `flavour_en.csv` (Canada) | `python pipeline/flavour_ca.py` | `data/interim/flavour_ca.parquet` |
| 7b. Card images: a free photo with author and licence (Wikidata image, else the article's lead image, checked on Commons); `--download` saves 640 px WebP copies (Canada) | `python pipeline/images_ca.py` then `python pipeline/images_ca.py --download` | `data/interim/images_ca.parquet`, `data/export/images/photo/` |
| 7c. Mini-maps for cards with no photo: wide "where is it" maps from Natural Earth (`data/raw/naturalearth/`) (Canada) | `python pipeline/minimap_ca.py` | `data/export/images/minimap/` |
| 8. Export: one JSON file per region (`CA-ON.json`, ...) plus `index.json`, unique labels for same-name cards, facts-based flavour where there is no article; a committed sample for front-end work (Canada) | `python pipeline/export_ca.py` | `data/export/CA/`, `pipeline/sample/cards_sample_ca.json` |

Downloads and Wikidata answers are cached in `data/raw/`. Everything under `data/` is git-ignored and can be rebuilt.

## Data credits

GeoNames (geonames.org), CC BY 4.0. Statistics Canada 2021 census subdivision boundaries, Open Government Licence – Canada. Wikidata, CC0.
