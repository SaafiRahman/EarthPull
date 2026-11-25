"""Which country and region (ISO 3166-2, e.g. CA-ON, US-TX) each card's point is in.

Uses Natural Earth admin-1 states and provinces (1:10m, public domain) for every country in countries.py,
so it works anywhere; it replaced Statistics Canada boundaries on 2026-11-24.

A point inside a region gets that region. A point just outside every region (a bay, an island too small for
the map, the middle of a big lake) gets the nearest region within MAX_KM. Anything farther is left without
a country and dropped by the caller: it is offshore, or not in any country the pipeline builds.

The country comes from the point, not from Wikidata's "country" (P17): Puerto Rico items often say United
States, and border lakes list both Canada and the US. This also catches wrong-country cards (the
Adirondacks were tagged Quebec) and decides cross-border landmarks by where their point is.
"""
from functools import lru_cache
from pathlib import Path

import geopandas as gpd
import pandas as pd

from countries import COUNTRIES

ROOT = Path(__file__).parent
ADMIN1 = ROOT / "data" / "raw" / "naturalearth" / "ne_10m_admin_1_states_provinces.zip"
MAX_KM = 100  # the centre of Lake Superior is ~80 km from shore
EQUAL_AREA = "ESRI:102008"  # North America Albers equal area, metres


@lru_cache(maxsize=1)
def admin1() -> gpd.GeoDataFrame:
    """Regions of every country in countries.py: country, region (ISO 3166-2), region_name, geometry."""
    a = gpd.read_file(f"zip://{ADMIN1.as_posix()}")
    parts = []
    for c in COUNTRIES.values():
        g = a[a["iso_3166_2"].isin(c.ne)] if c.ne else a[a["iso_a2"] == c.code]
        parts.append(g.assign(country=c.code))
    r = pd.concat(parts, ignore_index=True)
    r = r.assign(region=r["iso_3166_2"], region_name=r["name_en"].fillna(r["name"]), gn=r["gn_a1_code"])
    # Natural Earth gives places with no ISO 3166-2 subdivision a placeholder ("TC-X03~", "AI-X00"): those
    # become one region for the whole country, named after it (code "TC", "Turks and Caicos Islands").
    ph = r["region"].isna() | r["region"].str.contains(r"~|-X\d", regex=True)
    r.loc[ph, "region"] = r.loc[ph, "country"]
    r.loc[ph, "region_name"] = r.loc[ph, "country"].map(lambda c: COUNTRIES[c].name)
    r["geometry"] = r.geometry.make_valid()
    return gpd.GeoDataFrame(r[["country", "region", "region_name", "gn", "geometry"]], crs=a.crs)


def from_geonames(country_code: pd.Series, admin1_code: pd.Series) -> pd.DataFrame:
    """region and region_name from a GeoNames admin1 code ("CA" + "08" -> CA-ON Ontario). Towns use this
    instead of their point: Natural Earth borders are too coarse for towns right on a provincial border
    (it put Pointe-à-la-Croix, Quebec, in New Brunswick). Codes it doesn't know come back empty."""
    m = admin1().drop_duplicates("gn").set_index("gn")[["region", "region_name"]]
    return m.reindex(country_code + "." + admin1_code).set_axis(country_code.index)


def assign(lat: pd.Series, lon: pd.Series) -> pd.DataFrame:
    """country, region, region_name and how it was found ("inside", "nearest", or None) for each point."""
    pts = gpd.GeoDataFrame(index=lat.index, geometry=gpd.points_from_xy(lon, lat), crs="EPSG:4326")
    reg = admin1()
    j = gpd.sjoin(pts, reg, how="left", predicate="within")
    j = j[~j.index.duplicated(keep="first")]
    out = j[["country", "region", "region_name"]].copy()
    out["how"] = out["region"].notna().map({True: "inside", False: None})
    miss = out["region"].isna()
    if miss.any():
        near = gpd.sjoin_nearest(pts.loc[miss].to_crs(EQUAL_AREA), reg.to_crs(EQUAL_AREA), how="left",
                                 max_distance=MAX_KM * 1000, distance_col="km")
        near = near[~near.index.duplicated(keep="first")].dropna(subset=["region"])
        out.loc[near.index, ["country", "region", "region_name"]] = near[["country", "region", "region_name"]]
        out.loc[near.index, "how"] = "nearest"
    return out
