import { useEffect, useRef } from 'react'
import { MAX_LOADOUT, WEAPONS } from '../game/config'
import type { Game } from '../game/game'
import { useHud } from '../game/store'
import { GunIcon, hex } from './GunIcon'

function SkullIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 1C4.7 1 2.5 3.2 2.5 6c0 1.6.7 2.8 1.7 3.6V12h1.6v-1h1.1v1h1.2v-1h1.1v1h1.6V9.6c1-.8 1.7-2 1.7-3.6C13.5 3.2 11.3 1 8 1ZM5.7 8.2a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Zm4.6 0a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Z" />
    </svg>
  )
}

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
      {muted ? (
        <>
          <line x1="22" y1="9" x2="16" y2="15" />
          <line x1="16" y1="9" x2="22" y2="15" />
        </>
      ) : (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 5.5a9 9 0 0 1 0 13" />
        </>
      )}
    </svg>
  )
}

function GrenadeIcon({ on }: { on: boolean }) {
  return (
    <svg width="14" height="18" viewBox="0 0 14 18" className={'pip' + (on ? ' on' : '')} aria-hidden>
      <rect x="4" y="0" width="6" height="3" fill="currentColor" />
      <rect x="6" y="3" width="2" height="2" fill="currentColor" />
      <rect x="1" y="5" width="12" height="12" rx="3" fill="currentColor" />
      <rect x="3" y="8" width="8" height="1.5" fill="rgba(0,0,0,.4)" />
      <rect x="3" y="11" width="8" height="1.5" fill="rgba(0,0,0,.4)" />
    </svg>
  )
}

