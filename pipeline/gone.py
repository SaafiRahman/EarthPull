"""Step 4b: drop places that are gone or were never built.

Developer, 2026-11-23: drop demolished, destroyed and never-built places; keep ones that closed but still
stand (the Montreal Forum building, a decommissioned Senate building). All checks are automatic, so they
work worldwide:
  1. Redirected article: the card's main article (English, else the local language) now redirects elsewhere, so the
     place was merged into something else (CalgaryNEXT -> Scotia Place). All card types.
  2. Wikidata, built cards: a class (P31) or state of use (P5817) that says destroyed, demolished,
     proposed, unbuilt or cancelled. Nature cards: undersea features and former lakes (paleolakes).
  3. Wikipedia categories, built cards: "Unbuilt ..." or "Cancelled ..." drop the card. "Demolished ..." or
     "Destroyed ..." (and the same words in French, Spanish, Dutch and Danish) drop it only when there is also an end date (Wikidata P576,
     or a "... disestablishments" category):
     a replaced bridge's article sits in its old bridge's category (Port Mann Bridge).
  4. pipeline/overrides.csv: hand fixes (keep or drop by card id) for what the rules get wrong.
Not used: fire categories (most burned churches and halls were rebuilt: Notre-Dame Basilica, Montreal
City Hall), "under construction" (it will exist), and an end date (P576) alone, which is also set for
places that only closed.

    python pipeline/gone.py --country CA
Input:  data/interim/<CC>/pool.parquet
Output: data/interim/<CC>/pool_clean.parquet, gone.csv (what was dropped and why)
Answers are cached in data/raw/wiki_meta.json.
"""
import argparse
import json
import re
import time
from pathlib import Path

import pandas as pd
import requests

from countries import get, interim

ROOT = Path(__file__).parent
INTERIM = ROOT / "data" / "interim"
CACHE = ROOT / "data" / "raw" / "wiki_meta.json"
UA = {"User-Agent": "PullThePlanetPipeline/0.1 (https://github.com/SaafiRahman/EarthPull)"}
WD_API = "https://www.wikidata.org/w/api.php"

GONE_WORDS = re.compile(r"\b(destroyed|demolished|proposed|unbuilt|cancell?ed)\b", re.I)
# Category words in English, French, Spanish, Dutch and Danish (the local languages in countries.py).
CAT_NEVER = re.compile(r"\b(unbuilt|cancell?ed|non réalisé|no construid|nunca construid|cancelad|niet gebouwd|aldrig opført)", re.I)
CAT_GONE = re.compile(r"\b(demolished|destroyed|détruit|démoli|demolid|destruid|desaparecid|gesloopt|verwoest|nedrevne|ødelagte)", re.I)
NATURE_GONE = re.compile(r"(undersea|submarine|seamount|paleolake|former lake|prehistoric lake)", re.I)
CAT_SKIP = re.compile(r"\b(fire|arson|burn|incendie|incendio|brand)", re.I)

session = requests.Session()
session.headers.update(UA)


def api(url: str, params: dict) -> dict:
    """POST (50 titles can be too long for a URL), with retries on throttling or server errors."""
    for attempt in range(6):
        r = session.post(url, data=params, timeout=60)
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(int(r.headers.get("Retry-After") or 0) or 2 ** attempt)
            continue
        r.raise_for_status()
        return r.json()
    raise RuntimeError(f"gave up on {url}")


def load_cache() -> dict:
    return json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}


def save_cache(c: dict):
    CACHE.write_text(json.dumps(c, ensure_ascii=False), encoding="utf-8")


def wiki_query(lang: str, titles: list[str], cache: dict, kind: str):
    """kind 'redirect': cache[f'r|{lang}|{title}'] = target title or ''.
    kind 'cats': cache[f'c|{lang}|{title}'] = visible categories of the article (after redirects)."""
    todo = [t for t in titles if f"{kind[0]}|{lang}|{t}" not in cache]
    for i in range(0, len(todo), 50):
        batch = todo[i:i + 50]
        params = {"action": "query", "titles": "|".join(batch), "redirects": 1, "format": "json", "formatversion": 2}
        if kind == "cats":
            params.update({"prop": "categories", "clshow": "!hidden", "cllimit": "max"})
        cats: dict[str, list] = {}
        while True:
            q = api(f"https://{lang}.wikipedia.org/w/api.php", params)
            norm = {n["from"]: n["to"] for n in q["query"].get("normalized", [])}
            redir = {r["from"]: r["to"] for r in q["query"].get("redirects", [])}
            for p in q["query"].get("pages", []):
                cats.setdefault(p["title"], []).extend(c["title"] for c in p.get("categories", []))
            if "continue" not in q:
                break
            params.update(q["continue"])
        for t in batch:
            n = norm.get(t, t)
            target = redir.get(n, "")
            if kind == "redirect":
                cache[f"r|{lang}|{t}"] = target
            else:
                cache[f"c|{lang}|{t}"] = cats.get(target or n, [])
        if i % 1000 == 0:
            print(f"  {kind} {lang}: {i + len(batch):,}/{len(todo):,}", flush=True)
            save_cache(cache)
    save_cache(cache)


