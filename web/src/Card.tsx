import type { CSSProperties } from 'react'
import { imageUrl, regionName, type IndexCard, type Pool, type Tier } from './data'

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

export function capText(tier: Tier): string {
  return { Common: '', Rare: '/1,000', Epic: '/100', Legendary: '/10', Mythic: '' }[tier]
}

/** The front of a card. `size` sets the type scale; the card fills its container (aspect 5:7). */
export function CardFace({ pool, card, serial, hometown, size = 'md', showSerial = true }: {
  pool: Pool; card: IndexCard; serial: number | null; hometown?: boolean; size?: 'sm' | 'md' | 'lg'; showSerial?: boolean
}) {
  const color = TIER_COLOR[card.tier]
  const name = size === 'sm' ? 'text-[13px]' : size === 'md' ? 'text-base' : 'text-2xl'
  const sub = size === 'sm' ? 'text-[10px]' : size === 'md' ? 'text-xs' : 'text-sm'
  const img = imageUrl(card.image)
  return (
    <div
      className={`h-full w-full rounded-[14px] p-[3px] ${card.tier === 'Mythic' ? 'mythic-frame' : ''}`}
      style={card.tier === 'Mythic' ? undefined : { background: color }}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-[11px] bg-panel">
        <div className="relative flex-[1.35] overflow-hidden bg-panel-2">
          {img ? <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" /> : null}
          <span
            className={`absolute left-2 top-2 rounded-md px-1.5 py-0.5 font-semibold uppercase tracking-wider text-ground ${sub}`}
            style={{ background: color }}
          >
            {card.tier}
          </span>
          {hometown ? (
            <span className={`absolute right-2 top-2 rounded-md bg-ground/80 px-1.5 py-0.5 font-semibold text-accent ${sub}`}>Hometown</span>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col gap-0.5 px-2.5 pb-2 pt-2">
          <div className={`font-display font-semibold leading-tight text-balance ${name}`}>{card.label}</div>
          <div className={`text-muted ${sub} truncate`}>{kindLabel(card)} · {regionName(pool, card.region)}</div>
          <div className="mt-auto flex items-baseline justify-between">
            {showSerial ? (
              <span className={`font-display font-extrabold tabular-nums ${size === 'lg' ? 'text-xl' : 'text-sm'}`} style={{ color }}>
                {serialText(serial, card.tier)}
                <span className="font-sans text-[0.75em] font-medium text-muted">{serial != null ? capText(card.tier) : ''}</span>
              </span>
            ) : <span />}
            <span className={`text-muted ${sub}`}>{card.region.slice(0, 2)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Face-down card: the pack art, glowing in the rarity colour of what's inside. */
export function CardBack({ tier }: { tier: Tier }) {
  const style = { '--glow': TIER_COLOR[tier] } as CSSProperties
  return (
    <div className={`h-full w-full rounded-[14px] border border-line bg-panel-2 ${tier === 'Common' ? '' : 'glow'}`} style={style}>
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-[14px] bg-[radial-gradient(circle_at_50%_40%,#24324a,transparent_70%)]">
        <svg viewBox="0 0 64 64" className="h-1/3 w-1/3 text-accent" fill="none" stroke="currentColor" strokeWidth="2.2">
          <circle cx="32" cy="32" r="26" />
          <ellipse cx="32" cy="32" rx="11" ry="26" />
          <path d="M6 32h52M10 19h44M10 45h44" />
        </svg>
        <span className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-muted">Pull the Planet</span>
      </div>
    </div>
  )
}
