import { useEffect } from 'react'
import { PERK_BY_ID } from '../game/config'
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
          <div><Keycap>1</Keycap>–<Keycap>4</Keycap><span>Weapons</span></div>
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

export function UpgradeScreen({ game }: { game: Game }) {
  const choices = useHud('perkChoices')
  const perks = useHud('perks')
  const wave = useHud('wave')
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1
      if (i >= 0 && i < choices.length) game.choosePerk(choices[i].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [game, choices])
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
