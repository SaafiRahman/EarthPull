import { useEffect, useState } from 'react'
import { CardFace } from './Card'
import { countryName, loadDetail, type CardDetail, type IndexCard, type Pool } from './data'

const FACTS: [string, string, (v: number) => string][] = [
  ['population', 'Population', (v) => Math.round(v).toLocaleString('en-US')],
  ['elevation_m', 'Elevation', (v) => `${Math.round(v).toLocaleString('en-US')} m`],
  ['height_m', 'Height', (v) => `${Math.round(v).toLocaleString('en-US')} m`],
  ['prominence_m', 'Prominence', (v) => `${Math.round(v).toLocaleString('en-US')} m`],
  ['area_km2', 'Area', (v) => `${v.toLocaleString('en-US')} km²`],
  ['length_km', 'Length', (v) => `${v.toLocaleString('en-US')} km`],
  ['temp_c', 'Avg temp', (v) => `${v.toFixed(1)} °C`],
]

export function CardModal({ pool, card, serial, hometown, copies, onClose }: {
  pool: Pool; card: IndexCard; serial: number | null; hometown?: boolean; copies?: number; onClose: () => void
}) {
  const [detail, setDetail] = useState<CardDetail | undefined>()
  useEffect(() => {
    let live = true
    loadDetail(pool, card.id).then((d) => live && setDetail(d))
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    return () => { live = false; window.removeEventListener('keydown', esc) }
  }, [pool, card.id, onClose])

  const facts = detail ? FACTS.filter(([k]) => detail.facts?.[k] != null) : []
  const img = detail?.image
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ground/80 p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label={card.label}
        className="rise max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-line bg-panel p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-6 sm:flex-row">
          <div className="mx-auto aspect-[5/7] w-56 shrink-0 sm:w-64">
            <CardFace pool={pool} card={card} serial={serial} hometown={hometown} size="lg" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div>
              <h2 className="font-display text-2xl font-semibold text-balance">{card.label}</h2>
              <p className="text-sm text-muted">{countryName(pool, card.region)}{copies && copies > 1 ? ` · you own ${copies} copies` : ''}</p>
            </div>
            {detail?.flavour?.text ? (
              <p className="leading-relaxed">
                {detail.flavour.text}
                {detail.flavour.translated ? <span className="ml-2 text-xs uppercase tracking-wider text-muted">translated</span> : null}
              </p>
            ) : null}
            {facts.length ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                {facts.map(([k, label, fmt]) => (
                  <div key={k}>
                    <dt className="text-[11px] uppercase tracking-wider text-muted">{label}</dt>
                    <dd className="font-semibold tabular-nums">{fmt(detail!.facts[k] as number)}</dd>
                  </div>
                ))}
                <div>
                  <dt className="text-[11px] uppercase tracking-wider text-muted">Fame</dt>
                  <dd className="font-semibold tabular-nums">{detail!.fame.toLocaleString('en-US')}</dd>
                </div>
              </dl>
            ) : null}
            {detail ? (
              <div className="mt-auto flex flex-col gap-1 text-xs text-muted">
                {img?.kind === 'photo' ? (
                  <span>
                    Photo: {img.author || 'unknown'}{img.licence ? `, ${img.licence}` : ''}
                    {img.page ? <> · <a className="text-accent underline" href={img.page} target="_blank" rel="noreferrer">Wikimedia Commons</a></> : null}
                  </span>
                ) : <span>Mini-map drawn from Natural Earth</span>}
                {detail.flavour?.url ? (
                  <span>Text: <a className="text-accent underline" href={detail.flavour.url} target="_blank" rel="noreferrer">Wikipedia</a>, CC BY-SA 4.0</span>
                ) : null}
              </div>
            ) : <p className="text-sm text-muted">Loading details…</p>}
          </div>
        </div>
        <button onClick={onClose} className="mt-5 w-full rounded-xl border border-line py-2.5 font-semibold text-muted hover:text-ink">Close</button>
      </div>
    </div>
  )
}
