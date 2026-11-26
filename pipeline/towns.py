"""Step 2: link each town to its Wikidata item and Wikipedia articles, and drop city neighbourhoods.

Wikidata stores each place's GeoNames ID (P1566), so towns join to their item exactly, by ID.

Neighbourhoods: a town is a candidate when it lies within NEAR_KM of a town at least BIGGER times its
population (and at least MIN_BIG people), the way a neighbourhood sits next to its city. For candidates,
Wikidata decides, from the town's own item plus items with the same name nearby (wikidata_places):
kept if anything calls it a municipality (or former one), or a settlement with a Wikipedia article;
dropped if it is a neighbourhood, borough or suburb. When Wikidata knows nothing useful, it is dropped only
if it is inside a real city (within CITY_KM of a place with CITY_POP+ people); small villages near a
bigger town stay (Mount Brydges, Baden). Places not near a bigger town are always kept.
This replaced the Statistics Canada boundary rule on 2026-11-24: it needs no boundaries, so it works in
any country. Neither signal alone was enough on Canada: Wikidata alone missed Montreal's boroughs (no
GeoNames link) and dropped real villages (Uxbridge).

    python pipeline/towns.py --country CA
Input:  data/interim/<CC>/geonames.parquet
Output: data/interim/<CC>/towns.parquet (kept towns: qid, enwiki, lwiki = local-language article, wd_class)
        data/interim/<CC>/towns_checked.csv (every candidate and its verdict)
"""
import argparse
import hashlib
import json
import time
import unicodedata
import zipfile
from pathlib import Path
from urllib.parse import unquote

import geopandas as gpd
import numpy as np
import pandas as pd
import requests

from countries import get, interim
from geonames import COLUMNS, download
from wikidata_places import category, lookup_many, verdict

NEAR_KM, BIGGER, MIN_BIG = 15, 3, 10_000
CITY_KM, CITY_POP = 8, 50_000
ROOT = Path(__file__).parent
CACHE_FILE = ROOT / "data" / "raw" / "wikidata_bulk_cache.json"
ENDPOINT = "https://query.wikidata.org/sparql"
UA = {"User-Agent": "PullThePlanetPipeline/0.1 (https://github.com/SaafiRahman/EarthPull)",
      "Accept": "application/sparql-results+json"}


def sparql(query: str) -> list[dict]:
    """query.wikidata.org, with answers cached by query text."""
    cache = json.loads(CACHE_FILE.read_text(encoding="utf-8")) if CACHE_FILE.exists() else {}
    key = hashlib.sha1(query.encode()).hexdigest()
    if key not in cache:
        for attempt in range(5):
            try:
                r = requests.get(ENDPOINT, params={"query": query}, headers=UA, timeout=180)
            except (requests.ConnectionError, requests.Timeout):  # a dropped connection or DNS blip (2026-11-26)
                time.sleep(30 * (attempt + 1))
                continue
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
    """Article title from a Wikipedia URL."""
    return unquote(url.rsplit("/wiki/", 1)[1]).replace("_", " ") if isinstance(url, str) else None


def town_class(classes: list[str]) -> str:
    cats = {category(c) for c in classes}
    for c in ("municipality", "neighbourhood", "settlement"):
        if c in cats:
            return c
    return "other"


def near_bigger(t: pd.DataFrame) -> pd.DataFrame:
    """cand: within NEAR_KM of a town with BIGGER x the population (and MIN_BIG+ people);
    in_city: also within CITY_KM of such a town with CITY_POP+ people."""
    lat, lon, pop = np.radians(t["latitude"].to_numpy()), np.radians(t["longitude"].to_numpy()), t["population"].to_numpy()
    big = np.flatnonzero(pop >= MIN_BIG)
    cand, city = np.zeros(len(t), bool), np.zeros(len(t), bool)
    for i in range(len(t)):
        b = big[pop[big] >= BIGGER * pop[i]]
        if len(b):
            d = 6371 * np.hypot((lon[b] - lon[i]) * np.cos((lat[b] + lat[i]) / 2), lat[b] - lat[i])
            cand[i] = (d < NEAR_KM).any()
            city[i] = ((d < CITY_KM) & (pop[b] >= CITY_POP)).any()
    return pd.DataFrame({"cand": cand, "in_city": city}, index=t.index)

