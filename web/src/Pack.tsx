// The booster pack (2026-11-27, redesigned after the developer said it "doesn't look like a real TCG pack"): like a
// real booster, the front is a full-bleed hero photo of a famous place (a different one per pack, like Pokemon's
// pack variants), with the embossed logo and set banner on top, a foil seal with the card count, the variant name and
// tiny photo credits at the bottom, and heat-sealed ends with fine ridges and serrated edges. Swipe across the top to
// tear it open, or tap it (it tears itself). The pulls are already decided when the pack appears, like TCG Pocket.
import gsap from 'gsap'
import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { CompassPin } from './CardBack'
import type { Tier } from './data'
import { sfx } from './sfx'

const W = 260, H = 420
const TEAR_Y = 58 // the strip above this line rips off
const ART_Y = 24, ART_H = H - 48 // the printed front, between the two sealed ends

type Kind = 'normal' | 'local'
const THEMES: Record<Kind, { frame: string; set: string; band: string }> = {
  normal: { frame: '#e2b85a', set: 'NORTH AMERICA', band: '#2a0710' },
  local: { frame: '#ff8a8e', set: 'LOCAL PACK', band: '#4a0c14' },
}

/** Hero photos for the pack front (Wikimedia Commons, cropped in web/public/pack-art/; credits printed on the pack). */
export const PACK_ARTS = [
  { file: 'golden-gate', name: 'Golden Gate Bridge', credit: 'Rich Niewiroski Jr · CC BY 2.5' },
  { file: 'chichen-itza', name: 'Chichén Itzá', credit: 'Daniel Schwen · CC BY-SA 4.0' },
  { file: 'statue-of-liberty', name: 'Statue of Liberty', credit: 'Christian David · CC BY-SA 4.0' },
  { file: 'rocky-mountains', name: 'Rocky Mountains', credit: 'Gorgo · Public domain' },
  { file: 'cn-tower', name: 'CN Tower', credit: 'Chris Woodrich · CC BY-SA 4.0' },
]
/** Load the hero photos ahead of time, so the pack never appears blank. */
export function preloadPackArt() { PACK_ARTS.forEach((a) => { new Image().src = `/pack-art/${a.file}.webp` }) }

// Foil bits thrown out by the rip, made once when the module loads
const BITS = Array.from({ length: 22 }, () => ({
  x: Math.random() * 100, dx: (Math.random() - 0.5) * 220, dy: -60 - Math.random() * 140, rot: (Math.random() - 0.5) * 720,
  w: 3 + Math.random() * 5, h: 2 + Math.random() * 3, delay: Math.random() * 120, gold: Math.random() > 0.35,
}))

// Pack outline: full width at the seals, sides curving out a little between them
const BODY = `M3 24C1 50 0 80 0 110L0 ${H - 110}C0 ${H - 80} 1 ${H - 50} 3 ${H - 24}L${W - 3} ${H - 24}C${W - 1} ${H - 50} ${W} ${H - 80} ${W} ${H - 110}L${W} 110C${W} 80 ${W - 1} 50 ${W - 3} 24Z`
// [x, sideways drift, at the top seal]
const WRINKLES: [number, number, boolean][] = [[18, 6, true], [46, -4, true], [86, 5, true], [128, -3, true], [170, 6, true], [212, -5, true], [244, -6, true],
  [24, 5, false], [62, -5, false], [104, 4, false], [150, -4, false], [196, 5, false], [236, -6, false]]

/** A heat-sealed end: a strip with a finely serrated outer edge. `y0` is the outer edge, `y1` where it meets the front. */
function seal(y0: number, y1: number): string {
  const dir = y1 > y0 ? 1 : -1, pts: string[] = [`M0 ${y1}`, `L0 ${y0 + dir * 2}`]
  for (let x = 0; x <= W; x += 3) pts.push(`L${x} ${y0 + ((x / 3) % 2 ? dir * 2.4 : 0)}`)
  pts.push(`L${W} ${y1}Z`)
  return pts.join('')
}

