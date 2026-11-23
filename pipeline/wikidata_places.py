"""Look up what Wikidata says a GeoNames place is (town, neighbourhood, borough...).

For each place, find Wikidata items with the same English or French label within RADIUS_KM
of its point, and return their "instance of" (P31) classes. Responses are cached in
data/raw/wikidata_cache.json, so reruns don't hit the query service again.
"""
import json
import time
from pathlib import Path

import requests

ROOT = Path(__file__).parent
CACHE_FILE = ROOT / "data" / "raw" / "wikidata_cache.json"
ENDPOINT = "https://query.wikidata.org/sparql"
UA = {"User-Agent": "EarthpullPipeline/0.1 (data pipeline)", "Accept": "application/sparql-results+json"}
RADIUS_KM = 5

QUERY = """
SELECT ?item ?label ?dist ?enwiki ?frwiki (GROUP_CONCAT(DISTINCT ?classLabel; separator="|") AS ?classes) WHERE {
  SERVICE wikibase:around {
    ?item wdt:P625 ?loc .
    bd:serviceParam wikibase:center "Point(%(lon)s %(lat)s)"^^geo:wktLiteral ;
                    wikibase:radius "%(radius)s" ; wikibase:distance ?dist .
  }
  ?item rdfs:label ?label .
  FILTER(LANG(?label) IN ("en", "fr") && LCASE(STR(?label)) = LCASE(%(name)s))
  OPTIONAL { ?item wdt:P31 ?class . ?class rdfs:label ?classLabel . FILTER(LANG(?classLabel) = "en") }
  OPTIONAL { ?enwiki schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  OPTIONAL { ?frwiki schema:about ?item ; schema:isPartOf <https://fr.wikipedia.org/> }
}
GROUP BY ?item ?label ?dist ?enwiki ?frwiki
ORDER BY ?dist
"""


def _load():
    return json.loads(CACHE_FILE.read_text(encoding="utf-8")) if CACHE_FILE.exists() else {}


def lookup(name: str, lat: float, lon: float, cache: dict) -> list[dict]:
    """Matching Wikidata items, nearest first: [{qid, label, dist_km, classes: [...]}]."""
    key = f"v2|{name}|{lat:.5f}|{lon:.5f}"
    if key not in cache:
        q = QUERY % {"lon": lon, "lat": lat, "radius": RADIUS_KM, "name": json.dumps(name)}
        for attempt in range(5):
            r = requests.get(ENDPOINT, params={"query": q}, headers=UA, timeout=90)
            if r.status_code in (429, 500, 502, 503, 504):
                time.sleep(int(r.headers.get("Retry-After") or 0) or 5 * (attempt + 1))
                continue
            r.raise_for_status()
            break
        else:
            r.raise_for_status()
        cache[key] = [{"qid": b["item"]["value"].rsplit("/", 1)[1], "label": b["label"]["value"],
                       "dist_km": round(float(b["dist"]["value"]), 2),
                       "enwiki": b.get("enwiki", {}).get("value"), "frwiki": b.get("frwiki", {}).get("value"),
                       "classes": [c for c in b.get("classes", {}).get("value", "").split("|") if c]}
                      for b in r.json()["results"]["bindings"]]
        CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
        time.sleep(0.5)  # be polite to the public endpoint
    return cache[key]


def lookup_many(rows) -> dict:
    """rows: iterable of (index, name, lat, lon). Returns {index: [matches]}."""
    cache = _load()
    return {idx: lookup(name, lat, lon, cache) for idx, name, lat, lon in rows}


# Class names (English labels of P31 values) used to tell real towns from neighbourhoods.
MUNICIPALITY = ("town", "city", "village", "former ", "police village", "municipality")  # label prefixes
NEIGHBOURHOOD = ("neighborhood", "neighbourhood", "borough", "arrondissement", "suburb", "residential area",
                 "quarter", "central business district", "administrative sector")
SETTLEMENT = ("human settlement", "urban-type settlement", "community", "hamlet", "locality",
              "population centre", "designated place", "historic village")
NOT_A_PLACE = ("electoral district", "station", "parish", "post office", "weather")


def category(label: str) -> str | None:
    """Sort one P31 label. Neighbourhood words win ("neighbourhood of Quebec City" is not a city);
    municipality labels must start with the word ("Greektown" is not a town)."""
    l = label.lower()
    if any(x in l for x in NOT_A_PLACE):
        return None
    if any(w in l for w in NEIGHBOURHOOD):
        return "neighbourhood"
    if l.startswith(MUNICIPALITY):
        return "municipality"
    if any(w in l for w in SETTLEMENT):
        return "settlement"
    return None


def verdict(matches: list[dict]) -> tuple[str, str]:
    """('keep' | 'drop', reason) for a place the boundary rule flagged as a possible neighbourhood."""
    if not matches:
        return "drop", "no Wikidata match"
    cats = {category(c) for m in matches for c in m["classes"]}
    if "municipality" in cats:
        return "keep", "municipality"
    if "neighbourhood" in cats:
        return "drop", "neighbourhood"
    if "settlement" in cats and any(m.get("enwiki") or m.get("frwiki") for m in matches):
        return "keep", "settlement with Wikipedia article"  # bare "urban-type settlement" items are often neighbourhoods
    return "drop", "no place class"