/* ---------------------------------------------------------------- top */
function TopCenter() {
  const wave = useHud('wave')
  const hostiles = useHud('hostiles')
  const total = useHud('waveTotal')
  const pct = total > 0 ? Math.max(0, Math.min(100, (hostiles / Math.max(total, hostiles)) * 100)) : 0
  return (
    <div className="hud-tc">
      <div className="plate cut wave-plate">
        <div className="wave-n">
          <small>WAVE</small>
          <b>{String(Math.max(1, wave)).padStart(2, '0')}</b>
        </div>
        <div className="wave-h">
          <div className="wave-h-top">
            <SkullIcon />
            <b>{hostiles}</b>
            <span>HOSTILES</span>
          </div>
          <div className="sbar thin red">
            <i style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}

function TopRight({ game }: { game: Game }) {
  const score = useHud('score')
  const muted = useHud('muted')
  const combo = useHud('combo')
  const frac = useHud('comboFrac')
  const digits = String(score).padStart(7, '0')
  const firstNZ = digits.search(/[1-9]/)
  const split = firstNZ === -1 ? digits.length - 1 : firstNZ
  const mult = Math.min(5, 1 + Math.floor(combo / 6))
  return (
    <div className="hud-tr">
      <div className="score-row">
        <div className="score">
          <small>SCORE</small>
          <b>
            <span className="zeros">{digits.slice(0, split)}</span>
            {digits.slice(split)}
          </b>
        </div>
        <button className="sys-btn" onClick={() => game.toggleMute()} title="Toggle sound (M)">
          <SoundIcon muted={muted} />
        </button>
      </div>
      {combo >= 2 && (
        <div className="combo">
          <div className="combo-badge">x{mult}</div>
          <div className="combo-info">
            <b>{combo}</b>
            <small>KILL STREAK</small>
            <div className="sbar thin amber">
              <i style={{ width: `${frac * 100}%` }} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BossBar() {
  const hp = useHud('bossHp')
  const name = useHud('bossName')
  if (hp < 0) return null
  return (
    <div className="bossbar">
      <div className="boss-name">
        <SkullIcon />
        <span>{name}</span>
      </div>
      <div className="sbar boss" style={{ ['--seg' as string]: 20 }}>
        <i style={{ width: `${hp * 100}%` }} />
      </div>
    </div>
  )
}

function Banner() {
  const banner = useHud('banner')
  if (!banner) return null
  return (
    <div className={'banner ' + (banner.tone ?? 'normal')} key={banner.id}>
      <div className="strip">
        <h1>{banner.title}</h1>
        {banner.sub && <p>{banner.sub}</p>}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- bottom */
function BottomLeft() {
  const hp = useHud('hp')
  const maxHp = useHud('maxHp')
  const dash = useHud('dashFrac')
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100))
  const low = pct < 30
  return (
    <div className="hud-bl">
      <div className={'vitals' + (low ? ' low' : '')}>
        <div className="vitals-top">
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
            <rect x="7" y="1" width="6" height="18" fill="currentColor" />
            <rect x="1" y="7" width="18" height="6" fill="currentColor" />
          </svg>
          <span>VITALS</span>
        </div>
        <div className="hp-num">
          <b>{hp}</b>
          <small>/ {maxHp}</small>
        </div>
        <div className={'sbar hp' + (low ? ' low' : '')} style={{ ['--seg' as string]: Math.max(4, Math.round(maxHp / 10)) }}>
          <i className="trail" style={{ width: `${pct}%` }} />
          <i className="fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className={'dash' + (dash >= 1 ? ' ready' : '')}>
        <span className="dash-lbl">DASH</span>
        <div className="sbar thin dashbar">
          <i style={{ width: `${dash * 100}%` }} />
        </div>
        <kbd>SPACE</kbd>
      </div>
    </div>
  )
}

function BottomCenter({ game }: { game: Game }) {
  const weapon = useHud('weapon')
  const loadout = useHud('loadout')
  const mags = useHud('mags')
  const reserves = useHud('reserves')
  const perks = useHud('perks')
  return (
    <div className="hud-bc">
      {Array.from({ length: MAX_LOADOUT }).map((_, slot) => {
        const wi = loadout[slot]
        if (wi === undefined) {
          return (
            <div key={slot} className="slot empty cut">
              <span className="key">{slot + 1}</span>
              <span className="empty-lbl">EMPTY</span>
            </div>
          )
        }
        const w = WEAPONS[wi]
        const cap = Math.round(w.mag * (1 + 0.3 * (perks.mag ?? 0)))
        const dry = reserves[wi] === 0 && mags[wi] === 0
        return (
          <button
            key={w.id}
            className={'slot cut' + (wi === weapon ? ' active' : '') + (dry ? ' dry' : '')}
            style={{ ['--c' as string]: hex(w.color) }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => game.player.selectWeapon(wi, game)}
          >
            <span className="key">{slot + 1}</span>
            <GunIcon id={w.id} color={hex(w.color)} className="slot-art" />
            <span className="slot-name">{w.name}</span>
            <span className="slot-bar">
              <i style={{ width: `${Math.min(100, (mags[wi] / cap) * 100)}%` }} />
            </span>
          </button>
        )
      })}
    </div>
  )
}

function BottomRight() {
  const weapon = useHud('weapon')
  const mags = useHud('mags')
  const reserves = useHud('reserves')
  const reload = useHud('reload')
  const frags = useHud('frags')
  const perks = useHud('perks')
  const w = WEAPONS[weapon]
  const cap = Math.round(w.mag * (1 + 0.3 * (perks.mag ?? 0)))
  const empty = mags[weapon] === 0
  const maxFrags = 6 + 2 * (perks.frag ?? 0)
  return (
    <div className="hud-br">
      <div className="wname" style={{ ['--c' as string]: hex(w.color) }}>
        <b>{w.name}</b>
        <small>{w.sub}</small>
      </div>
      <div className={'ammo' + (empty ? ' empty' : '')}>
        {reload >= 0 ? (
          <span className="reloading">RELOADING</span>
        ) : (
          <>
            <b>{mags[weapon]}</b>
            <span>/ {cap}</span>
          </>
        )}
      </div>
      <div className="reload-bar">
        <i style={{ width: reload >= 0 ? `${reload * 100}%` : '0%' }} />
      </div>
      <div className="ammo-foot">
        <div className="reserve">
          <small>RESERVE</small>
          <b>{reserves[weapon] < 0 ? '∞' : reserves[weapon]}</b>
        </div>
        <div className="frags" title="Frag grenade (G / right click)">
          <div className="pips">
            {Array.from({ length: Math.max(3, Math.min(maxFrags, 8)) }).map((_, i) => (
              <GrenadeIcon key={i} on={i < frags} />
            ))}
          </div>
          <kbd>G</kbd>
        </div>
      </div>
    </div>
  )
}

function Vignette() {
  const hp = useHud('hp')
  const maxHp = useHud('maxHp')
  const hurt = useHud('hurt')
  const ref = useRef<HTMLDivElement>(null)
  const first = useRef(true)
  const lowAlpha = Math.max(0, Math.min(1, (0.55 - hp / maxHp) / 0.55))
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const el = ref.current
    if (!el) return
    el.classList.remove('flash')
    void el.offsetWidth
    el.classList.add('flash')
  }, [hurt])
  return (
    <>
      <div className="vignette low" style={{ opacity: lowAlpha }} />
      <div className="vignette hit" ref={ref} />
    </>
  )
}

export function Hud({ game }: { game: Game }) {
  return (
    <>
      <Vignette />
      <div className="frame-corners" />
      <RadarFrame />
      <TopCenter />
      <TopRight game={game} />
      <BossBar />
      <Banner />
      <BottomLeft />
      <BottomCenter game={game} />
      <BottomRight />
    </>
  )
}

function RadarFrame() {
  return (
    <div className="radar-frame">
      <span className="r-label">RADAR</span>
      <i className="c tl" />
      <i className="c tr" />
      <i className="c bl" />
      <i className="c br" />
    </div>
  )
}
