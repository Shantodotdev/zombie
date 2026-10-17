import { useEffect } from 'react'
import { PERK_BY_ID, WEAPONS, type WeaponId } from '../game/config'
import type { Game } from '../game/game'
import { useHud } from '../game/store'

function Keycap({ children }: { children: React.ReactNode }) {
  return <kbd>{children}</kbd>
}

export function MenuScreen({ game }: { game: Game }) {
  const best = useHud('best')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter') game.start()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [game])
  return (
    <div className="screen menu">
      <div className="menu-card">
        <div className="eyebrow">TACTICAL SURVIVAL · TOP-DOWN</div>
        <h1 className="title">
          DEAD<span>BLOCK</span>
        </h1>
        <p className="tagline">
          The city fell overnight. Hold the intersection, upgrade your loadout and survive endless waves of the infected.
        </p>
        <button className="btn primary big" onClick={() => game.start()}>
          DEPLOY
          <small>ENTER</small>
        </button>
        {best > 0 && <div className="best">BEST SCORE <b>{best.toLocaleString('en-US')}</b></div>}
        <div className="controls">
          <div><Keycap>W</Keycap><Keycap>A</Keycap><Keycap>S</Keycap><Keycap>D</Keycap><span>Move</span></div>
          <div><Keycap>Mouse</Keycap><span>Aim &amp; fire</span></div>
          <div><Keycap>Space</Keycap><span>Dash (i-frames)</span></div>
          <div><Keycap>G</Keycap><span>Frag grenade</span></div>
          <div><Keycap>R</Keycap><span>Reload</span></div>
          <div><Keycap>1</Keycap>–<Keycap>9</Keycap><span>Weapons</span></div>
          <div><Keycap>L</Keycap><span>Laser sight</span></div>
          <div><Keycap>Wheel</Keycap><span>Zoom camera</span></div>
          <div><Keycap>Esc</Keycap><span>Pause</span></div>
        </div>
        <div className="tip">Tip: shoot the red barrels — they chain-explode.</div>
      </div>
    </div>
  )
}

export function PauseScreen({ game }: { game: Game }) {
  const muted = useHud('muted')
  return (
    <div className="screen dim">
      <div className="modal">
        <h2>PAUSED</h2>
        <div className="stack">
          <button className="btn primary" onClick={() => game.resume()}>Resume</button>
          <button className="btn" onClick={() => game.start()}>Restart run</button>
          <button className="btn" onClick={() => game.toggleMute()}>Sound: {muted ? 'OFF' : 'ON'}</button>
          <button className="btn ghost" onClick={() => game.toMenu()}>Main menu</button>
        </div>
      </div>
    </div>
  )
}

function GunIcon({ id, color }: { id: WeaponId; color: string }) {
  const g = '#aab4c8'
  const d = '#5b6579'
  let body: React.ReactNode
  switch (id) {
    case 'carbine':
      body = (<><rect x="8" y="15" width="14" height="10" fill={d} /><rect x="22" y="16" width="62" height="8" fill={g} /><rect x="84" y="18" width="26" height="4" fill={g} /><rect x="52" y="24" width="8" height="12" fill={d} /><rect x="48" y="12" width="18" height="4" fill={color} /></>)
      break
    case 'shotgun':
      body = (<><rect x="6" y="15" width="16" height="11" fill="#8a6a44" /><rect x="22" y="16" width="52" height="9" fill={d} /><rect x="74" y="15" width="38" height="4" fill={g} /><rect x="74" y="21" width="32" height="4" fill={g} /><rect x="58" y="24" width="22" height="6" fill="#8a6a44" /></>)
      break
    case 'vectors':
      body = (<><rect x="20" y="10" width="54" height="9" fill={g} /><rect x="74" y="12" width="26" height="4" fill={g} /><rect x="38" y="19" width="6" height="14" fill={d} /><rect x="20" y="22" width="54" height="9" fill={g} /><rect x="74" y="24" width="26" height="4" fill={g} /><rect x="22" y="12" width="40" height="2" fill={color} /></>)
      break
    case 'railgun':
      body = (<><rect x="8" y="14" width="96" height="12" fill={d} /><rect x="10" y="10" width="104" height="3" fill={color} /><rect x="10" y="27" width="104" height="3" fill={color} />{[34, 52, 70, 88].map((x) => <rect key={x} x={x} y="8" width="4" height="24" fill={color} opacity="0.75" />)}</>)
      break
    case 'flamer':
      body = (<><rect x="8" y="8" width="24" height="26" rx="4" fill="#8a8f99" /><rect x="34" y="16" width="52" height="10" fill="#b23a20" /><rect x="86" y="18" width="20" height="6" fill={d} /><polygon points="106,21 120,12 116,21 120,30" fill={color} /></>)
      break
    case 'launcher':
      body = (<><rect x="8" y="14" width="100" height="12" fill="#4a5a34" /><rect x="48" y="9" width="24" height="22" fill={d} /><rect x="40" y="26" width="7" height="10" fill={d} /><rect x="100" y="12" width="10" height="16" fill={g} /><rect x="22" y="10" width="6" height="4" fill={color} /></>)
      break
    case 'minigun':
      body = (<><rect x="8" y="12" width="26" height="18" fill={d} /><rect x="34" y="13" width="76" height="3" fill={g} /><rect x="34" y="19" width="76" height="3" fill={g} /><rect x="34" y="25" width="76" height="3" fill={g} /><rect x="100" y="11" width="6" height="19" fill={d} /><rect x="12" y="30" width="22" height="8" fill="#6a5a2a" /></>)
      break
    case 'arc':
      body = (<><rect x="14" y="15" width="62" height="10" fill={d} /><circle cx="86" cy="20" r="9" fill={color} opacity="0.9" /><circle cx="86" cy="20" r="14" fill={color} opacity="0.2" />{[30, 44, 58].map((x) => <rect key={x} x={x} y="12" width="4" height="16" fill={color} />)}<rect x="10" y="22" width="14" height="12" fill={d} /></>)
      break
    default:
      body = (<><rect x="16" y="20" width="12" height="16" fill="#8a6a44" /><rect x="24" y="14" width="30" height="10" fill={g} /><rect x="54" y="16" width="52" height="6" fill={g} /><rect x="34" y="11" width="14" height="14" fill={d} /></>)
  }
  return (
    <svg className="gun-art" viewBox="0 0 124 42" aria-hidden>
      {body}
    </svg>
  )
}

