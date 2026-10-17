import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ZOMBIES, type ZombieDef, type ZombieKind } from './config'
import { resolveCircle } from './collision'
import { addBox, newMat, stdMat } from './voxel'
import { angleDiff, chance, clamp, dampAngle, lerp, pick, rand, TAU } from './util'
import type { Game } from './game'

/* ------------------------------------------------------------------ rigs */
export interface Rig {
  root: THREE.Group
  body: THREE.Group
  upper: THREE.Group
  armL: THREE.Group
  armR: THREE.Group
  legL: THREE.Group
  legR: THREE.Group
  head: THREE.Group
  mats: THREE.MeshStandardMaterial[]
  glows: THREE.MeshStandardMaterial[]
  bar: THREE.Group
  barFill: THREE.Mesh
  barW: number
  height: number
  extraArms: THREE.Group[]
  slamFill?: THREE.Mesh
  slamRing?: THREE.Mesh
  chargeLine?: THREE.Mesh
  shield?: THREE.Group
  baseColors: number[]
}

const eyeRed = new THREE.MeshBasicMaterial({ color: 0xff3a30, toneMapped: false })
const eyeYellow = new THREE.MeshBasicMaterial({ color: 0xffe14a, toneMapped: false })
const eyeOrange = new THREE.MeshBasicMaterial({ color: 0xff8a1e, toneMapped: false })
const eyeCyan = new THREE.MeshBasicMaterial({ color: 0x4ff0ff, toneMapped: false })
const eyeGreen = new THREE.MeshBasicMaterial({ color: 0x7aff7a, toneMapped: false })
const eyePurple = new THREE.MeshBasicMaterial({ color: 0xd070ff, toneMapped: false })
const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xeaffd0, toneMapped: false })
const mouthMat = stdMat(0x1a0d0d)
const barBgMat = new THREE.MeshBasicMaterial({ color: 0x07090f, transparent: true, opacity: 0.75, depthTest: false, depthWrite: false })
const barFillMat = new THREE.MeshBasicMaterial({ color: 0xff3e55, transparent: true, depthTest: false, depthWrite: false })
const barGeo = new THREE.PlaneGeometry(1, 1)
barGeo.translate(0.5, 0, 0)

interface HOpts {
  skin: number
  shirt: number
  pants: number
  accent?: number
  scale: number
  hs?: number // head size
  tw?: number // torso width
  td?: number // torso depth
  th?: number // torso height
  aw?: number // arm width
  armLen?: number
  lw?: number // leg width
  eye?: THREE.Material
}

function humanoid(o: HOpts): Rig {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  const upper = new THREE.Group()
  upper.position.y = 0.72
  body.add(upper)

  const skin = newMat(o.skin, { rough: 0.9 })
  const shirt = newMat(o.shirt, { rough: 0.95 })
  const pants = newMat(o.pants, { rough: 0.95 })
  const accent = newMat(o.accent ?? o.shirt, { rough: 0.8 })
  const mats = [skin, shirt, pants, accent]

  const hs = o.hs ?? 0.46
  const tw = o.tw ?? 0.62
  const td = o.td ?? 0.34
  const th = o.th ?? 0.74
  const aw = o.aw ?? 0.18
  const al = o.armLen ?? 0.7
  const lw = o.lw ?? 0.24

  // legs
  const mkLeg = (x: number) => {
    const g = new THREE.Group()
    g.position.set(x, 0.72, 0)
    addBox(g, lw, 0.5, lw + 0.04, pants, 0, -0.25, 0)
    addBox(g, lw * 1.02, 0.22, lw + 0.16, accent, 0, -0.61, 0.05)
    body.add(g)
    return g
  }
  const legL = mkLeg(-(tw / 2 - lw / 2 - 0.02))
  const legR = mkLeg(tw / 2 - lw / 2 - 0.02)

  // torso
  addBox(upper, tw, th, td, shirt, 0, th / 2, 0)
  addBox(upper, tw * 1.02, 0.14, td * 1.02, pants, 0, 0.07, 0)

  // head
  const head = new THREE.Group()
  head.position.set(0, th + 0.02, 0)
  upper.add(head)
  addBox(head, hs, hs, hs, skin, 0, hs / 2, 0)
  const eyeMat = o.eye ?? eyeRed
  addBox(head, hs * 0.18, hs * 0.14, 0.03, eyeMat, -hs * 0.2, hs * 0.58, hs / 2 + 0.005, false)
  addBox(head, hs * 0.18, hs * 0.14, 0.03, eyeMat, hs * 0.2, hs * 0.58, hs / 2 + 0.005, false)
  addBox(head, hs * 0.5, hs * 0.1, 0.03, mouthMat, 0, hs * 0.22, hs / 2 + 0.005, false)

  // arms
  const mkArm = (x: number) => {
    const g = new THREE.Group()
    g.position.set(x, th - 0.08, 0)
    addBox(g, aw, al * 0.5, aw, shirt, 0, -al * 0.25, 0)
    addBox(g, aw * 0.94, al * 0.5, aw * 0.94, skin, 0, -al * 0.75, 0)
    addBox(g, aw * 1.15, aw * 1.15, aw * 1.15, skin, 0, -al - aw * 0.4, 0)
    upper.add(g)
    return g
  }
  const armL = mkArm(-(tw / 2 + aw / 2 + 0.01))
  const armR = mkArm(tw / 2 + aw / 2 + 0.01)

  // hp bar
  const bar = new THREE.Group()
  const barW = 1.1 * Math.max(1, o.scale * 0.65)
  const bg = new THREE.Mesh(barGeo, barBgMat)
  bg.scale.set(barW + 0.08, 0.2, 1)
  bg.position.set(-barW / 2 - 0.04, 0, 0)
  bg.renderOrder = 20
  const fill = new THREE.Mesh(barGeo, barFillMat)
  fill.scale.set(barW, 0.12, 1)
  fill.position.set(-barW / 2, 0, 0.001)
  fill.renderOrder = 21
  bar.add(bg, fill)
  bar.visible = false
  root.add(bar)

  body.scale.setScalar(o.scale)
  const height = (th + 0.72 + hs) * o.scale
  bar.position.y = height + 0.55

  return {
    root, body, upper, armL, armR, legL, legR, head, mats, glows: [], bar, barFill: fill, barW,
    height, extraArms: [], baseColors: [o.skin, o.shirt, o.pants, o.accent ?? o.shirt],
  }
}

const SKINS = [0x6f9a63, 0x7aa66a, 0x628a58, 0x84a46c, 0x6a8f6f]
const SHIRTS = [0x4a5d7a, 0x7a4a4a, 0x6b6b3a, 0x3f4f4a, 0x7a6a4a, 0x55396b, 0x394a63, 0x8a8a8a]
const PANTS = [0x2c3345, 0x3a3a3a, 0x32402f, 0x4a3d33]

