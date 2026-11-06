# Implementation notes

The project implements the five local milestones: environment/controller, combat, objective match loop, bots, and placeholder presentation. Public deployment is deferred.

## Validation

- Strict TypeScript, Vitest, and Vite production build.
- Repeatable full eight-minute headless 5v5 runs assert combat, captures, valid state, and completion.
- Chrome initialization, pointer-lock start, rendered map/characters/HUD, and a short match with bot sector scoring were observed during development.
- Dependency audit reported zero vulnerabilities after updating Vitest.
- Chrome localhost access now works. Native input verified pointer lock, held movement/sprint, mouse turning, aim/fire, reload, and death/respawn in recorded direct-input runs.
- A full rendered eight-minute autoplay match completed Blue 89 / Red 97, followed by a successful restart. This is separate from full manual acceptance.
- Native VP8 video and JSON export were saved and reviewed. A measured capture-cadence issue was corrected: encoded output improved from about 23 to 29.93 FPS while rendering remained near 60 FPS. See PLAYTEST_REVIEW.md.

## Remaining manual acceptance

Full human playthrough, Firefox checks, target-machine GPU profiling, long-running restart/memory profiling, and subjective weapon/bot tuning remain unverified. Do not treat headless simulation throughput as GPU performance evidence.

Opt-in recorded playtests now provide a shared-command autonomous driver, bounded game-only video clips with diagnostic HUD, command/event/state logs, runtime errors, and frame statistics. See the README for the playtest URL. Log/driver and capture-cadence tests, native Chrome recordings, and the production build validate the integration. The projectile checkpoint passed 32 tests; the current trench checkpoint passes 43 tests. Artifacts live under ignored playtest-artifacts/.

## Traveling projectiles and event-only checks

The rifle now spawns serializable 32 m/s projectiles with a 60-meter range. Per-tick swept segments select the closest world/soldier impact; damage, kills, hit markers, and hit audio occur there. Allies and protected enemies block rounds without damage; shots persist after shooter death. Muzzle obstruction handles cover and point-blank soldiers, and expired/match-end rounds are removed. The renderer interpolates bright, faction-colored tracer bolts. Bots lead moving targets, and the optional player driver accounts for its elevated shoulder camera.

Native event logs exposed a pre-existing null physics backend: a standalone Application did not trigger the library-loading path that installs Ammo. `physics.ts` now explicitly constructs the backend and passes it to Application. A real Ammo thin-wall/height test verifies static raycasts and projectile impacts without stepping physics. The previous headless adapter remains simplified; this test is not full map/GPU equivalence.

The verified direct Chrome run fired 26 rounds and logged 26 world impacts, each about 0.97 seconds after launch, with no active rounds at the end. A 40-second log-only 5v5 run recorded 436 shots, 320 impacts (203 world and 71 damaging), 14 kills, two captures, a 4/4 draw, and zero errors near 60 render FPS. Restart reset the match. `video=0` skips video recording; Save events.txt exposes a readable timeline. JSON schema version 2 includes projectile snapshots and distinct fire/impact events. Strict TypeScript, all 32 tests, and production build pass. See PLAYTEST_REVIEW.md.

## Soldier movement

Soldiers now use named hip, knee, ankle, shoulder, and elbow joints, with a pelvis, boots, and backpack. Actual interpolated travel drives alternating steps, knee lift, arm swing, torso sway, and sprint lean. Backward steps reverse the gait; strafing turns the hips. Motion eases back to standing when travel stops, while aiming/firing stabilizes the arms. Respawn jumps do not advance the gait, and restart recreates the rigs.

Chrome recordings verified a 30-second 5v5 autoplay run and a 40-second direct walking/sprint/backward/strafe/idle run, both near 60 render FPS and 30 encoded FPS with no recorded errors. Restart and movement after restart were also checked. Strict TypeScript, all 20 existing tests, and production build pass. This is a visual change; hit volumes and simulation rules are unchanged. See PLAYTEST_REVIEW.md for artifact names.

The left hand is parented to a rifle foregrip anchor. A two-bone support-arm pose makes the shoulder and elbow follow that anchor through gait, sprint lean, recoil, and reload tilt. An engine-transform check of 220 weapon poses kept the wrist within 0.00001 meters of the grip. A further 30-second Chrome 5v5 recording ran at 60 render FPS with no recorded errors; all 20 tests and the production build pass.

## Deliberate implementation choices

- Axis-aligned obstacle footprints and height-aware terrain use conservative footprint movement with substeps and wall sliding. World raycasts use static PlayCanvas/Ammo colliders; soldier hit volumes belong to simulation.
- Test collision is a simplified map adapter, not an equivalence test of Ammo. Any future server must implement trusted collision and movement validation.
- Shared primitive geometry/materials, automatic frustum culling, modest directional shadows, short-lived effects, static map batching and dynamic articulated-soldier batching support up to fifty soldiers. Restart destroys old actor, objective, and effect entities while retaining shared map/material assets.
- The static bundle includes PlayCanvas and embedded Ammo, so Vite reports a large-chunk warning. It builds successfully and makes no runtime CDN requests.
- `?bots=0`, `?duration=30`, and `?demo=1` are local development aids. Demo avoids pointer lock for observing a short match. Normal play uses pointer lock and the full eight-minute default.
- Rules and bots currently share one engine-independent module to keep this initial project small. Split them by system as complexity grows; do not move state authority into render entities.

## Trench prototype and mantling

