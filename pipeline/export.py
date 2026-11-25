"""Step 8: export one country's card pool as static JSON for Cloud Storage, plus a sample for front-end work.

One file per region (ISO 3166-2 code, e.g. CA-ON.json) and an index.json listing them, so the game only
downloads the regions it needs (Firestore bills per read, see Architecture). Each card:

  id        stable card id (gn:<GeoNames id> for towns, wd:<Wikidata QID> for landmarks)
  name      the place's name; label: name plus a qualifier when other cards share the name
  type      town | nature | built;  kind: what it is (lake, skyscraper, ...)
  region, country, lat, lon (4 decimals, about 11 m)
  also_in   other countries a border landmark is in (Niagara Falls: home CA, also_in ["US"]); only when set
  rarity, fame (Wikipedia views, median month x 12)
  facts     only the facts this card has: population, elevation_m, height_m, prominence_m, area_km2,
            length_km, temp_c (average yearly temperature). The front end picks which to show.
  flavour   text plus its source: Wikipedia (lang, title, url: CC BY-SA, so the card must credit and link
            it; translated=true for local-language lines shown in English) or "facts" (written here for places
            with no article)
  image     "photo" (file, plus author, licence, licence_url and the Commons page: every card's detail view
            must show "Photo: <author>, <licence>") or "minimap" (file only; Natural Earth is public domain).
            Files are relative to the image root: images/photo/<id>.webp or images/minimap/<id>.webp,
            with ":" in the id written as "_".

Same-name cards (two "CN Tower"s, 17 "Rivière Blanche"s): the most famous keeps the plain name when it has
at least 5x the fame of the next; the others get "(near <nearest town>)" for landmarks or "(<province>)"
for towns, with the province added if that is still not unique.

    python pipeline/export.py --country CA
Input:  data/interim/<CC>/cards.parquet, flavour.parquet, images.parquet
Output: data/export/<CC>/index.json and one file per region; pipeline/sample/cards_sample_<cc>.json
"""
import argparse
import json
from datetime import date
from pathlib import Path
from urllib.parse import quote

import numpy as np
import pandas as pd

from countries import get, interim

ROOT = Path(__file__).parent
INTERIM = ROOT / "data" / "interim"
EXPORT = ROOT / "data" / "export"
KIND_LABEL = {"church building": "church", "hill, mountain": "hill"}
FACTS = ["population", "elevation_m", "height_m", "prominence_m", "area_km2", "length_km", "temp_c"]
ATTRIBUTION = ("Places from GeoNames (CC BY 4.0) and Wikidata (CC0). Flavour text from Wikipedia (CC BY-SA 4.0), "
               "credited per card. Photos from Wikimedia Commons, credited per card. Mini-maps drawn from Natural "
               "Earth. Temperature from WorldClim 2.1. Terrain height from Copernicus DEM via Open-Meteo.")


def nice(v: float, key: str):
    """Round a fact for display: whole numbers for big values, one decimal for small ones."""
    if key == "temp_c":
        return round(float(v), 1)
    if key == "population":
        return int(v)
    return round(float(v), 1) if abs(v) < 10 else int(round(float(v)))


def nearest_towns(lat: float, lon: float, towns: pd.DataFrame, k: int = 8) -> list[str]:
    """Names of the k closest town cards (equirectangular distance, fine at this scale)."""
    tl, tn = np.radians(towns["lat"].to_numpy()), np.radians(towns["lon"].to_numpy())
    a, b = np.radians(lat), np.radians(lon)
    d = ((tn - b) * np.cos((tl + a) / 2)) ** 2 + (tl - a) ** 2
    return towns["name"].iloc[np.argsort(d)[:k]].tolist()


