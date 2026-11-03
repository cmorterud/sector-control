# Sector Control

Continuing from another chat? Read [HANDOFF.md](HANDOFF.md) for project decisions, implementation state, validation, and the Chrome control and recorded-playtest status.

Local single-player third-person shooter. Industrial is 5v5 territory control; Trench front is a 25v25 elimination duel fought from firing steps. Matches last eight minutes.

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

Press **G** to throw a grenade in the direction you're looking. Each soldier gets **three per spawn**. Grenades arc under gravity, bounce off terrain/cover, and explode **three seconds after release**, with a flash, expanding blast effect, rising smoke, and sound. The **7 m blast radius** deals up to 140 damage with distance falloff; solid cover blocks damage. Your own grenade can hurt you; teammates and protected spawns take no damage. Aim up/down to change the arc. Throws briefly interrupt rifle fire; a held G does not repeatedly throw. Smoke is visual rather than an AI visibility barrier. Bots carry their inventory but still use rifles automatically; grenade throws are player-controlled in this version.

## Destruction prototype

Grenades now excavate persistent craters and damage wooden obstacles, trench lining, and sandbags in both maps. A ground-level grenade can dig roughly 0.5 m at its center across an initial 3.5 m footprint, with a smooth rounded bowl; airbursts dig less. Repeated hits deepen and widen the bowl, with a lowest floor of −0.9 m. Craters affect walking height, cover, bullets, camera collision, and bot routes. Parapet crests can be chipped, and repeated concentrated hits can create a breach. Wooden lining can break away while the earth behind it remains solid. Sandbags lose height before disappearing. Two light wooden screens behind the trench lines provide additional destructible cover.

Buildings, bunkers, containers, and concrete barriers stay solid and protect their foundations. Dust, smoke, and flying fragments accompany destruction; fragments are cosmetic. Changes last for the match and reset on restart. This is a height-field prototype without tunnels, overhangs, or structural building collapse. Explosion profiles separate soldier damage, structural damage, and excavation settings and artillery fire missions.

Destruction events record the source, world revision, object health/stage, changed terrain samples and rebuilt patches. JSON snapshots include the accumulated world state. The renderer replaces only affected local terrain meshes/colliders and refreshes damaged cover; bots recalculate routes after changes.

## Artillery prototype

**Hold Q** to mark ground, **left-click while holding Q** to confirm, or release Q to cancel an unconfirmed marker. A green marker is valid; orange explains what blocks the call. Looking level marks ground about 45 m ahead; looking downward traces a precise surface point. Calls need a clear view, 15–70 m range, and enough room for shell scatter. In trenches, use a firing step or stand above the parapet to spot. Rifle fire is suppressed while marking.

Each team has one shared charge: first available **30 seconds** into the match, then **90 seconds** after each confirmed call. Death does not replenish it or cancel an ordered barrage. If a team has a human player, only that human can call its artillery, including while waiting to respawn. Teams made entirely of bots coordinate their own calls. In normal play this reserves Blue's charge for you; autoplay has no human-controlled soldiers, so both teams can call automatically.

An incoming ground marker and local warning give roughly **six seconds** before a **five-shell barrage**, with shells one second apart, scattered within 10 m of the target. Descending visible shells whistle and burst on solid surfaces, including bunker roofs. Each shell has a 12 m damage radius, cover-aware falloff, larger dust/smoke, flying debris, and a nominal **7 m crater footprint / 1 m depth** (less for elevated bursts, capped by the existing −0.9 m floor). Light cover breaks; fixed buildings/bunkers remain. The marked danger area includes scatter and blast reach. Self damage applies; teammates and protected spawns retain grenade protection. Smoke remains cosmetic.

Bots leave threatened firing posts, seek a safe point in their own trench, and return after the barrage. Destroyed firing steps send them to nearby intact stations. This is a balance prototype: no artillery guns, ammunition types, creeping barrages, suppression system or structural building collapse yet.

Typed `artilleryCall`, `artilleryLaunch`, `artilleryImpact`, `artilleryEvade` and `artilleryEnd` events link mission/shell IDs; snapshots include team cooldowns, missions, shells and retreat state. Recorder summaries count calls, impacts and retreats. Runtime terrain cuts remain sparse/serializable with a revision-based numeric lookup cache for movement and rays.

## Trench front prototype

