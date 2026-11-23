"""Paper prototype: fetch real data for 30 hand-picked places and compute card stats.

Sources: Wikidata (population P1082, elevation P2044, coordinates P625),
Wikimedia Pageviews API (12 months of en.wikipedia views), Open-Meteo archive
(2025 mean daily temperature, and elevation when Wikidata has none).

Run: python prototype/fetch_cards.py   ->  writes prototype/cards.json
"""
import json, math, os, random, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

HERE = Path(__file__).parent
UA = {"User-Agent": "EarthpullPaperPrototype/0.1 (one-off research script)"}

# (enwiki title, display name, country, tier, type). Tiers hand-picked per the roadmap's
# "What lands here" column. Type is hand-assigned for the prototype.
PLACES = [
    # Common (17): small towns and minor features; 8 Canadian
    ("Tofino", "Tofino", "Canada", "Common", "Coastal"),
    ("Gimli, Manitoba", "Gimli", "Canada", "Common", "Forest"),
    ("Lunenburg, Nova Scotia", "Lunenburg", "Canada", "Common", "Coastal"),
    ("Inuvik", "Inuvik", "Canada", "Common", "Tundra"),
    ("Flin Flon", "Flin Flon", "Canada", "Common", "Forest"),
    ("Dawson City", "Dawson City", "Canada", "Common", "Tundra"),
    ("Canmore, Alberta", "Canmore", "Canada", "Common", "Mountain"),
    ("Churchill, Manitoba", "Churchill", "Canada", "Common", "Tundra"),
    ("Uyuni", "Uyuni", "Bolivia", "Common", "Desert"),
    ("Oymyakon", "Oymyakon", "Russia", "Common", "Tundra"),
    ("Longyearbyen", "Longyearbyen", "Norway", "Common", "Tundra"),
    ("Hallstatt", "Hallstatt", "Austria", "Common", "Mountain"),
    ("Timbuktu", "Timbuktu", "Mali", "Common", "Desert"),
    ("La Rinconada, Peru", "La Rinconada", "Peru", "Common", "Mountain"),
    ("Llanfairpwllgwyngyll", "Llanfairpwllgwyngyll", "United Kingdom", "Common", "Coastal"),
    ("Truth or Consequences, New Mexico", "Truth or Consequences", "United States", "Common", "Desert"),
    ("Ushuaia", "Ushuaia", "Argentina", "Common", "Coastal"),
    # Rare (7): mid-size cities, notable lakes and peaks
    ("Kelowna", "Kelowna", "Canada", "Rare", "Forest"),
    ("Thunder Bay", "Thunder Bay", "Canada", "Rare", "Forest"),
    ("Lake Louise (Alberta)", "Lake Louise", "Canada", "Rare", "Mountain"),
    ("Mount Robson", "Mount Robson", "Canada", "Rare", "Mountain"),
    ("Hobart", "Hobart", "Australia", "Rare", "Coastal"),
    ("Bergen", "Bergen", "Norway", "Rare", "Coastal"),
    ("Arequipa", "Arequipa", "Peru", "Rare", "Desert"),
    # Epic (3): major cities, national parks
    ("Vancouver", "Vancouver", "Canada", "Epic", "Coastal"),
    ("Banff National Park", "Banff National Park", "Canada", "Epic", "Mountain"),
    ("Marrakesh", "Marrakesh", "Morocco", "Epic", "Desert"),
    # Legendary (2): capitals
    ("Tokyo", "Tokyo", "Japan", "Legendary", "Urban"),
    ("Ottawa", "Ottawa", "Canada", "Legendary", "Urban"),
    # Mythic (1)
    ("Mount Everest", "Mount Everest", "Nepal / China", "Mythic", "Mountain"),
]
CAPS = {"Common": None, "Rare": 1000, "Epic": 100, "Legendary": 10, "Mythic": 1}


CACHE_FILE = HERE / ".cache.json"  # git-ignored; avoids re-hitting rate-limited APIs
CACHE = json.loads(CACHE_FILE.read_text(encoding="utf-8")) if CACHE_FILE.exists() else {}


def get(url, params=None):
    if params:
        url += "?" + urllib.parse.urlencode(params)
    if url in CACHE:
        return CACHE[url]
    for attempt in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
                data = json.load(r)
            CACHE[url] = data
            CACHE_FILE.write_text(json.dumps(CACHE), encoding="utf-8")
            time.sleep(1)
            return data
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or attempt == 5:
                raise
            time.sleep(int(e.headers.get("Retry-After") or 0) or 10 * (attempt + 1))


def amount(claim):
    return float(claim["mainsnak"]["datavalue"]["value"]["amount"])


def latest_population(claims):
    best = None
    for c in claims.get("P1082", []):
        if "datavalue" not in c["mainsnak"]:
            continue
        t = c.get("qualifiers", {}).get("P585", [{}])[0].get("datavalue", {}).get("value", {}).get("time", "")
        key = (c.get("rank") == "preferred", t)
        if best is None or key > best[0]:
            best = (key, amount(c), t[1:5])
    return (best[1], best[2]) if best else (None, None)


