"""Step 3: natural landmarks and built landmarks for every country in countries.py, in one pass.

Replaced wikidata_ca.py (nature) and structures_ca.py (built) on 2026-11-24, when the launch pool grew
to all of North America.

Nature: Wikidata items whose direct class is in NATURE_CLASSES. Built: items whose class is any kind of
"architectural structure" (Q811430) with articles in at least MIN_SITELINKS Wikipedia languages, minus the
EXCLUDE classes. Both must have a coordinate and a Wikipedia article in English or in the home country's
local language (countries.py).

Home country and region come from the point (regions.assign), not from Wikidata's "country" (P17).
Border landmarks (developer, 2026-11-24): one card, homed where its point is, and tagged "also in" every
other North American country its P17 lists (Niagara Falls: home CA-ON, also in US). Items whose point is
in no country we build (or far offshore) are dropped.

SPARQL only lists item IDs: nature on query.wikidata.org, built on QLever (qlever.cs.uni-freiburg.de), a public
SPARQL engine over the same data, because the structure subclass walk times out on query.wikidata.org. Labels,
articles, countries, coordinates and elevations come from the Wikidata API (cached in data/raw/wd_entities.json).
Elevations are converted from feet where entered in feet.

    python pipeline/landmarks.py
Output: data/interim/<CC>/landmarks.parquet (nature) and structures.parquet (built) for every country,
        data/interim/structures_excluded.csv (excluded built items, for review)
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

import regions
from countries import COUNTRIES, interim

ROOT = Path(__file__).parent
CACHE_FILE = ROOT / "data" / "raw" / "qlever_cache.json"
ENDPOINT = "https://qlever.cs.uni-freiburg.de/api/wikidata"
WDQS = "https://query.wikidata.org/sparql"
BIG = {"US", "CA", "MX"}  # nature queried one class at a time
BORDER_KM = 10  # how far Wikidata's own country may be before the point's country wins
UA = {"User-Agent": "PullThePlanetPipeline/0.1 (https://github.com/SaafiRahman/EarthPull)",
      "Accept": "application/sparql-results+json"}
LANGS = sorted({l for c in COUNTRIES.values() for l in c.langs})  # en + every local language
QID_TO_CODE = {c.qid: c.code for c in COUNTRIES.values()}
MIN_SITELINKS = 3

# Wikidata class -> card kind. Direct "instance of" only (subclass walks over lakes are too big).
NATURE_CLASSES = {
    "Q8502": "mountain", "Q54050": "hill", "Q8072": "volcano", "Q35666": "glacier",
    "Q23397": "lake", "Q4022": "river", "Q34038": "waterfall", "Q39594": "bay",
    "Q23442": "island", "Q150784": "canyon", "Q46169": "national park",
    # Narrower classes items use instead of the ones above (found on Canada, 2026-11-23; Lake Louise is a
    # "glacial lake"). Underwater features and former lakes/rivers are left out.
    "Q211302": "lake", "Q131681": "lake", "Q1165822": "lake", "Q3215290": "lake", "Q188025": "lake",
    "Q9019918": "lake", "Q3507951": "lake", "Q7238039": "lake", "Q10671833": "lake", "Q66716634": "lake",
    "Q4366834": "river", "Q573344": "river", "Q2967706": "waterfall", "Q2270442": "waterfall",
    "Q162602": "island", "Q207524": "island", "Q1065592": "island", "Q202199": "island",
    "Q1132248": "glacier", "Q878077": "glacier", "Q46966": "glacier", "Q5474230": "glacier",
    "Q1896949": "national park", "Q46831": "mountain range",
}

# Built items are excluded if ANY of their class labels contains one of these words.
EXCLUDE = {
    "infrastructure": ["airport", "aerodrome", "airfield", "heliport", "seaplane base", "road", "street", "highway",
                       "route", "station", "railway", "interchange", "parking", "power station", "substation",
                       "pipeline", "transmission line", "rail yard", "ferry", "tunnel"],
    "organisation, not a place": ["business", "company", "enterprise", "chain", "brand", "organization",
                                  "organisation", "university", "college", "school", "library"],
    # Developer, 2026-11-23: offshore platforms are not cards (Ocean Ranger is a disaster site; Hibernia cannot be visited).
    "offshore platform": ["oil platform", "gravity-based structure", "drilling rig"],
    "military": ["forces base", "military base", "air base", "naval base", "radar station", "command"],
    # Memorials are allowed as cards (developer, 2026-11-23); burial sites stay out.
    "sensitive (roadmap: exclude)": ["cemetery", "grave", "tomb", "mausoleum", "prison", "penitentiar",
                                     "jail", "correctional", "residential school", "hospital",
                                     "wreck", "disaster"],
    "too generic or not visitable": ["mine", "landfill", "sewage", "water treatment", "office building",
                                     "apartment building", "residential building", "condominium", "factory",
                                     "generating station", "nuclear", "police", "border crossing", "trail",
                                     "movie theater", "cinema"],
    "already a lake card": ["reservoir"],
}
# Landmark types kept even when another class matches EXCLUDE ("road bridge", "library building").
# Sensitive sites are never rescued.
ALWAYS_KEEP = ["bridge", "tower", "lighthouse", "castle", "fort", "cathedral", "basilica", "church", "stadium",
               "arena", "palace", "skyscraper", "library building", "observation",
               # 2026-11-25: museums are often also a "nonprofit organization" (the Met, MoMA) and dams a
               # "power station" (Hoover Dam); the building is the card.
               "museum", "art gallery", "dam"]
# Generic buildings (apartments, offices) are kept only when this famous: Habitat 67 has 26.
FAMOUS_SITELINKS = 15
FAMOUS_BUILDING_TYPES = ["office building", "apartment building", "residential building", "condominium"]

PREFIXES = """PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/> PREFIX psn: <http://www.wikidata.org/prop/statement/value-normalized/>
PREFIX wikibase: <http://wikiba.se/ontology#> PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <http://schema.org/>
"""
# SPARQL only lists item IDs (cheap); details come from the Wikidata API (entities). Asking SPARQL for labels,
# articles and countries too timed out on US mountains (2026-11-24).
NATURE_QUERY = PREFIXES + """SELECT DISTINCT ?i ?cls WHERE {
  VALUES ?cls { %(classes)s }
  ?i wdt:P31 ?cls ; wdt:P17 wd:%(country)s ; wdt:P625 ?loc .
  ?art schema:about ?i ; schema:isPartOf <https://%(wiki)s.wikipedia.org/> .
}"""
BUILT_QUERY = PREFIXES + """SELECT DISTINCT ?i WHERE {
  VALUES ?ctry { %(countries)s }
  ?i wdt:P17 ?ctry ; wikibase:sitelinks ?sl ; wdt:P625 ?loc . FILTER(?sl >= %(min)d)
  ?i wdt:P31/wdt:P279* wd:Q811430 .
}"""
BUILT_ONE = BUILT_QUERY.replace("VALUES ?ctry { %(countries)s }\n  ?i wdt:P17 ?ctry", "?i wdt:P17 wd:%(country)s")
WD_API = "https://www.wikidata.org/w/api.php"
ENT_CACHE = ROOT / "data" / "raw" / "wd_entities.json"
METRE, FOOT = "http://www.wikidata.org/entity/Q11573", "http://www.wikidata.org/entity/Q3710"
EARTH = "http://www.wikidata.org/entity/Q2"


def query(q: str, endpoint: str) -> list[dict]:
    """One SPARQL query, answers cached by query text. QLever answers a burst of heavy queries with 429 and then
    refuses everything for a while (2026-11-24), so waits after an error are long and grow."""
    cache = json.loads(CACHE_FILE.read_text(encoding="utf-8")) if CACHE_FILE.exists() else {}
    key = hashlib.sha1(q.encode()).hexdigest()
    if key not in cache:
        for attempt in range(5):
            try:
                r = requests.post(endpoint, data={"query": q}, headers=UA, timeout=600)
            except requests.exceptions.RequestException as e:  # dropped connection: wait and retry
                print(f"  {endpoint.split('/')[2]}: {type(e).__name__}, retrying in 60 s", flush=True)
                time.sleep(60)
                continue
            if r.status_code in (429, 500, 502, 503, 504):
                wait = int(r.headers.get("Retry-After") or 0) or 120 * (attempt + 1)
                print(f"  {endpoint.split('/')[2]} {r.status_code}, waiting {wait} s", flush=True)
                time.sleep(wait)
                continue
            r.raise_for_status()
            try:
                bindings = r.json()["results"]["bindings"]
            except ValueError:  # the query service cuts an answer off mid-stream when it runs out of time
                time.sleep(5)
                raise RuntimeError(f"answer cut off by {endpoint}; split the query further") from None
            break
        else:
            r.raise_for_status()
        cache[key] = [{k: v["value"] for k, v in b.items()} for b in bindings]
        CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
        time.sleep(5 if endpoint == ENDPOINT else 1)  # be gentle with the public endpoints
    return cache[key]


def _qid(uri: str) -> str:
    return uri.rsplit("/", 1)[1]


def _api(params: dict) -> dict:
    for attempt in range(8):
        r = requests.post(WD_API, data={**params, "format": "json"}, headers=UA, timeout=120)
        lag = r.ok and r.json().get("error", {}).get("code") == "maxlag"
        if r.status_code in (429, 500, 502, 503, 504) or lag:
            time.sleep(int(r.headers.get("Retry-After") or 0) or min(60, 5 * 2 ** attempt))
            continue
        r.raise_for_status()
        return r.json()
    raise RuntimeError("Wikidata API kept failing")


def _vals(claims: dict, prop: str) -> list:
    return [s["mainsnak"]["datavalue"]["value"] for s in claims.get(prop, [])
            if s.get("rank") != "deprecated" and "datavalue" in s.get("mainsnak", {})]


def entities(qids: list[str]) -> dict[str, dict]:
    """Compact facts per item, cached in data/raw/wd_entities.json: labels and article titles in LANGS,
    sitelink count, P17 and P31 item ids, first Earth coordinate, highest elevation in metres."""
    cache = json.loads(ENT_CACHE.read_text(encoding="utf-8")) if ENT_CACHE.exists() else {}
    todo = [q for q in dict.fromkeys(qids) if q not in cache]
    if todo:
        print(f"  Wikidata API: {len(todo):,} items to fetch ({len(qids) - len(todo):,} cached)", flush=True)
    batches = [todo[i:i + 50] for i in range(0, len(todo), 50)]

    def one(batch):
        ents = _api({"action": "wbgetentities", "ids": "|".join(batch), "props": "labels|sitelinks|claims",
                     "languages": "|".join(LANGS)})["entities"]
        out = {}
        for q, e in ents.items():
            cl = e.get("claims", {})
            pts = [v for v in _vals(cl, "P625") if v.get("globe", EARTH) == EARTH]
            elev = [float(v["amount"]) * (0.3048 if v.get("unit") == FOOT else 1) for v in _vals(cl, "P2044")
                    if v.get("unit") in (METRE, FOOT)]
            sl = e.get("sitelinks", {})
            out[q] = {"l": {k: v["value"] for k, v in e.get("labels", {}).items()},
                      "s": {l: sl[f"{l}wiki"]["title"] for l in LANGS if f"{l}wiki" in sl},
                      "n": sum(1 for k in sl if k.endswith("wiki") and k != "commonswiki"),
                      "p17": [v["id"] for v in _vals(cl, "P17")], "p31": [v["id"] for v in _vals(cl, "P31")],
                      "c": [pts[0]["latitude"], pts[0]["longitude"]] if pts else None,
                      "e": max(elev) if elev else None}
        return out

    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(3) as pool:
        for n, res in enumerate(pool.map(one, batches), 1):
            cache.update(res)
            if n % 100 == 0 or n == len(batches):
                print(f"    {n * 50:,}/{len(todo):,}", flush=True)
                ENT_CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    return {q: cache[q] for q in qids if q in cache}


def class_labels(qids: set[str]) -> dict[str, str]:
    """English labels of class items (for the built-landmark exclusion words), cached with the entities."""
    cache = json.loads(ENT_CACHE.read_text(encoding="utf-8")) if ENT_CACHE.exists() else {}
    todo = sorted(q for q in qids if f"label|{q}" not in cache)
    for i in range(0, len(todo), 50):
        ents = _api({"action": "wbgetentities", "ids": "|".join(todo[i:i + 50]), "props": "labels",
                     "languages": "en"})["entities"]
        for q, e in ents.items():
            cache[f"label|{q}"] = e.get("labels", {}).get("en", {}).get("value", "")
    if todo:
        ENT_CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    return {q: cache.get(f"label|{q}", "") for q in qids}


def tidy(qids: list[str]) -> pd.DataFrame:
    """Details for each item; home it by its point and pick its names and articles."""
    ent = entities(qids)
    rows = [{"qid": q, "sitelinks": e["n"], "lat": e["c"][0], "lon": e["c"][1], "elevation_m": e["e"],
             "p17": sorted({QID_TO_CODE[c] for c in e["p17"] if c in QID_TO_CODE}), "p31": e["p31"],
             "labels": e["l"], "arts": e["s"]} for q, e in ent.items() if e["c"]]
    df = pd.DataFrame(rows)
    home = regions.assign(df["lat"], df["lon"])
    df = df.join(home[["country", "region", "region_name"]])
    # Natural Earth borders are off by up to a few km, which put Detroit's Renaissance Center and the American
    # Falls in Ontario (2026-11-24). When the point's country is not one Wikidata gives but one of those is
    # within BORDER_KM, Wikidata wins. Wrong tags far from the border (the Adirondacks, "in Quebec") still move.
    off = df[df["country"].notna() & pd.Series([c not in p and len(p) > 0 for c, p in zip(df["country"], df["p17"])],
                                                index=df.index)]
    if len(off):
        reg = regions.admin1().to_crs(regions.EQUAL_AREA)
        pts = gpd.GeoSeries(gpd.points_from_xy(off["lon"], off["lat"]), index=off.index, crs="EPSG:4326").to_crs(regions.EQUAL_AREA)
        for i, p in pts.items():
            cand = reg[reg["country"].isin(df.at[i, "p17"])]
            d = cand.distance(p)
            if len(d) and d.min() <= BORDER_KM * 1000:
                j = d.idxmin()
                df.loc[i, ["country", "region", "region_name"]] = cand.loc[j, ["country", "region", "region_name"]].to_list()
    df["local"] = df["country"].map(lambda c: COUNTRIES[c].local if isinstance(c, str) else None)
    df["enwiki"] = df["arts"].map(lambda a: a.get("en"))
    df["lwiki"] = [a.get(l) if l and l != "en" else None for a, l in zip(df["arts"], df["local"])]
    df["name_en"] = df["labels"].map(lambda d: d.get("en"))
    df["name_local"] = [d.get(l) if l else None for d, l in zip(df["labels"], df["local"])]
    df["name"] = df["name_en"].fillna(df["name_local"]).fillna(df["enwiki"]).fillna(df["lwiki"])
    df["also_in"] = [[c for c in p if c != h] for p, h in zip(df["p17"], df["country"])]
    df["province"] = df["region_name"]  # older steps read "province"
    df["local_lang"] = df["local"]
    return df


def nature() -> pd.DataFrame:
    # Items with an article in English or the country's local language, one query per country and wiki.
    # The query service's 60 s limit (2026-11-24): a list of countries, a list of wikis or every class at once
    # overruns for big countries; one class at a time is fast (US mountains with an English article: 6 s).
    # Small countries try every class at once and fall back to one class at a time.
    allc = " ".join(f"wd:{q}" for q in NATURE_CLASSES)
    rows = []
    for c in COUNTRIES.values():
        got = []
        for wiki in c.langs:
            one = lambda cls: query(NATURE_QUERY % {"classes": cls, "country": c.qid, "wiki": wiki}, WDQS)
            try:
                if c.code in BIG:
                    raise RuntimeError("big country")
                got += one(allc)
            except RuntimeError:
                got += [r for q in NATURE_CLASSES for r in one(f"wd:{q}")]
        rows += got
        print(f"  nature {c.code}: {len({r['i'] for r in got}):,} items", flush=True)
    ids = pd.DataFrame(rows).assign(qid=lambda d: d["i"].map(_qid), cls=lambda d: d["cls"].map(_qid))
    kinds = ids.groupby("qid")["cls"].agg(lambda s: ", ".join(sorted({NATURE_CLASSES[c] for c in s})))
    df = tidy(sorted(kinds.index))
    df["kind"] = df["qid"].map(kinds)
    return df


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


def built() -> pd.DataFrame:
    # The subclass walk over ~20,000 structure classes needs QLever. It allows only a few queries in a while
    # (429, then minutes of refusals, 2026-11-24), so: the three big countries alone, everyone else together.
    qids = []
    rest = [c for c in COUNTRIES.values() if c.code not in BIG]
    for name, group in [(c, [COUNTRIES[c]]) for c in sorted(BIG)] + [("the rest", rest)]:
        q = (BUILT_ONE % {"country": group[0].qid, "min": MIN_SITELINKS} if len(group) == 1 else
             BUILT_QUERY % {"countries": " ".join(f"wd:{c.qid}" for c in group), "min": MIN_SITELINKS})
        got = query(q, ENDPOINT)
        qids += [_qid(r["i"]) for r in got]
        print(f"  built {name}: {len(got):,}", flush=True)
    df = tidy(sorted(set(qids)))
    names = class_labels({c for l in df["p31"] for c in l})
    df["classes"] = df["p31"].map(lambda l: sorted({names[c] for c in l if names.get(c)}))
    df["excluded"] = [exclusion(c, s) for c, s in zip(df["classes"], df["sitelinks"])]
    fixes = pd.read_csv(ROOT / "overrides.csv", comment="#")  # hand "keep" fixes beat the exclusion words
    df.loc[df["qid"].isin(fixes.loc[fixes["action"] == "keep", "id"].str.removeprefix("wd:")), "excluded"] = None
    df["kind"] = df["classes"].map(lambda l: ", ".join(l[:3]))
    return df


def report(name: str, df: pd.DataFrame, kept: pd.DataFrame):
    print(f"\n{name}: {len(df):,} items with a North American country; kept {len(kept):,}")
    print("  dropped, point in no country we build:", int(df["country"].isna().sum()),
          "| no English or local article:", int((df["country"].notna() & df["enwiki"].isna() & df["lwiki"].isna()).sum()))
    print("  home differs from Wikidata's country:", int((kept["country"] != kept["p17"].str[0]).where(kept["p17"].str.len() == 1).sum()),
          "| border (also in another country):", int((kept["also_in"].str.len() > 0).sum()))
    print("  by country:", kept["country"].value_counts().to_dict())


def main():
    cols = ["qid", "name", "name_en", "name_local", "kind", "sitelinks", "enwiki", "lwiki", "local_lang",
            "lat", "lon", "country", "region", "region_name", "province", "also_in"]
    n = nature()
    nk = n[n["country"].notna() & (n["enwiki"].notna() | n["lwiki"].notna())]
    report("Nature", n, nk)
    print("  by kind:", nk["kind"].value_counts().head(12).to_dict())

    b = built()
    b = b[~b["qid"].isin(nk["qid"])]  # a national park that is also a structure stays a nature card
    has = b["country"].notna() & (b["enwiki"].notna() | b["lwiki"].notna())
    bk = b[has & b["excluded"].isna()]
    excl = b[has & b["excluded"].notna()]
    report("Built", b[has | b["country"].isna()], bk)
    print("  excluded by reason:", excl["excluded"].str.split(":").str[0].value_counts().to_dict())
    excl[["qid", "name", "country", "sitelinks", "excluded"]].sort_values("sitelinks", ascending=False).to_csv(
        ROOT / "data" / "interim" / "structures_excluded.csv", index=False, encoding="utf-8")

    for code in COUNTRIES:
        d = interim(code)
        for df, fname, extra in ((nk, "landmarks.parquet", ["elevation_m"]), (bk, "structures.parquet", ["classes"])):
            part = df[df["country"] == code][cols + extra].reset_index(drop=True)
            gpd.GeoDataFrame(part, geometry=gpd.points_from_xy(part["lon"], part["lat"]), crs="EPSG:4326").to_parquet(d / fname)

    border = pd.concat([nk, bk])
    border = border[border["also_in"].str.len() > 0].nlargest(20, "sitelinks")
    print("\nBest-known border landmarks:", "; ".join(f"{r.name} ({r.region}, also {'/'.join(r.also_in)})"
                                                     for r in border.itertuples()))
    print("Wrote data/interim/<CC>/landmarks.parquet and structures.parquet for", len(COUNTRIES), "countries")


if __name__ == "__main__":
    main()
