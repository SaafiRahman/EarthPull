"""Step 6: real facts for every card (developer, 2026-11-23: facts instead of 1-100 stats).

Facts collected (each may be empty when no source has it):
  population      towns: Wikidata P1082, the statement with the latest date (P585); else GeoNames (step 1).
                  Towns linked through their municipality (towns.py admin twins) keep GeoNames, since the
                  item's population is the whole municipality's. Developer, 2026-11-26: GeoNames was older
                  than Wikipedia's census figure (Royal City 2,220 vs 1,776).
  elevation_m     Wikidata P2044 or GeoNames; else terrain height at the point (Open-Meteo elevation API)
  height_m        Wikidata P2048 (buildings, towers, waterfalls)
  prominence_m    Wikidata P2660 (mountains)
  area_km2        Wikidata P2046 (lakes, islands, parks, glaciers)
  length_km       Wikidata P2043 (rivers, bridges, canals)
  temp_c          average yearly temperature, 1970-2000, WorldClim 2.1 (10 arc-minute grid) at the point
  fame            Wikipedia views, median month x 12 (step 4)
Which facts a card shows is decided at export.

    python pipeline/facts.py --country CA
Input:  data/interim/<CC>/rarity.parquet, pipeline/fact_fixes.csv, data/raw/worldclim/wc2.1_10m_bio_1.tif
        (from https://geodata.ucdavis.edu/climate/worldclim/2_1/base/wc2.1_10m_bio.zip)
Output: data/interim/<CC>/cards.parquet
Answers are cached in data/raw/facts_cache.json.
"""
import argparse
import json
import time
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
import requests

from countries import get as country, interim

ROOT = Path(__file__).parent
INTERIM = ROOT / "data" / "interim"
RAW = ROOT / "data" / "raw"
CACHE = RAW / "facts_cache.json"
TIF = RAW / "worldclim" / "wc2.1_10m_bio_1.tif"
UA = {"User-Agent": "PullThePlanetPipeline/0.1 (https://github.com/SaafiRahman/EarthPull)"}

E = "http://www.wikidata.org/entity/"
# Units Wikidata uses, converted to the fact's unit. Anything else is skipped rather than guessed.
TO_M = {E + "Q11573": 1, E + "Q3710": 0.3048, E + "Q828224": 1000, E + "Q174728": 0.01}
TO_KM = {E + "Q828224": 1, E + "Q11573": 0.001, E + "Q253276": 1.609344, E + "Q3710": 0.0003048, E + "Q174728": 1e-5}
TO_KM2 = {E + "Q712226": 1, E + "Q35852": 0.01, E + "Q25343": 1e-6, E + "Q81292": 0.00404686, E + "Q232291": 2.589988,
          E + "Q857027": 9.2903e-8}
PROPS = {"P2044": ("elevation_wd", TO_M), "P2048": ("height_m", TO_M), "P2660": ("prominence_m", TO_M),
         "P2046": ("area_km2", TO_KM2), "P2043": ("length_km", TO_KM)}

session = requests.Session()
session.headers.update(UA)


class OutOfQuota(Exception):
    """The service's hourly or daily allowance is used up; waiting minutes won't help."""


def get(url: str, **kw) -> dict:
    method = kw.pop("method", "GET")
    for attempt in range(6):
        try:
            r = session.request(method, url, timeout=60, **kw)
        except (requests.ConnectionError, requests.Timeout):  # dropped or slow answer: wait and retry
            time.sleep(30 * (attempt + 1))
            continue
        if r.status_code == 429 and any(w in r.text for w in ("Hourly", "Daily")):
            raise OutOfQuota(r.json().get("reason", r.text[:200]))
        if r.status_code in (429, 500, 502, 503, 504):
            # Cap the wait: on 2026-11-25 the run sat silent for 7 hours on one server-requested wait.
            wait = min(300, int(float(r.headers.get("Retry-After") or 0)) or 2 ** attempt)
            print(f"  {r.status_code} from {url.split('/')[2]}; waiting {wait} s", flush=True)
            time.sleep(wait)
            continue
        r.raise_for_status()
        return r.json()
    raise RuntimeError(f"gave up on {url}")


