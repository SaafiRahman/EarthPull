"""Step 9 (Canada): find a photo for every card, with its author and licence. Nothing is downloaded here.

Candidates, in order:
  1. Wikidata image (P18) of the card's item
  2. the lead image of its Wikipedia article (pageimages), English then French
Each candidate is looked up on Wikimedia Commons (imageinfo + extmetadata). It is rejected when:
  - it is not on Commons (a local Wikipedia file may be non-free fair use)
  - it is a drawing rather than a photo: SVG/PNG maps, flags, logos, coats of arms, seals, locator maps,
    diagrams (by file type and by words in the file name or Commons description)
  - it is small (shorter side under 400 px) or its licence is missing
Cards with no usable photo get a mini-map later (see Game Design).

    python pipeline/images_ca.py               every card
    python pipeline/images_ca.py --sample 600  a random sample, to check the photo vs mini-map split first
Input:  data/interim/cards_ca.parquet
Output: data/interim/images_ca.parquet (id, image file, thumbnail url, width, height, author, licence,
        licence url, source) and a printed summary. Answers are cached in data/raw/images_cache.json.
"""
import argparse
import html
import json
import re
import time
from pathlib import Path

import pandas as pd
import requests

ROOT = Path(__file__).parent
INTERIM = ROOT / "data" / "interim"
CACHE = ROOT / "data" / "raw" / "images_cache.json"
UA = {"User-Agent": "PullThePlanetPipeline/0.1 (https://github.com/SaafiRahman/EarthPull)"}
THUMB = 640  # thumbnail width requested from Commons
MIN_SIDE = 400
NOT_PHOTO = re.compile(r"\b(map|maps|karte|carte|locat\w*|locator|flag|drapeau|logo|coat[ _]of[ _]arms|armoiries|"
                       r"blason|coa|seal|emblem|diagram|plan|schema|icon|signature|wordmark)\b", re.I)

session = requests.Session()
session.headers.update(UA)


def api(url: str, params: dict) -> dict:
    for attempt in range(6):
        r = session.post(url, data={**params, "format": "json", "formatversion": 2}, timeout=60)
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(int(r.headers.get("Retry-After") or 0) or 2 ** attempt)
            continue
        r.raise_for_status()
        return r.json()
    raise RuntimeError(f"gave up on {url}")


def wikidata_p18(qids: list[str], cache: dict):
    todo = [q for q in qids if f"p18|{q}" not in cache]
    for i in range(0, len(todo), 50):
        ents = api("https://www.wikidata.org/w/api.php", {"action": "wbgetentities", "ids": "|".join(todo[i:i + 50]),
                                                          "props": "claims"})["entities"]
        for q, e in ents.items():
            st = [s for s in e.get("claims", {}).get("P18", []) if s.get("rank") != "deprecated"]
            st.sort(key=lambda s: s.get("rank") != "preferred")
            cache[f"p18|{q}"] = next((s["mainsnak"]["datavalue"]["value"] for s in st if "datavalue" in s["mainsnak"]), "")
        if i % 2500 == 0:
            print(f"  Wikidata images {i + 50:,}/{len(todo):,}", flush=True)


def page_images(lang: str, titles: list[str], cache: dict):
    todo = [t for t in titles if f"pi|{lang}|{t}" not in cache]
    for i in range(0, len(todo), 50):
        batch = todo[i:i + 50]
        q = api(f"https://{lang}.wikipedia.org/w/api.php", {"action": "query", "prop": "pageimages", "piprop": "name",
                                                            "redirects": 1, "titles": "|".join(batch)})["query"]
        norm = {n["from"]: n["to"] for n in q.get("normalized", [])}
        redir = {r["from"]: r["to"] for r in q.get("redirects", [])}
        img = {p["title"]: p.get("pageimage", "") for p in q.get("pages", [])}
        for t in batch:
            n = norm.get(t, t)
            cache[f"pi|{lang}|{t}"] = img.get(redir.get(n, n), "")


def commons_info(files: list[str], cache: dict):
    todo = [f for f in files if f and f"ci|{f}" not in cache]
    for i in range(0, len(todo), 50):
        batch = todo[i:i + 50]
        q = api("https://commons.wikimedia.org/w/api.php", {
            "action": "query", "prop": "imageinfo", "titles": "|".join("File:" + f for f in batch),
            "iiprop": "url|size|mime|extmetadata", "iiurlwidth": THUMB,
            "iiextmetadatafilter": "Artist|LicenseShortName|LicenseUrl|ImageDescription|Categories"})["query"]
        norm = {n["from"]: n["to"] for n in q.get("normalized", [])}
        pages = {p["title"]: p for p in q.get("pages", [])}
        for f in batch:
            p = pages.get(norm.get("File:" + f, "File:" + f), {})
            ii = (p.get("imageinfo") or [None])[0]
            if p.get("missing") or not ii:
                cache[f"ci|{f}"] = None  # not on Commons (local file, maybe non-free)
                continue
            md = {k: v.get("value", "") for k, v in ii.get("extmetadata", {}).items()}
            cache[f"ci|{f}"] = {"w": ii.get("width"), "h": ii.get("height"), "mime": ii.get("mime"),
                                "thumb": ii.get("thumburl"), "page": ii.get("descriptionurl"),
                                "author": plain(md.get("Artist", "")), "licence": md.get("LicenseShortName", ""),
                                "licence_url": md.get("LicenseUrl", ""),
                                "desc": plain(md.get("ImageDescription", ""))[:300], "cats": md.get("Categories", "")}
        if i % 2500 == 0:
            print(f"  Commons {i + 50:,}/{len(todo):,}", flush=True)


