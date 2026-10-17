import * as THREE from 'three'
import { WEAPONS } from './config'
import { resolveCircle } from './collision'
import { addBox, newMat, stdMat } from './voxel'
import { clamp, dampAngle, lerp } from './util'
import type { Game } from './game'

const MOVE_SPEED = 7.2
const DASH_SPEED = 25
const DASH_TIME = 0.17
const BASE_DASH_CD = 2.4

export class Player {
  group = new THREE.Group()
  private body = new THREE.Group()
  private upper = new THREE.Group()
  private legL = new THREE.Group()
  private legR = new THREE.Group()
  private armL = new THREE.Group()
  private armR = new THREE.Group()
  private guns: THREE.Group[] = []
  private ring: THREE.Mesh
  private mats: THREE.MeshStandardMaterial[] = []

  x = 0
  z = 0
  vx = 0
  vz = 0
  private kx = 0
  private kz = 0
  angle = Math.PI
  alive = true

  hp = 100
  maxHp = 100
  frags = 3
  perks: Record<string, number> = {}

  weapon = 0
  lastWeapon = 1
  mags: number[] = WEAPONS.map((w) => w.mag)
  reserves: number[] = WEAPONS.map((w) => w.reserve)
  fireCd = 0
  reloadT = -1
  reloadDur = 0
  switchCd = 0
  heat = 0
  kick = 0
  side = 0 // alternating SMG muzzle

  dashT = 0
  dashCd = 0
  dashX = 0
  dashZ = 0
  private dashReadyPing = true
  iframes = 0
  sinceHurt = 99
  grenadeCd = 0
  private phase = 0
  private regenAcc = 0
  private deathT = 0
  private trailT = 0

