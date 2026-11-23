"""Step 3b (Canada): built landmarks (towers, buildings, bridges, castles, forts, stadiums...).

Any Wikidata item in Canada whose class is a kind of "architectural structure" (Q811430), with
articles in at least MIN_SITELINKS Wikipedia languages (a fame floor; built landmarks are meant
to be high-rarity cards). Infrastructure and sensitive sites are excluded by class name.

Uses QLever (qlever.cs.uni-freiburg.de), a public SPARQL engine over the same Wikidata data:
the subclass walk over ~20,000 structure classes times out on query.wikidata.org.

    python pipeline/structures_ca.py
Output: data/interim/structures_ca.parquet (+ structures_excluded_ca.csv for review)
"""
import hashlib
import json
import re
import time
from pathlib import Path
from urllib.parse import unquote

import geopandas as gpd
import pandas as pd
import requests

from statcan_csd import fetch as fetch_csd
from wikidata_ca import PROVINCES

ROOT = Path(__file__).parent
INTERIM = ROOT / "data" / "interim"
CACHE_FILE = ROOT / "data" / "raw" / "qlever_cache.json"
ENDPOINT = "https://qlever.cs.uni-freiburg.de/api/wikidata"
UA = {"User-Agent": "EarthpullPipeline/0.1 (data pipeline)", "Accept": "application/sparql-results+json"}
MIN_SITELINKS = 3

# Excluded if ANY of an item's class labels contains one of these words.
EXCLUDE = {
    "infrastructure": ["airport", "aerodrome", "airfield", "heliport", "seaplane base", "road", "street", "highway",
                       "route", "station", "railway", "interchange", "parking", "power station", "substation",
                       "pipeline", "transmission line", "rail yard", "ferry", "tunnel"],
    "organisation, not a place": ["business", "company", "enterprise", "chain", "brand", "organization",
                                  "organisation", "university", "college", "school", "library"],
    "military": ["forces base", "military base", "air base", "naval base", "radar station", "command"],
    # Memorials are allowed as cards (developer, 2026-11-23); burial sites stay out.
    "sensitive (roadmap: exclude)": ["cemetery", "grave", "tomb", "mausoleum", "prison", "penitentiary",
                                     "jail", "correctional", "residential school", "hospital"],
    "too generic or not visitable": ["mine", "landfill", "sewage", "water treatment", "office building",
                                     "apartment building", "residential building", "condominium", "factory",
                                     "generating station", "nuclear", "police", "border crossing", "trail",
                                     "movie theater", "cinema"],
    "already a lake card": ["reservoir"],
}
# Landmark types kept even when another class matches EXCLUDE ("road bridge", "library building").
# Sensitive sites are never rescued.
ALWAYS_KEEP = ["bridge", "tower", "lighthouse", "castle", "fort", "cathedral", "basilica", "church", "stadium",
               "arena", "palace", "skyscraper", "library building", "observation"]
# Generic buildings (apartments, offices) are kept only when this famous: Habitat 67 has 26.
FAMOUS_SITELINKS = 15
FAMOUS_BUILDING_TYPES = ["office building", "apartment building", "residential building", "condominium"]

QUERY = """
PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wikibase: <http://wikiba.se/ontology#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <http://schema.org/>
SELECT ?i ?en_label ?fr_label ?sl ?loc ?en ?fr (GROUP_CONCAT(DISTINCT ?cl; separator="|") AS ?classes) WHERE {
  ?i wdt:P17 wd:Q16 ; wikibase:sitelinks ?sl ; wdt:P625 ?loc .
  FILTER(?sl >= %(min)d)
  ?i wdt:P31/wdt:P279* wd:Q811430 .
  OPTIONAL { ?i rdfs:label ?en_label FILTER(LANG(?en_label) = "en") }
  OPTIONAL { ?i rdfs:label ?fr_label FILTER(LANG(?fr_label) = "fr") }
  OPTIONAL { ?en schema:about ?i ; schema:isPartOf <https://en.wikipedia.org/> }
  OPTIONAL { ?fr schema:about ?i ; schema:isPartOf <https://fr.wikipedia.org/> }
  OPTIONAL { ?i wdt:P31 ?c . ?c rdfs:label ?cl FILTER(LANG(?cl) = "en") }
} GROUP BY ?i ?en_label ?fr_label ?sl ?loc ?en ?fr
"""


def qlever(query: str) -> list[dict]:
    cache = json.loads(CACHE_FILE.read_text(encoding="utf-8")) if CACHE_FILE.exists() else {}
    key = hashlib.sha1(query.encode()).hexdigest()
    if key not in cache:
        for attempt in range(4):
            r = requests.post(ENDPOINT, data={"query": query}, headers=UA, timeout=300)
            if r.status_code in (429, 500, 502, 503, 504):
                time.sleep(10 * (attempt + 1))
                continue
            r.raise_for_status()
            break
        else:
            r.raise_for_status()
        cache[key] = [{k: v["value"] for k, v in b.items()} for b in r.json()["results"]["bindings"]]
        CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    return cache[key]


