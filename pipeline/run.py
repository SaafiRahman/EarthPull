"""Run the whole pipeline for one or more countries.

    python pipeline/run.py CA                 one country
    python pipeline/run.py CA US MX           several
    python pipeline/run.py all                every country in countries.py (North America)
    python pipeline/run.py CA --from facts    start at a later step (earlier outputs must exist)

Landmarks (step 3) are pulled for every country at once, so it runs once per call, before the per-country
steps, and only when --from is at or before it. Every step caches what it downloads in data/raw/, so a
rerun only fetches what is new. Each step's own report is printed as it runs.
"""
import argparse
import subprocess
import sys
import time
from pathlib import Path

from countries import COUNTRIES, get

ROOT = Path(__file__).parent
# (name, script, extra arguments); "landmarks" runs once for all countries.
STEPS = [
    ("geonames", "geonames.py", []),
    ("towns", "towns.py", []),
    ("landmarks", "landmarks.py", None),
    ("pageviews", "pageviews.py", []),
    ("gone", "gone.py", []),
    ("rarity", "rarity.py", []),
    ("facts", "facts.py", []),
    ("flavour", "flavour.py", []),
    ("images", "images.py", []),
    ("photos", "images.py", ["--download"]),
    ("minimap", "minimap.py", []),
    ("export", "export.py", []),
]
NAMES = [s[0] for s in STEPS]


def step(script: str, args: list[str]):
    t = time.time()
    print(f"\n=== {script} {' '.join(args)}", flush=True)
    subprocess.run([sys.executable, "-u", str(ROOT / script), *args], check=True)
    print(f"=== done in {(time.time() - t) / 60:.1f} min", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("countries", nargs="+", help="country codes, or 'all'")
    ap.add_argument("--from", dest="start", default="geonames", choices=NAMES)
    ap.add_argument("--to", dest="stop", default="export", choices=NAMES)
    a = ap.parse_args()
    codes = list(COUNTRIES) if a.countries == ["all"] else [get(c).code for c in a.countries]
    todo = STEPS[NAMES.index(a.start):NAMES.index(a.stop) + 1]
    before = [s for s in todo if NAMES.index(s[0]) < NAMES.index("landmarks")]
    after = [s for s in todo if NAMES.index(s[0]) > NAMES.index("landmarks")]
    for code in codes:
        for _, script, extra in before:
            step(script, ["--country", code, *extra])
    if any(s[0] == "landmarks" for s in todo):
        step("landmarks.py", [])
    for code in codes:
        for _, script, extra in after:
            step(script, ["--country", code, *extra])


if __name__ == "__main__":
    main()
