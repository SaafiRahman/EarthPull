import { useCallback, useEffect, useState } from 'react'
import { CardPreview } from './CardPreview'
import { Collection } from './Collection'
import { loadPool, type Pool } from './data'
import { MAX_PACKS, loadState, newState, openPack, refill, saveState, type GameState } from './game'
import { HometownPicker } from './Hometown'
import { MapView } from './MapView'
import { PackScreen } from './PackScreen'

type Tab = 'packs' | 'collection' | 'map'
const TABS: [Tab, string][] = [['packs', 'Packs'], ['collection', 'Collection'], ['map', 'Map']]

export default function App() {
  const [pool, setPool] = useState<Pool | null>(null)
  const [error, setError] = useState('')
  const [state, setState] = useState<GameState>(() => refill(loadState()))
  const [tab, setTab] = useState<Tab>('packs')
  const [askHome, setAskHome] = useState(() => { const s = loadState(); return !s.hometown && s.opened === 0 })

  useEffect(() => { loadPool().then(setPool).catch((e) => setError(String(e.message || e))) }, [])
  useEffect(() => { saveState(state) }, [state])
  useEffect(() => { const t = setInterval(() => setState((s) => refill(s)), 15000); return () => clearInterval(t) }, [])

  const [askHere, setAskHere] = useState(false)
  const onOpen = useCallback((kind: 'normal' | 'local') => {
    if (!pool) return []
    const { pulls, state: next } = openPack(pool, refill(state), Math.random, kind)
    setState(next)
    return pulls
  }, [pool, state])

  const reset = () => {
    const fresh = newState()
    setState(fresh)
    setAskHome(true)
    setTab('packs')
  }

  if (error) return <p className="p-8 text-center text-muted">{error}</p>
  if (!pool) return <p className="p-8 text-center text-muted">Loading 86,000 places…</p>
  if (location.hash === '#cards') return <CardPreview pool={pool} />

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="font-display text-lg font-extrabold tracking-tight">Pull the Planet <span className="ml-1 rounded bg-panel-2 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-widest text-muted">North America demo</span></div>
        <nav className="flex gap-1 rounded-xl bg-panel p-1" aria-label="Sections">
          {TABS.map(([id, label]) => (
            <button
              key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${tab === id ? 'bg-panel-2 text-ink' : 'text-muted hover:text-ink'}`}
            >
              {label}{id === 'packs' && state.packs ? <span className="ml-1.5 rounded-full bg-accent px-1.5 text-xs text-ground">{state.packs}</span> : null}
            </button>
          ))}
        </nav>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'packs' ? (
          <PackScreen pool={pool} state={state} onOpen={onOpen}
            onAddPack={() => setState((s) => refill({ ...s, packs: Math.min(MAX_PACKS, s.packs + 1) }))}
            onChangeHere={() => setAskHere(true)}
            onResetLocal={() => setState((s) => ({ ...s, localDay: null }))} />
        ) : tab === 'collection' ? <Collection pool={pool} state={state} /> : <MapView pool={pool} state={state} />}
      </main>
      {tab !== 'map' ? (
        <footer className="flex flex-wrap justify-between gap-2 border-t border-line px-4 py-2 text-xs text-muted">
          <span className="hidden sm:inline">Demo: packs roll in your browser and serial numbers are simulated. Places from GeoNames, Wikidata and Wikipedia; photos from Wikimedia Commons.</span>
          <span className="sm:hidden">Demo: serials are simulated.</span>
          <ResetButton onReset={reset} />
        </footer>
      ) : null}
      {askHome ? (
        <HometownPicker pool={pool}
          onPick={(h) => { setState((s) => ({ ...s, hometown: h })); setAskHome(false) }}
          onSkip={() => setAskHome(false)} />
      ) : null}
      {askHere ? (
        <HometownPicker pool={pool} title="Where are you?"
          blurb="Your local pack holds places near this town. In the real game this comes from your rough location; in the demo, pick any town to pretend you've travelled there."
          skipLabel="Cancel"
          onPick={(h) => { setState((s) => ({ ...s, here: h })); setAskHere(false) }}
          onSkip={() => setAskHere(false)} />
      ) : null}
    </div>
  )
}

/** Two-step reset (the page builds its own confirmation instead of window.confirm). */
function ResetButton({ onReset }: { onReset: () => void }) {
  const [sure, setSure] = useState(false)
  useEffect(() => { if (!sure) return; const t = setTimeout(() => setSure(false), 4000); return () => clearTimeout(t) }, [sure])
  return sure
    ? <button className="font-semibold text-mythic underline" onClick={() => { setSure(false); onReset() }}>Tap again to erase your collection</button>
    : <button className="underline" onClick={() => setSure(true)}>Start over</button>
}
