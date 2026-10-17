import { useSyncExternalStore } from 'react'
import type { PerkDef } from './config'

export type Phase = 'menu' | 'playing' | 'paused' | 'upgrade' | 'gameover'

export interface Banner {
  id: number
  title: string
  sub?: string
  tone?: 'normal' | 'danger' | 'good'
}

export interface Stats {
  kills: number
  time: number
  wave: number
  score: number
  best: number
  newBest: boolean
}

export interface HudState {
  phase: Phase
  wave: number
  hostiles: number
  waveTotal: number
  score: number
  hp: number
  maxHp: number
  dashFrac: number // 0..1 (1 = ready)
  frags: number
  weapon: number
  mags: number[]
  reserves: number[] // -1 = infinite
  reload: number // -1 = not reloading, else 0..1
  combo: number
  comboFrac: number
  muted: boolean
  bossHp: number // -1 none
  bossName: string
  banner: Banner | null
  perkChoices: PerkDef[]
  gunChoices: number[]
  loadout: number[]
  perks: Record<string, number>
  stats: Stats
  hurt: number // increments each time the player takes damage
  best: number
}

const initial: HudState = {
  phase: 'menu',
  wave: 0,
  hostiles: 0,
  waveTotal: 0,
  score: 0,
  hp: 100,
  maxHp: 100,
  dashFrac: 1,
  frags: 3,
  weapon: 0,
  mags: [30, 8, 64, 5, 120, 6, 200, 45, 6],
  reserves: [-1, 48, 256, 25, 360, 30, 600, 200, 42],
  reload: -1,
  combo: 0,
  comboFrac: 0,
  muted: false,
  bossHp: -1,
  bossName: '',
  banner: null,
  perkChoices: [],
  gunChoices: [],
  loadout: [0],
  perks: {},
  stats: { kills: 0, time: 0, wave: 0, score: 0, best: 0, newBest: false },
  hurt: 0,
  best: 0,
}

type Listener = () => void

class Store {
  state: HudState = initial
  private listeners = new Set<Listener>()

  set = (patch: Partial<HudState>) => {
    let changed = false
    for (const k in patch) {
      const key = k as keyof HudState
      if (!Object.is(this.state[key], patch[key])) {
        changed = true
        break
      }
    }
    if (!changed) return
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((l) => l())
  }

  subscribe = (l: Listener) => {
    this.listeners.add(l)
    return () => {
      this.listeners.delete(l)
    }
  }
}

export const hud = new Store()

export function useHud<K extends keyof HudState>(key: K): HudState[K] {
  return useSyncExternalStore(
    hud.subscribe,
    () => hud.state[key],
    () => hud.state[key],
  )
}
