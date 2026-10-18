import * as THREE from 'three'
import { MAX_LOADOUT, PERKS, WEAPONS, ZOMBIES, buildWave, type PerkDef, type ZombieKind } from './config'
import { AudioEngine } from './audio'
import { Combat } from './combat'
import { Effects } from './effects'
import { Input } from './input'
import { Laser } from './laser'
import { Pickups, type PickupKind } from './pickups'
import { Player } from './player'
import { Projectiles } from './projectiles'
import { hud, type Phase } from './store'
import { clamp, pick, rand, shuffle } from './util'
import { World, type Barrel } from './world'
import { Zombie, ZombiePool } from './zombie'

export type GState = 'menu' | 'playing' | 'paused' | 'upgrade' | 'dying' | 'gameover'

type WaveMode = 'idle' | 'inter' | 'active' | 'clear'

export interface DamageOpts {
  crit?: boolean
  dx: number
  dz: number
  knock: number
  blast?: boolean
  /** fire/lightning: orange numbers, no blood, no hit flash */
  fire?: boolean
  /** bypasses riot shields */
  noShield?: boolean
}

const BLOOD: Record<ZombieKind, number> = {
  walker: 0x6a1212, runner: 0x7a5a10, spitter: 0x4a7a1a, bloater: 0x8a7a1a, brute: 0x5a0e0e, boss: 0x4a1a5a,
  leaper: 0x2a5a7a, riot: 0x4a1218, screamer: 0x5a3a8a, splitter: 0x8a1a4a, crawler: 0x3a5a1a, witch: 0x5a2a7a, skeleton: 0xcfc8b0,
}

const AIM_Y = 1.0

const MAP_COLOR: Record<ZombieKind, string> = {
  walker: '#ff4a5a', runner: '#ffd23a', spitter: '#b6ff3a', bloater: '#ff9a2a', brute: '#ff6a3a', boss: '#ff2a6a',
  leaper: '#4ff0ff', riot: '#6a8aff', screamer: '#c08cff', splitter: '#ff4aa0', crawler: '#9ad06a', witch: '#d070ff', skeleton: '#d8d2c0',
}

export class Game {
  state: GState = 'menu'

  renderer: THREE.WebGLRenderer
  scene = new THREE.Scene()
  camera: THREE.PerspectiveCamera
  world: World
  player: Player
  effects: Effects
  audio = new AudioEngine()
  input: Input
  projectiles: Projectiles
  pickups: Pickups
  combat: Combat
  laser: Laser
  pool: ZombiePool
  zombies: Zombie[] = []

  // camera
  readonly camYaw = Math.PI / 4
  private viewYaw = Math.PI / 4
  private camPitch = (56 * Math.PI) / 180
  private camDist = 50
  private camDistTarget = 50
  private target = new THREE.Vector3()
  private trauma = 0
  aim = { x: 0, z: 0 }
  private sun: THREE.DirectionalLight

  // dom
  private container: HTMLElement
  private numbersLayer: HTMLDivElement
  private crosshair: HTMLDivElement
  private aimRing: HTMLDivElement
  private cursorX = 0
  private cursorY = 0
  private playerSx = 0
  private playerSy = 0
  private minimap: HTMLCanvasElement
  private minimapStatic: HTMLCanvasElement
  private w = 1
  private h = 1
  private ro: ResizeObserver

  // loop
  private raf = 0
  private last = 0
  private realT = 0
  private simT = 0
  private timeScale = 1
  private dyingT = 0

  // waves
  wave = 0
  private queue: ZombieKind[] = []
  private spawnT = 0
  private waveMode: WaveMode = 'idle'
  private modeT = 0
  private navT = 0
  private aliveCount = 0
  private aliveRegular = 0
  boss: Zombie | null = null

  // score
  score = 0
  kills = 0
  private combo = 0
  private comboT = 0
  best = 0
  private heartT = 0
  private seenKinds = new Set<ZombieKind>()

  private timers: Array<{ t: number; fn: () => void }> = []
  private bannerT = 0
  private bannerId = 0
  private hudKeyM = ''
  private hudKeyL = ''
  private hudKeyR = ''
  private mmT = 0
  private disposers: Array<() => void> = []