function GunCard({ index, slot, onPick }: { index: number; slot: number; onPick: () => void }) {
  const w = WEAPONS[index]
  const color = '#' + w.color.toString(16).padStart(6, '0')
  const dps = Math.round((w.damage * w.pellets) / w.interval)
  const pct = (v: number) => `${Math.max(6, Math.min(100, v * 100))}%`
  return (
    <button className="card gun" onClick={onPick} style={{ animationDelay: `${slot * 70}ms`, ['--c' as string]: color }}>
      <span className="card-key">{slot + 1}</span>
      <GunIcon id={w.id} color={color} />
      <b>{w.name}</b>
      <span className="gun-sub">{w.sub}</span>
      <span className="card-desc">{w.desc}</span>
      <span className="stats">
        <span><em>DAMAGE</em><i><u style={{ width: pct(dps / 320) }} /></i><small>{dps}/s</small></span>
        <span><em>FIRE RATE</em><i><u style={{ width: pct(1 / w.interval / 22) }} /></i><small>{(1 / w.interval).toFixed(1)}/s</small></span>
        <span><em>RANGE</em><i><u style={{ width: pct(w.range / 60) }} /></i><small>{Math.round(w.range)}m</small></span>
      </span>
      <span className="tags">{w.tags.map((t) => <i key={t}>{t}</i>)}</span>
      <span className="gun-ammo">MAG {w.mag} · RESERVE {Number.isFinite(w.reserve) ? w.reserve : '∞'}</span>
    </button>
  )
}

export function UpgradeScreen({ game }: { game: Game }) {
  const choices = useHud('perkChoices')
  const gunChoices = useHud('gunChoices')
  const loadout = useHud('loadout')
  const perks = useHud('perks')
  const wave = useHud('wave')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1
      if (gunChoices.length > 0) {
        if (i >= 0 && i < gunChoices.length) game.chooseGun(gunChoices[i])
      } else if (i >= 0 && i < choices.length) game.choosePerk(choices[i].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [game, choices, gunChoices])

  if (gunChoices.length > 0) {
    return (
      <div className="screen dim">
        <div className="upgrade">
          <div className="eyebrow">WAVE {String(wave).padStart(2, '0')} CLEARED</div>
          <h2>CHOOSE A WEAPON</h2>
          <div className="cards">
            {gunChoices.map((gi, i) => (
              <GunCard key={gi} index={gi} slot={i} onPick={() => game.chooseGun(gi)} />
            ))}
          </div>
          <div className="owned">
            <span>LOADOUT</span>
            {loadout.map((wi) => (
              <span key={wi} className="own-chip" style={{ ['--c' as string]: '#' + WEAPONS[wi].color.toString(16).padStart(6, '0') }}>
                {WEAPONS[wi].name}
              </span>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="screen dim">
      <div className="upgrade">
        <div className="eyebrow">WAVE {String(wave).padStart(2, '0')} CLEARED</div>
        <h2>CHOOSE AN UPGRADE</h2>
        <div className="cards">
          {choices.map((c, i) => {
            const lvl = perks[c.id] ?? 0
            return (
              <button key={c.id} className="card" onClick={() => game.choosePerk(c.id)} style={{ animationDelay: `${i * 70}ms` }}>
                <span className="card-key">{i + 1}</span>
                <span className="card-icon">{c.icon}</span>
                <b>{c.name}</b>
                <span className="card-desc">{c.desc}</span>
                <span className="pips">
                  {Array.from({ length: c.max }).map((_, k) => (
                    <i key={k} className={k < lvl ? 'on' : k === lvl ? 'next' : ''} />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
        <div className="owned">
          {Object.entries(perks).map(([id, n]) => (
            <span key={id} title={PERK_BY_ID[id]?.desc}>{PERK_BY_ID[id]?.icon} ×{n}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

export function GameOverScreen({ game }: { game: Game }) {
  const s = useHud('stats')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'KeyR') game.start()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [game])
  const mm = Math.floor(s.time / 60)
  const ss = Math.floor(s.time % 60)
  return (
    <div className="screen dim red">
      <div className="modal wide">
        <div className="eyebrow">OPERATIVE DOWN</div>
        <h2>YOU DIED</h2>
        {s.newBest && <div className="newbest">NEW HIGH SCORE</div>}
        <div className="stats">
          <div><small>SCORE</small><b className="cyan">{s.score.toLocaleString('en-US')}</b></div>
          <div><small>WAVE</small><b>{s.wave}</b></div>
          <div><small>KILLS</small><b className="amber">{s.kills}</b></div>
          <div><small>TIME</small><b>{mm}:{String(ss).padStart(2, '0')}</b></div>
        </div>
        <div className="best">BEST <b>{s.best.toLocaleString('en-US')}</b></div>
        <div className="stack row">
          <button className="btn primary" onClick={() => game.start()}>Try again <small>ENTER</small></button>
          <button className="btn ghost" onClick={() => game.toMenu()}>Main menu</button>
        </div>
      </div>
    </div>
  )
}
