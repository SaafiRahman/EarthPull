// The walkout (pack opening step c, 2026-11-26): the big reveal for a Legendary or Mythic card, like EA FC's walkout
// (nation, club, then player). The screen dims, the face-down card comes to the centre with light rays turning behind
// it and a rumble; then the country, the region and the kind of place appear one at a time, each with a note; then a
// flash, the card flips, and its name and serial appear. Tap to skip ahead, then tap to go back to the pack.
//
// A Mythic (step d, 2026-11-28) starts in space instead (a Legendary too, a bit faster, since the same day; neither
// when effects are off): the Earth turns until the place's side faces you (country),
// the camera dives (region), tilts down over the spot (kind of place) and a pin lands on it. The card then rises out
// of the pin over the dimmed map and the walkout ends as usual. Without WebGL it falls back to the plain walkout.
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CardBack, CardFace, kindLabel, type Stamp } from './Card'
import { countryName, regionName, type Pool } from './data'
import type { Pulled } from './game'
import { closeZoom, createGlobe, starShadows, wholeGlobeZoom, type Cam, type Globe } from './Globe'
import { getEffects } from './effects'
import { sfx } from './sfx'

gsap.registerPlugin(useGSAP)

export function Reveal({ pool, pull, stamp, onDone }: { pool: Pool; pull: Pulled; stamp?: Stamp; onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const tl = useRef<gsap.core.Timeline | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [finished, setFinished] = useState(false)
  const { card } = pull
  const mythic = card.tier === 'Mythic'
  // The globe dive (Mythic, and a shorter one for Legendary) unless effects are off; read once, when the walkout opens
  const [dive] = useState(() => (mythic || card.tier === 'Legendary') && getEffects() !== 'off')
  const lines = [countryName(pool, card.region), regionName(pool, card.region), kindLabel(card)]
  const globeEl = useRef<HTMLDivElement>(null)
  const globe = useRef<Globe | null>(null)
  const stars = useMemo(() => (dive ? starShadows(140) : ''), [dive])
  // Where the camera starts (the far side of the Earth, the globe small), where the place's side faces you, and where
  // it ends (low over the spot, tilted)
  const cams = useMemo(() => {
    const w = window.innerWidth, h = window.innerHeight
    const whole = wholeGlobeZoom(w, h)
    const from: Cam = { lng: card.lon + 150, lat: card.lat * 0.3, zoom: whole - 0.8, pitch: 0, bearing: 0 }
    const facing: Cam = { lng: card.lon, lat: card.lat, zoom: whole + 0.25, pitch: 0, bearing: 0 }
    const end: Cam = { lng: card.lon, lat: card.lat, zoom: closeZoom(card, w), pitch: 52, bearing: -24 }
    return { from, facing, end }
  }, [card])

  // The map is made before the timeline below is built (effects run in order), so it loads while the screen dims
  useLayoutEffect(() => {
    if (!dive || !globeEl.current) return
    const g = createGlobe(globeEl.current, cams.from)
    globe.current = g
    if (import.meta.env.DEV) (window as unknown as { __globe?: Globe | null }).__globe = g // for scripts/record-special.mjs
    return () => { g?.map.remove(); globe.current = null }
  }, [dive, cams])

  useGSAP((_, contextSafe) => {
    const q = gsap.utils.selector(root)
    const flip = contextSafe!(() => setFlipped(true))
    const done = contextSafe!(() => setFinished(true))
    gsap.set(q('.rv-line'), { autoAlpha: 0, y: 24 })
    gsap.set(q('.rv-result'), { autoAlpha: 0, y: 16 })
    const t = gsap.timeline({ onComplete: done })
    const g = globe.current
    // The backdrop fades in on its own: the Mythic's timeline may wait for the map before it starts
    gsap.fromTo(q('.rv-backdrop'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35 })
    // T0: when the card comes in. Straight away in the plain walkout, after the dive for a Mythic with a globe.
    let T0 = 0
    let alive = true
    let timer = 0
    if (g) {
      const cam = { ...cams.from }
      const aim = () => g.aim(cam)
      const fine = window.matchMedia('(pointer: fine)').matches // a slow orbit after landing, but not on phones
      // A Legendary takes the same path a bit faster (k): the Mythic is the longest show in the game
      const k = mythic ? 1 : 0.72
      T0 = 5.2 * k
      t.add(() => sfx.rumble(5.6 * k), 0)
        .fromTo(q('.rv-stars'), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.8 }, 0)
        .fromTo(q('.rv-globe'), { autoAlpha: 0, scale: 0.7 }, { autoAlpha: 1, scale: 1, duration: 1.4 * k, ease: 'power2.out' }, 0.1)
        // Turn the Earth until the place's side faces you
        .to(cam, { lng: cams.facing.lng, lat: cams.facing.lat, zoom: cams.facing.zoom, duration: 2.3 * k, ease: 'power2.inOut', onUpdate: aim }, 0.1)
        // Then dive. Zoom is already a log scale, so an even ease reads as a steady fall; tilt over the spot near the end.
        .to(cam, { zoom: cams.end.zoom, duration: 2.3 * k, ease: 'sine.inOut', onUpdate: aim }, 2.4 * k)
        .to(cam, { pitch: cams.end.pitch, bearing: cams.end.bearing, duration: 1.4 * k, ease: 'power2.inOut', onUpdate: aim }, 3.3 * k)
        .to(q('.rv-stars'), { autoAlpha: 0, duration: 1.2 * k }, 2.8 * k)
        // The pin lands on the spot
        .fromTo(q('.rv-pin'), { autoAlpha: 0, y: -70, scale: 0.6 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.45, ease: 'bounce.out' }, 4.75 * k - 0.2)
        .add(() => sfx.land(), 4.75 * k)
        .fromTo(q('.rv-ping'), { autoAlpha: 0.9, scale: 0.2 }, { autoAlpha: 0, scale: 3.2, duration: 0.9, ease: 'power2.out', immediateRender: false }, 4.75 * k)
        // The map dims and the pin gives way to the card
        .to(q('.rv-dim'), { autoAlpha: 1, duration: 0.6 }, T0 - 0.1)
        .to(q('.rv-pin'), { autoAlpha: 0, scale: 0.4, duration: 0.3 }, T0)
      if (fine) t.to(cam, { bearing: cams.end.bearing - 30, duration: 6, ease: 'none', onUpdate: aim }, T0)
      ;[1.9, 3.1, 4.2].forEach((at, i) => {
        t.to(q(`.rv-line-${i}`), { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power3.out' }, at * k).add(() => sfx.sting(i), at * k)
      })
      // Start the dive once the map has its style, or after a moment whatever happens (the screen is dimming meanwhile)
      t.pause()
      // Measure again first: the map can be made before the portal has its size and would stay at 400 x 300
      // Only while this run is current: React's development double-mount throws the first timeline away, and starting
      // it late would play it to its end and mark the reveal finished (a tap then closed it instead of skipping)
      const go = contextSafe!(() => { if (alive && t.paused() && t.progress() === 0) { g.map.resize(); t.play() } })
      g.ready.then(go)
      timer = window.setTimeout(go, 1200)
    } else {
      t.add(() => sfx.rumble(mythic ? 3.4 : 2.8), 0)
    }
    t.fromTo(q('.rv-card'), { scale: g ? 0.12 : 0.45, y: g ? 0 : 80, autoAlpha: 0, rotation: -8 }, { scale: 1, y: 0, autoAlpha: 1, rotation: 0, duration: 0.7, ease: 'back.out(1.5)' }, T0 + 0.15)
      .fromTo(q('.rv-rays'), { scale: 0.2, autoAlpha: 0 }, { scale: 1, autoAlpha: 0.75, duration: 1.2, ease: 'power2.out' }, T0 + 0.2)
      // The face-down card trembles while the build-up plays
      .to(q('.rv-card'), { keyframes: { x: [0, -2, 2, -1.5, 1.5, 0] }, duration: 0.25, repeat: g ? 3 : 9, ease: 'none' }, T0 + 0.9)
    if (!g) {
      lines.forEach((_, i) => {
        const at = 1.0 + i * 0.8
        t.to(q(`.rv-line-${i}`), { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power3.out' }, at).add(() => sfx.sting(i), at)
      })
    }
    const pop = g ? T0 + 1.95 : 1.0 + lines.length * 0.8 + 0.25
    t.to(q('.rv-rays'), { scale: 1.7, autoAlpha: 1, duration: 0.35, ease: 'power2.out' }, pop)
      .fromTo(q('.rv-flash'), { autoAlpha: 0 }, { autoAlpha: 0.9, duration: 0.08, yoyo: true, repeat: 1 }, pop)
      // A flat turn under the flash: squash to an edge, swap faces, spring back. (A 3D flip glitched on phones, where the
      // gyro tilt and the foil's blend layers sit inside it: developer, 2026-11-27.)
      .to(q('.rv-turn'), { scaleX: 0, duration: 0.12, ease: 'power2.in' }, pop - 0.12)
      .add(() => { flip(); sfx.boom(); sfx.reveal(card.tier) }, pop)
      .to(q('.rv-turn'), { scaleX: 1, duration: 0.3, ease: 'back.out(2)' }, pop)
      .to(q('.rv-lines'), { autoAlpha: 0, y: -16, duration: 0.3 }, pop)
      .fromTo(q('.rv-card'), { scale: 1.12 }, { scale: 1, duration: 0.7, ease: 'elastic.out(1, 0.5)' }, pop + 0.05)
      .to(q('.rv-result'), { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power3.out' }, pop + 0.45)
      .to(q('.rv-rays'), { scale: 1.35, autoAlpha: 0.6, duration: 1.2 }, pop + 0.4)
    tl.current = t
    if (import.meta.env.DEV) (window as unknown as { __rv?: gsap.core.Timeline }).__rv = t
    return () => { alive = false; window.clearTimeout(timer) }
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
      <div className={`rv-backdrop absolute inset-0 ${dive ? 'bg-[radial-gradient(circle_at_50%_45%,#0b0d1c,#020205)]' : 'bg-[radial-gradient(circle_at_50%_45%,rgba(40,14,22,.92),rgba(5,2,4,.97))]'}`} />
      {dive ? (
        <>
          <div className="rv-stars pointer-events-none absolute left-0 top-0 h-px w-px rounded-full" style={{ boxShadow: stars }} />
          {/* The map gets its own element: MapLibre's CSS makes its container position: relative, which beats absolute */}
          <div className="rv-globe absolute inset-0"><div ref={globeEl} className="h-full w-full" /></div>
          <div className="rv-dim pointer-events-none absolute inset-0" style={{ opacity: 0 }} />
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0">
            <div className="rv-ping" />
            <svg className="rv-pin" viewBox="0 0 32 44" aria-hidden="true">
              <defs>
                <linearGradient id="rv-pin-fill" x1="0" y1="0" x2="1" y2="1">
                  {mythic
                    ? <><stop offset="0" stopColor="#ff8fb1" /><stop offset=".35" stopColor="#ffd66b" /><stop offset=".7" stopColor="#7fe6d6" /><stop offset="1" stopColor="#b48cff" /></>
                    : <><stop offset="0" stopColor="#fff1b8" /><stop offset=".5" stopColor="#f3b63f" /><stop offset="1" stopColor="#b9771a" /></>}
                </linearGradient>
              </defs>
              <path d="M16 1C7.7 1 1 7.6 1 15.8 1 27 16 43 16 43s15-16 15-27.2C31 7.6 24.3 1 16 1z" fill="url(#rv-pin-fill)" stroke="#1a0b12" strokeWidth="1.5" />
              <circle cx="16" cy="15.5" r="5.5" fill="#1a0b12" />
            </svg>
          </div>
        </>
      ) : null}
      <div className={`rv-rays ${mythic ? 'rv-rays-mythic' : ''}`}><div className="rv-rays-spin" /></div>
      <div className="relative flex flex-col items-center gap-4 px-4">
        <div className={`rv-lines ${dive ? 'rv-lines-over-map' : ''} flex h-28 flex-col items-center justify-end gap-1 text-center`}>
          <span className="rv-line rv-line-0 font-display text-3xl font-extrabold uppercase tracking-[0.25em] text-[#ffe9a8] sm:text-4xl">{lines[0]}</span>
          <span className="rv-line rv-line-1 font-display text-xl font-bold tracking-[0.12em] text-ink">{lines[1]}</span>
          <span className="rv-line rv-line-2 text-sm font-semibold uppercase tracking-[0.3em] text-muted">{lines[2]}</span>
        </div>
        <div className={`rv-card aspect-[5/7] w-[min(68vw,300px,calc((100dvh-290px)/1.4))] ${finished ? '' : 'rv-still'}`}>
          <div className="rv-turn relative h-full w-full">
            {/* The face is built while the backdrop fades in (one hitch, hidden) and sits under the back, so it is already drawn when the back is taken away */}
            <div className="absolute inset-0"><CardFace pool={pool} card={card} serial={pull.serial} foil={pull.foil} stamp={stamp} size="lg" /></div>
            <div className={`absolute inset-0 ${flipped ? 'invisible' : ''}`}><CardBack tier={card.tier} /></div>
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