`MapDefinition` selects industrial or trench data for simulation, navigation, renderer, spawn layout, objectives, and collision. `trench-map.ts` generates a 2-meter height grid and greedily merges equal-height earth into static boxes; ramps remain inclined colliders. Shared `groundHeight`, swept walking, and height-aware A* prevent walking through cliff faces. Every one of the 50 spawn positions has a tested route to all three objectives. Actor position, camera, hit spheres, muzzle/aim, and logs include elevation.

Trench depth is 2.4 m and firing steps are 1.05 m. Space validates a nearby stable terrain landing and sweeps feet, torso, and head through a 1.2-second approach/reach/pull/crouched-cross/stand motion. Commands, serialized mantle state, start/end events, climbing poses, firing/capture suppression, cooldown, and death/respawn cleanup stay in the normal simulation flow. Bots use the same action near useful front-line ledges. Space falls back to a short ballistic hop while retaining the conservative horizontal movement footprint.

For 25v25, respawns use a 5 × 5 assembly grid. AI planning phases are staggered, objective switching has hysteresis, target queries reuse visibility and bound acquisition rays, and projectile sweeps query nearby soldier buckets. Queries recheck health so simultaneous arriving rounds cannot count the same death twice. Static and dynamic batch groups reduce draw calls while preserving joint animation and the rifle support-hand attachment. Restart recreates actor batches and clears effects/projectiles.

Validation includes 43 tests, strict TypeScript, production build, all-spawn reachability, a full 60-second headless 50-soldier match, mantle lifecycle/collision regressions, and real Ammo checks of bank occlusion, firing-step sight lines, ramp surface height, and a completed mantle. Native Chrome evidence and limits are recorded in PLAYTEST_REVIEW.md. Short native runs are not full eight-minute or controlled 1080p acceptance, and faction balance still needs tuning.


## Trench lining junction correction

Decorative timber panels previously extended across communication routes even though the shared movement terrain correctly left them open. Lining is now clipped to genuine earth boundaries after the final height field and ramps are defined; posts stay inside each resulting panel. This corrects the visual obstruction instead of adding an invisible obstacle to a required route. A regression covers all six junctions and confirms a lined earth bank still stops walking. Strict TypeScript, 44 tests, build, and recorded direct Chrome traversal pass.


## Space hop and grounded mantle animation

The Space command first tries a valid abrupt terrain ledge. Walkable ramps are excluded. Otherwise it starts a small hop with gravity, head clearance, landing/cooldown, typed takeoff/landing events, and serializable height/velocity. Held browser key-repeat is ignored and midair requests cannot start another action. Walking collision remains conservative during flight. World-space soldier/muzzle/hit heights follow the hop; death/respawn clears it.

Mantle state stores the ledge and approach direction. Eased root phases approach, reach, pull, cross with tucked feet, and stand. Simulation clearance follows the raised feet during the crouched crossing. The rendered rig leans, raises its knees, tucks the rifle in its left hand, and solves the free right arm toward a fixed world ledge point during the pull. Interpolated simulation time drives the poses; hops and landings have distinct leg compression. A transform-only test runs the real rig/IK code and verifies right-wrist ledge contact, left-wrist foregrip attachment, and feet above the bank.

Validation: 49 tests, strict TypeScript, production build, real Ammo mantle integration, and recorded direct Chrome hop/up/down inputs. The 30-second direct recording ran at 59.87 render FPS with zero errors; see PLAYTEST_REVIEW.md for artifacts and the final 25v25 run. This remains primitive procedural animation rather than a motion-captured character rig.


## Four-line battlefield and open no man's land

Both factions now have two zigzag trench lines (front x offsets 21/29 m, rear offsets 49/57 m). The old dug spawn pocket and straight rear trench are replaced by open-ground spawns at x = ±67 m and matching zigzag rear lines. Ten-meter-wide rear entry ramps align with the full 5 × 5 roster. Three communication corridors connect each rear/front pair. Front exits, 2.4 m bank depth, 1.05 m firing steps, mantle/hop mechanics, and sector rules remain.

Central sandbag fortifications were reduced from twelve walls to two 0.65 m remnants; two small wire patches sit near the ends. All central cover occupies less than 15 m² and stays at least 10 m from sectors. Bunkers moved behind the rear lines. Existing height-clipped timber lining keeps new junctions clear. Optional `overview=1` uses an orthographic observer camera without fog to review the four lines and real bot traversal.

All 50 tests pass, including four-band layout checks, spawn height/side/straight-entry checks for all 50 soldiers, all-spawn reachability, low/sparse central cover, full 60-second headless 25v25 combat and captures, and existing hop/mantle/Ammo/rig tests. Native observations and recording evidence are in PLAYTEST_REVIEW.md.


## Closed parapets and firing-step duels

Front exit ramps were removed; all high entry ramps are behind the rear lines. The complete front parapet now stops walking at every communication route. Front firing steps cover all seven zigzag sections and are 0.85 m high. World-space tests of the real rig keep torso/vest/backpack/pelvis below the 2.4 m bank while the helmet and raised barrel clear it. Actual Ammo rays distinguish an exposed head from the concealed torso/floor.

The map provides 25 firing stations per side. Trench bots route to their own station, settle there, aim at exposed heads and fire across the gap. They do not strafe off posts or auto-mantle out. Default trench aim/range are tuned for head-sized targets (0.01 radians, 59 m); explicit BotSettings overrides remain honored. Short ramp anchors supplement the navigation lattice so both mirrored firing steps are reachable. Industrial keeps its objective doctrine.

Map-selected scoring distinguishes sectors from eliminations. Trench kills award one faction point; capture logic and objective rendering/UI are disabled there. Industrial scoring is unchanged. Typed snapshots include scoring mode. The recording overlay reflects trench elimination scoring. The persistent exposure HUD cue was removed at the user's request; contextual mantle prompts remain. Manual hop/mantle remain available.

