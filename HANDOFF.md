# Sector Control — continuation handoff

Updated November 2, 2026. Read alongside README.md, SPEC.md, and IMPLEMENTATION.md. This preserves the project decisions and current status; it distinguishes verified Chrome playtests from remaining acceptance work.

## Current checkpoint — start here

- Latest prototype: **pre-cratered no man’s land**. Six former flat shell scars are actual 0.55–0.7 m bowls, plus five broad 0.12–0.18 m depressions; combined relief caps at 0.85 m. Negative-only terrain, a protected front-parapet buffer, unchanged cover footing/trenches/spawns and preserved firing lanes. Two holes moved clear of wire. Shared quarter-meter authored grid stays separate from mutable grenade cuts, and reset restores the authored baseline. `terrain-relief.ts` constructs it; meshes/collision refine both layers. See PLAYTEST_REVIEW.md and starting-terrain-review.jpg.
- Latest tuning: larger, rounder grenade excavation. Radius 1.75 m (3.5 m diameter), nominal depth 0.55 m (roughly half a meter for ground bursts), with a flat-centered, smooth-rim radial bowl rather than the old pointed dent. Existing damage radii, depth limits, collision and cover protection remain in force. New shape regression checks broad middle, center curvature, symmetry, footprint and walkability.
- Latest verification/fix: wood/earth coplanar faces caused the reported wall flicker. Lining now extends 4 cm toward the trench and posts rise 6 cm above panels; a geometry regression and final native recording verify the separation. Final direct artifact `sector-control-2026-11-03T03-00-56-503Z`: 750 ticks, one crater, three timber sections destroyed, 60.03 FPS, no slow frames or errors. Optimized 25v25 artifact `...T02-53-13-710Z`: three craters, 59.80 FPS / 16.8 ms p95, zero errors; only >33 ms frame was startup. See PLAYTEST_REVIEW.md for scope and earlier diagnostic artifacts.
- Latest feature: **grenade destruction prototype**. Persistent craters on open ground/floors/ramps/steps and parapet dents; cumulative excavation can open a walkable breach. Quarter-meter sparse cuts, −0.9 m minimum floor, protected fixed foundations, pre-explosion cover evaluation. Wood (40 HP) and sandbags (160 HP) have damaged/destroyed stages; damaged cover keeps 60% height, destruction removes collision. Segmented timber reveals retained earth. Two small rear wooden screens were added. New `destruction.ts` / `terrain-geometry.ts` and owned `TerrainPhysics` backend keep movement, rays, mesh, cover and bot routes aligned. Restart restores authored state and clears terrain triangle caches. Shared profiles support future artillery; no artillery UI, tunnels or building collapse yet.
- Latest approved change: less accurate bots with smoothly drifting aim and burst bloom. Trench base cone 0.02 rad (about 0.8 m at 40 m), max 0.035 rad (1.4 m); each actual shot adds 0.25 normalized bloom, stopping fire recovers fully from max in 18 ticks (0.6 s). Industrial retains its 0.035 rad base and also gets bloom. Player shot trajectories are unchanged. aimBloom is included in soldier snapshots and reset on respawn. Zero/custom BotSettings aim error is honored. See PLAYTEST_REVIEW.md for comparison and native logs.
- Latest native accuracy check: log-only `sector-control-2026-11-02T20-28-40-573Z`, 60 seconds / 1,800 ticks, 4,637 shots, 392 damaging impacts (8.45%), 93 deaths, 59.83 FPS, zero errors. Fixed-seed headless comparison fell from 13.00% to 6.26% damaging impacts per shot; these are match metrics rather than guaranteed hit probabilities. Local comparison/native metrics and JSON/events are in playtest-artifacts/.
- Latest feature: **G grenades**, three per soldier on spawn, player-controlled throws in both maps. Arcing 20 m/s launch with gravity and damped bounces, three-second fuse, seven-meter blast, radial damage/cover blocking, self damage but no teammate damage, throw animation, flash/radius/smoke/audio. Smoke is cosmetic; bots still fire rifles and do not yet auto-throw. HUD shows inventory. Typed throw/bounce/explosion events and active grenade snapshots are recorded. Close timber release and tiny terrain sweeps have regression coverage. See the grenade section in PLAYTEST_REVIEW.md.
- Latest follow-up: removed the persistent exposed/below-parapet status line at the user's request. Contextual mantle prompts remain.
- Latest request: use the supplied trench reference images to fight **from inside opposing trenches**, with no open exit ramps into the center and only exposed heads/raised rifles visible from firing steps.
- Implemented: four zigzag lines (two per team), spawns on land behind the rear lines at x = ±67 m, rear entry ramps at ±57 m, communication corridors, and **continuous front parapets**. The previous ±14 m ramps into no man's land are gone.
- Floor 0 m, bank/land **2.4 m**, firing steps **0.85 m**. The actual rendered torso stays below the bank; head/helmet and raised rifle clear it. World collision blocks torso/floor shots. Trench rifle/vision height is 1.65 m above feet; bots aim at exposed heads. Left hand remains on the rifle grip.
- **25v25 trench duel:** 25 individual front firing stations per faction. Bots enter and hold their own trench, settle on firing steps, and do not auto-mantle/assault into no man's land. Default trench engagement range 59 m and aim error 0.02; custom BotSettings still work. Navigation includes narrow ramp anchors to avoid mirrored-side lattice failures.
- **Trench scoring now uses eliminations**, one point per enemy kill; HUD/scoreboards/results and recorder overlay reflect that. Industrial remains 5v5 sector control. The optional scoring preference question was asked asynchronously; elimination scoring was the stated default while waiting. If the user later chooses capture mode, treat that as steering, without reintroducing open front ramps or concealed-target hits.
- Space still mantles deliberately over the top or hops when no valid ledge exists. Going over the top exposes the player. Hop/mantle animation, ceiling checks, cooldowns, restart cleanup, visible projectiles, and 25-soldier rosters remain intact.
- Current checks: **88 tests**, strict TypeScript, production build. Coverage includes all firing-station paths, sealed front exits, hidden torso/floor vs exposed head damage, actual Ammo rays, actual character transforms, scoring, and an **eight-minute headless duel** that keeps firing/killing in the final minute. This is not a new eight-minute manual/GPU acceptance pass.
- Native 60-second artifact `sector-control-2026-11-02T18-03-47-421Z`: 3,219 shots, 1,440 impacts, 116 deaths, Blue 59 / Red 57, 59.54 FPS / 17.8 ms p95, zero errors, zero automatic mantles, no sampled soldier entering |x| < 18 m. Direct step-up/step-down artifact `sector-control-2026-11-02T18-31-20-874Z`: 750 ticks, 59.92 FPS, zero errors; holding forward stops on the step against the front wall, backing away returns below the parapet. Final presentation artifact `sector-control-2026-11-02T18-35-01-012Z` verifies the revised HUD/recorder caption; see PLAYTEST_REVIEW.md and parapet-review-metrics.json.
- Prefer event logs for simulation checks: `http://localhost:5173/?map=trenches&playtest=1&video=0&autoplay=1&duration=60&clip=120`. Save events.txt / Save json. Normal play: **http://localhost:5173/?map=trenches**. Optional `overview=1&autoplay=1` shows the layout from above.
- Preserve preferences: local only, no deployment/push; autonomous Chrome control/playtesting, commit tested changes, update this handoff. Localhost browsing exception is already Always allow. `demo=1` allows direct keyboard tests without pointer lock; normal pointer lock is unchanged. Keep actual screenshots/video for visual requests, logs for routine simulation verification.
- Remaining acceptance: full manual eight-minute gameplay, Firefox, controlled 1080p GPU/memory/repeated-match checks, and balance tuning. Earlier open-ramp/capture-mode artifacts are historical and do not describe current trench play.

