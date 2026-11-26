"""Step 1 of the data pipeline: download GeoNames cities1000, filter to one country, clean it.

    python pipeline/geonames.py --country CA
    python pipeline/geonames.py --country US --sample 20

Outputs data/interim/<CC>/geonames.parquet (GeoParquet, EPSG:4326) with each place's region (ISO 3166-2,
from its GeoNames admin1 code; see regions.py) and prints a cleaning report plus a random sample.
Downloads are cached in data/raw/.
"""
import argparse
import io
import math
import zipfile
from pathlib import Path

import geopandas as gpd
import pandas as pd
import requests

import regions
from countries import get, interim

ROOT = Path(__file__).parent
RAW = ROOT / "data" / "raw"
INTERIM = ROOT / "data" / "interim"
BASE = "https://download.geonames.org/export/dump/"
UA = {"User-Agent": "PullThePlanetPipeline/0.1 (https://github.com/SaafiRahman/EarthPull)"}

# https://download.geonames.org/export/dump/readme.txt, "geoname" table
COLUMNS = ["geonameid", "name", "asciiname", "alternatenames", "latitude", "longitude", "feature_class",
           "feature_code", "country_code", "cc2", "admin1_code", "admin2_code", "admin3_code", "admin4_code",
           "population", "elevation", "dem", "timezone", "modification_date"]

# Populated-place codes that are not a place a player would recognise as a town:
# PPLX section of a populated place (neighbourhood), PPLH historical, PPLQ abandoned,
# PPLW destroyed, PPLCH historical capital.
DROP_CODES = {"PPLX", "PPLH", "PPLQ", "PPLW", "PPLCH"}
DEDUPE_KM = 5  # same name, same province, closer than this = one place


def download(name: str) -> Path:
    RAW.mkdir(parents=True, exist_ok=True)
    path = RAW / name
    if not path.exists():
        print(f"Downloading {BASE}{name}")
        r = requests.get(BASE + name, headers=UA, timeout=120)
        r.raise_for_status()
        path.write_bytes(r.content)
    return path


def load_cities() -> pd.DataFrame:
    with zipfile.ZipFile(download("cities1000.zip")) as z:
        raw = z.read("cities1000.txt")
    return pd.read_csv(io.BytesIO(raw), sep="\t", header=None, names=COLUMNS, dtype=str,
                       keep_default_na=False, quoting=3, encoding="utf-8")


def load_admin1() -> pd.DataFrame:
    a = pd.read_csv(download("admin1CodesASCII.txt"), sep="\t", header=None, dtype=str,
                    names=["code", "province", "province_ascii", "province_geonameid"],
                    keep_default_na=False, quoting=3, encoding="utf-8")
    a[["country_code", "admin1_code"]] = a["code"].str.split(".", n=1, expand=True)
    return a[["country_code", "admin1_code", "province"]]