Validation: 55 tests, including all 50 firing-station routes, closed exits, exposed-head projectile damage, concealed targets, one-point kill scoring, real Ammo rays, actual rig bounds/IK, and an eight-minute headless duel with shots and deaths still occurring in its final minute. Recorded 60-second Chrome combat and direct step-up/step-down checks pass; exact metrics are in PLAYTEST_REVIEW.md.

## Throwable grenades

Commands carry a one-shot grenade input; G ignores keyboard repeat and inventory resets to three on spawn. Simulation owns grenade position/velocity, a 90-tick fuse, 24-tick cooldown and 15-tick rifle interruption. Pitch adjusts the lofted ballistic arc. Four substeps per tick and seven shell rays prevent tunneling; axis-separated impacts reflect/damp velocity and ground contact adds friction. Release clearance checks both ray directions beside timber. The map collision adapter supplements tiny native sweeps to keep the shell above the authoritative terrain. Its box queries now use exact slabs and terrain entry uses binary refinement; this also improves short headless ray accuracy.

A radial explosion measures body-center distance, tests three body-height cover rays, and uses shared damage/death/score handling. Enemy eliminations count once, self deaths do not award kills/points, allies and spawn-protected soldiers are safe. Grenades survive owner death, expire once, and clear on match end. Active grenades and their sequence are snapshot-safe. Logs include grenadeThrow (origin/velocity/deadline), grenadeBounce and grenadeExplosion (position/radius/hits), with throw/explosion counters in summaries. Schema v2 is extended additively.

Rendering interpolates/spins the shell, briefly animates the throwing arm, and creates a fading flash, expanding radius disc and nine rising smoke puffs. Per-explosion materials/entities are destroyed after four seconds and on restart. Explosive blast smoke is cosmetic. The newer F smoke inventory and bot screens are described below.

Validation: 65 tests including inventory/cooldown, aimed arc/fuse, thin-wall and real Ammo terrain sweeps, close-panel release, cover/falloff, friendly/protected/self damage, scoring, death/respawn/end cleanup and isolated event logs. Native keyboard recordings verify HUD inventory, throwing, bounces, smoke, full-roster combat and restart; exact artifacts/metrics are in PLAYTEST_REVIEW.md.

## Bot aim bloom

The approved accuracy adjustment replaces fast correlated sine jitter with independent yaw/pitch samples in a unit disk, smoothly interpolated over one-second intervals. Samples are deterministic per soldier/tick and do not advance gameplay RNG. Trench base aim error rises from 0.01 to 0.02 rad. Industrial retains its existing 0.035 rad base; both use the same bloom behavior. Custom BotSettings, including zero aim error, still apply.

Each actual rifle shot adds 0.25 normalized aimBloom up to 1. Bot aim scales by 1 + 0.75 × bloom, so trench spread grows from about 0.8 to 1.4 m at 40 m. Non-firing ticks (also reload/mantle/empty magazine/grenade action) recover 1/18 per tick, reaching baseline after 0.6 seconds from full bloom. Respawn resets it and soldier snapshots serialize it. Human rifle direction never uses this aim offset; matching human command streams produce identical projectile trajectories regardless of bloom state.

Regression coverage exercises actual burst buildup/recovery, respawn, angular bounds and smoothness, reduced exposed-head projectile hits, unchanged firing cadence, zero aim error, and unchanged human trajectories. The full eight-minute headless duel still shoots and kills in its final minute. Exact before/after and native results are in PLAYTEST_REVIEW.md.

## Destructible terrain and cover prototype

`destruction.ts` owns per-match world state and explosion profiles. `runtimeMap` clones mutable cover/state while sharing immutable authored terrain. Sparse quarter-meter depth samples modify `groundHeight` using the same piecewise triangular interpolation as the rendered ground. Explosions evaluate cover and excavation against the existing world, then commit edits, advance its revision, refresh collision and invalidate navigation. Slope relaxation widens repeated cuts rather than leaving deep narrow traps; the lower bound is −0.9 m. Foundations and shielded surfaces are protected. Wood/sandbags use stable health/stage IDs, with 60%-height damaged cover and removal on destruction. Timber segments are cosmetic retaining panels: removing them does not remove surviving earth.

`terrain-geometry.ts` generates top surfaces and actual vertical bank faces. Eight-meter patches start coarse, refining only two-meter cells that contain cut samples. Vertex coloring darkens excavated soil. `TerrainPhysics` owns a separate Ammo world for these triangle meshes; all renderer rays combine it with the existing static-object world. A patch replacement removes its old body before adding the updated mesh. Restart destroys that backend and its triangle cache, restores map/cover meshes, and creates a pristine world. Destructible visuals use a separate batch group; cosmetic fragments fade out. Existing shell-scar decals are hidden where actual excavation replaces them.

Simulation explosion profiles separate soldier damage, structural damage and excavation radius/depth/standoff. `Game.explode` provides the shared future-artillery entry point; grenades invoke it after their fuse. Soldier damage uses pre-destruction cover. Typed destruction events carry revisions, object changes, terrain samples and affected patches, and snapshots include full mutable world state. Bot navigation caches reset and replanning is staggered after changes. Characters settle to the new ground; mantles continue unless their endpoints changed.

Validation includes actual thrown-grenade craters, cumulative excavation and walkable breaches, bounded slopes/depth, roof/foundation shielding, staged sandbag collision, wood removal without same-blast penetration, preserved earth behind broken lining, navigation through a destroyed opening, snapshot/restart isolation, unaffected mantles and actual Ammo ray agreement on lowered floors/chipped parapets. Native recording details and limits are in PLAYTEST_REVIEW.md.

