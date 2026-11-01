# Sector Control — continuation handoff

Updated November 1, 2026. Read alongside README.md, SPEC.md, and IMPLEMENTATION.md. This preserves the project decisions and current blocker; it does not establish browser acceptance.

## What the user wants next

The agent should **play the game itself**, record gameplay, inspect problems, fix them, and repeat without asking the user to play or describe each bug. Establish direct keyboard/mouse control in Chrome. Bot-driven runs supplement direct input testing; they do not replace it. Recording/autoplay support is already implemented.

## Project and decisions

- Independent project: `/Users/codymorterud/scratch/sector-control`. Follow parent workspace AGENTS.md.
- Git branch `main`; initial commit `67e0bd6`, `Build Sector Control local MVP with recorded playtests`. Includes the recording feature.
- Standalone PlayCanvas, strict TypeScript, Vite, Vitest, Ammo world raycasts, HTML/CSS UI. No React, backend, networking, or hosted editor.
- User explicitly chose **local first; defer public deployment**.
- Eight-minute 5v5: human plus four Blue bots versus five Red bots. Three sectors, one industrial map, one rifle, respawn, scoring, results, and restart. See SPEC.md for gameplay constants.
- Defenders reverse partial neutralization at the same rate. Enemy sectors need ten seconds to neutralize plus ten to capture. Empty progress persists; contests pause it.
- Simulation and bots are engine independent. Headless collision is simplified and does not establish Ammo equivalence or GPU performance.

## Source map

- `src/simulation.ts`: tick/state, commands/events, combat, objectives, scoring, respawn, waypoint A*, configurable bots, JSON-safe snapshots.
- `src/map.ts`: geometry, spawns, objectives, movement footprint queries.
- `src/rendering.ts`: PlayCanvas/Ammo adapter, procedural map/characters, camera, interpolation, effects.
- `src/main.ts`, `src/style.css`: input/pointer lock, HUD, menus, audio, loop, recorder integration.
- `src/playtest.ts`: bounded game-only video with diagnostic HUD and command/event/state/frame/error logs.
- `src/simulation.test.ts`, `src/playtest.test.ts`: rule and recorder-log/driver tests.

## Run and validation

```sh
cd /Users/codymorterud/scratch/sector-control
npm run dev
npm run check
npm run build
```

The dev server previously ran on port 5173; check before starting another instance. Prefer **http://localhost:5173**, matching the user's explicit browsing permission exception. README originally uses 127.0.0.1 in an example; those origins have separate permissions.

Latest validation: **18 tests pass**, strict TypeScript passes, production build succeeds, dependency audit reported zero vulnerabilities. Vite warns about a large engine/Ammo bundle (roughly 4 MB raw / 973 KB gzip).

Observed early in Chrome: start screen, pointer-lock start, map/soldiers/HUD, short bot match with scoring. Pointer-lock reacquisition later failed. Unverified: full human-like playthrough, native video output, Firefox, GPU/frame/memory profiling, and restart stability. Headless tests include repeatable eight-minute 5v5 matches with kills and captures; do not confuse these with rendered acceptance.

## Existing recorded-playtest features

- Direct recorded input: `http://localhost:5173/?playtest=1&duration=60`.
- Bot-driven player: `http://localhost:5173/?playtest=1&autoplay=1&duration=60`.
- Click Begin operation. Manual play uses pointer lock; autoplay avoids pointer lock and drives the human slot with shared commands.
- Default clip: 60 wall-time seconds, 1280×720, 30 FPS. `clip=120` permits up to two minutes.
- Video is silent and game-only, with a diagnostic HUD drawn into it. It does not capture the exact DOM HUD, desktop, or microphone. No upload/backend.
- Completion exposes Save webm/MP4 and Save json links. Unsupported video falls back to JSON. Logs contain commands, typed events, one snapshot per simulation second with wall-time alignment, errors, and frame timing statistics.
- Store reviewed artifacts under ignored `playtest-artifacts/`. Recording overhead affects frame timings; benchmark normal play separately.
- Controls: WASD, mouse aim, Shift sprint, RMB aim, LMB fire, R reload, held Tab scoreboard, Escape pause. Normal play pauses on blur/hidden tabs. Other development flags: `bots=0`, `demo=1`, `duration` in seconds.

## Browser blocker — avoid repeating the same advice

1. Later browser calls were rejected for both 127.0.0.1:5173 and localhost:5173. Messages included “The user declined permission” and “A saved permission or managed policy denies access.”
2. **User says no approval prompt appeared.** Do not assert that the user deliberately declined.
3. User reports another ChatGPT desktop session accessed localhost successfully. Chrome mouse interaction worked there; built-in browser mouse interaction had problems. Prefer Chrome for the requested test.
4. User supplied screenshots from **ChatGPT desktop Settings → Computer Use → Google Chrome → Manage**. Initially no custom sites were shown; defaults were Requires approval.
5. User then added **http://localhost:5173, Browsing = Always allow**. Downloads still showed Requires approval. Extension showed Installed. Full CDP access is not established as necessary.
6. A retry after that visible change still failed for the exact localhost origin. **Cause unknown.** Stale chat state is a hypothesis, not a diagnosis. Do not ask the user to add the same browsing exception again.
7. Read-only checks found no browser_use rules in ~/.codex/config.toml and no standard requirements files at ~/.codex/requirements.toml or /etc/codex/requirements.toml. No project .codex/config.toml was found. The permission storage file was not identified.
8. A fresh chat was suggested using official extension troubleshooting. User is worried about losing context; this handoff addresses that. A new chat is an experiment, not a promised fix.

In a new session, read the browser tool documentation and locate the current Chrome game tab; old tab IDs and REPL bindings are not durable. Attempt normal supported inspection. If rejected again, stop the blocked operation and report it. Do not bypass the gate through raw CDP, shell browser automation, native screenshots of the blocked site, alternate origins, or another browser. Do not change security settings without authorization.

Official guidance: https://learn.chatgpt.com/docs/chrome-extension — allowed/blocked websites and troubleshooting. Earlier Settings → Browser advice concerned the built-in browser; Chrome uses Settings → Computer Use → Chrome → Manage.

## Next steps

1. Verify supported Chrome inspection in the new session. If still blocked, diagnose prompt/permission handling; do not label it a game bug.
2. Establish sustained keyboard movement and relative mouse aim under pointer lock using documented tool capabilities. Continuous FPS-style input has not yet been proven.
3. Record a short direct-play session, save video/JSON, inspect frames/events, and fix reproducible problems. Use existing autoplay for supplemental repeatable coverage.
4. Run affected tests/build, then a full match and restart check. Separate observations from unverified performance/subjective claims.
5. Keep work local and within MVP scope; update this handoff as progress changes.
