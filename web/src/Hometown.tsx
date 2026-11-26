import { useMemo, useState } from 'react'
import { regionName, type Pool } from './data'
import type { Hometown } from './game'

const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** First visit: pick a hometown so the first pack can hold a place near it. Only the town is stored, in this browser. */
export function HometownPicker({ pool, onPick, onSkip }: { pool: Pool; onPick: (h: Hometown) => void; onSkip: () => void }) {
  const [q, setQ] = useState('')
  const towns = useMemo(() => pool.cards.filter((c) => c.type === 'town').map((c) => ({ c, key: fold(c.label) })), [pool])
  const hits = useMemo(() => {
    const f = fold(q.trim())
    if (f.length < 2) return []
    const starts = towns.filter((t) => t.key.startsWith(f))
    const within = starts.length >= 8 ? [] : towns.filter((t) => !t.key.startsWith(f) && t.key.includes(f))
    return [...starts, ...within].slice(0, 8).map((t) => t.c)
  }, [q, towns])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ground/85 p-4 backdrop-blur-sm">
      <div className="rise w-full max-w-md rounded-2xl border border-line bg-panel p-6" role="dialog" aria-modal="true" aria-labelledby="ht-title">
        <h2 id="ht-title" className="font-display text-2xl font-extrabold text-balance">Where's home?</h2>
        <p className="mt-1 text-sm text-muted">
          Your first pack always holds a place within 50 km of your hometown. Pick any town in North America. It stays in this browser.
        </p>
        <input
          id="hometown-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Start typing a town, e.g. Halifax"
          className="mt-4 w-full rounded-xl border border-line bg-ground px-3 py-2.5"
          aria-label="Search for your hometown"
        />
        <ul className="mt-2 flex flex-col">
          {hits.map((c) => (
            <li key={c.id}>
              <button
                className="flex w-full items-baseline justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-panel-2"
                onClick={() => onPick({ id: c.id, label: c.label, lat: c.lat, lon: c.lon })}
              >
                <span className="font-semibold">{c.label}</span>
                <span className="truncate text-xs text-muted">{regionName(pool, c.region)}</span>
              </button>
            </li>
          ))}
          {q.trim().length >= 2 && !hits.length ? <li className="px-3 py-2 text-sm text-muted">No town by that name in the pool.</li> : null}
        </ul>
        <button onClick={onSkip} className="mt-4 text-sm text-muted underline">Skip, give me a random first pack</button>
      </div>
    </div>
  )
}