The new terrain faces exposed a coplanar-depth problem in authored timber placement: the wood face lay on the earth face. Runtime lining is offset 4 cm toward the lower trench side, and posts extend 6 cm above panel tops to remove the second overlapping surface. A regression checks every timber facing lies on the trench side of the bank. Native post-fix recording shows stable lining, a persistent crater and three fully destroyed sections.

Grenade excavation was enlarged to a 1.75 m radius / 0.55 m nominal depth. Its radial weight is now (1 − (distance/radius)²)², giving a rounded center and soft rim instead of the previous pointed quadratic falloff. Existing standoff attenuation, slope relaxation, cumulative edits, protections and maximum depth still apply. A shape regression verifies the broader middle, low center slope, symmetry, outer boundary and walkability.

## Pre-cratered no man's land

`terrain-relief.ts` builds deterministic authored depressions once for the trench map. The six old shell-scar disks become real circular bowls, alongside five broad shallow ellipses. All changes are negative, capped at 0.85 m, tapered away from front parapets and masked around existing cover. Two circles move away from wire so their centers remain proper bowls. The base trench height field is unchanged outside the central strip.

Authored samples use the same quarter-meter triangular interpolation as runtime cuts, with a compact numeric grid for fast ground queries and sparse metadata for affected patches. This avoids the initial dictionary-lookup slowdown in the full headless match. Mesh generation scans only local grid samples when refining authored terrain, and refines both authored and explosion layers. Static relief is separate from mutable destruction state: fresh matches start at revision zero with no runtime crater events, grenades deepen the baseline, and restart restores it. Flat scar disks are omitted and existing rim rubble follows sampled ground.

Four regressions cover six traversable bowls, bounds/protected surfaces and preserved firing lanes (including pre-existing cover obstruction), actual Ammo hit heights, and cumulative grenade excavation/reset over the authored shape. All 88 tests and the production build pass.

## Artillery fire missions

`artillery.ts` owns validation, shared team cooldowns, seeded scatter, scheduled swept shells, bot calls/retreat commands, and aim selection. The simulation owns this serializable state and advances it at 30 Hz; the renderer only interpolates shells and presents markers/blasts. Player commands carry an optional artillery target, revalidated in the simulation. Q marking consumes no charge until LMB confirms a valid call and suppresses rifle input. Pause/reset clears pending input and preview. Confirmed missions survive caller death; ending/restarting clears active shells/missions.

Artillery uses the same cover-aware explosion/destruction path as grenades, with a separate profile. Fixed structures take roof impacts and remain protected. Bots retreat along their existing navigation graph and return when the hazard expires; damaged firing steps trigger intact-post fallback. Both factions use the same call constraints. Simulation validation reserves a team's charge for its humans whenever humanPlayerIds identifies someone on that team, including during death/respawn. AI targeting never calls for a human's team or controls a human's artillery automatically. Autoplay passes an empty human roster so both all-bot teams can call; snapshots record the roster. A weak revision cache turns sparse terrain cuts into numeric height lookups; canonical snapshots remain unchanged by the cache.

## Suppression, concealing smoke and squad advances

`smoke.ts` computes the growing/fading ellipsoid envelope and segment optical depth shared by bot vision, artillery spotting and rendering. Dedicated smoke canisters use the grenade sweeps with a slower throw, independent inventory, and a landing-aware fuse. Clouds are simulation-owned, survive thrower death, and expire/reset independently; bullets and explosion LOS remain physical world queries. Existing blast smoke is cosmetic.

`suppression.ts` evaluates nearby enemies along clipped projectile segments using spatial buckets. Per-projectile soldier IDs prevent repeat accumulation; world LOS rejects suppression through cover. Suppression decays, widens bot aim drift, and makes firing-step defenders briefly step down, with a cooldown before another duck. Human input/shot direction are unchanged; typed near-miss events drive restrained audio/vignette feedback.

`assault.ts` schedules one small advancing group per faction, excludes humans, reserves the rest of the team for covering fire, and tracks per-member crater/trench milestones. Throwing angle uses the same launch speed/gravity as human smoke, aimed to screen each route leg. Each leg waits for its cloud to thicken; scarce/dead carriers can stall a wave. Mantles pass through the existing full body-clearance checks. Members who enter the enemy trench retain a forward firing position until respawn. Artillery evasion and suppression take priority over assault movement. Clouds, squad state and all inventories reset on a fresh match.

Near-miss queries increased short-ray volume. The shared simplified collision adapter now conservatively rejects boxes outside the ray segment's AABB before allocating exact slab endpoints; nearby thin-cover sweeps keep the existing exact intersections. Artillery bot cadence/cooldown checks also precede team-role scans. These preserve gameplay behavior and let the default full test suite retain its existing long-simulation timeouts.

## Held crouching

`crouch.ts` owns stance height/radius helpers, overhead clearance and transition events. Commands request crouch; the simulation updates stance before actions/combat. Walking retains the existing horizontal collision footprint at 2.25 m/s. Space requests standing for hop/mantle, with blocked headroom preserving the low pose. Death/respawn resets it. Bot visibility, all three projectile soldier queries (camera targeting, muzzle obstruction, swept arrival), firing camera/muzzle, throws, blast shielding, suppression and artillery spotting use the common stance profile. Standing heights/hit geometry remain their prior values.

The renderer blends a 0.55 m drop with a knee angle derived from actual leg length/body height, keeping boots on the ground through the transition. Camera lowering follows that same blend; rifle support IK still runs after posing. Logical hit stance changes on the simulation tick while the visible pose blends. Bank-edge clearance probes skip adjacent height-field earth below the crown rather than mistaking parapet sides for ceilings; genuine overhead world geometry remains checked. Crouch is recorded in snapshots, commands and typed stance events, with summary counts.

