import * as THREE from 'three'
import { WEAPONS } from './config'
import type { Game } from './game'

const COLD = new THREE.Color(0xff2a2a)
const HOT = new THREE.Color(0xffe9a0)

const SPACING = 0.85
const DOT_SIZE = 0.11
const MAX_DOTS = 130
const dummy = new THREE.Object3D()
const tmpColor = new THREE.Color()

/**
 * Dotted laser pointer: a marching line of dots from the muzzle to the first thing
 * the shot would hit, ending in a pulsing target dot.
 */
export class Laser {
  enabled = true
  private dots: THREE.InstancedMesh
  private end: THREE.Mesh
  private halo: THREE.Mesh
  private group = new THREE.Group()
  private dotMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  })
  private endMat = new THREE.MeshBasicMaterial({
    color: 0xff2a2a, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  })
  private haloMat = new THREE.MeshBasicMaterial({
    color: 0xff2a2a, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  })

  constructor(scene: THREE.Scene) {
    const box = new THREE.BoxGeometry(1, 1, 1)
    this.dots = new THREE.InstancedMesh(box, this.dotMat, MAX_DOTS)
    this.dots.count = 0
    this.dots.frustumCulled = false
    this.dots.setColorAt(0, tmpColor.set(0xffffff))
    this.end = new THREE.Mesh(box, this.endMat)
    this.halo = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), this.haloMat)
    this.end.frustumCulled = this.halo.frustumCulled = false
    this.group.add(this.dots, this.end, this.halo)
    this.group.visible = false
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
    const beams = dual ? 2 : 1

    this.group.visible = true
    let n = 0
    let endX = 0
    let endZ = 0
    let endY = 1.3
    let hot = false
    const march = (t * 5) % SPACING

    for (let i = 0; i < beams; i++) {
      const save = p.side
      p.side = i
      const m = p.muzzlePos()
      p.side = save
      const probe = g.combat.probe(m.x, m.z, dx, dz, range)
      const len = probe.t
      // marching dots; later dots fade out with distance
      for (let d = march; d < len - 0.15 && n < MAX_DOTS; d += SPACING) {
        const fade = 1 - Math.min(1, d / range) * 0.75
        dummy.position.set(m.x + dx * d, m.y, m.z + dz * d)
        dummy.rotation.set(0, Math.atan2(dx, dz), 0)
        const s = DOT_SIZE * (0.8 + 0.4 * fade)
        dummy.scale.set(s, s, s * 1.8)
        dummy.updateMatrix()
        this.dots.setMatrixAt(n, dummy.matrix)
        this.dots.setColorAt(n, tmpColor.setScalar(fade))
        n++
      }
      if (i === 0 || dual) {
        endX = m.x + dx * len
        endZ = m.z + dz * len
        endY = m.y
        hot = probe.kind === 'zombie' || probe.kind === 'barrel'
      }
    }
    this.dots.count = n
    this.dots.instanceMatrix.needsUpdate = true
    if (this.dots.instanceColor) this.dots.instanceColor.needsUpdate = true

    const alpha = reloading ? 0.3 : 1
    const color = hot ? HOT : COLD
    this.dotMat.color.copy(color)
    this.dotMat.opacity = 0.95 * alpha
    this.endMat.color.copy(color)
    this.endMat.opacity = alpha
    this.haloMat.color.copy(color)
    this.haloMat.opacity = 0.35 * alpha

    const pulse = 1 + Math.sin(t * 18) * 0.15
    const s = (hot ? 0.3 : 0.2) * pulse
    this.end.position.set(endX, endY, endZ)
    this.end.scale.set(s, s, s)
    this.end.rotation.y = t * 3
    const h = (hot ? 0.75 : 0.5) * pulse
    this.halo.position.set(endX, endY, endZ)
    this.halo.scale.set(h, h, h)
  }
}