  constructor(container: HTMLElement) {
    this.container = container
    try {
      this.best = Number(localStorage.getItem('deadblock.best') ?? 0) || 0
      this.audio.muted = localStorage.getItem('deadblock.muted') === '1'
    } catch { /* ignore */ }
    hud.set({ best: this.best, muted: this.audio.muted })

    // renderer ---------------------------------------------------------
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.domElement.className = 'game-canvas'
    container.appendChild(this.renderer.domElement)

    const sky = new THREE.Color(0x0f1626)
    this.scene.background = sky
    this.scene.fog = new THREE.Fog(sky, 90, 220)

    this.camera = new THREE.PerspectiveCamera(30, 1, 1, 420)

    // lighting ---------------------------------------------------------
    this.scene.add(new THREE.HemisphereLight(0x9fb6ff, 0x2a2436, 1.35))
    this.sun = new THREE.DirectionalLight(0xd8e0ff, 2.3)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    const sc = this.sun.shadow.camera
    sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 130
    this.sun.shadow.bias = -0.0005
    this.sun.shadow.normalBias = 0.05
    this.scene.add(this.sun, this.sun.target)
    const rim = new THREE.DirectionalLight(0xff9a60, 1.1)
    rim.position.set(36, 12, 3)
    this.scene.add(rim)

    // DOM overlays owned by the game ------------------------------------
    this.numbersLayer = document.createElement('div')
    this.numbersLayer.className = 'numbers-layer'
    container.appendChild(this.numbersLayer)
    this.crosshair = document.createElement('div')
    this.crosshair.className = 'crosshair'
    this.crosshair.innerHTML =
      '<div class="ch-ring"></div><i class="ch-t t-n"></i><i class="ch-t t-e"></i><i class="ch-t t-s"></i><i class="ch-t t-w"></i><div class="ch-dot"></div><div class="ch-prog"></div>'
    container.appendChild(this.crosshair)
    this.aimRing = document.createElement('div')
    this.aimRing.className = 'aim-ring'
    container.appendChild(this.aimRing)
    this.minimap = document.createElement('canvas')
    this.minimap.className = 'minimap'
    this.minimap.width = this.minimap.height = 180
    container.appendChild(this.minimap)
    this.minimapStatic = document.createElement('canvas')
    this.minimapStatic.width = this.minimapStatic.height = 180

    // systems ----------------------------------------------------------
    this.world = new World(this.scene)
    this.player = new Player(this.scene)
    this.effects = new Effects(this.scene, this.camera, this.numbersLayer, () => [this.w, this.h])
    this.input = new Input(container)
    this.projectiles = new Projectiles(this.scene, this)
    this.pickups = new Pickups(this.scene, this)
    this.combat = new Combat(this)
    this.laser = new Laser(this.scene)
    this.pool = new ZombiePool(this.scene)
    this.drawMinimapStatic()

    this.ro = new ResizeObserver(() => this.resize())
    this.ro.observe(container)
    this.resize()

    const onBlur = () => {
      if (this.state === 'playing') this.pause()
    }
    window.addEventListener('blur', onBlur)
    this.disposers.push(() => window.removeEventListener('blur', onBlur))
    // losing pointer lock mid-game (Esc) pauses so the cursor is usable again
    const onLock = () => {
      if (!document.pointerLockElement && this.state === 'playing') this.pause()
    }
    document.addEventListener('pointerlockchange', onLock)
    this.disposers.push(() => document.removeEventListener('pointerlockchange', onLock))

    this.target.set(0, 0, 0)
    this.updateCamera(0.016, true)
    this.last = performance.now()
    this.raf = requestAnimationFrame(this.frame)

    if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = this
  }

