import { shuffle } from './util'

/* ----------------------------------------------------------------------------
 * Weapons
 * ------------------------------------------------------------------------- */
export const MAX_LOADOUT = 5

export type WeaponId =
  | 'carbine' | 'shotgun' | 'vectors' | 'railgun'
  | 'flamer' | 'launcher' | 'minigun' | 'arc' | 'magnum'

export type WeaponMode = 'hit' | 'flame' | 'launcher' | 'arc'

export interface WeaponDef {
  id: WeaponId
  name: string
  sub: string
  desc: string
  tags: string[]
  mode: WeaponMode
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
  muzzle: number // forward offset of the muzzle from the operative
  shake: number
  flash: number
  noCasing?: boolean
  spinUp?: boolean
  slowOnFire?: number
  critBonus?: number
  heatSpread?: boolean
}

export const WEAPONS: WeaponDef[] = [
  {
    id: 'carbine', name: 'CARBINE', sub: 'Assault Rifle', mode: 'hit',
    desc: 'Reliable all-rounder with unlimited reserve ammo.', tags: ['AUTO', 'INFINITE AMMO'],
    damage: 24, interval: 0.095, mag: 30, reload: 1.55, spread: 2.2, pellets: 1,
    range: 44, reserve: Infinity, pierce: 0, knock: 1.4, tracer: 0xffd27a, color: 0xffd27a,
    muzzle: 1.25, shake: 0.035, flash: 1, heatSpread: true,
  },
  {
    id: 'shotgun', name: 'BREACHER', sub: 'Combat Shotty', mode: 'hit',
    desc: 'Devastating up close. Wide spread and huge knockback.', tags: ['SPREAD', 'KNOCKBACK'],
    damage: 13, interval: 0.78, mag: 8, reload: 2.2, spread: 12, pellets: 9,
    range: 19, reserve: 48, pierce: 0, knock: 4.2, tracer: 0xffb066, color: 0xff9a4a,
    muzzle: 1.35, shake: 0.24, flash: 1.7,
  },
  {
    id: 'vectors', name: 'VECTORS', sub: 'Dual SMGs', mode: 'hit',
    desc: 'Twin submachine guns with a ludicrous rate of fire.', tags: ['AUTO', 'HIGH ROF'],
    damage: 11, interval: 0.05, mag: 64, reload: 2.0, spread: 6.5, pellets: 1,
    range: 30, reserve: 256, pierce: 0, knock: 0.7, tracer: 0xa8e6ff, color: 0x8ad8ff,
    muzzle: 1.1, shake: 0.02, flash: 0.7, heatSpread: true,
  },
  {
    id: 'railgun', name: 'RAILGUN', sub: 'Pierce Beam', mode: 'hit',
    desc: 'A piercing beam that slices through entire lines of enemies.', tags: ['PIERCES ALL'],
    damage: 170, interval: 1.05, mag: 5, reload: 2.4, spread: 0, pellets: 1,
    range: 80, reserve: 25, pierce: 99, knock: 6, tracer: 0x7ff3ff, color: 0x6ff0ff,
    muzzle: 1.65, shake: 0.38, flash: 2, noCasing: true,
  },
  {
    id: 'flamer', name: 'INFERNO', sub: 'Flamethrower', mode: 'flame',
    desc: 'A roaring stream that ignites everything it touches. Fire spreads between zombies.', tags: ['BURNS', 'SPREADS FIRE'],
    damage: 6, interval: 0.055, mag: 120, reload: 2.4, spread: 0, pellets: 1,
    range: 9.5, reserve: 360, pierce: 99, knock: 0.5, tracer: 0xff8a2a, color: 0xff8a2a,
    muzzle: 1.45, shake: 0.02, flash: 0.6, noCasing: true,
  },
  {
    id: 'launcher', name: 'THUMPER', sub: 'Grenade Launcher', mode: 'launcher',
    desc: 'Explosive shells with a huge blast radius. Mind your own feet.', tags: ['EXPLOSIVE', 'AREA DAMAGE'],
    damage: 120, interval: 0.7, mag: 6, reload: 2.4, spread: 0.4, pellets: 1,
    range: 42, reserve: 30, pierce: 0, knock: 16, tracer: 0xb6ff3a, color: 0xb6ff3a,
    muzzle: 1.5, shake: 0.3, flash: 1.6, noCasing: true,
  },
  {
    id: 'minigun', name: 'HURRICANE', sub: 'Minigun', mode: 'hit',
    desc: 'Spins up to a devastating rate of fire. Slows you down while firing.', tags: ['SPIN-UP', 'HIGH ROF'],
    damage: 11, interval: 0.045, mag: 200, reload: 3.4, spread: 7, pellets: 1,
    range: 34, reserve: 600, pierce: 0, knock: 0.8, tracer: 0xffb35a, color: 0xffa040,
    muzzle: 1.55, shake: 0.05, flash: 1, spinUp: true, slowOnFire: 0.62, heatSpread: true,
  },
  {
    id: 'arc', name: 'STORM', sub: 'Arc Caster', mode: 'arc',
    desc: 'Chain lightning leaps between enemies, slows them and ignores riot shields.', tags: ['CHAINS', 'SLOWS', 'IGNORES SHIELDS'],
    damage: 26, interval: 0.16, mag: 45, reload: 1.9, spread: 0, pellets: 1,
    range: 20, reserve: 200, pierce: 0, knock: 1.5, tracer: 0xb48cff, color: 0xb48cff,
    muzzle: 1.3, shake: 0.03, flash: 1, noCasing: true,
  },
  {
    id: 'magnum', name: 'HAND CANNON', sub: 'Heavy Revolver', mode: 'hit',
    desc: 'Huge single shots that punch through two enemies. Crits often.', tags: ['PIERCES', 'CRIT BONUS'],
    damage: 105, interval: 0.52, mag: 6, reload: 1.8, spread: 0.7, pellets: 1,
    range: 50, reserve: 42, pierce: 1, knock: 8, tracer: 0xfff2c0, color: 0xffe08a,
    muzzle: 1.15, shake: 0.22, flash: 1.7, critBonus: 0.2,
  },
]