def labels(df: pd.DataFrame) -> pd.Series:
    """Qualify names that several cards share. Towns get their province, but only when another town has the
    same name. Landmarks get "near <town>", trying the next-nearest town when two would read the same; a
    landmark named after the town it sits by gets its kind instead ("Walpole Island (island)")."""
    label = df["name"].copy()
    towns = df[df["type"] == "town"]
    for name, g in df[df.duplicated("name", keep=False)].groupby("name"):
        g = g.sort_values("fame", ascending=False)
        if g["fame"].iat[0] >= 5 * max(g["fame"].iat[1], 1):
            g = g.iloc[1:]  # the far more famous one keeps the plain name
        gt = g[g["type"] == "town"]
        town_clash = len(gt) > 1
        used, q = set(), {}
        for r in g.itertuples():
            if r.type == "town":
                if town_clash and (gt["province"] == r.province).sum() == 1:
                    q[r.Index] = r.province
                elif town_clash:  # same name in the same province: name a nearby town too
                    near = [t for t in nearest_towns(r.lat, r.lon, towns) if t != name]
                    opts = [f"{r.province}, near {t}" for t in near]
                    q[r.Index] = next((o for o in opts if o not in used), opts[0])
                    used.add(q[r.Index])
                continue
            near = nearest_towns(r.lat, r.lon, towns)
            if near[0] == name:
                opts = [KIND_LABEL.get(r.kind, r.kind.split(",")[0])]
            else:
                opts = ["near " + t for t in near if t != name]
            q[r.Index] = next((o for o in opts if o not in used), opts[0])
            used.add(q[r.Index])
        q = pd.Series(q, dtype=str)
        clash = q.duplicated(keep=False)  # still the same: number them by fame
        q[clash] = q[clash] + " " + (q[clash].groupby(q[clash]).cumcount() + 1).astype(str)
        label[q.index] = name + " (" + q + ")"

    # Last pass: a label still shared (a town and a landmark both left plain, e.g. Victoria) keeps it only for
    # the most famous card; the others get their province (towns) or kind (landmarks), then a number.
    for _ in range(2):
        for lab, g in df.assign(label=label)[label.duplicated(keep=False)].groupby("label"):
            for r in g.sort_values("fame", ascending=False).iloc[1:].itertuples():
                extra = r.province if r.type == "town" else KIND_LABEL.get(r.kind, r.kind.split(",")[0])
                label[r.Index] = f"{lab} ({extra})" if lab == r.name else f"{lab[:-1]}, {extra})"
    clash = label.duplicated(keep=False)
    label[clash] = label[clash] + " #" + (label[clash].groupby(label[clash]).cumcount() + 1).astype(str)
    assert label.is_unique
    return label


def facts_line(r) -> str:
    """Flavour for a card with no Wikipedia line, from its facts."""
    if r.type == "town":
        return (f"A community of {int(r.population):,} people in {r.province}." if pd.notna(r.population)
                else f"A community in {r.province}.")
    kind = KIND_LABEL.get(r.kind, str(r.kind).split(",")[0])
    return f"{'An' if kind[0].lower() in 'aeiou' else 'A'} {kind} in {r.province}."


