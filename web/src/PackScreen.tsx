import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { useEffect, useRef, useState } from 'react'
import { CardBack, CardFace, StampSticker, TIER_COLOR } from './Card'
import { CardModal } from './CardModal'
import type { Pool } from './data'
import { Pack } from './Pack'
import { sfx } from './sfx'
import { MAX_PACKS, PACK_SIZE, localReady, nextLocalAt, stampOf, whereAmI, type GameState, type Pulled } from './game'

gsap.registerPlugin(useGSAP)

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

type Kind = 'normal' | 'local'

export function PackScreen({ pool, state, onOpen, onAddPack, onChangeHere, onResetLocal }: {
  pool: Pool; state: GameState; onOpen: (kind: Kind) => Pulled[]; onAddPack: () => void
  onChangeHere: () => void; onResetLocal: () => void
}) {
  const now = useNow()
  const [pulls, setPulls] = useState<Pulled[] | null>(null)
  const [kind, setKind] = useState<Kind>('normal')
  const [openedAt, setOpenedAt] = useState(0)
  const [flipped, setFlipped] = useState<boolean[]>([])
  const [open, setOpen] = useState<Pulled | null>(null)
  const [phase, setPhase] = useState<'pack' | 'opening' | 'cards'>('pack')
  const stage = useRef<HTMLDivElement>(null)
  const packWrap = useRef<HTMLDivElement>(null)
  const cardEls = useRef<(HTMLButtonElement | null)[]>([])
  const opening = useRef<gsap.core.Timeline | null>(null)

  // The cards come out of the torn pack: they start inside it (behind the pack, just under the tear), slide up out
  // of the opening while the pack drops away, then fly from there to their places in the row.
  useGSAP(() => {
    if (phase !== 'opening' || !pulls) return
    const cards = cardEls.current.slice(0, pulls.length).filter(Boolean) as HTMLButtonElement[]
    const packEl = packWrap.current?.querySelector('.pack')
    const finish = () => { gsap.set(cards, { clearProps: 'transform,zIndex,visibility,opacity' }); setPhase('cards') }
    if (!packEl || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return }
    const pr = packEl.getBoundingClientRect()
    const from = cards.map((el) => {
      const r = el.getBoundingClientRect()
      const scale = (pr.width * 0.74) / r.width
      const h = r.height * scale
      const insideTop = pr.top + pr.height * 0.19 // just under the tear line, hidden behind the pack
      return { x: pr.left + pr.width / 2 - (r.left + r.width / 2), y: insideTop + h / 2 - (r.top + r.height / 2), scale, rise: h * 0.5 }
    })
    gsap.set(cards, {
      x: (i) => from[i].x, y: (i) => from[i].y, scale: (i) => from[i].scale, rotation: (i) => (i - 2) * 1.5,
      autoAlpha: 1, zIndex: (i) => 10 - i, transformOrigin: '50% 50%',
    })
    opening.current = gsap.timeline({ onComplete: finish })
      .to(cards, { y: (i) => from[i].y - from[i].rise, duration: 0.55, ease: 'power3.out', stagger: { each: 0.05, from: 'end' } }, 0.08)
      .to(packWrap.current, { y: '+=340', rotation: 6, autoAlpha: 0, duration: 0.65, ease: 'power2.in' }, 0.45)
      .add(() => pulls.forEach((_, i) => sfx.slide(i)), 0.75)
      .to(cards, { x: 0, y: 0, scale: 1, rotation: 0, duration: 0.8, ease: 'back.out(1.2)', stagger: 0.07 }, 0.75)
  }, { dependencies: [phase], scope: stage })

  const start = (k: Kind) => {
    const p = onOpen(k)
    if (!p.length) return
    setKind(k)
    setOpenedAt(Date.now())
    setPulls(p)
    setFlipped(p.map(() => false))
    setPhase('pack')
  }
  const flip = (i: number) => {
    if (!pulls || flipped[i]) return
    sfx.flip()
    window.setTimeout(() => sfx.reveal(pulls[i].card.tier), 380)
    setFlipped((f) => f.map((v, j) => (j === i ? true : v)))
  }
  const revealAll = () => {
    if (!pulls) return
    sfx.flip()
    const best = pulls.filter((_, i) => !flipped[i]).at(-1)
    if (best) window.setTimeout(() => sfx.reveal(best.card.tier), 380)
    setFlipped(pulls.map(() => true))
  }
  const allFlipped = flipped.length > 0 && flipped.every(Boolean)
  const stamp = (p: Pulled) => stampOf({ ...p, at: openedAt }, state)

  if (pulls) {
    const best = pulls[pulls.length - 1]
    const foil = best.foil ? 'Foil ' : ''
    const ready = phase === 'cards'
    return (
      <div ref={stage} onClickCapture={() => { if (phase === 'opening') opening.current?.progress(1) }} className={`relative mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-6 ${ready ? '' : 'min-h-[660px]'}`}>
        {kind === 'local' ? <p className="font-display text-lg font-bold text-local">Local pack · near {pulls[0].local}</p> : null}
        <p className={`text-sm text-muted transition-opacity duration-300 ${ready ? '' : 'opacity-0'}`}>{allFlipped ? 'Tap a card to look closer.' : 'Tap each card to flip it. The best is last.'}</p>
        <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {pulls.map((p, i) => (
            <button
              key={p.card.id}
              ref={(el) => { cardEls.current[i] = el }}
              className={`flip relative aspect-[5/7] text-left ${phase === 'pack' ? 'invisible' : ''} ${ready ? '' : 'pointer-events-none'} ${flipped[i] ? 'flipped' : ''} ${i === pulls.length - 1 && pulls.length % 2 ? 'col-span-2 mx-auto w-[calc(50%-0.375rem)] sm:col-span-1 sm:w-full' : 'w-full'}`}
              onClick={() => (flipped[i] ? setOpen(p) : flip(i))}
              aria-label={flipped[i] ? `${p.foil ? 'Foil ' : ''}${p.card.label}, ${p.card.tier}` : `Flip card ${i + 1}`}
            >
              <div className="flip-inner">
                <div className="flip-face"><CardBack tier={p.card.tier} /></div>
                <div className="flip-face flip-front">
                  {flipped[i] ? <CardFace pool={pool} card={p.card} serial={p.serial} foil={p.foil} stamp={stamp(p)} /> : null}
                </div>
              </div>
            </button>
          ))}
        </div>
        {ready && flipped[pulls.length - 1] && (best.serial != null || best.card.tier === 'Mythic') ? (
          <p className="serial-in font-display text-lg font-semibold" style={{ color: TIER_COLOR[best.card.tier] }}>
            {best.card.tier === 'Mythic'
              ? `You pulled the only ${best.card.label} card in the world.`
              : best.cap ? `${foil}${best.card.label}: copy #${best.serial} of ${best.cap.toLocaleString('en-US')}`
                : `${foil}${best.card.label}: ${best.card.tier} #${best.serial?.toLocaleString('en-US')}`}
          </p>
        ) : null}
        <div className={`flex gap-3 transition-opacity duration-300 ${ready ? '' : 'pointer-events-none opacity-0'}`}>
          {!allFlipped ? (
            <button className="rounded-xl border border-line px-5 py-2.5 font-semibold" onClick={revealAll}>Reveal all</button>
          ) : (
            <button className="btn-gold rounded-xl px-6 py-2.5 font-semibold" onClick={() => setPulls(null)}>Done</button>
          )}
        </div>
        {!ready ? (
          <div ref={packWrap} className="absolute inset-x-0 top-28 z-20 flex justify-center">
            <Pack pool={pool} kind={kind} onTorn={() => setPhase('opening')} />
          </div>
        ) : null}
        {open ? <CardModal pool={pool} card={open.card} serial={open.serial} foil={open.foil} stamp={stamp(open)} onClose={() => setOpen(null)} /> : null}
      </div>
    )
  }

  const next = state.nextRefill ? state.nextRefill - now : null
  const here = whereAmI(state)
  const ready = localReady(state, now)
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
          <p className="mt-2 text-sm text-teal">Your first pack holds a place near {state.hometown.label}.</p>
        ) : null}
      </div>
      <button
        disabled={!state.packs}
        onClick={() => start('normal')}
        className="btn-gold rounded-2xl px-10 py-4 font-display text-xl font-extrabold"
      >
        Open a pack
      </button>
      <button onClick={onAddPack} className="text-xs text-muted underline">Demo: add a pack now</button>

      <section className="mt-2 flex w-full items-center gap-4 rounded-2xl border border-local/40 bg-wine-deep/50 p-4 text-left" aria-label="Local pack">
        <div className="w-20 shrink-0">
          <StampSticker stamp={{ kind: 'local', place: here?.label ?? 'Near you', date: now }} inline />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h2 className="font-display text-lg font-extrabold">Today's local pack</h2>
          {here ? (
            <p className="text-sm text-muted">{PACK_SIZE} places near {here.label}, every card stamped Local. One a day.</p>
          ) : (
            <p className="text-sm text-muted">Pick where you are to get a pack of places near you, stamped Local.</p>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {!here ? (
              <button onClick={onChangeHere} className="rounded-xl bg-local px-4 py-2 font-semibold text-white">Pick where you are</button>
            ) : ready ? (
              <button onClick={() => start('local')} className="rounded-xl bg-local px-4 py-2 font-semibold text-white transition hover:scale-[1.03]">Open local pack</button>
            ) : (
              <span className="text-sm">Next local pack in <span className="tabular-nums font-semibold">{countdown(nextLocalAt(now) - now)}</span></span>
            )}
            {here ? <button onClick={onChangeHere} className="text-xs text-muted underline">Demo: I'm somewhere else</button> : null}
            {here && !ready ? <button onClick={onResetLocal} className="text-xs text-muted underline">Demo: new local pack now</button> : null}
          </div>
        </div>
      </section>
    </div>
  )
}
