import { shuffle } from './util'

/* ----------------------------------------------------------------------------
 * Weapons
 * ------------------------------------------------------------------------- */
export type WeaponId = 'carbine' | 'shotgun' | 'vectors' | 'railgun'

export interface WeaponDef {
  id: WeaponId
  name: string
  sub: string
  damage: number
  interval: number // seconds between shots
  mag: number
  reload: number // seconds
  spread: number // degrees
  pellets: number
  range: number
  reserve: number // starting reserve ammo (Infinity = unlimited)
  pierce: number // extra enemies a shot can pass through
  knock: number
  tracer: number
  color: number
}

export const WEAPONS: WeaponDef[] = [
  {
    id: 'carbine', name: 'CARBINE', sub: 'Assault Rifle',
    damage: 24, interval: 0.095, mag: 30, reload: 1.55, spread: 2.2, pellets: 1,
    range: 44, reserve: Infinity, pierce: 0, knock: 1.4, tracer: 0xffd27a, color: 0xffd27a,
  },
  {
    id: 'shotgun', name: 'BREACHER', sub: 'Combat Shotty',
    damage: 13, interval: 0.78, mag: 8, reload: 2.2, spread: 12, pellets: 9,
    range: 19, reserve: 48, pierce: 0, knock: 4.2, tracer: 0xffb066, color: 0xff9a4a,
  },
  {
    id: 'vectors', name: 'VECTORS', sub: 'Dual SMGs',
    damage: 11, interval: 0.05, mag: 64, reload: 2.0, spread: 6.5, pellets: 1,
    range: 30, reserve: 256, pierce: 0, knock: 0.7, tracer: 0xa8e6ff, color: 0x8ad8ff,
  },
  {
    id: 'railgun', name: 'RAILGUN', sub: 'Pierce Beam',
    damage: 170, interval: 1.05, mag: 5, reload: 2.4, spread: 0, pellets: 1,
    range: 80, reserve: 25, pierce: 99, knock: 6, tracer: 0x7ff3ff, color: 0x6ff0ff,
  },
]

/* ----------------------------------------------------------------------------
 * Zombies
 * ------------------------------------------------------------------------- */
export type ZombieKind = 'walker' | 'runner' | 'spitter' | 'bloater' | 'brute' | 'boss'

export interface ZombieDef {
  kind: ZombieKind
  label: string
  hp: number
  speed: number
  damage: number
  radius: number
  scale: number
  score: number
  cost: number
  minWave: number
  weight: number
  attackCd: number
  knockResist: number
}

export const ZOMBIES: Record<ZombieKind, ZombieDef> = {
  walker:  { kind: 'walker',  label: 'Shambler',   hp: 62,   speed: 2.8, damage: 10, radius: 0.45, scale: 1.0,  score: 10,   cost: 1,   minWave: 1, weight: 5,   attackCd: 1.0, knockResist: 0 },
  runner:  { kind: 'runner',  label: 'Sprinter',   hp: 36,   speed: 5.3, damage: 8,  radius: 0.4,  scale: 0.95, score: 15,   cost: 1.5, minWave: 2, weight: 3,   attackCd: 0.8, knockResist: 0 },
  spitter: { kind: 'spitter', label: 'Spitter',    hp: 50,   speed: 2.3, damage: 12, radius: 0.45, scale: 1.0,  score: 30,   cost: 3,   minWave: 3, weight: 1.6, attackCd: 2.6, knockResist: 0 },
  bloater: { kind: 'bloater', label: 'Bloater',    hp: 120,  speed: 2.0, damage: 35, radius: 0.85, scale: 1.45, score: 40,   cost: 3.5, minWave: 4, weight: 1.3, attackCd: 1.0, knockResist: 0.4 },
  brute:   { kind: 'brute',   label: 'Brute',      hp: 400,  speed: 1.9, damage: 28, radius: 0.85, scale: 1.8,  score: 70,   cost: 7,   minWave: 5, weight: 0.9, attackCd: 1.3, knockResist: 0.85 },
  boss:    { kind: 'boss',    label: 'ABOMINATION', hp: 3400, speed: 2.5, damage: 40, radius: 1.7,  scale: 3.4,  score: 1000, cost: 0,   minWave: 5, weight: 0,   attackCd: 3.0, knockResist: 0.97 },
}

export function buildWave(n: number): ZombieKind[] {
  const list: ZombieKind[] = []
  let budget = 6 + n * 3.2 + n * n * 0.25
  const pool = (Object.values(ZOMBIES) as ZombieDef[]).filter((z) => z.kind !== 'boss' && z.minWave <= n)
  let guard = 0
  while (budget > 0.9 && guard++ < 400) {
    const total = pool.reduce((s, z) => s + z.weight, 0)
    let r = Math.random() * total
    let chosen = pool[0]
    for (const z of pool) {
      r -= z.weight
      if (r <= 0) { chosen = z; break }
    }
    if (chosen.cost <= budget) {
      list.push(chosen.kind)
      budget -= chosen.cost
    } else if (guard > 60) break
  }
  shuffle(list)
  if (n % 5 === 0) list.unshift('boss')
  return list
}

/* ----------------------------------------------------------------------------
 * Perks
 * ------------------------------------------------------------------------- */
export interface PerkDef {
  id: string
  name: string
  desc: string
  icon: string
  max: number
}

export const PERKS: PerkDef[] = [
  { id: 'dmg',    name: 'Hollow Points',  desc: '+20% weapon damage',                 icon: '💥', max: 6 },
  { id: 'rate',   name: 'Overclock',      desc: '+15% fire rate',                     icon: '⚡', max: 5 },
  { id: 'mag',    name: 'Drum Mags',      desc: '+30% magazine size',                 icon: '🔋', max: 4 },
  { id: 'reload', name: 'Quick Hands',    desc: '-25% reload time',                   icon: '✋', max: 4 },
  { id: 'hp',     name: 'Kevlar Weave',   desc: '+30 max HP and heal 30',             icon: '🛡️', max: 5 },
  { id: 'speed',  name: 'Adrenaline',     desc: '+10% movement speed',                icon: '👟', max: 4 },
  { id: 'dash',   name: 'Phase Boots',    desc: '-30% dash cooldown',                 icon: '💨', max: 3 },
  { id: 'frag',   name: 'Grenadier',      desc: '+2 frags now, +25% blast radius',    icon: '💣', max: 4 },
  { id: 'crit',   name: 'Dead Eye',       desc: '+12% crit chance (crits deal x2.2)', icon: '🎯', max: 5 },
  { id: 'pierce', name: 'AP Rounds',      desc: 'Bullets pierce +1 enemy',            icon: '🔩', max: 3 },
  { id: 'regen',  name: 'Field Medic',    desc: 'Regenerate HP when out of combat',   icon: '✚',  max: 3 },
  { id: 'vamp',   name: 'Bloodlust',      desc: 'Heal 1.5 HP per kill',               icon: '🩸', max: 4 },
  { id: 'scav',   name: 'Scavenger',      desc: '+35% pickup drop rate',              icon: '📦', max: 4 },
  { id: 'knock',  name: 'Stopping Power', desc: '+40% knockback',                     icon: '🧱', max: 3 },
]

export const PERK_BY_ID: Record<string, PerkDef> = Object.fromEntries(PERKS.map((p) => [p.id, p]))
