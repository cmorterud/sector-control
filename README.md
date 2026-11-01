# Sector Control

Continuing from another chat? Read [HANDOFF.md](HANDOFF.md) for project decisions, implementation state, validation, and the Chrome control and recorded-playtest status.

Local, single-player third-person territory shooter. Blue has you and four bots; Red has five bots. Capture A, B, and C to earn one point per controlled sector every five seconds. Matches last eight minutes.

## Run

Requires Node.js 22.12+ (developed with Node 26).

```sh
npm ci
npm run dev
```

Open the printed localhost URL, then click **Begin operation** to capture the mouse. WASD moves, mouse aims, Shift sprints, right mouse aims down range, left mouse fires, R reloads, Tab holds the scoreboard, and Escape pauses. Losing focus pauses the local simulation. Resume requires a click.

```sh
npm run check
npm run build
npm run preview
```

Development scenarios: `?bots=0` disables bots; `?duration=30` runs a thirty-second match; `?demo=1` permits observation without pointer lock. These do not change normal gameplay defaults.

## Recorded playtests

Open `http://localhost:5173/?playtest=1&autoplay=1&duration=60` and begin the operation. A bot drives the player through the real rendered game and collision adapter. The game records up to 60 seconds at 1280×720/30 FPS; `clip=120` raises the limit to two minutes. Omit `autoplay=1` to record manual play with normal pointer lock.

The recording panel provides separate **Save webm** (or MP4 when supported) and **Save json** links when the clip finishes. Save both under `playtest-artifacts/` for review. The silent video includes a diagnostic HUD; the HTML/CSS overlay itself is not captured. JSON includes every player command, typed events, one state snapshot per simulation second, frame timings, and runtime errors. Wall-time timestamps align samples with the video. This uses canvas capture only, without desktop/microphone permissions, external upload, or a backend. Recording overhead affects frame timings; benchmark normal play separately. Unavailable video encoding falls back to diagnostics only.

This enables repeatable autonomous navigation/combat/capture runs. It supplements tests of real keyboard/mouse input, pointer lock, menus, and subjective combat feel. Local browser-control permission is still required for an agent to launch and inspect runs; the recorder does not bypass it.

Chrome direct input, native video export, a full rendered autoplay match, and restart were verified on November 1, 2026. See [PLAYTEST_REVIEW.md](PLAYTEST_REVIEW.md) for recordings, measurements, the capture-cadence correction, and remaining acceptance checks.

## Rules and architecture

All simulation uses 30 Hz ticks, plain serializable state, shared human/bot commands, typed events, and an injected collision boundary. `simulation.ts` runs in Node without PlayCanvas or a DOM. `map.ts` is the shared geometry and objective definition. `rendering.ts` adapts PlayCanvas/Ammo and procedural models. `main.ts` owns browser input, menus, audio, and the frame accumulator.

The map is flat and axis aligned. Movement uses a conservative swept footprint with short substeps and wall sliding; static PlayCanvas/Ammo colliders handle line of sight, bullets, and camera queries. Soldier hit volumes are simulation-owned spheres approximating a capsule. Rendering never determines damage, reload, or capture timing. A future server needs its own trusted collision implementation, command validation, and networking.

Capture requires ten seconds from neutral to ownership; enemy sectors require ten seconds of neutralization followed by ten seconds of capture. Empty progress persists, both teams pause it, and defenders reverse neutralization. There is no capture speed bonus for extra soldiers. Dead soldiers cannot capture. Respawn protection lasts two seconds, permits capturing, and ends upon firing. Teammates block bullets without taking damage. Reserve ammo is finite until respawn.

## Local release scope

Primitive art, articulated block soldiers with bending knees/elbows, walking and sprinting motion, synthesized audio, one map, one weapon. No backend, runtime CDN assets, deployment, accounts, progression, minimap, or kill feed. Hosting is deferred. Dependencies are locked; the Ammo package includes its own embedded runtime.

Use a WebGL 2 desktop browser. Manual release verification should include Chrome and Firefox, an eight-minute match, restarts, pointer-lock loss, movement against every obstacle, close-cover shooting, and 1080p frame/memory profiling on the target machine. Passing unit tests does not establish a GPU performance guarantee.
