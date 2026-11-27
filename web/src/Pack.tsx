// The booster pack (pack opening, step a, 2026-11-26): a sealed foil pack in the leather-and-gold theme with
// crimped edges, a gold dot map drawn from the card pool's real places, and the compass pin. Swipe across the top
// to tear it open, or tap it (it tears itself). The pulls are already decided when the pack appears, like TCG Pocket.
import gsap from 'gsap'
import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { CompassPin } from './CardBack'
import type { Pool, Tier } from './data'
import { sfx } from './sfx'

const W = 260, H = 420
const TEAR_Y = 58 // the strip above this line rips off

type Kind = 'normal' | 'local'
const THEMES: Record<Kind, { top: string; mid: string; bottom: string; label: string }> = {
  normal: { top: '#7a2235', mid: '#4a0f1d', bottom: '#2a0710', label: 'NORTH AMERICA' },
  local: { top: '#b5363f', mid: '#7d1a26', bottom: '#4a0c14', label: 'LOCAL PACK' },
}

// Gold dot map of the pool's places (equirectangular over North America), cached per pool
const mapCache = new WeakMap<Pool, string>()
function dotMap(pool: Pool): string {
  const hit = mapCache.get(pool)
  if (hit) return hit
  const x0 = 22, x1 = W - 22, y0 = 168, y1 = 318, lon0 = -168, lon1 = -52, lat0 = 7, lat1 = 72
  const seen = new Set<string>(), parts: string[] = []
  for (const c of pool.cards) {
    if (c.lon < lon0 || c.lon > lon1 || c.lat < lat0 || c.lat > lat1) continue
    const x = Math.round((x0 + (c.lon - lon0) / (lon1 - lon0) * (x1 - x0)) / 3) * 3
    const y = Math.round((y1 - (c.lat - lat0) / (lat1 - lat0) * (y1 - y0)) / 3) * 3
    const k = `${x},${y}`
    if (seen.has(k)) continue // one dot per 3x3 cell: a halftone map
    seen.add(k)
    parts.push(`M${x} ${y}h0`)
  }
  const d = parts.join('')
  mapCache.set(pool, d)
  return d
}

// Foil bits thrown out by the rip, made once when the module loads
const BITS = Array.from({ length: 22 }, () => ({
  x: Math.random() * 100, dx: (Math.random() - 0.5) * 220, dy: -60 - Math.random() * 140, rot: (Math.random() - 0.5) * 720,
  w: 3 + Math.random() * 5, h: 2 + Math.random() * 3, delay: Math.random() * 120, gold: Math.random() > 0.35,
}))

// Pack outline: full width at the crimps, sides curving out between them
const BODY = `M5 24C1 50 0 80 0 110L0 ${H - 110}C0 ${H - 80} 1 ${H - 50} 5 ${H - 24}L${W - 5} ${H - 24}C${W - 1} ${H - 50} ${W} ${H - 80} ${W} ${H - 110}L${W} 110C${W} 80 ${W - 1} 50 ${W - 5} 24Z`
// [x, sideways drift, at the top crimp]
const WRINKLES: [number, number, boolean][] = [[18, 6, true], [46, -4, true], [86, 5, true], [128, -3, true], [170, 6, true], [212, -5, true], [244, -6, true],
  [24, 5, false], [62, -5, false], [104, 4, false], [150, -4, false], [196, 5, false], [236, -6, false]]

/** Zigzag crimp along the top or bottom edge. */
function crimp(y: number, dir: 1 | -1): string {
  const pts: string[] = [`M0 ${y}`]
  for (let x = 0; x <= W; x += 8) pts.push(`L${x} ${y + (x / 8) % 2 * 5 * dir}`)
  return pts.join('')
}

