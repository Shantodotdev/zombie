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
    const moving = Math.hypot(p.vx, p.vz) > 1
    const heatMul = def.id === 'carbine' || def.id === 'vectors' ? 1 + p.heat * 0.9 : 1
    const spread = def.spread * heatMul * (moving ? 1.25 : 1)
    const isRail = def.id === 'railgun'

    for (let i = 0; i < def.pellets; i++) {
      const a = p.angle + (Math.random() + Math.random() - 1) * spread * DEG
      this.hitscan(m.x, m.z, Math.sin(a), Math.cos(a), def, isRail)
    }

    const fx = Math.sin(p.angle)
    const fz = Math.cos(p.angle)
    const power = def.id === 'shotgun' ? 1.7 : def.id === 'railgun' ? 2 : def.id === 'vectors' ? 0.7 : 1
    g.effects.muzzle(m.x, m.y, m.z, fx, fz, def.color, power)
    g.audio.shot(def.id)
    g.shake({ carbine: 0.035, shotgun: 0.24, vectors: 0.02, railgun: 0.38 }[def.id])
    if (def.id === 'vectors') p.side ^= 1

    // ejected casings
    if (def.id !== 'railgun') {
      g.effects.debris.emit({
        x: p.x + fx * 0.6, y: 1.3, z: p.z + fz * 0.6,
        vx: fz * 4 + (Math.random() - 0.5) * 2, vy: 4 + Math.random() * 2, vz: -fx * 4 + (Math.random() - 0.5) * 2,
        life: 0.8, size: def.id === 'shotgun' ? 0.12 : 0.07, grav: 24, bounce: true, color: def.id === 'shotgun' ? 0xd04a2a : 0xd8b23a,
      })
    } else {
      p.vx -= fx * 4
      p.vz -= fz * 4
    }
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
      const crit = Math.random() < p.critChance
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