Choose **Trench front** on the start screen, or open [the 25v25 trench map](http://localhost:5173/?map=trenches). Blue has you plus 24 bots; Red has 25 bots. Industrial remains the default 5v5 map.

The 160 × 128-meter battlefield has **four zigzag trench lines: two per team**. Each team enters its rear line from open-ground spawns, then follows communication trenches into its front line. **The front parapets are continuous: there are no ramps or walk-through exits into no man's land.** Rear entry ramps remain.

No man's land starts with **six real shell craters and five broad, shallow depressions**. The former flat shell-scar disks are now actual ground, shared by movement, bullets and camera collision. The main bowls are roughly 0.55–0.7 m deep, with gentle undulations of 0.12–0.18 m; overlapping relief is capped at 0.85 m. Terrain only goes downward, with a clear buffer before the front parapets and level footing around existing cover. Two old scars were moved away from wire patches. Grenades can deepen these starting craters, and restarting restores their authored shape.

Trenches are **2.4 m deep**, with **0.85 m firing steps** along the front edges. The floor conceals a standing soldier from the opposing trench. On a step, the head/helmet and raised rifle clear the parapet while the torso stays behind earth. Walk back off the step to shelter. Cover and visibility come from the actual world geometry; shots aimed below the parapet strike the bank.

Bots take individual firing positions inside their own front trench, aim at exposed heads, and do not autonomously assault across the center. Their aim drifts smoothly, with bloom building during bursts and recovering between them: about 0.8 m maximum aim spread at 40 m for a fresh shot, widening to 1.4 m during sustained fire. Player rifle aim is unchanged. Trench scoring awards one point per enemy elimination; the highest score at timeout wins. Its HUD/results show eliminations rather than capture objectives. Industrial retains A/B/C territory scoring. No man's land remains sparsely covered with two short sandbag remnants, wire patches, and shell scars.

Walk near an edge and press **Space** to mantle up or down. The prompt appears when facing a nearby ledge; movement direction takes priority while walking. A climb takes 1.2 seconds: approach, reach with the free right hand, pull up, cross with tucked knees, and stand on the ledge. The left hand stays on the tucked rifle. Foot/torso/head clearance and a stable landing are checked; firing/capturing pauses during the climb. When there is no valid mantle, Space gives a small hop (about 0.45 m high, half a second airborne), with a knee tuck and soft landing. Upward motion stops at ceilings; airborne presses do not trigger another hop. Hops retain normal horizontal collision, so they do not bypass banks or solid cover. Mantling climbs terrain banks rather than buildings or solid cover. Manual mantling still lets you deliberately go over the top, fully exposed; trench bots stay at their firing posts. The prototype retains the current assault rifle and visible traveling rounds; historical weapons are a separate design pass.

For a log-only 50-soldier test: `http://localhost:5173/?map=trenches&playtest=1&video=0&autoplay=1&duration=60&clip=120`. Snapshots include map ID, scoring mode, team size, elevation, and active mantle state; `mantle` events record start/end and both endpoints; `hop` events record takeoff/landing, and snapshots include active hop height/velocity. A death can interrupt a climb. `teamSize=1..25` changes the roster for experiments.

## Recorded playtests

Open `http://localhost:5173/?playtest=1&autoplay=1&duration=60` and begin the operation. A bot drives the player through the real rendered game and collision adapter. The game records up to 60 seconds at 1280×720/30 FPS; `clip=120` raises the limit to two minutes. Omit `autoplay=1` to record manual play with normal pointer lock.

When the run finishes, the panel provides **Save events.txt** for a readable simulation-time event list, **Save json** for commands/events/state, and **Save webm** (or MP4 when supported) when video is enabled. Save the artifacts under `playtest-artifacts/` for review. The silent video includes a diagnostic HUD; the HTML/CSS overlay itself is not captured. JSON includes every player command, typed events, one state snapshot per simulation second, frame timings, and runtime errors. Wall-time timestamps align samples with the video. This uses canvas capture only, without desktop/microphone permissions, external upload, or a backend. Recording overhead affects frame timings; benchmark normal play separately. Unavailable video encoding falls back to diagnostics only.

This enables repeatable autonomous navigation/combat/capture runs. It supplements tests of real keyboard/mouse input, pointer lock, menus, and subjective combat feel. Local browser-control permission is still required for an agent to launch and inspect runs; the recorder does not bypass it.

Chrome direct input, native video export, a full rendered autoplay match, and restart were verified on November 1, 2026. See [PLAYTEST_REVIEW.md](PLAYTEST_REVIEW.md) for recordings, measurements, the capture-cadence correction, and remaining acceptance checks.

For simulation checks without video, open `http://localhost:5173/?playtest=1&video=0&autoplay=1&duration=40`. Begin the operation, then use **Save events.txt** or **Save json** when it finishes. This skips canvas capture and MediaRecorder entirely. Omit `autoplay=1` to collect direct input instead. Events include simulation ticks/times, projectile IDs, fire/impact, damage, death/respawn, reload, capture, score, and results. JSON snapshots include all active projectile positions and velocities. The normal bounded clip limit still applies to log-only runs.

## Rules and architecture

All simulation uses 30 Hz ticks, plain serializable state, shared human/bot commands, typed events, and an injected collision boundary. `simulation.ts` runs in Node without PlayCanvas or a DOM. `map.ts` is the shared geometry and objective definition. `rendering.ts` adapts PlayCanvas/Ammo and procedural models. `main.ts` owns browser input, menus, audio, and the frame accumulator.

Industrial starts on flat ground with axis-aligned obstacles. Both maps support runtime grenade excavation. The trench map adds a shared height field, recessed floors, firing steps, and inclined ramps. Movement uses a conservative swept footprint with short substeps and wall sliding; static PlayCanvas/Ammo colliders handle line of sight, bullets, and camera queries. Soldier hit volumes are simulation-owned spheres approximating a capsule. Rendering never determines damage, reload, or capture timing. A future server needs its own trusted collision implementation, command validation, and networking.

Capture requires ten seconds from neutral to ownership; enemy sectors require ten seconds of neutralization followed by ten seconds of capture. Empty progress persists, both teams pause it, and defenders reverse neutralization. There is no capture speed bonus for extra soldiers. Dead soldiers cannot capture. Respawn protection lasts two seconds, permits capturing, and ends upon firing. Rifle rounds visibly travel at 32 m/s, expire after 60 meters, and deal damage on impact. Teammates block rounds without taking damage; protection is checked when the round arrives. Reserve ammo is finite until respawn.

## Local release scope

Primitive art, articulated block soldiers with bending knees/elbows, walking and sprinting motion, synthesized audio, two selectable maps, one rifle and throwable grenades. No backend, runtime CDN assets, deployment, accounts, progression, minimap, or kill feed. Hosting is deferred. Dependencies are locked; the Ammo package includes its own embedded runtime.

Use a WebGL 2 desktop browser. Manual release verification should include Chrome and Firefox, an eight-minute match, restarts, pointer-lock loss, movement against every obstacle, close-cover shooting, and 1080p frame/memory profiling on the target machine. Passing unit tests does not establish a GPU performance guarantee.