function PackArt({ pool, kind, id }: { pool: Pool; kind: Kind; id: string }) {
  const t = THEMES[kind]
  return (
    <>
      <defs>
        <linearGradient id={`foil${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={t.top} /><stop offset=".5" stopColor={t.mid} /><stop offset="1" stopColor={t.bottom} />
        </linearGradient>
        <linearGradient id={`pgold${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fbe7a6" /><stop offset=".5" stopColor="#d6a645" /><stop offset="1" stopColor="#a57422" /></linearGradient>
        <linearGradient id={`crimp${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f0c860" /><stop offset=".45" stopColor="#b8862f" /><stop offset="1" stopColor="#6e4a12" /></linearGradient>
        {/* Pillow shading: a foil pack bulges, so it darkens towards its sides and its crimped ends */}
        <linearGradient id={`roundX${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity=".6" /><stop offset=".1" stopColor="#000" stopOpacity=".15" />
          <stop offset=".3" stopColor="#fff" stopOpacity=".16" /><stop offset=".42" stopColor="#fff" stopOpacity="0" />
          <stop offset=".78" stopColor="#000" stopOpacity=".12" /><stop offset="1" stopColor="#000" stopOpacity=".65" />
        </linearGradient>
        <linearGradient id={`roundY${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity=".55" /><stop offset=".12" stopColor="#000" stopOpacity="0" />
          <stop offset=".86" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".6" />
        </linearGradient>
        <clipPath id={`body${id}`}><path d={BODY} /></clipPath>
        <filter id={`emb${id}`} x="-5%" y="-20%" width="110%" height="140%">
          <feDropShadow dx="0" dy="1.4" stdDeviation=".7" floodColor="#16030a" floodOpacity=".85" />
        </filter>
      </defs>
      {/* Body (pinched where it meets the crimps) and crimped ends */}
      <path d={BODY} fill={`url(#foil${id})`} />
      <path d={`${crimp(10, -1)}L${W} 24L0 24Z`} fill={`url(#crimp${id})`} />
      <path d={`${crimp(H - 10, 1)}L${W} ${H - 24}L0 ${H - 24}Z`} fill={`url(#crimp${id})`} />
      {[...Array(14)].map((_, i) => <line key={i} x1={6 + i * 18} y1="12" x2={6 + i * 18} y2="23" stroke="#6b4612" strokeWidth="1" opacity=".5" />)}
      {[...Array(14)].map((_, i) => <line key={`b${i}`} x1={6 + i * 18} y1={H - 23} x2={6 + i * 18} y2={H - 12} stroke="#6b4612" strokeWidth="1" opacity=".5" />)}
      {/* Wrinkles fanning out from the crimps */}
      <g clipPath={`url(#body${id})`} fill="none" strokeLinecap="round">
        {WRINKLES.map(([x, dx, top], i) => {
          const y0 = top ? 24 : H - 24, dir = top ? 1 : -1
          const d = `M${x} ${y0}q${dx} ${16 * dir} ${dx * 0.4} ${34 * dir}`
          return <g key={i}><path d={d} stroke="#fff" strokeOpacity=".13" strokeWidth="1.3" /><path d={d} transform="translate(2.2 0)" stroke="#000" strokeOpacity=".25" strokeWidth="1.3" /></g>
        })}
      </g>
      {/* Tear line with a notch */}
      <line x1="10" y1={TEAR_Y} x2={W - 10} y2={TEAR_Y} stroke="#f3d27e" strokeWidth="1" strokeDasharray="4 4" opacity=".55" />
      <path d={`M0 ${TEAR_Y - 5}L7 ${TEAR_Y}L0 ${TEAR_Y + 5}Z`} fill="#140b0f" />
      <text x={W / 2} y={TEAR_Y - 10} textAnchor="middle" fontFamily="Figtree, sans-serif" fontWeight="700" fontSize="7.5" letterSpacing="2.5" fill="#f3d27e" opacity=".7">TEAR HERE ›</text>
      {/* Front, embossed */}
      <g filter={`url(#emb${id})`}>
      <text x={W / 2} y="92" textAnchor="middle" fontFamily="Bricolage Grotesque, sans-serif" fontWeight="800" fontSize="22" letterSpacing="3.5" fill={`url(#pgold${id})`}>PULL THE PLANET</text>
      <text x={W / 2} y="110" textAnchor="middle" fontFamily="Figtree, sans-serif" fontWeight="700" fontSize="8.5" letterSpacing="3.5" fill="#e2b85a">{t.label} · BOOSTER</text>
      <path d={dotMap(pool)} stroke="#e2b85a" strokeWidth="1.5" strokeLinecap="round" opacity=".55" />
      <CompassPin id={`pk${id}`} cx={W / 2} hy={232} R={34} ty={290} hole={24} inside={t.mid} />
      <rect x={W / 2 - 62} y="330" width="124" height="26" rx="13" fill="#140b0f" opacity=".55" stroke="#e2b85a" strokeOpacity=".5" />
      <text x={W / 2} y="347" textAnchor="middle" fontFamily="Figtree, sans-serif" fontWeight="800" fontSize="10" letterSpacing="2.5" fill="#f3d27e">5 PLACES INSIDE</text>
      <text x={W / 2} y={H - 34} textAnchor="middle" fontFamily="Figtree, sans-serif" fontWeight="600" fontSize="6.5" letterSpacing="1.5" fill="#e2b85a" opacity=".6">0°00′N · 0°00′E</text>
      </g>
      {/* Shading on top of everything printed on the foil */}
      <path d={BODY} fill={`url(#roundX${id})`} />
      <path d={BODY} fill={`url(#roundY${id})`} />
      <path d={BODY} fill="none" stroke="#ffe7b0" strokeOpacity=".18" strokeWidth="1.2" />
    </>
  )
}

/**
 * The pack, ready to tear. Build-up while tearing (the pack trembles harder, light leaks from the cut, a hum rises),
 * then a squeeze and a pop: the pack pinches in for a split second and bursts, and `onTorn` fires on the pop. The
 * strip and the body are the same art clipped at the tear line, so the rip lines up exactly.
 */
// The rarity hint (like Genshin's star colour): the pack shows the best card inside before it is opened.
// Common and Rare packs give nothing away.
const HINT_COLOR: Record<Tier, string> = { Common: '', Rare: '', Epic: '#a970f7', Legendary: '#ffcf5a', Mythic: '#ff5f8f' }

export function Pack({ pool, kind = 'normal', onTorn, hint = 'Common', fakeFrom = null }: {
  pool: Pool; kind?: Kind; onTorn: () => void
  /** best card in the pack */ hint?: Tier
  /** fake-out: the pack first shows this lower tier, then upgrades to `hint` partway through the tear */ fakeFrom?: Tier | null
}) {
  const [shown, setShown] = useState<Tier>(fakeFrom ?? hint)
  const [upgrading, setUpgrading] = useState(false)
  const id = useId().replace(/:/g, '')
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; moved: boolean; lastCrinkle: number } | null>(null)
  const [progress, setProgress] = useState(0)
  const [torn, setTorn] = useState(false)

  // The fake-out lands halfway through the tear: a flash, a rising run of notes, and the glow jumps a tier
  useEffect(() => {
    if (shown === hint || progress < 0.55) return
    setShown(hint)
    setUpgrading(true)
    sfx.upgrade()
    const t = window.setTimeout(() => setUpgrading(false), 700)
    return () => clearTimeout(t)
  }, [progress, shown, hint])
  const locked = useRef(false) // the tear is complete: no more dragging

  const tear = () => {
    if (locked.current) return
    locked.current = true
    setProgress(1)
    sfx.humStop()
    const el = box.current
    const burst = () => { setTorn(true); sfx.rip(); sfx.pop(); onTorn() }
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { burst(); return }
    delete el.dataset.straining
    // Squeeze, then pop
    gsap.timeline()
      .to(el, { scaleX: 0.9, scaleY: 0.95, duration: 0.14, ease: 'power2.in' })
      .add(burst)
      .to(el, { scaleX: 1.07, scaleY: 1.05, duration: 0.08, ease: 'power2.out' })
      .to(el, { scaleX: 1, scaleY: 1, duration: 0.5, ease: 'elastic.out(1, 0.45)' })
  }
  const autoTear = () => {
    if (locked.current) return
    sfx.unlock()
    if (box.current) box.current.dataset.straining = '1'
    const start = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / 520)
      const eased = p * p // slow start, then faster: a build-up even for a tap
      setProgress(eased)
      sfx.hum(eased)
      if (Math.random() < 0.4) sfx.crinkle()
      if (p < 1) requestAnimationFrame(step); else tear()
    }
    requestAnimationFrame(step)
  }

  const rel = (e: PointerEvent) => {
    const r = box.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (torn) return
    sfx.unlock()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { ...rel(e), moved: false, lastCrinkle: 0 }
    if (box.current) box.current.dataset.straining = '1'
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const p = rel(e)
    // Tilt and a highlight that follow the pointer, like the cards
    const el = box.current
    if (el && e.pointerType !== 'touch' && !torn) {
      el.style.setProperty('--mx', `${(p.x * 100).toFixed(1)}%`)
      el.style.setProperty('--my', `${(p.y * 100).toFixed(1)}%`)
      el.style.setProperty('--rx', `${((0.5 - p.y) * 12).toFixed(2)}deg`)
      el.style.setProperty('--ry', `${((p.x - 0.5) * 14).toFixed(2)}deg`)
      el.dataset.tilt = '1'
    }
    const d = drag.current
    if (!d || torn) return
    if (Math.abs(p.x - d.x) > 0.04) d.moved = true
    if (!d.moved) return
    const prog = Math.max(0, Math.min(1, p.x))
    setProgress((cur) => Math.max(cur, prog))
    sfx.hum(Math.max(progress, prog))
    const now = performance.now()
    if (now - d.lastCrinkle > 45) { sfx.crinkle(); d.lastCrinkle = now }
    if (prog > 0.92) { drag.current = null; tear() }
  }
  const up = () => {
    const d = drag.current
    drag.current = null
    if (!d || locked.current) return
    if (!d.moved) { autoTear(); return }
    if (progress > 0.6) { tear(); return }
    sfx.humStop()
    if (box.current) delete box.current.dataset.straining
    setProgress(0)
  }

  const leave = () => {
    const el = box.current
    if (!el) return
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
    delete el.dataset.tilt
  }

  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') autoTear() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) })

  const cut = (TEAR_Y / H) * 100
  return (
    <div className="flex flex-col items-center gap-3 sm:gap-5">
      <div
        ref={box} role="button" tabIndex={0} aria-label="Pack: swipe across the top or tap to tear it open"
        className={`pack pack-hint-${shown.toLowerCase()} relative aspect-[260/420] w-[min(62vw,280px,(100dvh-230px)*0.62)] touch-none select-none ${torn ? 'pack-torn' : ''} ${upgrading ? 'pack-upgrading' : ''}`}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={leave}
        style={{ '--cut': `${cut}%`, '--prog': progress, '--hint': HINT_COLOR[shown] || '#ffe7b0' } as CSSProperties}
      >
        <div className="pack-rays" />
        <div className="pack-glow" />
        <div className="pack-floor" />
        <div className="pack-float absolute inset-0">
        <div className="pack-shake absolute inset-0">
        <div className="pack-tilt absolute inset-0">
          <svg viewBox={`0 0 ${W} ${H}`} className="pack-body absolute inset-0 h-full w-full" aria-hidden><PackArt pool={pool} kind={kind} id={`b${id}`} /></svg>
          <svg viewBox={`0 0 ${W} ${H}`} className="pack-strip absolute inset-0 h-full w-full" aria-hidden><PackArt pool={pool} kind={kind} id={`s${id}`} /></svg>
          <div className="pack-sheen pointer-events-none absolute inset-0" />
          <div className="pack-spec pointer-events-none absolute inset-0" />
          <div className="pack-seams pointer-events-none absolute inset-0" />
          <div className="pack-leak pointer-events-none absolute inset-x-0" />
          <div className="pack-cut pointer-events-none absolute left-0 h-[3px]" />
          {torn ? BITS.map((b, i) => (
            <span key={i} className="pack-bit" style={{
              left: `${b.x}%`, width: b.w, height: b.h, animationDelay: `${b.delay}ms`,
              background: b.gold ? '#f3d27e' : '#ffffff', '--dx': `${b.dx}px`, '--dy': `${b.dy}px`, '--rot': `${b.rot}deg`,
            } as CSSProperties} />
          )) : null}
        </div>
        </div>
        </div>
        {torn ? <div className="pack-flash pointer-events-none" /> : null}
      </div>
      <p className={`text-sm text-muted transition-opacity ${torn ? 'opacity-0' : ''}`}>
        <span className="hidden sm:inline">Drag across the top to tear it open, or click the pack.</span>
        <span className="sm:hidden">Swipe across the top to tear it open, or tap.</span>
      </p>
    </div>
  )
}