def haversine_km(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = (math.sin((lat2 - lat1) * p / 2) ** 2
         + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2)
    return 12742 * math.asin(math.sqrt(a))


def dedupe(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Within each (name, province), keep the most populous entry and drop any other
    entry closer than DEDUPE_KM to a kept one. Same-name towns far apart both stay."""
    df = df.sort_values("population", ascending=False)
    keep, dropped = [], []
    for _, g in df.groupby(["name_key", "admin1_code"], sort=False):
        kept = []
        for idx, row in g.iterrows():
            if any(haversine_km(row.latitude, row.longitude, k.latitude, k.longitude) < DEDUPE_KM for k in kept):
                dropped.append(idx)
            else:
                kept.append(row)
                keep.append(idx)
    return df.loc[keep], df.loc[dropped]


def clean(df: pd.DataFrame, country: str) -> gpd.GeoDataFrame:
    report = [("GeoNames cities1000, worldwide", len(df))]
    df = df[df["country_code"] == country].copy()
    report.append((f"Country = {country}", len(df)))

    df = df[~df["feature_code"].isin(DROP_CODES)]
    report.append(("Drop neighbourhoods, historical, abandoned, destroyed (" + ", ".join(sorted(DROP_CODES)) + ")", len(df)))

    # Types and text clean-up. alternatenames is dropped: it's the main source of noise
    # (hundreds of transliterations per big city) and isn't needed for cards.
    for col in ("name", "asciiname"):
        df[col] = df[col].str.strip().str.replace(r"\s+", " ", regex=True)
    df["latitude"] = df["latitude"].astype(float)
    df["longitude"] = df["longitude"].astype(float)
    df["population"] = pd.to_numeric(df["population"], errors="coerce").fillna(0).astype(int)
    df["elevation"] = pd.to_numeric(df["elevation"], errors="coerce").astype("Int64")  # often blank
    df["dem"] = pd.to_numeric(df["dem"], errors="coerce").astype("Int64")  # terrain model, always set
    df.loc[df["dem"] < -1000, "dem"] = pd.NA  # GeoNames uses -9999 for "no data"

    df = df[df["name"] != ""]
    df = df.drop_duplicates("geonameid")
    report.append(("Drop blank names and repeated IDs", len(df)))

    df = df[df["population"] > 0]  # municipality seats GeoNames lists with no population (decided 2026-11-23)
    report.append(("Drop population 0", len(df)))

    df["name_key"] = df["asciiname"].str.lower().str.replace(r"[^a-z0-9]", "", regex=True)
    df, dupes = dedupe(df)
    report.append((f"Drop same name + province within {DEDUPE_KM} km (keep most populous)", len(df)))

    df = df.merge(load_admin1(), on=["country_code", "admin1_code"], how="left").reset_index(drop=True)
    df[["region", "region_name"]] = regions.from_geonames(df["country_code"], df["admin1_code"])
    miss = df["region"].isna()  # admin1 codes Natural Earth doesn't list: use the point
    if miss.any():
        by_point = regions.assign(df.loc[miss, "latitude"], df.loc[miss, "longitude"])
        df.loc[miss, ["region", "region_name"]] = by_point[["region", "region_name"]].to_numpy()
    df["province"] = df["region_name"]  # older steps read "province"
    df["country"] = country
    gdf = gpd.GeoDataFrame(
        df[["geonameid", "name", "asciiname", "country", "region", "region_name", "province", "admin1_code",
            "feature_code", "population",
            "elevation", "dem", "latitude", "longitude", "timezone", "modification_date"]],
        geometry=gpd.points_from_xy(df["longitude"], df["latitude"]), crs="EPSG:4326",
    ).sort_values("population", ascending=False).reset_index(drop=True)

    print("\nCleaning report")
    for step, n in report:
        print(f"  {n:>7,}  {step}")
    if len(dupes):
        print("\nExamples of dropped duplicates:")
        print(dupes[["name", "admin1_code", "feature_code", "population", "latitude", "longitude"]].head(8).to_string(index=False))
    return gdf


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--country", required=True)
    ap.add_argument("--sample", type=int, default=20)
    args = ap.parse_args()

    cc = get(args.country).code
    gdf = clean(load_cities(), cc)
    out = interim(cc) / "geonames.parquet"
    gdf.to_parquet(out)

    print(f"\n{len(gdf):,} places -> {out.relative_to(ROOT)}")
    print("By region:", gdf["region"].value_counts().to_dict())
    print("Missing: region", gdf["region"].isna().sum(), "| elevation", gdf["elevation"].isna().sum(),
          "| dem", gdf["dem"].isna().sum(), "| population 0:", (gdf["population"] == 0).sum())
    print(f"\nRandom sample of {args.sample}:")
    cols = ["geonameid", "name", "region", "feature_code", "population", "elevation", "dem", "latitude", "longitude"]
    with pd.option_context("display.width", 200, "display.max_columns", 20):
        print(gdf.sample(min(args.sample, len(gdf)), random_state=1)[cols].to_string(index=False))


if __name__ == "__main__":
    main()