Crouched muzzle sweeps additionally use the authoritative simplified map adapter to cover a native mesh ray starting exactly on the parapet face. Actual-Ammo tests include a vertical bank-hit positive control and the flat, low barrel edge case. Standing muzzle behavior is unchanged.

## Compact paired trench layout

The rear line shifts inward 12 m, reducing matching front/rear center spacing from 28 to 16 m while preserving four separate zigzag lines. Rear entrance/spawn/bunker/screen coordinates derive from the rear-line position. The front parapets, firing steps and authored no-man's-land relief retain their positions. Each communication trench uses two offset 4 m wide legs and a short transverse connection; solid earth blocks the old axial shot. Clipped timber generation follows the revised height field. Navigation uses the same height-aware graph and runtime lining checks.

Battle arrival timing changes with the shorter approach, so the short live-fire scenario verifies smoke/covering-fire/crater progress; an isolated no-defender-fire scenario verifies that a screened squad can physically land in the enemy trench. Arrival milestones now require a completed mantle/hop before setting a forward post. This avoids recording an enemy-trench occupation while a soldier is still descending over its parapet.

## Repeated bot crossing attempts

Assault cleanup schedules the next team attempt 18–24 seconds later (deterministic stagger) rather than 45. Squad size stays 3–4 and a ready, armed group at a lane remains necessary; most soldiers keep firing. Carrier selection filters living squad members at the same route stage, preferring the original leader when available but replacing a dead/reloading/depleted carrier. Inventory and throw validation still live in Game.

Each stage's recorded screen gains a ready flag only when its actual cloud exceeds 0.65 density. Once released, that leg remains committed when smoke fades. A survivor already beyond the initial leg with no carrier/screen waits three seconds beyond regrouping before sprinting onward exposed. Initial trench departure still requires smoke. These are AI decisions only: no invulnerability, bonus smoke, forced human movement or automatic human-team artillery. Snapshot copies include the stage readiness with mission state. Four regressions cover recovery, optical buildup/fade, depleted inventory and repeated bounded waves.

While assigned to an assault, bots skip periodic pathfinding back to their normal post. Squad routes provide movement; cleanup resets nextThink/path so normal navigation resumes. Vision, shooting decisions while waiting, suppression and artillery priority remain active. This avoids repeated expensive home routes from the field and keeps the original full-battle test time limits.

## Softer aim and bot attention

Newest defaults: trench base error 0.026 rad / industrial 0.04, with the existing smooth independent drift and 1.75× full-bloom multiplier. Trench maximum geometric offsets at 40 m are about 1.04 m fresh and 1.82 m bloomed. Human shots still omit bot drift/bloom. Reaction increases from 11 ticks to 18 plus a per-acquisition 0–6-tick stagger; burst cadence remains a separate gate. Explicit zero reaction and zero/custom aim settings remain honored. Constructor settings now accept Partial<BotSettings>.

Each acquisition sets a deterministic 90–180-tick focus deadline. When it expires, the bot clears its target for 18–36 ticks; ordinary movement continues, aimed tracking and rifle fire stop. It cannot scan/reacquire during this interval. The normal visibility search then resumes and sets spottedAt afresh, including for the same enemy. Lost LOS/smoke still clears targets and restarts reaction normally. Artillery evasion and suppression retain priority, and assault orders retain their movement/smoke behavior. No persistent player-facing status label.

New focusUntil/distractedUntil fields serialize/reset with Soldier. Typed botAttention events carry acquired/lost/distracted phases, actor/target IDs and deadlines; recorder summaries count acquisitions/breaks. Hashes based on soldier and tick stagger deadlines and reactions without consuming gameplay RNG. focusMaxTicks=0 disables breaks, reactionJitterTicks=0 disables stagger; reactionTicks=0 bypasses both reaction components. New tests cover actual no-fire intervals and delayed return to fire, target changes, per-soldier deterministic timing, snapshot isolation/respawn, custom settings and wider aim cones/actual head hits. Existing smoke reacquisition test now isolates the longer reaction from burst gating.

## Actual rifle recoil

`recoil.ts` owns deterministic, per-soldier pitch/yaw offsets. Each consumed shot uses its pre-kick weaponAim, emits the applied offset, then adds 0.012 rad upward plus up to 0.003 rad alternating side impulse. Angular state caps at 0.06 / ±0.018 rad and exponentially recovers at 5/s per fixed tick, snapping below 0.0001 rad to rest. ADS multiplies impulses by 0.8; crouch by another 0.85. The first shot from rest is centered; sustained fire climbs, and release/reload allow recovery.

Base p.yaw/p.pitch stay as commanded. weaponAim adds independent recoil when calculating muzzle/camera aiming rays and projectile directions; Renderer uses the same effective view angle. Human mouse motion can counter-steer and normal bot target solving cannot zero the kick each tick. New soldier fields recoilPitch/recoilYaw/recoilShots/lastShotAt serialize and reset on respawn. Existing bot drift/bloom and attention remain separate; human firing now intentionally uses recoil.

Renderer layers an exp(-20t) mechanical pulse onto rifle rearward travel (9 cm), barrel pitch (5°) and upper-body shoulder tilt (2°), keeping support IK attached throughout. It also follows commanded vertical aim, which the former tiny backward-only cosmetic animation did not. Mantle/throw poses retain priority; dead bodies suppress the pulse. No physics impulse moves the soldier.