def target_items(lang: str, titles: list[str], cache: dict):
    """cache[f't|{lang}|{title}'] = the Wikidata item of a redirect's target page."""
    todo = [t for t in titles if f"t|{lang}|{t}" not in cache]
    for i in range(0, len(todo), 50):
        batch = todo[i:i + 50]
        q = api(f"https://{lang}.wikipedia.org/w/api.php", {"action": "query", "titles": "|".join(batch), "prop": "pageprops",
                                                             "ppprop": "wikibase_item", "format": "json", "formatversion": 2})
        norm = {n["from"]: n["to"] for n in q["query"].get("normalized", [])}
        item = {p["title"]: p.get("pageprops", {}).get("wikibase_item", "") for p in q["query"].get("pages", [])}
        for t in batch:
            cache[f"t|{lang}|{t}"] = item.get(norm.get(t, t), "")
    save_cache(cache)


def wikidata_gone(qids: list[str], cache: dict, words: re.Pattern = GONE_WORDS) -> dict[str, str]:
    """qid -> the gone class or state label, for items Wikidata marks as gone or never built."""
    todo = [q for q in qids if f"d|{q}" not in cache]
    for i in range(0, len(todo), 50):
        ents = api(WD_API, {"action": "wbgetentities", "ids": "|".join(todo[i:i + 50]),
                            "props": "claims", "format": "json"})["entities"]
        for q, e in ents.items():
            vals = [s["mainsnak"].get("datavalue", {}).get("value", {}).get("id")
                    for p in ("P31", "P5817") for s in e.get("claims", {}).get(p, [])]
            cache[f"w|{q}"] = [v for v in vals if v]
            cache[f"d|{q}"] = bool(e.get("claims", {}).get("P576"))  # has an end date
    ids = sorted({v for q in qids for v in cache.get(f"w|{q}", [])} - {k[2:] for k in cache if k.startswith("l|")})
    for i in range(0, len(ids), 50):
        ents = api(WD_API, {"action": "wbgetentities", "ids": "|".join(ids[i:i + 50]), "props": "labels",
                            "languages": "en", "format": "json"})["entities"]
        for q, e in ents.items():
            cache[f"l|{q}"] = e.get("labels", {}).get("en", {}).get("value", "")
    save_cache(cache)
    out = {}
    for q in qids:
        hit = next((cache.get(f"l|{v}", "") for v in cache.get(f"w|{q}", []) if words.search(cache.get(f"l|{v}", ""))), None)
        if hit:
            out[q] = hit
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--country", required=True)
    c = get(ap.parse_args().country)
    d = interim(c.code)
    df = pd.read_parquet(d / "pool.parquet")
    loc = c.local if c.local not in (None, "en") else None
    wikis = [("en", "enwiki")] + ([(loc, "lwiki")] if loc else [])  # (language, column)
    cache = load_cache()
    reasons: dict[str, str] = {}

    # 1. Redirected articles (all cards)
    for lang, col in wikis:
        wiki_query(lang, sorted(df[col].dropna().unique()), cache, "redirect")
    for lang, col in wikis:
        targets = {cache[f"r|{lang}|{t}"] for t in df[col].dropna() if cache.get(f"r|{lang}|{t}")}
        target_items(lang, sorted(targets), cache)
    pool_qids = set(df["qid"].dropna())
    for r in df.itertuples():
        lang, t = ("en", r.enwiki) if isinstance(r.enwiki, str) else (loc, r.lwiki)
        target = cache.get(f"r|{lang}|{t}") if isinstance(t, str) else ""
        # A page that was only renamed still belongs to the same Wikidata item. Towns are dropped only when the
        # target is already another card: GeoNames sometimes links a town to a wrapper item whose page redirects
        # to the town itself (La Tuque's "urban agglomeration" -> La Tuque, Quebec).
        item = cache.get(f"t|{lang}|{target}") if target else None
        if target and item != r.qid and (r.type != "town" or item in pool_qids):
            reasons[r.id] = f"article redirects to {target}"

    # 2b. Nature cards you can't visit: undersea features and lakes that no longer exist (developer, 2026-11-24:
    # fix bad data automatically; Lake Agassiz, Lomonosov Ridge)
    for q, label in wikidata_gone(df.loc[df["type"] == "nature", "qid"].dropna().tolist(), cache, NATURE_GONE).items():
        reasons.setdefault("wd:" + q, f"Wikidata: {label}")

    # 2 and 3. Built cards: Wikidata classes and Wikipedia categories
    built = df[df["type"] == "built"]
    for q, label in wikidata_gone(built["qid"].tolist(), cache).items():
        reasons.setdefault("wd:" + q, f"Wikidata: {label}")
    for lang, col in wikis:
        wiki_query(lang, sorted(built[col].dropna().unique()), cache, "cats")
    for r in built.itertuples():
        for lang, t in (("en", r.enwiki), (loc, r.lwiki)):
            if isinstance(t, str):
                cats = cache.get(f"c|en|{r.enwiki}", []) + cache.get(f"c|{loc}|{r.lwiki}", [])
                ended = cache.get(f"d|{r.qid}", False) or any("disestablishments" in c for c in cats)
                cat = next((c for c in cache.get(f"c|{lang}|{t}", []) if not CAT_SKIP.search(c)
                            and (CAT_NEVER.search(c) or (ended and CAT_GONE.search(c)))), None)
                if cat:
                    reasons.setdefault(r.id, cat)
                    break

    # 4. Hand fixes for what the rules get wrong (keep wins over every rule).
    fixes = pd.read_csv(ROOT / "overrides.csv", comment="#")
    for f in fixes.itertuples():
        if f.action == "keep":
            reasons.pop(f.id, None)
        elif f.action == "drop" and f.id in set(df["id"]):
            reasons[f.id] = f"hand fix: {f.reason}"

    # 5. One card per Wikidata item (2026-11-25: 37 US pairs). A town sharing an item with a natural landmark
    # was linked to the wrong article (the Grand Canyon village got the canyon), so the landmark wins; a
    # "building" sharing an item with a town is a planned town or base Wikidata also calls a structure
    # (Washington DC, Columbia MD), so the town wins; between two towns the bigger one wins (Lexington).
    rank = df["type"].map({"nature": 0, "town": 1, "built": 2})
    order = df.assign(_r=rank, _p=-df["population"].fillna(0), _f=-df["fame"]).sort_values(["_r", "_p", "_f"])
    left = order[order["qid"].notna() & ~order["id"].isin(reasons)]
    for i, q in left.loc[left["qid"].duplicated(), ["id", "qid"]].itertuples(index=False):
        keep = left.loc[left["qid"] == q].iloc[0]
        reasons[i] = f"duplicate: same Wikidata item as {keep['name']} ({keep['type']}, {keep['id']})"

    gone =df[df["id"].isin(reasons)].assign(reason=df["id"].map(reasons))
    gone[["id", "name", "type", "kind", "region", "fame", "reason"]].sort_values("fame", ascending=False) \
        .to_csv(d / "gone.csv", index=False, encoding="utf-8")
    clean = df[~df["id"].isin(reasons)]
    clean.to_parquet(d / "pool_clean.parquet")

    print(f"\nDropped {len(gone):,} of {len(df):,} -> {len(clean):,} cards in {(d / 'pool_clean.parquet').relative_to(ROOT).as_posix()}")
    kinds = gone["reason"].str.extract(r"^(article redirects|Wikidata|hand fix|duplicate)")[0].fillna("category")
    print("By check:", kinds.value_counts().to_dict(), "| by type:", gone["type"].value_counts().to_dict())
    top = gone.sort_values("fame", ascending=False).head(40)
    print("Most famous dropped:\n" + "\n".join(f"  {n} [{t}] {f / 1e3:.0f}k: {why}" for n, t, f, why
                                               in zip(top["name"], top["type"], top["fame"], top["reason"])))


if __name__ == "__main__":
    main()
