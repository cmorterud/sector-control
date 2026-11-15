# Sector Control

A single-player First World War shooter that runs in the browser. You fight alongside and against bots for control of flags across trench lines, a shelled forest and a destructible village, in first or third person.

![Verdun sector](public/previews/verdun.jpg)

**[Play it in your browser](https://sector-control-trial-20261108.cody22597.chatgpt.site/)** — no sign-in. Use a desktop browser with a keyboard and mouse, and click **Begin operation** to start. The hosted build is a snapshot and can lag behind this repository.

## Features

- **Large bot battles.** Up to 50 soldiers a side, with riflemen, machine gunners, smoke-screened assaults, suppression, cover-seeking and imperfect aim.
- **Four maps.** Trench front, Verdun sector, Village front and a smaller 5v5 Industrial map.
- **Destructible battlefields.** Grenades and artillery crater the ground, breach trench banks, fell trees and knock holes in walls, floors and roofs. Buildings collapse when they lose enough support, and bots reroute around the damage.
- **Three roles.** Rifleman, Marksman and Support, each with a faction-specific primary and a pistol, plus grenades, smoke, bayonets, callable artillery and rare flame kits.
- **Period factions.** Britain, France and Imperial Germany, with stylized procedural soldier and weapon models.
- **No downloaded art or accounts.** Models, textures and most audio are generated in code; there is no backend or networking.

## Maps

| Map | Size | Objective |
| --- | --- | --- |
| Trench front | 50v50 | Four flags in opposing trench lines across no man's land |
| Verdun sector | 50v50 | Five flags through woodland, craters and communication trenches |
| Village front | 50v50 | Five flags in a nine-building village around a two-story manor |
| Industrial | 5v5 | Three sectors among warehouse cover |

On the flag maps, each flag you hold uncontested earns a point every three seconds. The first team to 300 wins; otherwise the higher score after eight minutes does.

## Controls

All keys can be remapped from **Controls** in the briefing or pause menu.

| Action | Default |
| --- | --- |
| Move | W A S D |
| Aim / fire | Mouse / left click |
| Aim down sights | Hold right mouse |
| Sprint | Shift |
| Crouch | C |
| Hop, mantle or vault | Space |
| Reload | R |
| Primary / pistol | 1 / 2 |
| Grenade / smoke | G / F |
| Melee or bayonet | V |
| Interact (pick up a flame kit) | E |
| Tactical map and artillery | Q |
| Switch first / third person | T |
| Scoreboard | Hold Tab |
| Pause | Escape |

## Run locally

Requires Node.js 22.12 or newer and a WebGL 2 desktop browser.

```sh
npm ci
npm run dev
```

Open the printed localhost URL. Other scripts:

```sh
npm run check    # type-check and run the tests
npm run build    # type-check and build to dist/
npm run preview  # serve the production build
```

Useful URL parameters: `?map=trenches`, `?map=verdun` or `?map=village` selects a map (Industrial is the default), `?view=first` or `?view=third` sets the camera, `?bots=0` disables bots and `?duration=30` shortens the match to thirty seconds.

## How it is built

TypeScript, [PlayCanvas](https://playcanvas.com/) for rendering, Ammo for collision queries, Vite and Vitest. There is no UI framework; menus and the HUD are plain HTML and CSS.

- `src/simulation.ts` runs the game at a fixed 30 Hz on plain serializable state. It has no dependency on PlayCanvas or the DOM, so whole matches run headless in tests.
- `src/map.ts` and the per-map files define geometry, objectives and navigation.
- `src/rendering.ts` adapts simulation state to PlayCanvas and builds the procedural models.
- `src/main.ts` owns input, menus, audio and the frame loop.
- `tools/` holds simulation audits and performance diagnostics.

## Documentation

The `docs/` folder holds the project's working notes. They were written during development, largely as logs for AI coding sessions, and are kept for reference rather than polished for readers.

- [GAME_GUIDE.md](docs/GAME_GUIDE.md): detailed mechanics, maps and development scenarios.
- [SPEC.md](docs/SPEC.md): gameplay rules and constants.
- [IMPLEMENTATION.md](docs/IMPLEMENTATION.md): implementation notes by feature.
- [HANDOFF.md](docs/HANDOFF.md): chronological development log and current state.
- [PLAYTEST_REVIEW.md](docs/PLAYTEST_REVIEW.md) and [PLAYTEST_FEEDBACK.md](docs/PLAYTEST_FEEDBACK.md): playtest evidence and feedback.
- [VILLAGE_DETAIL_PASS.md](docs/VILLAGE_DETAIL_PASS.md): proposed art pass for the village.

## Status

This is a prototype. Tests cover the simulation extensively, but rendered performance has not been profiled across browsers or hardware, and balance is still being tuned.

## License

[GPL-3.0](LICENSE). The synthetic voice clips in `public/audio/voices/` are part of the project and covered by the same license.