Six regressions verify physical projectile climb/drift, counter-steering, independent bot recoil despite perfect target commands, bracing/recovery/snapshot/reset, actual-shot-only impulses (including blocked barrels), and real rig kick/settling/grip transforms. The damage/lifecycle and concealed/exposed head fixtures now explicitly recenter each deliberate shot rather than assuming recoil-free volleys. Full suite **143 tests** and production build pass.

## Asymmetric authored front and overlapping waves

The fixed four-line layout is now independently authored per faction. Blue's seven front sections include longer runs and setbacks; Red has eight tighter sections at different z coordinates. Rear lines vary separately, and six small side bays widen isolated shelter pockets away from the front face. Twenty-five stations per side are distributed across actual step centers. Continuous parapets, 2.4 m banks, 0.85 m steps, spawns at ±55 m and six-crater/five-depression field relief remain. Communication floor centers and entrance offsets align with the 2 m raster: each dogleg has opposite openings 10 m apart in z, a central traverse and 16–20 m front/rear separation. Simplified and actual Ammo rays block the direct entrance-to-exit line.

MapDefinition carries optional trenchLines and communicationRoutes metadata. Navigation supplements its regular graph with dogleg waypoint samples and low-side ramp-end anchors. The latter fixes a Red corner where a ramp's longitudinal edge had no walkable lattice exit; all fifty physical navigation runs now reach their own stations in thirty seconds with firing/assaults disabled. Timber clipping follows the updated terrain boundary.

Assault selection recruits ready bots near any authored front step. It ranks nearest friendly-side crater routes, favoring an already dense smoke cloud, then selects an opposing crater and an actual enemy step. Departure waypoints clear the furthest friendly parapet before diagonal travel; final approach aligns outside the opposing line. Smoke targets are clamped to 15 m before the ballistic solve when a setback makes the first crater too distant. No bonus inventory/invulnerability is granted.

A launch schedules the next eligible window 12–18 seconds later rather than waiting for cleanup. At most two missions per team use launch areas at least 12 m apart, without duplicate membership. At most eight bots are committed/holding forward/returning across the field; human IDs are excluded. Expired plans still restore ordinary navigation. Assault launch/departure/approach metadata serialize with missions, and assaultStart records launch coordinates. Existing aim/attention/recoil and evasion priorities remain. Tests enforce overlap/caps/independent lanes/smoke preference, live repeated starts, actual progress and cleanup, all-post concealment, asymmetric topology and nav/Ammo collision.

## Doubled trench roster

The trench default is fifty soldiers per side; normal play is human +49 versus fifty bots. Shared resolveTeamSize keeps main/UI and Game defaults/caps aligned, with experimental teamSize=1..50 and independent industrial 5v5/single-soldier demos. Fifty unique stations/team keep 1.2 m spacing. Front steps extend from 6 to 10 m where needed; the short Blue section retains four posts. Spawns move back 5 m to ±60 m so the 8-column formation starts on clear land behind the ramp; rear cover stays in place.

With changed station spacing/spawns, bots could replan through a nearby anchor behind them or cut a corner early within the 0.6 m arrival threshold. pathfind removes visible redundant prefix anchors; the movement loop advances to the next waypoint only if that segment is walkable. All one hundred physically settle at distinct steps in a controlled 30 s navigation check. Tests retain cover/Ammo/recoil/attention and 25v25 assault cases alongside the larger-roster geometry checks.

First actual GitHub run 41770451040 installed and typechecked successfully, passing 146/147 tests. Its eight-minute simulation took ~19.9 s and exceeded the old 15 s local-oriented limit. The integration test now permits 60 s while retaining full duration, scoring and final-minute shot/death checks. This changes a test execution budget, not simulation speed or match length. Local suite **148 tests** and build pass.


## Automatic trench drops

Horizontal soldier movement permits downward terrain discontinuities while keeping the 0.23 m upward walking limit and ordinary cover collision. Only recessed trench lining has crest/descending/overlap-escape handling; the earth behind it and rear wooden screens stay solid. Navigation walkSegment remains conservative so ordinary routes still use ramps; assault movement and player input may step off an edge. Mantle routes only accept upward ledges.

Soldier.fall stores startTick and downward velocity, integrates gravity at 30 Hz from absolute world feet height, and lands on the current terrain. Hop also integrates absolute feet height with originY for its pose, so crossing a drop does not snap the root onto the lower floor. Excavation can remove support and begin a fall. Neither midair Space nor artillery spotting can start; assault recruitment/milestones wait for grounded soldiers. Death/respawn clear the state. Typed fall start/land events, snapshots and recorder fall/fallLandings totals expose the lifecycle.

Rendering interpolates the root normally, tucks the legs during descent and compresses on landing while preserving crouch and the support-hand grip. The Space hint only advertises upward climbs; instructions describe walking off edges. Seven new simulation regressions plus a real-rig pose/grip regression bring the suite to **156 tests**. Existing up-mantle, Ammo collision, concealment, navigation and full combat checks remain.


## Battlefield sound and blast reactions

battlefield.ts derives presentation from existing typed events and actual per-tick soldier travel, without writing simulation state or consuming gameplay RNG. Rifle sources use their real muzzles, shell whistles their launch points, and bullet cracks the existing cover-checked nearMiss positions. The sound router tests ear-to-source occlusion for world sources; local fire/footsteps and unobstructed crack events bypass this extra ray. Actual grounded stride distance drives footsteps for the closest eight soldiers within 18 m; idle, airborne, mantle and teleport movement reset/suppress strides. Crouch/sprint change spacing and volume.

Shared duckboards()/intactBoard() define cosmetic wood footprints and material classification. Only originally flat floor patches receive planks; ramps/steps stay earth. Rendering batches the boards separately and removes unsupported ones after excavation, regenerating only that batch. Wood footsteps then become mud. Boards have no collider and do not affect navigation or sightlines.

