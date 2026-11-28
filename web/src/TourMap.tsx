// The globe tour (effects "full", developer 2026-11-28): one map behind the whole pack screen. As each card turns
// over, the camera flies to its place and drops a pin there: Commons zip past high up, Rares come a little lower and
// slower, an Epic flies in during its charge-up. The pins stay, so a pack leaves its five places on the globe.
// Legendary and Mythic cards get their own dive in the walkout (Reveal.tsx); the tour just jumps there afterwards.
import * as maplibregl from 'maplibre-gl'
import { useLayoutEffect, useRef, type RefObject } from 'react'
import type { IndexCard, Tier } from './data'
import { closeZoom, createGlobe, wholeGlobeZoom, type Globe } from './Globe'

/** How long the camera takes to reach a card's place, and how low it comes. */
export const HOP_SECONDS: Record<Tier, number> = { Common: 0.75, Rare: 1.05, Epic: 1.2, Legendary: 0.9, Mythic: 0.9 }
const HOP_ZOOM: Record<Tier, number> = { Common: 4.6, Rare: 6.2, Epic: 9.5, Legendary: 11, Mythic: 11 }
const HOP_PITCH: Record<Tier, number> = { Common: 0, Rare: 15, Epic: 40, Legendary: 45, Mythic: 45 }

export interface Tour {
  /** Fly to the card's place, then pin it. */
  hop: (card: IndexCard, seconds?: number) => void
  /** Go straight there (after a walkout, which already showed the dive) and pin it. */
  jump: (card: IndexCard) => void
}

export function TourMap({ first, tour, focusY }: {
  first: IndexCard // the globe starts turned toward this place
  tour: RefObject<Tour | null>
  focusY: () => number // where on the screen (px from the map's top) the place should end up: the free space by the cards
}) {
  const el = useRef<HTMLDivElement>(null)
  const focus = useRef(focusY)
  focus.current = focusY

  useLayoutEffect(() => {
    if (!el.current) return
    const w = el.current.clientWidth || window.innerWidth, h = el.current.clientHeight || window.innerHeight
    const g: Globe | null = createGlobe(el.current, { lng: first.lon, lat: first.lat * 0.6, zoom: wholeGlobeZoom(w, h, 0.9), pitch: 0, bearing: 0 })
    if (!g) { tour.current = null; return }
    const m = g.map
    const pins = new Map<string, maplibregl.Marker>()
    const timers: number[] = []
    // MapLibre padding moves the camera's centre: put the place at focusY rather than the middle (under the cards)
    const padding = () => {
      const H = m.getContainer().clientHeight
      const y = Math.min(H - 40, Math.max(40, focus.current()))
      return y > H / 2 ? { top: 2 * y - H, bottom: 0, left: 0, right: 0 } : { top: 0, bottom: H - 2 * y, left: 0, right: 0 }
    }
    const pin = (card: IndexCard) => {
      if (pins.has(card.id)) return
      const dot = document.createElement('div')
      dot.className = `tour-pin tour-${card.tier.toLowerCase()}`
      dot.innerHTML = '<i></i>'
      pins.set(card.id, new maplibregl.Marker({ element: dot, anchor: 'bottom' }).setLngLat([card.lon, card.lat]).addTo(m))
    }
    const target = (card: IndexCard) => ({
      center: [card.lon, card.lat] as [number, number],
      zoom: Math.min(HOP_ZOOM[card.tier], closeZoom(card, m.getContainer().clientWidth)),
      pitch: HOP_PITCH[card.tier], bearing: 0, padding: padding(),
    })
    tour.current = {
      hop: (card, seconds = HOP_SECONDS[card.tier]) => {
        m.resize()
        m.flyTo({ ...target(card), duration: seconds * 1000, essential: true })
        timers.push(window.setTimeout(() => pin(card), seconds * 1000 - 120))
      },
      jump: (card) => { m.jumpTo(target(card)); pin(card) },
    }
    return () => { timers.forEach(clearTimeout); tour.current = null; m.remove() }
    // made once per pack (PackScreen keys this by the pack)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="tour-map pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* MapLibre's CSS makes its container position: relative, so the map gets its own element */}
      <div ref={el} className="h-full w-full" />
      <div className="tour-shade absolute inset-0" />
    </div>
  )
}
