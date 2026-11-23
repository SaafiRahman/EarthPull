"""Render the paper-prototype cards (printable PDF) and the hometown-pull mock-up (PNG).

Run:  python prototype/render.py [hometown name] [serial]
      e.g. python prototype/render.py Kelowna 3
Needs Chrome (or Edge) for headless PDF/PNG output. Reads prototype/cards.json.
"""
import html, json, subprocess, sys
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "out"
CARDS = json.loads((HERE / "cards.json").read_text(encoding="utf-8"))
BROWSERS = [r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"]

TIER = {  # frame, accent, glow
    "Common":    ("#6b7280", "#e5e7eb", "rgba(148,163,184,.0)"),
    "Rare":      ("#1d6fd8", "#dbeafe", "rgba(59,130,246,.55)"),
    "Epic":      ("#7c3aed", "#ede9fe", "rgba(139,92,246,.6)"),
    "Legendary": ("#c88a04", "#fef3c7", "rgba(245,158,11,.7)"),
    "Mythic":    ("#e11d48", "#ffe4e6", "rgba(244,63,94,.75)"),
}

# Placeholder art: one simple SVG scene per Type (stands in for the Commons photo / mini-map).
SCENES = {
    "Coastal": ("#7dd3fc", "#fde68a",
                '<path d="M0 70 Q25 62 50 70 T100 70 V100 H0Z" fill="#0ea5e9"/><path d="M0 80 Q25 73 50 80 T100 80 V100 H0Z" fill="#0369a1"/><path d="M60 70 L72 52 L84 70Z" fill="#475569"/>'),
    "Mountain": ("#bfdbfe", "#fef9c3",
                 '<path d="M-5 100 L30 40 L50 70 L70 30 L105 100Z" fill="#64748b"/><path d="M70 30 L62 45 L70 42 L78 45Z M30 40 L24 51 L30 48 L36 51Z" fill="#fff"/><path d="M0 100 L0 85 Q50 75 100 88 V100Z" fill="#166534"/>'),
    "Tundra": ("#1e293b", "#a7f3d0",
               '<path d="M0 30 Q30 10 55 32 T100 22" stroke="#34d399" stroke-width="5" fill="none" opacity=".7"/><path d="M0 35 Q35 18 60 38 T100 30" stroke="#a78bfa" stroke-width="3" fill="none" opacity=".6"/><path d="M0 75 Q50 68 100 76 V100 H0Z" fill="#e2e8f0"/>'),
    "Desert": ("#fcd34d", "#fff7ed",
               '<path d="M0 72 Q30 55 60 72 T100 68 V100 H0Z" fill="#f59e0b"/><path d="M0 85 Q40 70 80 86 T120 84 V100 H0Z" fill="#d97706"/>'),
    "Forest": ("#bae6fd", "#fef9c3",
               '<path d="M-5 72 Q20 48 45 64 T105 52 V100 H-5Z" fill="#86efac"/><path d="M-5 80 Q35 62 70 76 T105 70 V100 H-5Z" fill="#4ade80"/>' +
               ''.join(f'<path d="M{x} 90 L{x+8} 60 L{x+16} 90Z" fill="{c}"/>' for x, c in
                       [(-4, "#15803d"), (10, "#166534"), (26, "#14532d"), (42, "#15803d"), (58, "#166534"), (74, "#14532d"), (88, "#15803d")]) +
               '<rect y="88" width="100" height="12" fill="#3f6212"/>'),
    "Urban": ("#c7d2fe", "#fde68a",
              ''.join(f'<rect x="{x}" y="{y}" width="{w}" height="{100-y}" fill="{c}"/>' for x, y, w, c in
                      [(2, 55, 14, "#475569"), (16, 35, 12, "#334155"), (28, 60, 16, "#64748b"), (44, 25, 10, "#1e293b"),
                       (54, 50, 14, "#475569"), (68, 40, 12, "#334155"), (80, 62, 18, "#64748b")])),
}


def scene(typ, label=True):
    sky, sun, body = SCENES[typ]
    return (f'<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" class="art">'
            f'<rect width="100" height="100" fill="{sky}"/><circle cx="22" cy="24" r="9" fill="{sun}"/>{body}</svg>'
            + ('<span class="ph">PHOTO</span>' if label else ''))


def fmt_pop(p):
    return f"{p:,}" if p else "n/a"


def fmt_views(v):
    return f"{v/1e6:.1f}M" if v >= 1e6 else f"{round(v/1e3)}k"


def serial(c):
    if c["cap"] is None:
        return '<span class="serial none">Unnumbered</span>'
    if c["cap"] == 1:
        return '<span class="serial">1 of 1</span>'
    return f'<span class="serial">#{c["serial"]} of {c["cap"]:,}</span>'


def stat(label, v):
    return f'<div class="stat"><b>{label}</b><i><s style="width:{v}%"></s></i><em>{v}</em></div>'


def card(c, cls="", label=True):
    frame, accent, glow = TIER[c["tier"]]
    return f"""
<div class="card t-{c['tier'].lower()} {cls}" style="--f:{frame};--a:{accent};--g:{glow}">
  <div class="top"><span class="tier">{c['tier']}</span>{serial(c)}</div>
  <div class="imgwrap">{scene(c['type'], label)}<span class="type">{c['type']}</span></div>
  <div class="name">{html.escape(c['name'])}</div>
  <div class="country">{html.escape(c['country'])}</div>
  <div class="stats">{stat('HP', c['hp'])}{stat('DEF', c['defense'])}{stat('ATK', c['attack'])}{stat('CHL', c['chill'])}</div>
  <div class="facts">Pop. {fmt_pop(c['population'])} · {c['elevation_m']:,} m · {fmt_views(c['views_12mo'])} views/yr · {c['avg_temp_c']} °C avg</div>
</div>"""


CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Segoe UI",system-ui,sans-serif;color:#111827}
.card{width:2.5in;height:3.5in;border-radius:.14in;padding:.09in;background:var(--f);display:flex;flex-direction:column;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;position:relative;overflow:hidden;color:#111827}
.t-mythic{background:conic-gradient(from 200deg,#e11d48,#f59e0b,#10b981,#3b82f6,#8b5cf6,#e11d48)}
.t-legendary{background:linear-gradient(135deg,#a16207,#facc15 45%,#a16207)}
.top{display:flex;justify-content:space-between;align-items:center;color:#fff;font-weight:800;font-size:8.5pt;padding:0 .03in .05in;letter-spacing:.04em;text-transform:uppercase;text-shadow:0 1px 2px rgba(0,0,0,.35)}
.serial{background:rgba(0,0,0,.35);border-radius:99px;padding:1px 7px;font-size:8pt;letter-spacing:0;text-transform:none}
.serial.none{background:transparent;opacity:.8;font-weight:600}
.imgwrap{position:relative;height:1.35in;border-radius:.08in;overflow:hidden;border:2px solid rgba(255,255,255,.85)}
.art{width:100%;height:100%;display:block}
.ph{position:absolute;right:5px;bottom:4px;font-size:6pt;font-weight:700;color:rgba(255,255,255,.9);background:rgba(0,0,0,.3);padding:1px 4px;border-radius:3px;letter-spacing:.08em}
.type{position:absolute;left:5px;top:4px;font-size:6.5pt;font-weight:700;color:#111827;background:rgba(255,255,255,.92);padding:1px 5px;border-radius:99px}
.name,.country,.stats,.facts{background:var(--a)}
.name{margin-top:.06in;border-radius:.06in .06in 0 0;padding:.04in .07in 0;font-weight:800;font-size:12.5pt;line-height:1.1;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.country{padding:0 .07in .03in;font-size:7.5pt;color:#4b5563;font-weight:600}
.stats{padding:.02in .07in;flex:1;display:flex;flex-direction:column;justify-content:space-around}
.stat{display:grid;grid-template-columns:.32in 1fr .22in;align-items:center;gap:4px;font-size:8pt}
.stat b{font-weight:800}.stat em{font-style:normal;font-weight:800;text-align:right}
.stat i{height:7px;background:rgba(0,0,0,.12);border-radius:99px;overflow:hidden}
.stat s{display:block;height:100%;background:var(--f);border-radius:99px}
.t-mythic .stat s{background:linear-gradient(90deg,#e11d48,#8b5cf6)}
.facts{border-radius:0 0 .06in .06in;padding:.03in .07in .05in;font-size:5.8pt;color:#4b5563;line-height:1.25}
"""

PRINT_CSS = """
@page{size:letter;margin:.22in .5in}
.sheet{display:grid;grid-template-columns:repeat(3,2.5in);grid-template-rows:repeat(3,3.5in);height:10.5in;gap:0;justify-content:center;break-after:page;break-inside:avoid;overflow:hidden}
.sheet:last-child{break-after:auto}
.sheet .card{outline:.5px dashed #9ca3af;outline-offset:0}
.back{width:2.5in;height:3.5in;border-radius:.14in;background:radial-gradient(circle at 50% 45%,#1e3a8a,#0b1220 70%);
  -webkit-print-color-adjust:exact;print-color-adjust:exact;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;outline:.5px dashed #9ca3af}
.back .globe{width:1.2in;height:1.2in;border-radius:50%;border:3px solid #60a5fa;background:
  radial-gradient(circle at 35% 35%,#22c55e 0 18%,transparent 19%),radial-gradient(circle at 65% 60%,#22c55e 0 14%,transparent 15%),#2563eb}
.back .word{margin-top:.15in;font-weight:900;font-size:16pt;letter-spacing:.08em}
.back .sub{font-size:7pt;opacity:.75;margin-top:2px}
.cover{break-after:page;padding-top:.3in;font-size:11pt;line-height:1.45;max-width:7in;margin:0 auto}
.cover h1{font-size:20pt;margin-bottom:.1in}.cover h2{font-size:12pt;margin:.18in 0 .05in}
.cover ul{margin-left:.25in}.cover table{border-collapse:collapse;font-size:9.5pt;margin-top:.05in}
.cover td,.cover th{border:1px solid #d1d5db;padding:2px 8px;text-align:left}
"""


def cover():
    counts = {t: sum(c["tier"] == t for c in CARDS) for t in TIER}
    rows = "".join(f"<tr><td>{t}</td><td>{counts[t]}</td><td>{o}</td></tr>" for t, o in
                   zip(TIER, ["70%", "22%", "6.5%", "1.4%", "0.1%"]))
    return f"""<div class="cover">
<h1>Paper prototype: 30 cards</h1>
<p>Real places, real data. Stats: <b>HP</b> = population (log scale), <b>DEF</b> = elevation, <b>ATK</b> = Wikipedia page views over 12 months (log scale), <b>CHL</b> = colder average temperature is higher. Each runs 1–100.</p>
<h2>How to run it</h2>
<ul>
<li>Print pages 2–5 single-sided (100% scale, not "fit to page") and cut along the dashed lines. Page 6 holds card backs: print it on the back of each card sheet if your printer does duplex, or skip it and use opaque sleeves.</li>
<li>Shuffle all 30 face down. Each friend draws 5 as one "pack" and flips them one at a time.</li>
<li>Watch and write down: which cards get a reaction out loud, whether anyone reads the serial, whether anyone compares stats, and what they say about the Canadian towns.</li>
</ul>
<h2>Tier mix in this deck</h2>
<table><tr><th>Tier</th><th>Cards</th><th>Real pull odds</th></tr>{rows}</table>
<p style="margin-top:.08in;font-size:9.5pt">The deck is richer than real odds (which would give 21 Commons and no Legendary or Mythic in 30 cards) so testers see every tier. Serials are random within each cap.</p>
<p style="font-size:9.5pt;margin-top:.08in">Data: Wikidata, GeoNames, Wikimedia Pageviews (Nov 2025–Oct 2026), Open-Meteo (2025 averages). Images are placeholders.</p>
</div>"""


def sheets():
    pages = []
    for i in range(0, len(CARDS), 9):
        pages.append('<div class="sheet">' + "".join(card(c) for c in CARDS[i:i + 9]) + "</div>")
    back = '<div class="back"><div class="globe"></div><div class="word">EARTHPULL</div><div class="sub">paper prototype</div></div>'
    pages.append('<div class="sheet">' + back * 9 + "</div>")
    return "".join(pages)


def hometown(name, ser):
    c = dict(next(x for x in CARDS if x["name"].lower() == name.lower()))
    if ser is not None:
        c["serial"] = ser
    frame, accent, glow = TIER[c["tier"]]
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}
html,body{{width:1080px;height:1350px;overflow:hidden}}
body{{background:radial-gradient(ellipse at 50% 46%,{glow} 0,rgba(15,23,42,0) 42%),radial-gradient(ellipse at 50% 120%,#1e3a8a 0,#0b1220 60%);
  display:flex;flex-direction:column;align-items:center;color:#fff}}
.kicker{{margin-top:92px;font-size:30px;font-weight:800;letter-spacing:.32em;color:#93c5fd}}
.head{{font-size:68px;font-weight:900;margin-top:10px;letter-spacing:-.01em}}
.head span{{color:{frame if c['tier'] != 'Common' else '#e5e7eb'};filter:brightness(1.5)}}
.stage{{position:relative;margin-top:44px;display:flex;justify-content:center}}
.rays{{position:absolute;inset:-260px;background:repeating-conic-gradient(from 0deg,rgba(255,255,255,.07) 0 6deg,transparent 6deg 18deg);
  -webkit-mask:radial-gradient(circle,#000 20%,transparent 62%);mask:radial-gradient(circle,#000 20%,transparent 62%)}}
.stage .card{{zoom:2.55;box-shadow:0 0 0 1px rgba(255,255,255,.2),0 10px 40px {glow}}}
.holder{{display:flex;justify-content:center}}
.pill{{position:absolute;left:50%;transform:translateX(-50%);bottom:-52px;background:#fff;color:#0b1220;font-weight:800;font-size:26px;
  padding:12px 26px;border-radius:99px;white-space:nowrap;box-shadow:0 8px 30px rgba(0,0,0,.4)}}
.pill b{{color:{frame}}}
.cta{{margin-top:96px;display:flex;gap:18px}}
.btn{{font-size:30px;font-weight:800;padding:22px 40px;border-radius:20px;background:#fff;color:#0b1220}}
.btn.alt{{background:rgba(255,255,255,.12);color:#fff;border:2px solid rgba(255,255,255,.3)}}
.spark{{position:absolute;width:10px;height:10px;border-radius:50%;background:#fde68a;box-shadow:0 0 14px #fde68a}}
</style></head><body>
<div class="kicker">YOUR FIRST PACK</div>
<div class="head">You pulled your <span>hometown</span></div>
<div class="stage"><div class="rays"></div>
  <div class="holder">{card(c, label=False)}</div>
  <div class="pill">Discovered by <b>you</b> · first in your region</div>
  <i class="spark" style="left:-60px;top:120px"></i><i class="spark" style="right:-70px;top:60px;width:7px;height:7px"></i>
  <i class="spark" style="right:-40px;top:520px"></i><i class="spark" style="left:-30px;top:640px;width:6px;height:6px"></i>
</div>
<div class="cta"><div class="btn">Share this pull</div><div class="btn alt">See it on the map</div></div>
</body></html>"""


def chrome(*args):
    exe = next((b for b in BROWSERS if Path(b).exists()), None)
    if not exe:
        raise SystemExit("Chrome or Edge not found")
    subprocess.run([exe, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--hide-scrollbars", *args],
                   check=True, capture_output=True, timeout=120)


def main():
    OUT.mkdir(exist_ok=True)
    name = sys.argv[1] if len(sys.argv) > 1 else "Kelowna"
    ser = int(sys.argv[2]) if len(sys.argv) > 2 else 3
    deck = OUT / "cards.html"
    deck.write_text(f'<!doctype html><html><head><meta charset="utf-8"><title>Earthpull paper prototype</title>'
                    f'<style>{CSS}{PRINT_CSS}</style></head><body>{cover()}{sheets()}</body></html>', encoding="utf-8")
    home = OUT / "hometown.html"
    home.write_text(hometown(name, ser), encoding="utf-8")
    chrome(f"--print-to-pdf={OUT / 'paper-prototype-cards.pdf'}", deck.as_uri())
    chrome(f"--screenshot={OUT / 'hometown-pull-mockup.png'}", "--window-size=1080,1350", home.as_uri())
    print("Wrote", OUT / "paper-prototype-cards.pdf", "and", OUT / "hometown-pull-mockup.png")


if __name__ == "__main__":
    main()
