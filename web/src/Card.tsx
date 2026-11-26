import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { CAPS, FOIL_CAPS, imageUrl, loadDetail, regionName, type Fact, type IndexCard, type Pool, type Tier } from './data'

export const TIER_COLOR: Record<Tier, string> = {
  Common: 'var(--color-common)',
  Rare: 'var(--color-rare)',
  Epic: 'var(--color-epic)',
  Legendary: 'var(--color-legendary)',
  Mythic: 'var(--color-mythic)',
}

const KIND_FALLBACK = { town: 'Town', nature: 'Place', built: 'Landmark' }

export function kindLabel(card: IndexCard): string {
  const k = card.kind.split(',')[0].trim()
  if (!k || k === 'town') return KIND_FALLBACK[card.type]
  return k.charAt(0).toUpperCase() + k.slice(1)
}

export function serialText(serial: number | null, tier: Tier): string {
  if (tier === 'Mythic') return '1 of 1'
  return serial == null ? tier : `#${serial.toLocaleString('en-US')}`
}

export function capText(tier: Tier, foil = false): string {
  const cap = (foil ? FOIL_CAPS : CAPS)[tier]
  return cap && tier !== 'Mythic' ? `/${cap.toLocaleString('en-US')}` : ''
}

const FACT_LABEL: Record<Fact['key'], string> = {
  population: 'Population', height_m: 'Height', elevation_m: 'Elevation', prominence_m: 'Prominence',
  length_km: 'Length', area_km2: 'Area', temp_c: 'Avg temp',
}

function fmtNum(v: number): string {
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M`
  return Math.round(v).toLocaleString('en-US')
}

export function factValue(f: Fact): string {
  switch (f.key) {
    case 'population': return fmtNum(f.value)
    case 'temp_c': return `${f.value.toFixed(1)}°C`
    case 'length_km': case 'area_km2': {
      const n = f.value >= 100 ? fmtNum(f.value) : String(Math.round(f.value * 10) / 10)
      return `${n} ${f.key === 'area_km2' ? 'km²' : 'km'}`
    }
    default: return `${fmtNum(f.value)} m`
  }
}

const coord = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? pos : neg}`

function collectorLine(pool: Pool, card: IndexCard): string {
  // Numeric subdivision codes (AG-03) say nothing alone, so they keep the country prefix
  const sub = card.region.split('-')[1] ?? card.region
  const code = /^\d+$/.test(sub) ? card.region : sub
  const total = pool.regions[card.region]?.count
  if (!card.num) return code
  return total ? `${code} ${String(card.num).padStart(String(total).length, '0')}/${total}` : `${code} ${card.num}`
}

/** Rarity at a glance: dot, diamond, two diamonds, star, crown. */
export function RaritySymbol({ tier, className = '' }: { tier: Tier; className?: string }) {
  const p = { fill: TIER_COLOR[tier], stroke: 'rgba(0,0,0,.55)', strokeWidth: 1.4, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label={tier}>
      {tier === 'Common' ? <circle cx="12" cy="12" r="5.5" {...p} /> : null}
      {tier === 'Rare' ? <path d="M12 3.5 20.5 12 12 20.5 3.5 12Z" {...p} /> : null}
      {tier === 'Epic' ? <><path d="M7.5 5 13 12 7.5 19 2 12Z" {...p} /><path d="M16.5 5 22 12 16.5 19 11 12Z" {...p} /></> : null}
      {tier === 'Legendary' ? <path d="m12 2.8 2.7 5.9 6.4.7-4.8 4.3 1.3 6.4L12 16.9l-5.6 3.2 1.3-6.4-4.8-4.3 6.4-.7Z" {...p} /> : null}
      {tier === 'Mythic' ? <path d="M3 18.5 2 7.5l5.5 4.2L12 4l4.5 7.7L22 7.5l-1 11Z" {...p} /> : null}
    </svg>
  )
}

export type Stamp = { kind: 'local' | 'hometown'; place: string; date: number }

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const stampDate = (t: number) => { const d = new Date(t); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` }

/** Round die-cut sticker on the photo: where and when this copy was pulled. */
export function StampSticker({ stamp, inline = false }: { stamp: Stamp; inline?: boolean }) {
  const id = useId().replace(/:/g, '')
  const ring = stamp.kind === 'local' ? 'LOCAL PULL ✦ LOCAL PULL ✦ ' : 'HOMETOWN ✦ HOMETOWN ✦ '
  const place = stamp.place.length > 16 ? `${stamp.place.slice(0, 15)}…` : stamp.place
  const placeSize = place.length > 11 ? 8.5 : place.length > 8 ? 10 : 12
  return (
    <svg viewBox="0 0 100 100" className={`tcg-stamp tcg-stamp-${stamp.kind} ${inline ? 'tcg-stamp-inline' : ''}`} role="img"
      aria-label={`${stamp.kind === 'local' ? 'Local pull' : 'Hometown'}: ${stamp.place}, ${stampDate(stamp.date)}`}>
      <defs><path id={`r${id}`} d="M50 50m-34 0a34 34 0 1 1 68 0a34 34 0 1 1-68 0" /></defs>
      <circle cx="50" cy="50" r="47" fill="#fff" />
      <circle cx="50" cy="50" r="43" className="tcg-stamp-ink" />
      <circle cx="50" cy="50" r="26.5" fill="none" stroke="#fff" strokeWidth="1.2" opacity=".85" />
      <text fontSize="8.6" fontWeight="800" letterSpacing="1.1" fill="#fff"><textPath href={`#r${id}`}>{ring}</textPath></text>
      <text x="50" y="49" textAnchor="middle" fontSize={placeSize} fontWeight="800" fill="#fff">{place}</text>
      <text x="50" y="61" textAnchor="middle" fontSize="7" fontWeight="700" fill="#fff" opacity=".9">{stampDate(stamp.date)}</text>
    </svg>
  )
}