## What the user wants next

The agent should **play the game itself**, record gameplay, inspect problems, fix them, and repeat without asking the user to play or describe each bug. Direct Chrome keyboard/mouse control is established; continue using the supported procedure below. Bot-driven runs supplement direct input testing; they do not replace it. Recording/autoplay support is already implemented.

## Project and decisions

- Independent project: `/Users/codymorterud/scratch/sector-control`. Follow parent workspace AGENTS.md.
- Git branch `main`; initial commit `67e0bd6`, `Build Sector Control local MVP with recorded playtests`. Includes the recording feature.
- Standalone PlayCanvas, strict TypeScript, Vite, Vitest, Ammo world raycasts, HTML/CSS UI. No React, backend, networking, or hosted editor.
- User explicitly chose **local first; defer public deployment**.
- Default eight-minute 5v5 industrial match, plus the approved 25v25 trench prototype. Three sectors, one current rifle, respawn, scoring, results, and restart. See SPEC.md for gameplay constants.
- Defenders reverse partial neutralization at the same rate. Enemy sectors need ten seconds to neutralize plus ten to capture. Empty progress persists; contests pause it.
- Simulation and bots are engine independent. Headless collision is simplified and does not establish Ammo equivalence or GPU performance.

## Source map

- `src/simulation.ts`: tick/state, commands/events, combat, objectives, scoring, respawn, waypoint A*, configurable bots, JSON-safe snapshots.
- `src/map.ts`, `src/trench-map.ts`: map definitions, height fields/ramps, geometry, spawns, objectives, walking and mantle-landing queries.
- `src/trench-combat.test.ts`: concealment/exposed-head projectile damage, elimination scoring, and full-length sustained trench combat.
- `src/hop.test.ts`, `src/rendering.test.ts`: hop physics/ceiling/action priority and actual rig ledge/grip/foot transforms.
- `src/trench-map.test.ts`, `src/mantle.test.ts`: 50-soldier routes/match, deep cover/steps, mantle lifecycle and blocked actions.
- `src/physics.ts`, `src/physics.test.ts`: explicit Ammo backend initialization and real-engine thin-wall/projectile regression.
- `src/rendering.ts`: PlayCanvas/Ammo adapter, procedural map/characters, camera, interpolation, effects.
- `src/main.ts`, `src/style.css`: input/pointer lock, HUD, menus, audio, loop, recorder integration.
- `src/playtest.ts`: optional bounded game-only video, diagnostics-only mode, readable event timelines, and command/event/state/frame/error logs.
- `src/simulation.test.ts`, `src/playtest.test.ts`: rule and recorder-log/driver tests.