battle-audio.ts owns one gesture-created AudioContext. Shared noise buffers plus short oscillators synthesize rifle attacks/tails, ground steps, projectile cracks, shells, explosions and debris. Per-voice filters soften distant/covered sound. World PannerNodes use equal-power positioning and inverse distance attenuation; AudioListener follows the local soldier's ear and weapon view, including autoplay. Sound travel adds up to 0.35 s delay for remote shots/blasts. Up to 28 ordinary voices leave reserved capacity up to 40 for the listener, cracks and explosives; completed sources disconnect all nodes. A master compressor controls overlapping transients. Pause stops voices and suspends the context; reset stops voices and restores hearing while retaining the audio graph and volume. No sound assets, external requests or microphone use.

Nearby grenade/artillery events add distance- and cover-weighted shock, capped at one. Camera angles decay rapidly (maximum pitch 0.009 rad / yaw 0.006 rad / roll 0.45 degrees); hearing low-pass/gain recover within 3.5 s. Death/respawn/restart clear shock. The renderer adds camera motion to its view only, preserving authoritative aim/commands, and skips motion for overview. The menu toggle disables camera motion independently of hearing. Rigs briefly brace their upper torso and rerun support-hand IK; existing dust/blast visuals remain.

Playtest format version 3 adds presentation counters, audio voice/drop statistics and at most 160 recent routed sounds. Game audio runs through the same limited mix into a MediaStreamDestination; recorders clone only that output's audio track into their canvas capture, prefer VP8/Opus, and stop the clone without muting the live game. Gameplay events/snapshots remain unchanged. Native video/audio analysis and limitations are recorded in PLAYTEST_REVIEW.md.

