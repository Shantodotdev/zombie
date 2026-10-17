import { WEAPONS, type WeaponDef } from './config'
import { rayCircle, rayCols } from './collision'
import { clamp, lerp } from './util'
import type { Barrel } from './world'
import type { Zombie } from './zombie'
import type { Game } from './game'

const DEG = Math.PI / 180

interface Hit {
  t: number
  z?: Zombie
  b?: Barrel
}

export interface ExplodeOpts {
  dmg: number
  playerDmg: number
  toxic?: boolean
  fromPlayer?: boolean
  knock?: number
}

export class Combat {
  constructor(private g: Game) {}

  fire() {
    const g = this.g
    const p = g.player
    const def = WEAPONS[p.weapon]
    const m = p.muzzlePos()
    const fx = Math.sin(p.angle)
    const fz = Math.cos(p.angle)

    switch (def.mode) {
      case 'flame': this.fireFlame(def, m, fx, fz); break
      case 'launcher': this.fireLauncher(def, m, fx, fz); break
      case 'arc': this.fireArc(def, m, fx, fz); break
      default: this.fireHit(def, m, fx, fz)
    }

    g.audio.shot(def.id)
    g.shake(def.shake)
    if (def.id === 'vectors') p.side ^= 1

    // ejected casings
    if (!def.noCasing) {
      g.effects.debris.emit({
        x: p.x + fx * 0.6, y: 1.3, z: p.z + fz * 0.6,
        vx: fz * 4 + (Math.random() - 0.5) * 2, vy: 4 + Math.random() * 2, vz: -fx * 4 + (Math.random() - 0.5) * 2,
        life: 0.8, size: def.id === 'shotgun' ? 0.12 : 0.07, grav: 24, bounce: true, color: def.id === 'shotgun' ? 0xd04a2a : 0xd8b23a,
      })
    } else if (def.id === 'railgun') {
      p.vx -= fx * 4
      p.vz -= fz * 4
    }
  }

  /* ------------------------------------------------------- bullets / beams */
  private fireHit(def: WeaponDef, m: { x: number; y: number; z: number }, fx: number, fz: number) {
    const g = this.g
    const p = g.player
    const moving = Math.hypot(p.vx, p.vz) > 1
    const heatMul = def.heatSpread ? 1 + p.heat * 0.9 : 1
    const spread = def.spread * heatMul * (moving ? 1.25 : 1)
    const isRail = def.id === 'railgun'
    for (let i = 0; i < def.pellets; i++) {
      const a = p.angle + (Math.random() + Math.random() - 1) * spread * DEG
      this.hitscan(m.x, m.z, Math.sin(a), Math.cos(a), def, isRail)
    }
    g.effects.muzzle(m.x, m.y, m.z, fx, fz, def.color, def.flash)
  }

  /* ---------------------------------------------------------------- flames */
  private fireFlame(def: WeaponDef, m: { x: number; y: number; z: number }, fx: number, fz: number) {
    const g = this.g
    const p = g.player
    const wallT = rayCols(m.x, m.z, fx, fz, def.range, g.world.colliders, true)
    const reach = Math.min(def.range, wallT)
    const dmg = def.damage * p.dmgMul

    for (const z of g.zombies) {
      if (!z.alive) continue
      const vx = z.x - m.x
      const vz = z.z - m.z
      const along = vx * fx + vz * fz
      if (along < -0.3 || along > reach + z.hitRadius) continue
      const perp = Math.abs(vx * fz - vz * fx)
      if (perp > 0.55 + Math.max(0, along) * 0.34 + z.hitRadius) continue
      g.damageZombie(z, dmg, { crit: false, dx: fx, dz: fz, knock: def.knock * p.knockMul, fire: true, noShield: true })
      z.ignite(3, 7 * p.dmgMul)
    }
    for (const b of g.world.barrels) {
      if (!b.alive) continue
      const vx = b.x - m.x
      const vz = b.z - m.z
      const along = vx * fx + vz * fz
      if (along < 0 || along > reach + 0.5) continue
      if (Math.abs(vx * fz - vz * fx) < 0.6 + along * 0.3) g.damageBarrel(b, dmg * 0.8)
    }

    // the visible stream
    const cols = [0xff6a1a, 0xff9a2a, 0xffc64a, 0xffe58a]
    for (let i = 0; i < 16; i++) {
      const sp = 13 + Math.random() * 11
      const side = (Math.random() - 0.5) * 5
      g.effects.glow.emit({
        x: m.x, y: m.y - 0.1, z: m.z,
        vx: fx * sp + -fz * side, vy: (Math.random() - 0.3) * 1.5, vz: fz * sp + fx * side,
        life: (0.28 + Math.random() * 0.24) * Math.min(1, reach / 9), size: 0.34 + Math.random() * 0.4, grav: -2,
        color: cols[i % cols.length], fade: true,
      })
    }
    if (Math.random() < 0.5) g.effects.smoke(m.x + fx * reach * 0.7, 1.0, m.z + fz * reach * 0.7, 1, 0x2a2a2e, 0.5, 0.45)
    g.effects.muzzle(m.x, m.y, m.z, fx, fz, 0xff8a2a, def.flash)
  }