## Run and validation

```sh
cd /Users/codymorterud/scratch/sector-control
npm run dev
npm run check
npm run build
```

The dev server previously ran on port 5173; check before starting another instance. Prefer **http://localhost:5173**, matching the user's explicit browsing permission exception. Vite may print 127.0.0.1 because of its bind setting; continue browsing the localhost origin because permissions are origin-specific.

Current validation: **88 tests pass**, strict TypeScript passes, production build succeeds, dependency audit reported zero vulnerabilities. Vite warns about a large engine/Ammo bundle (roughly 4 MB raw / 973 KB gzip).

Chrome localhost inspection now works. Recorded direct-input runs verified pointer lock/reacquisition with native Chrome clicks, held movement/sprint, mouse aim, automatic fire, reload, and death/respawn. Native video and JSON were saved and reviewed. An earlier rendered eight-minute autoplay match completed Blue 89 / Red 97 and restarted successfully, before the later projectile and Ammo initialization changes. Full manual eight-minute gameplay, Firefox, controlled GPU/frame profiling, and repeated-match memory stability remain unverified. See PLAYTEST_REVIEW.md for evidence and exact control limitations.

## Existing recorded-playtest features

- Direct recorded input: `http://localhost:5173/?playtest=1&duration=60`.
- Bot-driven player: `http://localhost:5173/?playtest=1&autoplay=1&duration=60`.
- Click Begin operation. Manual play uses pointer lock; autoplay avoids pointer lock and drives the human slot with shared commands.
- Default clip: 60 wall-time seconds, 1280×720, 30 FPS. `clip=120` permits up to two minutes.
- Video is silent and game-only, with a diagnostic HUD drawn into it. It does not capture the exact DOM HUD, desktop, or microphone. No upload/backend.
- Completion exposes Save events.txt, Save json, and (when enabled/supported) Save webm/MP4 links. `video=0` disables video while retaining diagnostics. Unsupported video falls back to diagnostics. Logs contain commands, typed events, one snapshot per simulation second with wall-time alignment, errors, and frame timing statistics.
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

