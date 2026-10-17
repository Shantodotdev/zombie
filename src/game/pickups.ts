import * as THREE from 'three'
import { WEAPONS } from './config'
import { addBox, makeLightPool, stdMat } from './voxel'
import { rand } from './util'
import type { Game } from './game'

export type PickupKind = 'health' | 'ammo' | 'frag'

interface Pickup {
  kind: PickupKind
  group: THREE.Group
  item: THREE.Group
  x: number
  z: number
  t: number
  life: number
  magnet: boolean
  vx: number
  vz: number
  seed: number
}

const COLORS: Record<PickupKind, number> = { health: 0x4dff8a, ammo: 0xffc83a, frag: 0xff6a3a }

export class Pickups {
  list: Pickup[] = []
  constructor(private scene: THREE.Scene, private g: Game) {}

  spawn(kind: PickupKind, x: number, z: number) {
    const group = new THREE.Group()
    const item = new THREE.Group()
    group.add(item)
    if (kind === 'health') {
      addBox(item, 0.62, 0.62, 0.34, stdMat(0xf1f4f8, { rough: 0.4 }), 0, 0, 0)
      const cross = stdMat(0x25d96a, { emissive: 0x25d96a, ei: 1.2 })
      addBox(item, 0.4, 0.14, 0.4, cross, 0, 0, 0, false)
      addBox(item, 0.14, 0.4, 0.4, cross, 0, 0, 0, false)
    } else if (kind === 'ammo') {
      addBox(item, 0.62, 0.4, 0.46, stdMat(0x3a4a2e, { rough: 0.6 }), 0, 0, 0)
      const brass = stdMat(0xe8b53a, { emissive: 0xe8b53a, ei: 0.8, metal: 0.6 })
      for (const x of [-0.18, 0, 0.18]) addBox(item, 0.1, 0.34, 0.1, brass, x, 0.3, 0, false)
      addBox(item, 0.64, 0.08, 0.48, stdMat(0xe8b53a, { emissive: 0xe8b53a, ei: 0.6 }), 0, 0.1, 0, false)
    } else {
      addBox(item, 0.34, 0.42, 0.34, stdMat(0x4a6a34, { rough: 0.5, metal: 0.3 }), 0, 0, 0)
      addBox(item, 0.14, 0.12, 0.14, stdMat(0xd0d0d0, { metal: 0.7 }), 0, 0.27, 0)
      addBox(item, 0.36, 0.08, 0.36, stdMat(0xff5a2a, { emissive: 0xff5a2a, ei: 1.0 }), 0, 0.05, 0, false)
    }
    const pool = makeLightPool(COLORS[kind], 1.9, 0.7)
    pool.position.y = 0.08
    group.add(pool)
    group.position.set(x, 0, z)
    this.scene.add(group)
    this.list.push({ kind, group, item, x, z, t: 0, life: 24, magnet: false, vx: 0, vz: 0, seed: rand(0, 6) })
    // little pop-out
    this.list[this.list.length - 1].vx = rand(-2.5, 2.5)
    this.list[this.list.length - 1].vz = rand(-2.5, 2.5)
  }

  update(dt: number) {
    const p = this.g.player
    for (let i = this.list.length - 1; i >= 0; i--) {
      const k = this.list[i]
      k.t += dt
      k.life -= dt
      const dx = p.x - k.x
      const dz = p.z - k.z
      const d = Math.hypot(dx, dz)
      if (p.alive && d < 4.2 && k.t > 0.35) k.magnet = true
      if (k.magnet && p.alive) {
        const sp = 9 + (4.2 - Math.min(d, 4.2)) * 4
        k.vx += (dx / (d || 1)) * sp * dt * 8
        k.vz += (dz / (d || 1)) * sp * dt * 8
      }
      const damp = Math.exp(-(k.magnet ? 3 : 5) * dt)
      k.vx *= damp
      k.vz *= damp
      k.x += k.vx * dt
      k.z += k.vz * dt
      k.group.position.set(k.x, 0, k.z)
      k.item.position.y = 0.75 + Math.sin(k.t * 3.2 + k.seed) * 0.12
      k.item.rotation.y += dt * 2.2
      k.group.visible = k.life > 5 || Math.floor(k.life * 6) % 2 === 0

      if (p.alive && d < 1.0) {
        if (this.collect(k)) {
          this.scene.remove(k.group)
          this.list.splice(i, 1)
          continue
        }
      }
      if (k.life <= 0) {
        this.scene.remove(k.group)
        this.list.splice(i, 1)
      }
    }
  }

  private collect(k: Pickup): boolean {
    const g = this.g
    const p = g.player
    if (k.kind === 'health') {
      if (p.hp >= p.maxHp) return false
      const amt = Math.min(p.maxHp - p.hp, 28)
      p.heal(28)
      g.audio.heal()
      g.effects.number(p.x, 2.4, p.z, `+${Math.round(amt)} HP`, 'heal')
    } else if (k.kind === 'ammo') {
      let any = false
      for (let i = 1; i < WEAPONS.length; i++) {
        const w = WEAPONS[i]
        const cap = w.mag * 8
        const add = Math.ceil(w.mag * (1.2 + (i === 3 ? 0 : 0.4)) * (1 + 0.1 * p.perk('mag')))
        if (p.reserves[i] < cap) {
          p.reserves[i] = Math.min(cap, p.reserves[i] + add)
          any = true
        }
      }
      if (!any) return false
      g.audio.pickup()
      g.effects.number(p.x, 2.4, p.z, '+AMMO', 'ammo')
    } else {
      if (p.frags >= p.maxFrags) return false
      p.frags++
      g.audio.pickup()
      g.effects.number(p.x, 2.4, p.z, '+FRAG', 'ammo')
    }
    g.effects.glow.emit({ x: k.x, y: 0.8, z: k.z, life: 0.25, size: 1.2, grav: 0, color: COLORS[k.kind], fade: true })
    g.effects.ring(k.x, k.z, 0.3, 1.8, COLORS[k.kind], 0.35)
    return true
  }

  clear() {
    for (const k of this.list) this.scene.remove(k.group)
    this.list = []
  }
}