/**
 * Bakes every opaque box in a limb group into a single vertex-coloured mesh.
 * Cuts ~16 draw calls per zombie down to ~7 while keeping the rig's pivots for animation.
 */
function bakeRig(r: Rig): Rig {
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.08 })
  const groups: THREE.Group[] = [r.upper, r.legL, r.legR, r.armL, r.armR, r.head, ...r.extraArms]
  const c = new THREE.Color()
  for (const g of groups) {
    const buckets = new Map<boolean, THREE.BufferGeometry[]>()
    const remove: THREE.Mesh[] = []
    for (const child of g.children) {
      if (!(child instanceof THREE.Mesh)) continue
      const m = child.material
      if (!(m instanceof THREE.MeshStandardMaterial) || r.glows.includes(m)) continue
      child.updateMatrix()
      const geo = child.geometry.clone()
      geo.applyMatrix4(child.matrix)
      const n = geo.attributes.position.count
      const col = new Float32Array(n * 3)
      c.copy(m.color)
      for (let i = 0; i < n; i++) {
        col[i * 3] = c.r
        col[i * 3 + 1] = c.g
        col[i * 3 + 2] = c.b
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3))
      const arr = buckets.get(child.castShadow) ?? []
      arr.push(geo)
      buckets.set(child.castShadow, arr)
      remove.push(child)
    }
    for (const m of remove) g.remove(m)
    for (const [cast, geos] of buckets) {
      const mesh = new THREE.Mesh(mergeGeometries(geos, false), bodyMat)
      mesh.castShadow = cast
      g.add(mesh)
    }
  }
  r.mats = [bodyMat]
  return r
}

function buildRig(kind: ZombieKind): Rig {
  const r = bakeRig(buildRigRaw(kind))
  // swarm fodder is cheap: skip their shadows to save draw calls
  if (kind === 'skeleton' || kind === 'crawler') {
    r.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = false
    })
  }
  return r
}