def card(r) -> dict:
    c = {"id": r.id, "name": r.name, "label": r.label, "type": r.type,
         "kind": KIND_LABEL.get(r.kind, str(r.kind).split(",")[0]), "region": r.region, "country": r.country,
         "lat": round(r.lat, 4), "lon": round(r.lon, 4), "rarity": r.rarity, "fame": int(r.fame),
         "facts": {k: nice(getattr(r, k), k) for k in FACTS if pd.notna(getattr(r, k))}}
    if r.also_in is not None and len(r.also_in):
        c["also_in"] = sorted(r.also_in)
    if r.flavour:
        url = f"https://{r.flavour_lang}.wikipedia.org/wiki/{quote(r.flavour_title.replace(' ', '_'))}"
        c["flavour"] = {"text": r.flavour, "source": "wikipedia", "lang": r.flavour_lang, "title": r.flavour_title,
                        "url": url, "translated": r.flavour_lang != "en"}
    else:
        c["flavour"] = {"text": facts_line(r), "source": "facts"}
    f = r.id.replace(":", "_") + ".webp"
    if isinstance(r.image, str):
        c["image"] = {"kind": "photo", "file": f"images/photo/{f}", "author": r.author, "licence": r.licence,
                      "licence_url": r.licence_url or None, "page": r.page}
    else:
        c["image"] = {"kind": "minimap", "file": f"images/minimap/{f}"}
    return c


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--country", required=True)
    c = get(ap.parse_args().country)
    d = interim(c.code)
    OUT, SAMPLE = EXPORT / c.code, ROOT / "sample" / f"cards_sample_{c.code.lower()}.json"
    img = pd.read_parquet(d / "images.parquet")[["id", "image", "author", "licence", "licence_url", "page"]]
    df = (pd.read_parquet(d / "cards.parquet").merge(pd.read_parquet(d / "flavour.parquet"), on="id")
          .merge(img, on="id", how="left"))
    assert df["id"].is_unique and df["region"].notna().all() and (df["country"] == c.code).all()
    df["label"] = labels(df)
    df = df.sort_values(["region", "fame"], ascending=[True, False])
    cards = {i: card(r) for i, r in zip(df.index, df.itertuples())}

    OUT.mkdir(parents=True, exist_ok=True)
    index = {"country": c.code, "built": date.today().isoformat(), "cards": len(df), "attribution": ATTRIBUTION,
             "regions": []}
    for code, g in df.groupby("region"):
        prov = g["region_name"].iat[0]
        (OUT / f"{code}.json").write_text(json.dumps({"region": code, "name": prov, "cards": [cards[i] for i in g.index]},
                                                    ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        index["regions"].append({"code": code, "name": prov, "file": f"{code}.json", "cards": len(g),
                                 "rarity": g["rarity"].value_counts().to_dict()})
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")

    # Sample for front-end work: every Mythic, then a spread across rarity and type, a few per region.
    pick = df[df["rarity"] == "Mythic"].index.tolist()
    for (rar, typ), g in df[df["rarity"] != "Mythic"].groupby(["rarity", "type"]):
        pick += g.sample(min(len(g), {"Legendary": 8, "Epic": 10, "Rare": 12, "Common": 12}[rar]), random_state=7).index.tolist()
    same, plain = df[df["label"] != df["name"]], df[df["flavour"] == ""]
    pick += [i for i in same.sample(min(6, len(same)), random_state=7).index if i not in pick]  # same-name labels
    pick += [i for i in plain.sample(min(4, len(plain)), random_state=7).index if i not in pick]  # facts flavour
    SAMPLE.parent.mkdir(exist_ok=True)
    SAMPLE.write_text(json.dumps({"note": f"Sample of the {c.name} card pool for front-end development; built by "
                                          "pipeline/export.py. " + ATTRIBUTION,
                                  "cards": [cards[i] for i in pick]}, ensure_ascii=False, indent=1), encoding="utf-8")

    size = sum(f.stat().st_size for f in OUT.glob("*.json"))
    print(f"{len(df):,} cards -> {OUT.relative_to(ROOT.parent)} ({len(index['regions'])} regions, {size / 1e6:.1f} MB)")
    print("Largest region files:", sorted(((f.name, f"{f.stat().st_size / 1e6:.2f} MB") for f in OUT.glob(f"{c.code}-*.json")),
                                         key=lambda x: -float(x[1].split()[0]))[:3])
    print(f"Sample: {len(pick)} cards -> {SAMPLE.relative_to(ROOT.parent)}")
    lab = df[df["label"] != df["name"]]
    print(f"Labelled same-name cards: {len(lab):,}; plain name kept by the most famous:",
          int(df["name"].isin(lab["name"]).sum() - len(lab)))
    print("Examples:", ", ".join(df[df["name"].isin(["CN Tower", "Summit Lake", "Richmond", "Rivière Blanche"])]["label"].head(12)))
    print("Flavour from facts:", int((df["flavour"] == "").sum()))


if __name__ == "__main__":
    main()
