import { useEffect, useState } from 'react'
import { CardBack, CardFace, TIER_COLOR } from './Card'
import { CardModal } from './CardModal'
import type { Pool } from './data'
import { MAX_PACKS, PACK_SIZE, type GameState, type Pulled } from './game'

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t) }, [ms])
  return now
}

function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m ${String(sec).padStart(2, '0')}s`
}

export function PackScreen({ pool, state, onOpen, onAddPack }: {
  pool: Pool; state: GameState; onOpen: () => Pulled[]; onAddPack: () => void
}) {
  const now = useNow()
  const [pulls, setPulls] = useState<Pulled[] | null>(null)
  const [flipped, setFlipped] = useState<boolean[]>([])
  const [open, setOpen] = useState<Pulled | null>(null)

  const start = () => {
    const p = onOpen()
    setPulls(p)
    setFlipped(p.map(() => false))
  }
  const flip = (i: number) => setFlipped((f) => f.map((v, j) => (j === i ? true : v)))
  const allFlipped = flipped.length > 0 && flipped.every(Boolean)

  if (pulls) {
    const best = pulls[pulls.length - 1]
    return (
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-6">
        <p className="text-sm text-muted">{allFlipped ? 'Tap a card to look closer.' : 'Tap each card to flip it. The best is last.'}</p>
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {pulls.map((p, i) => (
            <button
              key={p.card.id}
              className={`flip aspect-[5/7] w-full text-left ${flipped[i] ? 'flipped' : ''} ${i === pulls.length - 1 && pulls.length % 2 ? 'col-span-2 mx-auto w-1/2 sm:col-span-1 sm:w-full' : ''}`}
              style={{ animationDelay: `${i * 80}ms` }}
              onClick={() => (flipped[i] ? setOpen(p) : flip(i))}
              aria-label={flipped[i] ? `${p.card.label}, ${p.card.tier}` : `Flip card ${i + 1}`}
            >
              <div className="flip-inner rise" style={{ animationDelay: `${i * 80}ms` }}>
                <div className="flip-face"><CardBack tier={p.card.tier} /></div>
                <div className="flip-face flip-front">
                  {flipped[i] ? <CardFace pool={pool} card={p.card} serial={p.serial} hometown={p.hometown} /> : null}
                </div>
              </div>
            </button>
          ))}
        </div>
        {flipped[pulls.length - 1] && best.serial != null ? (
          <p className="serial-in font-display text-lg font-semibold" style={{ color: TIER_COLOR[best.card.tier] }}>
            {best.card.tier === 'Mythic'
              ? `You pulled the only ${best.card.label} card in the world.`
              : `${best.card.label}: copy #${best.serial} of ${best.cap?.toLocaleString('en-US')}`}
          </p>
        ) : null}
        <div className="flex gap-3">
          {!allFlipped ? (
            <button className="rounded-xl border border-line px-5 py-2.5 font-semibold" onClick={() => setFlipped(pulls.map(() => true))}>Reveal all</button>
          ) : (
            <button className="rounded-xl bg-accent px-6 py-2.5 font-semibold text-ground" onClick={() => setPulls(null)}>Done</button>
          )}
        </div>
        {open ? <CardModal pool={pool} card={open.card} serial={open.serial} hometown={open.hometown} onClose={() => setOpen(null)} /> : null}
      </div>
    )
  }

  const next = state.nextRefill ? state.nextRefill - now : null
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 px-4 py-10 text-center">
      <div className="flex gap-3" aria-label={`${state.packs} of ${MAX_PACKS} packs`}>
        {Array.from({ length: MAX_PACKS }, (_, i) => (
          <div key={i} className={`aspect-[5/7] w-20 ${i < state.packs ? '' : 'opacity-25 grayscale'}`}><CardBack tier="Common" /></div>
        ))}
      </div>
      <div>
        <h1 className="font-display text-3xl font-extrabold">{state.packs ? `${state.packs} pack${state.packs > 1 ? 's' : ''} ready` : 'No packs right now'}</h1>
        <p className="mt-1 text-muted">
          {PACK_SIZE} cards a pack · one new pack every 2 hours, up to {MAX_PACKS}
          {next != null ? <> · next in <span className="tabular-nums text-ink">{countdown(next)}</span></> : null}
        </p>
        {state.opened === 0 && state.hometown ? (
          <p className="mt-2 text-sm text-accent">Your first pack holds a place near {state.hometown.label}.</p>
        ) : null}
      </div>
      <button
        disabled={!state.packs}
        onClick={start}
        className="rounded-2xl bg-accent px-10 py-4 font-display text-xl font-extrabold text-ground shadow-[0_0_40px_-8px_var(--color-accent)] transition hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
      >
        Open a pack
      </button>
      <button onClick={onAddPack} className="text-xs text-muted underline">Demo: add a pack now</button>
    </div>
  )
}
