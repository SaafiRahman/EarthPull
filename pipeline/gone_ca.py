"""Step 4b (Canada): drop places that are gone or were never built.

Developer, 2026-11-23: drop demolished, destroyed and never-built places; keep ones that closed but still
stand (the Montreal Forum building, a decommissioned Senate building). All checks are automatic, so they
work worldwide:
  1. Redirected article: the card's main article (English, else French) now redirects elsewhere, so the
     place was merged into something else (CalgaryNEXT -> Scotia Place). All card types.
  2. Wikidata, built cards: a class (P31) or state of use (P5817) that says destroyed, demolished,
     proposed, unbuilt or cancelled.
  3. Wikipedia categories, built cards: "Unbuilt ..." or "Cancelled ..." drop the card. "Demolished ..." or
     "Destroyed ..." (French "détruit", "démoli") drop it only when there is also an end date (Wikidata P576,
     or a "... disestablishments" category):
     a replaced bridge's article sits in its old bridge's category (Port Mann Bridge).
  4. pipeline/overrides.csv: hand fixes (keep or drop by card id) for what the rules get wrong.
Not used: fire categories (most burned churches and halls were rebuilt: Notre-Dame Basilica, Montreal
City Hall), "under construction" (it will exist), and an end date (P576) alone, which is also set for
places that only closed.

    python pipeline/gone_ca.py
Input:  data/interim/pool_ca.parquet
Output: data/interim/pool_clean_ca.parquet, gone_ca.csv (what was dropped and why)
Answers are cached in data/raw/wiki_meta.json.
"""
import json
import re
import time
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).parent
INTERIM = ROOT / "data" / "interim"
CACHE = ROOT / "data" / "raw" / "wiki_meta.json"
UA = {"User-Agent": "PullThePlanetPipeline/0.1 (https://github.com/SaafiRahman/EarthPull)"}
WD_API = "https://www.wikidata.org/w/api.php"

GONE_WORDS = re.compile(r"\b(destroyed|demolished|proposed|unbuilt|cancell?ed)\b", re.I)
CAT_NEVER = re.compile(r"\b(unbuilt|cancell?ed|non réalisé)", re.I)
CAT_GONE = re.compile(r"\b(demolished|destroyed|détruit|démoli)", re.I)
CAT_SKIP = re.compile(r"\b(fire|arson|burn|incendie)", re.I)

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


def wikidata_gone(qids: list[str], cache: dict) -> dict[str, str]:
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
        hit = next((cache.get(f"l|{v}", "") for v in cache.get(f"w|{q}", []) if GONE_WORDS.search(cache.get(f"l|{v}", ""))), None)
        if hit:
            out[q] = hit
    return out


def main():
    df = pd.read_parquet(INTERIM / "pool_ca.parquet")
    cache = load_cache()
    reasons: dict[str, str] = {}

    # 1. Redirected articles (all cards)
    for lang in ("en", "fr"):
        wiki_query(lang, sorted(df[f"{lang}wiki"].dropna().unique()), cache, "redirect")
    for lang in ("en", "fr"):
        targets = {cache[f"r|{lang}|{t}"] for t in df[f"{lang}wiki"].dropna() if cache.get(f"r|{lang}|{t}")}
        target_items(lang, sorted(targets), cache)
    pool_qids = set(df["qid"].dropna())
    for r in df.itertuples():
        lang, t =("en", r.enwiki) if isinstance(r.enwiki, str) else ("fr", r.frwiki)
        target = cache.get(f"r|{lang}|{t}") if isinstance(t, str) else ""
        # A page that was only renamed still belongs to the same Wikidata item. Towns are dropped only when the
        # target is already another card: GeoNames sometimes links a town to a wrapper item whose page redirects
        # to the town itself (La Tuque's "urban agglomeration" -> La Tuque, Quebec).
        item = cache.get(f"t|{lang}|{target}") if target else None
        if target and item != r.qid and (r.type != "town" or item in pool_qids):
            reasons[r.id] = f"article redirects to {target}"

    # 2 and 3. Built cards: Wikidata classes and Wikipedia categories
    built = df[df["type"] == "built"]
    for q, label in wikidata_gone(built["qid"].tolist(), cache).items():
        reasons.setdefault("wd:" + q, f"Wikidata: {label}")
    for lang in ("en", "fr"):
        wiki_query(lang, sorted(built[f"{lang}wiki"].dropna().unique()), cache, "cats")
    for r in built.itertuples():
        for lang, t in (("en", r.enwiki), ("fr", r.frwiki)):
            if isinstance(t, str):
                cats = cache.get(f"c|en|{r.enwiki}", []) + cache.get(f"c|fr|{r.frwiki}", [])
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

    gone = df[df["id"].isin(reasons)].assign(reason=df["id"].map(reasons))
    gone[["id", "name", "type", "kind", "province", "fame", "reason"]].sort_values("fame", ascending=False) \
        .to_csv(INTERIM / "gone_ca.csv", index=False, encoding="utf-8")
    clean = df[~df["id"].isin(reasons)]
    clean.to_parquet(INTERIM / "pool_clean_ca.parquet")

    print(f"\nDropped {len(gone):,} of {len(df):,} -> {len(clean):,} cards in data/interim/pool_clean_ca.parquet")
    kinds = gone["reason"].str.extract(r"^(article redirects|Wikidata|Category|Catégorie|hand fix)")[0].fillna("other")
    print("By check:", kinds.value_counts().to_dict(), "| by type:", gone["type"].value_counts().to_dict())
    top = gone.sort_values("fame", ascending=False).head(40)
    print("Most famous dropped:\n" + "\n".join(f"  {n} [{t}] {f / 1e3:.0f}k: {why}" for n, t, f, why
                                               in zip(top["name"], top["type"], top["fame"], top["reason"])))


if __name__ == "__main__":
    main()
