import type { WeaponId, ZombieKind } from './config'

interface NoiseOpts {
  dur: number
  type?: BiquadFilterType
  f0: number
  f1?: number
  q?: number
  gain: number
  delay?: number
  attack?: number
  pan?: number
}
interface ToneOpts {
  type: OscillatorType
  f0: number
  f1?: number
  dur: number
  gain: number
  delay?: number
  attack?: number
  pan?: number
  detune?: number
}

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12)

/** Fully procedural audio: no sample files, everything is synthesised with WebAudio. */
export class AudioEngine {
  ctx: AudioContext | null = null
  muted = false
  private master!: GainNode
  private sfx!: GainNode
  private musicBus!: GainNode
  private noiseBuf!: AudioBuffer
  private timer = 0
  private step = 0
  private nextStepTime = 0
  private lastGroan = 0
  private lastHit = 0
  private lastShot = 0
  intensity = 0

  init() {
    if (this.ctx) {
      void this.ctx.resume()
      return
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    this.ctx = ctx
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 6
    comp.attack.value = 0.003
    comp.release.value = 0.2
    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 0.8
    this.sfx = ctx.createGain()
    this.sfx.gain.value = 0.9
    this.musicBus = ctx.createGain()
    this.musicBus.gain.value = 0.55
    this.sfx.connect(comp)
    this.musicBus.connect(comp)
    comp.connect(this.master)
    this.master.connect(ctx.destination)

    // noise buffer
    const len = ctx.sampleRate * 1.5
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = this.noiseBuf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1

    this.startMusic()
  }

  setMuted(m: boolean) {
    this.muted = m
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05)
  }

  suspend() {
    void this.ctx?.suspend()
  }
  resume() {
    void this.ctx?.resume()
  }

  /* --------------------------------------------------------------- helpers */
  private out(node: AudioNode, pan = 0, bus: AudioNode = this.sfx) {
    const ctx = this.ctx!
    if (pan !== 0 && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner()
      p.pan.value = Math.max(-1, Math.min(1, pan))
      node.connect(p)
      p.connect(bus)
    } else node.connect(bus)
  }