API references: [PannerNode](https://developer.mozilla.org/en-US/docs/Web/API/PannerNode), [AudioListener](https://developer.mozilla.org/en-US/docs/Web/API/AudioListener), [game-output stream destination](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/createMediaStreamDestination).


## Semi-auto rifles, imperfect awareness and harsher explosions

Rifle commands now pass an authoritative rising-edge trigger gate. Soldier.triggerHeld/triggerPressed serialize with state; holding fire cannot repeat, and a press made during cooldown/reload/throwing does not become a later shot. The mechanical interval is six ticks (300 rpm). Normal dead-player processing preserves a held trigger through respawn so it cannot fire automatically. Browser input buffers one mousedown edge independently of mouseup, avoiding missed short clicks; holding it never queues repeats. UI instructions and rifle labels describe semi-auto. Existing recoil, projectile speed, damage and player aim remain.

awareness.ts provides serializable per-soldier confidence, visible flag, last observed aim point, estimated horizontal velocity, next-look/next-trigger times and shot-string count. Vision uses a roughly 126-degree forward field, with close silhouettes (<7 m) and recent gunfire (<40 m / 20 ticks) allowing attention outside it when actual sight is clear. Perception refreshes every 5–9 ticks, and movement is estimated from consecutive observations rather than reading live target velocity. Recognition needs confidence >=0.75 plus a 27–45 tick reaction; yaw/pitch turn rates are limited. Lead uses 35–70% of an intercept estimate capped at 0.7 s. Losing smoke/solid sight cancels firing, with a short search of the remembered position; reacquisition resets recognition. Candidate botAttention acquired events precede readiness to fire.

Default drift cone is 0.06 rad in trenches / 0.075 industrial, plus independent per-shot perturbations scaled by 0.65 of that base cone. Moving/being suppressed widens the tracking error. Two or three single trigger pulls use 7–15 tick gaps followed by a 20–45 tick pause, extended under suppression; no shared global burst clock in normal awareness mode. Focus lasts 60–120 ticks and breaks last 24–54 ticks. Hash samples are per soldier/time and do not consume gameplay RNG. Tests may disable awareness to isolate geometry/ballistic/attention-timer contracts; default combat uses the new model.

Artillery first charge is 20 s and the shared cooldown 50 s. Six-second warning, five shells, scatter, damage, deformation and human-team ownership remain. Audio uses a 1 ms broadband attack, quickly closing filter and separate filtered-noise rumble; explosion voices contain no pitched oscillator. A full mix can evict a lower-priority voice for a grenade/artillery burst, retaining the 40-voice cap. Waveform decoding and actual native recorded audio supplement the graph tests; subjective listening remains useful.

The thrown-grenade reproductions detonated in the opposing trench; no missing-fuse failure was reproduced. Low bursts could be mostly hidden by the trench lip. Existing real Ammo grenade integration and new throws into both factions' trench floors verify timed detonation and soldier damage, including after thrower death. blast-plume.ts drives three overlapping central dirt puffs at staggered heights plus ground puffs, so the column rises above a 2.4 m lip within one second even from an excavated floor. Effects last five seconds per power unit. Flash/physical damage remain occluded by earth; nothing is drawn through walls. Native final direct evidence is in PLAYTEST_REVIEW.md.


## Evolving battlefield and open bank breaches — November 4, 2026

Deterministic sparse grass, bushes and trees are authored outside spawn footprints and the main central lanes. Vegetation is cloned per match. Trees, stumps and fallen logs use the same destructible health/stage records and physical cover path as existing wooden obstacles. Leaves and brush add optical path length to visibility, including artillery spotting, without blocking soldiers or projectiles. Broad-phase segment bounds avoid detailed foliage tests for unrelated plants. Crown loss opens sight lines; cleared plants stop obscuring immediately. Rifle world impacts chip timber (4 HP), while explosives damage it through the pre-blast cover-aware path. A standing tree has 180 HP, loses its crown/height below half health, then creates a 60 HP stump and, when space permits, a 90 HP axial fallen log. Logs point away from impact, avoid existing obstacles/large drops and sit on sampled terrain support; uprooting after excavation also fells trees. Pieces switch instantly, with debris and a synthesized timber cue, rather than using dynamic rigid-body falling.

Explosion profiles now separate bank penetration depth from ordinary crater depth: grenade 1.05 m, artillery 3.2 m. Side cuts require first contact with an exposed earth face/recessed lining and reject intact intervening solid cover. Repeated rounded cuts can lower the whole bank. Slope relaxation crosses an authored cliff only after its high side has collapsed to floor height; resulting surface heights interpolate across that opening to avoid residual collision lips. Intact walls retain their faces. The same sampled surface feeds render meshes, Ammo patches, rays, gravity and navigation. Fixed concrete/building foundations and the −0.9 m floor cap remain protected. These are open breaches; enclosed holes, tunnels, roofed cavities and structural building collapse remain outside this height-field prototype.

Artillery ground craters have nominal 1.3 m depth, allowing crouched soldiers to hide behind a suitable rim. Once per second the assault planner considers authored craters and the last eighty new runtime craters, filters for usable field positions/actual depth/clear footprints, and favors deeper cover near the route. Soldiers crouch while regrouping in a sufficiently deep bowl. Destruction still invalidates routes and settles unsupported soldiers. Health-only rifle chips do not rebuild geometry or reset navigation; a separate terrain revision keeps bark damage from rebuilding the terrain lookup cache.

Recorder summaries now include treesFelled, brushCleared and bankCuts; detailed changes retain object health/stage, side-cut sample counts, cuts and patch IDs. All 191 tests, strict TypeScript, build and whitespace checks pass. New coverage verifies real traveling-round tree damage, blast clearing/felling, stump/log collision, foliage sight versus projectile passage, match reset, live-crater cover selection/crouching, both-side grenade bank chips, concentrated breaches, protected screens/foundations and an actual Ammo opening matching a walkable navigation segment. Native rendered evidence is in PLAYTEST_REVIEW.md.


## Unsupported lining and tree/debris presentation polish — November 5, 2026

Artillery could shield recessed wooden lining from direct damage, then remove the earth supplying its collision. That left a freestanding-looking decorative panel soldiers could walk through. After terrain edits, lining segments now check their original earth side at three points; excavation beyond 0.25 m breaks that segment and emits the normal destruction change. Checks are restricted to the actual edited bounds (including interpolation margin); health-only rifle chips skip support scans entirely. Distant intact lining remains, and no extra freestanding collider is introduced. A both-side zero-structural-damage test isolates this support failure.

The renderer detaches a felled tree's visible primitives from static batching, removes the old standing collider immediately, and rotates its retained trunk/branches toward the actual spawned log. A 0.95 s accelerating arc and 0.3 s upward rebound end exactly at the log position/height/direction; timber without room for a log compresses toward its stump. Stumps are revealed as the trunk clears; log visuals replace the moving tree at rest while their simulation collision is authoritative immediately. At most eight transitions coexist; newer damage to their pieces safely ends an old transition. Full canopies shed leaves on landing, and landing wood/dirt fragments mask the final branch/crown breakup. This is a presentation animation, not a dynamic rigid-body tree or a crushing-damage mechanic.

environment-effects.ts gives wood splinters, clods and leaves deterministic cosmetic launch velocities, distinct dimensions/drag/gravity, angular motion, bank/floor contacts, damped bounce, a resting state and a short final fade. Pieces fall again if their terrain support disappears. They cannot damage or obstruct soldiers. At most 192 fragments exist; restart/map replacement destroys them and transient tree roots. Pausing now passes zero presentation delta so falling trees, particles and existing effects freeze with simulation. Timber audio keeps its initial crack/creak, then rises into a filtered-noise landing thud at 0.95 s, without an oscillator; cues originate at affected trees, capped at four closest per destruction event.

All 198 tests and the production build pass locally. New real-transform tests verify cardinal-direction alignment and old-collider retirement without a WebGL context; particle tests cover settling, banks, support removal, frame-rate independence and pause; caps/reset and timed audio are also exercised. The new mechanics do not alter aim, blast profiles or existing cover authority. See PLAYTEST_REVIEW.md for native evidence and performance limits.


## Faster, wider artillery salvos — November 5, 2026

The user requested two seconds less warning, more shells over a wider area, and the same impact-phase duration. artilleryRules now uses a four-second warning, eight shells, 14 m scatter radius and an explicit 120-tick first-to-last salvo duration. Each launch uses round(index × 120/7), avoiding accumulated interval drift while distributing eight impacts evenly across the original four seconds. Shell flight and cleanup grace remain one second. Danger radius derives from scatter plus the unchanged 12 m damage reach (26 m); markers, threat avoidance and boundary validation therefore expand with the salvo. Initial charge/cooldown, damage/deformation profiles and human-team call ownership remain unchanged.

The mission test checks actual swept impacts at the new schedule, wider-than-10 m but bounded-14 m planned scatter, the full danger radius and cleanup. Roof, owner death and airborne-match-end fixtures now expect eight shells. The retreat fixture checks shelter before actual mission expiry rather than a fixed ten-second delay, since the whole warning-plus-salvo ends two seconds earlier. Native evidence follows in PLAYTEST_REVIEW.md.

Validation uses one Vitest worker in CI, matching the successful local `npm run check -- --maxWorkers=1` run (198 tests, 78.18 s). A parallel local run hit wall-clock timeouts in four unchanged simulation/terrain tests; no assertions or their limits were changed. Serial workers avoid competing CPU-heavy scenario files on the same runner. Strict production build passes.
