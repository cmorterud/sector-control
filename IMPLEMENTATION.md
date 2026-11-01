# Implementation notes

The project implements the five local milestones: environment/controller, combat, objective match loop, bots, and placeholder presentation. Public deployment is deferred.

## Validation

- Strict TypeScript, Vitest, and Vite production build.
- Repeatable full eight-minute headless 5v5 runs assert combat, captures, valid state, and completion.
- Chrome initialization, pointer-lock start, rendered map/characters/HUD, and a short match with bot sector scoring were observed during development.
- Dependency audit reported zero vulnerabilities after updating Vitest.
- Subsequent browser inspection was denied by the browser origin approval gate; no alternative browser automation route was used.

## Remaining manual acceptance

Full human playthrough, Firefox checks, target-machine GPU profiling, long-running restart/memory profiling, and subjective weapon/bot tuning remain unverified. Do not treat headless simulation throughput as GPU performance evidence.

Opt-in recorded playtests now provide a shared-command autonomous driver, bounded game-only video clips with diagnostic HUD, command/event/state logs, runtime errors, and frame statistics. See the README for the playtest URL. Log/driver tests and the production build validate the integration; native MediaRecorder output has not yet been verified in a live browser. Browser access must be granted before automated recording review can run end to end.

## Deliberate implementation choices

- Flat axis-aligned geometry uses conservative footprint movement with substeps and wall sliding. World raycasts use static PlayCanvas/Ammo colliders; soldier hit volumes belong to simulation.
- Test collision is a simplified map adapter, not an equivalence test of Ammo. Any future server must implement trusted collision and movement validation.
- Shared primitive geometry/materials, automatic frustum culling, modest directional shadows, short-lived effects, and a ten-soldier limit keep presentation inexpensive. Restart destroys old actor, objective, and effect entities while retaining shared map/material assets.
- The static bundle includes PlayCanvas and embedded Ammo, so Vite reports a large-chunk warning. It builds successfully and makes no runtime CDN requests.
- `?bots=0`, `?duration=30`, and `?demo=1` are local development aids. Demo avoids pointer lock for observing a short match. Normal play uses pointer lock and the full eight-minute default.
- Rules and bots currently share one engine-independent module to keep this initial project small. Split them by system as complexity grows; do not move state authority into render entities.
