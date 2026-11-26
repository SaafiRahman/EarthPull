import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CardModal } from './CardModal'
import { TIERS, type Pool, type Tier } from './data'
import type { GameState } from './game'
import { ownedCards, type OwnedCard } from './Collection'

const STYLE = 'https://tiles.openfreemap.org/styles/dark' // free vector tiles, no key
const HEX: Record<Tier, string> = { Common: '#a3adbd', Rare: '#4f8ef7', Epic: '#a970f7', Legendary: '#f3b63f', Mythic: '#ff5f8f' }

export function MapView({ pool, state }: { pool: Pool; state: GameState }) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<maplibregl.Map | null>(null)
  const owned = useMemo(() => ownedCards(pool, state), [pool, state])
  const byId = useMemo(() => new Map(owned.map((o) => [o.card.id, o])), [owned])
  const [open, setOpen] = useState<OwnedCard | null>(null)

  const geojson = useMemo(() => ({
    type: 'FeatureCollection' as const,
    features: owned.map((o) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [o.card.lon, o.card.lat] },
      properties: { id: o.card.id, label: o.card.label, tier: TIERS.indexOf(o.card.tier) },
    })),
  }), [owned])

  const geoRef = useRef(geojson)
  geoRef.current = geojson
  const byIdRef = useRef(byId)
  byIdRef.current = byId

  useEffect(() => {
    if (!el.current) return
    const m = new maplibregl.Map({ container: el.current, style: STYLE, center: [-98, 40], zoom: 2.6, attributionControl: { compact: true } })
    map.current = m
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.on('load', () => {
      m.addSource('owned', { type: 'geojson', data: geoRef.current, cluster: true, clusterRadius: 42, clusterMaxZoom: 9,
        clusterProperties: { best: ['max', ['get', 'tier']] } })
      const tierColor = (expr: maplibregl.ExpressionSpecification): maplibregl.ExpressionSpecification =>
        ['match', expr, 0, HEX.Common, 1, HEX.Rare, 2, HEX.Epic, 3, HEX.Legendary, 4, HEX.Mythic, HEX.Common]
      m.addLayer({ id: 'clusters', type: 'circle', source: 'owned', filter: ['has', 'point_count'], paint: {
        'circle-color': tierColor(['get', 'best']), 'circle-opacity': 0.85,
        'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 24, 200, 30],
        'circle-stroke-width': 2, 'circle-stroke-color': '#0e131d' } })
      m.addLayer({ id: 'cluster-count', type: 'symbol', source: 'owned', filter: ['has', 'point_count'],
        layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12, 'text-font': ['Noto Sans Bold'] },
        paint: { 'text-color': '#0e131d' } })
      m.addLayer({ id: 'pins', type: 'circle', source: 'owned', filter: ['!', ['has', 'point_count']], paint: {
        'circle-color': tierColor(['get', 'tier']),
        'circle-radius': ['match', ['get', 'tier'], 4, 10, 3, 8, 2, 7, 6],
        'circle-stroke-width': 1.5, 'circle-stroke-color': '#0e131d' } })
      m.on('click', 'clusters', async (e: maplibregl.MapLayerMouseEvent) => {
        const f = e.features?.[0]
        if (!f) return
        const src = m.getSource('owned') as maplibregl.GeoJSONSource
        const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id)
        m.easeTo({ center: (f.geometry as { coordinates: number[] }).coordinates as [number, number], zoom })
      })
      m.on('click', 'pins', (e: maplibregl.MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id
        const o = id && byIdRef.current.get(id)
        if (o) setOpen(o)
      })
      for (const l of ['clusters', 'pins']) {
        m.on('mouseenter', l, () => { m.getCanvas().style.cursor = 'pointer' })
        m.on('mouseleave', l, () => { m.getCanvas().style.cursor = '' })
      }
    })
    return () => { m.remove(); map.current = null }
    // the map is created once; data updates go through the effect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const src = map.current?.getSource('owned') as maplibregl.GeoJSONSource | undefined
    src?.setData(geojson)
  }, [geojson])

  return (
    <div className="relative h-full w-full">
      <div ref={el} className="h-full w-full" />
      <div className="pointer-events-none absolute left-3 top-3 rounded-xl border border-line bg-panel/90 px-3 py-2 text-sm">
        <div className="font-display font-semibold">{owned.length.toLocaleString('en-US')} places on your map</div>
        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted">
          {TIERS.map((t) => <span key={t}><span style={{ color: HEX[t] }}>●</span> {t}</span>)}
        </div>
      </div>
      {!owned.length ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-8 mx-auto w-fit rounded-xl bg-panel/90 px-4 py-2 text-sm text-muted">
          Open a pack and your places will appear here.
        </div>
      ) : null}
      {open ? <CardModal pool={pool} card={open.card} serial={open.serial} hometown={open.hometown} copies={open.copies} onClose={() => setOpen(null)} /> : null}
    </div>
  )
}
