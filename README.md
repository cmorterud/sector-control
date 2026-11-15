# Sector Control

A single-player First World War shooter that runs in the browser. You fight alongside and against bots for control of flags across trench lines, a shelled forest and a destructible village, in first or third person.

![Verdun sector](public/previews/verdun.jpg)

**[Play it in your browser](https://sector-control-trial-20261108.cody22597.chatgpt.site/)** — no sign-in. Use a desktop browser with a keyboard and mouse, and click **Begin operation** to start. The hosted build is a snapshot and can lag behind this repository.

## Features

- **Large bot battles.** Up to 50 soldiers a side, with riflemen, machine gunners, smoke-screened assaults, suppression, cover-seeking and imperfect aim.
- **Five maps.** Trench front, Verdun sector, Village front, a smaller 5v5 Industrial map, and an early greybox of Lighthouse point.
- **Destructible battlefields.** Grenades and artillery crater the ground, breach trench banks, fell trees and knock holes in walls, floors and roofs. Buildings collapse when they lose enough support, and bots reroute around the damage.
- **Three roles.** Rifleman, Marksman and Support, each with a faction-specific primary and a pistol, plus grenades, smoke, bayonets, callable artillery and rare flame kits.
- **Period factions.** Britain, France and Imperial Germany, with stylized procedural soldier and weapon models.
- **No accounts or backend.** Soldiers, weapons, terrain and most audio are generated in code; a few landmark buildings are contributed models. There is no networking.

## Maps

| Map | Size | Objective |
| --- | --- | --- |
| Trench front | 50v50 | Four flags in opposing trench lines across no man's land |
| Verdun sector | 50v50 | Five flags through woodland, craters and communication trenches |
| Village front | 50v50 | Five flags in a nine-building village around a two-story manor |
| Lighthouse point (greybox) | 50v50 | Three flags along a coastal headland, from the mainland road to the lighthouse |
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

Useful URL parameters: `?map=trenches`, `?map=verdun`, `?map=village` or `?map=headland` selects a map (Industrial is the default), `?view=first` or `?view=third` sets the camera, `?bots=0` disables bots and `?duration=30` shortens the match to thirty seconds.

## Continuous integration and publishing

[GitHub Actions](https://github.com/cmorterud/sector-control/actions/workflows/ci.yml) installs locked dependencies, type-checks, runs the tests and builds on pull requests and pushes to `main`. A passing push to `main` uploads `dist/` and deploys it to GitHub Pages. Pull requests never deploy. You can also run the workflow manually from Actions.

One-time repository setup: open [Settings → Pages](https://github.com/cmorterud/sector-control/settings/pages) and select **GitHub Actions** as the build source. The game will publish at **https://cmorterud.github.io/sector-control/** after a successful deployment. No personal token or repository secret is needed in the workflow. If Actions or Pages is disabled for the repository/account, an owner must enable it first.

The workflow builds with `/sector-control/` as Vite's base path (derived from the repository name), including map previews, voice clips and landmark models. Ordinary local builds retain `/` for root hosting such as the existing trial. For a GitHub Pages custom domain, change the workflow base path to `/`.

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

[GPL-3.0](LICENSE). The synthetic voice clips in `public/audio/voices/` and the contributed landmark models in `public/models/` are covered by the same license.