function buildRigRaw(kind: ZombieKind): Rig {
  const def = ZOMBIES[kind]
  switch (kind) {
    case 'walker': {
      const r = humanoid({
        skin: pick(SKINS), shirt: pick(SHIRTS), pants: pick(PANTS), accent: 0x1e1a18,
        scale: def.scale * rand(0.94, 1.08), eye: chance(0.5) ? eyeRed : eyeYellow,
      })
      if (chance(0.45)) addBox(r.head, 0.5, 0.12, 0.5, newMat(pick([0x2a1d14, 0x1a1a1a, 0x6a4a2a, 0x8a8a8a])), 0, 0.5, -0.02)
      if (chance(0.5)) addBox(r.upper, 0.2, 0.26, 0.04, stdMat(0x7a1414), rand(-0.2, 0.2), rand(0.3, 0.5), 0.18, false)
      return r
    }
    case 'runner': {
      const r = humanoid({
        skin: 0xd8b02a, shirt: 0xd8b02a, pants: 0xc09a22, accent: 0x3a2f12, scale: def.scale, eye: eyeRed,
      })
      const suit = r.mats[1]
      // hood + visor + air tank
      addBox(r.head, 0.54, 0.54, 0.54, suit, 0, 0.27, -0.02)
      addBox(r.head, 0.4, 0.2, 0.06, stdMat(0x101722, { rough: 0.2, metal: 0.5 }), 0, 0.3, 0.27, false)
      addBox(r.head, 0.1, 0.1, 0.04, eyeRed, -0.1, 0.3, 0.3, false)
      addBox(r.head, 0.1, 0.1, 0.04, eyeRed, 0.1, 0.3, 0.3, false)
      addBox(r.upper, 0.26, 0.5, 0.2, stdMat(0xe56a1a), 0, 0.42, -0.26)
      addBox(r.upper, 0.64, 0.08, 0.36, stdMat(0x2b2b2b), 0, 0.38, 0, false)
      return r
    }
    case 'spitter': {
      const r = humanoid({
        skin: 0x86c25a, shirt: 0x4b3d5e, pants: 0x2e2a38, accent: 0x1e1a18, scale: def.scale, eye: eyeWhite,
        hs: 0.44,
      })
      const glow = new THREE.MeshStandardMaterial({ color: 0xb6ff3a, emissive: 0x9cff1a, emissiveIntensity: 1.6, roughness: 0.4 })
      r.glows.push(glow)
      addBox(r.upper, 0.34, 0.34, 0.3, glow, 0, 0.72, 0.2)
      addBox(r.head, 0.24, 0.12, 0.05, glow, 0, 0.2, 0.25, false)
      r.upper.rotation.x = 0.28
      return r
    }
    case 'bloater': {
      const r = humanoid({
        skin: 0xa2b05a, shirt: 0x7d8a45, pants: 0x4a4a32, accent: 0x2a2a1e, scale: def.scale,
        tw: 0.95, td: 0.8, th: 0.8, hs: 0.38, aw: 0.24, armLen: 0.62, lw: 0.32, eye: eyeOrange,
      })
      const glow = new THREE.MeshStandardMaterial({ color: 0xffa21a, emissive: 0xff7a00, emissiveIntensity: 1.5, roughness: 0.5 })
      r.glows.push(glow)
      for (let i = 0; i < 5; i++) {
        addBox(r.upper, rand(0.16, 0.26), rand(0.16, 0.26), 0.06, glow, rand(-0.3, 0.3), rand(0.15, 0.7), 0.42, false)
      }
      addBox(r.upper, 0.9, 0.5, 0.7, r.mats[0], 0, 0.45, 0.05)
      return r
    }
    case 'brute': {
      const r = humanoid({
        skin: 0x8a3a3a, shirt: 0x3a2a2a, pants: 0x2a2224, accent: 0x15100f, scale: def.scale,
        tw: 0.86, td: 0.5, th: 0.8, hs: 0.4, aw: 0.32, armLen: 0.82, lw: 0.34, eye: eyeOrange,
      })
      const metal = stdMat(0x454b55, { rough: 0.5, metal: 0.6 })
      addBox(r.upper, 1.3, 0.22, 0.6, metal, 0, 0.82, 0)
      for (let i = 0; i < 4; i++) addBox(r.upper, 0.1, 0.26, 0.1, metal, -0.36 + i * 0.24, 0.98, -0.1)
      for (let i = 0; i < 4; i++) addBox(r.upper, 0.1, 0.34, 0.1, metal, -0.3 + i * 0.2, 0.45 + (i % 2) * 0.1, -0.3)
      addBox(r.head, 0.08, 0.26, 0.08, stdMat(0xd8d2c0), -0.2, 0.52, 0, true)
      addBox(r.head, 0.08, 0.26, 0.08, stdMat(0xd8d2c0), 0.2, 0.52, 0, true)
      return r
    }
    case 'skeleton': {
      const r = humanoid({
        skin: 0xe6e0c8, shirt: 0xd8d2b8, pants: 0xcfc8b0, accent: 0x6a6450, scale: def.scale,
        tw: 0.42, td: 0.26, th: 0.62, hs: 0.44, aw: 0.11, armLen: 0.72, lw: 0.14, eye: eyeGreen,
      })
      const dark = stdMat(0x1c1a16)
      for (let i = 0; i < 3; i++) addBox(r.upper, 0.44, 0.05, 0.28, dark, 0, 0.16 + i * 0.15, 0)
      addBox(r.armR, 0.05, 0.55, 0.05, stdMat(0x8a8a92, { metal: 0.6, rough: 0.4 }), 0, -0.98, 0.08)
      return r
    }
    case 'witch': {
      const r = humanoid({
        skin: 0xc9b4d6, shirt: 0x3a1f5c, pants: 0x2a1544, accent: 0x15091f, scale: def.scale,
        tw: 0.58, td: 0.36, th: 0.74, hs: 0.46, aw: 0.16, armLen: 0.7, lw: 0.24, eye: eyePurple,
      })
      const robe = stdMat(0x3a1f5c, { rough: 0.95 })
      const trim = stdMat(0xd8a21c)
      const hat = stdMat(0x2a1544)
      addBox(r.upper, 0.84, 0.64, 0.58, robe, 0, -0.18, 0)
      addBox(r.upper, 0.86, 0.06, 0.6, trim, 0, -0.48, 0)
      addBox(r.head, 0.8, 0.06, 0.8, hat, 0, 0.5, 0)
      addBox(r.head, 0.52, 0.06, 0.52, trim, 0, 0.56, 0)
      addBox(r.head, 0.5, 0.22, 0.5, hat, 0, 0.67, 0)
      addBox(r.head, 0.34, 0.22, 0.34, hat, 0.02, 0.88, 0)
      addBox(r.head, 0.18, 0.22, 0.18, hat, 0.06, 1.09, 0)
      const glow = new THREE.MeshStandardMaterial({ color: 0xd070ff, emissive: 0xb040ff, emissiveIntensity: 1.8, roughness: 0.4 })
      r.glows.push(glow)
      addBox(r.upper, 0.07, 1.9, 0.07, stdMat(0x4a3320), 0.58, 0.1, 0.36)
      addBox(r.upper, 0.22, 0.22, 0.22, glow, 0.58, 1.12, 0.36, false)
      addBox(r.upper, 0.34, 0.06, 0.34, stdMat(0x6a5a40), 0.58, 1.0, 0.36, false)
      r.bar.position.y += 0.7 * def.scale
      return r
    }
    case 'leaper': {
      const r = humanoid({
        skin: 0x9fc2d6, shirt: 0x2d3a4a, pants: 0x232c38, accent: 0x15191f, scale: def.scale,
        tw: 0.5, td: 0.3, th: 0.7, hs: 0.42, aw: 0.15, armLen: 0.95, lw: 0.2, eye: eyeCyan,
      })
      const bone = stdMat(0xd8d2c0)
      for (let i = 0; i < 3; i++) addBox(r.upper, 0.08, 0.22, 0.08, bone, -0.15 + i * 0.15, 0.62, -0.22)
      addBox(r.armL, 0.05, 0.22, 0.05, bone, 0, -1.14, 0.05)
      addBox(r.armR, 0.05, 0.22, 0.05, bone, 0, -1.14, 0.05)
      return r
    }
    case 'riot': {
      const r = humanoid({
        skin: 0x7a8a96, shirt: 0x24324a, pants: 0x1c2536, accent: 0x10151f, scale: def.scale,
        tw: 0.8, td: 0.5, th: 0.8, hs: 0.44, aw: 0.24, armLen: 0.7, lw: 0.3, eye: eyeYellow,
      })
      addBox(r.head, 0.54, 0.3, 0.54, stdMat(0x2c3a52, { metal: 0.5, rough: 0.4 }), 0, 0.5, 0)
      addBox(r.head, 0.46, 0.14, 0.06, stdMat(0x0f1624, { rough: 0.2, metal: 0.6 }), 0, 0.3, 0.28, false)
      addBox(r.upper, 0.9, 0.18, 0.6, stdMat(0x2c3a52, { metal: 0.5 }), 0, 0.82, 0)
      const shield = new THREE.Group()
      shield.position.set(0, 0.5, 0.58)
      const steel = stdMat(0x66748a, { metal: 0.6, rough: 0.35 })
      addBox(shield, 1.1, 1.2, 0.12, steel, 0, 0, 0)
      addBox(shield, 1.16, 0.12, 0.16, stdMat(0xd8a21c), 0, 0.6, 0, false)
      addBox(shield, 1.16, 0.12, 0.16, stdMat(0xd8a21c), 0, -0.6, 0, false)
      addBox(shield, 0.62, 0.2, 0.14, stdMat(0x0f1a2c, { rough: 0.1, metal: 0.7 }), 0, 0.22, 0.01, false)
      r.upper.add(shield)
      r.shield = shield
      return r
    }
    case 'screamer': {
      const r = humanoid({
        skin: 0xb9a6d6, shirt: 0x3a2b52, pants: 0x241c33, accent: 0x15101f, scale: def.scale,
        tw: 0.5, td: 0.3, th: 0.7, hs: 0.52, aw: 0.14, armLen: 0.8, lw: 0.2, eye: eyeWhite,
      })
      const glow = new THREE.MeshStandardMaterial({ color: 0xc08cff, emissive: 0xa060ff, emissiveIntensity: 1.6, roughness: 0.4 })
      r.glows.push(glow)
      addBox(r.head, 0.34, 0.26, 0.06, glow, 0, 0.16, 0.28, false)
      const bone = stdMat(0xd8d2c0)
      addBox(r.head, 0.08, 0.3, 0.08, bone, -0.2, 0.66, 0)
      addBox(r.head, 0.08, 0.3, 0.08, bone, 0.2, 0.66, 0)
      return r
    }
    case 'splitter': {
      const r = humanoid({
        skin: 0xd8708f, shirt: 0x7a2f55, pants: 0x4a2036, accent: 0x2a121e, scale: def.scale,
        tw: 0.95, td: 0.8, th: 0.85, hs: 0.4, aw: 0.24, armLen: 0.7, lw: 0.3, eye: eyeYellow,
      })
      const glow = new THREE.MeshStandardMaterial({ color: 0xff4aa0, emissive: 0xff2a8a, emissiveIntensity: 1.4, roughness: 0.5 })
      r.glows.push(glow)
      for (let i = 0; i < 4; i++) {
        addBox(r.upper, rand(0.25, 0.4), rand(0.25, 0.4), rand(0.2, 0.3), r.mats[0], rand(-0.4, 0.4), rand(0.2, 0.8), rand(-0.2, 0.45))
      }
      for (let i = 0; i < 3; i++) addBox(r.upper, 0.14, 0.14, 0.06, glow, rand(-0.3, 0.3), rand(0.2, 0.7), 0.43, false)
      addBox(r.upper, 0.3, 0.3, 0.3, r.mats[0], 0.45, 1.0, 0.05)
      addBox(r.upper, 0.07, 0.07, 0.03, eyeYellow, 0.4, 1.06, 0.21, false)
      addBox(r.upper, 0.07, 0.07, 0.03, eyeYellow, 0.5, 1.06, 0.21, false)
      return r
    }
    case 'crawler': {
      return humanoid({
        skin: 0x7a9a68, shirt: 0x4a3a30, pants: 0x2a2a30, accent: 0x15151a, scale: def.scale,
        hs: 0.5, aw: 0.16, armLen: 0.8, lw: 0.2, eye: eyeRed,
      })
    }
    case 'boss': {
      const r = humanoid({
        skin: 0x5a2f6e, shirt: 0x2a1836, pants: 0x1c1226, accent: 0x120a18, scale: def.scale,
        tw: 0.95, td: 0.6, th: 0.85, hs: 0.42, aw: 0.3, armLen: 0.95, lw: 0.34, eye: eyeRed,
      })
      const glow = new THREE.MeshStandardMaterial({ color: 0xff3a3a, emissive: 0xff1a1a, emissiveIntensity: 1.8, roughness: 0.4 })
      r.glows.push(glow)
      const bone = stdMat(0xd8d2c0)
      addBox(r.upper, 0.34, 0.34, 0.12, glow, 0, 0.5, 0.31, false)
      for (let i = 0; i < 6; i++) addBox(r.upper, 0.1, 0.34 - i * 0.02, 0.1, bone, 0, 0.82 - i * 0.13, -0.34 - i * 0.02)
      for (const s of [-1, 1]) {
        addBox(r.upper, 0.34, 0.2, 0.5, stdMat(0x3a2548), s * 0.7, 0.9, 0)
        addBox(r.upper, 0.1, 0.4, 0.1, bone, s * 0.74, 1.16, 0)
        addBox(r.head, 0.09, 0.4, 0.09, bone, s * 0.2, 0.56, -0.05)
      }
      addBox(r.head, 0.3, 0.1, 0.05, glow, 0, 0.18, 0.22, false)
      // second pair of arms
      for (const s of [-1, 1]) {
        const g = new THREE.Group()
        g.position.set(s * 0.62, 0.45, 0)
        addBox(g, 0.22, 0.5, 0.22, r.mats[0], 0, -0.25, 0)
        addBox(g, 0.22, 0.5, 0.22, r.mats[0], 0, -0.7, 0)
        addBox(g, 0.28, 0.28, 0.28, r.mats[0], 0, -1.0, 0)
        r.upper.add(g)
        r.extraArms.push(g)
      }
      // telegraphs
      const tm = new THREE.MeshBasicMaterial({
        color: 0xff2a2a, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      })
      const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 48), tm)
      fill.rotation.x = -Math.PI / 2
      fill.position.y = 0.12
      fill.visible = false
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.97, 1, 64),
        new THREE.MeshBasicMaterial({ color: 0xff3a3a, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.13
      ring.visible = false
      const line = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), tm.clone())
      line.rotation.x = -Math.PI / 2
      line.position.y = 0.12
      line.visible = false
      r.root.add(fill, ring, line)
      r.slamFill = fill
      r.slamRing = ring
      r.chargeLine = line
      r.bar.visible = false
      return r
    }
  }
}