  /* -------------------------------------------------------------- launcher */
  private fireLauncher(def: WeaponDef, m: { x: number; y: number; z: number }, fx: number, fz: number) {
    const g = this.g
    const p = g.player
    const a = p.angle + (Math.random() - 0.5) * def.spread * DEG
    g.projectiles.shell(m.x, m.z, Math.sin(a), Math.cos(a), def.damage * p.dmgMul, 4.6 * p.blastMul, def.range)
    g.effects.muzzle(m.x, m.y, m.z, fx, fz, def.color, def.flash)
    g.effects.smoke(m.x + fx * 0.3, 1.2, m.z + fz * 0.3, 5, 0x9a9aa0, 0.4, 0.5)
    p.vx -= fx * 3
    p.vz -= fz * 3
  }

  /* --------------------------------------------------------------- arc caster */
  private fireArc(def: WeaponDef, m: { x: number; y: number; z: number }, fx: number, fz: number) {
    const g = this.g
    const p = g.player
    const wallT = rayCols(m.x, m.z, fx, fz, def.range, g.world.colliders, true)
    const maxAlong = Math.min(def.range, wallT)

    // first target: best candidate near the aim line
    let first: Zombie | null = null
    let bestScore = Infinity
    for (const z of g.zombies) {
      if (!z.alive) continue
      const vx = z.x - m.x
      const vz = z.z - m.z
      const along = vx * fx + vz * fz
      if (along < 0.3 || along > maxAlong + z.hitRadius) continue
      const perp = Math.abs(vx * fz - vz * fx)
      if (perp > 1.0 + along * 0.2 + z.hitRadius) continue
      const score = along + perp * 2.5
      if (score < bestScore) {
        bestScore = score
        first = z
      }
    }

    g.effects.muzzle(m.x, m.y, m.z, fx, fz, def.color, def.flash)
    if (!first) {
      const len = Math.min(maxAlong, def.range * 0.8)
      g.effects.lightning(m.x, m.z, m.x + fx * len, m.z + fz * len)
      g.effects.sparks(m.x + fx * len, 1.2, m.z + fz * len, fx, fz, 4, 0xc8a8ff)
      return
    }

    const chain: Zombie[] = [first]
    let cur = first
    for (let hop = 0; hop < 4; hop++) {
      let nxt: Zombie | null = null
      let nd = 6.5
      for (const z of g.zombies) {
        if (!z.alive || chain.includes(z)) continue
        const d = Math.hypot(z.x - cur.x, z.z - cur.z)
        if (d < nd) {
          nd = d
          nxt = z
        }
      }
      if (!nxt) break
      chain.push(nxt)
      cur = nxt
    }

    let px = m.x
    let pz = m.z
    let dmg = def.damage * p.dmgMul
    for (let i = 0; i < chain.length; i++) {
      const z = chain[i]
      const crit = Math.random() < p.critChance
      const d = crit ? dmg * 2.2 : dmg
      const dx = z.x - px
      const dz = z.z - pz
      const l = Math.hypot(dx, dz) || 1
      g.effects.lightning(px, pz, z.x, z.z, i === 0 ? 1.3 : 1.0)
      g.effects.sparks(z.x, 1.0, z.z, dx / l, dz / l, 4, 0xc8a8ff)
      g.damageZombie(z, d, { crit, dx: dx / l, dz: dz / l, knock: def.knock * p.knockMul, fire: true, noShield: true })
      z.slowT = 0.9
      px = z.x
      pz = z.z
      dmg *= 0.8
    }
  }

  /** Where would a shot along this ray end? Used by the laser sight. */
  probe(ox: number, oz: number, dx: number, dz: number, range: number): { t: number; kind: 'zombie' | 'barrel' | 'wall' | 'none' } {
    const g = this.g
    const wallT = rayCols(ox, oz, dx, dz, range, g.world.colliders, true)
    let best = wallT
    let kind: 'zombie' | 'barrel' | 'wall' | 'none' = wallT < range ? 'wall' : 'none'
    for (const z of g.zombies) {
      if (!z.alive) continue
      const t = rayCircle(ox, oz, dx, dz, z.x, z.z, z.hitRadius)
      if (t < best) { best = t; kind = 'zombie' }
    }
    for (const b of g.world.barrels) {
      if (!b.alive) continue
      const t = rayCircle(ox, oz, dx, dz, b.x, b.z, 0.55)
      if (t < best) { best = t; kind = 'barrel' }
    }
    return { t: best, kind }
  }

