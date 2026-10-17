import * as THREE from 'three'
import { rand, TAU } from './util'

interface Particle {
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  life: number; max: number
  size: number
  grav: number
  drag: number
  r: number; g: number; b: number
  bounce: boolean
  fade: boolean // multiply colour by remaining life (additive systems)
  rx: number; ry: number; sx: number; sy: number
}

const tmpColor = new THREE.Color()
const dummy = new THREE.Object3D()

/** Organic splat shape used for blood / scorch decals (tinted per instance). */
function makeSplatTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const blob = (x: number, y: number, rad: number, a: number) => {
    const grd = g.createRadialGradient(x, y, 0, x, y, rad)
    grd.addColorStop(0, `rgba(255,255,255,${a})`)
    grd.addColorStop(0.65, `rgba(255,255,255,${a * 0.85})`)
    grd.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = grd
    g.beginPath()
    g.arc(x, y, rad, 0, Math.PI * 2)
    g.fill()
  }
  for (let i = 0; i < 16; i++) {
    const a = rand(0, TAU)
    const r = rand(0, 30)
    blob(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, rand(12, 26), 0.95)
  }
  for (let i = 0; i < 22; i++) {
    const a = rand(0, TAU)
    const r = rand(34, 60)
    blob(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, rand(2, 6), 0.9)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

class ParticleSystem {
  mesh: THREE.InstancedMesh
  private list: Particle[] = []
  private pool: Particle[] = []

  constructor(public cap: number, material: THREE.Material) {
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, cap)
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    this.mesh.setColorAt(0, tmpColor.set(0xffffff))
    this.mesh.castShadow = false
    this.mesh.receiveShadow = false
  }

  emit(o: Partial<Particle> & { color: number }) {
    if (this.list.length >= this.cap) return
    const p = this.pool.pop() ?? ({} as Particle)
    tmpColor.set(o.color)
    p.x = o.x ?? 0; p.y = o.y ?? 0; p.z = o.z ?? 0
    p.vx = o.vx ?? 0; p.vy = o.vy ?? 0; p.vz = o.vz ?? 0
    p.max = p.life = o.life ?? 0.6
    p.size = o.size ?? 0.15
    p.grav = o.grav ?? 18
    p.drag = o.drag ?? 0
    p.r = tmpColor.r; p.g = tmpColor.g; p.b = tmpColor.b
    p.bounce = o.bounce ?? false
    p.fade = o.fade ?? false
    p.rx = rand(0, TAU); p.ry = rand(0, TAU)
    p.sx = rand(-8, 8); p.sy = rand(-8, 8)
    this.list.push(p)
  }

  update(dt: number) {
    const list = this.list
    let n = 0
    for (let i = 0; i < list.length; ) {
      const p = list[i]
      p.life -= dt
      if (p.life <= 0) {
        this.pool.push(p)
        list[i] = list[list.length - 1]
        list.pop()
        continue
      }
      p.vy -= p.grav * dt
      if (p.drag > 0) {
        const k = Math.exp(-p.drag * dt)
        p.vx *= k; p.vy *= k; p.vz *= k
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      const half = p.size * 0.5
      if (p.bounce && p.y < half) {
        p.y = half
        p.vy = Math.abs(p.vy) * 0.35
        if (p.vy < 0.8) p.vy = 0
        p.vx *= 0.7
        p.vz *= 0.7
        p.sx *= 0.5
        p.sy *= 0.5
      }
      const t = p.life / p.max
      const s = p.size * Math.min(1, t * 3)
      p.rx += p.sx * dt
      p.ry += p.sy * dt
      dummy.position.set(p.x, p.y, p.z)
      dummy.rotation.set(p.rx, p.ry, 0)
      dummy.scale.setScalar(s)
      dummy.updateMatrix()
      this.mesh.setMatrixAt(n, dummy.matrix)
      const f = p.fade ? Math.min(1, t * 2) : 1
      tmpColor.setRGB(p.r * f, p.g * f, p.b * f)
      this.mesh.setColorAt(n, tmpColor)
      n++
      i++
    }
    this.mesh.count = n
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }

  clear() {
    for (const p of this.list) this.pool.push(p)
    this.list.length = 0
    this.mesh.count = 0
  }
}

interface Tracer {
  mesh: THREE.Mesh
  active: boolean
  x0: number; z0: number; dx: number; dz: number
  dist: number
  t: number
  speed: number
  len: number
  y: number
  beam: boolean
  life: number
  max: number
  width: number
}

interface Ring { mesh: THREE.Mesh; active: boolean; t: number; dur: number; r0: number; r1: number }
interface Ball { mesh: THREE.Mesh; active: boolean; t: number; dur: number; r: number }
interface Num {
  el: HTMLDivElement
  active: boolean
  x: number; y: number; z: number
  t: number
  dur: number
  scale: number
}

export class Effects {
  debris: ParticleSystem
  glow: ParticleSystem
  private tracers: Tracer[] = []
  private rings: Ring[] = []
  private balls: Ball[] = []
  private nums: Num[] = []
  private decals: THREE.InstancedMesh
  private decalIdx = 0
  private decalCount = 0
  private readonly decalCap = 320
  muzzleLight: THREE.PointLight
  boomLight: THREE.PointLight
  private muzzleT = 0
  private boomT = 0
  private tmpV = new THREE.Vector3()

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.Camera,
    private numbersLayer: HTMLElement,
    private getSize: () => [number, number],
  ) {
    this.debris = new ParticleSystem(
      2600,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
    )
    this.debris.mesh.castShadow = true
    this.glow = new ParticleSystem(
      1400,
      new THREE.MeshBasicMaterial({
        color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false,
      }),
    )
    scene.add(this.debris.mesh, this.glow.mesh)

    // tracers
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({
          color: 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false,
        }),
      )
      m.visible = false
      m.frustumCulled = false
      scene.add(m)
      this.tracers.push({
        mesh: m, active: false, x0: 0, z0: 0, dx: 0, dz: 1, dist: 0, t: 0, speed: 0, len: 0, y: 1, beam: false,
        life: 0, max: 0, width: 0.06,
      })
    }

    // shockwave rings
    for (let i = 0; i < 14; i++) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1, 48),
        new THREE.MeshBasicMaterial({
          color: 0xffffff, transparent: true, side: THREE.DoubleSide, depthWrite: false,
          blending: THREE.AdditiveBlending, toneMapped: false,
        }),
      )
      m.rotation.x = -Math.PI / 2
      m.visible = false
      scene.add(m)
      this.rings.push({ mesh: m, active: false, t: 0, dur: 1, r0: 0, r1: 1 })
    }

    // fireballs
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          color: 0xffa040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
        }),
      )
      m.visible = false
      scene.add(m)
      this.balls.push({ mesh: m, active: false, t: 0, dur: 1, r: 1 })
    }

    // decals (blood / scorch)
    const dg = new THREE.PlaneGeometry(1, 1)
    dg.rotateX(-Math.PI / 2)
    this.decals = new THREE.InstancedMesh(
      dg,
      new THREE.MeshBasicMaterial({
        color: 0xffffff, map: makeSplatTexture(), transparent: true, opacity: 0.85, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }),
      this.decalCap,
    )
    this.decals.count = 0
    this.decals.frustumCulled = false
    this.decals.renderOrder = 1
    this.decals.setColorAt(0, tmpColor.set(0xffffff))
    scene.add(this.decals)

    // lights
    this.muzzleLight = new THREE.PointLight(0xffc070, 0, 16, 1.6)
    this.boomLight = new THREE.PointLight(0xff8a40, 0, 36, 1.4)
    scene.add(this.muzzleLight, this.boomLight)

    // damage numbers
    for (let i = 0; i < 48; i++) {
      const el = document.createElement('div')
      el.className = 'dmg'
      el.style.display = 'none'
      numbersLayer.appendChild(el)
      this.nums.push({ el, active: false, x: 0, y: 0, z: 0, t: 0, dur: 0.8, scale: 1 })
    }
  }

  /* ------------------------------------------------------------- spawners */
  muzzle(x: number, y: number, z: number, dirx: number, dirz: number, color: number, power = 1) {
    this.muzzleLight.position.set(x, y + 0.4, z)
    this.muzzleLight.color.set(color)
    this.muzzleLight.intensity = 60 * power
    this.muzzleT = 0.06
    for (let i = 0; i < 4; i++) {
      const sp = rand(3, 9) * power
      this.glow.emit({
        x, y, z,
        vx: dirx * sp + rand(-1.5, 1.5), vy: rand(-0.5, 1.5), vz: dirz * sp + rand(-1.5, 1.5),
        life: 0.1, size: rand(0.1, 0.22) * power, grav: 0, color, fade: true,
      })
    }
    this.glow.emit({ x, y, z, life: 0.05, size: 0.5 * power, grav: 0, color: 0xfff0c0, fade: true })
  }

  sparks(x: number, y: number, z: number, dirx: number, dirz: number, n: number, color = 0xffd27a) {
    for (let i = 0; i < n; i++) {
      const sp = rand(3, 10)
      this.glow.emit({
        x, y, z,
        vx: -dirx * sp * 0.5 + rand(-4, 4), vy: rand(1, 6), vz: -dirz * sp * 0.5 + rand(-4, 4),
        life: rand(0.15, 0.4), size: rand(0.05, 0.12), grav: 20, color, fade: true,
      })
    }
  }

  blood(x: number, y: number, z: number, dirx: number, dirz: number, n: number, color: number) {
    for (let i = 0; i < n; i++) {
      const sp = rand(2, 7)
      this.debris.emit({
        x, y, z,
        vx: dirx * sp + rand(-2, 2), vy: rand(1, 4.5), vz: dirz * sp + rand(-2, 2),
        life: rand(0.6, 1.1), size: rand(0.07, 0.17), grav: 16, bounce: true, color,
      })
    }
  }

  gibs(x: number, z: number, colors: number[], n: number, scale = 1, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU)
      const sp = rand(2, 7) * power
      this.debris.emit({
        x: x + rand(-0.2, 0.2), y: rand(0.4, 1.4) * scale, z: z + rand(-0.2, 0.2),
        vx: Math.cos(a) * sp, vy: rand(3, 9) * power, vz: Math.sin(a) * sp,
        life: rand(1.2, 2.4), size: rand(0.14, 0.34) * scale, grav: 20, bounce: true,
        color: colors[i % colors.length],
      })
    }
  }

  smoke(x: number, y: number, z: number, n: number, color = 0x555a66, spread = 1, size = 0.5) {
    for (let i = 0; i < n; i++) {
      this.debris.emit({
        x: x + rand(-0.4, 0.4) * spread, y, z: z + rand(-0.4, 0.4) * spread,
        vx: rand(-1.2, 1.2) * spread, vy: rand(0.8, 2.6), vz: rand(-1.2, 1.2) * spread,
        life: rand(0.5, 1.1), size: rand(size * 0.6, size * 1.3), grav: -1, drag: 1.4, color,
      })
    }
  }

  embers(x: number, z: number, radius: number, n: number, color = 0xffa040) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU)
      const r = rand(0, radius)
      this.glow.emit({
        x: x + Math.cos(a) * r, y: rand(0.1, 0.8), z: z + Math.sin(a) * r,
        vx: rand(-1, 1), vy: rand(1, 4), vz: rand(-1, 1),
        life: rand(0.5, 1.1), size: rand(0.06, 0.14), grav: -2, color, fade: true,
      })
    }
  }

  tracer(x0: number, y: number, z0: number, x1: number, z1: number, color: number, width = 0.06, speed = 170, len = 3) {
    const t = this.tracers.find((q) => !q.active)
    if (!t) return
    const dx = x1 - x0
    const dz = z1 - z0
    const dist = Math.hypot(dx, dz)
    if (dist < 0.01) return
    t.active = true
    t.beam = false
    t.x0 = x0; t.z0 = z0; t.dx = dx / dist; t.dz = dz / dist
    t.dist = dist; t.t = 0; t.speed = speed; t.len = len; t.y = y; t.width = width
    ;(t.mesh.material as THREE.MeshBasicMaterial).color.set(color)
    ;(t.mesh.material as THREE.MeshBasicMaterial).opacity = 1
    t.mesh.visible = true
  }

  beam(x0: number, y: number, z0: number, x1: number, z1: number, color: number, width = 0.2, life = 0.35) {
    const t = this.tracers.find((q) => !q.active)
    if (!t) return
    const dx = x1 - x0
    const dz = z1 - z0
    const dist = Math.hypot(dx, dz)
    if (dist < 0.01) return
    t.active = true
    t.beam = true
    t.x0 = x0; t.z0 = z0; t.dx = dx / dist; t.dz = dz / dist
    t.dist = dist; t.y = y; t.width = width; t.life = t.max = life
    ;(t.mesh.material as THREE.MeshBasicMaterial).color.set(color)
    t.mesh.visible = true
  }

  decal(x: number, z: number, size: number, color: number, rot = rand(0, TAU), sx = 1, sz = 1) {
    dummy.position.set(x, 0.045 + (this.decalIdx % 7) * 0.0006, z)
    dummy.rotation.set(0, rot, 0)
    dummy.scale.set(size * sx, 1, size * sz)
    dummy.updateMatrix()
    this.decals.setMatrixAt(this.decalIdx, dummy.matrix)
    this.decals.setColorAt(this.decalIdx, tmpColor.set(color))
    this.decalIdx = (this.decalIdx + 1) % this.decalCap
    this.decalCount = Math.min(this.decalCap, this.decalCount + 1)
    this.decals.count = this.decalCount
    this.decals.instanceMatrix.needsUpdate = true
    if (this.decals.instanceColor) this.decals.instanceColor.needsUpdate = true
  }

  clearDecals() {
    this.decalCount = 0
    this.decalIdx = 0
    this.decals.count = 0
  }

  ring(x: number, z: number, r0: number, r1: number, color: number, dur = 0.5, y = 0.12) {
    const r = this.rings.find((q) => !q.active)
    if (!r) return
    r.active = true
    r.t = 0
    r.dur = dur
    r.r0 = r0
    r.r1 = r1
    r.mesh.position.set(x, y, z)
    ;(r.mesh.material as THREE.MeshBasicMaterial).color.set(color)
    r.mesh.visible = true
  }

  fireball(x: number, y: number, z: number, radius: number, color = 0xffa040, dur = 0.45) {
    const b = this.balls.find((q) => !q.active)
    if (!b) return
    b.active = true
    b.t = 0
    b.dur = dur
    b.r = radius
    b.mesh.position.set(x, y, z)
    ;(b.mesh.material as THREE.MeshBasicMaterial).color.set(color)
    b.mesh.visible = true
  }

  explosion(x: number, z: number, radius: number, toxic = false) {
    const main = toxic ? 0x9bff4a : 0xffa040
    const core = toxic ? 0xe8ff9a : 0xffe6a0
    this.fireball(x, radius * 0.18, z, radius * 0.7, main, 0.5)
    this.fireball(x, radius * 0.2, z, radius * 0.4, core, 0.25)
    this.ring(x, z, radius * 0.2, radius * 1.05, main, 0.45)
    this.ring(x, z, radius * 0.1, radius * 0.7, core, 0.3)
    for (let i = 0; i < 46; i++) {
      const a = rand(0, TAU)
      const sp = rand(4, 16) * (radius / 5)
      this.glow.emit({
        x, y: rand(0.2, 1), z,
        vx: Math.cos(a) * sp, vy: rand(2, 12), vz: Math.sin(a) * sp,
        life: rand(0.4, 1.0), size: rand(0.1, 0.28), grav: 18, color: i % 3 ? main : core, fade: true,
      })
    }
    for (let i = 0; i < 26; i++) {
      const a = rand(0, TAU)
      const sp = rand(2, 9) * (radius / 5)
      this.debris.emit({
        x, y: rand(0.2, 1), z,
        vx: Math.cos(a) * sp, vy: rand(4, 13), vz: Math.sin(a) * sp,
        life: rand(0.9, 1.8), size: rand(0.15, 0.4), grav: 20, bounce: true,
        color: toxic ? 0x4a6b2a : i % 2 ? 0x3a3530 : 0x6a625a,
      })
    }
    this.smoke(x, 0.6, z, 14, toxic ? 0x6a8f3a : 0x2c2f38, radius * 0.5, 1.1)
    this.decal(x, z, radius * 1.1, toxic ? 0x1f2e12 : 0x0b0c10, rand(0, TAU))
    this.boomLight.position.set(x, 3, z)
    this.boomLight.color.set(main)
    this.boomLight.intensity = 400 * (radius / 5)
    this.boomT = 0.45
  }

  /** Floating damage number (DOM). */
  number(x: number, y: number, z: number, text: string, cls = '', scale = 1) {
    const n = this.nums.find((q) => !q.active)
    if (!n) return
    n.active = true
    n.x = x + rand(-0.3, 0.3)
    n.y = y
    n.z = z + rand(-0.3, 0.3)
    n.t = 0
    n.dur = cls.includes('crit') ? 1.0 : 0.75
    n.scale = scale
    n.el.textContent = text
    n.el.className = 'dmg ' + cls
    n.el.style.display = 'block'
  }

  /* --------------------------------------------------------------- update */
  update(dt: number) {
    this.debris.update(dt)
    this.glow.update(dt)

    if (this.muzzleT > 0) {
      this.muzzleT -= dt
      if (this.muzzleT <= 0) this.muzzleLight.intensity = 0
    }
    if (this.boomT > 0) {
      this.boomT -= dt
      this.boomLight.intensity *= Math.exp(-9 * dt)
      if (this.boomT <= 0) this.boomLight.intensity = 0
    }

    for (const t of this.tracers) {
      if (!t.active) continue
      let a: number
      let b: number
      let alpha = 1
      if (t.beam) {
        t.life -= dt
        if (t.life <= 0) {
          t.active = false
          t.mesh.visible = false
          continue
        }
        a = 0
        b = t.dist
        alpha = t.life / t.max
      } else {
        t.t += dt
        const head = Math.min(t.dist, t.t * t.speed)
        const tail = Math.max(0, head - t.len)
        if (tail >= t.dist - 0.01) {
          t.active = false
          t.mesh.visible = false
          continue
        }
        a = tail
        b = head
      }
      const len = Math.max(0.01, b - a)
      const mid = (a + b) / 2
      t.mesh.position.set(t.x0 + t.dx * mid, t.y, t.z0 + t.dz * mid)
      t.mesh.rotation.set(0, Math.atan2(t.dx, t.dz), 0)
      const w = t.beam ? t.width * (0.3 + 0.7 * alpha) : t.width
      t.mesh.scale.set(w, w, len)
      ;(t.mesh.material as THREE.MeshBasicMaterial).opacity = alpha
    }

    for (const r of this.rings) {
      if (!r.active) continue
      r.t += dt
      const k = r.t / r.dur
      if (k >= 1) {
        r.active = false
        r.mesh.visible = false
        continue
      }
      const e = 1 - Math.pow(1 - k, 3)
      const s = r.r0 + (r.r1 - r.r0) * e
      r.mesh.scale.set(s, s, s)
      ;(r.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - k
    }

    for (const b of this.balls) {
      if (!b.active) continue
      b.t += dt
      const k = b.t / b.dur
      if (k >= 1) {
        b.active = false
        b.mesh.visible = false
        continue
      }
      const e = 1 - Math.pow(1 - k, 3)
      const s = b.r * (0.3 + 0.7 * e)
      b.mesh.scale.set(s, s * 0.8, s)
      ;(b.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.9
    }

    // damage numbers
    const [w, h] = this.getSize()
    for (const n of this.nums) {
      if (!n.active) continue
      n.t += dt
      const k = n.t / n.dur
      if (k >= 1) {
        n.active = false
        n.el.style.display = 'none'
        continue
      }
      this.tmpV.set(n.x, n.y + n.t * 2.2, n.z).project(this.camera)
      const sx = (this.tmpV.x * 0.5 + 0.5) * w
      const sy = (-this.tmpV.y * 0.5 + 0.5) * h
      const pop = 1 + 0.6 * Math.max(0, 1 - n.t / 0.14)
      n.el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -50%) scale(${(pop * n.scale).toFixed(2)})`
      n.el.style.opacity = String(k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4)
    }
  }

  clearAll() {
    this.debris.clear()
    this.glow.clear()
    for (const t of this.tracers) { t.active = false; t.mesh.visible = false }
    for (const r of this.rings) { r.active = false; r.mesh.visible = false }
    for (const b of this.balls) { b.active = false; b.mesh.visible = false }
    for (const n of this.nums) { n.active = false; n.el.style.display = 'none' }
    this.muzzleLight.intensity = 0
    this.boomLight.intensity = 0
    this.clearDecals()
  }
}