/* ---------------------------------------------------------------- zombie */
export type ZState =
  | 'chase' | 'windup' | 'recover' | 'fuse' | 'spit'
  | 'slamWindup' | 'chargeWindup' | 'charge' | 'stun' | 'roar' | 'dying'
  | 'crouch' | 'leap' | 'shriek' | 'summon' | 'rise'

const tmpDir = { x: 0, z: 0 }

export class Zombie {
  id = 0
  kind: ZombieKind
  def: ZombieDef
  rig: Rig
  x = 0
  z = 0
  vx = 0
  vz = 0
  kx = 0
  kz = 0
  angle = 0
  hp = 1
  maxHp = 1
  state: ZState = 'chase'
  t = 0
  attackCd = 0
  flash = 0
  phase = 0
  speedMul = 1
  dmgMul = 1
  dead = false
  deathT = 0
  groanT = 3
  spitCd = 2
  beepT = 0
  strafe = 1
  atkT = 3
  stage = 0
  chargeX = 0
  chargeZ = 1
  hitDone = false
  stunT = 0
  alive = true
  hitRadius: number
  staticR: number
  lastDmgT = 0
  numAcc = 0
  numT = -1
  burnT = 0
  burnDps = 0
  burnAcc = 0
  slowT = 0
  rageT = 0
  shieldHp = 0
  shielded = false
  leapCd = 2
  leapDur = 0.5
  leapX0 = 0
  leapZ0 = 0
  leapX1 = 0
  leapZ1 = 0

  constructor(kind: ZombieKind) {
    this.kind = kind
    this.def = ZOMBIES[kind]
    this.rig = buildRig(kind)
    this.hitRadius = this.def.radius * 1.08
    this.staticR = Math.min(this.def.radius, 0.9)
  }

  reset(x: number, z: number, wave: number) {
    this.id = ++Zombie.nextId
    this.x = x
    this.z = z
    this.vx = this.vz = this.kx = this.kz = 0
    this.state = 'chase'
    this.t = 0
    this.attackCd = rand(0.2, 1)
    this.flash = 0
    this.dead = false
    this.alive = true
    this.deathT = 0
    this.groanT = rand(1, 5)
    this.spitCd = rand(1.5, 3)
    this.beepT = 0
    this.strafe = chance(0.5) ? 1 : -1
    this.atkT = 3.5
    this.stage = 0
    this.hitDone = false
    this.stunT = 0
    this.numAcc = 0
    this.numT = -1
    this.burnT = this.burnDps = this.burnAcc = 0
    this.slowT = this.rageT = 0
    this.shielded = this.kind === 'riot'
    this.shieldHp = 150
    this.leapCd = rand(0.5, 2.5)
    const hpScale = 1 + 0.09 * (wave - 1) + (this.kind === 'boss' ? 0.45 * (Math.floor(wave / 5) - 1) : 0)
    this.maxHp = this.hp = Math.round(this.def.hp * hpScale)
    this.speedMul = (1 + Math.min(0.3, wave * 0.02)) * rand(0.92, 1.1)
    this.dmgMul = 1 + 0.05 * (wave - 1)
    const r = this.rig
    r.root.position.set(x, 0, z)
    r.body.rotation.set(0, this.angle, 0)
    r.body.position.y = 0
    r.root.visible = true
    r.bar.visible = false
    this.setFlash(0)
    if (r.slamFill) { r.slamFill.visible = false; r.slamRing!.visible = false; r.chargeLine!.visible = false }
    if (r.shield) r.shield.visible = true
    if (this.kind === 'spitter') r.upper.rotation.x = 0.28
    else r.upper.rotation.x = 0
  }
  static nextId = 0

