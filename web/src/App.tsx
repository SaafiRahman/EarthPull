import { useCallback, useEffect, useState } from 'react'
import { startMotionTilt } from './Card'
import { LogoMark } from './CardBack'
import { CardPreview } from './CardPreview'
import { Collection } from './Collection'
import { loadPool, type Pool } from './data'
import { MAX_PACKS, loadState, newState, openPack, refill, saveState, type GameState } from './game'
import { HometownPicker } from './Hometown'
import { MapView } from './MapView'
import { PackScreen } from './PackScreen'
import { isMuted, onMuteChange, setMuted } from './sfx'

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
  // Phones: tilt the big cards with the motion sensor, started on the first tap (iPhones ask for permission then)
  useEffect(() => { const f = () => startMotionTilt(); window.addEventListener('pointerdown', f, { once: true }); return () => window.removeEventListener('pointerdown', f) }, [])
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
      <header className="app-header flex items-center justify-between gap-3 px-4 py-2 sm:py-3">
        <div className="flex items-center gap-2 font-display text-lg font-extrabold tracking-tight"><LogoMark className="h-7 w-7" />Pull the Planet <span className="ml-1 hidden rounded border border-accent/30 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-widest text-accent/80 sm:inline">North America demo</span></div>
        <div className="flex items-center gap-2">
        <MuteButton />
        <nav className="hidden gap-1 rounded-xl border border-line bg-ground/60 p-1 sm:flex" aria-label="Sections">
          {TABS.map(([id, label]) => (
            <button
              key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}
              className={`rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${tab === id ? 'bg-panel-2 text-accent shadow-[inset_0_0_0_1px_rgba(226,184,90,.35)]' : 'text-muted hover:text-ink'}`}
            >
              {label}{id === 'packs' && state.packs ? <span className="ml-1.5 rounded-full bg-accent px-1.5 text-xs text-ground">{state.packs}</span> : null}
            </button>
          ))}
        </nav>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'packs' ? (
          <PackScreen pool={pool} state={state} onOpen={onOpen}
            onAddPack={() => setState((s) => refill({ ...s, packs: Math.min(MAX_PACKS, s.packs + 1) }))}
            onChangeHere={() => setAskHere(true)}
            onResetLocal={() => setState((s) => ({ ...s, localDay: null }))} />
        ) : tab === 'collection' ? (
          <>
            <Collection pool={pool} state={state} />
            <p className="pb-6 text-center text-xs text-muted sm:hidden">Demo: serials are simulated. <ResetButton onReset={reset} /></p>
          </>
        ) : <MapView pool={pool} state={state} />}
      </main>
      {/* Phones: tabs in a bottom bar, where the thumb is */}
      <nav className="app-tabbar grid grid-cols-3 pb-[env(safe-area-inset-bottom)] sm:hidden" aria-label="Sections">
        {TABS.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}
            className={`flex flex-col items-center gap-0.5 py-2 text-xs font-semibold ${tab === id ? 'text-accent' : 'text-muted'}`}>
            <TabIcon id={id} />
            <span>{label}{id === 'packs' && state.packs ? <span className="ml-1 rounded-full bg-accent px-1.5 text-[10px] text-ground">{state.packs}</span> : null}</span>
          </button>
        ))}
      </nav>
      {tab !== 'map' ? (
        <footer className="hidden flex-wrap justify-between gap-2 border-t border-line bg-ground/70 px-4 py-2 text-xs text-muted">
          <span className="hidden sm:inline">Demo: packs roll in your browser and serial numbers are simulated. Places from GeoNames, Wikidata and Wikipedia; photos from Wikimedia Commons.</span>
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

/** Sound on or off (remembered in this browser). */
function MuteButton() {
  const [muted, set] = useState(isMuted)
  useEffect(() => onMuteChange(set), [])
  return (
    <button onClick={() => setMuted(!muted)} aria-label={muted ? 'Turn sound on' : 'Turn sound off'} aria-pressed={!muted}
      className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted hover:text-accent">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6 9H3v6h3l5 4z" />
        {muted ? <path d="m16 9 5 6m0-6-5 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
      </svg>
    </button>
  )
}

function TabIcon({ id }: { id: Tab }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
      {id === 'packs' ? <><path d="M6 3h12l-1 3H7z" {...p} /><rect x="5" y="6" width="14" height="15" rx="2" {...p} /><path d="m12 10 1.2 2.6 2.8.3-2.1 1.9.6 2.8L12 16.2l-2.5 1.4.6-2.8L8 12.9l2.8-.3z" {...p} /></> : null}
      {id === 'collection' ? <><rect x="3" y="6" width="11" height="15" rx="2" {...p} /><path d="M8 3h11a2 2 0 0 1 2 2v13" {...p} /></> : null}
      {id === 'map' ? <><path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z" {...p} /><circle cx="12" cy="11" r="2.2" {...p} /></> : null}
    </svg>
  )
}
