"""Step 7c (Canada): draw a mini-map for every card with no usable photo (developer, 2026-11-24: pre-rendered).

A small map centred on the card: land, sea, lakes and rivers from Natural Earth 1:10m (with its detailed
North America lakes and rivers), and a pin. The view is sized to the place: about 3x the width of its
area or 1.2x its length when Wikidata has one, else a default by kind. No text, so it works in any
language and reads at card size.

    python pipeline/minimap_ca.py --ids wd:Q1,gn:2     a few cards, for a look
    python pipeline/minimap_ca.py                      every card that needs one
Input:  data/interim/cards_ca.parquet, data/interim/images_ca.parquet,
        data/raw/naturalearth/*.zip (https://www.naturalearthdata.com, public domain)
Output: data/export/images/minimap/<card id>.webp (480 x 360)
"""
import argparse
import math
from pathlib import Path

import geopandas as gpd
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
from shapely.geometry import box

ROOT = Path(__file__).parent
INTERIM = ROOT / "data" / "interim"
NE = ROOT / "data" / "raw" / "naturalearth"
OUT = ROOT / "data" / "export" / "images" / "minimap"
W, H, DPI = 480, 360, 100
MIN_KM = 150  # wide "where is it" view: Natural Earth has no detail closer in (2026-11-24)

SEA, LAND, LAKE, RIVER, PIN = "#9fc4dc", "#efe8d8", "#9fc4dc", "#6fa3c6", "#d6453d"
DEFAULT_KM = {"town": 30, "lake": 25, "river": 60, "mountain": 30, "mountain range": 150, "island": 30,
              "glacier": 40, "bay": 40}


def layers() -> dict[str, gpd.GeoDataFrame]:
    def rd(name):
        g = gpd.read_file(f"zip://{(NE / name).as_posix()}.zip")
        g["geometry"] = g.geometry.make_valid()  # some Natural Earth lakes are invalid and break clipping
        return g
    return {"land": rd("ne_10m_land"),
            "lakes": pd.concat([rd("ne_10m_lakes"), rd("ne_10m_lakes_north_america")], ignore_index=True),
            "rivers": pd.concat([rd("ne_10m_rivers_lake_centerlines"), rd("ne_10m_rivers_north_america")], ignore_index=True)}


def view_km(r) -> float:
    if pd.notna(r.area_km2) and r.area_km2 > 0:
        km = 3 * math.sqrt(r.area_km2)
    elif pd.notna(r.length_km) and r.length_km > 0:
        km = 1.2 * r.length_km
    else:
        km = DEFAULT_KM.get(r.kind if r.type != "town" else "town", 20)
    return min(max(km, MIN_KM), 1200)


def render(r, L: dict, path: Path):
    km = view_km(r)
    half_h = km / 2 / 111.0  # degrees of latitude
    half_w = half_h * (W / H) / max(math.cos(math.radians(r.lat)), 0.2)
    win = box(r.lon - half_w, r.lat - half_h, r.lon + half_w, r.lat + half_h)

    fig = plt.figure(figsize=(W / DPI, H / DPI), dpi=DPI, facecolor=SEA)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_facecolor(SEA)
    for name, style in (("land", {"color": LAND, "linewidth": 0}),
                        ("lakes", {"color": LAKE, "linewidth": 0}),
                        ("rivers", {"color": RIVER, "linewidth": 1.2})):
        g = L[name].cx[win.bounds[0]:win.bounds[2], win.bounds[1]:win.bounds[3]]
        if len(g):
            try:
                g = g.clip(win)
            except Exception:  # GEOS topology error: draw unclipped, the axis limits crop it anyway
                pass
            g.plot(ax=ax, **style)
    ax.plot([r.lon], [r.lat], "o", ms=11, mfc=PIN, mec="white", mew=2.2, zorder=5)
    ax.set_xlim(win.bounds[0], win.bounds[2])
    ax.set_ylim(win.bounds[1], win.bounds[3])
    ax.set_aspect(1 / max(math.cos(math.radians(r.lat)), 0.2))
    ax.axis("off")
    fig.savefig(path, dpi=DPI, format="webp", facecolor=SEA, pil_kwargs={"quality": 80})
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", default="")
    args = ap.parse_args()
    df = pd.read_parquet(INTERIM / "cards_ca.parquet")
    if args.ids:
        df = df[df["id"].isin(args.ids.split(","))]
    else:
        img = pd.read_parquet(INTERIM / "images_ca.parquet")
        df = df[df["id"].isin(img.loc[img["image"].isna(), "id"])]
    OUT.mkdir(parents=True, exist_ok=True)
    L = layers()
    for n, r in enumerate(df.itertuples(), 1):
        path = OUT / f"{r.id.replace(':', '_')}.webp"
        if not path.exists() or args.ids:  # resume: skip maps already drawn
            render(r, L, path)
        if n % 500 == 0:
            print(f"  {n:,}/{len(df):,}", flush=True)
    print(f"{len(df):,} mini-maps -> {OUT.relative_to(ROOT.parent)}")


if __name__ == "__main__":
    main()