def plain(s: str) -> str:
    """Commons metadata is HTML; keep the text. "No machine-readable author provided. X~commonswiki assumed
    (...)" becomes "X"."""
    s = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()
    m = re.match(r"No machine-readable author provided\. (.+?) assumed", s)
    return re.sub(r"~\w+wiki$", "", m.group(1)) if m else s


def why_not(f: str, info) -> str:
    """'' if usable, else the reason it is rejected."""
    if info is None:
        return "not on Commons"
    if info["mime"] not in ("image/jpeg", "image/webp", "image/tiff"):
        return "drawing (" + str(info["mime"]).split("/")[-1] + ")"
    words = f.replace("_", " ") + " " + info["desc"] + " " + info["cats"].replace("|", " ")
    if NOT_PHOTO.search(f.replace("_", " ")) or re.search(r"\b(locator maps?|maps of|flags of|coats of arms)\b", words, re.I):
        return "map, flag or logo"
    if min(info["w"] or 0, info["h"] or 0) < MIN_SIDE:
        return "too small"
    if not info["licence"]:
        return "no licence"
    return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=0)
    args = ap.parse_args()
    df = pd.read_parquet(INTERIM / "cards_ca.parquet")
    if args.sample:
        df = df.groupby("type").sample(args.sample // 3, random_state=11)  # the same number of each type
    cache = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}

    wikidata_p18(sorted(df["qid"].dropna().unique()), cache)
    for lang in ("en", "fr"):
        page_images(lang, sorted(df[f"{lang}wiki"].dropna().unique()), cache)
    cands = {r.id: [c for c in (cache.get(f"p18|{r.qid}") if isinstance(r.qid, str) else "",
                                cache.get(f"pi|en|{r.enwiki}") if isinstance(r.enwiki, str) else "",
                                cache.get(f"pi|fr|{r.frwiki}") if isinstance(r.frwiki, str) else "") if c]
             for r in df.itertuples()}
    commons_info(sorted({f.replace(" ", "_") for fs in cands.values() for f in fs}), cache)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")

    rows = []
    for r in df.itertuples():
        reasons, pick = [], None
        for src, f in zip(("wikidata", "wikipedia", "wikipedia"), cands[r.id]):
            f = f.replace(" ", "_")
            reason = why_not(f, cache.get(f"ci|{f}"))
            if not reason:
                pick = (src, f, cache[f"ci|{f}"])
                break
            reasons.append(reason)
        if pick:
            src, f, i = pick
            rows.append({"id": r.id, "image": f, "thumb": i["thumb"], "width": i["w"], "height": i["h"],
                         "author": i["author"] or "Unknown author", "licence": i["licence"],
                         "licence_url": i["licence_url"], "page": i["page"], "source": src, "reject": ""})
        else:
            rows.append({"id": r.id, "image": None, "source": "mini-map",
                         "reject": "; ".join(dict.fromkeys(reasons)) or "no image anywhere"})
    out = df[["id", "name", "type", "kind", "rarity"]].merge(pd.DataFrame(rows), on="id")
    if not args.sample:
        out.drop(columns=["name", "type", "kind", "rarity"]).to_parquet(INTERIM / "images_ca.parquet")

    has = out["image"].notna()
    print(f"\n{len(out):,} cards{' (sample)' if args.sample else ''}: {has.mean():.0%} have a usable photo")
    print("By type (% photo):", (out.groupby("type")["image"].agg(lambda s: s.notna().mean() * 100)).round(0).to_dict())
    print("By rarity (% photo):", (out.groupby("rarity")["image"].agg(lambda s: s.notna().mean() * 100)).round(0).to_dict())
    print("Photo found via:", out.loc[has, "source"].value_counts().to_dict())
    print("Why no photo:", out.loc[~has, "reject"].value_counts().head(8).to_dict())
    print("Licences:", out.loc[has, "licence"].value_counts().head(8).to_dict())
    pd.set_option("display.width", 220, "display.max_colwidth", 70)
    print("\nPhotos (random 12):\n" + out[has].sample(min(12, int(has.sum())), random_state=2)[["name", "kind", "image", "author", "licence"]].to_string(index=False))
    rej = out[~has & out["reject"].str.contains("map|small|drawing")]
    print("\nRejected (random 10):\n" + rej.sample(min(10, len(rej)), random_state=2)[["name", "kind", "reject"]].to_string(index=False))


if __name__ == "__main__":
    main()