  constructor(scene: THREE.Scene) {
    this.build()
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.74, 40),
      new THREE.MeshBasicMaterial({ color: 0x5ee9ff, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }),
    )
    this.ring.rotation.x = -Math.PI / 2
    this.ring.position.y = 0.07
    scene.add(this.group, this.ring)
  }

  /* ------------------------------------------------------------ model */
  private build() {
    const skin = newMat(0xe0b08a)
    const shirt = newMat(0x45523d)
    const vest = newMat(0x2b3340, { rough: 0.7 })
    const pants = newMat(0x262c36)
    const boots = newMat(0x17191f)
    const orange = newMat(0xf08a2a)
    const helmet = newMat(0x39424f, { rough: 0.5, metal: 0.3 })
    this.mats = [skin, shirt, vest, pants, boots, orange, helmet]

    this.group.add(this.body)
    this.upper.position.y = 0.72
    this.body.add(this.upper)

    const mkLeg = (x: number, g: THREE.Group) => {
      g.position.set(x, 0.72, 0)
      addBox(g, 0.25, 0.52, 0.28, pants, 0, -0.26, 0)
      addBox(g, 0.27, 0.22, 0.4, boots, 0, -0.61, 0.06)
      addBox(g, 0.27, 0.12, 0.3, vest, 0, -0.24, 0.0)
      this.body.add(g)
    }
    mkLeg(-0.16, this.legL)
    mkLeg(0.16, this.legR)

    addBox(this.upper, 0.68, 0.74, 0.38, shirt, 0, 0.37, 0)
    addBox(this.upper, 0.72, 0.5, 0.44, vest, 0, 0.42, 0)
    addBox(this.upper, 0.3, 0.22, 0.04, orange, 0, 0.6, 0.23, false)
    addBox(this.upper, 0.46, 0.5, 0.2, vest, 0, 0.45, -0.3)
    addBox(this.upper, 0.72, 0.1, 0.4, pants, 0, 0.05, 0)

    const head = new THREE.Group()
    head.position.set(0, 0.76, 0)
    this.upper.add(head)
    addBox(head, 0.44, 0.44, 0.44, skin, 0, 0.22, 0)
    addBox(head, 0.5, 0.26, 0.5, helmet, 0, 0.48, -0.01)
    addBox(head, 0.52, 0.1, 0.12, helmet, 0, 0.38, 0.25)
    addBox(head, 0.38, 0.12, 0.05, new THREE.MeshBasicMaterial({ color: 0x4ff0ff, toneMapped: false }), 0, 0.28, 0.23, false)

    const mkArm = (x: number, g: THREE.Group) => {
      g.position.set(x, 0.68, 0)
      addBox(g, 0.2, 0.36, 0.2, shirt, 0, -0.18, 0)
      addBox(g, 0.19, 0.34, 0.19, skin, 0, -0.52, 0)
      addBox(g, 0.22, 0.22, 0.22, boots, 0, -0.72, 0)
      addBox(g, 0.24, 0.1, 0.24, orange, 0, -0.04, 0, false)
      this.upper.add(g)
    }
    mkArm(-0.46, this.armL)
    mkArm(0.46, this.armR)

    // weapon models
    const metal = stdMat(0x1c2027, { rough: 0.4, metal: 0.7 })
    const dark = stdMat(0x2c323c, { rough: 0.5, metal: 0.5 })
    const wood = stdMat(0x6a4a2c)
    const cyan = new THREE.MeshBasicMaterial({ color: 0x5ff3ff, toneMapped: false })

    const carbine = new THREE.Group()
    addBox(carbine, 0.13, 0.17, 0.7, metal, 0, 0, 0.1)
    addBox(carbine, 0.06, 0.06, 0.4, dark, 0, 0.02, 0.62)
    addBox(carbine, 0.1, 0.2, 0.28, dark, 0, -0.02, -0.34)
    addBox(carbine, 0.09, 0.3, 0.13, dark, 0, -0.22, 0.12)
    addBox(carbine, 0.05, 0.07, 0.2, metal, 0, 0.12, 0.1)
    this.guns.push(carbine)

    const shotgun = new THREE.Group()
    addBox(shotgun, 0.14, 0.17, 0.6, dark, 0, 0, 0.0)
    addBox(shotgun, 0.09, 0.09, 0.75, metal, 0, 0.05, 0.62)
    addBox(shotgun, 0.08, 0.07, 0.6, metal, 0, -0.04, 0.55)
    addBox(shotgun, 0.17, 0.13, 0.3, wood, 0, -0.06, 0.45)
    addBox(shotgun, 0.11, 0.2, 0.34, wood, 0, -0.04, -0.4)
    this.guns.push(shotgun)

    const vectors = new THREE.Group()
    for (const s of [-1, 1]) {
      addBox(vectors, 0.11, 0.15, 0.46, metal, s * 0.34, 0, 0.1)
      addBox(vectors, 0.05, 0.05, 0.22, dark, s * 0.34, 0.02, 0.45)
      addBox(vectors, 0.07, 0.32, 0.09, dark, s * 0.34, -0.22, 0.05)
      addBox(vectors, 0.04, 0.05, 0.3, new THREE.MeshBasicMaterial({ color: 0x6fd8ff, toneMapped: false }), s * 0.34, 0.09, 0.12, false)
    }
    this.guns.push(vectors)

    const rail = new THREE.Group()
    addBox(rail, 0.17, 0.22, 1.0, dark, 0, 0, 0.1)
    for (const s of [-1, 1]) addBox(rail, 0.05, 0.05, 1.3, cyan, s * 0.09, 0.0, 0.6, false)
    for (const z of [0.3, 0.55, 0.8, 1.05]) addBox(rail, 0.25, 0.25, 0.05, cyan, 0, 0, z, false)
    addBox(rail, 0.12, 0.3, 0.3, dark, 0, -0.06, -0.4)
    this.guns.push(rail)

    for (const g of this.guns) {
      g.position.set(0, 0.62, 0.5)
      g.visible = false
      this.upper.add(g)
    }
    this.guns[0].visible = true
  }

  /* ----------------------------------------------------------- perks */
  perk(id: string) {
    return this.perks[id] ?? 0
  }
  get dmgMul() { return 1 + 0.2 * this.perk('dmg') }
  get rateMul() { return 1 + 0.15 * this.perk('rate') }
  get reloadMul() { return Math.pow(0.75, this.perk('reload')) }
  get speed() { return MOVE_SPEED * (1 + 0.1 * this.perk('speed')) }
  get dashCooldown() { return BASE_DASH_CD * Math.pow(0.7, this.perk('dash')) }
  get blastMul() { return 1 + 0.25 * this.perk('frag') }
  get critChance() { return 0.06 + 0.12 * this.perk('crit') }
  get pierceBonus() { return this.perk('pierce') }
  get knockMul() { return 1 + 0.4 * this.perk('knock') }
  get maxFrags() { return 6 + 2 * this.perk('frag') }
  magCap(w: number) {
    return Math.round(WEAPONS[w].mag * (1 + 0.3 * this.perk('mag')))
  }
  get reserveCap() { return 1 }

  applyPerk(id: string) {
    this.perks = { ...this.perks, [id]: this.perk(id) + 1 }
    switch (id) {
      case 'hp':
        this.maxHp += 30
        this.hp = Math.min(this.maxHp, this.hp + 30)
        break
      case 'frag':
        this.frags = Math.min(this.maxFrags, this.frags + 2)
        break
      case 'mag':
        // top the current mags up a little as a bonus
        for (let i = 0; i < this.mags.length; i++) this.mags[i] = Math.min(this.magCap(i), this.mags[i] + Math.ceil(WEAPONS[i].mag * 0.3))
        break
    }
  }

  heal(n: number) {
    this.hp = Math.min(this.maxHp, this.hp + n)
  }

  reset() {
    this.x = 0
    this.z = 0
    this.vx = this.vz = this.kx = this.kz = 0
    this.angle = Math.PI
    this.alive = true
    this.hp = this.maxHp = 100
    this.frags = 3
    this.perks = {}
    this.weapon = 0
    this.lastWeapon = 1
    this.mags = WEAPONS.map((w) => w.mag)
    this.reserves = WEAPONS.map((w) => w.reserve)
    this.fireCd = 0
    this.reloadT = -1
    this.switchCd = 0
    this.heat = 0
    this.dashT = 0
    this.dashCd = 0
    this.iframes = 0
    this.sinceHurt = 99
    this.grenadeCd = 0
    this.deathT = 0
    this.body.rotation.set(0, 0, 0)
    this.body.position.y = 0
    this.group.visible = true
    this.setWeaponModel()
  }

  /* --------------------------------------------------------- actions */
  hurt(amount: number, fx: number, fz: number, knock: number, g: Game, dot = false) {
    if (!this.alive || g.state !== 'playing') return
    if (this.dashT > 0) return
    if (!dot && this.iframes > 0) return
    this.hp -= amount
    this.sinceHurt = 0
    if (!dot) {
      this.iframes = 0.22
      const dx = this.x - fx
      const dz = this.z - fz
      const l = Math.hypot(dx, dz) || 1
      this.kx += (dx / l) * knock
      this.kz += (dz / l) * knock
      g.audio.hurt()
      g.shake(Math.min(0.6, 0.15 + amount / 60))
      g.effects.blood(this.x, 1.2, this.z, dx / l, dz / l, 6, 0xb52a2a)
    }
    g.effects.number(this.x, 2.2, this.z, String(Math.round(amount)), 'hurt')
    g.onPlayerHurt()
    if (this.hp <= 0) {
      this.hp = 0
      this.alive = false
      g.playerDied()
    }
  }

  selectWeapon(i: number, g: Game) {
    if (i === this.weapon || i < 0 || i >= WEAPONS.length || this.switchCd > 0) return
    this.lastWeapon = this.weapon
    this.weapon = i
    this.reloadT = -1
    this.fireCd = Math.max(this.fireCd, 0.18)
    this.switchCd = 0.12
    this.setWeaponModel()
    g.audio.reload()
  }

  private setWeaponModel() {
    this.guns.forEach((gn, i) => (gn.visible = i === this.weapon))
  }

  startReload(g: Game) {
    const w = this.weapon
    if (this.reloadT >= 0 || this.mags[w] >= this.magCap(w) || this.reserves[w] <= 0) return
    this.reloadDur = WEAPONS[w].reload * this.reloadMul
    this.reloadT = 0
    g.audio.reload()
  }

  muzzlePos(): { x: number; z: number; y: number } {
    const w = this.weapon
    const f = [1.25, 1.35, 1.1, 1.65][w]
    let lat = 0
    if (w === 2) lat = this.side ? 0.34 : -0.34
    const fx = Math.sin(this.angle)
    const fz = Math.cos(this.angle)
    return {
      x: this.x + fx * f + fz * lat,
      z: this.z + fz * f - fx * lat,
      y: 1.38,
    }
  }

  /* ---------------------------------------------------------- update */
  update(dt: number, g: Game, controllable: boolean) {
    const inp = g.input
    this.iframes -= dt
    this.sinceHurt += dt
    this.fireCd -= dt
    this.switchCd -= dt
    this.grenadeCd -= dt
    this.kick = Math.max(0, this.kick - dt * 9)
    this.heat = Math.max(0, this.heat - dt * 1.6)

    // movement input (screen-relative)
    let mx = 0
    let mz = 0
    if (controllable) {
      const yaw = g.camYaw
      const fx = -Math.sin(yaw)
      const fz = -Math.cos(yaw)
      const rx = Math.cos(yaw)
      const rz = -Math.sin(yaw)
      let f = 0
      let r = 0
      if (inp.down('KeyW') || inp.down('ArrowUp')) f += 1
      if (inp.down('KeyS') || inp.down('ArrowDown')) f -= 1
      if (inp.down('KeyD') || inp.down('ArrowRight')) r += 1
      if (inp.down('KeyA') || inp.down('ArrowLeft')) r -= 1
      mx = fx * f + rx * r
      mz = fz * f + rz * r
      const l = Math.hypot(mx, mz)
      if (l > 0) { mx /= l; mz /= l }
    }

    // aim
    if (controllable) {
      const ax = g.aim.x - this.x
      const az = g.aim.z - this.z
      if (Math.hypot(ax, az) > 0.3) this.angle = dampAngle(this.angle, Math.atan2(ax, az), 22, dt)
    }

    // dash
    this.dashCd = Math.max(0, this.dashCd - dt)
    if (controllable) {
      if (inp.pressed('Space') && this.dashCd <= 0 && this.dashT <= 0) {
        let dx = mx
        let dz = mz
        if (dx === 0 && dz === 0) { dx = Math.sin(this.angle); dz = Math.cos(this.angle) }
        this.dashX = dx
        this.dashZ = dz
        this.dashT = DASH_TIME
        this.dashCd = this.dashCooldown
        this.dashReadyPing = false
        g.audio.dash()
        g.shake(0.15)
      }
    }
    if (this.dashCd <= 0 && !this.dashReadyPing) {
      this.dashReadyPing = true
      g.audio.dashReady()
    }

    let tvx = mx * this.speed
    let tvz = mz * this.speed
    if (this.reloadT >= 0) { tvx *= 0.88; tvz *= 0.88 }
    if (this.dashT > 0) {
      this.dashT -= dt
      tvx = this.dashX * DASH_SPEED
      tvz = this.dashZ * DASH_SPEED
      this.vx = tvx
      this.vz = tvz
      this.trailT -= dt
      if (this.trailT <= 0) {
        this.trailT = 0.025
        g.effects.glow.emit({ x: this.x, y: 1.0, z: this.z, life: 0.3, size: 0.55, grav: 0, color: 0x5ee9ff, fade: true })
        g.effects.smoke(this.x, 0.2, this.z, 1, 0x7a8394, 0.5, 0.35)
      }
    } else {
      const a = 1 - Math.exp(-16 * dt)
      this.vx += (tvx - this.vx) * a
      this.vz += (tvz - this.vz) * a
    }
    this.x += (this.vx + this.kx) * dt
    this.z += (this.vz + this.kz) * dt
    const kd = Math.exp(-8 * dt)
    this.kx *= kd
    this.kz *= kd
    resolveCircle(this, 0.45, g.world.colliders)
    const b = g.world.bound
    this.x = clamp(this.x, -b, b)
    this.z = clamp(this.z, -b, b)

    if (controllable) this.combatInput(dt, g)

    // regen perk
    const rg = this.perk('regen')
    if (rg > 0 && this.sinceHurt > 3 && this.hp < this.maxHp) {
      this.regenAcc += dt * rg * 1.5
      if (this.regenAcc >= 1) {
        this.hp = Math.min(this.maxHp, this.hp + Math.floor(this.regenAcc))
        this.regenAcc -= Math.floor(this.regenAcc)
      }
    }

    this.animate(dt, mx, mz)
  }

  private combatInput(dt: number, g: Game) {
    const inp = g.input
    const w = this.weapon
    const def = WEAPONS[w]

    // weapon switching
    for (let i = 0; i < 4; i++) if (inp.pressed(`Digit${i + 1}`)) this.selectWeapon(i, g)
    if (inp.pressed('KeyQ')) this.selectWeapon(this.lastWeapon, g)

    // reload
    if (this.reloadT >= 0) {
      this.reloadT += dt
      if (this.reloadT >= this.reloadDur) {
        const need = this.magCap(w) - this.mags[w]
        const take = Math.min(need, this.reserves[w])
        this.mags[w] += take
        if (Number.isFinite(this.reserves[w])) this.reserves[w] -= take
        this.reloadT = -1
        g.audio.reloadDone()
      } else if (Math.floor((this.reloadT - dt) * 3) !== Math.floor(this.reloadT * 3) && w !== 3) {
        // little mechanical ticks while reloading
        g.audio.reload()
      }
    }
    if (inp.pressed('KeyR')) this.startReload(g)

    // fire
    if (inp.fire && this.fireCd <= 0 && this.reloadT < 0 && this.switchCd <= 0) {
      if (this.mags[w] > 0) {
        this.mags[w]--
        this.fireCd = def.interval / this.rateMul
        g.combat.fire()
        this.kick = 1
        this.heat = Math.min(1, this.heat + (w === 2 ? 0.06 : 0.1))
        if (this.mags[w] === 0 && this.reserves[w] > 0) this.startReload(g)
      } else if (this.reserves[w] > 0) {
        this.startReload(g)
      } else {
        this.fireCd = 0.3
        g.audio.empty()
        g.effects.number(this.x, 2.4, this.z, 'NO AMMO', 'info')
        // fall back to the carbine so the player is never defenceless
        this.selectWeapon(0, g)
      }
    }

    // grenade
    if ((inp.pressed('KeyG') || inp.altPressed) && this.frags > 0 && this.grenadeCd <= 0) {
      this.frags--
      this.grenadeCd = 0.6
      g.combat.throwGrenade()
    }
  }

  /* ------------------------------------------------------- animation */
  private animate(dt: number, mx: number, mz: number) {
    const spd = Math.hypot(this.vx, this.vz)
    this.phase += dt * (4 + spd * 1.3)
    const sw = Math.sin(this.phase)
    // legs swing relative to facing direction
    const fx = Math.sin(this.angle)
    const fz = Math.cos(this.angle)
    const along = (this.vx * fx + this.vz * fz) / (spd || 1)
    const amp = clamp(spd / 6, 0, 1) * 0.85
    this.legL.rotation.x = sw * amp * (along >= 0 ? 1 : -1)
    this.legR.rotation.x = -sw * amp * (along >= 0 ? 1 : -1)

    this.body.rotation.y = this.angle
    this.group.position.set(this.x, 0, this.z)
    this.ring.position.set(this.x, 0.07, this.z)
    this.body.position.y = Math.abs(sw) * 0.05 * clamp(spd / 6, 0, 1)

    // arms hold the weapon forward; recoil kicks them up
    const reloading = this.reloadT >= 0
    const rp = reloading ? clamp(this.reloadT / this.reloadDur, 0, 1) : 0
    const tilt = reloading ? Math.sin(rp * Math.PI) * 0.7 : 0
    const base = -1.5 + this.kick * 0.1 + tilt
    this.armL.rotation.x = base
    this.armR.rotation.x = base
    this.armL.rotation.z = this.weapon === 2 ? -0.15 : 0.22
    this.armR.rotation.z = this.weapon === 2 ? 0.15 : -0.2
    const gun = this.guns[this.weapon]
    gun.position.z = 0.5 - this.kick * 0.1
    gun.rotation.x = -tilt * 0.8 - this.kick * 0.05
    const dashing = this.dashT > 0
    this.upper.rotation.x = dashing ? 0.55 : 0.05 + this.kick * 0.03
    this.upper.rotation.z = Math.sin(this.phase * 0.5) * 0.02
    if (dashing) {
      this.legL.rotation.x = 1.0
      this.legR.rotation.x = -0.8
      this.body.rotation.y = Math.atan2(this.dashX, this.dashZ)
    }

    // i-frame flicker
    const flick = this.iframes > 0 ? (Math.floor(this.iframes * 40) % 2 ? 1 : 0) : 0
    for (const m of this.mats) {
      m.emissive.setRGB(flick * 0.55, flick * 0.1, flick * 0.1)
      m.emissiveIntensity = 1
    }

    // ring pulses, brighter when the dash is ready
    const rm = this.ring.material as THREE.MeshBasicMaterial
    rm.opacity = lerp(rm.opacity, this.dashCd <= 0 ? 0.6 : 0.28, 0.2)
  }

  updateDeath(dt: number) {
    this.deathT += dt
    const k = clamp(this.deathT / 0.6, 0, 1)
    this.body.rotation.x = -Math.PI / 2 * (1 - Math.pow(1 - k, 3))
    this.body.position.y = 0
    this.armL.rotation.x = lerp(this.armL.rotation.x, -2.4, 0.15)
    this.armR.rotation.x = lerp(this.armR.rotation.x, -2.0, 0.15)
    ;(this.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.5 - this.deathT)
  }
}
