"""Step 4 (Canada): 12 months of Wikipedia page views for every candidate, and one combined pool table.

Fame = median month x 12, where a month's views are English + French Wikipedia views (user agents only,
no bots) over the last 12 complete months. The median keeps one news spike from dominating the year
(Tumbler Ridge had 444k of its 499k yearly views in one month). The plain 12-month total is kept as views_12mo.
French counts too because many Quebec places have a fuller French article, or only a French one.
A candidate with no article has fame 0 (roadmap).

    python pipeline/pageviews_ca.py
Input:  data/interim/places_ca.parquet, towns_wikidata_ca.parquet, landmarks_ca.parquet, structures_ca.parquet
Output: data/interim/pool_ca.parquet (views_en, views_fr, views_12mo, fame)
Answers are cached in data/raw/pageviews.sqlite, so an interrupted run picks up where it stopped.
"""
import json
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
WORKERS = 10

_local = threading.local()


def session():
    if not hasattr(_local, "s"):
        _local.s = requests.Session()
        _local.s.headers.update(UA)
    return _local.s


MONTHS = pd.date_range(f"{START[:4]}-{START[4:6]}", f"{END[:4]}-{END[4:6]}", freq="MS").strftime("%Y%m").tolist()


def fetch(lang: str, title: str) -> list[int]:
    """Views for each of the 12 months; months the API leaves out had 0 views."""
    url = API.format(lang=lang, title=quote(title.replace(" ", "_"), safe=""), start=START, end=END)
    for attempt in range(8):
        r = session().get(url, timeout=30)
        if r.status_code == 404:  # article exists but no views recorded in the window
            return [0] * len(MONTHS)
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(int(r.headers.get("Retry-After") or 0) or min(60, 2 ** attempt))
            continue
        r.raise_for_status()
        got = {i["timestamp"][:6]: i["views"] for i in r.json()["items"]}
        return [got.get(m, 0) for m in MONTHS]
    raise RuntimeError(f"gave up on {lang}:{title}")


def views(pairs: set[tuple[str, str]]) -> dict[tuple[str, str], list[int]]:
    DB.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB)
    # pvm holds a JSON list of 12 monthly counts (the older pv table held only yearly totals).
    con.execute("CREATE TABLE IF NOT EXISTS pvm (lang TEXT, title TEXT, start TEXT, endd TEXT, months TEXT, "
                "PRIMARY KEY (lang, title, start, endd))")
    have = {(l, t): json.loads(m) for l, t, m in
            con.execute("SELECT lang, title, months FROM pvm WHERE start=? AND endd=?", (START, END))}
    todo = sorted(pairs - have.keys())
    print(f"{len(pairs):,} articles; cached {len(pairs) - len(todo):,}; fetching {len(todo):,}")
    done, t0 = 0, time.time()
    with ThreadPoolExecutor(WORKERS) as ex:
        futs = {ex.submit(fetch, l, t): (l, t) for l, t in todo}
        for f in as_completed(futs):
            l, t = futs[f]
            v = f.result()
            have[(l, t)] = v
            con.execute("INSERT OR REPLACE INTO pvm VALUES (?,?,?,?,?)", (l, t, START, END, json.dumps(v)))
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
    zero = [0] * len(MONTHS)
    en = df["enwiki"].map(lambda t: v.get(("en", t), zero) if isinstance(t, str) else zero)
    fr = df["frwiki"].map(lambda t: v.get(("fr", t), zero) if isinstance(t, str) else zero)
    monthly = pd.DataFrame([[a + b for a, b in zip(x, y)] for x, y in zip(en, fr)], index=df.index, columns=MONTHS)
    df["views_en"] = en.map(sum).where(df["enwiki"].notna()).astype("Int64")
    df["views_fr"] = fr.map(sum).where(df["frwiki"].notna()).astype("Int64")
    df["views_12mo"] = monthly.sum(axis=1)
    df["fame"] = (monthly.median(axis=1) * 12).round().astype(int)
    df.to_parquet(INTERIM / "pool_ca.parquet")

    print(f"\n{len(df):,} candidates -> data/interim/pool_ca.parquet")
    print("No article (fame 0):", int((df["enwiki"].isna() & df["frwiki"].isna()).sum()),
          "| article but 0 views:", int(((df["enwiki"].notna() | df["frwiki"].notna()) & (df["views_12mo"] == 0)).sum()),
          "| fame 0 (most months without views):", int((df["fame"] == 0).sum()))
    q = df.groupby("type")["fame"].describe(percentiles=[.5, .9, .99])[["count", "50%", "90%", "99%", "max"]]
    print("\nFame (median month x 12) by type:\n" + q.round(0).to_string())
    top = df.nlargest(30, "fame")
    print("\nTop 30:", ", ".join(f"{n} ({v / 1e3:.0f}k)" for n, v in zip(top["name"], top["fame"])))
    for t in ("town", "nature", "built"):
        s = df[df["type"] == t].nlargest(8, "fame")
        print(f"Top {t}:", ", ".join(f"{n} ({v / 1e3:.0f}k)" for n, v in zip(s["name"], s["fame"])))


if __name__ == "__main__":
    main()