## Rifle support-hand fix

The left hand now belongs to a rifle foregrip anchor instead of the independently animated forearm. `attachSupportArm` poses the shoulder/elbow to reach the grip after each weapon transform, including sprint, recoil, and reload tilt. An ad hoc check using the actual method and PlayCanvas transforms covered 220 poses with maximum wrist/grip separation 1.35e-7 meters. A further Chrome recording (`sector-control-2026-11-01T22-18-48-649Z`) and rifle-grip-review.jpg / rifle-grip-metrics.json are in ignored playtest-artifacts/: 60 render FPS, zero errors, successful video decoding. All 20 existing tests and the production build pass.

## Traveling projectile update and log-only verification

User requested visibly traveling rifle rounds. Simulation now owns 32 m/s projectiles, 60-meter lifetimes, swept world/soldier hits, and impact-time damage/feedback. Bright faction-colored tracers are interpolated from simulation state. Muzzle overlap, allies, protection at arrival, shooter death, and cleanup are covered. Bots lead targets; the optional player driver compensates for its shoulder camera.

This work exposed a pre-existing missing Ammo backend: native logs showed zero world hits. `src/physics.ts` now initializes AmmoPhysicsWorld explicitly and passes it to Application before static colliders are built. The new real-engine regression verifies a thin wall, rays above it, and projectile impact while physics stepping is disabled. Earlier browser observations did not prove world-ray acceptance. Simplified full-match tests remain separate from GPU/native map profiling.

The user asked about verifying events without screenshots. Prefer `?playtest=1&video=0&autoplay=1&duration=40` for simulation checks: no video capture/encoder; Save json and Save events.txt provide typed events and a readable timeline. Manual input works by omitting autoplay. JSON schema is now version 2, with projectile state and fire/impact events linked by projectile ID. Times in events.txt are simulation times, distinct from snapshot wall-time alignment. Retain a brief visual check for presentation requests such as projectile visibility; avoid repeated screenshots for simulation validation.

Verified artifact pairs: `sector-control-2026-11-01T22-39-34-973Z` (direct 20-second video/JSON, 26 shots / 26 wall hits at 0.97-second delay) and `...22-41-31-229Z` (40-second log-only JSON/events.txt, 436 shots / 320 impacts / 14 kills / two captures / zero errors). Both end with zero active rounds. Log-only run showed no video download link and restart worked. Readable direct timeline is playtest-artifacts/projectile-wall-events.txt; metrics are projectile-review-metrics.json and optional flight preview is projectile-flight-preview.gif. Baseline logs ...22-30-17-055Z and ...22-32-12-941Z preserve the failed pre-fix world-ray diagnosis, not acceptance evidence. TypeScript, all 32 tests, and build pass.

## Next steps

1. Continue direct combat/objective play using the established Chrome procedure. The manual 5v5 run completed for one minute, but the player has not yet scored a recorded manual kill or capture.
2. Improve confidence in simultaneous aim/fire/turn controls within documented capabilities; do not substitute autoplay for direct-input testing.
3. Complete a full manual eight-minute match and systematic cover/obstacle checks. The earlier full rendered autoplay match predates projectiles/Ammo initialization. Current-projectile native verification covers a short match and restart; full-length current-system and repeated-match memory checks remain unverified.
4. Verify Firefox and controlled 1080p GPU/frame performance separately from recording overhead.
5. Keep work local and within MVP scope. Do not repeat the old permission advice unless a new explicit gate denial occurs.