QUERY = """
SELECT ?g ?item ?en ?lw (GROUP_CONCAT(DISTINCT ?cl; separator="|") AS ?classes) WHERE {
  VALUES ?g { %(ids)s }
  ?item wdt:P1566 ?g .
  OPTIONAL { ?item wdt:P31 ?c . ?c rdfs:label ?cl . FILTER(LANG(?cl) = "en") }
  OPTIONAL { ?en schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  %(local)s
} GROUP BY ?g ?item ?en ?lw
"""


def link(g: pd.DataFrame, local: str | None) -> pd.DataFrame:
    lw = f'OPTIONAL {{ ?lw schema:about ?item ; schema:isPartOf <https://{local}.wikipedia.org/> }}' if local else ""
    ids, rows = g["geonameid"].tolist(), []
    for i in range(0, len(ids), 250):
        rows += sparql(QUERY % {"ids": " ".join(f'"{x}"' for x in ids[i:i + 250]), "local": lw})
        if i and i % 5000 == 0:
            print(f"  {i:,}/{len(ids):,}", flush=True)
    w = pd.DataFrame(rows, columns=["g", "item", "en", "lw", "classes"])
    w["qid"] = w["item"].str.rsplit("/", n=1).str[1]
    w["classes"] = w["classes"].fillna("").str.split("|").map(lambda l: [c for c in l if c])
    w["enwiki"], w["lwiki"] = w["en"].map(title), w["lw"].map(title)
    w["wd_class"] = w["classes"].map(town_class)
    # A GeoNames ID occasionally sits on two items; prefer one with an article, then a municipality.
    rank = {"municipality": 0, "settlement": 1, "other": 2, "neighbourhood": 3}
    w = (w.assign(_a=w["enwiki"].isna() & w["lwiki"].isna(), _r=w["wd_class"].map(rank))
          .sort_values(["g", "_a", "_r"]).drop_duplicates("g"))
    out = g.merge(w[["g", "qid", "enwiki", "lwiki", "wd_class", "classes"]].rename(columns={"g": "geonameid"}),
                  on="geonameid", how="left")
    out["wd_class"] = out["wd_class"].fillna("no item")
    return out


TWIN_KM = 30  # a municipality's point can sit ~25 km from its town (Danli, Honduras)
TWIN_QUERY = """
SELECT ?g ?item ?en ?lw WHERE {
  VALUES ?g { %(ids)s }
  ?item wdt:P1566 ?g .
  OPTIONAL { ?en schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  %(local)s
}
"""


def _key(name: str) -> str:
    """Accents, case, hyphens and apostrophes don't count: "Cap Haïtien" = "Cap-Haitien"."""
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().casefold()
    s = " ".join(s.replace("-", " ").replace("'", " ").split())
    # Admin areas often carry their type: "Municipio de Holguin" is Holguin's municipality (2026-11-26, Cuba).
    for w in ("municipio de ", "municipality of ", "commune de ", "distrito de ", "canton de ", "delegacion "):
        s = s.removeprefix(w)
    return s.removesuffix(" municipio")  # Puerto Rico: "Bayamon Municipio"


