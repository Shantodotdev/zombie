# DEAD BLOCK

A 3D voxel zombie-survival game with a Clash-of-Clans-style fixed isometric camera.
React + Vite + Three.js (TypeScript). No external assets: models, sound and music are all generated in code.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

## Controls

| Input | Action |
|---|---|
| W A S D / arrows | Move (screen-relative) |
| Mouse / left click | Aim / fire (cursor is locked to a circle around your operative) |
| Space | Dash (i-frames, cooldown) |
| G or right click | Frag grenade |
| R | Reload |
| 1-5, Q | Select weapon slot / swap to last weapon |
| L | Toggle laser sight |
| Mouse wheel | Zoom the camera |
| Esc / P, M | Pause, mute |

## Game

- Endless waves; every 5th wave is a boss (the Abomination: slam, charge, summons).
- Zombie types: Shambler, Sprinter, Spitter (acid pools), Leaper (pounces), Bloater (toxic blast), Brute, Crawler (swarmers), Riot Guard (frontal shield), Screamer (enrages others), Splitter (bursts into crawlers), Witch (wave 7+, summons swarms of skeletons), plus the Abomination boss. Waves grow fast: ~20 hostiles at wave 1, ~40 at wave 5, ~70 at wave 10.
- Start with the Carbine. Clear a wave to pick 1 of 3 new guns: Breacher shotgun, Vectors dual SMGs, Railgun, Inferno flamethrower, Thumper grenade launcher, Hurricane minigun, Storm arc caster, Hand Cannon revolver. Your loadout holds 5 guns: when it is full, picking a new gun replaces one of your own (or you can take a stat perk instead).
- Drops: health, ammo, frags. Shoot the red barrels to chain-explode them.
- Zombies path around buildings via a flow-field navigation grid; buildings fade when they block the view.

## Layout

```
src/game/   engine: game loop, world, nav, zombies, player, combat, effects, audio
src/ui/     React HUD and menu screens
```
