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

// How long the charge-up lasts before a special card turns over
const CHARGE_SECONDS: Record<Tier, number> = { Common: 0, Rare: 0, Epic: 1.2, Legendary: 1.8, Mythic: 2.2 }
const CHARGE_COLOR: Record<Tier, string> = { Common: '#fff', Rare: '#fff', Epic: '#b57cff', Legendary: '#ffd25e', Mythic: '#ff7aa8' }

// Directions the Epic sparks fly
const SPARK_DIRS = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2
  return [Math.cos(a) * (90 + (i % 3) * 25), Math.sin(a) * (110 + (i % 2) * 30)] as const
})

/** The time, updated every `ms`; paused when `ms` is 0. */
function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!ms) return
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
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
  const [pulls, setPulls] = useState<Pulled[] | null>(null)
  // The clock is only for the countdowns on the home screen. It stays paused while a pack is open: each tick redrew
  // the whole pack screen and caused a hitch every second on phones (found 2026-11-26)
  const now = useNow(pulls ? 0 : 1000)
  const [kind, setKind] = useState<Kind>('normal')
  const [openedAt, setOpenedAt] = useState(0)
  const [flipped, setFlipped] = useState<boolean[]>([])
  const [open, setOpen] = useState<Pulled | null>(null)
  const [phase, setPhase] = useState<'pack' | 'opening' | 'cards'>('pack')
  const [fakeFrom, setFakeFrom] = useState<Tier | null>(null)
  const [featured, setFeatured] = useState(-1) // card in the walkout
  const [epicBurst, setEpicBurst] = useState(-1)
  const [charging, setCharging] = useState(-1)
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
    setCurrent(0)
    setFakeFrom(fakeOut(bestTier(p)))
    setPhase('pack')
  }
  const setOneFlipped = (i: number) => setFlipped((f) => f.map((v, j) => (j === i ? true : v)))
  /**
   * Charge-up before a special card turns over (developer, 2026-11-26: "not enough build-up"). The card lifts, the
   * others dim, light swells behind it, sparks are pulled in, and it shakes harder and harder over a rising whine.
   * Longer and stronger for higher tiers. Then `release` runs: the Epic burst, or the walkout.
   */
  const charge = (i: number, tier: Tier, release: () => void) => {
    const el = cardEls.current[i]
    if (!el || calm()) { release(); return }
    const dur = CHARGE_SECONDS[tier]
    setCharging(i)
    sfx.charge(dur, tier)
    const light = el.querySelector('.charge-light')
    const steps = Math.round(dur / 0.045)
    // The card's own rarity glow swells (it can't hide behind the card the way a light behind it can on a phone)
    const glow = el.querySelector<HTMLElement>('.glow')
    const c = CHARGE_COLOR[tier]
    const tl = gsap.timeline({ onComplete: () => { gsap.set(el, { clearProps: 'transform' }); if (glow) gsap.set(glow, { clearProps: 'boxShadow,animation,filter' }); setCharging(-1); release() } })
    // On phones the card already fills the screen and sits in a clipped row: grow a little, don't lift
    tl.to(el, { scale: phone ? 1.03 : tier === 'Epic' ? 1.07 : 1.1, y: phone ? 0 : -10, duration: 0.35, ease: 'power2.out' }, 0)
    if (glow) {
      gsap.set(glow, { animation: 'none' })
      tl.fromTo(glow, { boxShadow: `0 0 12px 2px ${c}`, filter: 'brightness(1)' },
        { boxShadow: phone ? `0 0 22px 8px ${c}` : `0 0 ${tier === 'Epic' ? 70 : 110}px ${tier === 'Epic' ? 24 : 40}px ${c}`, filter: 'brightness(1.35)', duration: dur, ease: 'power2.in' }, 0)
    }
    // Light swelling out of the compass pin on the card itself until it floods the card
    tl.fromTo(el.querySelector('.charge-core'), { scale: 0.05, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: dur, ease: 'power3.in' }, 0)
    tl.fromTo(light, { scale: 0.4, autoAlpha: 0 }, { scale: tier === 'Epic' ? 1.5 : 2, autoAlpha: 1, duration: dur, ease: 'power2.in' }, 0)
    // Shake that grows: tiny at first, violent at the end
    for (let k = 0; k < steps; k++) {
      const amp = 0.4 + (k / steps) ** 2 * (tier === 'Epic' ? 5 : 8)
      tl.to(el, { x: amp * (k % 2 ? 1 : -1), rotation: amp * 0.25 * (k % 2 ? -1 : 1), duration: 0.045, ease: 'none' }, 0.3 + k * 0.045 * ((dur - 0.3) / dur))
    }
    // A beat of stillness before the big tiers let go
    if (tier !== 'Epic') tl.to(el, { x: 0, rotation: 0, scale: phone ? 1.05 : 1.14, duration: 0.18, ease: 'power2.out' })
    else tl.to(el, { x: 0, rotation: 0, duration: 0.05 })
  }

  const flip = (i: number) => {
    if (!pulls || flipped[i] || charging >= 0) return
    const tier = pulls[i].card.tier
    if (tier === 'Legendary' || tier === 'Mythic') { charge(i, tier, () => setFeatured(i)); return } // then the walkout
    if (tier === 'Epic') { charge(i, tier, () => burstEpic(i)); return }
    sfx.flip()
    window.setTimeout(() => sfx.reveal(tier), 380)
    setOneFlipped(i)
  }
  const burstEpic = (i: number) => {
    const tier = 'Epic'
    {
      // The card jumps, a purple shockwave and sparks, then it turns over
      setEpicBurst(i)
      sfx.shock()
      window.setTimeout(() => { sfx.flip(); setOneFlipped(i) }, 160)
      window.setTimeout(() => sfx.reveal(tier), 480)
      window.setTimeout(() => setEpicBurst((b) => (b === i ? -1 : b)), 800)
    }
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
      <div ref={stage} onPointerDownCapture={() => { if (phase === 'opening' && opening.current && opening.current.time() > 0.25) opening.current.progress(1) }} className={`relative mx-auto flex max-w-6xl flex-col items-center gap-3 overflow-x-clip px-4 py-3 sm:gap-6 sm:py-6 ${ready ? '' : 'min-h-[calc(100dvh-110px)] sm:min-h-[660px]'}`}>
        {kind === 'local' ? <p className="font-display text-lg font-bold text-local">Local pack · near {pulls[0].local}</p> : null}
        <p className={`text-sm text-muted transition-opacity duration-300 ${ready ? '' : 'opacity-0'}`}>{phone && !allFlipped ? 'Swipe through your cards. Tap a glowing one to reveal it.' : waiting ? `Tap the glowing card${waiting > 1 ? 's' : ''} to reveal ${waiting > 1 ? 'them' : 'it'}.` : 'Tap a card to look closer.'}</p>
        <div key={openedAt} ref={row} className={`-mx-4 -my-6 flex w-[calc(100%+2rem)] snap-x snap-mandatory gap-4 px-[calc(50vw-min(43vw,(100dvh-290px)*5/14))] py-6 sm:mx-0 sm:my-0 sm:py-0 sm:grid sm:w-full sm:grid-cols-3 sm:gap-3 sm:overflow-visible sm:px-0 lg:grid-cols-5 ${ready ? 'overflow-x-auto overscroll-x-contain [scrollbar-width:none]' : 'overflow-visible'}`}>
          {pulls.map((p, i) => (
            <button
              key={p.card.id}
              ref={(el) => { cardEls.current[i] = el }}
              className={`flip relative aspect-[5/7] text-left transition-opacity duration-300 ${charging >= 0 && charging !== i ? 'opacity-30' : ''} ${charging === i ? 'z-10' : ''} ${spotlight === i ? 'spotlight' : ''} ${epicBurst === i ? 'epic-pop' : ''} ${phase === 'pack' ? 'invisible' : ''} ${ready ? '' : 'pointer-events-none'} ${flipped[i] ? 'flipped' : ''} w-[min(86vw,(100dvh-290px)*5/7)] shrink-0 snap-center sm:w-full`}
              onClick={() => {
                if (phone && i !== current) { goTo(i); return } // a peeking card: bring it to the middle first
                if (flipped[i]) setOpen(p); else flip(i)
              }}
              aria-label={flipped[i] ? `${p.foil ? 'Foil ' : ''}${p.card.label}, ${p.card.tier}` : `Flip card ${i + 1}`}
            >
              <span className={`charge-light charge-${p.card.tier.toLowerCase()}`} aria-hidden />
              <span className={`charge-core charge-${p.card.tier.toLowerCase()}`} aria-hidden />
              {charging === i ? SPARK_DIRS.map(([dx, dy], k) => (
                <span key={`c${k}`} className={`charge-spark charge-${p.card.tier.toLowerCase()}`} aria-hidden
                  style={{ '--dx': `${dx * 1.6}px`, '--dy': `${dy * 1.3}px`, '--dur': `${CHARGE_SECONDS[p.card.tier]}s`, animationDelay: `${(k % 6) * 0.12}s` } as CSSProperties} />
              )) : null}
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
        {ready && flipped[pulls.length - 1] && (!phone || current === pulls.length - 1) && (best.serial != null || best.card.tier === 'Mythic') ? (
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
          <div ref={packWrap} className="absolute inset-x-0 top-10 z-20 flex justify-center sm:top-28">
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
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-5 text-center sm:gap-6 sm:py-10">
      <div className="flex gap-3" aria-label={`${state.packs} of ${MAX_PACKS} packs`}>
        {Array.from({ length: MAX_PACKS }, (_, i) => (
          <div key={i} ref={(el) => { stackEls.current[i] = el }} className={`aspect-[5/7] w-14 sm:w-20 ${i < state.packs ? '' : 'opacity-25 grayscale'}`}><CardBack tier="Common" /></div>
        ))}
      </div>
      <div>
        <h1 className="font-display text-2xl font-extrabold sm:text-3xl">{state.packs ? `${state.packs} pack${state.packs > 1 ? 's' : ''} ready` : 'No packs right now'}</h1>
        <p className="mt-1 text-sm text-muted sm:text-base">
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

      <section className="flex w-full items-center gap-3 rounded-2xl border border-local/40 bg-wine-deep/50 p-3 text-left sm:mt-2 sm:gap-4 sm:p-4" aria-label="Local pack">
        <div ref={localIcon} className="w-16 shrink-0 sm:w-20">
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
