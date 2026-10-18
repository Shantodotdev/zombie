import { useEffect, useState, type ReactNode } from 'react'
import { MAX_LOADOUT, PERK_BY_ID, WEAPONS } from '../game/config'
import type { Game } from '../game/game'
import { useHud } from '../game/store'
import { GunIcon, hex, weaponLabel } from './GunIcon'

function Key({ children }: { children: ReactNode }) {
  return <kbd>{children}</kbd>
}

/* ------------------------------------------------------------------ main menu */
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
      <div className="menu-left">
        <h1 className="logo">
          <span>DEAD</span>
          <span className="g">BLOCK</span>
        </h1>
        <div className="menu-list">
          <button className="m-btn primary" onClick={() => game.start()}>
            Play<kbd>Enter</kbd>
          </button>
        </div>
        {best > 0 && (
          <div className="record">
            <small>Best score</small>
            <b>{best.toLocaleString('en-US')}</b>
          </div>
        )}
      </div>

      <div className="keybinds cut">
        <div className="kb-title"><span>Controls</span><i /></div>
        <ul>
          <li><span className="ks"><Key>W</Key><Key>A</Key><Key>S</Key><Key>D</Key></span><em>Move</em></li>
          <li><span className="ks"><Key>MOUSE</Key></span><em>Aim</em></li>
          <li><span className="ks"><Key>LMB</Key></span><em>Fire</em></li>
          <li><span className="ks"><Key>SPACE</Key></span><em>Dash</em></li>
          <li><span className="ks"><Key>G</Key><Key>RMB</Key></span><em>Grenade</em></li>
          <li><span className="ks"><Key>R</Key></span><em>Reload</em></li>
          <li><span className="ks"><Key>1</Key>–<Key>5</Key></span><em>Switch weapon</em></li>
          <li><span className="ks"><Key>ESC</Key></span><em>Pause</em></li>
        </ul>
        <details className="more-controls">
          <summary>More controls</summary>
          <ul>
          <li><span className="ks"><Key>Q</Key></span><em>Last weapon</em></li>
          <li><span className="ks"><Key>L</Key></span><em>Laser sight</em></li>
          <li><span className="ks"><Key>WHEEL</Key></span><em>Zoom</em></li>
          </ul>
        </details>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------ pause */