def _match(classes, words):
    return next((c for c in classes if any(re.search(rf"\b{re.escape(w)}", c.lower()) for w in words)), None)


def exclusion(classes: list[str], sitelinks: int) -> str | None:
    sensitive = _match(classes, EXCLUDE["sensitive (roadmap: exclude)"])
    if sensitive:
        return f"sensitive (roadmap: exclude): {sensitive}"
    if _match(classes, ALWAYS_KEEP):
        return None
    if (sitelinks >= FAMOUS_SITELINKS and _match(classes, FAMOUS_BUILDING_TYPES)
            and not _match(classes, EXCLUDE["infrastructure"])):
        return None
    for reason, words in EXCLUDE.items():
        for c in classes:
            if any(re.search(rf"\b{re.escape(w)}", c.lower()) for w in words):
                return f"{reason}: {c}"
    return None


def title(url):
    return unquote(url.rsplit("/wiki/", 1)[1]).replace("_", " ") if isinstance(url, str) else None


def main():
    df = pd.DataFrame(qlever(QUERY % {"min": MIN_SITELINKS}))
    df["qid"] = df["i"].str.rsplit("/", n=1).str[1]
    df["sitelinks"] = df["sl"].astype(int)
    df["classes"] = df["classes"].fillna("").str.split("|").map(lambda l: sorted({c for c in l if c}))
    df["enwiki"], df["frwiki"] = df["en"].map(title), df["fr"].map(title)
    df["name"] = df["en_label"].fillna(df["fr_label"])
    df = df[df["loc"].str.upper().str.startswith("POINT(")]  # QLever writes POINT, WDQS writes Point
    df[["lon", "lat"]] = df["loc"].str.extract(r"(?i)Point\(([-\d.eE]+) ([-\d.eE]+)\)").astype(float)
    # Several coordinates or labels give repeated rows: keep one per item.
    df = df.sort_values("sitelinks", ascending=False).drop_duplicates("qid")
    df = df[df["enwiki"].notna() | df["frwiki"].notna()]
    df["excluded"] = [exclusion(c, s) for c, s in zip(df["classes"], df["sitelinks"])]

    out = df[df["excluded"].isna()].copy()
    out["kind"] = out["classes"].map(lambda l: ", ".join(l[:3]))
    gdf = gpd.GeoDataFrame(out[["qid", "name", "kind", "classes", "sitelinks", "enwiki", "frwiki", "lat", "lon"]],
                           geometry=gpd.points_from_xy(out["lon"], out["lat"]), crs="EPSG:4326")
    csd = fetch_csd()[["PRUID", "geometry"]]
    gdf = gpd.sjoin(gdf, csd, how="left", predicate="within").drop(columns="index_right")
    gdf = gdf[~gdf.index.duplicated(keep="first")]
    miss = gdf["PRUID"].isna()
    if miss.any():
        near = gpd.sjoin_nearest(gdf.loc[miss, ["geometry"]].to_crs(3347), csd.to_crs(3347), how="left")
        gdf.loc[miss, "PRUID"] = near[~near.index.duplicated(keep="first")]["PRUID"]
    gdf["province"] = gdf["PRUID"].map(PROVINCES)
    gdf = gdf.drop(columns="PRUID").reset_index(drop=True)
    gdf.to_parquet(INTERIM / "structures_ca.parquet")
    excl = df[df["excluded"].notna()]
    excl[["qid", "name", "sitelinks", "excluded"]].to_csv(INTERIM / "structures_excluded_ca.csv", index=False, encoding="utf-8")

    print(f"{len(df):,} structures with {MIN_SITELINKS}+ sitelinks and an en/fr article; "
          f"excluded {len(excl):,}; kept {len(gdf):,} -> data/interim/structures_ca.parquet")
    print("Excluded by reason:", excl["excluded"].str.split(":").str[0].value_counts().to_dict())
    print("\nTop 40 kept:", ", ".join(f"{n} ({s})" for n, s in gdf.nlargest(40, "sitelinks")[["name", "sitelinks"]].values))
    print("\nMost common classes kept:", pd.Series([c for l in gdf["classes"] for c in l]).value_counts().head(25).to_dict())
    print("\nRandom sample of 25 kept:", ", ".join(gdf.sample(25, random_state=3)["name"]))
    check = ["CN Tower", "Château Frontenac", "Confederation Bridge", "Casa Loma", "Habitat 67", "Lions Gate Bridge",
             "Calgary Tower", "Peggy's Point Lighthouse", "Fortress of Louisbourg", "Notre-Dame Basilica",
             "Olympic Stadium", "Centre Block", "Banff Springs Hotel", "Rogers Centre", "National War Memorial"]
    names = set(gdf["name"])
    print("\nFamous check:", " | ".join(("yes " if n in names else "NO ") + n for n in check))


if __name__ == "__main__":
    main()