def pick(statements: list, conv: dict):
    """Preferred statement if any, else the first normal one; None for unknown units or no value."""
    ok = [s for s in statements if s.get("rank") != "deprecated" and s["mainsnak"].get("datavalue")]
    ok.sort(key=lambda s: s.get("rank") != "preferred")
    for s in ok:
        v = s["mainsnak"]["datavalue"]["value"]
        if v.get("unit") in conv:
            return float(v["amount"]) * conv[v["unit"]]
    return None


def latest_population(statements: list):
    """(population, year) from the P1082 statement with the latest point in time; preferred rank breaks ties."""
    best = None
    for st in statements:
        v = st["mainsnak"].get("datavalue")
        if st.get("rank") == "deprecated" or not v:
            continue
        when = st.get("qualifiers", {}).get("P585", [{}])[0].get("datavalue", {}).get("value", {}).get("time", "")
        key = (when[1:5] if when else "0000", st.get("rank") == "preferred")
        if best is None or key > best[0]:
            best = (key, float(v["value"]["amount"]))
    return (best[1], int(best[0][0]) or None) if best else (None, None)


def wikidata_population(qids: list[str], cache: dict) -> dict[str, tuple]:
    todo = [q for q in qids if f"p|{q}" not in cache]
    for i in range(0, len(todo), 50):
        ents = get("https://www.wikidata.org/w/api.php", method="POST",
                   data={"action": "wbgetentities", "ids": "|".join(todo[i:i + 50]), "props": "claims", "format": "json"})["entities"]
        for q, e in ents.items():
            cache[f"p|{q}"] = latest_population(e.get("claims", {}).get("P1082", []))
        if i % 2500 == 0:
            print(f"  Wikidata population {i + 50:,}/{len(todo):,}", flush=True)
            CACHE.write_text(json.dumps(cache), encoding="utf-8")
    CACHE.write_text(json.dumps(cache), encoding="utf-8")
    return {q: tuple(cache[f"p|{q}"]) for q in qids}


def wikidata_facts(qids: list[str], cache: dict) -> pd.DataFrame:
    todo = [q for q in qids if f"f|{q}" not in cache]
    for i in range(0, len(todo), 50):
        ents = get("https://www.wikidata.org/w/api.php", method="POST",
                   data={"action": "wbgetentities", "ids": "|".join(todo[i:i + 50]), "props": "claims", "format": "json"})["entities"]
        for q, e in ents.items():
            c = e.get("claims", {})
            cache[f"f|{q}"] = {col: pick(c.get(p, []), conv) for p, (col, conv) in PROPS.items()}
        if i % 2500 == 0:
            print(f"  Wikidata {i + 50:,}/{len(todo):,}", flush=True)
            CACHE.write_text(json.dumps(cache), encoding="utf-8")
    CACHE.write_text(json.dumps(cache), encoding="utf-8")
    return pd.DataFrame([{"qid": q, **cache[f"f|{q}"]} for q in qids])


def terrain_height(points: list[tuple[float, float]], cache: dict) -> list[float]:
    """Open-Meteo elevation API (Copernicus 90 m DEM), 100 points per request."""
    key = [f"e|{lat:.4f},{lon:.4f}" for lat, lon in points]
    todo = sorted({k for k in key if k not in cache})
    for i in range(0, len(todo), 100):
        batch = todo[i:i + 100]
        lat = ",".join(k[2:].split(",")[0] for k in batch)
        lon = ",".join(k[2:].split(",")[1] for k in batch)
        try:
            got = get("https://api.open-meteo.com/v1/elevation", params={"latitude": lat, "longitude": lon})["elevation"]
        except OutOfQuota as e:
            # Open-Meteo's free tier allows ~5,000 points an hour and ~10,000 a day (the US needs 31,000). Leave the
            # rest without a terrain height; a rerun fills them in from where the cache stopped.
            print(f"  Open-Meteo: {e} -> {len(todo) - i:,} points left without terrain height for now", flush=True)
            break
        for k, v in zip(batch, got):
            cache[k] = v
        CACHE.write_text(json.dumps(cache), encoding="utf-8")  # save each batch so a stopped run resumes
        print(f"  terrain {i + len(batch):,}/{len(todo):,}", flush=True)
        time.sleep(0.5)
    CACHE.write_text(json.dumps(cache), encoding="utf-8")
    return [cache.get(k) for k in key]