/** Tilt and pointer-following light, set as CSS variables (no re-render per move). */
function useTilt() {
  const ref = useRef<HTMLDivElement>(null)
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el || e.pointerType === 'touch') return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height
    el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`)
    el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`)
    el.style.setProperty('--rx', `${((0.5 - y) * 14).toFixed(2)}deg`)
    el.style.setProperty('--ry', `${((x - 0.5) * 14).toFixed(2)}deg`)
    el.dataset.active = '1'
  }
  const onPointerLeave = () => {
    const el = ref.current
    if (!el) return
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
    delete el.dataset.active
  }
  return { ref, onPointerMove, onPointerLeave }
}

/** Flavour line, loaded from the region file (it isn't in the compact index). */
function useFlavour(pool: Pool, id: string, want: boolean): string | undefined {
  const [text, setText] = useState<string | undefined>()
  useEffect(() => {
    if (!want) return
    let live = true
    loadDetail(pool, id).then((d) => { if (live) setText(d?.flavour?.text || '') })
    return () => { live = false }
  }, [pool, id, want])
  return text
}

/**
 * The front of a card. It fills its container (aspect 5:7) and scales with its width. Rarity shows in the frame,
 * not the photo: plain slate for Common, then contour lines (Rare), a lat/long grid (Epic), gold (Legendary) and a
 * moving rainbow (Mythic). A foil copy adds a holographic shine to the frame and text panel; the photo stays clean.
 */
export function CardFace({ pool, card, serial, stamp, foil: foilAsked = false, size = 'md', showSerial = true }: {
  pool: Pool; card: IndexCard; serial: number | null; stamp?: Stamp; foil?: boolean
  size?: 'sm' | 'md' | 'lg'; showSerial?: boolean
}) {
  const tilt = useTilt()
  const foil = foilAsked && card.tier !== 'Mythic' // the Mythic is a single copy with no foil version
  const flavour = useFlavour(pool, card.id, size !== 'sm')
  const img = imageUrl(card.image)
  const isMap = card.image.includes('minimap')
  const nameSize = card.label.length > 30 ? 'tcg-name-xs' : card.label.length > 20 ? 'tcg-name-sm' : ''

  return (
    <div {...tilt} className={`tcg tcg-${card.tier.toLowerCase()} ${foil ? 'tcg-is-foil' : ''}`}
      style={{ '--tier': TIER_COLOR[card.tier] } as CSSProperties}>
      <div className="tcg-tilt">
        <div className="tcg-pattern" />
        {foil ? <div className="tcg-foil" /> : null}
        <div className="tcg-body">
          <header className="tcg-head">
            <span className={`tcg-name ${nameSize}`}>{card.label}</span>
            <RaritySymbol tier={card.tier} className="tcg-symbol" />
          </header>
          <div className={`tcg-art ${isMap ? 'tcg-art-map' : ''}`}>
            {img ? <img src={img} alt="" loading="lazy" /> : null}
            <div className="tcg-art-shade" />
            {card.tier === 'Mythic' ? <div className="tcg-ribbon">✦ Mythic · One of One ✦</div> : null}
            {stamp ? <StampSticker stamp={stamp} /> : null}
          </div>
          <div className="tcg-type">
            <span className="tcg-kind">{kindLabel(card)} · {regionName(pool, card.region)}</span>
            <span className="tcg-coord">{coord(card.lat, 'N', 'S')} {coord(card.lon, 'E', 'W')}</span>
          </div>
          {card.facts.length ? (
            <dl className="tcg-facts">
              {card.facts.map((f) => (
                <div key={f.key}><dt>{FACT_LABEL[f.key]}</dt><dd>{factValue(f)}</dd></div>
              ))}
            </dl>
          ) : null}
          {size !== 'sm' ? <p className="tcg-flavour">{flavour}</p> : null}
          <footer className="tcg-foot">
            <span className="tcg-collector">{collectorLine(pool, card)}</span>
            {showSerial ? <SerialStamp tier={card.tier} serial={serial} foil={foil} /> : null}
          </footer>
        </div>
        <div className="tcg-glare" />
      </div>
    </div>
  )
}

/** Serial printed on the card face like a stamped number. Foils are their own run (Rare foil /500). */
function SerialStamp({ tier, serial, foil }: { tier: Tier; serial: number | null; foil: boolean }) {
  if (tier === 'Mythic') return <span className="tcg-serial tcg-serial-mythic">1 of 1</span>
  if (serial == null) return foil ? <span className="tcg-serial tcg-serial-foil">Foil</span> : null
  const cap = capText(tier, foil)
  return (
    <span className={`tcg-serial ${foil ? 'tcg-serial-foil' : ''} ${tier === 'Legendary' ? 'tcg-serial-gold' : ''}`}>
      {foil ? <span className="tcg-serial-tag">Foil</span> : null}#{serial.toLocaleString('en-US')}<span className="tcg-serial-cap">{cap}</span>
    </span>
  )
}

export { CardBack } from './CardBack'
