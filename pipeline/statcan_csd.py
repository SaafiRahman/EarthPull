"""Download Statistics Canada's 2021 census subdivision (CSD) boundaries.

CSDs are municipalities or their equivalents (cities, towns, villages, rural municipalities,
reserves). Source: StatCan's ArcGIS REST service for the 2021 cartographic boundary files,
layer 9 (lcsd000b21s_e). The www12.statcan.gc.ca zip downloads sit behind a browser
security check that scripts can't pass, so this uses the REST service instead.

    python pipeline/statcan_csd.py    # -> data/raw/csd_2021.geojson (cached)
"""
import json
from pathlib import Path

import geopandas as gpd
import requests

ROOT = Path(__file__).parent
OUT = ROOT / "data" / "raw" / "csd_2021.geojson"
LAYER = "https://geo.statcan.gc.ca/geo_wa/rest/services/2021/Cartographic_boundary_files/MapServer/9/query"
PAGE = 500
SIMPLIFY_DEG = 0.0005  # about 50 m; plenty for point-in-polygon tests on town points


def fetch() -> gpd.GeoDataFrame:
    if OUT.exists():
        return gpd.read_file(OUT)
    features, offset = [], 0
    while True:
        r = requests.get(LAYER, timeout=180, params={
            "where": "1=1", "outFields": "CSDUID,CSDNAME,CSDTYPE,PRUID,LANDAREA", "outSR": 4326,
            "maxAllowableOffset": SIMPLIFY_DEG, "orderByFields": "OBJECTID",
            "resultOffset": offset, "resultRecordCount": PAGE, "f": "geojson"})
        r.raise_for_status()
        batch = r.json().get("features", [])
        features += batch
        print(f"  {len(features):,} subdivisions")
        if len(batch) < PAGE:
            break
        offset += PAGE
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"type": "FeatureCollection", "features": features}), encoding="utf-8")
    return gpd.read_file(OUT)


if __name__ == "__main__":
    csd = fetch()
    print(f"{len(csd):,} census subdivisions -> {OUT.relative_to(ROOT)}")
    print("Types:", csd["CSDTYPE"].value_counts().to_dict())