  get isBoss() {
    return this.kind === 'boss'
  }

  setFlash(f: number) {
    this.flash = f
    this.refreshTint()
  }

  /** emissive tint: white hit flash, orange when burning, violet when enraged */
  refreshTint() {
    const b = this.burnT > 0 ? 0.35 + 0.15 * Math.sin(this.t * 30) : 0
    const rg = this.rageT > 0 ? 0.3 : 0
    const f = this.flash * 0.9
    for (const m of this.rig.mats) {
      m.emissive.setRGB(f + b * 0.9 + rg * 0.35, f + b * 0.35, f + rg * 0.6)
      m.emissiveIntensity = 1
    }
  }

  ignite(t: number, dps: number) {
    this.burnT = Math.max(this.burnT, t)
    this.burnDps = Math.max(this.burnDps, dps)
  }

  breakShield(g: Game) {
    if (!this.shielded) return
    this.shielded = false
    if (this.rig.shield) this.rig.shield.visible = false
    this.speedMul *= 1.25
    g.audio.shieldBreak()
    g.effects.gibs(this.x + Math.sin(this.angle) * 0.7, this.z + Math.cos(this.angle) * 0.7, [0x66748a, 0xd8a21c, 0x3a4658], 12, 0.9, 1.1)
    g.effects.number(this.x, this.rig.height + 0.6, this.z, 'SHIELD BROKEN', 'info')
  }

  /** hp bar + flash after taking damage */
  onDamaged(flash = true) {
    if (flash) this.setFlash(1)
    if (!this.isBoss) {
      const f = clamp(this.hp / this.maxHp, 0, 1)
      this.rig.bar.visible = f < 0.999
      this.rig.barFill.scale.x = Math.max(0.001, this.rig.barW * f)
    }
  }

  knock(dx: number, dz: number, power: number) {
    const resist = 1 - this.def.knockResist
    this.kx += dx * power * resist
    this.kz += dz * power * resist
  }

  /* ---------------------------------------------------------------- AI */
  update(dt: number, g: Game) {
    const r = this.rig
    const p = g.player
    this.t += dt
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 7)

    if (this.state === 'dying') {
      this.refreshTint()
      this.updateDeath(dt)
      return
    }

    this.slowT -= dt
    this.rageT -= dt
    this.leapCd -= dt
    if (this.burnT > 0) {
      this.burnT -= dt
      this.burnAcc += dt
      if (Math.random() < dt * 26) {
        g.effects.glow.emit({
          x: this.x + rand(-0.3, 0.3), y: rand(0.2, r.height * 0.9), z: this.z + rand(-0.3, 0.3),
          vy: rand(1.5, 3.5), life: 0.45, size: 0.22, grav: -2, color: pick([0xff7a1a, 0xffb02e, 0xffd76a]), fade: true,
        })
      }
      if (Math.random() < dt * 5) g.effects.smoke(this.x, r.height, this.z, 1, 0x2a2a2e, 0.3, 0.35)
      if (this.burnAcc >= 0.5) {
        this.burnAcc -= 0.5
        g.damageZombie(this, this.burnDps * 0.5, { dx: 0, dz: 0, knock: 0, fire: true, noShield: true })
        if (!this.alive) return
        for (const o of g.zombies) {
          if (o !== this && o.alive && o.burnT < 0.5 && Math.abs(o.x - this.x) < 1.6 && Math.abs(o.z - this.z) < 1.6) o.ignite(2, this.burnDps * 0.7)
        }
      }
    }
    this.refreshTint()

    this.attackCd -= dt
    this.groanT -= dt
    let dx = p.x - this.x
    let dz = p.z - this.z
    let dist = Math.hypot(dx, dz)
    if (dist < 0.001) dist = 0.001
    const ux = dx / dist
    const uz = dz / dist

    if (this.groanT <= 0 && g.state === 'playing' && this.kind !== 'skeleton') {
      g.audio.groan(this.kind, dist, clamp((this.x - p.x) / 30, -1, 1))
      this.groanT = (this.kind === 'runner' ? rand(2, 5) : rand(3.5, 8))
    }

    let tvx = 0
    let tvz = 0
    let faceX = ux
    let faceZ = uz
    const spd = this.def.speed * this.speedMul * (this.slowT > 0 ? 0.4 : 1) * (this.rageT > 0 ? 1.45 : 1)

