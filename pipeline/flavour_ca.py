"""Step 7 (Canada): a one-line flavour fact per card from its Wikipedia summary.

The summary is the article's intro (English article, else French). Its first sentence usually just says
what the place is ("X is a lake in Y"), which the card already shows, so when it is only that and a
later sentence is a good length, the later sentence is used. Brackets (pronunciations, coordinates,
dates) are removed, and long sentences end at a comma (else a word boundary).
Cards with no article (24% of towns) get no flavour here; the export can write a line from their facts.

Wikipedia text is CC BY-SA: the card credits and links the source article (flavour_lang, flavour_title).

    python pipeline/flavour_ca.py
Input:  data/interim/cards_ca.parquet
Output: data/interim/flavour_ca.parquet (id, flavour, flavour_lang, flavour_title)
Answers are cached in data/raw/extracts.json.
"""
import json
import re
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).parent
INTERIM = ROOT / "data" / "interim"
CACHE = ROOT / "data" / "raw" / "extracts.json"
UA = {"User-Agent": "PullThePlanetPipeline/0.1 (https://github.com/SaafiRahman/EarthPull)"}
MAX = 160  # characters on the card

session = requests.Session()
session.headers.update(UA)


def api(lang: str, params: dict) -> dict:
    for attempt in range(6):
        r = session.post(f"https://{lang}.wikipedia.org/w/api.php", data=params, timeout=60)
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(int(r.headers.get("Retry-After") or 0) or 2 ** attempt)
            continue
        r.raise_for_status()
        return r.json()
    raise RuntimeError("gave up")


def fetch(lang: str, titles: list[str]) -> dict[str, str]:
    """Intro text for up to 20 titles (the TextExtracts limit for intros)."""
    q = api(lang, {"action": "query", "prop": "extracts", "exintro": 1, "explaintext": 1, "exlimit": 20,
                   "redirects": 1, "titles": "|".join(titles), "format": "json", "formatversion": 2})["query"]
    norm = {n["from"]: n["to"] for n in q.get("normalized", [])}
    redir = {r["from"]: r["to"] for r in q.get("redirects", [])}
    text = {p["title"]: p.get("extract", "") for p in q.get("pages", [])}
    out = {}
    for t in titles:
        n = norm.get(t, t)
        out[t] = text.get(redir.get(n, n), "")
    return out


def extracts(lang: str, titles: list[str], cache: dict):
    todo = [t for t in titles if f"{lang}|{t}" not in cache]
    batches = [todo[i:i + 20] for i in range(0, len(todo), 20)]
    with ThreadPoolExecutor(4) as pool:
        for n, res in enumerate(pool.map(lambda b: fetch(lang, b), batches), 1):
            cache.update({f"{lang}|{t}": v for t, v in res.items()})
            if n % 50 == 0 or n == len(batches):
                print(f"  {lang}: {n * 20:,}/{len(todo):,}", flush=True)
                CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")


# Abbreviations that end with a full stop but don't end a sentence.
ABBR = "".join(rf"(?<!\b{a}\.)" for a in ("St", "Mt", "Ft", "Dr", "No", "vs", "ca", r"U\.S", "Jr", "Sr", "approx", "[A-Z]"))
SPLIT = re.compile(ABBR + r"(?<=[.!?])\s+(?=[A-ZÀ-Ý0-9«\"])")
BRACKETS = re.compile(r"\s*[(\[][^()\[\]]*[)\]]")
# "X is a lake in Y" / "X est un village du Québec": only says what the place is.
PLAIN = re.compile(r"^.{0,80}?\b(is|was|est|était) (an?|une?)\b.{0,90}$", re.I)
BEST = re.compile(r"\b(largest|biggest|highest|tallest|longest|oldest|deepest|first|only|most|plus grand|plus haut|seul)\b", re.I)


def sentences(text: str) -> list[str]:
    text = text.split("\n")[0] if len(text.split("\n")[0]) > 60 else " ".join(text.split("\n")[:2])
    for _ in range(3):  # nested brackets
        text = BRACKETS.sub("", text)
    text = re.sub(r"\s+([,.;:])", r"\1", re.sub(r"\s{2,}", " ", text)).strip()
    return [s.strip() for s in SPLIT.split(text) if s.strip()]


def trim(s: str) -> str:
    """Long sentences end at the last comma that leaves at least 60 characters, else at a word with '…'."""
    if len(s) <= MAX:
        return s
    comma = max(s.rfind(", ", 0, MAX), s.rfind("; ", 0, MAX))
    if comma >= 60:
        return s[:comma] + "."
    cut = s[:MAX - 1]
    cut = cut[:cut.rfind(" ")] if " " in cut else cut
    return cut.rstrip(",;:–- ") + "…"


def flavour(text: str) -> str:
    ss = [s for s in sentences(text) if len(s) >= 25]
    if not ss:
        return ""
    first = ss[0]
    if PLAIN.match(first) and not BEST.search(first) and len(first) <= 140:
        nxt = next((s for s in ss[1:4] if 40 <= len(s) <= MAX and not s.lower().startswith(("see also", "voir aussi"))), None)
        if nxt:
            return nxt
    return trim(first)


def main():
    df = pd.read_parquet(INTERIM / "cards_ca.parquet")
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    df["flavour_lang"] = df["enwiki"].notna().map({True: "en", False: "fr"})
    df["flavour_title"] = df["enwiki"].fillna(df["frwiki"])
    for lang in ("en", "fr"):
        extracts(lang, sorted(df.loc[df["flavour_lang"] == lang, "flavour_title"].dropna().unique()), cache)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")

    df["flavour"] = [flavour(cache.get(f"{l}|{t}", "")) if isinstance(t, str) else ""
                     for l, t in zip(df["flavour_lang"], df["flavour_title"])]
    out = df[["id", "flavour", "flavour_lang", "flavour_title"]]
    out.to_parquet(INTERIM / "flavour_ca.parquet")

    has = df["flavour"] != ""
    print(f"\n{len(df):,} cards -> data/interim/flavour_ca.parquet; {has.mean():.0%} have flavour")
    print("By type (%):", (df.groupby("type")["flavour"].agg(lambda s: (s != "").mean() * 100)).round(0).to_dict())
    print("Language:", df.loc[has, "flavour_lang"].value_counts().to_dict(), "| cut with …:", int(df["flavour"].str.endswith("…").sum()))
    for t in ("town", "nature", "built"):
        s = df[(df["type"] == t) & has].sample(8, random_state=3)
        print(f"\n{t}:\n" + "\n".join(f"  {n}: {f}" for n, f in zip(s["name"], s["flavour"])))
    top = df[has].nlargest(8, "fame")
    print("\nMost famous:\n" + "\n".join(f"  {n}: {f}" for n, f in zip(top["name"], top["flavour"])))


if __name__ == "__main__":
    main()
