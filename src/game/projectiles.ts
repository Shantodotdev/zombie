import * as THREE from 'three'
import { resolveCircle, contact } from './collision'
import { addBox, stdMat } from './voxel'
import { clamp, rand } from './util'
import type { Game } from './game'

interface Grenade {
  mesh: THREE.Group
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  fuse: number
  blast: number
  spin: number
  lightMat: THREE.MeshBasicMaterial
}

interface Acid {
  mesh: THREE.Mesh
  x0: number; z0: number; x1: number; z1: number
  t: number
  T: number
  dmg: number
}

interface Pool {
  mesh: THREE.Mesh
  x: number; z: number; r: number
  t: number
  life: number
  tick: number
  dmg: number
}

const G = 26

export class Projectiles {
  private grenades: Grenade[] = []
  private acids: Acid[] = []
  private pools: Pool[] = []
  private acidGeo = new THREE.IcosahedronGeometry(0.28, 0)
  private acidMat = new THREE.MeshBasicMaterial({ color: 0xb6ff3a, toneMapped: false })
  private poolMat = new THREE.MeshBasicMaterial({
    color: 0x7dff2a, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  })
  private poolGeo = new THREE.CircleGeometry(1, 28)

  constructor(private scene: THREE.Scene, private g: Game) {}

  throwGrenade(x: number, z: number, tx: number, tz: number, blastMul: number) {
    const dx = tx - x
    const dz = tz - z
    let dist = Math.hypot(dx, dz)
    const maxD = 20
    const k = dist > maxD ? maxD / dist : 1
    dist = Math.min(dist, maxD)
    const ux = dx / (dist / k || 1)
    const uz = dz / (dist / k || 1)
    const T = clamp(dist / 17, 0.4, 1.05)
    const y0 = 1.3
    const mesh = new THREE.Group()
    addBox(mesh, 0.3, 0.38, 0.3, stdMat(0x3f5a2e, { rough: 0.5, metal: 0.3 }), 0, 0, 0)
    addBox(mesh, 0.12, 0.1, 0.12, stdMat(0xc9c9c9, { metal: 0.6 }), 0, 0.24, 0)
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xff3a2a, toneMapped: false })
    addBox(mesh, 0.1, 0.08, 0.32, lightMat, 0, 0.1, 0, false)
    mesh.position.set(x, y0, z)
    this.scene.add(mesh)
    this.grenades.push({
      mesh, x, y: y0, z,
      vx: ux * (dist / T), vz: uz * (dist / T), vy: (0.2 - y0 + 0.5 * G * T * T) / T,
      fuse: 1.55, blast: blastMul, spin: rand(6, 10), lightMat,
    })
  }

  spit(x: number, z: number, tx: number, tz: number, dmgMul: number) {
    const dist = Math.hypot(tx - x, tz - z)
    const T = clamp(dist / 11, 0.55, 1.5)
    const m = new THREE.Mesh(this.acidGeo, this.acidMat)
    m.position.set(x, 1.4, z)
    this.scene.add(m)
    this.acids.push({ mesh: m, x0: x, z0: z, x1: tx, z1: tz, t: 0, T, dmg: 3 * dmgMul })
    this.g.audio.spit()
  }

  private makePool(x: number, z: number, r: number, dmg: number) {
    const m = new THREE.Mesh(this.poolGeo, this.poolMat.clone())
    m.rotation.x = -Math.PI / 2
    m.position.set(x, 0.1, z)
    m.scale.set(0.1, 0.1, 0.1)
    this.scene.add(m)
    this.pools.push({ mesh: m, x, z, r, t: 0, life: 4.2, tick: 0, dmg })
  }

  update(dt: number) {
    const g = this.g

    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const n = this.grenades[i]
      n.fuse -= dt
      n.vy -= G * dt
      n.x += n.vx * dt
      n.y += n.vy * dt
      n.z += n.vz * dt
      const p = { x: n.x, z: n.z }
      if (resolveCircle(p, 0.2, g.world.colliders)) {
        // bounce off props / walls
        const dot = n.vx * contact.nx + n.vz * contact.nz
        n.vx = (n.vx - 2 * dot * contact.nx) * 0.45
        n.vz = (n.vz - 2 * dot * contact.nz) * 0.45
        n.x = p.x
        n.z = p.z
        g.audio.bounce()
      }
      if (n.y < 0.22) {
        n.y = 0.22
        if (Math.abs(n.vy) > 2) g.audio.bounce()
        n.vy = Math.abs(n.vy) * 0.35
        if (n.vy < 1.2) n.vy = 0
        n.vx *= 0.7
        n.vz *= 0.7
      }
      n.mesh.position.set(n.x, n.y, n.z)
      n.mesh.rotation.x += n.spin * dt * (n.vy !== 0 ? 1 : 0.2)
      n.mesh.rotation.z += n.spin * 0.5 * dt
      // blink faster as the fuse runs down
      const blink = Math.sin(n.fuse * (n.fuse < 0.6 ? 40 : 14)) > 0
      n.lightMat.color.setHex(blink ? 0xff3a2a : 0x401008)
      if (n.fuse <= 0) {
        this.scene.remove(n.mesh)
        this.grenades.splice(i, 1)
        g.combat.explode(n.x, n.z, 6.2 * n.blast, { dmg: 190, playerDmg: 30, fromPlayer: true })
      }
    }

    for (let i = this.acids.length - 1; i >= 0; i--) {
      const a = this.acids[i]
      a.t += dt
      const k = Math.min(1, a.t / a.T)
      a.mesh.position.set(
        a.x0 + (a.x1 - a.x0) * k,
        1.4 + Math.sin(k * Math.PI) * 3.2 - k * 1.2,
        a.z0 + (a.z1 - a.z0) * k,
      )
      a.mesh.rotation.y += dt * 8
      if (k >= 1) {
        this.scene.remove(a.mesh)
        this.acids.splice(i, 1)
        this.makePool(a.x1, a.z1, 2.1, a.dmg)
        g.effects.glow.emit({ x: a.x1, y: 0.4, z: a.z1, life: 0.2, size: 1.2, grav: 0, color: 0xb6ff3a, fade: true })
        for (let j = 0; j < 8; j++) {
          g.effects.debris.emit({
            x: a.x1, y: 0.2, z: a.z1, vx: rand(-3, 3), vy: rand(2, 6), vz: rand(-3, 3),
            life: 0.6, size: 0.14, grav: 16, bounce: true, color: 0x8fe03a,
          })
        }
        g.audio.sizzle()
      }
    }

    for (let i = this.pools.length - 1; i >= 0; i--) {
      const p = this.pools[i]
      p.t += dt
      const grow = Math.min(1, p.t / 0.25)
      const fade = p.t > p.life - 0.8 ? Math.max(0, (p.life - p.t) / 0.8) : 1
      const s = p.r * grow
      p.mesh.scale.set(s, s, s)
      ;(p.mesh.material as THREE.MeshBasicMaterial).opacity = (0.32 + 0.12 * Math.sin(p.t * 7)) * fade
      p.tick -= dt
      if (p.tick <= 0) {
        p.tick = 0.3
        const d = Math.hypot(g.player.x - p.x, g.player.z - p.z)
        if (d < p.r * grow && g.player.alive) g.player.hurt(p.dmg, p.x, p.z, 0, g, true)
        if (Math.random() < 0.7) {
          g.effects.glow.emit({
            x: p.x + rand(-p.r, p.r) * 0.7, y: 0.1, z: p.z + rand(-p.r, p.r) * 0.7,
            vy: rand(0.5, 1.5), vx: 0, vz: 0, life: 0.6, size: 0.12, grav: -1, color: 0xa6ff4a, fade: true,
          })
        }
      }
      if (p.t >= p.life) {
        this.scene.remove(p.mesh)
        ;(p.mesh.material as THREE.Material).dispose()
        this.pools.splice(i, 1)
      }
    }
  }

  clear() {
    for (const n of this.grenades) this.scene.remove(n.mesh)
    for (const a of this.acids) this.scene.remove(a.mesh)
    for (const p of this.pools) {
      this.scene.remove(p.mesh)
      ;(p.mesh.material as THREE.Material).dispose()
    }
    this.grenades = []
    this.acids = []
    this.pools = []
  }
}
