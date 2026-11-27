// The walkout (pack opening step c, 2026-11-26): the big reveal for a Legendary or Mythic card, like EA FC's walkout
// (nation, club, then player). The screen dims, the face-down card comes to the centre with light rays turning behind
// it and a rumble; then the country, the region and the kind of place appear one at a time, each with a note; then a
// flash, the card flips, and its name and serial appear. Tap to skip ahead, then tap to go back to the pack.
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CardBack, CardFace, kindLabel, type Stamp } from './Card'
import { countryName, regionName, type Pool } from './data'
import type { Pulled } from './game'
import { sfx } from './sfx'

gsap.registerPlugin(useGSAP)

export function Reveal({ pool, pull, stamp, onDone }: { pool: Pool; pull: Pulled; stamp?: Stamp; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const tl = useRef<gsap.core.Timeline | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [finished, setFinished] = useState(false)
  const { card } = pull
  const mythic = card.tier === 'Mythic'
  const lines = [countryName(pool, card.region), regionName(pool, card.region), kindLabel(card)]

  useGSAP((_, contextSafe) => {
    const q = gsap.utils.selector(root)
    const flip = contextSafe!(() => setFlipped(true))
    const done = contextSafe!(() => setFinished(true))
    gsap.set(q('.rv-line'), { autoAlpha: 0, y: 24 })
    gsap.set(q('.rv-result'), { autoAlpha: 0, y: 16 })
    const t = gsap.timeline({ onComplete: done })
    t.fromTo(q('.rv-backdrop'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35 }, 0)
      .add(() => sfx.rumble(mythic ? 3.4 : 2.8), 0)
      .fromTo(q('.rv-card'), { scale: 0.45, y: 80, autoAlpha: 0, rotation: -8 }, { scale: 1, y: 0, autoAlpha: 1, rotation: 0, duration: 0.7, ease: 'back.out(1.5)' }, 0.15)
      .fromTo(q('.rv-rays'), { scale: 0.2, autoAlpha: 0 }, { scale: 1, autoAlpha: 0.75, duration: 1.2, ease: 'power2.out' }, 0.2)
      // The face-down card trembles while the build-up plays
      .to(q('.rv-card'), { keyframes: { x: [0, -2, 2, -1.5, 1.5, 0] }, duration: 0.25, repeat: 9, ease: 'none' }, 0.9)
    lines.forEach((_, i) => {
      const at = 1.0 + i * 0.8
      t.to(q(`.rv-line-${i}`), { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power3.out' }, at).add(() => sfx.sting(i), at)
    })
    const pop = 1.0 + lines.length * 0.8 + 0.25
    t.to(q('.rv-rays'), { scale: 1.7, autoAlpha: 1, duration: 0.35, ease: 'power2.out' }, pop)
      .fromTo(q('.rv-flash'), { autoAlpha: 0 }, { autoAlpha: 0.9, duration: 0.08, yoyo: true, repeat: 1 }, pop)
      .add(() => { flip(); sfx.boom(); sfx.reveal(card.tier) }, pop)
      .to(q('.rv-lines'), { autoAlpha: 0, y: -16, duration: 0.3 }, pop)
      .fromTo(q('.rv-card'), { scale: 1.12 }, { scale: 1, duration: 0.7, ease: 'elastic.out(1, 0.5)' }, pop + 0.05)
      .to(q('.rv-result'), { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power3.out' }, pop + 0.45)
      .to(q('.rv-rays'), { scale: 1.35, autoAlpha: 0.6, duration: 1.2 }, pop + 0.4)
    tl.current = t
  }, { scope: root })

  const tap = () => {
    const t = tl.current
    if (!finished && t && t.progress() < 1) t.progress(1)
    else onDone()
  }

  const serial = mythic ? 'One of one' : `${pull.foil ? 'Foil ' : ''}${card.tier} #${pull.serial?.toLocaleString('en-US')}${pull.cap ? ` of ${pull.cap.toLocaleString('en-US')}` : ''}`
  // Rendered on the page body: a transformed ancestor (the pack screen shakes) would otherwise become its frame
  return createPortal(
    <div ref={root} className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden" onClick={tap} role="dialog" aria-modal="true" aria-label={`${card.tier} reveal`}>
      <div className="rv-backdrop absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(40,14,22,.92),rgba(5,2,4,.97))]" />
      <div className={`rv-rays ${mythic ? 'rv-rays-mythic' : ''}`} />
      <div className="relative flex flex-col items-center gap-4 px-4">
        <div className="rv-lines flex h-28 flex-col items-center justify-end gap-1 text-center">
          <span className="rv-line rv-line-0 font-display text-3xl font-extrabold uppercase tracking-[0.25em] text-[#ffe9a8] sm:text-4xl">{lines[0]}</span>
          <span className="rv-line rv-line-1 font-display text-xl font-bold tracking-[0.12em] text-ink">{lines[1]}</span>
          <span className="rv-line rv-line-2 text-sm font-semibold uppercase tracking-[0.3em] text-muted">{lines[2]}</span>
        </div>
        <div className={`rv-card flip aspect-[5/7] w-[min(68vw,300px,calc((100dvh-290px)/1.4))] ${flipped ? 'flipped' : ''}`}>
          <div className="flip-inner">
            <div className="flip-face"><CardBack tier={card.tier} /></div>
            <div className="flip-face flip-front">{flipped ? <CardFace pool={pool} card={card} serial={pull.serial} foil={pull.foil} stamp={stamp} size="lg" /> : null}</div>
          </div>
        </div>
        <div className="rv-result flex flex-col items-center gap-1 text-center">
          <span className={`font-display text-2xl font-extrabold ${mythic ? 'rv-mythic-text' : 'text-[#ffd66b]'}`}>{card.label}</span>
          <span className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">{serial}</span>
          <span className="mt-2 text-xs text-muted">Tap to continue</span>
        </div>
      </div>
      <div className="rv-flash pointer-events-none absolute inset-0 bg-[#fff6dc]" style={{ opacity: 0 }} />
    </div>,
    document.body,
  )
}
