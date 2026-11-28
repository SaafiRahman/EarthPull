// How much the pack opening shows (developer, 2026-11-28), remembered in this browser:
//   full  - the globe sits behind the whole pack and the camera hops to every card's place (Commons fast and high,
//           rarer cards slower and lower), plus the Legendary and Mythic dives
//   light - only the Legendary and Mythic dives
//   off   - no globe at all (the flips, charge-ups and walkouts stay)
// Players whose device asks for less motion start on Off; data saver starts on Light. Their own choice always wins.
import { useEffect, useState } from 'react'

export type Effects = 'full' | 'light' | 'off'
export const EFFECTS: Effects[] = ['full', 'light', 'off']
export const EFFECTS_LABEL: Record<Effects, string> = { full: 'Full', light: 'Light', off: 'Off' }
const KEY = 'ptp-effects'

function defaultEffects(): Effects {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 'off'
  if ((navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData) return 'light'
  return 'full'
}

let current: Effects = (() => {
  try {
    const v = localStorage.getItem(KEY)
    if (v && (EFFECTS as string[]).includes(v)) return v as Effects
  } catch { /* storage blocked */ }
  return defaultEffects()
})()
const listeners = new Set<(e: Effects) => void>()

export const getEffects = () => current
export function setEffects(e: Effects) {
  current = e
  try { localStorage.setItem(KEY, e) } catch { /* not saved */ }
  listeners.forEach((f) => f(e))
}
export function useEffectsSetting(): Effects {
  const [e, set] = useState(current)
  useEffect(() => { listeners.add(set); return () => { listeners.delete(set) } }, [])
  return e
}
