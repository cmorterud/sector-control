# Sector Control — continuation handoff

Updated November 1, 2026. Read alongside README.md, SPEC.md, and IMPLEMENTATION.md. This preserves the project decisions and current status; it distinguishes verified Chrome playtests from remaining acceptance work.

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

Latest validation: **20 tests pass**, strict TypeScript passes, production build succeeds, dependency audit reported zero vulnerabilities. Vite warns about a large engine/Ammo bundle (roughly 4 MB raw / 973 KB gzip).

Chrome localhost inspection now works. Recorded direct-input runs verified pointer lock/reacquisition with native Chrome clicks, held movement/sprint, mouse aim, automatic fire, reload, and death/respawn. Native video and JSON were saved and reviewed. A rendered eight-minute autoplay match completed Blue 89 / Red 97 and restarted successfully. Full manual eight-minute gameplay, Firefox, controlled GPU/frame profiling, and repeated-match memory stability remain unverified. See PLAYTEST_REVIEW.md for evidence and exact control limitations.

## Existing recorded-playtest features

- Direct recorded input: `http://localhost:5173/?playtest=1&duration=60`.
- Bot-driven player: `http://localhost:5173/?playtest=1&autoplay=1&duration=60`.
- Click Begin operation. Manual play uses pointer lock; autoplay avoids pointer lock and drives the human slot with shared commands.
- Default clip: 60 wall-time seconds, 1280×720, 30 FPS. `clip=120` permits up to two minutes.
- Video is silent and game-only, with a diagnostic HUD drawn into it. It does not capture the exact DOM HUD, desktop, or microphone. No upload/backend.
- Completion exposes Save webm/MP4 and Save json links. Unsupported video falls back to JSON. Logs contain commands, typed events, one snapshot per simulation second with wall-time alignment, errors, and frame timing statistics.
- Store reviewed artifacts under ignored `playtest-artifacts/`. Recording overhead affects frame timings; benchmark normal play separately.
- Controls: WASD, mouse aim, Shift sprint, RMB aim, LMB fire, R reload, held Tab scoreboard, Escape pause. Normal play pauses on blur/hidden tabs. Other development flags: `bots=0`, `demo=1`, `duration` in seconds.

## Previous browser blocker — historical context

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

## Current Chrome control and recording status

The fresh November 1 session successfully inspected the exact localhost origin using the existing Always allow browsing exception. The cause of earlier origin denials remains unknown; do not present stale session state as a confirmed diagnosis. No raw CDP, alternate browser, or security-setting change was needed.

Read PLAYTEST_REVIEW.md for the working supported APIs and their limitations. Use native Chrome clicks to acquire pointer lock, wait for acquisition before keys, and use timed held keys. `tab.drag` delivers relative look but also fires. Native timed coordinate clicks verify LMB/RMB. Native screenshots use different Retina coordinates from tab screenshots. Focus must stay on the game for normal play; switching tabs pauses it. Pure mouse movement and arbitrary simultaneous button control are not exposed by the documented surface.

Normal Save-link clicks successfully download blob video/JSON into ~/Downloads. `downloadMedia` rejects blob URLs; waiting for a download event hung despite a successful download. Do not repeat that wait; click and inspect the resulting files.

The initial four reviewed recording pairs are archived under ignored playtest-artifacts/, plus contact sheets, review-metrics.json, and full-match-results.txt. The last clip (`sector-control-2026-11-01T21-59-37-988Z`) verifies the recorder fix: 29.93 encoded FPS, 60.01 render FPS, 17.3 ms render p95, and zero errors over 30 seconds of direct input.

A real recorder bug was found and fixed in src/playtest.ts: resetting the capture timestamp to each render timestamp discarded timing remainder, producing about 23 encoded FPS at a 60 Hz render loop. CaptureCadence now advances a fixed deadline and recovers after stalls. New cadence regressions bring the suite to 20 passing tests; strict TypeScript and production build pass. No gameplay rules were changed. Build still reports the known large engine/Ammo bundle warning.

## Soldier movement update

`src/rendering.ts` now creates named articulated soldier rigs with hip/knee/ankle and shoulder/elbow pivots, pelvis, boots, and backpack. Actual interpolated travel drives foot/leg cycles, arm swing, body sway, and sprint lean; backward motion reverses the gait and strafing rotates the hips. Stops blend to standing, aim/fire stabilize the arms, and respawn jumps are excluded. Rig state resets on restart. Simulation rules and hit volumes are unchanged.

Two further Chrome recording pairs (`sector-control-2026-11-01T22-08-45-712Z` autoplay and `...22-09-59-557Z` direct movement) plus walking-joints-review.jpg, soldier-sprint-preview.gif, and animation-review-metrics.json are in ignored playtest-artifacts/. Both run near 60 render FPS and 30 video FPS with zero recorded errors. Direct input covers walking, sprint, backward steps, strafing, and idle. Restart and subsequent movement were verified. TypeScript, all 20 tests, and production build pass. See PLAYTEST_REVIEW.md.

## Next steps

1. Continue direct combat/objective play using the established Chrome procedure. The manual 5v5 run completed for one minute, but the player has not yet scored a recorded manual kill or capture.
2. Improve confidence in simultaneous aim/fire/turn controls within documented capabilities; do not substitute autoplay for direct-input testing.
3. Complete a full manual eight-minute match and systematic cover/obstacle checks. One full rendered autoplay match and a restart are verified; long-running repeated restarts/memory remain unverified.
4. Verify Firefox and controlled 1080p GPU/frame performance separately from recording overhead.
5. Keep work local and within MVP scope. Do not repeat the old permission advice unless a new explicit gate denial occurs.