  private noise(o: NoiseOpts, bus: AudioNode = this.sfx) {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime + (o.delay ?? 0)
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const f = ctx.createBiquadFilter()
    f.type = o.type ?? 'lowpass'
    f.frequency.setValueAtTime(o.f0, t)
    if (o.f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur)
    f.Q.value = o.q ?? 0.7
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t + (o.attack ?? 0.003))
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur)
    src.connect(f)
    f.connect(g)
    this.out(g, o.pan ?? 0, bus)
    src.start(t, Math.random() * 0.8)
    src.stop(t + o.dur + 0.05)
  }

  private tone(o: ToneOpts, bus: AudioNode = this.sfx) {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime + (o.delay ?? 0)
    const osc = ctx.createOscillator()
    osc.type = o.type
    osc.frequency.setValueAtTime(o.f0, t)
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(10, o.f1), t + o.dur)
    if (o.detune) osc.detune.value = o.detune
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t + (o.attack ?? 0.004))
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur)
    osc.connect(g)
    this.out(g, o.pan ?? 0, bus)
    osc.start(t)
    osc.stop(t + o.dur + 0.05)
  }

  /* ----------------------------------------------------------------- SFX */
  shot(id: WeaponId) {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    if (now - this.lastShot < 0.018) return
    this.lastShot = now
    switch (id) {
      case 'carbine':
        this.noise({ dur: 0.14, type: 'bandpass', f0: 2600, f1: 500, q: 0.9, gain: 0.5 })
        this.tone({ type: 'triangle', f0: 190, f1: 55, dur: 0.12, gain: 0.55 })
        break
      case 'shotgun':
        this.noise({ dur: 0.38, type: 'lowpass', f0: 3800, f1: 260, q: 0.6, gain: 0.95 })
        this.tone({ type: 'sawtooth', f0: 150, f1: 38, dur: 0.3, gain: 0.55 })
        this.noise({ dur: 0.12, type: 'highpass', f0: 1800, gain: 0.25, delay: 0.5 })
        this.tone({ type: 'square', f0: 220, f1: 140, dur: 0.05, gain: 0.12, delay: 0.42 })
        this.tone({ type: 'square', f0: 160, f1: 220, dur: 0.05, gain: 0.12, delay: 0.5 })
        break
      case 'vectors':
        this.noise({ dur: 0.07, type: 'bandpass', f0: 3200, f1: 900, q: 1.1, gain: 0.32 })
        this.tone({ type: 'square', f0: 260, f1: 90, dur: 0.05, gain: 0.2 })
        break
      case 'flamer':
        this.noise({ dur: 0.16, type: 'bandpass', f0: 900, f1: 500, q: 0.6, gain: 0.32 })
        this.noise({ dur: 0.1, type: 'lowpass', f0: 400, gain: 0.25 })
        break
      case 'launcher':
        this.tone({ type: 'sine', f0: 140, f1: 40, dur: 0.35, gain: 0.8 })
        this.noise({ dur: 0.25, type: 'lowpass', f0: 1800, f1: 200, gain: 0.7 })
        this.tone({ type: 'square', f0: 900, f1: 300, dur: 0.18, gain: 0.08, delay: 0.04 })
        break
      case 'minigun':
        this.noise({ dur: 0.09, type: 'bandpass', f0: 1800, f1: 500, q: 0.9, gain: 0.4 })
        this.tone({ type: 'triangle', f0: 120, f1: 50, dur: 0.08, gain: 0.5 })
        break
      case 'arc':
        this.noise({ dur: 0.18, type: 'highpass', f0: 3500, f1: 1500, gain: 0.4 })
        this.tone({ type: 'sawtooth', f0: 1400, f1: 200, dur: 0.14, gain: 0.22 })
        this.tone({ type: 'square', f0: 90, f1: 60, dur: 0.12, gain: 0.25 })
        break
      case 'magnum':
        this.noise({ dur: 0.3, type: 'lowpass', f0: 3000, f1: 220, q: 0.6, gain: 0.85 })
        this.tone({ type: 'sine', f0: 160, f1: 38, dur: 0.28, gain: 0.8 })
        break
      case 'railgun':
        this.tone({ type: 'sawtooth', f0: 1800, f1: 70, dur: 0.5, gain: 0.5 })
        this.tone({ type: 'sine', f0: 90, f1: 28, dur: 0.6, gain: 0.8 })
        this.noise({ dur: 0.45, type: 'highpass', f0: 4200, f1: 900, gain: 0.5 })
        this.tone({ type: 'sine', f0: 3200, f1: 800, dur: 0.25, gain: 0.18, delay: 0.02 })
        break
    }
  }

  explosion(big = 1) {
    if (!this.ctx) return
    this.noise({ dur: 1.1 * big, type: 'lowpass', f0: 2400, f1: 70, q: 0.7, gain: 1.1 })
    this.tone({ type: 'sine', f0: 120, f1: 28, dur: 0.9 * big, gain: 1.0 })
    this.noise({ dur: 0.25, type: 'highpass', f0: 3000, gain: 0.35 })
    this.noise({ dur: 0.7, type: 'bandpass', f0: 500, f1: 120, gain: 0.5, delay: 0.12 })
  }

  splat(pan = 0) {
    if (!this.ctx) return
    const now = this.ctx.currentTime
    if (now - this.lastHit < 0.035) return
    this.lastHit = now
    this.noise({ dur: 0.1, type: 'lowpass', f0: 1400, f1: 300, gain: 0.35, pan })
    this.tone({ type: 'sine', f0: 140, f1: 60, dur: 0.08, gain: 0.3, pan })
  }

  crit() {
    this.tone({ type: 'triangle', f0: 1300, f1: 1900, dur: 0.07, gain: 0.12 })
  }

  death(kind: ZombieKind, pan = 0) {
    if (!this.ctx) return
    const big = kind === 'brute' || kind === 'boss'
    this.noise({ dur: big ? 0.5 : 0.25, type: 'lowpass', f0: 900, f1: 120, gain: 0.45, pan })
    this.tone({ type: 'sawtooth', f0: big ? 110 : 190, f1: big ? 40 : 60, dur: big ? 0.6 : 0.35, gain: 0.22, pan })
  }

  groan(kind: ZombieKind, dist = 10, pan = 0) {
    const ctx = this.ctx
    if (!ctx) return
    const now = ctx.currentTime
    if (now - this.lastGroan < 0.12) return
    this.lastGroan = now
    const vol = Math.max(0, 1 - dist / 38)
    if (vol < 0.05) return
    const base = { walker: 95, runner: 150, spitter: 120, bloater: 62, brute: 52, boss: 38, leaper: 175, riot: 78, screamer: 230, splitter: 66, crawler: 210, witch: 260, skeleton: 150 }[kind] * (0.85 + Math.random() * 0.3)
    const dur = kind === 'runner' ? 0.45 : 0.9
    const t = now
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(base, t)
    osc.frequency.linearRampToValueAtTime(base * (0.7 + Math.random() * 0.3), t + dur)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 5 + Math.random() * 4
    const lg = ctx.createGain()
    lg.gain.value = base * 0.06
    lfo.connect(lg)
    lg.connect(osc.frequency)
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.setValueAtTime(500 + Math.random() * 300, t)
    f.frequency.linearRampToValueAtTime(260, t + dur)
    f.Q.value = 3.5
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.28 * vol + 0.0002, t + 0.12)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(f)
    f.connect(g)
    this.out(g, pan)
    osc.start(t)
    lfo.start(t)
    osc.stop(t + dur + 0.05)
    lfo.stop(t + dur + 0.05)
  }

  shieldHit() {
    this.tone({ type: 'square', f0: 1800, f1: 900, dur: 0.06, gain: 0.14 })
    this.noise({ dur: 0.08, type: 'highpass', f0: 4000, gain: 0.2 })
  }
  shieldBreak() {
    this.noise({ dur: 0.35, type: 'highpass', f0: 2500, f1: 800, gain: 0.5 })
    this.tone({ type: 'sawtooth', f0: 300, f1: 60, dur: 0.3, gain: 0.3 })
  }
  summon(dist = 10) {
    const v = Math.max(0.2, 1 - dist / 45)
    this.tone({ type: 'sawtooth', f0: 110, f1: 220, dur: 1.1, gain: 0.22 * v, attack: 0.3 })
    this.tone({ type: 'sine', f0: 330, f1: 660, dur: 1.1, gain: 0.16 * v, attack: 0.4, detune: 14 })
    this.noise({ dur: 1.0, type: 'bandpass', f0: 700, f1: 2400, q: 1.4, gain: 0.18 * v, attack: 0.4 })
  }
  rise(dist = 10) {
    const v = Math.max(0.15, 1 - dist / 40)
    this.noise({ dur: 0.18, type: 'bandpass', f0: 2500, f1: 900, q: 2, gain: 0.2 * v })
    this.tone({ type: 'square', f0: 220, f1: 90, dur: 0.1, gain: 0.08 * v })
  }
  scream(dist = 10) {
    const v = Math.max(0.15, 1 - dist / 40)
    this.tone({ type: 'sawtooth', f0: 520, f1: 1500, dur: 0.7, gain: 0.22 * v, attack: 0.05 })
    this.tone({ type: 'square', f0: 780, f1: 2100, dur: 0.7, gain: 0.1 * v, attack: 0.05, detune: 20 })
    this.noise({ dur: 0.7, type: 'bandpass', f0: 2000, f1: 3200, q: 1.2, gain: 0.2 * v })
  }
  leap(dist = 10) {
    const v = Math.max(0.2, 1 - dist / 40)
    this.noise({ dur: 0.35, type: 'bandpass', f0: 400, f1: 1800, q: 1, gain: 0.3 * v })
    this.tone({ type: 'sawtooth', f0: 260, f1: 520, dur: 0.25, gain: 0.12 * v })
  }
  thud(dist = 10) {
    const v = Math.max(0.2, 1 - dist / 40)
    this.tone({ type: 'sine', f0: 110, f1: 40, dur: 0.2, gain: 0.5 * v })
    this.noise({ dur: 0.12, type: 'lowpass', f0: 700, gain: 0.3 * v })
  }
  ignite() {
    this.noise({ dur: 0.25, type: 'highpass', f0: 3000, f1: 6000, gain: 0.12 })
  }

  roar() {
    if (!this.ctx) return
    this.noise({ dur: 1.6, type: 'bandpass', f0: 300, f1: 140, q: 1.4, gain: 0.8 })
    this.tone({ type: 'sawtooth', f0: 70, f1: 34, dur: 1.5, gain: 0.5 })
    this.tone({ type: 'square', f0: 72, f1: 36, dur: 1.5, gain: 0.25, detune: 18 })
  }

  slam() {
    if (!this.ctx) return
    this.tone({ type: 'sine', f0: 90, f1: 24, dur: 0.8, gain: 1.0 })
    this.noise({ dur: 0.7, type: 'lowpass', f0: 1200, f1: 60, gain: 0.9 })
  }

  reload() {
    this.tone({ type: 'square', f0: 480, f1: 300, dur: 0.045, gain: 0.14 })
    this.noise({ dur: 0.06, type: 'highpass', f0: 2500, gain: 0.18 })
  }
  reloadDone() {
    this.tone({ type: 'square', f0: 260, f1: 520, dur: 0.06, gain: 0.16 })
    this.noise({ dur: 0.07, type: 'highpass', f0: 3000, gain: 0.22, delay: 0.02 })
  }
  empty() {
    this.tone({ type: 'square', f0: 140, f1: 120, dur: 0.04, gain: 0.12 })
  }
  pickup() {
    this.tone({ type: 'triangle', f0: 660, dur: 0.09, gain: 0.2 })
    this.tone({ type: 'triangle', f0: 880, dur: 0.09, gain: 0.2, delay: 0.07 })
    this.tone({ type: 'triangle', f0: 1320, dur: 0.14, gain: 0.2, delay: 0.14 })
  }
  heal() {
    this.tone({ type: 'sine', f0: 520, dur: 0.12, gain: 0.22 })
    this.tone({ type: 'sine', f0: 780, dur: 0.12, gain: 0.22, delay: 0.1 })
    this.tone({ type: 'sine', f0: 1040, dur: 0.2, gain: 0.22, delay: 0.2 })
  }
  dash() {
    this.noise({ dur: 0.3, type: 'bandpass', f0: 600, f1: 3200, q: 1.5, gain: 0.45 })
  }
  dashReady() {
    this.tone({ type: 'sine', f0: 900, f1: 1300, dur: 0.07, gain: 0.07 })
  }
  hurt() {
    if (!this.ctx) return
    this.tone({ type: 'sawtooth', f0: 220, f1: 80, dur: 0.28, gain: 0.35 })
    this.noise({ dur: 0.2, type: 'lowpass', f0: 800, f1: 150, gain: 0.5 })
  }
  throwGrenade() {
    this.noise({ dur: 0.18, type: 'bandpass', f0: 500, f1: 1800, q: 1.2, gain: 0.25 })
    this.tone({ type: 'square', f0: 420, f1: 300, dur: 0.05, gain: 0.12 })
  }
  bounce() {
    this.tone({ type: 'triangle', f0: 320, f1: 180, dur: 0.05, gain: 0.12 })
  }
  beep(hi = false) {
    this.tone({ type: 'square', f0: hi ? 1400 : 1000, dur: 0.06, gain: 0.1 })
  }
  spit() {
    this.noise({ dur: 0.25, type: 'bandpass', f0: 1200, f1: 400, q: 1.5, gain: 0.35 })
    this.tone({ type: 'sine', f0: 300, f1: 120, dur: 0.2, gain: 0.2 })
  }
  sizzle() {
    this.noise({ dur: 0.2, type: 'highpass', f0: 5000, gain: 0.1 })
  }
  uiClick() {
    this.tone({ type: 'triangle', f0: 700, f1: 900, dur: 0.06, gain: 0.14 })
  }
  uiConfirm() {
    this.tone({ type: 'triangle', f0: 520, dur: 0.08, gain: 0.16 })
    this.tone({ type: 'triangle', f0: 780, dur: 0.12, gain: 0.16, delay: 0.07 })
  }
  waveStart(boss = false) {
    if (!this.ctx) return
    const base = boss ? 49 : 65.4
    for (const [i, m] of [1, 1.5, 2].entries()) {
      this.tone({ type: 'sawtooth', f0: base * m, dur: 1.6, gain: 0.16 - i * 0.03, attack: 0.25, detune: i * 6 })
      this.tone({ type: 'sawtooth', f0: base * m * 1.005, dur: 1.6, gain: 0.12 - i * 0.02, attack: 0.25 })
    }
    this.noise({ dur: 1.2, type: 'lowpass', f0: 200, f1: 900, gain: 0.25, attack: 0.5 })
  }
  waveClear() {
    ;[0, 4, 7, 12].forEach((n, i) =>
      this.tone({ type: 'triangle', f0: NOTE(60 + n), dur: 0.35, gain: 0.2, delay: i * 0.1 }),
    )
  }
  gameOver() {
    ;[0, -3, -7, -12].forEach((n, i) =>
      this.tone({ type: 'sawtooth', f0: NOTE(57 + n), dur: 0.9, gain: 0.2, delay: i * 0.28 }),
    )
    this.noise({ dur: 1.8, type: 'lowpass', f0: 600, f1: 60, gain: 0.5 })
  }
  heartbeat() {
    this.tone({ type: 'sine', f0: 70, f1: 40, dur: 0.14, gain: 0.5 })
    this.tone({ type: 'sine', f0: 62, f1: 36, dur: 0.16, gain: 0.4, delay: 0.17 })
  }

  /* --------------------------------------------------------------- music */
  private startMusic() {
    const ctx = this.ctx!
    // dark drone pad
    const padG = ctx.createGain()
    padG.gain.value = 0.045
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.frequency.value = 220
    f.connect(padG)
    padG.connect(this.musicBus)
    for (const [fr, det] of [[55, 0], [55.4, 8], [82.4, -6]] as const) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = fr
      o.detune.value = det
      o.connect(f)
      o.start()
    }
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.07
    const lg = ctx.createGain()
    lg.gain.value = 90
    lfo.connect(lg)
    lg.connect(f.frequency)
    lfo.start()

    this.nextStepTime = ctx.currentTime + 0.1
    this.timer = window.setInterval(() => this.schedule(), 40)
  }

  private schedule() {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const spb = 60 / (98 + this.intensity * 22) / 4
    while (this.nextStepTime < ctx.currentTime + 0.15) {
      this.playStep(this.step, this.nextStepTime)
      this.nextStepTime += spb
      this.step = (this.step + 1) % 32
    }
  }

  private playStep(s: number, t: number) {
    const ctx = this.ctx!
    const bassLine = [33, 0, 0, 33, 0, 0, 36, 0, 33, 0, 0, 33, 31, 0, 28, 0, 33, 0, 0, 33, 0, 0, 36, 0, 38, 0, 36, 0, 31, 0, 28, 31]
    const n = bassLine[s]
    const hot = this.intensity
    if (n) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(NOTE(n), t)
      const f = ctx.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.setValueAtTime(260 + hot * 700, t)
      f.frequency.exponentialRampToValueAtTime(90, t + 0.18)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
      o.connect(f)
      f.connect(g)
      g.connect(this.musicBus)
      o.start(t)
      o.stop(t + 0.25)
    }
    if (s % 4 === 0 && hot > 0.05) this.kick(t, 0.25 + hot * 0.25)
    if (s % 2 === 0 && hot > 0.35) this.hat(t, 0.05 + hot * 0.05)
    if (s % 8 === 4 && hot > 0.6) this.snare(t)
  }

  private kick(t: number, gain: number) {
    const ctx = this.ctx!
    const o = ctx.createOscillator()
    o.frequency.setValueAtTime(130, t)
    o.frequency.exponentialRampToValueAtTime(38, t + 0.14)
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
    o.connect(g)
    g.connect(this.musicBus)
    o.start(t)
    o.stop(t + 0.22)
  }
  private hat(t: number, gain: number) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const f = ctx.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = 7000
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04)
    src.connect(f)
    f.connect(g)
    g.connect(this.musicBus)
    src.start(t, Math.random())
    src.stop(t + 0.06)
  }
  private snare(t: number) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuf
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 1800
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.16, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14)
    src.connect(f)
    f.connect(g)
    g.connect(this.musicBus)
    src.start(t, Math.random())
    src.stop(t + 0.18)
  }

  dispose() {
    clearInterval(this.timer)
    void this.ctx?.close()
    this.ctx = null
  }
}
