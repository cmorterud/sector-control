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

Development scenarios: `?bots=0` disables bots; `?duration=30` runs a thirty-second match; `?demo=1` permits observation without pointer lock; `?overview=1&autoplay=1` gives a top-down observer view for reviewing the layout and bot routes. These do not change normal gameplay defaults.

## Trench front prototype

Choose **Trench front** on the start screen, or open [the 25v25 trench map](http://localhost:5173/?map=trenches). Blue has you plus 24 bots; Red has 25 bots. Industrial remains the default 5v5 map.

The 160 × 128-meter battlefield has **four zigzag trench lines: two per team**. Each team spawns on open ground just behind its first (rear) line, with broad entry ramps. Three communication trenches lead to its second (front) line. The center is exposed no man's land with three objectives, only two short low sandbag remnants, two small wire patches, and decorative shell scars. Bunkers stay behind the rear lines; objectives have no nearby cover walls. Trenches are **2.4 meters deep**: a standing soldier in the center stays below the bank. **1.05-meter firing steps** raise the rifle above the parapet. Ramps and exposed openings remain vulnerable to fire.

Walk near an edge and press **Space** to mantle up or down. The prompt appears when facing a nearby ledge; movement direction takes priority while walking. A climb takes 1.2 seconds: approach, reach with the free right hand, pull up, cross with tucked knees, and stand on the ledge. The left hand stays on the tucked rifle. Foot/torso/head clearance and a stable landing are checked; firing/capturing pauses during the climb. When there is no valid mantle, Space gives a small hop (about 0.45 m high, half a second airborne), with a knee tuck and soft landing. Upward motion stops at ceilings; airborne presses do not trigger another hop. Hops retain normal horizontal collision, so they do not bypass banks or solid cover. Mantling climbs terrain banks rather than buildings or solid cover. Bots can mantle too. The prototype retains the current assault rifle and visible traveling rounds; historical weapons are a separate design pass.

For a log-only 50-soldier test: `http://localhost:5173/?map=trenches&playtest=1&video=0&autoplay=1&duration=60&clip=120`. Snapshots include map ID, team size, elevation, and active mantle state; `mantle` events record start/end and both endpoints; `hop` events record takeoff/landing, and snapshots include active hop height/velocity. A death can interrupt a climb. `teamSize=1..25` changes the roster for experiments.

## Recorded playtests

Open `http://localhost:5173/?playtest=1&autoplay=1&duration=60` and begin the operation. A bot drives the player through the real rendered game and collision adapter. The game records up to 60 seconds at 1280×720/30 FPS; `clip=120` raises the limit to two minutes. Omit `autoplay=1` to record manual play with normal pointer lock.

When the run finishes, the panel provides **Save events.txt** for a readable simulation-time event list, **Save json** for commands/events/state, and **Save webm** (or MP4 when supported) when video is enabled. Save the artifacts under `playtest-artifacts/` for review. The silent video includes a diagnostic HUD; the HTML/CSS overlay itself is not captured. JSON includes every player command, typed events, one state snapshot per simulation second, frame timings, and runtime errors. Wall-time timestamps align samples with the video. This uses canvas capture only, without desktop/microphone permissions, external upload, or a backend. Recording overhead affects frame timings; benchmark normal play separately. Unavailable video encoding falls back to diagnostics only.

This enables repeatable autonomous navigation/combat/capture runs. It supplements tests of real keyboard/mouse input, pointer lock, menus, and subjective combat feel. Local browser-control permission is still required for an agent to launch and inspect runs; the recorder does not bypass it.

Chrome direct input, native video export, a full rendered autoplay match, and restart were verified on November 1, 2026. See [PLAYTEST_REVIEW.md](PLAYTEST_REVIEW.md) for recordings, measurements, the capture-cadence correction, and remaining acceptance checks.

For simulation checks without video, open `http://localhost:5173/?playtest=1&video=0&autoplay=1&duration=40`. Begin the operation, then use **Save events.txt** or **Save json** when it finishes. This skips canvas capture and MediaRecorder entirely. Omit `autoplay=1` to collect direct input instead. Events include simulation ticks/times, projectile IDs, fire/impact, damage, death/respawn, reload, capture, score, and results. JSON snapshots include all active projectile positions and velocities. The normal bounded clip limit still applies to log-only runs.

## Rules and architecture

All simulation uses 30 Hz ticks, plain serializable state, shared human/bot commands, typed events, and an injected collision boundary. `simulation.ts` runs in Node without PlayCanvas or a DOM. `map.ts` is the shared geometry and objective definition. `rendering.ts` adapts PlayCanvas/Ammo and procedural models. `main.ts` owns browser input, menus, audio, and the frame accumulator.

Industrial uses flat axis-aligned geometry. The trench map adds a shared height field, recessed floors, firing steps, and inclined ramps. Movement uses a conservative swept footprint with short substeps and wall sliding; static PlayCanvas/Ammo colliders handle line of sight, bullets, and camera queries. Soldier hit volumes are simulation-owned spheres approximating a capsule. Rendering never determines damage, reload, or capture timing. A future server needs its own trusted collision implementation, command validation, and networking.

Capture requires ten seconds from neutral to ownership; enemy sectors require ten seconds of neutralization followed by ten seconds of capture. Empty progress persists, both teams pause it, and defenders reverse neutralization. There is no capture speed bonus for extra soldiers. Dead soldiers cannot capture. Respawn protection lasts two seconds, permits capturing, and ends upon firing. Rifle rounds visibly travel at 32 m/s, expire after 60 meters, and deal damage on impact. Teammates block rounds without taking damage; protection is checked when the round arrives. Reserve ammo is finite until respawn.

## Local release scope

Primitive art, articulated block soldiers with bending knees/elbows, walking and sprinting motion, synthesized audio, two selectable maps, one weapon. No backend, runtime CDN assets, deployment, accounts, progression, minimap, or kill feed. Hosting is deferred. Dependencies are locked; the Ammo package includes its own embedded runtime.

Use a WebGL 2 desktop browser. Manual release verification should include Chrome and Firefox, an eight-minute match, restarts, pointer-lock loss, movement against every obstacle, close-cover shooting, and 1080p frame/memory profiling on the target machine. Passing unit tests does not establish a GPU performance guarantee.
