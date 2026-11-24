"""Step 5 (Canada): rarity tier for every candidate.

Rarity comes from fame (median month x 12, step 4) ranked within each type, because towns, natural
and built landmarks get very different view counts (median towns 6.1k, built 2.3k, natural 0.3k).
Then floors from the roadmap and the developer:
  - the national capital is at least Legendary ("Capitals" in the roadmap's Legendary row)
  - provincial and territorial capitals are at least Epic
  - national parks are at least Epic (roadmap's Epic row)
  - built landmarks are at least Rare and get wider top tiers (developer: structures are high rarity)
Mythics are hand-picked (mythics.csv), about 50 for the whole world.
A candidate with fame 0 stays Common unless a floor lifts it.

    python pipeline/rarity_ca.py
Input:  data/interim/pool_clean_ca.parquet (step 4b), places_ca.parquet, pipeline/mythics.csv
Output: data/interim/rarity_ca.parquet
"""
from pathlib import Path

import geopandas as gpd
import pandas as pd

ROOT = Path(__file__).parent
INTERIM = ROOT / "data" / "interim"
TIERS = ["Common", "Rare", "Epic", "Legendary", "Mythic"]

# Share of each type (by fame rank) at or above a tier. Starting values, tuned in the beta.
TOP = {
    "town": {"Legendary": 0.005, "Epic": 0.05, "Rare": 0.25},
    "nature": {"Legendary": 0.005, "Epic": 0.05, "Rare": 0.25},
    "built": {"Legendary": 0.03, "Epic": 0.20, "Rare": 1.0},
}


def tier_from_rank(pct: float, top: dict) -> str:
    for t in ("Legendary", "Epic", "Rare"):
        if pct <= top[t]:
            return t
    return "Common"


def main():
    df = pd.read_parquet(INTERIM / "pool_clean_ca.parquet")
    fc = gpd.read_parquet(INTERIM / "places_ca.parquet").set_index("geonameid")["feature_code"]
    df["feature_code"] = df["id"].str.removeprefix("gn:").map(fc).where(df["type"] == "town")

    # Rank 1 = most famous; pct = share of the type at or above this card.
    df["fame_pct"] = df.groupby("type")["fame"].rank(ascending=False, method="min", pct=True)
    df["rarity"] = [tier_from_rank(p, TOP[t]) if f > 0 or t == "built" else "Common"
                    for p, t, f in zip(df["fame_pct"], df["type"], df["fame"])]
    df["rarity_reason"] = "fame"

    def floor(mask, tier, reason):
        lift = mask & (df["rarity"].map(TIERS.index) < TIERS.index(tier))
        df.loc[lift, "rarity"] = tier
        df.loc[lift, "rarity_reason"] = reason

    floor(df["feature_code"] == "PPLC", "Legendary", "national capital")
    floor(df["feature_code"] == "PPLA", "Epic", "provincial capital")
    floor(df["kind"].fillna("").str.contains("national park"), "Epic", "national park")

    myth = pd.read_csv(ROOT / "mythics.csv", comment="#")
    hit = df["id"].isin(myth["id"])
    df.loc[hit, "rarity"], df.loc[hit, "rarity_reason"] = "Mythic", "hand-picked"
    missing = set(myth["id"]) - set(df["id"])
    if missing:
        print("Mythics not in this pool (other countries):", len(missing))

    df.to_parquet(INTERIM / "rarity_ca.parquet")

    pd.set_option("display.width", 200)
    print(f"{len(df):,} cards -> data/interim/rarity_ca.parquet\n")
    print(pd.crosstab(df["type"], df["rarity"], margins=True)[[t for t in TIERS if t in set(df["rarity"])] + ["All"]])
    print("\nLifted by a floor:", df["rarity_reason"].value_counts().drop("fame").to_dict())
    for t in reversed(TIERS):
        s = df[df["rarity"] == t].sort_values("fame", ascending=False)
        if len(s) == 0:
            continue
        lst = s if len(s) <= 40 else s.sample(25, random_state=1).sort_values("fame", ascending=False)
        label = f"{t} ({len(s)})" + ("" if len(s) <= 40 else ", random 25")
        print(f"\n{label}: " + ", ".join(f"{n} [{ty[0]}] {f / 1e3:.0f}k" for n, ty, f in zip(lst["name"], lst["type"], lst["fame"])))
    edge = {f"{t} {r}": int(df[(df["type"] == t) & (df["rarity_reason"] == "fame") & (df["rarity"] == r)]["fame"].min())
            for t in ("town", "nature", "built") for r in ("Legendary", "Epic", "Rare")}
    print("\nLowest fame that reaches each tier:", edge)
    cand = df[df["rarity"] != "Mythic"].nlargest(15, "fame")
    print("\nMythic shortlist (most famous not yet Mythic):", ", ".join(f"{n} {f / 1e3:.0f}k" for n, f in zip(cand["name"], cand["fame"])))


if __name__ == "__main__":
    main()
