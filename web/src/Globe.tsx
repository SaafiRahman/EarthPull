// The globe behind a Mythic reveal (pack opening step d, 2026-11-28): Earth turning in space, then a dive down to the
// exact spot. The camera is not flown by MapLibre: Reveal.tsx tweens a plain camera object with GSAP and calls `aim`, so
// the dive keeps time with the rest of the walkout and a tap can jump straight to the end.
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { IndexCard } from './data'
import { savedStyle, styleUrl } from './MapView'

export interface Cam { lng: number; lat: number; zoom: number; pitch: number; bearing: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const M_PER_PX_Z0 = 40075016.7 / 512 // MapLibre's tiles are 512 px

/** Zoom at which the whole globe is about this share of the screen's short side across. */
export function wholeGlobeZoom(w: number, h: number, share = 0.78): number {
  // At zoom z the globe's circumference is 512 * 2^z px, so its diameter is 512 * 2^z / pi
  return Math.log2((share * Math.min(w, h) * Math.PI) / 512)
}

/** Zoom that frames the place: from its area or length when the card has one, else a guess by type. */
export function closeZoom(card: IndexCard, width: number): number {
  const fact = (k: string) => card.facts.find((f) => f.key === k)?.value
  const area = fact('area_km2')
  const length = fact('length_km')
  const km = clamp(area ? Math.sqrt(area) * 1.6 : length ? length * 0.7 : card.type === 'built' ? 0.9 : card.type === 'town' ? 12 : 9, 0.6, 600)
  const mPerPx = (km * 1000) / (width * 0.9)
  return clamp(Math.log2((M_PER_PX_Z0 * Math.cos((card.lat * Math.PI) / 180)) / mPerPx), 3.5, 16.5)
}

export interface Globe { map: maplibregl.Map; aim: (c: Cam) => void; ready: Promise<void> }

/** Builds the globe in `el` looking at `start`. Null when the browser has no WebGL: the walkout then plays without it. */
export function createGlobe(el: HTMLElement, start: Cam): Globe | null {
  let map: maplibregl.Map
  try {
    map = new maplibregl.Map({
      container: el, style: styleUrl(savedStyle()), center: [start.lng, start.lat], zoom: start.zoom,
      pitch: start.pitch, bearing: start.bearing, maxPitch: 70, minZoom: -2,
      interactive: false, attributionControl: { compact: true }, fadeDuration: 0,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2), // a phone at 3x pays for 2.25x the pixels for little gain
    })
  } catch { return null }
  requestAnimationFrame(() => map.resize()) // the container may not have had its size yet
  map.on('style.load', () => {
    map.setProjection({ type: 'globe' })
    // A thin blue rim of air around the planet that fades as the camera comes down
    map.setSky({ 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 8, 0] })
  })
  const ready = new Promise<void>((res) => { map.once('load', () => res()); map.once('error', () => res()) })
  return { map, ready, aim: (c) => map.jumpTo({ center: [c.lng, c.lat], zoom: c.zoom, pitch: c.pitch, bearing: c.bearing }) }
}

/** A field of stars for behind the globe: drawn once as box-shadows on one tiny element. */
export function starShadows(n: number, seed = 7): string {
  let a = seed
  const rand = () => { a = (a * 16807) % 2147483647; return a / 2147483647 }
  return Array.from({ length: n }, () => {
    const o = (0.25 + rand() * 0.75).toFixed(2)
    return `${(rand() * 100).toFixed(2)}vw ${(rand() * 100).toFixed(2)}vh 0 ${rand() < 0.12 ? 1 : 0}px rgba(255,255,255,${o})`
  }).join(',')
}
