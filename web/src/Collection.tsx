import { useMemo, useState } from 'react'
import { CardFace, TIER_COLOR } from './Card'
import { CardModal } from './CardModal'
import { TIERS, type IndexCard, type Pool, type Tier } from './data'
import { stampOf, type GameState } from './game'

export interface OwnedCard {
  key: string; card: IndexCard; serial: number | null; copies: number; at: number
  hometown: boolean; foil: boolean; local?: string
}

/** One entry per card and variant (plain, foil, Local-stamped): the lowest serial owned, copies, latest pull time. */
export function ownedCards(pool: Pool, state: GameState): OwnedCard[] {
  const m = new Map<string, OwnedCard>()
  for (const o of state.owned) {
    const card = pool.byId.get(o.id)
    if (!card) continue
    const key = `${o.id}|${o.foil ? 'foil' : ''}|${o.local ?? ''}|${o.hometown ? 'home' : ''}`
    const cur = m.get(key)
    if (!cur) m.set(key, { key, card, serial: o.serial, copies: 1, at: o.at, hometown: !!o.hometown, foil: !!o.foil, local: o.local })
    else {
      cur.copies += 1
      cur.at = Math.max(cur.at, o.at)
      if (o.serial != null && (cur.serial == null || o.serial < cur.serial)) cur.serial = o.serial
    }
  }
  return [...m.values()]
}

const select = 'rounded-lg border border-line bg-panel px-2.5 py-1.5 text-sm'

export function Collection({ pool, state }: { pool: Pool; state: GameState }) {
  const all = useMemo(() => ownedCards(pool, state), [pool, state])
  const [tier, setTier] = useState<'' | Tier>('')
  const [country, setCountry] = useState('')
  const [type, setType] = useState('')
  const [variant, setVariant] = useState<'' | 'foil' | 'local'>('')
  const [sort, setSort] = useState<'rarity' | 'new' | 'name'>('rarity')
  const [open, setOpen] = useState<OwnedCard | null>(null)

  const countries = useMemo(() => [...new Set(all.map((o) => o.card.region.slice(0, 2)))].sort(), [all])
  const shown = all
    .filter((o) => (!tier || o.card.tier === tier) && (!country || o.card.region.startsWith(country)) && (!type || o.card.type === type)
      && (!variant || (variant === 'foil' ? o.foil : !!o.local)))
    .sort((a, b) => sort === 'name' ? a.card.label.localeCompare(b.card.label)
      : sort === 'new' ? b.at - a.at
        : TIERS.indexOf(b.card.tier) - TIERS.indexOf(a.card.tier) || Number(b.foil) - Number(a.foil) || b.at - a.at)

  if (!all.length) {
    return <p className="px-4 py-16 text-center text-muted">Your collection is empty. Open a pack to pull your first places.</p>
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-2xl font-extrabold">
          {all.length.toLocaleString('en-US')} <span className="text-base font-medium text-muted">of {pool.cards.length.toLocaleString('en-US')} places</span>
        </h1>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
          {TIERS.map((t) => {
            const n = all.filter((o) => o.card.tier === t).length
            return <span key={t}><span style={{ color: TIER_COLOR[t] }}>●</span> {t} {n}</span>
          })}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <select id="f-tier" aria-label="Rarity" className={select} value={tier} onChange={(e) => setTier(e.target.value as Tier | '')}>
          <option value="">All rarities</option>
          {TIERS.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select id="f-country" aria-label="Country" className={select} value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">All countries</option>
          {countries.map((c) => <option key={c} value={c}>{pool.countries[c] ?? c}</option>)}
        </select>
        <select id="f-type" aria-label="Type" className={select} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Towns, nature and landmarks</option>
          <option value="town">Towns</option>
          <option value="nature">Nature</option>
          <option value="built">Landmarks</option>
        </select>
        <select id="f-variant" aria-label="Variant" className={select} value={variant} onChange={(e) => setVariant(e.target.value as typeof variant)}>
          <option value="">All versions</option>
          <option value="foil">Foil only</option>
          <option value="local">Local only</option>
        </select>
        <select id="f-sort" aria-label="Sort" className={select} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="rarity">Rarest first</option>
          <option value="new">Newest first</option>
          <option value="name">A to Z</option>
        </select>
      </div>
      {shown.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {shown.map((o) => (
            <button key={o.key} className="relative aspect-[5/7] text-left transition hover:-translate-y-0.5" onClick={() => setOpen(o)}>
              <CardFace pool={pool} card={o.card} serial={o.serial} foil={o.foil} stamp={stampOf(o, state)} size="sm" />
              {o.copies > 1 ? (
                <span className="absolute -right-1.5 -top-1.5 rounded-full border border-line bg-panel-2 px-1.5 text-xs font-semibold tabular-nums">×{o.copies}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : <p className="py-10 text-center text-muted">No cards match these filters.</p>}
      {open ? (
        <CardModal pool={pool} card={open.card} serial={open.serial} foil={open.foil} stamp={stampOf(open, state)} copies={open.copies} onClose={() => setOpen(null)} />
      ) : null}
    </div>
  )
}
