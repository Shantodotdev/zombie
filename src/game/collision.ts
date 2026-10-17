export interface Collider {
  kind: 'box' | 'circle'
  x: number
  z: number
  hx: number
  hz: number
  r: number
  blocksBullets: boolean
  active: boolean
  tag?: unknown
}

export const boxCol = (x: number, z: number, hx: number, hz: number, blocksBullets = false): Collider => ({
  kind: 'box', x, z, hx, hz, r: 0, blocksBullets, active: true,
})

export const circleCol = (x: number, z: number, r: number, blocksBullets = false): Collider => ({
  kind: 'circle', x, z, hx: 0, hz: 0, r, blocksBullets, active: true,
})

export interface P2 { x: number; z: number }

/** Last contact normal produced by resolveCircle (pointing out of the collider). */
export const contact = { nx: 0, nz: 0 }

/** Push a circle out of all colliders. Returns true when anything was hit. */
export function resolveCircle(pos: P2, r: number, cols: Collider[]): boolean {
  let hit = false
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i]
    if (!c.active) continue
    if (c.kind === 'box') {
      const cx = Math.max(c.x - c.hx, Math.min(pos.x, c.x + c.hx))
      const cz = Math.max(c.z - c.hz, Math.min(pos.z, c.z + c.hz))
      const dx = pos.x - cx
      const dz = pos.z - cz
      const d2 = dx * dx + dz * dz
      if (d2 >= r * r) continue
      hit = true
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2)
        const k = (r - d) / d
        pos.x += dx * k
        pos.z += dz * k
        contact.nx = dx / d
        contact.nz = dz / d
      } else {
        // centre is inside the box: push along the shallowest axis
        const px = c.hx - Math.abs(pos.x - c.x)
        const pz = c.hz - Math.abs(pos.z - c.z)
        if (px < pz) {
          const s = pos.x >= c.x ? 1 : -1
          pos.x = c.x + s * (c.hx + r)
          contact.nx = s; contact.nz = 0
        } else {
          const s = pos.z >= c.z ? 1 : -1
          pos.z = c.z + s * (c.hz + r)
          contact.nx = 0; contact.nz = s
        }
      }
    } else {
      const dx = pos.x - c.x
      const dz = pos.z - c.z
      const rr = r + c.r
      const d2 = dx * dx + dz * dz
      if (d2 >= rr * rr) continue
      hit = true
      const d = Math.sqrt(d2) || 1e-4
      const k = (rr - d) / d
      pos.x += dx * k
      pos.z += dz * k
      contact.nx = dx / d
      contact.nz = dz / d
    }
  }
  return hit
}

/** Ray vs. colliders (2D). Returns distance to the nearest hit or Infinity. */
export function rayCols(
  ox: number, oz: number, dx: number, dz: number, maxT: number,
  cols: Collider[], bulletsOnly: boolean,
): number {
  let best = maxT
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i]
    if (!c.active || (bulletsOnly && !c.blocksBullets)) continue
    let t = Infinity
    if (c.kind === 'box') {
      t = rayBox(ox, oz, dx, dz, c.x - c.hx, c.z - c.hz, c.x + c.hx, c.z + c.hz)
    } else {
      t = rayCircle(ox, oz, dx, dz, c.x, c.z, c.r)
    }
    if (t < best) best = t
  }
  return best
}

export function rayBox(
  ox: number, oz: number, dx: number, dz: number,
  minX: number, minZ: number, maxX: number, maxZ: number,
): number {
  let t0 = 0
  let t1 = Infinity
  if (Math.abs(dx) < 1e-9) {
    if (ox < minX || ox > maxX) return Infinity
  } else {
    let a = (minX - ox) / dx
    let b = (maxX - ox) / dx
    if (a > b) { const s = a; a = b; b = s }
    t0 = Math.max(t0, a)
    t1 = Math.min(t1, b)
  }
  if (Math.abs(dz) < 1e-9) {
    if (oz < minZ || oz > maxZ) return Infinity
  } else {
    let a = (minZ - oz) / dz
    let b = (maxZ - oz) / dz
    if (a > b) { const s = a; a = b; b = s }
    t0 = Math.max(t0, a)
    t1 = Math.min(t1, b)
  }
  return t0 <= t1 ? t0 : Infinity
}

/** Ray (unit dir) vs circle: nearest non-negative t, or Infinity. */
export function rayCircle(
  ox: number, oz: number, dx: number, dz: number, cx: number, cz: number, r: number,
): number {
  const fx = ox - cx
  const fz = oz - cz
  const b = fx * dx + fz * dz
  const c = fx * fx + fz * fz - r * r
  const disc = b * b - c
  if (disc < 0) return Infinity
  const s = Math.sqrt(disc)
  const t = -b - s
  if (t >= 0) return t
  const t2 = -b + s
  return t2 >= 0 ? 0 : Infinity
}
