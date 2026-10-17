import * as THREE from 'three'
import { type Collider, boxCol, circleCol } from './collision'
import { NavGrid } from './nav'
import { addBox, addCyl, boxGeo, makeLightPool, newMat, stdMat } from './voxel'
import { chance, pick, rand } from './util'

export interface Barrel {
  x: number
  z: number
  hp: number
  alive: boolean
  collider: Collider
  group: THREE.Group
}

interface FadeBox {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  h: number
  mats: THREE.Material[]
  opacity: number
}

export interface SpawnPoint {
  x: number
  z: number
  jx: number
  jz: number
  gate: boolean
}

interface Item {
  x: number
  y: number
  z: number
  ry?: number
  sx?: number
  sy?: number
  sz?: number
}

function instanced(
  parent: THREE.Object3D,
  w: number, h: number, d: number,
  mat: THREE.Material,
  items: Item[],
  cast = false,
  colors?: number[],
): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(boxGeo(w, h, d), mat, Math.max(1, items.length))
  const o = new THREE.Object3D()
  const c = new THREE.Color()
  items.forEach((it, i) => {
    o.position.set(it.x, it.y, it.z)
    o.rotation.set(0, it.ry ?? 0, 0)
    o.scale.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1)
    o.updateMatrix()
    im.setMatrixAt(i, o.matrix)
    if (colors) im.setColorAt(i, c.setHex(colors[i % colors.length]))
  })
  im.count = items.length
  im.instanceMatrix.needsUpdate = true
  if (im.instanceColor) im.instanceColor.needsUpdate = true
  im.castShadow = cast
  im.frustumCulled = false
  parent.add(im)
  return im
}

const CAR_COLORS = [0xb83a3a, 0x35609e, 0xc9ced6, 0xd9a82a, 0x3f7a56, 0x3a3d46, 0x8a5a9a]

export class World {
  group = new THREE.Group()
  colliders: Collider[] = []
  barrels: Barrel[] = []
  nav = new NavGrid()
  spawnPoints: SpawnPoint[] = []
  lampLights: THREE.PointLight[] = []
  private fades: FadeBox[] = []
  private updaters: Array<(t: number, dt: number) => void> = []

  readonly bound = 42.2

  constructor(scene: THREE.Scene) {
    scene.add(this.group)
    this.buildGround()
    this.buildSkyline()
    this.buildWalls()
    this.buildQuadrants()
    this.buildIntersection()
    this.buildGates()
    this.buildLitter()
    this.nav.rebuild(this.colliders)

    // spawn points just outside the walls: 4 road gates + 8 alley mouths
    for (const s of [1, -1]) {
      this.spawnPoints.push({ x: 0, z: s * 50, jx: 4, jz: 2, gate: true })
      this.spawnPoints.push({ x: s * 50, z: 0, jx: 2, jz: 4, gate: true })
      for (const t of [1, -1]) {
        this.spawnPoints.push({ x: s * 22.5, z: t * 48, jx: 0.6, jz: 1.5, gate: false })
        this.spawnPoints.push({ x: t * 48, z: s * 22.5, jx: 1.5, jz: 0.6, gate: false })
      }
    }
  }

  /* ------------------------------------------------------------------ update */
  private camTmp = new THREE.Vector3()
  update(t: number, dt: number, cam: THREE.Vector3, px: number, pz: number) {
    for (const u of this.updaters) u(t, dt)
    // fade buildings that block the view of the player
    const probes: Array<[number, number]> = [[px, pz], [px + 3, pz - 3], [px - 3, pz + 3], [px - 3, pz - 3], [px + 3, pz + 3]]
    for (const f of this.fades) {
      let block = false
      for (const [qx, qz] of probes) {
        if (this.segHitsBox(cam, qx, 0.8, qz, f)) {
          block = true
          break
        }
      }
      const target = block ? 0.16 : 1
      const k = 1 - Math.exp(-9 * dt)
      const prev = f.opacity
      f.opacity += (target - f.opacity) * k
      if (Math.abs(f.opacity - prev) > 0.0005 || (f.opacity > 0.99) !== (prev > 0.99)) {
        const solid = f.opacity > 0.985
        for (const m of f.mats) {
          m.opacity = solid ? 1 : f.opacity
          m.transparent = !solid
          m.depthWrite = solid
        }
      }
    }
  }

  private segHitsBox(cam: THREE.Vector3, tx: number, ty: number, tz: number, f: FadeBox): boolean {
    const pad = 0.6
    const o = this.camTmp
    o.copy(cam)
    const dx = tx - o.x
    const dy = ty - o.y
    const dz = tz - o.z
    let t0 = 0
    let t1 = 1
    const slab = (oo: number, d: number, mn: number, mx: number) => {
      if (Math.abs(d) < 1e-9) return oo >= mn && oo <= mx
      let a = (mn - oo) / d
      let b = (mx - oo) / d
      if (a > b) { const s = a; a = b; b = s }
      t0 = Math.max(t0, a)
      t1 = Math.min(t1, b)
      return t0 <= t1
    }
    return (
      slab(o.x, dx, f.minX - pad, f.maxX + pad) &&
      slab(o.y, dy, 0, f.h + 0.5) &&
      slab(o.z, dz, f.minZ - pad, f.maxZ + pad)
    )
  }

