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

Opt-in recorded playtests now provide a shared-command autonomous driver, bounded game-only video clips with diagnostic HUD, command/event/state logs, runtime errors, and frame statistics. See the README for the playtest URL. Log/driver and capture-cadence tests, native Chrome recordings, and the production build validate the integration. Strict TypeScript and all 20 tests pass. Artifacts live under ignored playtest-artifacts/.

## Soldier movement

Soldiers now use named hip, knee, ankle, shoulder, and elbow joints, with a pelvis, boots, and backpack. Actual interpolated travel drives alternating steps, knee lift, arm swing, torso sway, and sprint lean. Backward steps reverse the gait; strafing turns the hips. Motion eases back to standing when travel stops, while aiming/firing stabilizes the arms. Respawn jumps do not advance the gait, and restart recreates the rigs.

Chrome recordings verified a 30-second 5v5 autoplay run and a 40-second direct walking/sprint/backward/strafe/idle run, both near 60 render FPS and 30 encoded FPS with no recorded errors. Restart and movement after restart were also checked. Strict TypeScript, all 20 existing tests, and production build pass. This is a visual change; hit volumes and simulation rules are unchanged. See PLAYTEST_REVIEW.md for artifact names.

The left hand is parented to a rifle foregrip anchor. A two-bone support-arm pose makes the shoulder and elbow follow that anchor through gait, sprint lean, recoil, and reload tilt. An engine-transform check of 220 weapon poses kept the wrist within 0.00001 meters of the grip. A further 30-second Chrome 5v5 recording ran at 60 render FPS with no recorded errors; all 20 tests and the production build pass.

## Deliberate implementation choices

- Flat axis-aligned geometry uses conservative footprint movement with substeps and wall sliding. World raycasts use static PlayCanvas/Ammo colliders; soldier hit volumes belong to simulation.
- Test collision is a simplified map adapter, not an equivalence test of Ammo. Any future server must implement trusted collision and movement validation.
- Shared primitive geometry/materials, automatic frustum culling, modest directional shadows, short-lived effects, and a ten-soldier limit keep presentation inexpensive. Restart destroys old actor, objective, and effect entities while retaining shared map/material assets.
- The static bundle includes PlayCanvas and embedded Ammo, so Vite reports a large-chunk warning. It builds successfully and makes no runtime CDN requests.
- `?bots=0`, `?duration=30`, and `?demo=1` are local development aids. Demo avoids pointer lock for observing a short match. Normal play uses pointer lock and the full eight-minute default.
- Rules and bots currently share one engine-independent module to keep this initial project small. Split them by system as complexity grows; do not move state authority into render entities.