def temperature(lat: pd.Series, lon: pd.Series) -> np.ndarray:
    """Sample the WorldClim grid. Points in the sea or on a tiny island fall on empty cells: use the mean of
    the land cells around them (up to ~5 cells, about 90 km)."""
    with rasterio.open(TIF) as src:
        grid = src.read(1, masked=True)
        rows, cols = rasterio.transform.rowcol(src.transform, lon.to_numpy(), lat.to_numpy())
    out = []
    for r, c in zip(rows, cols):
        v = np.nan
        for k in range(0, 6):
            win = grid[max(r - k, 0):r + k + 1, max(c - k, 0):c + k + 1]
            if win.count():
                v = float(win.mean())
                break
        out.append(v)
    return np.array(out)


HEIGHT_KINDS = r"waterfall|tower|building|skyscraper|bridge|dam|lighthouse|church|cathedral|basilica|monument|statue|arena|stadium|hotel"


def clear_bad(df: pd.DataFrame):
    """Blank facts that can't be right, so a card shows nothing rather than nonsense (developer, 2026-11-23:
    fix bad data automatically). Limits are loose: the highest point in North America is Denali (6,190 m)."""
    kind = df["kind"].fillna("")
    rules = {
        "elevation_m": ~df["elevation_m"].between(-100, 6200),
        "height_m": ~df["height_m"].between(0.5, 1000) | ~((df["type"] == "built") | kind.str.contains(HEIGHT_KINDS)),
        "prominence_m": ~df["prominence_m"].between(1, 9000) | (df["prominence_m"] > df["elevation_m"] + 1)
                        | ~kind.str.contains("mountain|peak|volcano|hill"),
        "length_km": ~df["length_km"].between(0.001, 7000),
        "area_km2": ~df["area_km2"].between(1e-6, 600_000),
    }
    for col, bad in rules.items():
        bad = bad & df[col].notna()
        if bad.any():
            print(f"  cleared {int(bad.sum())} {col}: " + ", ".join(f"{n} ({v:,.0f})" for n, v in
                                                            zip(df.loc[bad, "name"].head(8), df.loc[bad, col].head(8))))
        df.loc[bad, col] = np.nan


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--country", required=True)
    d = interim(country(ap.parse_args().country).code)
    df = pd.read_parquet(d / "rarity.parquet")
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}

    wd = wikidata_facts(sorted(df["qid"].dropna().unique()), cache)
    df = df.merge(wd, on="qid", how="left")
    # Small countries can have a fact that is empty on every card, which pandas keeps as None objects and then
    # can't compare or sort (Belize, Saint Lucia, 2026-11-25): make every fact a number column.
    for col in [c for c in df.columns if c.endswith(("_m", "_km", "_km2", "_wd"))]:
        df[col] = pd.to_numeric(df[col], errors="coerce").astype("float64")
    # Elevation: towns keep GeoNames; landmarks prefer Wikidata's unit-converted value, because step 3 took
    # P2044 without its unit and some peaks came through in feet (Mount Root "12,887 m").
    town = df["type"] == "town"
    elev = df["elevation_m"].astype("Float64")
    df["elevation_m"] = elev.where(town, df["elevation_wd"].astype("Float64").fillna(elev))
    df["elevation_source"] = np.where(town, "geonames", np.where(df["elevation_wd"].notna(), "wikidata", "step 3"))
    df["elevation_source"] = df["elevation_source"].where(df["elevation_m"].notna(), None)
    # Population: Wikidata's latest figure for towns linked to their own item (see the docstring).
    twin = df["id"].str.removeprefix("gn:").map(gpd.read_parquet(d / "towns.parquet").set_index("geonameid")["via_twin"])
    own = town & df["qid"].notna() & (twin != True)
    pop = wikidata_population(sorted(df.loc[own, "qid"].unique()), cache)
    wd_pop = df["qid"].map(lambda q: pop.get(q, (None, None))[0]).where(own)
    # More than 4x off GeoNames is almost always a wrong figure on the item, not growth (2026-11-26: Veracruz city
    # had the state's 8.1 million; the hamlet of Brookhaven NY its town's 486,000). Keep GeoNames then.
    gn = df["population"].where(df["population"] > 0)
    wd_pop = wd_pop.where(gn.isna() | ((wd_pop / gn).between(0.25, 4)))
    df["population_source"] = np.where(wd_pop.notna(), "wikidata", np.where(town & df["population"].notna(), "geonames", None))
    df["population"] = wd_pop.fillna(df["population"]).where(town)
    print(f"Population from Wikidata for {int(wd_pop.notna().sum()):,} of {int(town.sum()):,} towns")
    clear_bad(df)
    miss = df["elevation_m"].isna()
    print(f"Terrain height for {int(miss.sum()):,} cards without an elevation")
    df.loc[miss, "elevation_m"] = terrain_height(list(zip(df.loc[miss, "lat"], df.loc[miss, "lon"])), cache)
    df.loc[miss & df["elevation_m"].notna(), "elevation_source"] = "terrain"
    # Hand fixes for facts the sources get wrong (pipeline/fact_fixes.csv); an empty value blanks the fact.
    for f in pd.read_csv(ROOT / "fact_fixes.csv", comment="#").itertuples():
        df.loc[df["id"] == f.id, f.column] = f.value
    df["temp_c"] = temperature(df["lat"], df["lon"]).round(1)
    df = df.drop(columns=["elevation_wd"])
    df.to_parquet(d / "cards.parquet")

    facts = ["population", "elevation_m", "height_m", "prominence_m", "area_km2", "length_km", "temp_c"]
    print(f"\n{len(df):,} cards -> {(d / 'cards.parquet').relative_to(ROOT).as_posix()}")
    print("Share of cards with each fact, by type (%):")
    print((df.groupby("type")[facts].agg(lambda s: s.notna().mean() * 100)).round(0).to_string())
    big = df[df["kind"].isin(["lake", "river", "mountain", "island", "waterfall", "skyscraper", "bridge"])]
    print("\nBy kind (%):")
    print((big.groupby("kind")[facts].agg(lambda s: s.notna().mean() * 100)).round(0).to_string())
    pd.set_option("display.width", 220)
    print("\nExamples:")
    ex = ["Toronto", "Mount Robson", "CN Tower", "Lake Superior", "Fraser River", "Niagara Falls", "Iqaluit",
          "Confederation Bridge", "Baffin Island", "Mount Logan", "New York City", "Denali", "Grand Canyon",
          "Mexico City", "Popocatépetl", "Statue of Liberty", "Golden Gate Bridge", "Mississippi River"]
    ex_rows = df[df["name"].isin(ex)].sort_values("fame", ascending=False).drop_duplicates("name")  # most famous of same-name cards
    print(ex_rows[["name", "type", "rarity"] + facts].to_string(index=False))
    print("Elevation source:", df["elevation_source"].value_counts().to_dict())
    print("\nOutliers: hottest", df.nlargest(3, "temp_c")[["name", "temp_c"]].values.tolist(),
          "| coldest", df.nsmallest(3, "temp_c")[["name", "temp_c"]].values.tolist(),
          "| tallest", df.nlargest(3, "height_m")[["name", "height_m"]].values.tolist(),
          "| biggest", df.nlargest(3, "area_km2")[["name", "area_km2"]].values.tolist(),
          "| no temperature", int(df["temp_c"].isna().sum()))


if __name__ == "__main__":
    main()