  /** revive barrels for a new run */
  reset() {
    for (const b of this.barrels) {
      b.alive = true
      b.hp = 20
      b.collider.active = true
      if (!b.group.parent) this.group.add(b.group)
    }
    this.nav.rebuild(this.colliders)
  }

  destroyBarrel(b: Barrel) {
    b.alive = false
    b.collider.active = false
    this.group.remove(b.group)
    this.nav.rebuild(this.colliders)
  }

  /* ------------------------------------------------------------------ ground */
  private buildGround() {
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(420, 420),
      new THREE.MeshStandardMaterial({ color: 0x232a37, roughness: 0.95 }),
    )
    road.rotation.x = -Math.PI / 2
    road.receiveShadow = true
    this.group.add(road)

    // sidewalks (flat, slightly lifted so there is no z-fighting)
    const swMat = new THREE.MeshStandardMaterial({ color: 0x3f4a5c, roughness: 0.95 })
    for (const sx of [1, -1]) {
      for (const sz of [1, -1]) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), swMat)
        m.rotation.x = -Math.PI / 2
        m.position.set(sx * (6.6 + 60), 0.02, sz * (6.6 + 60))
        m.receiveShadow = true
        this.group.add(m)
      }
    }
    // curbs
    const curbMat = stdMat(0x6b7686)
    for (const s of [1, -1]) {
      for (const t of [1, -1]) {
        // curbs along the vertical road (x = ±6.4) and horizontal road (z = ±6.4)
        addBox(this.group, 0.35, 0.14, 120, curbMat, s * 6.45, 0.07, t * (6.6 + 60), false, true)
        addBox(this.group, 120, 0.14, 0.35, curbMat, t * (6.6 + 60), 0.07, s * 6.45, false, true)
      }
    }

    // lane markings
    const yellow = stdMat(0xe0b341, { rough: 0.7 })
    const white = stdMat(0xd9dde5, { rough: 0.7 })
    const dashes: Item[] = []
    const edges: Item[] = []
    for (let d = 9; d < 110; d += 4) {
      for (const s of [1, -1]) {
        dashes.push({ x: 0, y: 0.03, z: s * d, sx: 1, sz: 1 })
        dashes.push({ x: s * d, y: 0.03, z: 0, ry: Math.PI / 2 })
      }
    }
    instanced(this.group, 0.3, 0.02, 2.2, yellow, dashes)
    for (let d = 9; d < 110; d += 2) {
      for (const s of [1, -1]) {
        edges.push({ x: 5.2, y: 0.03, z: s * d })
        edges.push({ x: -5.2, y: 0.03, z: s * d })
        edges.push({ x: s * d, y: 0.03, z: 5.2, ry: Math.PI / 2 })
        edges.push({ x: s * d, y: 0.03, z: -5.2, ry: Math.PI / 2 })
      }
    }
    instanced(this.group, 0.14, 0.02, 1.6, white, edges)
    // crosswalks
    const cw: Item[] = []
    for (const s of [1, -1]) {
      for (let k = -4.5; k <= 4.6; k += 1.15) {
        cw.push({ x: k, y: 0.035, z: s * 8.2 })
        cw.push({ x: s * 8.2, y: 0.035, z: k, ry: Math.PI / 2 })
      }
    }
    instanced(this.group, 0.65, 0.02, 2.8, white, cw)
    // stop lines
    for (const s of [1, -1]) {
      addBox(this.group, 5.6, 0.02, 0.35, white, s * 2.9, 0.035, s * 10.4, false, false)
      addBox(this.group, 5.6, 0.02, 0.35, white, -s * 2.9, 0.035, -s * 10.4, false, false)
      addBox(this.group, 0.35, 0.02, 5.6, white, s * 10.4, 0.035, -s * 2.9, false, false)
      addBox(this.group, 0.35, 0.02, 5.6, white, -s * 10.4, 0.035, s * 2.9, false, false)
    }
    // manholes + patches
    const dark = stdMat(0x151a24, { rough: 1 })
    const patches: Item[] = []
    for (let i = 0; i < 40; i++) {
      const onX = chance(0.5)
      const a = rand(-5, 5)
      const b = rand(10, 50) * (chance(0.5) ? 1 : -1)
      patches.push({ x: onX ? b : a, y: 0.028, z: onX ? a : b, ry: rand(0, 3), sx: rand(0.8, 3), sz: rand(0.8, 2.5) })
    }
    instanced(this.group, 1, 0.012, 1, dark, patches)
    for (const [x, z] of [[-2, 14], [3, -22], [15, 2], [-28, -3], [2, 0]]) {
      addCyl(this.group, 0.6, 0.6, 0.03, 0x10141c, x, 0.03, z, 14, false)
    }
  }

  private buildSkyline() {
    // distant silhouettes: keeps the horizon from looking empty
    const mat = newMat(0xffffff, { rough: 1 })
    const items: Item[] = []
    const colors: number[] = []
    const winItems: Item[] = []
    for (let i = 0; i < 70; i++) {
      const side = Math.floor(rand(0, 4))
      const along = rand(-125, 125)
      const out = rand(66, 135)
      let x = side === 0 ? out : side === 1 ? -out : along
      let z = side === 2 ? out : side === 3 ? -out : along
      if (Math.abs(x) < 10 || Math.abs(z) < 10) continue
      const w = rand(10, 22)
      const d = rand(10, 22)
      const h = rand(9, 42)
      items.push({ x, y: h / 2, z, sx: w, sy: h, sz: d })
      colors.push(pick([0x131b2c, 0x18233a, 0x1b2438, 0x111827]))
      // a few lit windows on the camera-facing sides
      const nWin = Math.floor(rand(4, 14))
      for (let k = 0; k < nWin; k++) {
        winItems.push({
          x: x + rand(-w / 2 + 1, w / 2 - 1), y: rand(3, h - 1), z: z + d / 2 + 0.05,
          sx: 1, sy: 1, sz: 1,
        })
        winItems.push({
          x: x + w / 2 + 0.05, y: rand(3, h - 1), z: z + rand(-d / 2 + 1, d / 2 - 1),
          ry: Math.PI / 2,
        })
      }
    }
    instanced(this.group, 1, 1, 1, mat, items, false, colors)
    instanced(
      this.group, 1.1, 1.4, 0.1,
      new THREE.MeshBasicMaterial({ color: 0xffc46a, toneMapped: false, opacity: 0.8, transparent: true }),
      winItems,
    )
  }

  /* ------------------------------------------------------------------- walls */
  private buildWalls() {
    const gaps: Array<[number, number]> = [[-6.8, 6.8], [-24, -21], [21, 24]]
    const segs: Array<[number, number]> = []
    let cur = -62
    for (const [a, b] of gaps.slice().sort((p, q) => p[0] - q[0])) {
      if (a > cur) segs.push([cur, a])
      cur = b
    }
    segs.push([cur, 62])
    for (const [a, b] of segs) {
      const len = b - a
      const mid = (a + b) / 2
      for (const s of [1, -1]) {
        // wall along z at x = ±44 and along x at z = ±44
        for (const axis of ['x', 'z'] as const) {
          // each segment owns its materials so it can fade independently
          const wallMat = newMat(0x535c6a, { rough: 0.95 })
          const capMat = newMat(0x2e3541)
          const stripe = newMat(0xc9a227)
          const g = new THREE.Group()
          const horizontal = axis === 'x'
          g.position.set(horizontal ? mid : s * 44, 0, horizontal ? s * 44 : mid)
          this.group.add(g)
          const w = horizontal ? len : 1
          const d = horizontal ? 1 : len
          addBox(g, w, 2.3, d, wallMat, 0, 1.15, 0, true, true)
          addBox(g, horizontal ? len + 0.1 : 1.3, 0.25, horizontal ? 1.3 : len + 0.1, capMat, 0, 2.4, 0)
          addBox(g, horizontal ? len : 1.04, 0.3, horizontal ? 1.04 : len, stripe, 0, 0.5, 0, false)
          this.colliders.push(
            boxCol(g.position.x, g.position.z, w / 2 + 0.1, d / 2 + 0.1, true),
          )
          this.fades.push({
            minX: g.position.x - w / 2, maxX: g.position.x + w / 2,
            minZ: g.position.z - d / 2, maxZ: g.position.z + d / 2,
            h: 2.5, mats: [wallMat, capMat, stripe], opacity: 1,
          })
        }
      }
    }
    // dedupe fades sharing the same materials (cheap: they share arrays by reference)
  }

  /* --------------------------------------------------------------- buildings */
  private building(
    x: number, z: number, w: number, d: number, h: number,
    o: { wall: number; roof: number; trim: number; awning: number; lit: number },
  ) {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    this.group.add(g)
    const wallM = newMat(o.wall, { rough: 0.95 })
    const roofM = newMat(o.roof, { rough: 0.9 })
    const trimM = newMat(o.trim, { rough: 0.9 })
    const awnM = newMat(o.awning, { rough: 0.8 })
    const glassM = newMat(0x131c2b, { rough: 0.2, metal: 0.5 })
    const litM = newMat(0xffd48a, { emissive: 0xffb347, ei: 1.5, rough: 0.6 })
    const mats = [wallM, roofM, trimM, awnM, glassM, litM]

    addBox(g, w, h, d, wallM, 0, h / 2, 0, true, true)
    addBox(g, w + 0.6, 0.45, d + 0.6, roofM, 0, h + 0.22, 0, true, true)
    addBox(g, w + 0.05, 1.1, d + 0.05, trimM, 0, 0.55, 0, false)
    // door + awning on the camera-facing sides
    addBox(g, 2.2, 2.2, 0.16, glassM, rand(-w / 4, w / 4), 1.1, d / 2 + 0.06, false)
    addBox(g, 3.4, 0.22, 1.3, awnM, 0, 2.7, d / 2 + 0.6)
    addBox(g, 0.16, 2.2, 2.2, glassM, w / 2 + 0.06, 1.1, rand(-d / 4, d / 4), false)
    addBox(g, 1.3, 0.22, 3.4, awnM, w / 2 + 0.6, 2.7, 0)

    // windows (only camera-facing faces: +z and +x)
    const glass: Item[] = []
    const lit: Item[] = []
    const addWindows = (len: number, face: 'z' | 'x') => {
      const n = Math.max(1, Math.floor((len - 1.4) / 2.3))
      const start = -((n - 1) * 2.3) / 2
      for (let y = 3.6; y + 0.9 < h; y += 2.5) {
        for (let i = 0; i < n; i++) {
          const p = start + i * 2.3
          const it: Item =
            face === 'z'
              ? { x: p, y, z: d / 2 + 0.05 }
              : { x: w / 2 + 0.05, y, z: p, ry: Math.PI / 2 }
          ;(chance(o.lit) ? lit : glass).push(it)
        }
      }
      // storefront band
      const sf: Item =
        face === 'z'
          ? { x: 0, y: 1.25, z: d / 2 + 0.04, sx: (len - 4) / 1, sy: 1, sz: 1 }
          : { x: w / 2 + 0.04, y: 1.25, z: 0, ry: Math.PI / 2, sx: (len - 4) / 1, sy: 1, sz: 1 }
      glass.push(sf)
    }
    addWindows(w, 'z')
    addWindows(d, 'x')
    // unit-size boxes scaled per instance; storefront uses sx for width
    const gi = instanced(g, 1, 1.2, 0.12, glassM, glass)
    const li = instanced(g, 1, 1.2, 0.12, litM, lit)
    // windows are 1.0 wide by default; storefront scaled
    gi.frustumCulled = false
    li.frustumCulled = false

    // roof clutter
    const nProps = Math.floor(rand(2, 5))
    for (let i = 0; i < nProps; i++) {
      const px = rand(-w / 2 + 1.4, w / 2 - 1.4)
      const pz = rand(-d / 2 + 1.4, d / 2 - 1.4)
      const kind = Math.floor(rand(0, 3))
      if (kind === 0) addBox(g, rand(1.2, 2), 0.8, rand(1, 1.6), trimM, px, h + 0.85, pz)
      else if (kind === 1) addCyl(g, 0.8, 0.8, 1.7, trimM, px, h + 1.3, pz, 10)
      else {
        addBox(g, 0.1, 2.6, 0.1, trimM, px, h + 1.7, pz)
        addBox(g, 0.5, 0.06, 0.06, trimM, px, h + 2.6, pz)
      }
    }

    this.colliders.push(boxCol(x, z, w / 2, d / 2, true))
    this.fades.push({
      minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h: h + 0.5, mats, opacity: 1,
    })
  }

  /* ------------------------------------------------------------------- props */
  private car(
    x: number, z: number, rot: number, color: number,
    o: { police?: boolean; taxi?: boolean } = {},
  ) {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    g.rotation.y = rot
    g.rotation.z = rand(-0.025, 0.025)
    this.group.add(g)
    const body = newMat(o.police ? 0x1b1f29 : color, { rough: 0.55, metal: 0.25 })
    const glass = stdMat(0x0f1520, { rough: 0.15, metal: 0.6 })
    const dark = stdMat(0x15171d)
    addBox(g, 1.9, 0.55, 4.3, body, 0, 0.58, 0)
    addBox(g, 1.72, 0.55, 2.2, body, 0, 1.12, -0.25)
    addBox(g, 1.76, 0.38, 2.0, glass, 0, 1.14, -0.25)
    addBox(g, 1.5, 0.1, 1.7, body, 0, 1.45, -0.25)
    for (const wx of [-0.98, 0.98]) for (const wz of [-1.3, 1.35]) addBox(g, 0.3, 0.72, 0.72, dark, wx, 0.36, wz)
    addBox(g, 0.45, 0.18, 0.06, stdMat(0xfff2b0, { emissive: 0xffe9a0, ei: 1.2 }), -0.6, 0.72, 2.17, false)
    addBox(g, 0.45, 0.18, 0.06, stdMat(0xfff2b0, { emissive: 0xffe9a0, ei: 1.2 }), 0.6, 0.72, 2.17, false)
    addBox(g, 0.45, 0.18, 0.06, stdMat(0xa81818, { emissive: 0xff2020, ei: 0.6 }), -0.6, 0.72, -2.17, false)
    addBox(g, 0.45, 0.18, 0.06, stdMat(0xa81818, { emissive: 0xff2020, ei: 0.6 }), 0.6, 0.72, -2.17, false)
    if (o.police) {
      addBox(g, 1.94, 0.3, 2.2, stdMat(0xe8ecf2), 0, 0.62, 0.0)
      addBox(g, 1.94, 0.3, 0.9, stdMat(0xe8ecf2), 0, 0.62, 1.5)
      const red = newMat(0xff2222, { emissive: 0xff1111, ei: 2 })
      const blue = newMat(0x2255ff, { emissive: 0x1144ff, ei: 0.1 })
      addBox(g, 0.5, 0.16, 0.3, red, -0.28, 1.58, -0.25, false)
      addBox(g, 0.5, 0.16, 0.3, blue, 0.28, 1.58, -0.25, false)
      const pr = makeLightPool(0xff2a2a, 8, 0)
      const pb = makeLightPool(0x2a5aff, 8, 0)
      pr.position.set(x - Math.sin(rot) * 0, 0.07, z)
      pb.position.set(x, 0.07, z)
      this.group.add(pr, pb)
      const prm = pr.material as THREE.MeshBasicMaterial
      const pbm = pb.material as THREE.MeshBasicMaterial
      const ph = rand(0, 5)
      this.updaters.push((t) => {
        const on = Math.floor((t + ph) * 3.5) % 2 === 0
        red.emissiveIntensity = on ? 2.6 : 0.1
        blue.emissiveIntensity = on ? 0.1 : 2.6
        prm.opacity = on ? 0.45 : 0
        pbm.opacity = on ? 0 : 0.45
      })
    }
    if (o.taxi) addBox(g, 0.6, 0.2, 0.3, stdMat(0xfff2b0, { emissive: 0xffe08a, ei: 1.1 }), 0, 1.58, -0.25, false)
    for (const off of [-1.45, 0, 1.45]) {
      this.colliders.push(circleCol(x + Math.sin(rot) * off, z + Math.cos(rot) * off, 1.0))
    }
  }

  private bus(x: number, z: number, rot: number) {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    g.rotation.y = rot
    this.group.add(g)
    const body = stdMat(0xd8dde6, { rough: 0.5, metal: 0.2 })
    const blue = stdMat(0x2b5aa8)
    const glass = stdMat(0x0f1520, { rough: 0.15, metal: 0.6 })
    addBox(g, 2.7, 2.8, 11.2, body, 0, 1.75, 0)
    addBox(g, 2.74, 0.5, 11.25, blue, 0, 0.75, 0)
    addBox(g, 2.76, 0.9, 10.2, glass, 0, 2.2, -0.2)
    addBox(g, 2.4, 1.0, 0.12, glass, 0, 2.1, 5.62)
    for (const wx of [-1.36, 1.36]) for (const wz of [-3.6, 3.6]) addBox(g, 0.35, 1.0, 1.0, stdMat(0x15171d), wx, 0.5, wz)
    addBox(g, 1.2, 0.6, 1.4, stdMat(0x8a8f99), 0, 3.4, -1.5)
    for (const off of [-4.4, -2.6, -0.8, 1, 2.8, 4.6]) {
      this.colliders.push(circleCol(x + Math.sin(rot) * off, z + Math.cos(rot) * off, 1.45))
    }
  }

  private armyTruck(x: number, z: number, rot: number) {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    g.rotation.y = rot
    this.group.add(g)
    const olive = stdMat(0x56653f, { rough: 0.8 })
    const canvas = stdMat(0x6a7a4e, { rough: 0.95 })
    const dark = stdMat(0x15171d)
    addBox(g, 2.4, 0.5, 7.2, stdMat(0x3a432b), 0, 0.85, 0)
    addBox(g, 2.4, 1.5, 2.0, olive, 0, 1.75, 2.6)
    addBox(g, 2.44, 0.6, 1.5, stdMat(0x0f1520, { rough: 0.2, metal: 0.5 }), 0, 2.1, 2.9)
    addBox(g, 2.0, 0.5, 1.0, olive, 0, 1.15, 3.9)
    addBox(g, 2.5, 1.8, 4.4, canvas, 0, 2.2, -1.2)
    addBox(g, 2.1, 0.6, 4.2, canvas, 0, 3.3, -1.2)
    for (const wx of [-1.25, 1.25]) for (const wz of [-2.4, -0.4, 2.8]) addBox(g, 0.4, 1.0, 1.0, dark, wx, 0.5, wz)
    addBox(g, 0.7, 0.14, 0.14, stdMat(0xfff2b0, { emissive: 0xffe9a0, ei: 1 }), 0, 1.2, 4.42, false)
    for (const off of [-2.6, -1.0, 0.6, 2.2, 3.6]) {
      this.colliders.push(circleCol(x + Math.sin(rot) * off, z + Math.cos(rot) * off, 1.3))
    }
  }

  private container(x: number, z: number, axis: 'x' | 'z', color: number) {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    this.group.add(g)
    const L = 6.1
    const W = 2.5
    const H = 2.6
    const body = stdMat(color, { rough: 0.55, metal: 0.35 })
    const rib = stdMat(0x1b1d22, { rough: 0.9 })
    const ex = axis === 'x' ? L : W
    const ez = axis === 'x' ? W : L
    addBox(g, ex, H, ez, body, 0, H / 2 + 0.1, 0, true, true)
    // ribs along the long faces
    const ribs: Item[] = []
    for (let i = -2.8; i <= 2.8; i += 0.5) {
      for (const s of [1, -1]) {
        if (axis === 'x') ribs.push({ x: i, y: H / 2 + 0.1, z: s * (W / 2 + 0.03), sy: 1 })
        else ribs.push({ x: s * (W / 2 + 0.03), y: H / 2 + 0.1, z: i })
      }
    }
    instanced(g, axis === 'x' ? 0.12 : 0.12, H - 0.3, axis === 'x' ? 0.1 : 0.12, rib, ribs)
    // ends
    addBox(g, axis === 'x' ? 0.12 : W, H - 0.2, axis === 'x' ? W : 0.12, rib, axis === 'x' ? L / 2 + 0.03 : 0, H / 2 + 0.1, axis === 'x' ? 0 : L / 2 + 0.03, false)
    this.colliders.push(boxCol(x, z, ex / 2, ez / 2, true))
  }

  private barrel(x: number, z: number, hazard = true) {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    this.group.add(g)
    const red = newMat(hazard ? 0xc43a2b : 0x39598a, { rough: 0.5, metal: 0.3, emissive: 0xff3b1f, ei: 0.0 })
    addCyl(g, 0.42, 0.42, 1.05, red, 0, 0.55, 0, 12)
    addCyl(g, 0.435, 0.435, 0.12, stdMat(0xe3b02a), 0, 0.85, 0, 12, false)
    addCyl(g, 0.435, 0.435, 0.12, stdMat(0xe3b02a), 0, 0.28, 0, 12, false)
    addCyl(g, 0.34, 0.34, 0.05, stdMat(0x2a2d34), 0, 1.1, 0, 12, false)
    if (hazard) addBox(g, 0.22, 0.22, 0.04, stdMat(0xe3b02a, { emissive: 0xffaa00, ei: 0.3 }), 0, 0.56, 0.42, false)
    const col = circleCol(x, z, 0.5)
    const b: Barrel = { x, z, hp: 20, alive: true, collider: col, group: g }
    col.tag = b
    this.colliders.push(col)
    this.barrels.push(b)
  }

  private lamp(x: number, z: number, faceRot: number, real: boolean) {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    g.rotation.y = faceRot
    this.group.add(g)
    const steel = stdMat(0x2b3240, { rough: 0.5, metal: 0.6 })
    addBox(g, 0.28, 0.3, 0.28, steel, 0, 0.15, 0)
    addBox(g, 0.16, 6.4, 0.16, steel, 0, 3.2, 0)
    addBox(g, 0.12, 0.12, 1.9, steel, 0, 6.35, 0.85)
    addBox(g, 0.5, 0.14, 0.6, stdMat(0xfff0c8, { emissive: 0xffd89a, ei: 2.4 }), 0, 6.25, 1.65, false)
    const pool = makeLightPool(0xffd9a0, 8.5, 0.34)
    pool.position.set(x + Math.sin(faceRot) * 1.65, 0.06, z + Math.cos(faceRot) * 1.65)
    this.group.add(pool)
    if (real) {
      const l = new THREE.PointLight(0xffcf8a, 70, 22, 1.7)
      l.position.set(x + Math.sin(faceRot) * 1.65, 5.8, z + Math.cos(faceRot) * 1.65)
      this.group.add(l)
      this.lampLights.push(l)
    }
    this.colliders.push(circleCol(x, z, 0.28, false))
  }

  private barrier(x: number, z: number, axis: 'x' | 'z') {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    this.group.add(g)
    const L = 3.2
    const ex = axis === 'x' ? L : 0.75
    const ez = axis === 'x' ? 0.75 : L
    addBox(g, ex, 0.95, ez, stdMat(0x8a919e, { rough: 0.95 }), 0, 0.48, 0, true, true)
    addBox(g, axis === 'x' ? L : 0.45, 0.4, axis === 'x' ? 0.45 : L, stdMat(0x8a919e), 0, 1.05, 0)
    const sx = axis === 'x' ? 0.5 : 0.78
    const sz = axis === 'x' ? 0.78 : 0.5
    for (const i of [-1, 0, 1]) {
      addBox(g, sx, 0.2, sz, stdMat(0xd8a21c), axis === 'x' ? i * 0.9 : 0, 0.55, axis === 'x' ? 0 : i * 0.9, false)
    }
    this.colliders.push(boxCol(x, z, ex / 2, ez / 2, false))
  }

  private crates(x: number, z: number, n = 2) {
    const wood = stdMat(0x8b6a3e, { rough: 0.9 })
    const band = stdMat(0x5e4527)
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    this.group.add(g)
    for (let i = 0; i < n; i++) {
      const ox = i * 1.15 - (n - 1) * 0.55
      addBox(g, 1.1, 1.1, 1.1, wood, ox, 0.55, rand(-0.1, 0.1), true, true)
      addBox(g, 1.14, 0.12, 1.14, band, ox, 0.55, 0, false)
    }
    if (n > 1) addBox(g, 1.0, 1.0, 1.0, wood, 0, 1.6, 0)
    this.colliders.push(boxCol(x, z, n * 0.6 + 0.1, 0.65, false))
  }

  private dumpster(x: number, z: number, axis: 'x' | 'z') {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    this.group.add(g)
    const ex = axis === 'x' ? 2.2 : 1.2
    const ez = axis === 'x' ? 1.2 : 2.2
    addBox(g, ex, 1.25, ez, stdMat(0x2f6b4a, { rough: 0.6, metal: 0.3 }), 0, 0.85, 0, true, true)
    addBox(g, ex + 0.1, 0.12, ez + 0.1, stdMat(0x1e3d2c), 0, 1.5, 0)
    addBox(g, 0.3, 0.3, 0.3, stdMat(0x15171d), axis === 'x' ? 0.8 : 0.4, 0.15, axis === 'x' ? 0.4 : 0.8, false)
    this.colliders.push(boxCol(x, z, ex / 2, ez / 2, false))
  }

  private sandbags(x: number, z: number, axis: 'x' | 'z', len = 4) {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    this.group.add(g)
    const bag = stdMat(0x9c8a63, { rough: 1 })
    const bag2 = stdMat(0x86764f, { rough: 1 })
    const n = Math.floor(len / 0.8)
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < n - (row % 2); i++) {
        const p = (i - (n - 1) / 2) * 0.8 + (row % 2) * 0.4
        const b = addBox(g, axis === 'x' ? 0.78 : 0.7, 0.36, axis === 'x' ? 0.7 : 0.78, row % 2 ? bag : bag2, axis === 'x' ? p : 0, 0.2 + row * 0.36, axis === 'x' ? 0 : p, true, true)
        b.rotation.y = rand(-0.06, 0.06)
      }
    }
    this.colliders.push(boxCol(x, z, axis === 'x' ? len / 2 : 0.45, axis === 'x' ? 0.45 : len / 2, false))
  }

  private tree(x: number, z: number) {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    this.group.add(g)
    addBox(g, 0.45, 2.4, 0.45, stdMat(0x5a4330), 0, 1.2, 0)
    const leaf = [0x35553a, 0x2f4b34, 0x3d5e3c]
    addBox(g, 2.6, 1.3, 2.6, stdMat(pick(leaf), { rough: 1 }), 0, 3.0, 0)
    addBox(g, 1.9, 1.1, 1.9, stdMat(pick(leaf), { rough: 1 }), 0.1, 4.0, -0.1)
    addBox(g, 1.1, 0.9, 1.1, stdMat(pick(leaf), { rough: 1 }), -0.1, 4.8, 0.1)
    // planter
    addBox(g, 1.5, 0.25, 1.5, stdMat(0x6a6f78), 0, 0.12, 0, false, true)
    this.colliders.push(circleCol(x, z, 0.55))
  }

  private cone(x: number, z: number) {
    const g = new THREE.Group()
    g.position.set(x, 0, z)
    g.rotation.y = rand(0, 6)
    this.group.add(g)
    addBox(g, 0.4, 0.06, 0.4, stdMat(0x1c1f26), 0, 0.03, 0, false)
    addBox(g, 0.26, 0.5, 0.26, stdMat(0xff7a1a), 0, 0.31, 0, true)
    addBox(g, 0.28, 0.1, 0.28, stdMat(0xeeeeee), 0, 0.32, 0, false)
  }

  private fire(x: number, z: number) {
    this.barrel(x, z, false)
    const g = new THREE.Group()
    g.position.set(x, 1.1, z)
    this.group.add(g)
    const fm = new THREE.MeshBasicMaterial({ color: 0xff8a2a, toneMapped: false })
    const fm2 = new THREE.MeshBasicMaterial({ color: 0xffd84a, toneMapped: false })
    const flames = [
      addBox(g, 0.28, 0.5, 0.28, fm, 0.1, 0.2, 0, false),
      addBox(g, 0.22, 0.4, 0.22, fm2, -0.1, 0.15, 0.05, false),
      addBox(g, 0.2, 0.55, 0.2, fm, 0, 0.3, -0.1, false),
    ]
    const pool = makeLightPool(0xff7a2a, 7, 0.4)
    pool.position.set(x, 0.07, z)
    this.group.add(pool)
    const light = new THREE.PointLight(0xff8a3a, 22, 14, 1.8)
    light.position.set(x, 2, z)
    this.group.add(light)
    const pm = pool.material as THREE.MeshBasicMaterial
    const ph = rand(0, 10)
    this.updaters.push((t) => {
      for (let i = 0; i < flames.length; i++) {
        const s = 0.7 + 0.5 * Math.abs(Math.sin(t * (9 + i * 2.7) + ph + i))
        flames[i].scale.set(1, s, 1)
        flames[i].position.y = 0.12 + s * 0.22
      }
      const fl = 0.8 + 0.2 * Math.sin(t * 17 + ph) * Math.sin(t * 7.3)
      light.intensity = 22 * fl
      pm.opacity = 0.4 * fl
    })
  }

  /* ----------------------------------------------------------------- layout */
  private buildQuadrants() {
    const wallCols = [0x8793a5, 0x9a8a80, 0x728aa0, 0x84997e]
    const roofCols = [0x5a6579, 0x6a5a52, 0x506774, 0x5a6a50]
    const awn = [0xa83a3a, 0x2f6ea8, 0x3a8a5a, 0xb88a2a]
    const heights = [[8, 5.5, 6.2], [7, 6, 5.2], [9, 5, 6.5], [6.5, 5.6, 7]]
    let qi = 0
    for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const) {
      const wc = wallCols[qi]
      const common = { wall: wc, roof: roofCols[qi], trim: wc - 0x1c1c1c, awning: awn[qi], lit: 0.35 }
      this.building(sx * 33, sz * 33, 18, 18, heights[qi][0], common)
      this.building(sx * 15, sz * 36, 12, 10, heights[qi][1], { ...common, awning: awn[(qi + 1) % 4] })
      this.building(sx * 36, sz * 15, 10, 12, heights[qi][2], { ...common, awning: awn[(qi + 2) % 4] })

      const P = (u: number, v: number): [number, number] => [sx * u, sz * v]
      const R = (rot: number) => Math.atan2(sx * Math.sin(rot), sz * Math.cos(rot))
      const car = (u: number, v: number, rot: number, color = pick(CAR_COLORS), o = {}) => {
        const [x, z] = P(u, v)
        this.car(x, z, R(rot), color, o)
      }
      const at = <A extends unknown[]>(fn: (x: number, z: number, ...a: A) => void, u: number, v: number, ...a: A) => {
        const [x, z] = P(u, v)
        fn.call(this, x, z, ...a)
      }

      if (qi === 0) {
        // parking lot + containers
        car(12, 14, 0.15, 0xb83a3a)
        car(12.5, 20.5, 3.3, 0x35609e)
        car(18.5, 27, 1.6, 0xc9ced6)
        car(20, 12, 4.4, 0x3a3d46)
        at(this.container, 27.5, 15, 'x', 0xc9902a)
        at(this.container, 27.5, 18.4, 'x', 0x3a6fa8)
        at(this.barrel, 14.5, 8.8)
        at(this.barrel, 15.5, 9.8)
        at(this.barrel, 16.4, 8.6)
        at(this.cone, 22, 9)
        at(this.cone, 23, 10)
        at(this.lamp, 8.4, 24, R(-Math.PI / 2), false)
        at(this.crates, 24, 27.5, 2)
      } else if (qi === 1) {
        // military checkpoint
        const [tx, tz] = P(15, 20)
        this.armyTruck(tx, tz, R(Math.PI / 2 + 0.1))
        at(this.sandbags, 11, 27.5, 'x', 5)
        at(this.sandbags, 22.5, 14, 'z', 5)
        at(this.barrier, 10, 11, 'x')
        at(this.barrier, 14, 11, 'x')
        at(this.barrel, 19.5, 9.5)
        at(this.barrel, 20.5, 10.4)
        at(this.crates, 26.5, 27.5, 3)
        at(this.lamp, 8.4, 20, R(-Math.PI / 2), true)
        at(this.fire, 23.5, 22.5)
      } else if (qi === 2) {
        // park
        at(this.tree, 12, 12)
        at(this.tree, 19, 22)
        at(this.tree, 14.5, 27)
        at(this.tree, 23, 11)
        at(this.dumpster, 9.8, 22, 'z')
        at(this.dumpster, 27, 26.5, 'x')
        at(this.crates, 17, 16, 2)
        at(this.barrel, 22, 17)
        at(this.barrel, 23, 17.8)
        at(this.lamp, 8.4, 14, R(-Math.PI / 2), false)
        car(26, 12.5, 1.57, 0xd9a82a, { taxi: true })
      } else {
        // police blockade
        car(12.5, 16, 1.9, 0xffffff, { police: true })
        car(14, 24.5, 4.2, 0xffffff, { police: true })
        at(this.barrier, 21, 11, 'x')
        at(this.barrier, 25, 11, 'x')
        at(this.barrel, 9.8, 28.5)
        at(this.barrel, 10.8, 28.5)
        at(this.barrel, 10.3, 29.4)
        at(this.barrel, 20, 19)
        at(this.sandbags, 23.5, 25.2, 'x', 3.2)
        at(this.lamp, 8.4, 26, R(-Math.PI / 2), false)
      }
      qi++
    }
  }

  private buildIntersection() {
    // streetlights at the four corners (3 carry real lights)
    const corners: Array<[number, number, number, boolean]> = [
      [7.4, 7.4, Math.PI * 1.25, true],
      [-7.4, 7.4, Math.PI * 0.75, false],
      [-7.4, -7.4, Math.PI * 0.25, true],
      [7.4, -7.4, Math.PI * 1.75, false],
    ]
    for (const [x, z, r, real] of corners) this.lamp(x, z, r, real)
    this.car(4.6, 3.8, 0.6, 0xd9a82a, { taxi: true })
    this.car(-5, -3, 2.6, 0x3f7a56)
    this.barrel(-3, 5.2)
    this.barrel(-2.1, 5.7)
    // road lamps (pool-only)
    for (const d of [26, -26]) {
      this.lamp(7, d, -Math.PI / 2, false)
      this.lamp(-7, -d, Math.PI / 2, false)
      this.lamp(d, 7, Math.PI, false)
      this.lamp(-d, -7, 0, false)
    }
  }

  private buildGates() {
    // improvised blockades in the four road gates; zombies funnel around them
    this.bus(1.5, -29, 0.1)
    this.car(-3.5, 34, 0.3, 0x35609e)
    this.car(3, 37.5, 3.4, 0xb83a3a)
    this.car(30, -3, Math.PI / 2 + 0.2, 0x8a5a9a)
    this.car(35, 3.5, Math.PI / 2 - 0.4, 0xc9ced6)
    this.armyTruck(-30, 1.5, Math.PI / 2 + 0.08)
    this.barrier(-36, -3.5, 'z')
    this.barrier(-36, 5, 'z')
    this.barrier(-4.5, -37, 'x')
    this.barrier(0, -38.5, 'x')
    this.barrel(5, -37)
    this.barrel(5.9, -36.2)
    this.cone(-1.5, 22)
    this.cone(-0.5, 24)
    this.cone(1.5, 26)
  }

  private buildLitter() {
    const items: Item[] = []
    const colors: number[] = []
    for (let i = 0; i < 260; i++) {
      const x = rand(-42, 42)
      const z = rand(-42, 42)
      items.push({ x, y: 0.04, z, ry: rand(0, 6), sx: rand(0.5, 1.5), sz: rand(0.5, 1.5) })
      colors.push(pick([0x6f7480, 0x8a7a5a, 0x51586a, 0x7a4a4a, 0x3a3f4a, 0x9aa0ac]))
    }
    instanced(this.group, 0.35, 0.05, 0.25, stdMat(0xffffff, { rough: 1 }), items, false, colors)
  }
}
