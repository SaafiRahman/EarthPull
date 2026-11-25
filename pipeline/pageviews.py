"""Step 4: 12 months of Wikipedia page views for every candidate of one country, and one combined pool table.

Fame = median month x 12, where a month's views are English + local-language Wikipedia views (user agents only,
no bots) over the last 12 complete months. The median keeps one news spike from dominating the year
(Tumbler Ridge had 444k of its 499k yearly views in one month). The plain 12-month total is kept as views_12mo.
The local language (countries.py) counts too because many places have a fuller local article, or only
that one (French in Quebec, Spanish in Mexico). The US counts English only.
A candidate with no article has fame 0 (roadmap).

    python pipeline/pageviews.py --country CA
Input:  data/interim/<CC>/towns.parquet, landmarks.parquet, structures.parquet
Output: data/interim/<CC>/pool.parquet (views_en, views_local, views_12mo, fame)
Answers are cached in data/raw/pageviews.sqlite, so an interrupted run picks up where it stopped.
"""
import argparse
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

from countries import get, interim

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


def pool(code: str) -> pd.DataFrame:
    """All candidates of one country in one table."""
    d = interim(code)
    t = gpd.read_parquet(d / "towns.parquet")
    towns = pd.DataFrame({
        "id": "gn:" + t["geonameid"], "name": t["name"], "type": "town", "kind": "town",
        "lat": t["latitude"], "lon": t["longitude"], "population": t["population"],
        "elevation_m": t["elevation"].fillna(t["dem"]).astype("Float64"), "qid": t["qid"],
        "enwiki": t["enwiki"], "lwiki": t["lwiki"], "also_in": [[] for _ in range(len(t))]})
    towns[["country", "region", "region_name"]] = t[["country", "region", "region_name"]].to_numpy()
    parts = [towns]
    for fname, typ in (("landmarks.parquet", "nature"), ("structures.parquet", "built")):
        lm = gpd.read_parquet(d / fname)
        cols = ["qid", "name", "kind", "lat", "lon", "qid", "enwiki", "lwiki", "country", "region", "region_name",
                "also_in", "sitelinks"] + (["elevation_m"] if typ == "nature" else [])
        x = pd.DataFrame(lm[list(dict.fromkeys(cols))]).assign(id="wd:" + lm["qid"], type=typ)
        x["also_in"] = x["also_in"].map(list)
        if typ == "nature":
            x["elevation_m"] = x["elevation_m"].astype("Float64")
        parts.append(x)
    df = pd.concat(parts, ignore_index=True)
    df["province"] = df["region_name"]  # older steps read "province"
    df["local_lang"] = None if get(code).local in (None, "en") else get(code).local
    # A Wikidata item can be both a natural landmark and a structure (a dam's lake, a park): keep one card.
    return df.drop_duplicates("id", keep="first")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--country", required=True)
    code = get(ap.parse_args().country).code
    df = pool(code)
    lang = df["local_lang"].iloc[0] if len(df) else None
    pairs = {("en", t) for t in df["enwiki"].dropna()} | ({(lang, t) for t in df["lwiki"].dropna()} if lang else set())
    v = views(pairs)
    zero = [0] * len(MONTHS)
    en = df["enwiki"].map(lambda t: v.get(("en", t), zero) if isinstance(t, str) else zero)
    lo = df["lwiki"].map(lambda t: v.get((lang, t), zero) if isinstance(t, str) and lang else zero)
    monthly = pd.DataFrame([[a + b for a, b in zip(x, y)] for x, y in zip(en, lo)], index=df.index, columns=MONTHS)
    df["views_en"] = en.map(sum).where(df["enwiki"].notna()).astype("Int64")
    df["views_local"] = lo.map(sum).where(df["lwiki"].notna()).astype("Int64")
    df["views_12mo"] = monthly.sum(axis=1)
    df["fame"] = (monthly.median(axis=1) * 12).round().astype(int)
    out = interim(code) / "pool.parquet"
    df.to_parquet(out)

    print(f"\n{len(df):,} candidates -> {out.relative_to(ROOT).as_posix()}")
    print("No article (fame 0):", int((df["enwiki"].isna() & df["lwiki"].isna()).sum()),
          "| article but 0 views:", int(((df["enwiki"].notna() | df["lwiki"].notna()) & (df["views_12mo"] == 0)).sum()),
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
