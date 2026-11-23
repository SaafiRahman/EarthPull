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

Downloads are cached in `data/raw/`. Everything under `data/` is git-ignored and can be rebuilt.

## Data credits

GeoNames (geonames.org), CC BY 4.0.
