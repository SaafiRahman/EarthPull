"""Step 4 (Canada): 12 months of Wikipedia page views for every candidate, and one combined pool table.

Fame = English + French Wikipedia views over the last 12 complete months (user agents only, no bots).
French counts too because many Quebec places have a fuller French article, or only a French one.
A candidate with no article has fame 0 (roadmap).

    python pipeline/pageviews_ca.py
Input:  data/interim/places_ca.parquet, towns_wikidata_ca.parquet, landmarks_ca.parquet, structures_ca.parquet
Output: data/interim/pool_ca.parquet
Answers are cached in data/raw/pageviews.sqlite, so an interrupted run picks up where it stopped.
"""
import sqlite3
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import quote

import geopandas as gpd
import pandas as pd
import requests

ROOT = Path(__file__).parent
INTERIM = ROOT / "data" / "interim"
DB = ROOT / "data" / "raw" / "pageviews.sqlite"
START, END = "20251101", "20261031"  # last 12 complete months as of 2026-11-23
API = "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/{lang}.wikipedia/all-access/user/{title}/monthly/{start}00/{end}00"
# Wikimedia asks scripts to identify themselves with a contact; anonymous ones are throttled hard.
UA = {"User-Agent": "PullThePlanetPipeline/0.1 (https://github.com/SaafiRahman/EarthPull)"}
WORKERS = 5

_local = threading.local()


def session():
    if not hasattr(_local, "s"):
        _local.s = requests.Session()
        _local.s.headers.update(UA)
    return _local.s


def fetch(lang: str, title: str) -> int:
    url = API.format(lang=lang, title=quote(title.replace(" ", "_"), safe=""), start=START, end=END)
    for attempt in range(8):
        r = session().get(url, timeout=30)
        if r.status_code == 404:  # article exists but no views recorded in the window
            return 0
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(int(r.headers.get("Retry-After") or 0) or min(60, 2 ** attempt))
            continue
        r.raise_for_status()
        return sum(i["views"] for i in r.json()["items"])
    raise RuntimeError(f"gave up on {lang}:{title}")


def views(pairs: set[tuple[str, str]]) -> dict[tuple[str, str], int]:
    DB.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB)
    con.execute("CREATE TABLE IF NOT EXISTS pv (lang TEXT, title TEXT, start TEXT, endd TEXT, views INTEGER, "
                "PRIMARY KEY (lang, title, start, endd))")
    have = {(l, t): v for l, t, v in con.execute("SELECT lang, title, views FROM pv WHERE start=? AND endd=?", (START, END))}
    todo = sorted(pairs - have.keys())
    print(f"{len(pairs):,} articles; cached {len(pairs) - len(todo):,}; fetching {len(todo):,}")
    done, t0 = 0, time.time()
    with ThreadPoolExecutor(WORKERS) as ex:
        futs = {ex.submit(fetch, l, t): (l, t) for l, t in todo}
        for f in as_completed(futs):
            l, t = futs[f]
            v = f.result()
            have[(l, t)] = v
            con.execute("INSERT OR REPLACE INTO pv VALUES (?,?,?,?,?)", (l, t, START, END, v))
            done += 1
            if done % 500 == 0:
                con.commit()
                rate = done / (time.time() - t0)
                print(f"  {done:,}/{len(todo):,}  {rate:.1f}/s  ~{(len(todo) - done) / rate / 60:.0f} min left", flush=True)
    con.commit()
    con.close()
    return have


def pool() -> pd.DataFrame:
    """All Canadian candidates in one table."""
    keep = set(gpd.read_parquet(INTERIM / "places_ca.parquet")["geonameid"])
    t = gpd.read_parquet(INTERIM / "towns_wikidata_ca.parquet")
    t = t[t["geonameid"].isin(keep)]
    towns = pd.DataFrame({
        "id": "gn:" + t["geonameid"], "name": t["name"], "type": "town", "kind": "town", "province": t["province"],
        "lat": t["latitude"], "lon": t["longitude"], "population": t["population"],
        "elevation_m": t["elevation"].fillna(t["dem"]).astype("Float64"), "qid": t["qid"],
        "enwiki": t["enwiki"], "frwiki": t["frwiki"]})
    lm = gpd.read_parquet(INTERIM / "landmarks_ca.parquet")
    nature = pd.DataFrame({
        "id": "wd:" + lm["qid"], "name": lm["name"].fillna(lm["enwiki"]).fillna(lm["frwiki"]), "type": "nature",
        "kind": lm["kind"], "province": lm["province"], "lat": lm["lat"], "lon": lm["lon"],
        "elevation_m": lm["elevation_m"].astype("Float64"), "qid": lm["qid"], "enwiki": lm["enwiki"], "frwiki": lm["frwiki"]})
    st = gpd.read_parquet(INTERIM / "structures_ca.parquet")
    built = pd.DataFrame({
        "id": "wd:" + st["qid"], "name": st["name"].fillna(st["enwiki"]).fillna(st["frwiki"]), "type": "built",
        "kind": st["kind"], "province": st["province"], "lat": st["lat"], "lon": st["lon"], "sitelinks": st["sitelinks"],
        "qid": st["qid"], "enwiki": st["enwiki"], "frwiki": st["frwiki"]})
    df = pd.concat([towns, nature, built], ignore_index=True)
    # A Wikidata item can be both a natural landmark and a structure (a dam's lake, a park): keep one card.
    df = df.drop_duplicates("id", keep="first")
    return df


def main():
    df = pool()
    pairs = {("en", t) for t in df["enwiki"].dropna()} | {("fr", t) for t in df["frwiki"].dropna()}
    v = views(pairs)
    df["views_en"] = df["enwiki"].map(lambda t: v.get(("en", t)) if isinstance(t, str) else None).astype("Int64")
    df["views_fr"] = df["frwiki"].map(lambda t: v.get(("fr", t)) if isinstance(t, str) else None).astype("Int64")
    df["views_12mo"] = df["views_en"].fillna(0) + df["views_fr"].fillna(0)
    df.to_parquet(INTERIM / "pool_ca.parquet")

    print(f"\n{len(df):,} candidates -> data/interim/pool_ca.parquet")
    print("No article (fame 0):", int((df["enwiki"].isna() & df["frwiki"].isna()).sum()),
          "| article but 0 views:", int(((df["enwiki"].notna() | df["frwiki"].notna()) & (df["views_12mo"] == 0)).sum()))
    q = df.groupby("type")["views_12mo"].describe(percentiles=[.5, .9, .99])[["count", "50%", "90%", "99%", "max"]]
    print("\nViews per year by type:\n" + q.round(0).to_string())
    top = df.nlargest(30, "views_12mo")
    print("\nTop 30:", ", ".join(f"{n} ({v / 1e3:.0f}k)" for n, v in zip(top["name"], top["views_12mo"])))
    for t in ("town", "nature", "built"):
        s = df[df["type"] == t].nlargest(8, "views_12mo")
        print(f"Top {t}:", ", ".join(f"{n} ({v / 1e3:.0f}k)" for n, v in zip(s["name"], s["views_12mo"])))


if __name__ == "__main__":
    main()
