import { useEffect, useRef, useState } from 'react'
import { Game } from './game/game'
import { useHud } from './game/store'
import { Hud } from './ui/Hud'
import { GameOverScreen, MenuScreen, PauseScreen, UpgradeScreen } from './ui/Screens'

export default function App() {
  const stage = useRef<HTMLDivElement>(null)
  const [game, setGame] = useState<Game | null>(null)
  const phase = useHud('phase')

  useEffect(() => {
    const g = new Game(stage.current!)
    setGame(g)
    return () => g.dispose()
  }, [])

  return (
    <div className="app" data-phase={phase}>
      <div className="stage" ref={stage} />
      {game && (
        <div className="ui">
          {phase !== 'menu' && <Hud game={game} />}
          {phase === 'menu' && <MenuScreen game={game} />}
          {phase === 'paused' && <PauseScreen game={game} />}
          {phase === 'upgrade' && <UpgradeScreen game={game} />}
          {phase === 'gameover' && <GameOverScreen game={game} />}
        </div>
      )}
    </div>
  )
}
