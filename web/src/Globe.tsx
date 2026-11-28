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

/**
 * Below this zoom the globe draws our own small world file (web/public/world/world.json, built by
 * scripts/build-world.py) instead of OpenFreeMap. Their zoomed-out tiles cost about 125 KB each and a pack's tour
 * downloaded 21 MB of them (2026-11-28); the world file is about 0.5 MB once, then cached. Closer in, the tiles are
 * small and only a few are needed.
 */
export const NEAR_ZOOM = 7
const WORLD_URL = '/world/world.json'

type Paint = Record<string, unknown>
function paintColor(style: maplibregl.StyleSpecification, id: string, prop: string, fallback: string): string {
  const v = (style.layers.find((l) => l.id === id) as { paint?: Paint } | undefined)?.paint?.[prop]
  return typeof v === 'string' ? v : fallback
}

/** The chosen OpenFreeMap style, with its tiles kept for close up and our world file drawn below NEAR_ZOOM. */
function hybrid(style: maplibregl.StyleSpecification): maplibregl.StyleSpecification {
  const land = paintColor(style, 'background', 'background-color', '#f8f4f0')
  const water = paintColor(style, 'water', 'fill-color', '#a0c8f0')
  const border = paintColor(style, 'boundary_2', 'line-color', '#9e9cab')
  const sources: maplibregl.StyleSpecification['sources'] = {}
  const raster = new Set<string>()
  for (const [id, src] of Object.entries(style.sources)) {
    if (src.type === 'raster') { raster.add(id); continue } // the shaded relief only exists below zoom 7
    sources[id] = src.type === 'vector' ? { ...src, minzoom: NEAR_ZOOM } : src
  }
  sources.world = { type: 'geojson', data: WORLD_URL, maxzoom: NEAR_ZOOM + 1, tolerance: 0.6 }
  const layers: maplibregl.LayerSpecification[] = []
  for (const l of style.layers) {
    if ('source' in l && raster.has(l.source as string)) continue
    if (l.type === 'background') {
      // Sea below NEAR_ZOOM (our land is drawn on it); the style's own land colour above, where its tiles draw water
      layers.push({ ...l, paint: { ...l.paint, 'background-color': ['step', ['zoom'], water, NEAR_ZOOM, land] } })
      const far = { source: 'world', maxzoom: NEAR_ZOOM } as const
      layers.push(
        { id: 'world-land', type: 'fill', ...far, filter: ['==', ['get', 'k'], 'land'], paint: { 'fill-color': land } },
        { id: 'world-lake', type: 'fill', ...far, filter: ['==', ['get', 'k'], 'lake'], paint: { 'fill-color': water } },
        { id: 'world-state', type: 'line', ...far, filter: ['==', ['get', 'k'], 'state'], paint: { 'line-color': border, 'line-width': 0.7, 'line-opacity': 0.7 } },
        { id: 'world-country', type: 'line', ...far, filter: ['==', ['get', 'k'], 'country'], paint: { 'line-color': border, 'line-width': 1.2 } },
      )
      continue
    }
    layers.push('source' in l ? { ...l, minzoom: Math.max(l.minzoom ?? 0, NEAR_ZOOM) } as maplibregl.LayerSpecification : l)
  }
  return { ...style, sources, layers }
}

/** Builds the globe in `el` looking at `start`. Null when the browser has no WebGL: the walkout then plays without it. */
export function createGlobe(el: HTMLElement, start: Cam): Globe | null {
  let map: maplibregl.Map
  try {
    map = new maplibregl.Map({
      container: el, style: { version: 8, sources: {}, layers: [] }, center: [start.lng, start.lat], zoom: start.zoom,
      pitch: start.pitch, bearing: start.bearing, maxPitch: 70, minZoom: -2,
      interactive: false, attributionControl: { compact: true, customAttribution: 'Natural Earth' }, fadeDuration: 0,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2), // a phone at 3x pays for 2.25x the pixels for little gain
    })
  } catch { return null }
  // The real style goes in through setStyle, the only way to rewrite it on the way in
  map.setStyle(styleUrl(savedStyle()), { diff: false, transformStyle: (_prev, next) => hybrid(next) })
  requestAnimationFrame(() => map.resize()) // the container may not have had its size yet
  map.on('style.load', () => {
    map.setProjection({ type: 'globe' })
    // A thin blue rim of air around the planet that fades as the camera comes down
    map.setSky({ 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 8, 0] })
  })
  // Ready once the world file is drawn (an empty blue ball first would look broken), or on any error
  const ready = new Promise<void>((res) => {
    const check = () => { if (map.getSource('world') && map.isSourceLoaded('world')) { map.off('sourcedata', check); res() } }
    map.on('sourcedata', check)
    map.once('error', () => res())
  })
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
