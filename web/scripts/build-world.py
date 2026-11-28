"""Build the small world map the globe draws when zoomed out (web/public/world/world.json).

OpenFreeMap's zoomed-out tiles are heavy (about 125 KB each at zoom 5-6, plus a shaded-relief image layer): a pack's
globe tour downloaded 21 MB of them (measured 2026-11-28). Below zoom 7 the globe now draws this file instead, which
the browser downloads once and caches; OpenFreeMap's tiles load only from zoom 7 in, where they are small and few.

Layers (property "k"): land, lake, country (outlines), state (US, Canada and Mexico state and province lines).
Source: Natural Earth 1:10m, public domain, already downloaded for the pipeline's mini-maps.

    pipeline/.venv/Scripts/python web/scripts/build-world.py
"""
import json
from pathlib import Path

import geopandas as gpd
from shapely.geometry import mapping
from shapely.ops import linemerge

ROOT = Path(__file__).resolve().parents[2]
NE = ROOT / "pipeline" / "data" / "raw" / "naturalearth"
OUT = ROOT / "web" / "public" / "world" / "world.json"


def read(name: str) -> gpd.GeoDataFrame:
    return gpd.read_file(f"zip://{NE / (name + '.zip')}")


def rounded(geom, places=2):
    """GeoJSON mapping with coordinates rounded (2 places is about 1 km, a pixel or so at zoom 7)."""
    def r(c):
        if isinstance(c, (list, tuple)) and c and isinstance(c[0], (int, float)):
            return [round(c[0], places), round(c[1], places)]
        return [r(x) for x in c]
    m = mapping(geom)
    m["coordinates"] = r(m["coordinates"])
    return m


def shared_borders(areas: gpd.GeoDataFrame) -> list:
    """Only the lines where two areas meet. Their full outlines would trace every coastline a second time, which made
    up most of the file (Canada's Arctic coast especially)."""
    out = []
    pairs = gpd.sjoin(areas[["geometry"]], areas[["geometry"]], predicate="touches")
    for i, j in zip(pairs.index, pairs["index_right"]):
        if i < j:
            line = areas.geometry.iloc[i].boundary.intersection(areas.geometry.iloc[j].boundary)
            # areas that touch at a corner give points; keep only the line parts
            parts = [g for g in getattr(line, "geoms", [line]) if g.geom_type in ("LineString", "MultiLineString")]
            if parts:
                out.append(linemerge(parts) if len(parts) > 1 else parts[0])
    return out


def main() -> None:
    feats = []

    def add(gdf: gpd.GeoDataFrame, kind: str, tol: float, min_area: float = 0.0) -> None:
        n = 0
        for geom in gdf.geometry:
            if geom is None or geom.is_empty:
                continue
            if min_area and geom.geom_type.endswith("Polygon"):
                # drop specks, but keep small islands (Saba is about 0.001 square degrees)
                parts = [p for p in getattr(geom, "geoms", [geom]) if p.area >= min_area]
                if not parts:
                    continue
                geom = parts[0] if len(parts) == 1 else type(geom)(parts) if geom.geom_type == "MultiPolygon" else geom
            geom = geom.simplify(tol, preserve_topology=True)
            if geom.is_empty:
                continue
            feats.append({"type": "Feature", "properties": {"k": kind}, "geometry": rounded(geom)})
            n += 1
        print(f"{kind}: {n} features")

    land = read("ne_10m_land").explode(index_parts=False)
    add(land, "land", 0.018, min_area=0.0004)

    lakes = read("ne_10m_lakes")  # areas in square degrees: rough, but only used as a size cut
    lakes = lakes[lakes.geometry.area >= 0.08]  # big lakes only; the tiles show the rest from zoom 7
    add(lakes, "lake", 0.02)

    adm1 = read("ne_10m_admin_1_states_provinces")
    countries = adm1.dissolve(by="adm0_a3").reset_index()
    add(gpd.GeoDataFrame(geometry=shared_borders(countries)), "country", 0.03)
    na = adm1[adm1["adm0_a3"].isin(["USA", "CAN", "MEX"])].reset_index(drop=True)
    add(gpd.GeoDataFrame(geometry=shared_borders(na)), "state", 0.02)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"type": "FeatureCollection", "features": feats}, separators=(",", ":")), encoding="utf-8")
    print(f"{OUT}: {OUT.stat().st_size / 1048576:.2f} MB")


if __name__ == "__main__":
    main()
