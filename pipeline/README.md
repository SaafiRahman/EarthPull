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

Downloads and Wikidata answers are cached in `data/raw/`. Everything under `data/` is git-ignored and can be rebuilt.

## Data credits

GeoNames (geonames.org), CC BY 4.0. Statistics Canada 2021 census subdivision boundaries, Open Government Licence – Canada. Wikidata, CC0.
