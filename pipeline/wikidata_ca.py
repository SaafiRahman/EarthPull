"""Step 3 (Canada): link towns to Wikidata and Wikipedia, and pull natural landmarks.

Towns: Wikidata stores each place's GeoNames ID (P1566), so towns are joined to their Wikidata
item exactly, by ID. That gives their English/French Wikipedia titles (needed for page views)
and their classes, which flag neighbourhoods without needing per-country boundaries.

Landmarks: Wikidata items in Canada of the classes below that have an English or French
Wikipedia article (the article is also what the fame score needs).

    python pipeline/wikidata_ca.py
Input:  data/interim/geonames_ca.parquet, data/interim/places_ca.parquet
Output: data/interim/towns_wikidata_ca.parquet, data/interim/landmarks_ca.parquet
"""
import hashlib
import json
import time
from pathlib import Path

import geopandas as gpd
import pandas as pd
import requests

from statcan_csd import fetch as fetch_csd
from wikidata_places import category

ROOT = Path(__file__).parent
INTERIM = ROOT / "data" / "interim"
CACHE_FILE = ROOT / "data" / "raw" / "wikidata_bulk_cache.json"
ENDPOINT = "https://query.wikidata.org/sparql"
UA = {"User-Agent": "EarthpullPipeline/0.1 (data pipeline)", "Accept": "application/sparql-results+json"}
COUNTRY = "Q16"  # Canada
WIKIS = {"en": "https://en.wikipedia.org/", "fr": "https://fr.wikipedia.org/"}

# Wikidata class -> card Type hint. Direct "instance of" only (subclass walks time out on lakes).
LANDMARK_CLASSES = {
    "Q8502": "mountain", "Q54050": "hill", "Q8072": "volcano", "Q35666": "glacier",
    "Q23397": "lake", "Q4022": "river", "Q34038": "waterfall", "Q39594": "bay",
    "Q23442": "island", "Q150784": "canyon", "Q46169": "national park",
    # Narrower classes Canadian items use instead of the ones above (found 2026-11-23; Lake Louise
    # in Alberta is a "glacial lake"). Underwater features and former lakes/rivers are left out.
    "Q211302": "lake", "Q131681": "lake", "Q1165822": "lake", "Q3215290": "lake", "Q188025": "lake",
    "Q9019918": "lake", "Q3507951": "lake", "Q7238039": "lake", "Q10671833": "lake", "Q66716634": "lake",
    "Q4366834": "river", "Q573344": "river", "Q2967706": "waterfall", "Q2270442": "waterfall",
    "Q162602": "island", "Q207524": "island", "Q1065592": "island", "Q202199": "island",
    "Q1132248": "glacier", "Q878077": "glacier", "Q46966": "glacier", "Q5474230": "glacier",
    "Q1896949": "national park", "Q46831": "mountain range",
}
PROVINCES = {"10": "Newfoundland and Labrador", "11": "Prince Edward Island", "12": "Nova Scotia",
             "13": "New Brunswick", "24": "Quebec", "35": "Ontario", "46": "Manitoba", "47": "Saskatchewan",
             "48": "Alberta", "59": "British Columbia", "60": "Yukon", "61": "Northwest Territories", "62": "Nunavut"}


def sparql(query: str) -> list[dict]:
    cache = json.loads(CACHE_FILE.read_text(encoding="utf-8")) if CACHE_FILE.exists() else {}
    key = hashlib.sha1(query.encode()).hexdigest()
    if key not in cache:
        for attempt in range(5):
            r = requests.get(ENDPOINT, params={"query": query}, headers=UA, timeout=180)
            if r.status_code in (429, 500, 502, 503, 504):
                time.sleep(int(r.headers.get("Retry-After") or 0) or 10 * (attempt + 1))
                continue
            r.raise_for_status()
            break
        else:
            r.raise_for_status()
        cache[key] = [{k: v["value"] for k, v in b.items()} for b in r.json()["results"]["bindings"]]
        CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
        time.sleep(1)
    return cache[key]


def title(url: str | None) -> str | None:
    from urllib.parse import unquote
    return unquote(url.rsplit("/wiki/", 1)[1]).replace("_", " ") if isinstance(url, str) else None


# ---------- towns ----------

TOWN_QUERY = """
SELECT ?g ?item ?en ?fr (GROUP_CONCAT(DISTINCT ?cl; separator="|") AS ?classes) WHERE {
  VALUES ?g { %s }
  ?item wdt:P1566 ?g .
  OPTIONAL { ?item wdt:P31 ?c . ?c rdfs:label ?cl . FILTER(LANG(?cl) = "en") }
  OPTIONAL { ?en schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  OPTIONAL { ?fr schema:about ?item ; schema:isPartOf <https://fr.wikipedia.org/> }
} GROUP BY ?g ?item ?en ?fr
"""


def town_class(classes: list[str]) -> str:
    cats = {category(c) for c in classes}
    for c in ("municipality", "neighbourhood", "settlement"):
        if c in cats:
            return c
    return "other"


def towns() -> pd.DataFrame:
    g = gpd.read_parquet(INTERIM / "geonames_ca.parquet")
    ids = g["geonameid"].tolist()
    rows = []
    for i in range(0, len(ids), 250):
        rows += sparql(TOWN_QUERY % " ".join(f'"{x}"' for x in ids[i:i + 250]))
    w = pd.DataFrame(rows)
    w["qid"] = w["item"].str.rsplit("/", n=1).str[1]
    w["classes"] = w["classes"].fillna("").str.split("|").map(lambda l: [c for c in l if c])
    w["enwiki"] = w["en"].map(title)
    w["frwiki"] = w["fr"].map(title)
    w["wd_class"] = w["classes"].map(town_class)
    # A GeoNames ID occasionally sits on two items; prefer one with an article, then a municipality.
    rank = {"municipality": 0, "settlement": 1, "other": 2, "neighbourhood": 3}
    w = (w.assign(_a=w["enwiki"].isna() & w["frwiki"].isna(), _r=w["wd_class"].map(rank))
          .sort_values(["g", "_a", "_r"]).drop_duplicates("g"))
    out = g.merge(w[["g", "qid", "enwiki", "frwiki", "wd_class", "classes"]].rename(columns={"g": "geonameid"}),
                  on="geonameid", how="left")
    out["wd_class"] = out["wd_class"].fillna("no item")
    return out