  /* ------------------------------------------------------------ cursor lock */
  private lockPointer() {
    if (document.pointerLockElement === this.container) return
    try {
      const r = this.container.requestPointerLock() as unknown
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => {})
    } catch { /* ignore */ }
  }

  private unlockPointer() {
    if (document.pointerLockElement) document.exitPointerLock()
  }

  private aimRadius() {
    return clamp(Math.min(this.w, this.h) * 0.3, 150, 320)
  }

  /* ------------------------------------------------------------ public API */
  start() {
    this.audio.init()
    this.audio.uiConfirm()
    this.resetRun()
    this.state = 'playing'
    this.waveMode = 'inter'
    this.modeT = 2.2
    this.input.virtX = 0
    this.input.virtY = -this.aimRadius() * 0.55
    this.lockPointer()
    this.banner('Get ready', undefined, 'normal')
    this.pushPhase()
  }

  pause() {
    if (this.state !== 'playing') return
    this.state = 'paused'
    this.input.reset()
    this.unlockPointer()
    this.audio.suspend()
    this.pushPhase()
  }

  resume() {
    if (this.state !== 'paused') return
    this.state = 'playing'
    this.lockPointer()
    this.audio.resume()
    this.pushPhase()
  }

  toMenu() {
    this.resetRun()
    this.state = 'menu'
    this.unlockPointer()
    this.audio.intensity = 0
    this.audio.resume()
    this.pushPhase()
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted)
    try { localStorage.setItem('deadblock.muted', this.audio.muted ? '1' : '0') } catch { /* ignore */ }
    hud.set({ muted: this.audio.muted })
    if (this.audio.ctx) this.audio.uiClick()
  }

  choosePerk(id: string) {
    if (this.state !== 'upgrade') return
    this.player.applyPerk(id)
    hud.set({ perks: this.player.perks, perkChoices: [], gunChoices: [] })
    this.resumeAfterUpgrade()
  }

  /** Take a gun; when the loadout is full `replace` names the owned gun to swap out. */
  chooseGun(index: number, replace?: number) {
    if (this.state !== 'upgrade' || !hud.state.gunChoices.includes(index)) return
    const p = this.player
    if (p.loadout.length >= MAX_LOADOUT && (replace === undefined || !p.owns(replace))) return
    p.addWeapon(index, replace)
    hud.set({ gunChoices: [], perkChoices: [] })
    this.resumeAfterUpgrade()
  }

  /** Loadout full and not keen on any gun: take a stat perk instead. */
  skipToPerks() {
    if (this.state !== 'upgrade') return
    const pool = PERKS.filter((k) => this.player.perk(k.id) < k.max)
    hud.set({ gunChoices: [], perkChoices: shuffle(pool.slice()).slice(0, 3) })
    this.audio.uiClick()
  }

  private resumeAfterUpgrade() {
    this.audio.uiConfirm()
    this.state = 'playing'
    this.waveMode = 'inter'
    this.modeT = 3.4
    this.lockPointer()
    this.banner(`Wave ${this.wave + 1}`, undefined, 'normal')
    this.pushPhase()
  }

  dispose() {
    cancelAnimationFrame(this.raf)
    this.ro.disconnect()
    this.input.dispose()
    this.audio.dispose()
    this.disposers.forEach((d) => d())
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.numbersLayer.remove()
    this.crosshair.remove()
    this.aimRing.remove()
    this.minimap.remove()
  }

  /* --------------------------------------------------------------- helpers */
  shake(a: number) {
    this.trauma = Math.min(1, this.trauma + a)
  }

  after(delay: number, fn: () => void) {
    this.timers.push({ t: delay, fn })
  }

  onPlayerHurt() {
    hud.set({ hurt: hud.state.hurt + 1 })
  }

  private banner(title: string, sub?: string, tone: 'normal' | 'danger' | 'good' = 'normal') {
    this.bannerId++
    this.bannerT = 2.8
    hud.set({ banner: { id: this.bannerId, title, sub, tone } })
  }

  private pushPhase() {
    const map: Record<GState, Phase> = {
      menu: 'menu', playing: 'playing', paused: 'paused', upgrade: 'upgrade', dying: 'playing', gameover: 'gameover',
    }
    hud.set({ phase: map[this.state] })
  }

  private resize() {
    const w = this.container.clientWidth || window.innerWidth
    const h = this.container.clientHeight || window.innerHeight
    this.w = w
    this.h = h
    this.renderer.setSize(w, h, false)
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private resetRun() {
    for (const z of this.zombies) this.pool.release(z)
    this.zombies = []
    this.pickups.clear()
    this.projectiles.clear()
    this.effects.clearAll()
    this.world.reset()
    this.player.reset()
    this.queue = []
    this.wave = 0
    this.waveMode = 'idle'
    this.score = 0
    this.kills = 0
    this.combo = 0
    this.comboT = 0
    this.simT = 0
    this.timeScale = 1
    this.dyingT = 0
    this.boss = null
    this.seenKinds.clear()
    this.timers = []
    this.trauma = 0
    this.navT = 0
    this.target.set(0, 0, 0)
    hud.set({ perks: {}, perkChoices: [], gunChoices: [], banner: null, bossHp: -1, combo: 0, comboFrac: 0 })
  }

  /* ------------------------------------------------------------------ loop */
  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame)
    const dt = Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    this.update(dt)
    this.renderer.render(this.scene, this.camera)
  }

  private update(rawDt: number) {
    this.realT += rawDt
    const inp = this.input

    // global keys
    if (inp.pressed('KeyM')) this.toggleMute()
    if (inp.pressed('KeyL') && this.state === 'playing') {
      this.laser.enabled = !this.laser.enabled
      this.effects.number(this.player.x, 2.5, this.player.z, this.laser.enabled ? 'LASER ON' : 'LASER OFF', 'info')
    }
    if (inp.pressed('Escape') || inp.pressed('KeyP')) {
      if (this.state === 'playing') this.pause()
      else if (this.state === 'paused') this.resume()
    }

    if (this.bannerT > 0) {
      this.bannerT -= rawDt
      if (this.bannerT <= 0) hud.set({ banner: null })
    }

    if (this.state === 'playing' || this.state === 'dying') {
      // ease the slow-motion factor
      const targetScale = this.state === 'dying' ? 0.3 : 1
      this.timeScale += (targetScale - this.timeScale) * Math.min(1, rawDt * 6)
      this.simulate(rawDt * this.timeScale, rawDt)
    } else if (this.state === 'menu') {
      this.effects.update(rawDt)
    } else if (this.state === 'gameover') {
      this.effects.update(rawDt * 0.6)
      for (const z of this.zombies) if (z.state === 'dying') z.update(rawDt, this)
    }

    this.laser.update(this, this.realT)
    this.world.update(this.realT, rawDt, this.camera.position, this.player.x, this.player.z)
    this.updateCamera(rawDt, false)
    this.updateCrosshair()
    this.syncHud()
    this.drawMinimap(rawDt)
    inp.endFrame()
  }

  private simulate(dt: number, rawDt: number) {
    this.simT += dt
    const p = this.player
    this.computeAim()

    if (this.state === 'dying') {
      this.dyingT += rawDt
      p.updateDeath(dt)
      if (this.dyingT > 2.1) this.finishRun()
    } else {
      p.update(dt, this, true)
    }

    // timers
    for (let i = this.timers.length - 1; i >= 0; i--) {
      this.timers[i].t -= dt
      if (this.timers[i].t <= 0) {
        const fn = this.timers[i].fn
        this.timers.splice(i, 1)
        fn()
      }
    }

    // navigation flood
    this.navT -= dt
    if (this.navT <= 0) {
      this.world.nav.compute(p.x, p.z)
      this.navT = 0.25
    }

    // zombies
    let alive = 0
    let regular = 0
    for (const z of this.zombies) {
      z.update(dt, this)
      if (z.alive) {
        alive++
        if (z.kind !== 'skeleton') regular++
      }
    }
    this.aliveCount = alive
    this.aliveRegular = regular
    this.separate()
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      if (this.zombies[i].dead) {
        this.pool.release(this.zombies[i])
        this.zombies.splice(i, 1)
      }
    }

    this.projectiles.update(dt)
    this.pickups.update(dt)
    if (this.state === 'playing') this.waveUpdate(dt)
    this.effects.update(dt)

    // combo
    if (this.comboT > 0) {
      this.comboT -= dt
      if (this.comboT <= 0) this.combo = 0
    }

    // heartbeat at low health
    if (p.alive && p.hp < p.maxHp * 0.3) {
      this.heartT -= dt
      if (this.heartT <= 0) {
        this.audio.heartbeat()
        this.heartT = 0.95
      }
    }
    this.audio.intensity += (clamp(alive / 22, 0, 1) - this.audio.intensity) * Math.min(1, dt * 0.8)
  }

  /* ----------------------------------------------------------------- aim */
  private computeAim() {
    const cam = this.camera
    const p = this.player
    const inp = this.input
    // the cursor is "hijacked": it only exists as an offset from the player, clamped to a circle
    const R = this.aimRadius()
    const l = Math.hypot(inp.virtX, inp.virtY)
    if (l > R) {
      inp.virtX *= R / l
      inp.virtY *= R / l
    }
    const pv = new THREE.Vector3(p.x, AIM_Y, p.z).project(cam)
    this.playerSx = (pv.x * 0.5 + 0.5) * this.w
    this.playerSy = (-pv.y * 0.5 + 0.5) * this.h
    this.cursorX = this.playerSx + inp.virtX
    this.cursorY = this.playerSy + inp.virtY
    const nx = (this.cursorX / this.w) * 2 - 1
    const ny = -(this.cursorY / this.h) * 2 + 1
    const v = new THREE.Vector3(nx, ny, 0.5).unproject(cam)
    v.sub(cam.position).normalize()
    if (v.y < -0.01) {
      const t = (AIM_Y - cam.position.y) / v.y
      this.aim.x = cam.position.x + v.x * t
      this.aim.z = cam.position.z + v.z * t
    }
  }

  /* -------------------------------------------------------------- camera */
  private updateCamera(dt: number, snap: boolean) {
    const p = this.player
    let tx = p.x
    let tz = p.z
    if (this.state === 'playing') {
      const lx = (this.aim.x - p.x) * 0.18
      const lz = (this.aim.z - p.z) * 0.18
      const l = Math.hypot(lx, lz)
      const k = l > 5 ? 5 / l : 1
      tx += lx * k
      tz += lz * k
    }
    const f = snap ? 1 : 1 - Math.exp(-6.5 * dt)
    this.target.x += (tx - this.target.x) * f
    this.target.z += (tz - this.target.z) * f

    if (this.input.wheel !== 0 && (this.state === 'playing' || this.state === 'paused')) {
      this.camDistTarget = clamp(this.camDistTarget + this.input.wheel * 3.5, 32, 66)
    }
    this.camDist += (this.camDistTarget - this.camDist) * (snap ? 1 : 1 - Math.exp(-8 * dt))

    const targetYaw = this.state === 'menu' ? this.camYaw + Math.sin(this.realT * 0.12) * 0.22 : this.camYaw
    this.viewYaw += (targetYaw - this.viewYaw) * (snap ? 1 : 1 - Math.exp(-3 * dt))

    this.trauma = Math.max(0, this.trauma - dt * 1.7)
    const s = this.trauma * this.trauma
    const t = this.realT
    const sx = (Math.sin(t * 53) + Math.sin(t * 37.7)) * 0.5 * s * 1.3
    const sz = (Math.sin(t * 47.3) + Math.sin(t * 29.1)) * 0.5 * s * 1.3
    const sy = Math.sin(t * 61) * s * 0.5

    const aspectMul = Math.max(1, 1.5 / this.camera.aspect)
    const dist = this.camDist * aspectMul
    const cp = Math.cos(this.camPitch)
    const sp = Math.sin(this.camPitch)
    this.camera.position.set(
      this.target.x + Math.sin(this.viewYaw) * cp * dist + sx,
      sp * dist + sy,
      this.target.z + Math.cos(this.viewYaw) * cp * dist + sz,
    )
    this.camera.lookAt(this.target.x + sx * 0.6, 0, this.target.z + sz * 0.6)
    this.camera.updateMatrixWorld()

    // shadow rig follows the player (texel snapped to prevent shimmer)
    const snapG = 68 / 2048
    const cx = Math.round(this.target.x / snapG) * snapG
    const cz = Math.round(this.target.z / snapG) * snapG
    this.sun.position.set(cx - 8, 36, cz + 22)
    this.sun.target.position.set(cx, 0, cz)
    this.sun.target.updateMatrixWorld()
  }

  private updateCrosshair() {
    const on = this.state === 'playing'
    this.crosshair.classList.toggle('on', on)
    this.aimRing.classList.toggle('on', on)
    this.container.classList.toggle('hide-cursor', on)
    if (!on) return
    const p = this.player
    const spread = WEAPONS[p.weapon].spread * (1 + p.heat * 0.9)
    const size = 26 + spread * 2.2
    this.crosshair.style.transform = `translate(${this.cursorX.toFixed(1)}px, ${this.cursorY.toFixed(1)}px)`
    const R = this.aimRadius()
    this.aimRing.style.width = this.aimRing.style.height = `${(R * 2).toFixed(0)}px`
    this.aimRing.style.transform = `translate(${this.playerSx.toFixed(1)}px, ${this.playerSy.toFixed(1)}px) translate(-50%, -50%)`
    this.crosshair.style.setProperty('--size', `${size.toFixed(1)}px`)
    const rf = p.reloadT >= 0 ? clamp(p.reloadT / p.reloadDur, 0, 1) : 0
    this.crosshair.style.setProperty('--prog', `${(rf * 360).toFixed(0)}deg`)
    this.crosshair.classList.toggle('reloading', p.reloadT >= 0)
    this.crosshair.classList.toggle('dry', p.mags[p.weapon] === 0 && p.reloadT < 0)
  }

  /* --------------------------------------------------------------- zombies */
  spawnZombie(kind: ZombieKind, x: number, z: number): Zombie {
    const zb = this.pool.get(kind, x, z, Math.max(1, this.wave))
    this.zombies.push(zb)
    return zb
  }

  spawnReinforcements(boss: Zombie, n: number) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.3, 0.3)
      const d = rand(3.5, 6)
      const x = clamp(boss.x + Math.cos(a) * d, -40, 40)
      const z = clamp(boss.z + Math.sin(a) * d, -40, 40)
      this.spawnZombie(boss.stage >= 1 ? 'runner' : 'walker', x, z)
      this.effects.smoke(x, 0.3, z, 4, 0x6a625a, 1, 0.6)
    }
  }

  private pickSpawn(kind: ZombieKind) {
    const p = this.player
    let pts = this.world.spawnPoints.filter((s) => Math.hypot(s.x - p.x, s.z - p.z) > 32)
    if (kind === 'boss') pts = pts.filter((s) => s.gate)
    if (pts.length === 0) pts = this.world.spawnPoints
    const s = pick(pts)
    return { x: s.x + rand(-s.jx, s.jx), z: s.z + rand(-s.jz, s.jz) }
  }

  private separate() {
    const grid = new Map<number, Zombie[]>()
    const list = this.zombies
    const C = 2.6
    for (const z of list) {
      if (!z.alive) continue
      const key = (Math.floor(z.x / C) + 100) * 1000 + (Math.floor(z.z / C) + 100)
      const arr = grid.get(key)
      if (arr) arr.push(z)
      else grid.set(key, [z])
    }
    for (const z of list) {
      if (!z.alive) continue
      const cx = Math.floor(z.x / C)
      const cz = Math.floor(z.z / C)
      for (let ix = cx - 1; ix <= cx + 1; ix++) {
        for (let iz = cz - 1; iz <= cz + 1; iz++) {
          const arr = grid.get((ix + 100) * 1000 + (iz + 100))
          if (!arr) continue
          for (const o of arr) {
            if (o.id <= z.id) continue
            const dx = o.x - z.x
            const dz = o.z - z.z
            const d2 = dx * dx + dz * dz
            const minD = (z.staticR + o.staticR) * 0.95 + 0.08
            if (d2 >= minD * minD || d2 < 1e-8) continue
            const d = Math.sqrt(d2)
            const push = (minD - d) * 0.5
            const nx = dx / d
            const nz = dz / d
            // heavier bodies get displaced less
            const mz = z.staticR * z.staticR
            const mo = o.staticR * o.staticR
            const wz = mo / (mz + mo)
            const wo = mz / (mz + mo)
            z.x -= nx * push * 2 * wz
            z.z -= nz * push * 2 * wz
            o.x += nx * push * 2 * wo
            o.z += nz * push * 2 * wo
          }
        }
      }
    }
  }

  /* ---------------------------------------------------------------- damage */
  damageZombie(z: Zombie, dmg: number, o: DamageOpts) {
    if (!z.alive) return
    if (z.state === 'stun') dmg *= 1.25

    // riot shield: soaks bullets arriving from the front until it breaks
    let knockMul = 1
    if (z.shielded && !o.noShield && !o.blast) {
      const fx = Math.sin(z.angle)
      const fz = Math.cos(z.angle)
      if (fx * o.dx + fz * o.dz < -0.25) {
        z.shieldHp -= dmg * 0.5
        dmg *= 0.07
        knockMul = 0.15
        this.effects.sparks(z.x + fx * 0.85, 1.1, z.z + fz * 0.85, o.dx, o.dz, 3, 0xfff0c0)
        this.audio.shieldHit()
        if (this.simT - z.numT > 0.25) {
          this.effects.number(z.x, z.rig.height + 0.2, z.z, 'BLOCKED', 'info')
          z.numT = this.simT
        }
        if (z.shieldHp <= 0) z.breakShield(this)
      }
    }

    z.hp -= dmg
    z.knock(o.dx, o.dz, o.knock * knockMul)
    z.onDamaged(!o.fire)

    // batch rapid-fire numbers so SMGs do not flood the screen
    z.numAcc += dmg
    if (this.simT - z.numT > 0.1 || o.crit || z.hp <= 0) {
      const v = Math.round(z.numAcc)
      if (v > 0) {
        this.effects.number(
          z.x, z.rig.height + 0.2, z.z, o.crit ? `${v}!` : String(v),
          o.crit ? 'crit' : o.fire ? 'burn' : o.blast ? 'blast' : '', o.crit ? 1.25 : 1,
        )
      }
      z.numAcc = 0
      z.numT = this.simT
    }
    if (!o.fire) {
      this.effects.blood(z.x, 1.0 * z.def.scale, z.z, o.dx * 0.6, o.dz * 0.6, o.crit ? 6 : 3, BLOOD[z.kind])
      this.audio.splat(clamp((z.x - this.player.x) / 30, -1, 1))
    }
    if (z.hp <= 0) this.killZombie(z, { dx: o.dx, dz: o.dz, blast: o.blast })
  }

  /** How many more skeletons can be raised (global cap keeps frame rate sane). */
  skeletonRoom() {
    let n = 0
    for (const z of this.zombies) if (z.alive && z.kind === 'skeleton') n++
    return Math.max(0, 55 - n)
  }

  /** Witch cast: a ring of skeletons claws its way out of the ground around her. */
  summonSkeletons(w: Zombie, count: number) {
    const n = Math.min(count, this.skeletonRoom())
    const p = this.player
    this.effects.ring(w.x, w.z, 0.8, 7.5, 0xb48cff, 0.7)
    this.effects.ring(w.x, w.z, 0.4, 4.5, 0xe8d8ff, 0.5)
    this.effects.glow.emit({ x: w.x, y: 1.2, z: w.z, life: 0.3, size: 2.4, grav: 0, color: 0xb48cff, fade: true })
    this.audio.rise(Math.hypot(w.x - p.x, w.z - p.z))
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.25, 0.25)
      const d = rand(1.8, 3.8)
      const x = clamp(w.x + Math.cos(a) * d, -41, 41)
      const z = clamp(w.z + Math.sin(a) * d, -41, 41)
      const s = this.spawnZombie('skeleton', x, z)
      s.state = 'rise'
      s.t = 0
      this.effects.gibs(x, z, [0xe6e0c8, 0xcfc8b0, 0x6a6450], 3, 0.5, 0.6)
      this.effects.glow.emit({ x, y: 0.3, z, vy: 3, life: 0.5, size: 0.4, grav: -1, color: 0xb48cff, fade: true })
    }
  }

  /** Screamer shriek: enrages every zombie nearby (faster for a few seconds). */
  screamerBuff(z: Zombie) {
    const p = this.player
    this.audio.scream(Math.hypot(z.x - p.x, z.z - p.z))
    this.effects.ring(z.x, z.z, 1, 13, 0xb48cff, 0.6)
    this.effects.ring(z.x, z.z, 0.5, 9, 0xe0c8ff, 0.4)
    for (const o of this.zombies) {
      if (o.alive && Math.hypot(o.x - z.x, o.z - z.z) < 13) {
        o.rageT = 5
        this.effects.glow.emit({ x: o.x, y: o.rig.height + 0.4, z: o.z, life: 0.5, size: 0.5, grav: -1, color: 0xb48cff, fade: true })
      }
    }
    this.shake(0.12)
  }

  killZombie(z: Zombie, o: { dx?: number; dz?: number; blast?: boolean; selfDestruct?: boolean } = {}) {
    if (!z.alive) return
    z.hp = Math.min(z.hp, 0)
    z.startDeath()
    const def = z.def
    const p = this.player

    this.kills++
    this.combo++
    this.comboT = 3.2
    const mult = Math.min(5, 1 + Math.floor(this.combo / 6))
    const gain = def.score * mult
    this.score += gain
    if (z.kind === 'boss' || z.kind === 'brute') this.effects.number(z.x, z.rig.height + 1, z.z, `+${gain}`, 'score', 1.3)

    const dx = o.dx ?? rand(-1, 1)
    const dz = o.dz ?? rand(-1, 1)
    z.knock(dx, dz, o.blast ? 7 : 4)
    const n = { walker: 9, runner: 8, spitter: 9, bloater: 16, brute: 24, boss: 70, leaper: 8, riot: 14, screamer: 7, splitter: 16, crawler: 4, witch: 12, skeleton: 6 }[z.kind]
    this.effects.gibs(z.x, z.z, z.rig.baseColors, n, def.scale * 0.8, o.blast ? 1.5 : 1)
    this.effects.decal(z.x, z.z, 1.5 * def.scale, BLOOD[z.kind])
    for (let i = 0; i < 3; i++) {
      this.effects.decal(z.x + dx * rand(0.5, 2.5) + rand(-0.6, 0.6), z.z + dz * rand(0.5, 2.5) + rand(-0.6, 0.6), rand(0.4, 0.9) * def.scale, BLOOD[z.kind])
    }
    this.audio.death(z.kind, clamp((z.x - p.x) / 30, -1, 1))

    const heal = 1.5 * p.perk('vamp')
    if (heal > 0 && p.alive) p.heal(heal)

    this.rollDrops(z)

    if (z.kind === 'splitter') {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + rand(-0.4, 0.4)
        const cx = z.x + Math.cos(a) * 0.9
        const cz = z.z + Math.sin(a) * 0.9
        const c = this.spawnZombie('crawler', cx, cz)
        c.knock(Math.cos(a), Math.sin(a), 8)
      }
      this.effects.blood(z.x, 1, z.z, 0, 0, 14, 0xd8708f)
    }
    if (z.kind === 'bloater') {
      this.combat.explode(z.x, z.z, 4.8, { dmg: 80, playerDmg: 34, toxic: true, fromPlayer: true })
    }
    if (z.kind === 'boss') {
      this.boss = null
      this.shake(1)
      this.effects.explosion(z.x, z.z, 7, false)
      this.audio.explosion(1.4)
      this.banner('Boss defeated', `+${gain} points`, 'good')
      this.timeScale = 0.35
    }
    // one-off: mark the wave cleared faster when the last enemy drops
    void o.selfDestruct
  }

  private rollDrops(z: Zombie) {
    const p = this.player
    const base = { walker: 0.1, runner: 0.1, spitter: 0.2, bloater: 0.24, brute: 0.5, boss: 1, leaper: 0.12, riot: 0.35, screamer: 0.3, splitter: 0.3, crawler: 0.04, witch: 0.45, skeleton: 0.02 }[z.kind]
    const scav = 1 + 0.35 * p.perk('scav')
    const count = z.kind === 'boss' ? 5 : 1
    for (let i = 0; i < count; i++) {
      if (Math.random() > base * scav) continue
      const wHealth = 1 + (1 - p.hp / p.maxHp) * 2.6
      const lowAmmo = p.reserves[1] + p.reserves[2] + p.reserves[3] < 120 ? 1.4 : 1
      const wAmmo = 1.2 * lowAmmo
      const wFrag = p.frags < p.maxFrags ? 0.55 : 0.1
      let r = Math.random() * (wHealth + wAmmo + wFrag)
      let kind: PickupKind = 'health'
      if ((r -= wHealth) < 0) kind = 'health'
      else if ((r -= wAmmo) < 0) kind = 'ammo'
      else kind = 'frag'
      this.pickups.spawn(kind, z.x + rand(-0.8, 0.8), z.z + rand(-0.8, 0.8))
    }
  }

  damageBarrel(b: Barrel, dmg: number) {
    if (!b.alive) return
    b.hp -= dmg
    this.effects.sparks(b.x, 1.0, b.z, 0, 0, 4, 0xffb060)
    if (b.hp > 0) return
    this.world.destroyBarrel(b)
    this.after(0.1, () => this.combat.explode(b.x, b.z, 5.4, { dmg: 160, playerDmg: 38, knock: 20, fromPlayer: true }))
  }

  bossSlam(z: Zombie) {
    const p = this.player
    this.audio.slam()
    this.shake(1)
    this.effects.ring(z.x, z.z, 1, 10, 0xff6a3a, 0.5)
    this.effects.ring(z.x, z.z, 1, 7, 0xffd08a, 0.35)
    this.effects.smoke(z.x, 0.4, z.z, 22, 0x8a8478, 3, 1.2)
    this.effects.gibs(z.x, z.z, [0x6a625a, 0x4a4540, 0x8a8478], 22, 1.3, 1.3)
    this.effects.decal(z.x, z.z, 8, 0x0b0c10)
    const d = Math.hypot(p.x - z.x, p.z - z.z)
    if (d < 9.8 && p.alive) {
      const f = 1 - 0.5 * (d / 9.8)
      p.hurt(z.def.damage * 1.2 * f * z.dmgMul, z.x, z.z, 18, this)
    }
    this.spawnReinforcements(z, 3)
  }

  /* ----------------------------------------------------------------- waves */
  private waveUpdate(dt: number) {
    const p = this.player
    switch (this.waveMode) {
      case 'inter': {
        this.modeT -= dt
        if (this.modeT <= 0) this.beginWave(this.wave + 1)
        break
      }
      case 'active': {
        this.spawnTick(dt)
        if (this.queue.length === 0 && this.aliveCount === 0) this.waveCleared()
        break
      }
      case 'clear': {
        this.modeT -= dt
        if (this.modeT <= 0) this.openUpgrade()
        break
      }
    }
    // keep the boss pointer fresh
    if (this.boss && !this.boss.alive) this.boss = null
    void p
  }

  private beginWave(n: number) {
    this.wave = n
    this.queue = buildWave(n)
    hud.set({ waveTotal: this.queue.length })
    this.waveMode = 'active'
    this.spawnT = 0.3
    const boss = n % 5 === 0
    this.audio.waveStart(boss)
    const fresh = [...new Set(this.queue)].filter((k) => k !== 'boss' && ZOMBIES[k].blurb && !this.seenKinds.has(k))
    for (const k of this.queue) this.seenKinds.add(k)
    let sub: string | undefined
    if (fresh.length > 0) sub = `New threat: ${ZOMBIES[fresh[0]].label} - ${ZOMBIES[fresh[0]].blurb}`
    this.banner(boss ? 'Boss wave' : `Wave ${n}`, sub, boss || fresh.length > 0 ? 'danger' : 'normal')
    if (boss) this.shake(0.3)
  }

  private spawnTick(dt: number) {
    if (this.queue.length === 0) return
    this.spawnT -= dt
    if (this.spawnT > 0) return
    // summoned skeletons do not count against the field cap, so the horde keeps flowing
    const maxAlive = Math.min(80, 26 + this.wave * 4)
    if (this.aliveRegular >= maxAlive) {
      this.spawnT = 0.3
      return
    }
    // spawn in small groups for a swarm feel
    const group = Math.min(this.queue.length, 1 + Math.floor(Math.random() * (2 + Math.min(5, this.wave / 2))))
    const first = this.queue[0]
    const sp = this.pickSpawn(first)
    for (let i = 0; i < group; i++) {
      const kind = this.queue.shift()!
      const zb = this.spawnZombie(kind, sp.x + rand(-1.8, 1.8), sp.z + rand(-1.8, 1.8))
      if (kind === 'boss') {
        this.boss = zb
        this.audio.roar()
      }
    }
    this.spawnT = rand(0.3, 0.8) * Math.max(0.3, 1 - this.wave * 0.04)
  }

  private waveCleared() {
    const p = this.player
    this.waveMode = 'clear'
    this.modeT = 2.0
    const bonus = this.wave * 100
    this.score += bonus
    p.heal(Math.round(p.maxHp * 0.2))
    this.pickups.spawn('ammo', p.x + 2, p.z + 1)
    if (p.frags < p.maxFrags) this.pickups.spawn('frag', p.x - 2, p.z + 1)
    this.audio.waveClear()
    this.banner(`Wave ${this.wave} cleared`, `+${bonus} points`, 'good')
  }

  private openUpgrade() {
    // guns first: three random weapons you do not own yet
    const unowned = WEAPONS.map((_, i) => i).filter((i) => !this.player.owns(i))
    if (unowned.length > 0) {
      this.state = 'upgrade'
      this.input.reset()
      this.unlockPointer()
      hud.set({ gunChoices: shuffle(unowned).slice(0, 3), perkChoices: [] })
      this.pushPhase()
      return
    }
    const pool = PERKS.filter((k) => this.player.perk(k.id) < k.max)
    const choices: PerkDef[] = shuffle(pool.slice()).slice(0, 3)
    if (choices.length === 0) {
      this.waveMode = 'inter'
      this.modeT = 2
      return
    }
    this.state = 'upgrade'
    this.input.reset()
    this.unlockPointer()
    hud.set({ perkChoices: choices, gunChoices: [] })
    this.pushPhase()
  }

  private finishRun() {
    this.state = 'gameover'
    this.unlockPointer()
    this.timeScale = 1
    const newBest = this.score > this.best
    if (newBest) {
      this.best = this.score
      try { localStorage.setItem('deadblock.best', String(this.best)) } catch { /* ignore */ }
    }
    hud.set({
      best: this.best,
      stats: { kills: this.kills, time: this.simT, wave: this.wave, score: this.score, best: this.best, newBest },
    })
    this.pushPhase()
    this.audio.intensity = 0
  }

  playerDied() {
    if (this.state !== 'playing') return
    this.state = 'dying'
    this.dyingT = 0
    this.audio.gameOver()
    this.shake(0.8)
    this.input.fire = false
    this.effects.blood(this.player.x, 1.2, this.player.z, 0, 0, 24, 0xb52a2a)
    this.effects.decal(this.player.x, this.player.z, 2.4, 0x6a1212)
  }

  /* ----------------------------------------------------------------- HUD */
  private syncHud() {
    const p = this.player
    const q = (v: number, s = 0.02) => Math.round(v / s) * s
    const mags = p.mags.join(',')
    const res = p.reserves.map((r) => (Number.isFinite(r) ? r : -1)).join(',')
    const patch: Partial<typeof hud.state> = {
      wave: this.wave,
      hostiles: this.aliveCount + this.queue.length,
      score: this.score,
      hp: Math.ceil(p.hp),
      maxHp: p.maxHp,
      dashFrac: p.dashCd <= 0 ? 1 : q(1 - p.dashCd / p.dashCooldown),
      frags: p.frags,
      weapon: p.weapon,
      reload: p.reloadT >= 0 ? q(p.reloadT / p.reloadDur, 0.04) : -1,
      combo: Math.min(5, 1 + Math.floor(this.combo / 6)) > 1 || this.combo > 0 ? this.combo : 0,
      comboFrac: this.combo > 0 ? q(this.comboT / 3.2, 0.05) : 0,
      bossHp: this.boss && this.boss.alive ? q(this.boss.hp / this.boss.maxHp, 0.01) : -1,
      bossName: this.boss ? this.boss.def.label : '',
    }
    const lo = p.loadout.join(',')
    if (lo !== this.hudKeyL) {
      this.hudKeyL = lo
      patch.loadout = p.loadout.slice()
    }
    if (mags !== this.hudKeyM) {
      this.hudKeyM = mags
      patch.mags = p.mags.slice()
    }
    if (res !== this.hudKeyR) {
      this.hudKeyR = res
      patch.reserves = p.reserves.map((r) => (Number.isFinite(r) ? r : -1))
    }
    hud.set(patch)
  }

  /* -------------------------------------------------------------- minimap */
  private mapTransform(ctx: CanvasRenderingContext2D) {
    const size = this.minimap.width
    const s = (size / 2 / 62) * 1.0
    const y = this.camYaw
    ctx.setTransform(Math.cos(y) * s, Math.sin(y) * s, -Math.sin(y) * s, Math.cos(y) * s, size / 2, size / 2)
  }

  private drawMinimapStatic() {
    const c = this.minimapStatic
    const ctx = c.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    this.mapTransform(ctx)
    ctx.fillStyle = '#141b2e'
    ctx.fillRect(-44, -44, 88, 88)
    ctx.fillStyle = '#222c44'
    ctx.fillRect(-6.5, -62, 13, 124)
    ctx.fillRect(-62, -6.5, 124, 13)
    for (const col of this.world.colliders) {
      if (col.kind === 'box') {
        ctx.fillStyle = col.blocksBullets ? '#445273' : '#33405c'
        ctx.fillRect(col.x - col.hx, col.z - col.hz, col.hx * 2, col.hz * 2)
      } else if (col.r > 0.6) {
        ctx.fillStyle = '#33405c'
        ctx.beginPath()
        ctx.arc(col.x, col.z, col.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }

  private drawMinimap(dt: number) {
    this.mmT -= dt
    if (this.mmT > 0) return
    this.mmT = 1 / 24
    const c = this.minimap
    const ctx = c.getContext('2d')!
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.drawImage(this.minimapStatic, 0, 0)
    this.mapTransform(ctx)

    // camera frustum on the ground
    const pts: Array<[number, number]> = []
    const v = new THREE.Vector3()
    for (const [nx, ny] of [[-1, 1], [1, 1], [1, -1], [-1, -1]] as const) {
      v.set(nx, ny, 0.5).unproject(this.camera).sub(this.camera.position).normalize()
      if (v.y >= -0.02) continue
      const t = -this.camera.position.y / v.y
      pts.push([this.camera.position.x + v.x * t, this.camera.position.z + v.z * t])
    }
    if (pts.length === 4) {
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      pts.forEach(([x, z], i) => (i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)))
      ctx.closePath()
      ctx.stroke()
    }

    for (const k of this.pickups.list) {
      ctx.fillStyle = k.kind === 'health' ? '#4dff8a' : k.kind === 'ammo' ? '#ffc83a' : '#ff6a3a'
      ctx.fillRect(k.x - 0.8, k.z - 0.8, 1.6, 1.6)
    }
    for (const z of this.zombies) {
      if (!z.alive) continue
      ctx.fillStyle =
        MAP_COLOR[z.kind]
      ctx.beginPath()
      ctx.arc(z.x, z.z, z.kind === 'boss' ? 2.6 : z.kind === 'brute' || z.kind === 'bloater' ? 1.5 : 1.0, 0, Math.PI * 2)
      ctx.fill()
    }
    const p = this.player
    ctx.fillStyle = '#5ee9ff'
    ctx.beginPath()
    const fx = Math.sin(p.angle)
    const fz = Math.cos(p.angle)
    ctx.moveTo(p.x + fx * 2.6, p.z + fz * 2.6)
    ctx.lineTo(p.x - fx * 1.6 + fz * 1.7, p.z - fz * 1.6 - fx * 1.7)
    ctx.lineTo(p.x - fx * 1.6 - fz * 1.7, p.z - fz * 1.6 + fx * 1.7)
    ctx.closePath()
    ctx.fill()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }
}

export { ZOMBIES }
