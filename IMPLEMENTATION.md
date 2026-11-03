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

Rendering interpolates/spins the shell, briefly animates the throwing arm, and creates a fading flash, expanding radius disc and nine rising smoke puffs. Per-explosion materials/entities are destroyed after four seconds and on restart. Smoke is cosmetic. Bots receive inventory but do not auto-throw in this first player-controlled version.

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