export function PauseScreen({ game }: { game: Game }) {
  const muted = useHud('muted')
  return (
    <div className="screen dim">
      <div className="panel-modal cut">
        <h2>Paused</h2>
        <div className="menu-list col">
          <button className="m-btn primary" onClick={() => game.resume()}>Resume</button>
          <button className="m-btn" onClick={() => game.start()}>Restart</button>
          <button className="m-btn" onClick={() => game.toggleMute()}>Sound: {muted ? 'Off' : 'On'}</button>
          <button className="m-btn ghost" onClick={() => game.toMenu()}>Main menu</button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ requisition */
function GunCard({ index, slot, onPick }: { index: number; slot: number; onPick: () => void }) {
  const w = WEAPONS[index]
  const color = hex(w.color)
  const dps = Math.round((w.damage * w.pellets) / w.interval)
  const pct = (v: number) => `${Math.max(6, Math.min(100, v * 100))}%`
  return (
    <button className="gcard cut" onClick={onPick} style={{ animationDelay: `${slot * 80}ms`, ['--c' as string]: color }}>
      <span className="gcard-key">{slot + 1}</span>
      <span className="gcard-top" />
      <GunIcon id={w.id} color={color} />
      <b>{weaponLabel(w.name)}</b>
      <span className="gun-sub">{w.sub}</span>
      <span className="card-desc">{w.desc}</span>
      <span className="stats">
        <span><em>Damage</em><i><u style={{ width: pct(dps / 320) }} /></i><small>{dps}/s</small></span>
        <span><em>Fire rate</em><i><u style={{ width: pct(1 / w.interval / 22) }} /></i><small>{(1 / w.interval).toFixed(1)}/s</small></span>
        <span><em>Range</em><i><u style={{ width: pct(w.range / 60) }} /></i><small>{Math.round(w.range)}m</small></span>
      </span>
      <span className="gun-ammo">Magazine {w.mag} · Reserve {Number.isFinite(w.reserve) ? w.reserve : '∞'}</span>
    </button>
  )
}

export function UpgradeScreen({ game }: { game: Game }) {
  const choices = useHud('perkChoices')
  const gunChoices = useHud('gunChoices')
  const loadout = useHud('loadout')
  const perks = useHud('perks')
  const wave = useHud('wave')
  const [pending, setPending] = useState<number | null>(null)
  const full = loadout.length >= MAX_LOADOUT

  // reset the replace step whenever a new choice screen opens
  useEffect(() => setPending(null), [gunChoices])

  const pick = (gi: number) => {
    if (full) setPending(gi)
    else game.chooseGun(gi)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (pending !== null) {
        if (e.code === 'Escape' || e.code === 'Backspace') return setPending(null)
        const s = Number(e.key) - 1
        if (s >= 0 && s < loadout.length) game.chooseGun(pending, loadout[s])
        return
      }
      const i = Number(e.key) - 1
      if (gunChoices.length > 0) {
        if (i >= 0 && i < gunChoices.length) pick(gunChoices[i])
      } else if (i >= 0 && i < choices.length) game.choosePerk(choices[i].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, choices, gunChoices, loadout, pending, full])

  // ---- step 2: loadout full, choose a gun to swap out
  if (pending !== null) {
    const nw = WEAPONS[pending]
    return (
      <div className="screen dim">
        <div className="upgrade">
          <div className="eyebrow">Loadout full ({MAX_LOADOUT}/{MAX_LOADOUT})</div>
          <h2>Replace a weapon</h2>
          <div className="swap">
            <div className="swap-new cut" style={{ ['--c' as string]: hex(nw.color) }}>
              <small>New weapon</small>
              <GunIcon id={nw.id} color={hex(nw.color)} />
              <b>{weaponLabel(nw.name)}</b>
              <span>{nw.sub}</span>
            </div>
            <div className="swap-arrow">▸</div>
            <div className="swap-slots">
              {loadout.map((wi, s) => {
                const w = WEAPONS[wi]
                return (
                  <button key={wi} className="swap-slot cut" style={{ ['--c' as string]: hex(w.color) }} onClick={() => game.chooseGun(pending, wi)}>
                    <span className="gcard-key">{s + 1}</span>
                    <GunIcon id={w.id} color={hex(w.color)} className="slot-art" />
                    <b>{weaponLabel(w.name)}</b>
                    <small>{w.sub}</small>
                    <em>Replace</em>
                  </button>
                )
              })}
            </div>
          </div>
          <div className="menu-list row">
            <button className="m-btn ghost" onClick={() => setPending(null)}>Back <kbd>Esc</kbd></button>
          </div>
        </div>
      </div>
    )
  }

  // ---- step 1: three guns on offer
  if (gunChoices.length > 0) {
    return (
      <div className="screen dim">
        <div className="upgrade">
          <div className="eyebrow">Wave {wave} cleared</div>
          <h2>Choose a weapon</h2>
          <div className="cards">
            {gunChoices.map((gi, i) => (
              <GunCard key={gi} index={gi} slot={i} onPick={() => pick(gi)} />
            ))}
          </div>
          <div className="owned">
            <span className="o-lbl">Loadout {loadout.length}/{MAX_LOADOUT}</span>
            {loadout.map((wi) => (
              <span key={wi} className="own-chip" style={{ ['--c' as string]: hex(WEAPONS[wi].color) }}>
                {weaponLabel(WEAPONS[wi].name)}
              </span>
            ))}
          </div>
          {full && (
            <div className="menu-list row">
              <button className="m-btn ghost" onClick={() => game.skipToPerks()}>
                Choose an upgrade instead
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ---- perk fallback
  return (
    <div className="screen dim">
      <div className="upgrade">
        <div className="eyebrow">Wave {wave} cleared</div>
        <h2>Choose an upgrade</h2>
        <div className="cards">
          {choices.map((c, i) => {
            const lvl = perks[c.id] ?? 0
            return (
              <button key={c.id} className="gcard perk cut" onClick={() => game.choosePerk(c.id)} style={{ animationDelay: `${i * 80}ms`, ['--c' as string]: '#5ee9ff' }}>
                <span className="gcard-key">{i + 1}</span>
                <span className="gcard-top" />
                <span className="card-icon">{c.icon}</span>
                <b>{c.name}</b>
                <span className="card-desc">{c.desc}</span>
                <span className="pips-row">
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
            <span key={id} className="own-chip" title={PERK_BY_ID[id]?.desc} style={{ ['--c' as string]: '#5ee9ff' }}>{PERK_BY_ID[id]?.icon} ×{n}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------------------------- game over */
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
  const rows: Array<[string, ReactNode, string?]> = [
    ['Waves', s.wave],
    ['Kills', s.kills, 'amber'],
    ['Time', `${mm}:${String(ss).padStart(2, '0')}`],
    ['Score', s.score.toLocaleString('en-US'), 'cyan'],
    ['Best score', s.best.toLocaleString('en-US')],
  ]
  return (
    <div className="screen dim red">
      <div className="panel-modal wide cut danger">
        <h2 className="fail">Game over</h2>
        {s.newBest && <div className="stamp">New best</div>}
        <ul className="debrief">
          {rows.map(([k, v, tone]) => (
            <li key={k}>
              <span>{k}</span>
              <i />
              <b className={tone}>{v}</b>
            </li>
          ))}
        </ul>
        <div className="menu-list row">
          <button className="m-btn primary" onClick={() => game.start()}>Play again<kbd>Enter</kbd></button>
          <button className="m-btn ghost" onClick={() => game.toMenu()}>Main menu</button>
        </div>
      </div>
    </div>
  )
}