def elevation_m(claims, dem, peak=False):
    """Wikidata can hold several elevations (Hobart has 1270 m and 54 m). For towns, pick the one
    closest to the terrain height at the coordinate; for peaks, the highest. A preferred-rank
    value beats both (Everest has six values from different surveys). Fall back to the terrain height."""
    vals, preferred = [], []
    for c in claims.get("P2044", []):
        if "datavalue" not in c["mainsnak"]:
            continue
        v = amount(c)
        if c["mainsnak"]["datavalue"]["value"]["unit"].endswith("Q3710"):  # foot
            v *= 0.3048
        vals.append(v)
        if c.get("rank") == "preferred":
            preferred.append(v)
    if preferred:  # Wikidata's own "current best value" wins (Everest: 8848.86)
        return preferred[0]
    if not vals:
        return dem
    return max(vals) if peak else min(vals, key=lambda v: abs(v - dem))


def geonames_population(name, lat, lon):
    """Fallback when Wikidata has no population: GeoNames cities1000, nearest same-name row within ~25 km.
    Set GEONAMES_CITIES1000 to the extracted cities1000.txt."""
    path = os.environ.get("GEONAMES_CITIES1000")
    if not path:
        return None
    best = None
    with open(path, encoding="utf-8") as f:
        for row in f:
            p = row.split("\t")
            if p[1] != name and name not in p[3].split(","):
                continue
            d = (float(p[4]) - lat) ** 2 + (float(p[5]) - lon) ** 2
            if d < 0.05 and (best is None or d < best[0]):
                best = (d, int(p[14]))
    return best[1] if best else None


def main():
    titles = [p[0] for p in PLACES]
    ents = {}
    for i in range(0, len(titles), 25):
        d = get("https://www.wikidata.org/w/api.php", {
            "action": "wbgetentities", "sites": "enwiki", "titles": "|".join(titles[i:i + 25]),
            "props": "claims|sitelinks", "sitefilter": "enwiki", "format": "json", "redirects": "yes"})
        for e in d["entities"].values():
            if "sitelinks" in e:
                ents[e["sitelinks"]["enwiki"]["title"]] = e

    cards = []
    for title, name, country, tier, typ in PLACES:
        e = ents.get(title)
        if not e:
            raise SystemExit(f"No Wikidata entity for {title}")
        cl = e["claims"]
        coord = cl["P625"][0]["mainsnak"]["datavalue"]["value"]
        lat, lon = coord["latitude"], coord["longitude"]
        pop, pop_year = latest_population(cl)
        pop_source = "Wikidata"
        if pop is None and typ != "Mountain" and "Lake" not in name and "Park" not in name:
            pop, pop_year, pop_source = geonames_population(name, lat, lon), None, "GeoNames"
        dem = get("https://api.open-meteo.com/v1/elevation", {"latitude": lat, "longitude": lon})["elevation"][0]
        elev = elevation_m(cl, dem, peak=name.startswith("Mount "))
        art = urllib.parse.quote(title.replace(" ", "_"), safe="")
        pv = get(f"https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/{art}/monthly/2025110100/2026103100")
        views = sum(i["views"] for i in pv["items"])
        clim = get("https://archive-api.open-meteo.com/v1/archive", {
            "latitude": lat, "longitude": lon, "start_date": "2025-01-01", "end_date": "2025-12-31",
            "daily": "temperature_2m_mean", "timezone": "UTC"})
        temps = [t for t in clim["daily"]["temperature_2m_mean"] if t is not None]
        cards.append({"name": name, "wiki": title, "qid": e["id"], "country": country, "tier": tier, "type": typ,
                      "lat": round(lat, 4), "lon": round(lon, 4), "population": int(pop) if pop else None,
                      "population_year": pop_year, "population_source": pop_source if pop else None, "elevation_m": round(elev), "views_12mo": views,
                      "avg_temp_c": round(sum(temps) / len(temps), 1)})
        print(f"{name:24} pop={pop} elev={round(elev)} views={views} temp={cards[-1]['avg_temp_c']}")
        time.sleep(0.3)

    # Stats normalised to 1-100 on fixed scales, so they stay comparable when the pool grows.
    clamp = lambda v: max(1, min(100, round(v)))
    rng = random.Random(7)
    for c in cards:
        c["hp"] = clamp((math.log10(c["population"]) - math.log10(500)) / (math.log10(20_000_000) - math.log10(500)) * 99 + 1) if c["population"] else 1  # 500 people -> 1, 20M -> 100; no population (peaks, lakes, parks) -> 1
        c["defense"] = clamp(c["elevation_m"] / 5_500 * 100)  # 5,500 m+ maxes out; Everest is 100
        c["attack"] = clamp((math.log10(max(c["views_12mo"], 1)) - 4) / (math.log10(3_000_000) - 4) * 99 + 1)  # 10k views/yr -> 1, 3M -> 100
        c["chill"] = clamp((30 - c["avg_temp_c"]) / 50 * 100)  # 30 °C -> 1, -20 °C -> 100
        cap = CAPS[c["tier"]]
        c["cap"] = cap
        c["serial"] = None if cap is None else rng.randint(1, cap)
    (HERE / "cards.json").write_text(json.dumps(cards, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Wrote {len(cards)} cards")


if __name__ == "__main__":
    main()
