// The card back and the game's mark (developer's pick, 2026-11-26): burgundy leather like a passport cover, the gold
// wordmark, and the compass pin: a map pin whose head holds a four-point compass star. Every card is a pin on the map,
// so the logo is one too. Earlier options (night Earth, nautical chart, topographic, passport crest, plain compass
// rose) are recorded in vault/Card Design Research.md.
import { useId, type CSSProperties } from 'react'
import type { Tier } from './data'

const TIER_GLOW: Record<Tier, string> = {
  Common: 'transparent',
  Rare: 'var(--color-rare)',
  Epic: 'var(--color-epic)',
  Legendary: 'var(--color-legendary)',
  Mythic: 'var(--color-mythic)',
}

export const LEATHER = '#4a0f1d'
const GOLD_LIGHT = '#f3d27e', GOLD_DARK = '#a8731f', GOLD_LINE = '#e2b85a'
const W = 250, H = 350

/** One compass point: a long diamond split down its axis, light on the left half and dark on the right. */
function Point({ cx, cy, angle, len, wide }: { cx: number; cy: number; angle: number; len: number; wide: number }) {
  const a = (angle - 90) * Math.PI / 180, n = [Math.cos(a), Math.sin(a)], p = [-n[1], n[0]]
  const tip = [cx + n[0] * len, cy + n[1] * len], mid = len * 0.18
  const l = [cx + n[0] * mid - p[0] * wide, cy + n[1] * mid - p[1] * wide], r = [cx + n[0] * mid + p[0] * wide, cy + n[1] * mid + p[1] * wide]
  return (
    <g>
      <path d={`M${cx} ${cy}L${l[0]} ${l[1]}L${tip[0]} ${tip[1]}Z`} fill={GOLD_LIGHT} />
      <path d={`M${cx} ${cy}L${r[0]} ${r[1]}L${tip[0]} ${tip[1]}Z`} fill={GOLD_DARK} />
    </g>
  )
}

/**
 * The compass pin. The pin's head is centred at (cx, hy) with radius R and its point at (cx, ty); the head is
 * hollow (cut to `hole`, shown in the background colour) and holds the compass star.
 */
export function CompassPin({ cx, hy, R, ty, hole, id, inside = LEATHER, shadow = true }: {
  cx: number; hy: number; R: number; ty: number; hole: number; id: string; inside?: string; shadow?: boolean
}) {
  const k = (ty - hy) * 0.38
  const d = `M${cx} ${ty}C${cx - R * 0.3} ${ty - k} ${cx - R} ${hy + R * 0.8} ${cx - R} ${hy}A${R} ${R} 0 1 1 ${cx + R} ${hy}C${cx + R} ${hy + R * 0.8} ${cx + R * 0.3} ${ty - k} ${cx} ${ty}Z`
  const star = hole * 0.88, wide = hole * 0.24
  return (
    <g>
      {shadow ? <ellipse cx={cx} cy={ty + 3} rx={R * 0.75} ry={R * 0.16} fill="none" stroke={GOLD_LINE} strokeWidth="1.4" opacity=".55" /> : null}
      <clipPath id={`pinL${id}`}><rect x={cx - R - 2} y={hy - R - 2} width={R + 2} height={ty - hy + R + 4} /></clipPath>
      <path d={d} fill={GOLD_DARK} />
      <path d={d} fill={GOLD_LIGHT} clipPath={`url(#pinL${id})`} />
      <circle cx={cx} cy={hy} r={hole} fill={inside} stroke={GOLD_DARK} strokeWidth="1" />
      {[90, 270, 180, 0].map((a) => <Point key={a} cx={cx} cy={hy} angle={a} len={star} wide={wide} />)}
      <circle cx={cx} cy={hy} r={wide * 0.5} fill={inside} stroke={GOLD_LINE} strokeWidth="1.2" />
    </g>
  )
}

/** The logo on its own, for the header (scales with its box; square). */
export function LogoMark({ className = '' }: { className?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Pull the Planet">
      <CompassPin id={id} cx={50} hy={38} R={34} ty={96} hole={24} inside="#0b0608" shadow={false} />
    </svg>
  )
}

/** Face-down card: the leather back, glowing in the rarity colour of what's inside (none for Common). */
export function CardBack({ tier }: { tier: Tier }) {
  const id = useId().replace(/:/g, '')
  const style = { '--glow': TIER_GLOW[tier] } as CSSProperties
  const cx = W / 2, cy = 192, r = 70
  return (
    <div className={`h-full w-full overflow-hidden rounded-[6%/4.3%] shadow-[0_10px_30px_-8px_rgba(0,0,0,.9)] ${tier === 'Common' ? '' : 'glow'}`} style={style}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-full w-full" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Pull the Planet card, face down">
        <defs>
          <linearGradient id={`leather${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6b1a2b" /><stop offset=".55" stopColor={LEATHER} /><stop offset="1" stopColor="#350a15" /></linearGradient>
          <linearGradient id={`gold${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fbe7a6" /><stop offset=".5" stopColor="#d6a645" /><stop offset="1" stopColor="#a57422" /></linearGradient>
          <filter id={`grain${id}`}><feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="3" /><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .22 0" /></filter>
          <filter id={`emboss${id}`} x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="1.2" stdDeviation=".6" floodColor="#12030a" floodOpacity=".8" /></filter>
        </defs>
        <rect width={W} height={H} fill={`url(#leather${id})`} />
        <rect width={W} height={H} filter={`url(#grain${id})`} />
        <rect x="9" y="9" width={W - 18} height={H - 18} rx="8" fill="none" stroke={GOLD_LINE} strokeOpacity=".35" strokeDasharray="2 3" />
        {/* Gold edge, so the back stands out against the dark wine page */}
        <rect x="1.5" y="1.5" width={W - 3} height={H - 3} rx="13" fill="none" stroke={`url(#gold${id})`} strokeWidth="3" opacity=".85" />
        <g filter={`url(#emboss${id})`}>
          <text x={cx} y={62} textAnchor="middle" fontFamily="Bricolage Grotesque, sans-serif" fontWeight="800" fontSize="17" letterSpacing="3.6" fill={`url(#gold${id})`}>PULL THE PLANET</text>
          <text x={cx} y={80} textAnchor="middle" fontFamily="Figtree, sans-serif" fontWeight="700" fontSize="7.5" letterSpacing="3" fill={`url(#gold${id})`}>WORLD COLLECTOR</text>
          <CompassPin id={id} cx={cx} hy={cy - r * 0.32} R={r * 0.72} ty={cy + r * 1.05} hole={r * 0.72 * 0.7} />
          {/* Hidden detail: Null Island, 0° 0° */}
          <text x={cx} y={cy + 102} textAnchor="middle" fontFamily="Figtree, sans-serif" fontWeight="600" fontSize="6.5" letterSpacing="1.5" fill={GOLD_LINE} opacity=".7">0°00′N · 0°00′E</text>
        </g>
      </svg>
    </div>
  )
}
