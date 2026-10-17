import type { Collider } from './collision'

/**
 * Coarse navigation grid. A Dijkstra flood is run outward from the player every
 * few frames; zombies follow the gradient whenever the straight line to the
 * player is not a good option (walls / buildings in the way).
 */
export class NavGrid {
  readonly N = 124
  readonly half = 62
  readonly blocked = new Uint8Array(this.N * this.N)
  readonly dist = new Float32Array(this.N * this.N)
  private hk = new Float32Array(this.N * this.N * 6)
  private hv = new Int32Array(this.N * this.N * 6)
  private hn = 0

  private static DX = [1, -1, 0, 0, 1, 1, -1, -1]
  private static DZ = [0, 0, 1, -1, 1, -1, 1, -1]
  private static COST = [1, 1, 1, 1, 1.4142, 1.4142, 1.4142, 1.4142]

  cellOf(v: number) {
    return Math.floor(v + this.half)
  }
  private idx(ix: number, iz: number) {
    return ix + iz * this.N
  }
  private inside(ix: number, iz: number) {
    return ix >= 0 && iz >= 0 && ix < this.N && iz < this.N
  }

  rebuild(cols: Collider[], inflate = 0.8) {
    this.blocked.fill(0)
    const N = this.N
    for (const c of cols) {
      if (!c.active) continue
      const ex = (c.kind === 'box' ? c.hx : c.r) + inflate + 0.5
      const ez = (c.kind === 'box' ? c.hz : c.r) + inflate + 0.5
      const x0 = Math.max(0, this.cellOf(c.x - ex))
      const x1 = Math.min(N - 1, this.cellOf(c.x + ex))
      const z0 = Math.max(0, this.cellOf(c.z - ez))
      const z1 = Math.min(N - 1, this.cellOf(c.z + ez))
      for (let iz = z0; iz <= z1; iz++) {
        for (let ix = x0; ix <= x1; ix++) {
          const cx = ix - this.half + 0.5
          const cz = iz - this.half + 0.5
          let d: number
          if (c.kind === 'box') {
            const dx = Math.max(Math.abs(cx - c.x) - c.hx, 0)
            const dz = Math.max(Math.abs(cz - c.z) - c.hz, 0)
            d = Math.hypot(dx, dz)
          } else {
            d = Math.hypot(cx - c.x, cz - c.z) - c.r
          }
          if (d < inflate) this.blocked[this.idx(ix, iz)] = 1
        }
      }
    }
  }

  private push(k: number, v: number) {
    let i = this.hn++
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.hk[p] <= k) break
      this.hk[i] = this.hk[p]
      this.hv[i] = this.hv[p]
      i = p
    }
    this.hk[i] = k
    this.hv[i] = v
  }

  private pop(): number {
    const top = this.hv[0]
    const k = this.hk[--this.hn]
    const v = this.hv[this.hn]
    let i = 0
    const n = this.hn
    for (;;) {
      let c = i * 2 + 1
      if (c >= n) break
      if (c + 1 < n && this.hk[c + 1] < this.hk[c]) c++
      if (this.hk[c] >= k) break
      this.hk[i] = this.hk[c]
      this.hv[i] = this.hv[c]
      i = c
    }
    this.hk[i] = k
    this.hv[i] = v
    return top
  }

  compute(px: number, pz: number) {
    const N = this.N
    this.dist.fill(Infinity)
    let sx = this.cellOf(px)
    let sz = this.cellOf(pz)
    sx = Math.max(0, Math.min(N - 1, sx))
    sz = Math.max(0, Math.min(N - 1, sz))
    if (this.blocked[this.idx(sx, sz)]) {
      // find the nearest free cell
      let found = false
      for (let r = 1; r < 6 && !found; r++) {
        for (let dz = -r; dz <= r && !found; dz++) {
          for (let dx = -r; dx <= r && !found; dx++) {
            const ax = sx + dx
            const az = sz + dz
            if (this.inside(ax, az) && !this.blocked[this.idx(ax, az)]) {
              sx = ax; sz = az; found = true
            }
          }
        }
      }
    }
    this.hn = 0
    const s = this.idx(sx, sz)
    this.dist[s] = 0
    this.push(0, s)
    while (this.hn > 0) {
      const cur = this.pop()
      const cd = this.dist[cur]
      const cx = cur % N
      const cz = (cur / N) | 0
      for (let k = 0; k < 8; k++) {
        const nx = cx + NavGrid.DX[k]
        const nz = cz + NavGrid.DZ[k]
        if (!this.inside(nx, nz)) continue
        const ni = nx + nz * N
        if (this.blocked[ni]) continue
        if (k >= 4) {
          // forbid corner cutting
          if (this.blocked[nx + cz * N] || this.blocked[cx + nz * N]) continue
        }
        const nd = cd + NavGrid.COST[k]
        if (nd < this.dist[ni]) {
          this.dist[ni] = nd
          this.push(nd, ni)
        }
      }
    }
  }

  /** Path-distance at a world position (Infinity if unreachable / blocked). */
  distAt(x: number, z: number): number {
    const ix = this.cellOf(x)
    const iz = this.cellOf(z)
    if (!this.inside(ix, iz)) return Infinity
    return this.dist[this.idx(ix, iz)]
  }

  /**
   * Writes a unit direction toward the lowest-cost neighbour into out.
   * Returns false when the position lies outside the grid or has no route.
   */
  steer(x: number, z: number, out: { x: number; z: number }): boolean {
    const ix = this.cellOf(x)
    const iz = this.cellOf(z)
    if (!this.inside(ix, iz)) return false
    let best = this.dist[this.idx(ix, iz)]
    let bx = 0
    let bz = 0
    let found = false
    for (let k = 0; k < 8; k++) {
      const nx = ix + NavGrid.DX[k]
      const nz = iz + NavGrid.DZ[k]
      if (!this.inside(nx, nz)) continue
      const d = this.dist[this.idx(nx, nz)]
      if (d < best) {
        best = d
        bx = nx
        bz = nz
        found = true
      }
    }
    if (!found) return false
    const tx = bx - this.half + 0.5
    const tz = bz - this.half + 0.5
    let dx = tx - x
    let dz = tz - z
    const l = Math.hypot(dx, dz) || 1
    dx /= l
    dz /= l
    out.x = dx
    out.z = dz
    return true
  }
}
