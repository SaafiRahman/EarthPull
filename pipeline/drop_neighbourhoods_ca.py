"""Step 2 (Canada): drop city neighbourhoods that GeoNames codes as towns (e.g. Greektown in Vancouver).

Each place is matched to the 2021 census subdivision (CSD) it falls inside. In urban CSDs
(cities, towns, villes, villages), if one place carries the CSD's own name, it's the
municipality itself; other places inside that CSD and within NEAR_KM of it are treated as
neighbourhood candidates. Each candidate is then checked against Wikidata
(wikidata_places.verdict): kept if Wikidata calls it a town/city/village or former
municipality, or a settlement with its own Wikipedia article; dropped otherwise. Far-out places inside amalgamated cities (rural villages in the
City of Ottawa) and everything in rural or regional CSDs are kept.

    python pipeline/drop_neighbourhoods_ca.py
Input:  data/interim/geonames_ca.parquet   (from geonames.py)
Output: data/interim/places_ca.parquet     (+ data/interim/neighbourhood_check_ca.csv)
"""
import re
import unicodedata
from pathlib import Path

import geopandas as gpd
import pandas as pd

from statcan_csd import fetch as fetch_csd
from wikidata_places import lookup_many, verdict

ROOT = Path(__file__).parent
INTERIM = ROOT / "data" / "interim"
# CY city, C city/cité, CV city/ville, T town, TV town/ville, V ville, VL village, VN village nordique
URBAN_TYPES = {"CY", "C", "CV", "T", "TV", "V", "VL", "VN"}
NEAR_KM = 15
EQUAL_AREA = "EPSG:3347"  # Statistics Canada Lambert, metres


def key(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"^(greater|city of|town of|village of|ville de)\s+", "", s)
    return re.sub(r"[^a-z0-9]", "", s)


def csd_keys(name: str) -> set[str]:
    # Bilingual names look like "Greater Sudbury / Grand Sudbury"
    return {key(part) for part in re.split(r"\s*/\s*", name)}


def main():
    places = gpd.read_parquet(INTERIM / "geonames_ca.parquet")
    csd = fetch_csd()[["CSDUID", "CSDNAME", "CSDTYPE", "geometry"]]
    j = gpd.sjoin(places, csd, how="left", predicate="within").drop(columns="index_right")
    j = j[~j.index.duplicated(keep="first")]  # a point on a shared border can hit two CSDs
    print(f"{len(j):,} places; outside every CSD (coast or boundary simplification): {j['CSDUID'].isna().sum()}")

    metric = j.to_crs(EQUAL_AREA)
    drop_idx, mains = [], 0
    unmatched = []
    urban = j[j["CSDTYPE"].isin(URBAN_TYPES)]
    for uid, g in urban.groupby("CSDUID"):
        if len(g) < 2:
            continue
        names = csd_keys(g["CSDNAME"].iloc[0])
        main = g[g["asciiname"].map(key).isin(names) | g["name"].map(key).isin(names)]
        if main.empty:
            unmatched.append((g["CSDNAME"].iloc[0], g["CSDTYPE"].iloc[0], len(g), ", ".join(g["name"].head(4))))
            continue
        mains += 1
        main_idx = main["population"].idxmax()
        others = g.index.drop(main_idx)
        dist_km = metric.loc[others].distance(metric.loc[main_idx, "geometry"]) / 1000
        drop_idx += list(dist_km[dist_km < NEAR_KM].index)

    cand = j.loc[drop_idx].copy()
    print(f"Boundary rule flags {len(cand):,} possible neighbourhoods; checking Wikidata...")
    matches = lookup_many((i, r["name"], r["latitude"], r["longitude"]) for i, r in cand.iterrows())
    cand[["verdict", "reason"]] = [verdict(matches[i]) for i in cand.index]
    cand["wikidata"] = [",".join(m["qid"] for m in matches[i][:3]) for i in cand.index]
    print(cand.groupby(["verdict", "reason"]).size().to_string())
    dropped = cand[cand["verdict"] == "drop"]
    kept = j.drop(index=dropped.index)
    kept.to_parquet(INTERIM / "places_ca.parquet")
    cols = ["name", "province", "CSDNAME", "CSDTYPE", "feature_code", "population"]
    cand.sort_values(["verdict", "population"], ascending=[True, False])[
        cols + ["verdict", "reason", "wikidata", "geonameid"]].to_csv(
        INTERIM / "neighbourhood_check_ca.csv", index=False, encoding="utf-8")

    print(f"Urban CSDs with 2+ places: {urban.groupby('CSDUID').filter(lambda g: len(g) > 1)['CSDUID'].nunique()}, "
          f"main place found in {mains}, no name match in {len(unmatched)}")
    print(f"Dropped {len(dropped):,} neighbourhoods -> {len(kept):,} places -> data/interim/places_ca.parquet")
    with pd.option_context("display.width", 200, "display.max_columns", 10):
        print("\nLargest dropped:")
        print(dropped.sort_values("population", ascending=False)[cols].head(25).to_string(index=False))
        print("\nCheck known cases:")
        print(j[j["name"].isin(["Greektown", "Williamsville", "Glen Cairn", "Manotick", "Kanata", "Scarborough",
                                "Dartmouth", "Fort McMurray", "Georgetown", "Simcoe", "Mount Pearl"])][cols].assign(
            dropped=lambda d: d.index.isin(dropped.index)).to_string(index=False))
        print("\nUrban CSDs with several places but no place named after the CSD (left alone):")
        print(pd.DataFrame(unmatched, columns=["CSD", "type", "places", "examples"]).sort_values("places", ascending=False).head(12).to_string(index=False))


if __name__ == "__main__":
    main()
