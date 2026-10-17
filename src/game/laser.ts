import * as THREE from 'three'
import { WEAPONS } from './config'
import type { Game } from './game'

interface Beam {
  core: THREE.Mesh
  glow: THREE.Mesh
}

const COLD = new THREE.Color(0xff2a2a)
const HOT = new THREE.Color(0xffe9a0)

/** Laser pointer: a beam from the muzzle to the first thing the shot would hit. */
export class Laser {
  enabled = true
  private beams: Beam[] = []
  private dot: THREE.Mesh
  private halo: THREE.Mesh
  private group = new THREE.Group()
  private coreMat = new THREE.MeshBasicMaterial({
    color: 0xff2a2a, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  })
  private glowMat = new THREE.MeshBasicMaterial({
    color: 0xff2a2a, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  })
  private dotMat = new THREE.MeshBasicMaterial({
    color: 0xff2a2a, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  })
  private haloMat = new THREE.MeshBasicMaterial({
    color: 0xff2a2a, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  })

  constructor(scene: THREE.Scene) {
    const box = new THREE.BoxGeometry(1, 1, 1)
    for (let i = 0; i < 2; i++) {
      const core = new THREE.Mesh(box, this.coreMat)
      const glow = new THREE.Mesh(box, this.glowMat)
      core.frustumCulled = glow.frustumCulled = false
      this.group.add(core, glow)
      this.beams.push({ core, glow })
    }
    this.dot = new THREE.Mesh(box, this.dotMat)
    this.halo = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), this.haloMat)
    this.dot.frustumCulled = this.halo.frustumCulled = false
    this.group.add(this.dot, this.halo)
    this.group.visible = false
    this.group.renderOrder = 5
    scene.add(this.group)
  }

  hide() {
    this.group.visible = false
  }

  update(g: Game, t: number) {
    const p = g.player
    if (!this.enabled || !p.alive || g.state !== 'playing') {
      this.group.visible = false
      return
    }
    const def = WEAPONS[p.weapon]
    const dx = Math.sin(p.angle)
    const dz = Math.cos(p.angle)
    const dual = def.id === 'vectors'
    const reloading = p.reloadT >= 0
    const range = Math.min(def.range, 46)

    this.group.visible = true
    let endX = 0
    let endZ = 0
    let endY = 1.3
    let hot = false

    for (let i = 0; i < this.beams.length; i++) {
      const b = this.beams[i]
      const on = dual || i === 0
      b.core.visible = b.glow.visible = on
      if (!on) continue
      // dual SMGs: one beam per gun
      const save = p.side
      p.side = i
      const m = dual ? p.muzzlePos() : p.muzzlePos()
      p.side = save
      const probe = g.combat.probe(m.x, m.z, dx, dz, range)
      const len = Math.max(0.05, probe.t)
      const mx = m.x + dx * len * 0.5
      const mz = m.z + dz * len * 0.5
      const yaw = Math.atan2(dx, dz)
      b.core.position.set(mx, m.y, mz)
      b.glow.position.set(mx, m.y, mz)
      b.core.rotation.set(0, yaw, 0)
      b.glow.rotation.set(0, yaw, 0)
      b.core.scale.set(0.035, 0.035, len)
      b.glow.scale.set(0.14, 0.14, len)
      if (i === 0 || (dual && i === 1)) {
        endX = m.x + dx * len
        endZ = m.z + dz * len
        endY = m.y
        hot = probe.kind === 'zombie' || probe.kind === 'barrel'
      }
    }

    // beam dims while reloading
    const alpha = reloading ? 0.3 : 1
    this.coreMat.opacity = 0.85 * alpha
    this.glowMat.opacity = 0.18 * alpha
    this.dotMat.opacity = alpha
    this.haloMat.opacity = 0.35 * alpha

    const color = hot ? HOT : COLD
    this.coreMat.color.copy(color)
    this.glowMat.color.copy(color)
    this.dotMat.color.copy(color)
    this.haloMat.color.copy(color)

    const pulse = 1 + Math.sin(t * 18) * 0.15
    const s = (hot ? 0.3 : 0.2) * pulse
    this.dot.position.set(endX, endY, endZ)
    this.dot.scale.set(s, s, s)
    this.dot.rotation.y = t * 3
    const h = (hot ? 0.75 : 0.5) * pulse
    this.halo.position.set(endX, endY, endZ)
    this.halo.scale.set(h, h, h)
  }
}
