import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { CardBack, CardFace, StampSticker, TIER_COLOR } from './Card'
import { CardModal } from './CardModal'
import { TIERS, type Pool, type Tier } from './data'
import { Pack } from './Pack'
import { Reveal } from './Reveal'
import { sfx } from './sfx'
import { MAX_PACKS, PACK_SIZE, localReady, nextLocalAt, stampOf, whereAmI, type GameState, type Pulled } from './game'

gsap.registerPlugin(useGSAP)

/** True on phone-width screens (below Tailwind's sm breakpoint). */
function useIsPhone() {
  const q = '(max-width: 639px)'
  const [phone, setPhone] = useState(() => window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q), f = () => setPhone(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return phone
}

const bestTier = (pulls: Pulled[]): Tier => pulls.reduce<Tier>((b, p) => (TIERS.indexOf(p.card.tier) > TIERS.indexOf(b) ? p.card.tier : b), 'Common')

/**
 * Fake-out (developer, 2026-11-26): sometimes the sealed pack first shows a lower tier and upgrades mid-tear. It only
 * ever goes up, so it can't disappoint: Epic packs sometimes look plain, Legendary ones purple, Mythic ones gold.
 */
function fakeOut(best: Tier): Tier | null {
  const chance: Partial<Record<Tier, [number, Tier]>> = { Epic: [0.2, 'Rare'], Legendary: [0.35, 'Epic'], Mythic: [0.5, 'Legendary'] }
  const c = chance[best]
  return c && Math.random() < c[0] ? c[1] : null
}

// Directions the Epic sparks fly
const SPARK_DIRS = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2
  return [Math.cos(a) * (90 + (i % 3) * 25), Math.sin(a) * (110 + (i % 2) * 30)] as const
})

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
  const [fakeFrom, setFakeFrom] = useState<Tier | null>(null)
  const [featured, setFeatured] = useState(-1) // card in the walkout
  const [epicBurst, setEpicBurst] = useState(-1)
  const stage = useRef<HTMLDivElement>(null)
  const packWrap = useRef<HTMLDivElement>(null)
  const cardEls = useRef<(HTMLButtonElement | null)[]>([])
  const opening = useRef<gsap.core.Timeline | null>(null)

  const summonFrom = useRef<DOMRect | null>(null)
  const stackEls = useRef<(HTMLDivElement | null)[]>([])
  const localIcon = useRef<HTMLDivElement>(null)
  const calm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  // Summon: the pack lifts off the home-screen stack (or the local pack's sticker), flies to the middle and lands
  // with a bump. It can't be torn until it has landed.
  useGSAP(() => {
    if (!pulls || phase !== 'pack') return
    const wrap = packWrap.current, packEl = wrap?.querySelector<HTMLElement>('.pack')
    if (!wrap || !packEl || calm()) return
    const pr = packEl.getBoundingClientRect(), fr = summonFrom.current
    const from = fr
      ? { x: fr.left + fr.width / 2 - (pr.left + pr.width / 2), y: fr.top + fr.height / 2 - (pr.top + pr.height / 2), scale: fr.width / pr.width }
      : { x: 0, y: -260, scale: 0.6 }
    // No tearing until it has landed. Unblocked by a timer and on cleanup, not by the timeline's onComplete: React's
    // development mode runs this twice and the first run's timeline is thrown away before it completes, which left
    // the pack untouchable (found 2026-11-26).
    wrap.style.pointerEvents = 'none'
    const unblock = window.setTimeout(() => { wrap.style.pointerEvents = '' }, 1150)
    gsap.timeline()
      .from(packEl, { ...from, rotation: -12, duration: 0.55, ease: 'power3.out' })
      .add(() => sfx.land())
      .to(packEl, { scaleX: 1.06, scaleY: 0.93, duration: 0.08, transformOrigin: '50% 100%', ease: 'power2.out' })
      .to(packEl, { scaleX: 1, scaleY: 1, duration: 0.5, ease: 'elastic.out(1, 0.4)' })
    return () => { clearTimeout(unblock); wrap.style.pointerEvents = '' }
  }, { dependencies: [pulls], scope: stage })

  // After the pop: the cards shoot up out of the pack in a fan while the pack drops away, hang in the air for a beat,
  // then snap into their places in the row one by one, each with a tick and a small bounce.
  useGSAP(() => {
    if (phase !== 'opening' || !pulls) return
    const cards = cardEls.current.slice(0, pulls.length).filter(Boolean) as HTMLButtonElement[]
    const packEl = packWrap.current?.querySelector('.pack')
    const finish = () => { gsap.set(cards, { clearProps: 'transform,zIndex,visibility,opacity' }); gsap.set(stage.current, { clearProps: 'transform' }); setPhase('cards') }
    if (!packEl || calm()) { finish(); return }
    const pr = packEl.getBoundingClientRect(), mid = (cards.length - 1) / 2
    const from = cards.map((el, i) => {
      const r = el.getBoundingClientRect()
      const scale = (pr.width * 0.74) / r.width
      const h = r.height * scale
      const insideTop = pr.top + pr.height * 0.19 // just under the tear line, hidden behind the pack
      const x = pr.left + pr.width / 2 - (r.left + r.width / 2), y = insideTop + h / 2 - (r.top + r.height / 2)
      // The fan hangs over the middle of the pack, outer cards a little lower: an arc, like a hand of cards
      return { x, y, scale, fanX: x + (i - mid) * pr.width * 0.32, fanY: y - pr.height * 0.27 + Math.abs(i - mid) ** 1.6 * 12, fanR: (i - mid) * 9 }
    })
    gsap.set(cards, {
      x: (i) => from[i].x, y: (i) => from[i].y, scale: (i) => from[i].scale, rotation: 0,
      autoAlpha: 1, zIndex: (i) => 10 - i, transformOrigin: '50% 50%',
    })
    const tl = gsap.timeline({ onComplete: finish })
    // The pop: a small screen shake, cards burst up into a fan, the pack falls away
    tl.fromTo(stage.current, { x: 0, y: 0 }, { keyframes: { x: [-7, 6, -4, 3, 0], y: [4, -3, 2, -1, 0] }, duration: 0.32, ease: 'none' }, 0)
      .add(() => sfx.slide(0), 0)
      .to(cards, { x: (i) => from[i].fanX, y: (i) => from[i].fanY, rotation: (i) => from[i].fanR, duration: 0.42, ease: 'back.out(1.7)', stagger: 0.025 }, 0)
      .to(packWrap.current, { y: '+=380', rotation: 8, autoAlpha: 0, duration: 0.55, ease: 'power2.in' }, 0.12)
      // A beat in the air
      .to(cards, { y: (i) => from[i].fanY - 10, duration: 0.5, ease: 'sine.inOut' }, 0.45)
    // Snap, snap, snap
    cards.forEach((el, i) => {
      const t = 1.0 + i * 0.13
      tl.to(el, { x: 0, y: 0, scale: 1, rotation: 0, duration: 0.3, ease: 'power3.in' }, t)
        .add(() => sfx.tick(i), t + 0.3)
        .to(el, { scaleX: 1.04, scaleY: 0.95, duration: 0.06, transformOrigin: '50% 100%', ease: 'power2.out' }, t + 0.3)
        .to(el, { scaleX: 1, scaleY: 1, duration: 0.3, ease: 'back.out(3)' }, t + 0.36)
    })
    opening.current = tl
  }, { dependencies: [phase], scope: stage })

  const start = (k: Kind) => {
    const fromEl = k === 'local' ? localIcon.current : stackEls.current[state.packs - 1]
    summonFrom.current = fromEl?.getBoundingClientRect() ?? null
    sfx.unlock()
    const p = onOpen(k)
    if (!p.length) return
    setKind(k)
    setOpenedAt(Date.now())
    setPulls(p)
    setFlipped(p.map(() => false))
    setFakeFrom(fakeOut(bestTier(p)))
    setPhase('pack')
  }
  const setOneFlipped = (i: number) => setFlipped((f) => f.map((v, j) => (j === i ? true : v)))
  const flip = (i: number) => {
    if (!pulls || flipped[i]) return
    const tier = pulls[i].card.tier
    if (tier === 'Legendary' || tier === 'Mythic') { setFeatured(i); return } // the walkout
    if (tier === 'Epic') {
      // The card jumps, a purple shockwave and sparks, then it turns over
      setEpicBurst(i)
      sfx.shock()
      window.setTimeout(() => { sfx.flip(); setOneFlipped(i) }, 160)
      window.setTimeout(() => sfx.reveal(tier), 480)
      window.setTimeout(() => setEpicBurst((b) => (b === i ? -1 : b)), 800)
      return
    }
    sfx.flip()
    window.setTimeout(() => sfx.reveal(tier), 380)
    setOneFlipped(i)
  }
  const revealAll = () => {
    if (!pulls) return
    sfx.flip()
    const best = pulls.filter((_, i) => !flipped[i]).at(-1)
    if (best) window.setTimeout(() => sfx.reveal(best.card.tier), 380)
    setFlipped(pulls.map(() => true))
  }
  const allFlipped = flipped.length > 0 && flipped.every(Boolean)
  const special = (p: Pulled) => p.card.tier === 'Epic' || p.card.tier === 'Legendary' || p.card.tier === 'Mythic'
  const waiting = pulls ? pulls.filter((p, i) => special(p) && !flipped[i]).length : 0
  const [spotlight, setSpotlight] = useState(-1)

  // Commons and Rares flip themselves in a quick cascade once the cards have landed; the player taps only the
  // special ones (N3TWORK: don't spend the player's time on commons). A pack with nothing special flips entirely,
  // and its best card gets a short spotlight.
  useEffect(() => {
    if (phase !== 'cards' || !pulls) return
    if (phone) return // on phones the card in view flips itself (below)
    const hasSpecial = pulls.some(special)
    const auto = pulls.map((p, i) => (hasSpecial && special(p) ? -1 : i)).filter((i) => i >= 0)
    const timers = auto.map((i, k) => window.setTimeout(() => {
      sfx.flip()
      setFlipped((f) => f.map((v, j) => (j === i ? true : v)))
    }, 250 + k * 170))
    if (!hasSpecial) {
      const last = pulls.length - 1
      timers.push(window.setTimeout(() => { sfx.reveal(pulls[last].card.tier); setSpotlight(last) }, 250 + auto.length * 170 + 250))
      timers.push(window.setTimeout(() => setSpotlight(-1), 250 + auto.length * 170 + 1700))
    }
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, pulls])
  const stamp = (p: Pulled) => stampOf({ ...p, at: openedAt }, state)

  // Phones: one big card at a time in a swipeable row (scroll snap). Each Common or Rare flips itself as it is
  // swiped into the middle; special cards wait for a tap. The dots under the row follow the card in view.
  const phone = useIsPhone()
  const row = useRef<HTMLDivElement>(null)
  const [current, setCurrent] = useState(0)
  useEffect(() => {
    if (!phone || phase !== 'cards' || !pulls || !row.current) return
    const els = cardEls.current.slice(0, pulls.length).filter(Boolean) as HTMLButtonElement[]
    const seen = new Set<number>()
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue
        const i = els.indexOf(e.target as HTMLButtonElement)
        setCurrent(i)
        if (seen.has(i) || special(pulls[i])) continue
        seen.add(i)
        window.setTimeout(() => { sfx.flip(); window.setTimeout(() => sfx.reveal(pulls[i].card.tier), 380); setOneFlipped(i) }, 180)
      }
    }, { root: row.current, threshold: 0.7 })
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, phase, pulls])
  const goTo = (i: number) => cardEls.current[i]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })

  if (pulls) {
    const best = pulls[pulls.length - 1]
    const foil = best.foil ? 'Foil ' : ''
    const ready = phase === 'cards'
    return (
      <div ref={stage} onPointerDownCapture={() => { if (phase === 'opening' && opening.current && opening.current.time() > 0.25) opening.current.progress(1) }} className={`relative mx-auto flex max-w-6xl flex-col items-center gap-6 overflow-x-clip px-4 py-6 ${ready ? '' : 'min-h-[660px]'}`}>
        {kind === 'local' ? <p className="font-display text-lg font-bold text-local">Local pack · near {pulls[0].local}</p> : null}
        <p className={`text-sm text-muted transition-opacity duration-300 ${ready ? '' : 'opacity-0'}`}>{phone && !allFlipped ? 'Swipe through your cards. Tap a glowing one to reveal it.' : waiting ? `Tap the glowing card${waiting > 1 ? 's' : ''} to reveal ${waiting > 1 ? 'them' : 'it'}.` : 'Tap a card to look closer.'}</p>
        <div ref={row} className={`-mx-4 -my-6 flex w-[calc(100%+2rem)] snap-x snap-mandatory gap-4 px-[calc(50vw-min(43vw,(100dvh-310px)*5/14))] py-6 sm:mx-0 sm:my-0 sm:py-0 sm:grid sm:w-full sm:grid-cols-3 sm:gap-3 sm:overflow-visible sm:px-0 lg:grid-cols-5 ${ready ? 'overflow-x-auto overscroll-x-contain [scrollbar-width:none]' : 'overflow-visible'}`}>
          {pulls.map((p, i) => (
            <button
              key={p.card.id}
              ref={(el) => { cardEls.current[i] = el }}
              className={`flip relative aspect-[5/7] text-left ${spotlight === i ? 'spotlight' : ''} ${epicBurst === i ? 'epic-pop' : ''} ${phase === 'pack' ? 'invisible' : ''} ${ready ? '' : 'pointer-events-none'} ${flipped[i] ? 'flipped' : ''} w-[min(86vw,(100dvh-310px)*5/7)] shrink-0 snap-center sm:w-full`}
              onClick={() => {
                if (phone && i !== current) { goTo(i); return } // a peeking card: bring it to the middle first
                if (flipped[i]) setOpen(p); else flip(i)
              }}
              aria-label={flipped[i] ? `${p.foil ? 'Foil ' : ''}${p.card.label}, ${p.card.tier}` : `Flip card ${i + 1}`}
            >
              {epicBurst === i ? (
                <>
                  <span className="epic-ring" />
                  {SPARK_DIRS.map(([dx, dy], k) => <span key={k} className="epic-spark" style={{ '--dx': `${dx}px`, '--dy': `${dy}px` } as CSSProperties} />)}
                </>
              ) : null}
              <div className="flip-inner">
                <div className="flip-face"><CardBack tier={p.card.tier} /></div>
                <div className="flip-face flip-front">
                  {flipped[i] ? <CardFace pool={pool} card={p.card} serial={p.serial} foil={p.foil} stamp={stamp(p)} /> : null}
                </div>
              </div>
            </button>
          ))}
        </div>
        {phone && ready ? (
          <div className="-mt-2 flex items-center gap-2" aria-label={`Card ${current + 1} of ${pulls.length}`}>
            {pulls.map((p, i) => (
              <button key={i} onClick={() => goTo(i)} aria-label={`Card ${i + 1}`}
                className={`h-2 rounded-full transition-all ${i === current ? 'w-6 bg-accent' : 'w-2 bg-line'} ${special(p) && !flipped[i] ? 'ring-2 ring-[#ffd66b]/70' : ''}`} />
            ))}
          </div>
        ) : null}
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
            <>
              <button className="rounded-xl border border-line px-5 py-2.5 font-semibold" onClick={() => setPulls(null)}>Done</button>
              {state.packs > 0 ? (
                <button className="btn-gold rounded-xl px-6 py-2.5 font-semibold" onClick={() => { setPulls(null); setSpotlight(-1); start('normal') }}>
                  Open another <span className="font-normal opacity-70">({state.packs} left)</span>
                </button>
              ) : null}
            </>
          )}
        </div>
        {!ready ? (
          <div ref={packWrap} className="absolute inset-x-0 top-28 z-20 flex justify-center">
            <Pack key={openedAt} pool={pool} kind={kind} hint={bestTier(pulls)} fakeFrom={fakeFrom} onTorn={() => setPhase('opening')} />
          </div>
        ) : null}
        {open ? <CardModal pool={pool} card={open.card} serial={open.serial} foil={open.foil} stamp={stamp(open)} onClose={() => setOpen(null)} /> : null}
        {featured >= 0 ? (
          <Reveal pool={pool} pull={pulls[featured]} stamp={stamp(pulls[featured])}
            onDone={() => { setOneFlipped(featured); setFeatured(-1) }} />
        ) : null}
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
          <div key={i} ref={(el) => { stackEls.current[i] = el }} className={`aspect-[5/7] w-20 ${i < state.packs ? '' : 'opacity-25 grayscale'}`}><CardBack tier="Common" /></div>
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
        <div ref={localIcon} className="w-20 shrink-0">
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
