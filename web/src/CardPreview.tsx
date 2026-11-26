import { CardBack, CardFace } from './Card'
import { TIERS, type IndexCard, type Pool } from './data'

// Dev view at /#cards: one card of each rarity plus face-down cards, for screenshots and design work.
const PICKS = ['wd:Q9202', 'wd:Q130018', 'wd:Q34261', 'wd:Q1073221', 'gn:4503682']

export function CardPreview({ pool }: { pool: Pool }) {
  const picked = PICKS.map((id) => pool.byId.get(id)).filter(Boolean) as IndexCard[]
  const cards = TIERS.slice().reverse().map((t) =>
    picked.find((c) => c.tier === t) ?? pool.byTier[t].find((c) => c.image.includes('photo')) ?? pool.byTier[t][0])
  const serial = { Common: null, Rare: 362, Epic: 22, Legendary: 4, Mythic: 1 }
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
      <div className="grid grid-cols-5 gap-4">
        {cards.map((c) => (
          <div key={c.id} className="aspect-[5/7]"><CardFace pool={pool} card={c} serial={serial[c.tier]} /></div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-4">
        {TIERS.slice().reverse().map((t) => <div key={t} className="aspect-[5/7]"><CardBack tier={t} /></div>)}
      </div>
    </div>
  )
}
