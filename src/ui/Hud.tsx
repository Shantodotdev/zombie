import { useEffect, useRef } from 'react'
import { WEAPONS } from '../game/config'
import type { Game } from '../game/game'
import { useHud } from '../game/store'

const fmt = (n: number) => n.toLocaleString('en-US')

function SkullIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 1C4.7 1 2.5 3.2 2.5 6c0 1.6.7 2.8 1.7 3.6V12h1.6v-1h1.1v1h1.2v-1h1.1v1h1.6V9.6c1-.8 1.7-2 1.7-3.6C13.5 3.2 11.3 1 8 1ZM5.7 8.2a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Zm4.6 0a1.3 1.3 0 1 1 0-2.6 1.3 1.3 0 0 1 0 2.6Z" />
    </svg>
  )
}

function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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

function TopBar({ game }: { game: Game }) {
  const wave = useHud('wave')
  const hostiles = useHud('hostiles')
  const score = useHud('score')
  const muted = useHud('muted')
  return (
    <div className="topbar">
      <div className="pill">
        <div className="stat">
          <span className="lbl"><i className="dot" />WAVE</span>
          <b>{String(Math.max(1, wave)).padStart(2, '0')}</b>
        </div>
        <div className="sep" />
        <div className="stat">
          <span className="lbl"><SkullIcon />HOSTILES</span>
          <b className="amber">{hostiles}</b>
        </div>
        <div className="sep" />
        <div className="stat">
          <span className="lbl">SCORE</span>
          <b className="cyan">{fmt(score)}</b>
        </div>
      </div>
      <button className="icon-btn" onClick={() => game.toggleMute()} title="Toggle sound (M)">
        <SoundIcon muted={muted} />
      </button>
    </div>
  )
}

function BottomPanel({ game }: { game: Game }) {
  const hp = useHud('hp')
  const maxHp = useHud('maxHp')
  const dash = useHud('dashFrac')
  const frags = useHud('frags')
  const weapon = useHud('weapon')
  const mags = useHud('mags')
  const reserves = useHud('reserves')
  const reload = useHud('reload')
  const perks = useHud('perks')
  const loadout = useHud('loadout')
  const cap = Math.round(WEAPONS[weapon].mag * (1 + 0.3 * (perks.mag ?? 0)))
  const hpPct = Math.max(0, Math.min(100, (hp / maxHp) * 100))
  const low = hpPct < 30
  return (
    <div className="bottom">
      <div className="panel">
        <div className="row top">
          <div className="hpbox">
            <div className="hp-head">
              <span className={'lbl green' + (low ? ' danger' : '')}>OPERATIVE HP</span>
              <span className="hp-num">{hp} / {maxHp}</span>
            </div>
            <div className={'bar hp' + (low ? ' low' : '')}>
              <i style={{ width: `${hpPct}%` }} />
            </div>
          </div>
          <div className="dashbox">
            <div className="hp-head">
              <span className={'lbl' + (dash >= 1 ? ' ready' : '')}>DASH</span>
              <span className="key">[SPACE]</span>
            </div>
            <div className={'bar dash' + (dash >= 1 ? ' ready' : '')}>
              <i style={{ width: `${dash * 100}%` }} />
            </div>
          </div>
          <div className="chip frag" title="Frag grenade (G or right click)">
            <span className="lbl amber">FRAG [G]</span>
            <b><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><circle cx="12" cy="14" r="7" /><path d="M12 7V3M12 3h4" /></svg>{frags}</b>
          </div>
          <div className={'chip mag' + (mags[weapon] === 0 ? ' empty' : '')}>
            <span className="lbl">MAG [R]</span>
            <b>
              {reload >= 0 ? <em className="reloading">RELOAD</em> : <>{mags[weapon]}<small>/{cap}</small></>}
            </b>
            <span className="reserve">{reserves[weapon] < 0 ? '∞' : `+${reserves[weapon]}`}</span>
          </div>
        </div>
        <div
          className={'slots' + (loadout.length > 5 ? ' compact' : '')}
          style={{ ['--cols' as string]: Math.max(4, loadout.length) }}
        >
          {loadout.map((wi, slot) => {
            const w = WEAPONS[wi]
            return (
              <button
                key={w.id}
                className={'slot' + (wi === weapon ? ' active' : '') + (reserves[wi] === 0 && mags[wi] === 0 ? ' dry' : '')}
                style={{ ['--c' as string]: '#' + w.color.toString(16).padStart(6, '0') }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => game.player.selectWeapon(wi, game)}
              >
                <span className="num">{slot + 1}</span>
                <span className="txt">
                  <b>{w.name}</b>
                  <small>{w.sub}</small>
                </span>
                <span className="ammo">{reserves[wi] < 0 ? '∞' : mags[wi] + reserves[wi]}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Banner() {
  const banner = useHud('banner')
  if (!banner) return null
  return (
    <div className={'banner ' + (banner.tone ?? 'normal')} key={banner.id}>
      <h1>{banner.title}</h1>
      {banner.sub && <p>{banner.sub}</p>}
    </div>
  )
}

function BossBar() {
  const hp = useHud('bossHp')
  const name = useHud('bossName')
  if (hp < 0) return null
  return (
    <div className="bossbar">
      <span>{name}</span>
      <div className="bar boss"><i style={{ width: `${hp * 100}%` }} /></div>
    </div>
  )
}

function Combo() {
  const combo = useHud('combo')
  const frac = useHud('comboFrac')
  if (combo < 2) return null
  const mult = Math.min(5, 1 + Math.floor(combo / 6))
  return (
    <div className="combo">
      <div className="combo-n">{combo}<small> KILL STREAK</small></div>
      <div className="combo-mult">x{mult} SCORE</div>
      <div className="bar combo-bar"><i style={{ width: `${frac * 100}%` }} /></div>
    </div>
  )
}

function Vignette() {
  const hp = useHud('hp')
  const maxHp = useHud('maxHp')
  const hurt = useHud('hurt')
  const ref = useRef<HTMLDivElement>(null)
  const first = useRef(true)
  const frac = hp / maxHp
  const lowAlpha = Math.max(0, Math.min(1, (0.55 - frac) / 0.55))
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
      <TopBar game={game} />
      <BossBar />
      <Combo />
      <Banner />
      <BottomPanel game={game} />
    </>
  )
}
