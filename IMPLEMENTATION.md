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

Trench depth is 2.4 m and firing steps are 1.05 m. Space validates a nearby stable terrain landing and sweeps feet, torso, and head through a one-second lift/cross/settle motion. Commands, serialized mantle state, start/end events, climbing poses, firing/capture suppression, cooldown, and death/respawn cleanup stay in the normal simulation flow. Bots use the same action near useful front-line ledges. This is contextual mantling, without a general jump/gravity controller.

For 25v25, respawns use a 5 × 5 assembly grid. AI planning phases are staggered, objective switching has hysteresis, target queries reuse visibility and bound acquisition rays, and projectile sweeps query nearby soldier buckets. Queries recheck health so simultaneous arriving rounds cannot count the same death twice. Static and dynamic batch groups reduce draw calls while preserving joint animation and the rifle support-hand attachment. Restart recreates actor batches and clears effects/projectiles.

Validation includes 43 tests, strict TypeScript, production build, all-spawn reachability, a full 60-second headless 50-soldier match, mantle lifecycle/collision regressions, and real Ammo checks of bank occlusion, firing-step sight lines, ramp surface height, and a completed mantle. Native Chrome evidence and limits are recorded in PLAYTEST_REVIEW.md. Short native runs are not full eight-minute or controlled 1080p acceptance, and faction balance still needs tuning.


## Trench lining junction correction

Decorative timber panels previously extended across communication routes even though the shared movement terrain correctly left them open. Lining is now clipped to genuine earth boundaries after the final height field and ramps are defined; posts stay inside each resulting panel. This corrects the visual obstruction instead of adding an invisible obstacle to a required route. A regression covers all six junctions and confirms a lined earth bank still stops walking. Strict TypeScript, 44 tests, build, and recorded direct Chrome traversal pass.