    switch (this.state) {
      case 'chase': {
        const d = this.pathDir(g, dist, ux, uz)
        if (this.kind === 'spitter' || this.kind === 'screamer' || this.kind === 'witch') {
          const near = this.kind === 'witch' ? 8 : this.kind === 'screamer' ? 9 : 8
          const far = this.kind === 'witch' ? 12.5 : this.kind === 'screamer' ? 15 : 13
          this.spitCd -= dt
          if (dist < near) {
            tvx = -ux * spd * 0.9; tvz = -uz * spd * 0.9
          } else if (dist > far) {
            tvx = d.x * spd; tvz = d.z * spd
          } else {
            tvx = -uz * this.strafe * spd * 0.55; tvz = ux * this.strafe * spd * 0.55
            if (chance(dt * 0.25)) this.strafe *= -1
          }
          faceX = ux; faceZ = uz
          if (this.kind === 'witch') {
            if (this.spitCd <= 0 && dist < 45 && g.skeletonRoom() > 0) {
              this.state = 'summon'
              this.t = 0
              this.hitDone = false
              this.spitCd = rand(4, 5.2)
              g.effects.ring(this.x, this.z, 0.5, 5.5, 0xb48cff, 1.0)
              g.audio.summon(dist)
            }
          } else if (this.kind === 'screamer') {
            if (this.spitCd <= 0 && dist < 30) {
              this.state = 'shriek'
              this.t = 0
              this.hitDone = false
              this.spitCd = rand(5, 7)
            }
          } else if (this.spitCd <= 0 && dist < 17 && dist > 4) {
            this.state = 'spit'
            this.t = 0
            g.audio.beep(true)
          }
        } else {
          tvx = d.x * spd
          tvz = d.z * spd
          faceX = tvx || ux
          faceZ = tvz || uz
          if (dist < 22) { /* close enough to look at the player */
            faceX = faceX * 0.4 + ux * 0.6
            faceZ = faceZ * 0.4 + uz * 0.6
          }
          const reach = this.staticR + 0.45 + (this.kind === 'brute' ? 0.45 : 0.35)
          if (this.kind === 'bloater') {
            if (dist < 2.6 && this.attackCd <= 0) {
              this.state = 'fuse'
              this.t = 0
              this.beepT = 0
            }
          } else if (this.kind === 'boss') {
            this.atkT -= dt
            const pct = this.hp / this.maxHp
            if ((this.stage === 0 && pct < 0.66) || (this.stage === 1 && pct < 0.33)) {
              this.stage++
              this.state = 'roar'
              this.t = 0
              this.hitDone = false
              g.audio.roar()
              g.shake(0.6)
            } else if (this.atkT <= 0) {
              const slam = dist < 11 ? chance(0.65) : chance(0.25)
              this.state = slam ? 'slamWindup' : 'chargeWindup'
              this.t = 0
              this.hitDone = false
              if (!slam) {
                this.chargeX = ux
                this.chargeZ = uz
              }
              g.audio.roar()
            } else if (dist < reach + 0.4 && this.attackCd <= 0) {
              this.state = 'windup'
              this.t = 0
            }
          } else if (this.kind === 'leaper' && this.leapCd <= 0 && dist > 4.2 && dist < 11.5) {
            this.state = 'crouch'
            this.t = 0
            this.hitDone = false
          } else if (dist < reach && this.attackCd <= 0) {
            this.state = 'windup'
            this.t = 0
            this.hitDone = false
          }
        }
        break
      }
      case 'summon': {
        faceX = ux
        faceZ = uz
        if (Math.random() < dt * 45) {
          g.effects.glow.emit({
            x: this.x + rand(-1.8, 1.8), y: 0.2, z: this.z + rand(-1.8, 1.8),
            vy: rand(2, 5), life: 0.6, size: 0.16, grav: -2, color: 0xb48cff, fade: true,
          })
        }
        if (!this.hitDone && this.t >= 0.85) {
          this.hitDone = true
          g.summonSkeletons(this, Math.min(12, 6 + Math.floor((g.wave - 7) / 2)))
        }
        if (this.t >= 1.35) {
          this.state = 'chase'
          this.t = 0
        }
        break
      }
      case 'rise': {
        if (this.t >= 0.75) {
          this.state = 'chase'
          this.t = 0
        }
        break
      }
      case 'crouch': {
        faceX = ux
        faceZ = uz
        if (this.t >= 0.5) {
          const lead = 0.25
          let tx = p.x + p.vx * lead
          let tz = p.z + p.vz * lead
          const dd = Math.hypot(tx - this.x, tz - this.z)
          if (dd > 12) {
            tx = this.x + ((tx - this.x) / dd) * 12
            tz = this.z + ((tz - this.z) / dd) * 12
          }
          this.leapX0 = this.x; this.leapZ0 = this.z
          this.leapX1 = tx; this.leapZ1 = tz
          this.leapDur = clamp(Math.min(dd, 12) / 17, 0.35, 0.7)
          this.state = 'leap'
          this.t = 0
          g.audio.leap(dist)
        }
        break
      }
      case 'leap': {
        const k = Math.min(1, this.t / this.leapDur)
        this.x = lerp(this.leapX0, this.leapX1, k)
        this.z = lerp(this.leapZ0, this.leapZ1, k)
        this.vx = this.vz = this.kx = this.kz = 0
        faceX = this.leapX1 - this.leapX0
        faceZ = this.leapZ1 - this.leapZ0
        if (k >= 1) {
          g.effects.smoke(this.x, 0.2, this.z, 5, 0x8a8478, 0.8, 0.5)
          g.effects.ring(this.x, this.z, 0.3, 2.2, 0xd8d2c0, 0.3)
          g.audio.thud(dist)
          if (Math.hypot(p.x - this.x, p.z - this.z) < 1.7) p.hurt(this.def.damage * 1.2 * this.dmgMul, this.x, this.z, 7, g)
          this.state = 'recover'
          this.t = 0
          this.leapCd = rand(3.2, 4.6)
          this.attackCd = 0.5
        }
        break
      }
      case 'shriek': {
        faceX = ux
        faceZ = uz
        if (!this.hitDone && this.t >= 0.45) {
          this.hitDone = true
          g.screamerBuff(this)
        }
        if (this.t >= 1.0) {
          this.state = 'chase'
          this.t = 0
        }
        break
      }
      case 'windup': {
        const dur = this.windupDur()
        if (this.t >= dur && !this.hitDone) {
          this.hitDone = true
          const reach = this.staticR + 0.45 + (this.kind === 'brute' || this.kind === 'boss' ? 1.0 : this.kind === 'riot' || this.kind === 'splitter' ? 0.85 : 0.7)
          if (dist < reach) {
            const kb = this.kind === 'brute' ? 9 : this.kind === 'boss' ? 12 : this.kind === 'riot' ? 8 : 3.5
            p.hurt(this.def.damage * this.dmgMul, this.x, this.z, kb, g)
          }
          this.attackCd = this.def.attackCd
        }
        if (this.t >= dur + 0.3) {
          this.state = 'chase'
          this.t = 0
        }
        break
      }
      case 'fuse': {
        // bloater: swell and detonate
        this.beepT -= dt
        if (this.beepT <= 0) {
          g.audio.beep(this.t > 0.5)
          this.beepT = this.t > 0.5 ? 0.09 : 0.18
        }
        const d = this.pathDir(g, dist, ux, uz)
        tvx = d.x * spd * 0.45
        tvz = d.z * spd * 0.45
        if (this.t >= 0.95) g.killZombie(this, { selfDestruct: true })
        break
      }
      case 'spit': {
        if (this.t >= 0.6) {
          const lead = 0.35
          g.projectiles.spit(this.x, this.z, p.x + p.vx * lead, p.z + p.vz * lead, this.dmgMul)
          this.spitCd = rand(2.4, 4)
          this.state = 'chase'
          this.t = 0
        }
        break
      }
      case 'roar': {
        if (!this.hitDone && this.t > 0.4 && this.isBoss) {
          this.hitDone = true
          g.spawnReinforcements(this, this.stage === 1 ? 4 : 6)
        }
        if (this.t >= 1.3) { this.state = 'chase'; this.t = 0; this.atkT = 2.2 }
        break
      }
      case 'slamWindup': {
        const dur = 1.25
        if (r.slamFill) {
          const k = Math.min(1, this.t / dur)
          const R = 9.5
          r.slamFill.visible = r.slamRing!.visible = true
          r.slamRing!.scale.set(R, R, R)
          r.slamFill.scale.set(R * k, R * k, R * k)
        }
        if (this.t >= dur) {
          if (r.slamFill) { r.slamFill.visible = false; r.slamRing!.visible = false }
          g.bossSlam(this)
          this.state = 'recover'
          this.t = 0
          this.atkT = rand(2.6, 4)
        }
        break
      }
      case 'chargeWindup': {
        const dur = 1.0
        // track the player for the first part of the windup
        if (this.t < dur * 0.6) {
          this.chargeX += (ux - this.chargeX) * Math.min(1, dt * 4)
          this.chargeZ += (uz - this.chargeZ) * Math.min(1, dt * 4)
          const l = Math.hypot(this.chargeX, this.chargeZ) || 1
          this.chargeX /= l
          this.chargeZ /= l
        }
        faceX = this.chargeX
        faceZ = this.chargeZ
        if (r.chargeLine) {
          const L = 26
          r.chargeLine.visible = true
          r.chargeLine.rotation.set(-Math.PI / 2, 0, Math.atan2(this.chargeX, this.chargeZ) + Math.PI, 'YXZ')
          r.chargeLine.position.set(this.chargeX * L / 2, 0.12, this.chargeZ * L / 2)
          r.chargeLine.scale.set(3.6, L, 1)
          ;(r.chargeLine.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.2 * Math.abs(Math.sin(this.t * 14))
        }
        if (this.t >= dur) {
          if (r.chargeLine) r.chargeLine.visible = false
          this.state = 'charge'
          this.t = 0
          this.hitDone = false
        }
        break
      }
      case 'charge': {
        tvx = this.chargeX * 17
        tvz = this.chargeZ * 17
        faceX = this.chargeX
        faceZ = this.chargeZ
        this.vx = tvx
        this.vz = tvz
        if (!this.hitDone && dist < this.staticR + 1.5) {
          this.hitDone = true
          p.hurt(this.def.damage * 1.1 * this.dmgMul, this.x, this.z, 16, g)
          g.shake(0.7)
        }
        if (this.t > 1.5) {
          this.state = 'recover'
          this.t = 0
          this.atkT = rand(2.2, 3.4)
        }
        if (this.t % 0.12 < dt) g.effects.smoke(this.x, 0.2, this.z, 2, 0x6a6258, 1.2, 0.7)
        break
      }
      case 'stun': {
        if (this.t >= this.stunT) { this.state = 'chase'; this.t = 0; this.atkT = 2 }
        break
      }
      case 'recover': {
        const dur = this.kind === 'boss' ? 1.1 : 0.4
        if (this.t >= dur) { this.state = 'chase'; this.t = 0 }
        break
      }
    }

    // velocity smoothing
    if (this.state !== 'charge') {
      const a = 1 - Math.exp(-9 * dt)
      this.vx += (tvx - this.vx) * a
      this.vz += (tvz - this.vz) * a
    }
    this.x += (this.vx + this.kx) * dt
    this.z += (this.vz + this.kz) * dt
    const kd = Math.exp(-6 * dt)
    this.kx *= kd
    this.kz *= kd

    // static collisions
    const hit = this.state === 'leap' ? false : resolveCircle(this, this.staticR, g.world.colliders)
    if (hit && this.state === 'charge') {
      this.state = 'stun'
      this.t = 0
      this.stunT = 1.9
      this.vx = this.vz = 0
      g.shake(0.9)
      g.audio.slam()
      g.effects.smoke(this.x, 0.5, this.z, 14, 0x8a8478, 1.8, 1.0)
      g.effects.gibs(this.x + this.chargeX * 1.5, this.z + this.chargeZ * 1.5, [0x6a625a, 0x4a4540], 14, 1.2)
      if (r.chargeLine) r.chargeLine.visible = false
    }
    // don't walk through the player's body
    const pd = Math.hypot(p.x - this.x, p.z - this.z)
    const minD = this.staticR * 0.85 + 0.42
    if (pd < minD && pd > 0.001 && this.state !== 'charge' && this.state !== 'leap') {
      const k = (minD - pd) / pd
      this.x -= (p.x - this.x) * k
      this.z -= (p.z - this.z) * k
    }

    // facing
    const target = Math.atan2(faceX, faceZ)
    const turn = this.kind === 'boss' ? 4 : this.kind === 'brute' ? 6 : 10
    this.angle = dampAngle(this.angle, target, turn, dt)

    this.animate(dt)
    r.root.position.set(this.x, 0, this.z)
    r.bar.quaternion.copy(g.camera.quaternion)
  }