def admin_twins(t: pd.DataFrame, code: str, local: str | None) -> pd.DataFrame:
    """Towns whose Wikidata item has no article often have a twin: GeoNames lists the city twice, as a populated
    place and as the municipality (an admin area) of the same name, and Wikidata hung the real article on the
    municipality's GeoNames ID (2026-11-26: Port-au-Prince, Santiago de Cuba, La Romana had fame 0). For those
    towns, take the article of the same-named admin area within TWIN_KM."""
    t["via_twin"] = False  # facts.py leaves these towns on GeoNames population: the item is the municipality
    bare = t.index[t["enwiki"].isna() & t["lwiki"].isna()]
    if not len(bare):
        return t
    with zipfile.ZipFile(download(f"{code}.zip")) as z:
        a = pd.read_csv(z.open(f"{code}.txt"), sep="	", header=None, names=COLUMNS, dtype=str,
                        keep_default_na=False, quoting=3, encoding="utf-8")
    a = a[(a["feature_class"] == "A") & a["feature_code"].str.match(r"ADM[1-5]|ADMD")].copy()
    a["key"] = a["name"].map(_key)
    a[["lat", "lon"]] = a[["latitude", "longitude"]].astype(float)
    by_key = {k: g for k, g in a.groupby("key")}
    twin = {}
    for i in bare:
        g = by_key.get(_key(t.at[i, "name"]))
        if g is None:
            continue
        lat, lon = float(t.at[i, "latitude"]), float(t.at[i, "longitude"])
        d = 111 * np.hypot((g["lon"].to_numpy() - lon) * np.cos(np.radians(lat)), g["lat"].to_numpy() - lat)
        lvl = g["feature_code"].str[3].replace("D", "9").to_numpy()
        ok = np.flatnonzero(d < TWIN_KM)
        if len(ok):  # smallest admin level with an article wins (below): Haiti's commune of Arcahaie, not its
            # arrondissement; but La Romana's municipality, not the article-less barrio of the same name
            twin[i] = [g["geonameid"].iloc[k] for k in sorted(ok, key=lambda k: (-int(lvl[k]), d[k]))]
    if not twin:
        print("Admin twins with an article: 0")
        return t
    lw = f'OPTIONAL {{ ?lw schema:about ?item ; schema:isPartOf <https://{local}.wikipedia.org/> }}' if local else ""
    ids, rows = sorted({x for v in twin.values() for x in v}), []
    for j in range(0, len(ids), 250):
        rows += sparql(TWIN_QUERY % {"ids": " ".join(f'"{x}"' for x in ids[j:j + 250]), "local": lw})
    hit = {}
    for r in rows:
        if r.get("en") or r.get("lw"):
            hit.setdefault(r["g"], (r["item"].rsplit("/", 1)[1], title(r.get("en")), title(r.get("lw"))))
    n = 0
    for i, gs in twin.items():
        g = next((x for x in gs if x in hit), None)
        if g:
            t.loc[i, ["qid", "enwiki", "lwiki"]] = hit[g]
            t.loc[i, "via_twin"] = True
            n += 1
    print(f"Admin twins with an article: {n:,} of {len(bare):,} towns without one")
    return t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--country", required=True)
    c = get(ap.parse_args().country)
    d = interim(c.code)
    t = link(gpd.read_parquet(d / "geonames.parquet"), c.local if c.local != "en" else None)
    t = admin_twins(t, c.code, c.local if c.local != "en" else None)
    t["local_lang"] = c.local if c.local != "en" else None
    nb = near_bigger(t)
    cand = nb["cand"]
    print(f"{int(cand.sum()):,} towns sit near a much bigger town; checking Wikidata...", flush=True)
    lang = c.local if c.local not in (None, "en") else "fr"
    found = lookup_many(((i, r["name"], r["latitude"], r["longitude"]) for i, r in t[cand].iterrows()), lang)
    t["verdict"], t["reason"] = "keep", "not near a bigger town"
    for i in t.index[cand]:
        r = t.loc[i]
        own = [] if pd.isna(r.qid) else [{"qid": r.qid, "classes": r.classes if isinstance(r.classes, (list, np.ndarray)) else [], "enwiki": r.enwiki, "frwiki": r.lwiki}]
        v, why = verdict(own + found[i])
        if v == "drop" and why != "neighbourhood" and not nb.at[i, "in_city"]:
            v, why = "keep", f"{why}, but not inside a city"
        t.loc[i, ["verdict", "reason"]] = v, why
    drop = t["verdict"] == "drop"
    t[~drop].reset_index(drop=True).to_parquet(d / "towns.parquet")
    t[cand][["geonameid", "name", "region", "population", "qid", "wd_class", "verdict", "reason"]].sort_values(
        ["verdict", "population"], ascending=[True, False]).to_csv(d / "towns_checked.csv", index=False, encoding="utf-8")
    print("Verdicts for candidates:", t[cand].groupby(["verdict", "reason"]).size().to_dict())
    print(f"{len(t):,} towns; Wikidata class: {t['wd_class'].value_counts().to_dict()}")
    print(f"Dropped {int(drop.sum()):,} neighbourhoods -> {int((~drop).sum()):,} towns -> {(d / 'towns.parquet').as_posix()}")
    print("Largest dropped:", ", ".join(t[drop].nlargest(15, "population")["name"]))
    print("English article:", int(t["enwiki"].notna().sum()), f"| {c.local or '-'} only:",
          int((t["enwiki"].isna() & t["lwiki"].notna()).sum()), "| none:", int((t["enwiki"].isna() & t["lwiki"].isna()).sum()))


if __name__ == "__main__":
    main()
