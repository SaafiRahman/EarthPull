import { CardBack, CardFace, type Stamp } from './Card'
import { PACK_ARTS, Pack } from './Pack'
import type { ReactNode } from 'react'
import { TIERS, type IndexCard, type Pool, type Tier } from './data'

// Dev view at /#cards: every tier plain and foil, the Local and Hometown stickers, cards without photos, and the
// small size used in the collection grid. For screenshots and design work.
const PICKS = ['wd:Q9202', 'wd:Q130018', 'wd:Q34261', 'wd:Q1073221', 'gn:4503682']
const SERIAL: Record<Tier, number | null> = { Common: null, Rare: 4812, Epic: 731, Legendary: 37, Mythic: 1 }
const FOIL_SERIAL: Record<Tier, number | null> = { Common: null, Rare: 241, Epic: 38, Legendary: 6, Mythic: 1 }
const DAY = new Date('2026-11-26T12:00:00').getTime()

function Row({ title, children, cols = 5 }: { title: string; children: ReactNode; cols?: number }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-muted">{title}</h2>
      <div className="grid gap-5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>{children}</div>
    </section>
  )
}

export function CardPreview({ pool }: { pool: Pool }) {
  const picked = PICKS.map((id) => pool.byId.get(id)).filter(Boolean) as IndexCard[]
  const byTier = (t: Tier) => picked.find((c) => c.tier === t) ?? pool.byTier[t].find((c) => c.image.includes('photo')) ?? pool.byTier[t][0]
  const tiers = TIERS.slice().reverse()
  const mapOnly = (t: Tier) => pool.byTier[t].find((c) => c.image.includes('minimap') && c.facts.length >= 3) ?? pool.byTier[t][0]
  const longName = pool.byTier.Rare.find((c) => c.label.length > 34 && c.image.includes('photo')) ?? pool.byTier.Rare[0]
  const local = (place: string): Stamp => ({ kind: 'local', place, date: DAY })
  const home: Stamp = { kind: 'hometown', place: 'Halifax', date: DAY }
  const common = byTier('Common'), rare = byTier('Rare'), epic = byTier('Epic')

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10 px-6 py-8">
      <Row title="Plain">
        {tiers.map((t) => <div key={t} className="aspect-[5/7]"><CardFace pool={pool} card={byTier(t)} serial={SERIAL[t]} /></div>)}
      </Row>
      <Row title="Foil (about 1 in 20; only Mythics are limited; Rare, Epic and Legendary numbered in pull order, no cap)">
        {tiers.map((t) => <div key={t} className="aspect-[5/7]"><CardFace pool={pool} card={byTier(t)} serial={t === 'Common' ? null : FOIL_SERIAL[t]} foil /></div>)}
      </Row>
      <Row title="Stickers and cards without a photo">
        <div className="aspect-[5/7]"><CardFace pool={pool} card={common} serial={null} stamp={local('Halifax')} /></div>
        <div className="aspect-[5/7]"><CardFace pool={pool} card={epic} serial={12} stamp={local('Dartmouth')} foil /></div>
        <div className="aspect-[5/7]"><CardFace pool={pool} card={rare} serial={119} stamp={home} /></div>
        <div className="aspect-[5/7]"><CardFace pool={pool} card={mapOnly('Common')} serial={null} /></div>
        <div className="aspect-[5/7]"><CardFace pool={pool} card={mapOnly('Rare')} serial={811} /></div>
      </Row>
      <Row title="Long name" cols={5}>
        <div className="aspect-[5/7]"><CardFace pool={pool} card={longName} serial={45} /></div>
      </Row>
      <Row title="Collection size (170 px)" cols={6}>
        {[...tiers, 'Common' as Tier].map((t, i) => (
          <div key={i} className="aspect-[5/7] w-[170px]">
            <CardFace pool={pool} card={i === 5 ? mapOnly('Common') : byTier(t)} serial={SERIAL[t]} size="sm" foil={i === 1} stamp={i === 4 ? local('Halifax') : undefined} />
          </div>
        ))}
      </Row>
      <Row title="Booster packs (one famous place per pack)" cols={3}>
        {PACK_ARTS.map((art, i) => <div key={art.file} className="flex justify-center"><Pack art={i} onTorn={() => {}} /></div>)}
      </Row>
      <Row title="Card backs (with the rarity glow they show face-down in a pack)">
        {tiers.map((t) => <div key={t} className="aspect-[5/7]"><CardBack tier={t} /></div>)}
      </Row>
    </div>
  )
}