  private windupDur() {
    switch (this.kind) {
      case 'brute': return 0.62
      case 'runner': return 0.26
      case 'boss': return 0.55
      case 'riot': return 0.5
      case 'splitter': return 0.5
      case 'crawler': return 0.28
      case 'leaper': return 0.3
      default: return 0.4
    }
  }

  private pathDir(g: Game, dist: number, ux: number, uz: number) {
    const nav = g.world.nav
    const pd = nav.distAt(this.x, this.z)
    if (pd > dist * 1.18 + 2.5 || pd === Infinity) {
      if (nav.steer(this.x, this.z, tmpDir)) return tmpDir
    }
    tmpDir.x = ux
    tmpDir.z = uz
    return tmpDir
  }

  /* --------------------------------------------------------- animation */
  private animate(dt: number) {
    const r = this.rig
    const spd = Math.hypot(this.vx, this.vz)
    const boss = this.kind === 'boss'
    const brute = this.kind === 'brute'
    const runner = this.kind === 'runner'
    const rate = boss ? 1.6 : brute ? 2.4 : runner ? 3.2 : 3.4
    this.phase += dt * (rate + spd * (boss ? 0.9 : 1.2))
    const sw = Math.sin(this.phase)
    const amp = clamp(spd / 2.2, 0, 1.4) * (runner ? 1.15 : 0.72)
    r.legL.rotation.x = sw * amp
    r.legR.rotation.x = -sw * amp
    r.body.rotation.y = this.angle
    r.body.position.y = Math.abs(sw) * 0.05 * clamp(spd, 0, 2) * (boss ? 0.6 : 1)
    r.upper.rotation.z = sw * 0.04 * clamp(spd, 0, 2)

    const K = this.kind
    let lean = K === 'spitter' ? 0.28 : runner ? 0.32 : brute ? 0.18 : K === 'crawler' ? 1.3 : K === 'leaper' ? 0.35 : K === 'riot' ? 0.08 : K === 'screamer' ? 0.15 : K === 'splitter' ? 0.15 : 0.06
    let armBase = runner ? -0.6 : brute ? -0.9 : K === 'crawler' ? -2.5 : K === 'leaper' ? -0.5 : K === 'riot' ? -0.9 : K === 'screamer' ? -0.4 : -1.3
    let armSwing = runner ? sw * 1.1 : 0.1 * Math.sin(this.phase * 0.5)
    let armL = armBase + armSwing
    let armR = armBase - armSwing
    let scaleY = 1

    if (K === 'splitter') scaleY = 1 + Math.sin(this.t * 4 + this.id) * 0.04
    switch (this.state) {
      case 'summon': {
        const k = clamp(this.t / 0.4, 0, 1)
        armL = armR = lerpN(armBase, -2.7, k)
        lean = lerpN(lean, -0.25, k)
        r.body.position.y = Math.sin(this.t * 12) * 0.05 + 0.12 * k
        break
      }
      case 'rise': {
        const k = clamp(this.t / 0.75, 0, 1)
        r.body.position.y = -(1 - k) * 1.4 * this.def.scale
        armL = armR = lerpN(-2.6, armBase, k)
        lean = 0
        break
      }
      case 'crouch': {
        const k = clamp(this.t / 0.5, 0, 1)
        lean = lerpN(lean, 0.75, k)
        armL = armR = lerpN(armBase, -0.2, k)
        scaleY = 1 - k * 0.22
        break
      }
      case 'leap': {
        const k = clamp(this.t / this.leapDur, 0, 1)
        lean = 0.9
        armL = armR = -2.2
        r.body.position.y = Math.sin(k * Math.PI) * 2.4
        r.legL.rotation.x = -0.9
        r.legR.rotation.x = 0.6
        break
      }
      case 'shriek': {
        const k = clamp(this.t / 0.45, 0, 1)
        lean = lerpN(lean, -0.55, k)
        armL = armR = lerpN(armBase, -2.6, k)
        r.head.rotation.x = -0.5 * k
        break
      }
      case 'windup': {
        const dur = this.windupDur()
        const k = clamp(this.t / dur, 0, 1)
        if (k < 1) {
          armL = armR = lerpN(armBase, -2.7, k)
          lean = lerpN(lean, -0.25, k)
        } else {
          const k2 = clamp((this.t - dur) / 0.2, 0, 1)
          armL = armR = lerpN(-2.7, -0.3, k2)
          lean = lerpN(-0.25, 0.5, k2)
        }
        break
      }
      case 'fuse': {
        const k = clamp(this.t / 0.95, 0, 1)
        scaleY = 1 + k * 0.35 + Math.sin(this.t * 40) * 0.04 * k
        break
      }
      case 'spit': {
        const k = clamp(this.t / 0.6, 0, 1)
        lean = lerpN(0.28, -0.5, Math.min(1, k * 1.4))
        armL = armR = -0.4
        break
      }
      case 'slamWindup': {
        const k = clamp(this.t / 1.25, 0, 1)
        armL = armR = lerpN(-1.3, -3.1, Math.min(1, k * 1.5))
        lean = lerpN(0.06, -0.35, k)
        for (const a of r.extraArms) a.rotation.x = lerpN(-1, -3.0, k)
        break
      }
      case 'recover': {
        if (this.kind === 'boss') {
          const k = clamp(this.t / 0.4, 0, 1)
          armL = armR = lerpN(-3.1, -0.2, k)
          lean = lerpN(0.7, 0.1, k)
        }
        break
      }
      case 'roar': {
        const k = clamp(this.t / 0.4, 0, 1)
        armL = armR = lerpN(-1.3, -2.6, k) + Math.sin(this.t * 22) * 0.12
        lean = -0.35
        break
      }
      case 'chargeWindup': {
        lean = 0.1
        armL = armR = -0.6
        r.body.position.y = Math.sin(this.t * 40) * 0.05
        break
      }
      case 'charge': {
        lean = 0.55
        armL = armR = 0.2
        r.legL.rotation.x = Math.sin(this.t * 18) * 0.9
        r.legR.rotation.x = -Math.sin(this.t * 18) * 0.9
        break
      }
      case 'stun': {
        lean = 0.3 + Math.sin(this.t * 10) * 0.05
        armL = armR = 0.3
        break
      }
    }
    if (this.state !== 'shriek') r.head.rotation.x = 0
    if (this.state !== 'slamWindup') for (const a of r.extraArms) a.rotation.x = armBase * 0.8 - sw * 0.15
    r.upper.rotation.x = lean
    r.armL.rotation.x = armL
    r.armR.rotation.x = armR
    r.body.scale.y = this.def.scale * scaleY
    r.body.scale.x = r.body.scale.z = this.def.scale * (this.state === 'fuse' ? scaleY : 1)

    // glow pulsing
    if (r.glows.length) {
      const pulse = 1.1 + Math.sin(this.t * 6 + this.id) * 0.6 + (this.state === 'fuse' ? Math.sin(this.t * 40) * 1.2 + 1.2 : 0) + (this.state === 'summon' ? 2.2 : 0)
      for (const m of r.glows) m.emissiveIntensity = Math.max(0.3, pulse)
    }
  }