# ---------- landmarks ----------

LANDMARK_QUERY = """
SELECT ?item ?lab_en ?lab_fr ?loc ?article ?elev WHERE {
  ?item wdt:P31 wd:%(cls)s ; wdt:P17 wd:%(country)s ; wdt:P625 ?loc .
  ?article schema:about ?item ; schema:isPartOf <%(wiki)s> .
  OPTIONAL { ?item rdfs:label ?lab_en . FILTER(LANG(?lab_en) = "en") }
  OPTIONAL { ?item rdfs:label ?lab_fr . FILTER(LANG(?lab_fr) = "fr") }
  OPTIONAL { ?item wdt:P2044 ?elev }
}
"""


def landmarks() -> gpd.GeoDataFrame:
    rows = []
    for cls, kind in LANDMARK_CLASSES.items():
        for lang, wiki in WIKIS.items():
            for b in sparql(LANDMARK_QUERY % {"cls": cls, "country": COUNTRY, "wiki": wiki}):
                rows.append({"qid": b["item"].rsplit("/", 1)[1], "kind": kind, "lang": lang,
                             "article": title(b["article"]), "name_en": b.get("lab_en"), "name_fr": b.get("lab_fr"),
                             "loc": b["loc"], "elev": float(b["elev"]) if "elev" in b else None})
    df = pd.DataFrame(rows)
    df = df[df["loc"].str.startswith("Point(")]  # skip coordinates on other globes
    df[["lon", "lat"]] = df["loc"].str.extract(r"Point\(([-\d.eE]+) ([-\d.eE]+)\)").astype(float)
    agg = df.groupby("qid").agg(
        name_en=("name_en", "first"), name_fr=("name_fr", "first"),
        kind=("kind", lambda s: ", ".join(sorted(set(s)))),
        enwiki=("article", lambda s: next((a for a, l in zip(s, df.loc[s.index, "lang"]) if l == "en"), None)),
        frwiki=("article", lambda s: next((a for a, l in zip(s, df.loc[s.index, "lang"]) if l == "fr"), None)),
        lat=("lat", "first"), lon=("lon", "first"), elevation_m=("elev", "max")).reset_index()
    agg["name"] = agg["name_en"].fillna(agg["name_fr"])
    gdf = gpd.GeoDataFrame(agg, geometry=gpd.points_from_xy(agg["lon"], agg["lat"]), crs="EPSG:4326")
    csd = fetch_csd()[["PRUID", "geometry"]]
    gdf = gpd.sjoin(gdf, csd, how="left", predicate="within").drop(columns="index_right")
    gdf = gdf[~gdf.index.duplicated(keep="first")]
    # Coastal bays, islands and the Great Lakes fall outside the land boundaries: use the nearest one.
    miss = gdf["PRUID"].isna()
    if miss.any():
        near = gpd.sjoin_nearest(gdf.loc[miss, ["geometry"]].to_crs(3347), csd.to_crs(3347), how="left")
        gdf.loc[miss, "PRUID"] = near[~near.index.duplicated(keep="first")]["PRUID"]
    gdf["province"] = gdf["PRUID"].map(PROVINCES)
    return gdf.drop(columns=["PRUID"])


def main():
    t = towns()
    t.to_parquet(INTERIM / "towns_wikidata_ca.parquet")
    print(f"\nTowns: {len(t):,} GeoNames places; Wikidata class:", t["wd_class"].value_counts().to_dict())
    print("  with English article:", t["enwiki"].notna().sum(), "| French only:", (t["enwiki"].isna() & t["frwiki"].notna()).sum(),
          "| no article:", (t["enwiki"].isna() & t["frwiki"].isna()).sum())

    # Compare with step 2 (boundaries + name match): does the ID join find the same neighbourhoods?
    kept = set(gpd.read_parquet(INTERIM / "places_ca.parquet")["geonameid"])
    t["step2"] = t["geonameid"].map(lambda g: "kept" if g in kept else "dropped")
    print("\nStep 2 verdict vs Wikidata class (by GeoNames ID):")
    print(pd.crosstab(t["wd_class"], t["step2"]).to_string())
    hood_kept = t[(t["wd_class"] == "neighbourhood") & (t["step2"] == "kept")]
    print(f"\nWikidata says neighbourhood but step 2 kept ({len(hood_kept)}):",
          ", ".join(hood_kept.sort_values("population", ascending=False)["name"].head(30)))

    print("\nLandmarks:")
    lm = landmarks()
    lm.to_parquet(INTERIM / "landmarks_ca.parquet")
    print(f"{len(lm):,} landmarks -> data/interim/landmarks_ca.parquet")
    print("By kind:", lm["kind"].value_counts().head(15).to_dict())
    print("English article:", lm["enwiki"].notna().sum(), "| French only:", (lm["enwiki"].isna()).sum(),
          "| no province:", lm["province"].isna().sum())
    with pd.option_context("display.width", 200, "display.max_columns", 10):
        print(lm.sample(15, random_state=2)[["name", "kind", "province", "elevation_m", "enwiki"]].to_string(index=False))


if __name__ == "__main__":
    main()
