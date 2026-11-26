// Sound effects made in the browser with the Web Audio API: no sound files to license or download. Each effect is a
// few oscillators or a burst of filtered noise. The audio context starts on the first user gesture (browsers block
// sound before that). Muting is remembered in this browser.
import type { Tier } from './data'

const MUTE_KEY = 'ptp-muted'
let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = (() => { try { return localStorage.getItem(MUTE_KEY) === '1' } catch { return false } })()
const listeners = new Set<(m: boolean) => void>()

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (muted) return null
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.55
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return { ctx, out: master! }
}

export const isMuted = () => muted
export function setMuted(m: boolean) {
  muted = m
  try { localStorage.setItem(MUTE_KEY, m ? '1' : '0') } catch { /* not saved */ }
  listeners.forEach((f) => f(m))
}
export function onMuteChange(f: (m: boolean) => void) { listeners.add(f); return () => { listeners.delete(f) } }

let noiseBuf: AudioBuffer | null = null
function noise(c: AudioContext): AudioBufferSourceNode {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 1.5, c.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const src = c.createBufferSource()
  src.buffer = noiseBuf
  return src
}

/** A burst of band-passed noise whose pitch sweeps from `f0` to `f1`. */
function sweep(f0: number, f1: number, dur: number, vol: number, q = 1.2, at = 0) {
  const a = audio(); if (!a) return
  const t = a.ctx.currentTime + at
  const src = noise(a.ctx), bp = a.ctx.createBiquadFilter(), g = a.ctx.createGain()
  bp.type = 'bandpass'; bp.Q.value = q
  bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(f1, t + dur)
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(bp).connect(g).connect(a.out)
  src.start(t, Math.random()); src.stop(t + dur + 0.05)
}

/** A bell-like note: a sine with a quieter octave above, quick attack, long fade. */
function bell(freq: number, at: number, dur: number, vol: number, type: OscillatorType = 'sine') {
  const a = audio(); if (!a) return
  const t = a.ctx.currentTime + at
  for (const [mult, v] of [[1, vol], [2, vol * 0.35], [3.01, vol * 0.12]] as const) {
    const o = a.ctx.createOscillator(), g = a.ctx.createGain()
    o.type = type; o.frequency.value = freq * mult
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(a.out)
    o.start(t); o.stop(t + dur + 0.05)
  }
}

/** A short low thump (the pack landing, the burst). */
function thump(f0: number, f1: number, dur: number, vol: number, at = 0) {
  const a = audio(); if (!a) return
  const t = a.ctx.currentTime + at
  const o = a.ctx.createOscillator(), g = a.ctx.createGain()
  o.type = 'sine'
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur)
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(a.out)
  o.start(t); o.stop(t + dur + 0.05)
}

// Rising hum while the pack is being torn: two detuned saws through a low-pass filter that opens with progress
let hum: { oscs: OscillatorNode[]; filter: BiquadFilterNode; gain: GainNode } | null = null

export const sfx = {
  /** Unlock audio on the first tap so later sounds play on time. */
  unlock() { audio() },
  /** Start or update the build-up hum; `p` is tear progress, 0 to 1. */
  hum(p: number) {
    const a = audio(); if (!a) return
    const t = a.ctx.currentTime
    if (!hum) {
      const filter = a.ctx.createBiquadFilter(), gain = a.ctx.createGain()
      filter.type = 'lowpass'; filter.Q.value = 4
      gain.gain.setValueAtTime(0.0001, t)
      const oscs = [0, 7].map((detune) => {
        const o = a.ctx.createOscillator()
        o.type = 'sawtooth'; o.detune.value = detune
        o.connect(filter); o.start(t)
        return o
      })
      filter.connect(gain).connect(a.out)
      hum = { oscs, filter, gain }
    }
    hum.oscs.forEach((o) => o.frequency.setTargetAtTime(70 + p * 150, t, 0.05))
    hum.filter.frequency.setTargetAtTime(300 + p * 2200, t, 0.05)
    hum.gain.gain.setTargetAtTime(0.025 + p * 0.06, t, 0.05)
  },
  /** Fade the hum out (tear finished or let go). */
  humStop() {
    if (!hum || !ctx) return
    const h = hum, t = ctx.currentTime
    hum = null
    h.gain.gain.setTargetAtTime(0.0001, t, 0.04)
    h.oscs.forEach((o) => o.stop(t + 0.3))
  },
  /** The pack landing in the middle of the screen. */
  land() { thump(150, 55, 0.22, 0.4); sweep(900, 300, 0.12, 0.08, 1) },
  /** The burst after the squeeze: a deep thump under a bright crack. */
  pop() { thump(180, 40, 0.4, 0.55); sweep(5000, 1500, 0.18, 0.25, 0.7) },
  /** A card snapping into its place in the row. */
  tick(i = 0) { thump(900 + i * 60, 500, 0.06, 0.18); sweep(6000, 3000, 0.03, 0.08, 2) },
  /** Foil crinkle while the finger drags across the pack. */
  crinkle() { sweep(3500 + Math.random() * 2500, 2500, 0.06, 0.08, 3) },
  /** The pack tearing open: a rough rip, then the strip flying off. */
  rip() {
    for (let i = 0; i < 7; i++) sweep(2800 - i * 200 + Math.random() * 600, 900, 0.07, 0.3, 1.5, i * 0.028)
    sweep(1200, 300, 0.35, 0.18, 0.8, 0.18)
  },
  /** Cards sliding out of the pack. */
  slide(i = 0) { sweep(1400, 700, 0.16, 0.12, 1, i * 0.09) },
  /** A card turning over. */
  flip() { sweep(2400, 1100, 0.1, 0.16, 2) },
  /** The chime after a flip, rising with rarity. */
  reveal(tier: Tier) {
    const notes: Record<Tier, number[]> = {
      Common: [523], Rare: [587, 880], Epic: [523, 659, 988],
      Legendary: [392, 523, 659, 784, 1047], Mythic: [392, 494, 587, 784, 988, 1175, 1568],
    }
    const n = notes[tier]
    n.forEach((f, i) => bell(f, i * (tier === 'Mythic' ? 0.11 : 0.08), tier === 'Common' ? 0.35 : 1.1, tier === 'Common' ? 0.09 : 0.14))
  },
}
