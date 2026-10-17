import * as THREE from 'three'

const geos = new Map<string, THREE.BoxGeometry>()
export function boxGeo(w: number, h: number, d: number): THREE.BoxGeometry {
  const k = `${w}|${h}|${d}`
  let g = geos.get(k)
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d)
    geos.set(k, g)
  }
  return g
}

export interface MatOpts {
  rough?: number
  metal?: number
  emissive?: number
  ei?: number
  flat?: boolean
}

const mats = new Map<string, THREE.MeshStandardMaterial>()
export function stdMat(color: number, o: MatOpts = {}): THREE.MeshStandardMaterial {
  const k = `${color}|${o.rough ?? 0.85}|${o.metal ?? 0}|${o.emissive ?? -1}|${o.ei ?? 0}`
  let m = mats.get(k)
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: o.rough ?? 0.85,
      metalness: o.metal ?? 0,
      emissive: o.emissive ?? 0x000000,
      emissiveIntensity: o.ei ?? 0,
    })
    mats.set(k, m)
  }
  return m
}

export function newMat(color: number, o: MatOpts = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: o.rough ?? 0.85,
    metalness: o.metal ?? 0,
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.ei ?? 0,
  })
}

export function addBox(
  parent: THREE.Object3D,
  w: number, h: number, d: number,
  material: THREE.Material | number,
  x = 0, y = 0, z = 0,
  cast = true, receive = false,
): THREE.Mesh {
  const m = new THREE.Mesh(boxGeo(w, h, d), typeof material === 'number' ? stdMat(material) : material)
  m.position.set(x, y, z)
  m.castShadow = cast
  m.receiveShadow = receive
  parent.add(m)
  return m
}

export function addCyl(
  parent: THREE.Object3D,
  rTop: number, rBot: number, h: number,
  material: THREE.Material | number,
  x = 0, y = 0, z = 0, seg = 10, cast = true,
): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(rTop, rBot, h, seg),
    typeof material === 'number' ? stdMat(material) : material,
  )
  m.position.set(x, y, z)
  m.castShadow = cast
  parent.add(m)
  return m
}

/** Radial gradient texture used for light pools and soft glows. */
let glowTex: THREE.CanvasTexture | null = null
export function getGlowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.35, 'rgba(255,255,255,0.55)')
  grd.addColorStop(0.7, 'rgba(255,255,255,0.15)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 128, 128)
  glowTex = new THREE.CanvasTexture(c)
  glowTex.colorSpace = THREE.SRGBColorSpace
  return glowTex
}

/** Soft ground light pool (additive disc). */
export function makeLightPool(color: number, radius: number, opacity = 0.35): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 32),
    new THREE.MeshBasicMaterial({
      map: getGlowTexture(),
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  )
  m.rotation.x = -Math.PI / 2
  m.position.y = 0.06
  m.renderOrder = 2
  return m
}