  private hitscan(ox: number, oz: number, dx: number, dz: number, def: WeaponDef, isRail: boolean) {
    const g = this.g
    const p = g.player
    const wallT = rayCols(ox, oz, dx, dz, def.range, g.world.colliders, true)

    const hits: Hit[] = []
    for (const z of g.zombies) {
      if (!z.alive) continue
      const t = rayCircle(ox, oz, dx, dz, z.x, z.z, z.hitRadius)
      if (t < wallT) hits.push({ t, z })
    }
    for (const b of g.world.barrels) {
      if (!b.alive) continue
      const t = rayCircle(ox, oz, dx, dz, b.x, b.z, 0.55)
      if (t < wallT) hits.push({ t, b })
    }
    hits.sort((a, b) => a.t - b.t)

    let pierce = def.pierce + (isRail ? 0 : p.pierceBonus)
    let endT = wallT
    let stopped = false
    let n = 0
    for (const h of hits) {
      if (h.b) {
        g.damageBarrel(h.b, def.damage * p.dmgMul * 0.6)
        endT = h.t
        stopped = true
        break
      }
      const z = h.z!
      let dmg = def.damage * p.dmgMul
      if (def.id === 'shotgun') dmg *= lerp(1, 0.4, clamp(h.t / def.range, 0, 1))
      dmg *= Math.pow(0.85, n)
      const crit = Math.random() < p.critChance + (def.critBonus ?? 0)
      if (crit) {
        dmg *= 2.2
        g.audio.crit()
      }
      g.damageZombie(z, dmg, {
        crit, dx, dz, knock: (def.knock * p.knockMul) / Math.sqrt(def.pellets),
      })
      n++
      if (pierce-- <= 0) {
        endT = h.t
        stopped = true
        break
      }
    }

    const ex = ox + dx * endT
    const ez = oz + dz * endT
    if (isRail) {
      g.effects.beam(ox, 1.3, oz, ex, ez, 0xbaf9ff, 0.14, 0.28)
      g.effects.beam(ox, 1.3, oz, ex, ez, 0x2fb8ff, 0.5, 0.4)
      g.effects.sparks(ex, 1, ez, dx, dz, 12, 0x7ff3ff)
    } else {
      const shot = def.id === 'shotgun'
      g.effects.tracer(ox, 1.32, oz, ex, ez, def.tracer, shot ? 0.035 : 0.055, shot ? 150 : 200, shot ? 1.8 : 3)
    }
    if (!stopped && wallT < def.range) {
      g.effects.sparks(ex, 1.2, ez, dx, dz, 5, 0xffe2a0)
      g.effects.smoke(ex, 1.0, ez, 1, 0x8a8f99, 0.2, 0.25)
    }
  }

  throwGrenade() {
    const g = this.g
    const p = g.player
    const fx = Math.sin(p.angle)
    const fz = Math.cos(p.angle)
    g.projectiles.throwGrenade(p.x + fx * 0.6, p.z + fz * 0.6, g.aim.x, g.aim.z, p.blastMul)
    g.audio.throwGrenade()
  }

  explode(x: number, z: number, radius: number, o: ExplodeOpts) {
    const g = this.g
    g.effects.explosion(x, z, radius, !!o.toxic)
    g.audio.explosion(radius > 5.5 ? 1 : 0.8)
    g.shake(clamp(radius / 9, 0.4, 0.9))

    for (const zb of g.zombies) {
      if (!zb.alive) continue
      const dx = zb.x - x
      const dz = zb.z - z
      const d = Math.hypot(dx, dz)
      const reach = radius + zb.hitRadius * 0.6
      if (d > reach) continue
      const f = 1 - (d / reach) * 0.65
      const l = d || 1
      const ux = dx / l
      const uz = dz / l
      g.damageZombie(zb, o.dmg * f * (zb.isBoss ? 0.5 : 1), {
        crit: false, dx: ux, dz: uz, knock: (o.knock ?? 18) * f, blast: true,
      })
    }
    for (const b of g.world.barrels) {
      if (!b.alive) continue
      if (Math.hypot(b.x - x, b.z - z) < radius) g.damageBarrel(b, 999)
    }
    const p = g.player
    if (p.alive) {
      const d = Math.hypot(p.x - x, p.z - z)
      const reach = radius + 0.3
      if (d < reach && o.playerDmg > 0) {
        const f = 1 - (d / reach) * 0.7
        p.hurt(o.playerDmg * f, x, z, 14 * f, g)
      }
    }
  }
}