  /* --------------------------------------------------------------- death */
  startDeath() {
    this.state = 'dying'
    this.deathT = 0
    this.rig.bar.visible = false
    const r = this.rig
    if (r.slamFill) { r.slamFill.visible = false; r.slamRing!.visible = false; r.chargeLine!.visible = false }
    this.alive = false
  }

  private updateDeath(dt: number) {
    this.deathT += dt
    const r = this.rig
    const k = clamp(this.deathT / 0.45, 0, 1)
    const e = 1 - Math.pow(1 - k, 3)
    r.body.rotation.x = -Math.PI / 2 * e * (this.kind === 'bloater' ? 0.2 : 1)
    r.body.rotation.y = this.angle
    // keep sliding from the last hit
    this.x += this.kx * dt
    this.z += this.kz * dt
    const kd = Math.exp(-5 * dt)
    this.kx *= kd
    this.kz *= kd
    r.root.position.set(this.x, 0, this.z)
    r.armL.rotation.x = lerpN(r.armL.rotation.x, -2.2, 0.2)
    r.armR.rotation.x = lerpN(r.armR.rotation.x, -2.0, 0.2)
    const sink = clamp((this.deathT - 0.9) / 0.6, 0, 1)
    r.body.position.y = -sink * 1.2 * this.def.scale
    if (this.deathT > 1.5) this.dead = true
  }
}

function lerpN(a: number, b: number, t: number) {
  return a + (b - a) * t
}

/* ------------------------------------------------------------------ pool */
export class ZombiePool {
  private free: Record<ZombieKind, Zombie[]> = { walker: [], runner: [], spitter: [], bloater: [], brute: [], boss: [], leaper: [], riot: [], screamer: [], splitter: [], crawler: [], witch: [], skeleton: [] }

  constructor(private scene: THREE.Scene) {}

  get(kind: ZombieKind, x: number, z: number, wave: number): Zombie {
    let zb = this.free[kind].pop()
    if (!zb) zb = new Zombie(kind)
    zb.angle = rand(0, TAU)
    zb.reset(x, z, wave)
    this.scene.add(zb.rig.root)
    return zb
  }

  release(z: Zombie) {
    this.scene.remove(z.rig.root)
    z.rig.root.visible = false
    this.free[z.kind].push(z)
  }

  /** facing helper exposed for the game */
  static angleTo(ax: number, az: number, bx: number, bz: number) {
    return Math.atan2(bx - ax, bz - az)
  }
}

export { angleDiff }