/* ----------------------------------------------------------------------------
 * Zombies
 * ------------------------------------------------------------------------- */
export type ZombieKind =
  | 'walker' | 'runner' | 'spitter' | 'bloater' | 'brute' | 'boss'
  | 'leaper' | 'riot' | 'screamer' | 'splitter' | 'crawler'

export interface ZombieDef {
  kind: ZombieKind
  label: string
  blurb: string
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
  walker:   { kind: 'walker',   label: 'Shambler',    blurb: '',                                       hp: 62,   speed: 2.8, damage: 10, radius: 0.45, scale: 1.0,  score: 10,   cost: 1,   minWave: 1, weight: 5,   attackCd: 1.0, knockResist: 0 },
  runner:   { kind: 'runner',   label: 'Sprinter',    blurb: 'Fast and fragile',                       hp: 36,   speed: 5.3, damage: 8,  radius: 0.4,  scale: 0.95, score: 15,   cost: 1.5, minWave: 2, weight: 3,   attackCd: 0.8, knockResist: 0 },
  spitter:  { kind: 'spitter',  label: 'Spitter',     blurb: 'Lobs acid from range',                   hp: 50,   speed: 2.3, damage: 12, radius: 0.45, scale: 1.0,  score: 30,   cost: 3,   minWave: 3, weight: 1.6, attackCd: 2.6, knockResist: 0 },
  leaper:   { kind: 'leaper',   label: 'Leaper',      blurb: 'Pounces from a distance',                hp: 55,   speed: 4.0, damage: 14, radius: 0.42, scale: 0.98, score: 25,   cost: 2.5, minWave: 4, weight: 1.5, attackCd: 0.9, knockResist: 0 },
  bloater:  { kind: 'bloater',  label: 'Bloater',     blurb: 'Explodes in a toxic cloud',              hp: 120,  speed: 2.0, damage: 35, radius: 0.85, scale: 1.45, score: 40,   cost: 3.5, minWave: 4, weight: 1.3, attackCd: 1.0, knockResist: 0.4 },
  brute:    { kind: 'brute',    label: 'Brute',       blurb: 'Slow, huge and hits hard',               hp: 400,  speed: 1.9, damage: 28, radius: 0.85, scale: 1.8,  score: 70,   cost: 7,   minWave: 5, weight: 0.9, attackCd: 1.3, knockResist: 0.85 },
  crawler:  { kind: 'crawler',  label: 'Crawler',     blurb: 'Low, fast swarmers',                     hp: 24,   speed: 4.6, damage: 7,  radius: 0.32, scale: 0.7,  score: 8,    cost: 0.8, minWave: 5, weight: 2.2, attackCd: 0.7, knockResist: 0 },
  riot:     { kind: 'riot',     label: 'Riot Guard',  blurb: 'Shield blocks frontal bullets - flank it', hp: 230, speed: 2.1, damage: 18, radius: 0.55, scale: 1.15, score: 55,   cost: 5,   minWave: 6, weight: 1.0, attackCd: 1.2, knockResist: 0.5 },
  screamer: { kind: 'screamer', label: 'Screamer',    blurb: 'Shrieks to enrage nearby zombies',       hp: 42,   speed: 2.6, damage: 6,  radius: 0.42, scale: 0.95, score: 45,   cost: 4,   minWave: 7, weight: 0.8, attackCd: 2.0, knockResist: 0 },
  splitter: { kind: 'splitter', label: 'Splitter',    blurb: 'Bursts into crawlers when killed',       hp: 170,  speed: 2.1, damage: 16, radius: 0.75, scale: 1.35, score: 50,   cost: 5,   minWave: 8, weight: 0.9, attackCd: 1.1, knockResist: 0.3 },
  boss:     { kind: 'boss',     label: 'ABOMINATION', blurb: '',                                       hp: 3400, speed: 2.5, damage: 40, radius: 1.7,  scale: 3.4,  score: 1000, cost: 0,   minWave: 5, weight: 0,   attackCd: 3.0, knockResist: 0.97 },
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
