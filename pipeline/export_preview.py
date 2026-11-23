"""Export the current Canada card pool for the preview map (preview/index.html).

    python pipeline/export_preview.py
Writes preview/data/places.json (one record per line) and preview/data/provinces.json
(province outlines, simplified, from the StatCan census subdivisions).
"""
import json
from pathlib import Path

import geopandas as gpd
import pandas as pd

from statcan_csd import fetch as fetch_csd
from wikidata_ca import PROVINCES

ROOT = Path(__file__).parent
INTERIM = ROOT / "data" / "interim"
OUT = ROOT.parent / "preview" / "data"


def tidy(prov: gpd.GeoDataFrame, min_area=0.01) -> gpd.GeoDataFrame:
    """Keep outlines light: the merge leaves ~170,000 pieces (Arctic islets, slivers) and
    thousands of lake holes. Keep pieces of at least min_area square degrees, drop holes."""
    from shapely.geometry import MultiPolygon, Polygon
    parts = prov.explode(index_parts=False)
    parts = parts[parts.geometry.area >= min_area].copy()
    # Grouped without a union: the outlines are only drawn, and unions of these shapes hit topology errors.
    rows = [{"name": name, "geometry": MultiPolygon([Polygon(g.exterior).simplify(0.02) for g in grp.geometry])}
            for name, grp in parts.groupby("name")]
    return gpd.GeoDataFrame(rows, crs=prov.crs)


def num(v):
    return None if pd.isna(v) else int(round(float(v)))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    recs = []

    towns = gpd.read_parquet(INTERIM / "places_ca.parquet")
    wd = gpd.read_parquet(INTERIM / "towns_wikidata_ca.parquet").set_index("geonameid")
    for r in towns.itertuples():
        elev = r.elevation if not pd.isna(r.elevation) else r.dem
        recs.append({"n": r.name, "t": "town", "k": "town", "p": r.province, "pop": num(r.population),
                     "el": num(elev), "w": wd["enwiki"].get(r.geonameid) or wd["frwiki"].get(r.geonameid),
                     "fr": bool(pd.isna(wd["enwiki"].get(r.geonameid)) and not pd.isna(wd["frwiki"].get(r.geonameid))),
                     "y": round(r.latitude, 4), "x": round(r.longitude, 4)})

    lm = gpd.read_parquet(INTERIM / "landmarks_ca.parquet")
    for r in lm.itertuples():
        recs.append({"n": r.name, "t": "nature", "k": r.kind, "p": r.province, "el": num(r.elevation_m),
                     "w": r.enwiki if isinstance(r.enwiki, str) else r.frwiki, "fr": not isinstance(r.enwiki, str),
                     "y": round(r.lat, 4), "x": round(r.lon, 4)})

    st = gpd.read_parquet(INTERIM / "structures_ca.parquet")
    for r in st.itertuples():
        recs.append({"n": r.name, "t": "built", "k": r.kind, "p": r.province, "sl": int(r.sitelinks),
                     "w": r.enwiki if isinstance(r.enwiki, str) else r.frwiki, "fr": not isinstance(r.enwiki, str),
                     "y": round(r.lat, 4), "x": round(r.lon, 4)})

    for r in recs:  # a few Wikidata items have no en/fr label: use the Wikipedia title
        if not isinstance(r.get("n"), str) or not r["n"]:
            r["n"] = r.get("w")
    recs = [r for r in recs if isinstance(r.get("n"), str) and r["n"]]
    for r in recs:  # drop empty keys to keep the file small
        for k in [k for k, v in r.items() if v is None or (isinstance(v, float) and pd.isna(v)) or v is False]:
            del r[k]
    with open(OUT / "places.json", "w", encoding="utf-8") as f:
        f.write("[\n" + ",\n".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in recs) + "\n]\n")

    csd = fetch_csd()[["PRUID", "geometry"]]
    # Simplify each subdivision before merging (merging the full-detail shapes takes many minutes),
    # then repair self-intersections with buffer(0).
    csd["geometry"] = csd.geometry.simplify(0.02, preserve_topology=True).buffer(0)
    prov = csd.dissolve("PRUID").reset_index()
    prov["geometry"] = prov.geometry.buffer(0).simplify(0.03, preserve_topology=True)
    prov["name"] = prov["PRUID"].map(PROVINCES)
    gj = json.loads(tidy(prov[["name", "geometry"]]).to_json(drop_id=True))

    def rnd(c):
        return [rnd(x) for x in c] if isinstance(c[0], list) else [round(c[0], 3), round(c[1], 3)]
    for f in gj["features"]:
        f["geometry"]["coordinates"] = rnd(f["geometry"]["coordinates"])
    (OUT / "provinces.json").write_text(json.dumps(gj, separators=(",", ":")), encoding="utf-8")

    counts = pd.Series([r["t"] for r in recs]).value_counts().to_dict()
    print(f"{len(recs):,} places {counts}")
    for f in ("places.json", "provinces.json"):
        print(f, f"{(OUT / f).stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