function PackArt({ kind, id, art }: { kind: Kind; id: string; art: number }) {
  const t = THEMES[kind], a = PACK_ARTS[art % PACK_ARTS.length]
  return (
    <>
      <defs>
        <linearGradient id={`pgold${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff3c4" /><stop offset=".45" stopColor="#e8b84a" /><stop offset=".55" stopColor="#c99232" /><stop offset="1" stopColor="#8a5a12" /></linearGradient>
        <linearGradient id={`seal${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f6dc95" /><stop offset=".5" stopColor="#b8862f" /><stop offset="1" stopColor="#7a5214" /></linearGradient>
        {/* Fine ridges pressed into the seals */}
        <pattern id={`ridge${id}`} width="3" height="24" patternUnits="userSpaceOnUse">
          <rect width="1.4" height="24" fill="#fff" opacity=".28" /><rect x="1.5" width="1.4" height="24" fill="#000" opacity=".28" />
        </pattern>
        <linearGradient id={`shadeTop${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={t.band} stopOpacity=".92" /><stop offset=".28" stopColor={t.band} stopOpacity=".55" /><stop offset=".45" stopColor={t.band} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`shadeBot${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset=".58" stopColor={t.band} stopOpacity="0" /><stop offset=".8" stopColor={t.band} stopOpacity=".7" /><stop offset="1" stopColor={t.band} stopOpacity=".95" />
        </linearGradient>
        {/* Pillow shading: a foil pack bulges, so it darkens towards its sides and its sealed ends */}
        <linearGradient id={`roundX${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity=".55" /><stop offset=".09" stopColor="#000" stopOpacity=".1" />
          <stop offset=".3" stopColor="#fff" stopOpacity=".14" /><stop offset=".42" stopColor="#fff" stopOpacity="0" />
          <stop offset=".8" stopColor="#000" stopOpacity=".08" /><stop offset="1" stopColor="#000" stopOpacity=".6" />
        </linearGradient>
        <linearGradient id={`roundY${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity=".45" /><stop offset=".08" stopColor="#000" stopOpacity="0" />
          <stop offset=".92" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".5" />
        </linearGradient>
        <clipPath id={`body${id}`}><path d={BODY} /></clipPath>
        <filter id={`emb${id}`} x="-5%" y="-30%" width="110%" height="160%">
          <feDropShadow dx="0" dy="1.6" stdDeviation=".8" floodColor="#0c0205" floodOpacity=".95" />
        </filter>
      </defs>

      {/* The printed front: hero photo, full bleed */}
      <g clipPath={`url(#body${id})`}>
        <rect x="0" y={ART_Y} width={W} height={ART_H} fill={t.band} />
        <image href={`/pack-art/${a.file}.webp`} x="0" y={ART_Y} width={W} height={ART_H} preserveAspectRatio="xMidYMid slice" />
        <rect x="0" y={ART_Y} width={W} height={ART_H} fill={`url(#shadeTop${id})`} />
        <rect x="0" y={ART_Y} width={W} height={ART_H} fill={`url(#shadeBot${id})`} />
        {/* Inset frame, like the printed border on a real pack */}
        <rect x="7" y={ART_Y + 6} width={W - 14} height={ART_H - 12} rx="5" fill="none" stroke={t.frame} strokeWidth="1.3" opacity=".85" />
        <rect x="10" y={ART_Y + 9} width={W - 20} height={ART_H - 18} rx="3" fill="none" stroke={t.frame} strokeWidth=".5" opacity=".5" />
        {/* Wrinkles fanning out from the seals */}
        <g fill="none" strokeLinecap="round">
          {WRINKLES.map(([x, dx, top], i) => {
            const y0 = top ? 24 : H - 24, dir = top ? 1 : -1
            const d = `M${x} ${y0}q${dx} ${16 * dir} ${dx * 0.4} ${34 * dir}`
            return <g key={i}><path d={d} stroke="#fff" strokeOpacity=".16" strokeWidth="1.3" /><path d={d} transform="translate(2.2 0)" stroke="#000" strokeOpacity=".3" strokeWidth="1.3" /></g>
          })}
        </g>
      </g>

      {/* Heat-sealed ends */}
      <path d={seal(0, 24)} fill={`url(#seal${id})`} />
      <path d={seal(0, 24)} fill={`url(#ridge${id})`} />
      <path d={seal(H, H - 24)} fill={`url(#seal${id})`} />
      <path d={seal(H, H - 24)} fill={`url(#ridge${id})`} />
      <rect x="0" y="23" width={W} height="1.5" fill="#000" opacity=".35" />
      <rect x="0" y={H - 24.5} width={W} height="1.5" fill="#000" opacity=".35" />

      {/* Tear line with a notch */}
      <line x1="14" y1={TEAR_Y} x2={W - 14} y2={TEAR_Y} stroke="#f3d27e" strokeWidth="1" strokeDasharray="4 4" opacity=".75" />
      <path d={`M0 ${TEAR_Y - 5}L7 ${TEAR_Y}L0 ${TEAR_Y + 5}Z`} fill="#0b0608" />
      <text x={W / 2} y={TEAR_Y - 11} textAnchor="middle" fontFamily="Figtree, sans-serif" fontWeight="800" fontSize="7" letterSpacing="2.5" fill="#f3d27e" opacity=".8">TEAR HERE ›</text>

      {/* Logo and set banner, embossed */}
      <g filter={`url(#emb${id})`}>
        <text x={W / 2} y="94" textAnchor="middle" fontFamily="Bricolage Grotesque, sans-serif" fontWeight="800" fontSize="27" letterSpacing="1.5"
          fill={`url(#pgold${id})`} stroke="#2a1205" strokeWidth="1.2" paintOrder="stroke">PULL THE</text>
        <text x={W / 2} y="124" textAnchor="middle" fontFamily="Bricolage Grotesque, sans-serif" fontWeight="800" fontSize="34" letterSpacing="2"
          fill={`url(#pgold${id})`} stroke="#2a1205" strokeWidth="1.4" paintOrder="stroke">PLANET</text>
        <rect x={W / 2 - 84} y="133" width="168" height="17" rx="8.5" fill={t.band} opacity=".85" stroke={t.frame} strokeWidth="1" />
        <CompassPin id={`ps${id}`} cx={W / 2 - 74} hy={139.5} R={5} ty={147} hole={3.4} inside={t.band} shadow={false} />
        <text x={W / 2 + 7} y="144.8" textAnchor="middle" fontFamily="Figtree, sans-serif" fontWeight="800" fontSize="7.4" letterSpacing="1.8" fill="#f6dc95">{t.set} · SERIES 1</text>
      </g>

      {/* Foil seal with the card count */}
      <g filter={`url(#emb${id})`}>
        <circle cx="44" cy={H - 64} r="24" fill={`url(#pgold${id})`} stroke="#5a3a0a" strokeWidth="1" />
        <circle cx="44" cy={H - 64} r="20" fill="none" stroke="#fff3c4" strokeWidth=".7" strokeDasharray="1.5 2" opacity=".8" />
        <text x="44" y={H - 60} textAnchor="middle" fontFamily="Bricolage Grotesque, sans-serif" fontWeight="800" fontSize="22" fill="#2a1205">5</text>
        <text x="44" y={H - 50} textAnchor="middle" fontFamily="Figtree, sans-serif" fontWeight="800" fontSize="4.6" letterSpacing=".6" fill="#2a1205">PLACE CARDS</text>
      </g>
      {/* Variant name */}
      <g filter={`url(#emb${id})`}>
        <text x={W - 16} y={H - 70} textAnchor="end" fontFamily="Figtree, sans-serif" fontWeight="700" fontSize="6" letterSpacing="2" fill="#f6dc95" opacity=".85">FEATURING</text>
        <text x={W - 16} y={H - 57} textAnchor="end" fontFamily="Bricolage Grotesque, sans-serif" fontWeight="800" fontSize="11.5" fill="#fff3d6">{a.name}</text>
      </g>
      {/* Small print */}
      <text x={W / 2} y={H - 34} textAnchor="middle" fontFamily="Figtree, sans-serif" fontWeight="600" fontSize="4.4" letterSpacing=".3" fill="#f6dc95" opacity=".7">
        Photo: {a.credit} · Wikimedia Commons · 0°00′N 0°00′E
      </text>

      {/* Shading on top of everything printed on the foil */}
      <path d={BODY} fill={`url(#roundX${id})`} />
      <path d={BODY} fill={`url(#roundY${id})`} />
      <path d={BODY} fill="none" stroke="#ffe7b0" strokeOpacity=".22" strokeWidth="1.2" />
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

export function Pack({ kind = 'normal', onTorn, hint = 'Common', fakeFrom = null, art = 0 }: {
  kind?: Kind; onTorn: () => void
  /** which hero photo (PACK_ARTS) is on the front */ art?: number
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
          <svg viewBox={`0 0 ${W} ${H}`} className="pack-body absolute inset-0 h-full w-full" aria-hidden><PackArt kind={kind} art={art} id={`b${id}`} /></svg>
          <svg viewBox={`0 0 ${W} ${H}`} className="pack-strip absolute inset-0 h-full w-full" aria-hidden><PackArt kind={kind} art={art} id={`s${id}`} /></svg>
          <div className="pack-sheen pointer-events-none absolute inset-0" />
          <div className="pack-spec pointer-events-none absolute inset-0" />
          <div className="pack-holo pointer-events-none absolute inset-0" />
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
