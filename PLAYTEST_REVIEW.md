# Chrome playtest review — November 1, 2026

Direct Chrome gameplay control and native video export are now verified. Work stayed local. Recordings, JSON, extracted frames, and machine-readable measurements are in ignored `playtest-artifacts/`.

## Evidence

Artifacts use the prefix `sector-control-2026-11-01T` and the timestamp suffix below. Each has a `.webm` and `.json` pair.

| Timestamp (UTC) | Run | Simulation / video seconds | Render FPS | Encoded FPS | Errors |
| --- | --- | --- | --- | --- | --- |
| 21-45-55-088Z | Direct input, no bots; includes paused control setup | 33.67 / 59.98 | 60.02 | 22.47 | 0 |
| 21-48-56-124Z | Direct one-minute 5v5 match | 60 / 60.02 | 59.97 | 22.66 | 0 |
| 21-50-16-369Z | First two minutes of full rendered autoplay match | 119.97 / 119.97 | 60.00 | 22.76 | 0 |
| 21-59-37-988Z | Direct input after capture cadence fix, no bots | 30 / 30.00 | 60.01 | 29.93 | 0 |

Encoded FPS is measured from actual packet timestamps and frame counts with FFprobe, independently of the render-loop FPS shown in the game. These recordings use the normal Chrome viewport on this machine, not a controlled 1080p performance benchmark. Video is VP8 at 1280×720, silent, and includes the diagnostic HUD. Full decoding of the one-minute combat and post-fix videos succeeded with no errors. Extracted contact sheets were visually reviewed; they contain the game scene and HUD rather than a blank WebGL surface.

The direct 5v5 match finished Blue 0 / Red 12. Diagnostics contain 1,800 commands, 26 total kills, two captures, and one player death followed by respawn. The player did not score a kill or capture; this run primarily established movement and aiming input. The earlier calibration clip verifies held aim, automatic fire, reload, and sprint.

The post-fix clip verifies 75 sprint ticks, 30 aim ticks, 34 fire ticks, one reload command, movement, and changing yaw/pitch. It contains 900 simulation ticks and 899 encoded video frames. Its render p95 is 17.3 ms, with no frames over 33.33 ms and no recorded errors.

## Full match and restart

The actual eight-minute rendered autoplay match completed Blue 89 / Red 97. The bot-driven player finished with 35 kills, 20 deaths, and four captures. Both factions scored and captured sectors. The final scoreboard totaled 245 kills and 16 captures. Chrome reported no warning/error console entries at completion.

Deploy again reset scores to 0/0, timer to 08:00, sectors to neutral, HP to 100, and ammunition to 30/120. The full scoreboard and restart observations are preserved in `playtest-artifacts/full-match-results.txt`.

Only the first 120 wall seconds of this match were recorded. The recorder stops logging with its bounded clip; its zero-error summary does not cover the final six minutes. The full-match results are UI observations. Autoplay supplements the separate direct-input runs and does not establish a full manual eight-minute acceptance pass.

## Recorder correction

The previous capture gate set its last timestamp to the current render timestamp after every copy. Small timing differences around a 60 Hz render loop repeatedly stretched a nominal 33.33 ms capture interval to 50 ms. Three native recordings averaged about 23 encoded FPS.

`CaptureCadence` advances a fixed deadline and resets after long stalls. Regression coverage checks jittery 30/60/120/144 Hz rendering and recovery without a catch-up burst. The new direct-input recording averages 29.93 encoded FPS. `npm run check` passes strict TypeScript and all 20 tests; `npm run build` succeeds with the existing large engine-bundle warning.

## Working control procedure

1. Use exactly `http://localhost:5173`; the browsing exception works in this session. If needed, start `npm run dev` from this project. The previous server disappeared once and was restarted.
2. Inspect through the Chrome tab API. For gameplay, select the correct native Chrome window and its Sector Control tab, then click Begin/Resume with `cua.getApp("com.google.Chrome")`. Wait for the pointer-lock/menu transition before sending held keys; keys sent before acquisition can be ignored.
3. Timed native `pressKey("w", { durationMs: ... })` works. Held sprint was verified with `tab.pressKey(null, "shift+w", { durationMs: ... })`; the native modifier chord did not reliably set sprint in the JSON, so check recorded commands.
4. `tab.drag(from, to)` delivers relative yaw/pitch under pointer lock and also holds the left mouse button, firing the weapon. Use the current visible cursor position as the starting point and continue from the last endpoint. Moving to a distant start can also alter aim. Pure mouse movement without a button is not exposed by the documented API.
5. Native Chrome coordinate clicks with `durationMs` verify sustained LMB fire and RMB aim. Use a fresh native screenshot for coordinates: its Retina pixel coordinates differ from the tab's CSS coordinates. Some tab-level clicks caused capture loss or denial; native Begin/Resume clicks successfully reacquired it. Focus loss pauses normal play as designed.
6. Click the game's Save links with the normal locator click API. The files arrive in `~/Downloads`, then can be archived locally. `downloadMedia()` does not support these blob URLs. The download-event wait hung even though a file saved; ordinary link clicks worked. Keep browser download permissions separate from browsing permissions.

## Remaining acceptance

Full manual eight-minute gameplay, reliable simultaneous aim/fire/mouse turning, comprehensive cover and obstacle checks, Firefox, subjective weapon/bot tuning, controlled 1080p GPU benchmarking, and repeated-match memory profiling remain unverified. No claim of general performance acceptance is made from the short recording statistics.

## Basic soldier movement update

The block soldiers now have articulated hips, knees, ankles, shoulders, and elbows, plus boots and a pelvis. Movement produces alternating steps and knee lift, arm swing, torso sway, and a stronger sprint lean. The gait follows actual interpolated travel rather than requested velocity, and settles to standing when movement stops. Backward travel reverses the cycle, strafing turns the hips, and aiming/firing reduces arm swing. The camera stays independent of body bob.

Two new recording pairs are archived in `playtest-artifacts/`:

| Timestamp (UTC), same filename prefix as above | Verification | Render FPS / p95 | Encoded FPS | Errors |
| --- | --- | --- | --- | --- |
| 22-08-45-712Z | 30-second 5v5 autoplay; 14 kills and one capture | 60.00 / 16.8 ms | 30.00 | 0 |
| 22-09-59-557Z | 40-second direct walk, sprint, backward, strafe, and standing test | 60.01 / 17.4 ms | 29.97 | 0 |

The direct run includes 69 sprint ticks and all four movement directions. Close-up consecutive video frames show changing knee/hip angles and body sway; the character returns to a standing pose through the idle portions. `walking-joints-review.jpg` preserves the frame comparison and `soldier-sprint-preview.gif` is an animated close-up. The direct video decoded without errors. Restart recreated the model, and subsequent held W movement worked. No Chrome warning/error console entries were observed. Strict TypeScript, all 20 existing tests, and the production build pass; the known engine-bundle size warning remains.

This adds basic procedural animation and fuller block anatomy. It does not change hit volumes, movement speed, or other simulation rules.

## Rifle support-hand fix

The left hand is attached directly to the rifle foregrip. A two-bone shoulder/elbow pose follows it, including walking/sprint motion, recoil, and reload tilt. An ad hoc check executed the actual renderer method with PlayCanvas transforms across 220 poses; maximum wrist/grip separation was 1.35e-7 meters.

Chrome recording `sector-control-2026-11-01T22-18-48-649Z` covers 30 seconds of 5v5 autoplay at 60 render FPS (16.8 ms p95), 14 kills, one capture, and no recorded errors or console warnings/errors. The video decoded successfully. The video/JSON, rifle-grip-review.jpg, and rifle-grip-metrics.json are archived under ignored playtest-artifacts/. Strict TypeScript, all 20 existing tests, and the production build pass.

## Traveling projectiles and readable event logs

The rifle now shoots actual 32 m/s rounds with a 60-meter maximum travel distance. Damage and hit feedback occur at impact. Sweeps check the whole traveled segment against cover and living soldiers. Allies/protected enemies stop rounds without damage, close muzzle obstructions cannot be bypassed, and in-flight rounds can outlive the shooter. Bot aiming leads moving targets. Bright cyan/orange tracers show their flight.

Event logs uncovered a pre-existing missing Ammo world: baseline files `...22-30-17-055Z` and `...22-32-12-941Z` recorded no world impacts. The standalone app now injects an explicitly initialized Ammo backend. A real-engine regression tests thin-wall hits, height clearance, and projectile collisions without stepping physics.

| Verified artifact timestamp (UTC) | Run | Results |
| --- | --- | --- |
| 22-39-34-973Z | 20-second direct firing, video/JSON | 26 shots and 26 world impacts; 0.967 s launch-to-impact delay; 60.02 render FPS, 17.6 ms p95, zero errors, zero final active rounds |
| 22-41-31-229Z | 40-second 5v5, log-only JSON/events.txt | 436 shots; 320 impacts, including 203 world impacts and 71 damaging impacts; 14 kills, two captures; 60.00 render FPS, 17.2 ms p95; zero errors, zero final active rounds |

The log-only match finished 4/4 and restarted with fresh scores, health, and ammunition. There was no video download link, and no screenshots were used to inspect this run. `video=0` skips canvas capture and the encoder. `projectile-wall-events.txt` is a short readable direct-fire timeline; the log-only run's `.events.txt` contains the full typed event list. `projectile-review-metrics.json` records the measurements and distinguishes the pre-fix diagnostic runs. The direct video decoded successfully; projectile-flight-preview.gif is an optional short view of the flight.

For example, direct round 1 launched at tick 123 (4.100 s) and hit the building at tick 152 (5.067 s), at z≈8.500 m, with zero damage to soldiers. The event IDs, projectile IDs, and timestamps make this check possible without images. The JSON also contains commands and per-second snapshots with projectile positions, velocities, and remaining range. JSON schema is version 2.

Strict TypeScript, all 32 tests, and production build pass. Coverage includes delayed hits, moving targets entering/leaving a path, swept thin geometry, muzzle overlap, friendly obstruction, arrival-time protection, posthumous hits, range expiry, snapshot isolation, match cleanup, bot lead, driver camera alignment, and actual Ammo wall collision. General Firefox, full manual eight-minute acceptance, and controlled GPU/memory profiling remain outstanding.


## Trench prototype and deeper-cover/mantle update — November 1 local / November 2 UTC

Selectable Trench front runs 25 soldiers per side. The first shallow-trench 60-second native log (`sector-control-2026-11-02T03-32-40-485Z`) recorded 4,185 shots, 118 kills, three captures, 59.38 FPS average / 17.3 ms p95, and zero errors. This is an intermediate map checkpoint, before deeper cover and mantling. It exposed muzzle-blocked target acquisition, corrected to test the rifle firing height.

After the user's feedback, banks became 2.4 m high above the floor and firing steps 1.05 m. Direct Chrome keyboard/Space input in `?map=trenches&bots=0&demo=1&playtest=1&duration=30` is recorded in `sector-control-2026-11-02T03-44-48-132Z` (WebM, JSON, events.txt). The log contains five started and completed climbs, including 0 → 2.4 m and 2.4 → 0 m. Two transitions were explicitly driven and observed with the supported held-key API; the full log retains all input. It completed 900 ticks at 59.97 render FPS / 17.4 ms p95 with zero errors. Video fully decoded. `mantle-climb-review.jpg` and `mantle-review-metrics.json` preserve the visual/event review. `demo=1` avoids pointer lock for this focused input test; normal pointer-lock acceptance remains separate. A preceding 25v25 video (`...03-42-44-608Z`) covers only 683 ticks before a pause and is partial evidence, not a complete match.

The deeper-map 60-second log-only 25v25 match (`sector-control-2026-11-02T03-45-48-170Z`) completed all 1,800 ticks with 2,430 shots, 1,322 impacts, 124 deaths, one capture, Blue 0 / Red 8, 59.90 FPS average / 17.3 ms p95, three frames over 33.33 ms, and zero errors. It ended with no projectiles and restart reset the timer, roster, and scores. Bots logged mantle attempts/completions; deaths can interrupt climbs. This checkpoint preceded the final foot-clearance and simultaneous-arrival health recheck; the final suite adds regressions for both.

Current automated validation: 43 tests plus strict TypeScript/build, including real Ammo bank shielding, clear firing-step rays, ramp height, and completed mantle; all 50 spawns reach all sectors; full 60-second headless 25v25 combat/capture/state checks pass. Recordings/logs are local under ignored playtest-artifacts/. Short autoplay results favor Red and do not establish faction balance, full manual eight-minute acceptance, controlled 1080p/GPU performance, Firefox, or sustained memory stability.


The **final-code** 60-second native log (`sector-control-2026-11-02T03-50-54-880Z`, JSON/events.txt; metrics in trench-final-metrics.json) completed all 1,800 ticks with 50 soldiers, 2,416 shots, 1,286 impacts including 441 world impacts, **117 distinct deaths**, one capture, and Blue 0 / Red 8. It logged 100 mantle starts / 85 completions, with other climbs interrupted by combat. Average render FPS **59.77**, p95 **16.9 ms**, one frame over 33.33 ms, **zero errors**. This includes the final foot-clearance sweep and health recheck. The normal eight-minute trench start screen was then left ready in Chrome. All 43 tests and the final production build pass; the existing engine/Ammo bundle-size warning remains.


## Pass-through wooden panel — November 2, 2026

Reproduced the user's spawn-route report with direct held movement in `?map=trenches&bots=0&demo=1&playtest=1&duration=20`. Intermediate artifact `sector-control-2026-11-02T14-20-14-245Z` shows a tall timber panel spanning the open center communication route; continuing forward passes through it. It was a decorative lining placement error, not intentional cover behavior.

Fixed panels now follow actual terrain bank boundaries and leave all six communication junctions open. Post placement respects the trimmed panel lengths. The final direct recording `sector-control-2026-11-02T14-34-14-654Z` repeats the approach and traversal: 600 ticks, 60.00 render FPS average, 17.5 ms p95, zero recorded errors. JSON/video and trench-lining-review-metrics.json are archived under ignored playtest-artifacts/. The view is visibly open before crossing. All 44 tests, strict TypeScript, and the production build pass; existing engine/Ammo chunk-size warning remains.


## Hop fallback and mantle animation — November 2, 2026

Direct Chrome held-key recording `sector-control-2026-11-02T17-04-11-010Z` (`map=trenches&bots=0&demo=1&playtest=1&duration=30`) verifies a Space hop in open space (tick 6 takeoff / tick 20 landing), climb up (ticks 133–169), and climb down (ticks 220–256). All 900 ticks completed with 59.87 average render FPS, 17 ms p95, one frame over 33.33 ms, and zero errors. JSON/video/events.txt are archived; video fully decoded. mantle-phases-review.jpg shows the approach/reach/pull/crouched-cross/stand sequence, mantle-natural-preview.gif is a short user-facing preview, and hop-mantle-metrics.json preserves events and frame metrics.

Automated validation now includes 49 tests and strict TypeScript/build: ballistic hop height/landing, retained movement, anti-air-jump, bank collision, ceilings, mantle priority, ramp fallback, lifecycle reset, real Ammo mantle clearance, and a real transform rig test for bracing wrist / rifle support wrist / feet above the bank. This remains short native acceptance rather than a new full manual eight-minute match or controlled GPU/memory profile.


Final 60-second log-only 25v25 artifact `sector-control-2026-11-02T17-13-44-526Z` completed 1,800 ticks: 2,533 shots, 1,344 impacts, 121 deaths, one capture, Blue 4 / Red 0. It logged 39 mantle starts / 36 completions (others interrupted by combat) and 12 hop starts / 12 landings. Average FPS 59.79, p95 16.8 ms, one frame above 33.33 ms, zero errors. Restart reset the timer, roster, and scores. JSON/events.txt and hop-mantle-25v25-metrics.json are archived. This supersedes the earlier short-run faction result as the latest observation, without establishing balance.


## Four trench lines, rear-ground spawns, exposed center — November 2, 2026

The battlefield now has four zigzag lines, two per faction, with open-ground spawns at x = ±67 m immediately behind each rear line. Broad rear entry ramps accommodate all 25 spawn slots, three communication routes lead to the front line, and the middle is exposed no man's land. Central cover is only two 0.65 m sandbag remnants and two small wire patches near the ends (under 15 m² total footprint, no cover within 10 m of objectives). Bunkers stay behind the rear lines. Depth, firing steps, hops, and mantles remain intact.

Overhead video/JSON/events artifact `sector-control-2026-11-02T17-35-26-211Z` (`map=trenches&overview=1&autoplay=1&playtest=1&duration=60&clip=120`) confirms all four lines and both 25-soldier spawn groups. All 1,800 ticks completed: 3,060 shots, 1,687 impacts, 130 deaths, one capture, Blue 0 / Red 2. Average render FPS 59.32, p95 16.8 ms, two frames above 33.33 ms, zero errors. `four-trench-overview.jpg` is an early rendered layout frame. This overview intentionally renders the entire map with an orthographic camera and no fog; it is an optional development observer, not the normal gameplay camera.

Direct shoulder-camera recording `sector-control-2026-11-02T17-40-53-732Z` (`map=trenches&bots=0&demo=1&playtest=1&duration=25`) uses held Shift+W for 8.5 seconds from spawn. It descends into the rear line, passes the front line, exits into no man's land, and captures B. All 750 ticks completed, Blue 2 / Red 0, one player capture, 59.92 render FPS, 17.6 ms p95, zero errors. Restart reset the map state. It tests direct input without pointer capture; normal pointer-lock behavior is unchanged. Metrics and sampled route positions are in four-trench-review-metrics.json. Artifacts remain ignored/local.

Validation: strict TypeScript, all 50 tests, production build (known engine/Ammo bundle warning), four-band geometry, sparse cover, every spawn's height/side/straight entry, all 50 spawn-to-objective paths, six clear communication corridors, full headless 25v25 combat/capture, and existing Ammo/animation/hop/mantle regressions. These short runs do not establish full eight-minute manual acceptance, faction balance, or controlled GPU/memory performance.


## Closed parapets and head-exposure firing steps — November 2, 2026

User supplied trench cross-section/system reference images and clarified that teams should fire from their own trenches rather than use direct ramps into the center. Front exit ramps are removed; rear access and internal communication routes remain. Front steps are 0.85 m high under a 2.4 m parapet. Actual rig bounds keep the torso/vest/backpack/pelvis below earth while the helmet and raised barrel clear it. Bot LOS and aim use head height, and real Ammo + projectile tests verify that covered torsos/floor occupants are blocked while exposed heads can be hit.

Bots now occupy 25 individual firing stations on their own front line and do not automatically mantle/assault. Trench mode uses one point per enemy elimination, with capture rings/objectives disabled; industrial capture mode remains unchanged. The optional scoring preference question had not received a reply before implementation, so elimination scoring was the stated default for stationary trench combat. Manual mantling/hops remain available. Navigation ramp anchors fix an actual mirrored-step reachability failure caught by the all-station path test.

Native 60-second artifact `sector-control-2026-11-02T18-03-47-421Z`: all 1,800 ticks, 3,219 shots, 1,440 impacts, 116 deaths, Blue 59 / Red 57, 59.54 render FPS / 17.8 ms p95, two frames above 33.33 ms, zero errors, zero automatic mantles, and no sampled actor entering |x| < 18 m. It verifies sustained trench-to-trench combat rather than capture/center assaults.

Direct artifact `sector-control-2026-11-02T18-31-20-874Z` (`bots=0&demo=1&playtest=1&duration=25`) records held forward movement stopping on the front firing step against the closed bank. Backing away returns to the trench floor. All 750 ticks completed at 59.92 FPS / 18.2 ms p95, zero errors. The normal third-person view was inspected on the step and below it; restart succeeded.

Final presentation artifact `sector-control-2026-11-02T18-35-01-012Z` includes the trench-duel recorder caption and exposed/below-parapet HUD cues. Summary: 900 ticks, 59.47 render FPS, 17.1 ms p95, 50 deaths, Blue 26 / Red 24, zero errors. Video fully decoded; parapet-firestep-review.jpg is a firing-step view. JSON/events/video and parapet-review-metrics.json are local under ignored playtest-artifacts/.

Final verification: **55 tests**, strict TypeScript, production build with the known engine/Ammo size warning. Includes a full eight-minute **headless** duel with firing and deaths in its final minute, elimination-score accounting, all 50 firing-station routes, no automatic no-man's-land entry, complete front parapets, true Ammo cover rays, actual rig/IK bounds, and projectile hits against exposed/covered targets. These tests do not establish a new full manual eight-minute match, Firefox, or controlled GPU/memory acceptance.

Follow-up: removed the persistent exposed/below-parapet HUD line at the user's request. Direct Chrome movement from spawn to the firing step and back to the floor confirmed the exposure text is absent; the contextual mantle prompt still appears at the ledge. TypeScript and production build pass. Gameplay rules are unchanged.

## Player-thrown grenades — November 2, 2026

G throws one grenade per key press, with three per spawn. The aimed, lofted arc uses gravity and shell sweeps against terrain/cover, then a three-second fuse produces a flash, expanding blast-radius effect, rising/fading smoke and sound. Seven-meter blast damage falls off with distance and checks cover. Allies/protected spawns are safe; self damage is possible without awarding a kill/score. Inventory is visible beside rifle ammo. Bots carry grenades but do not yet throw them automatically; smoke is cosmetic.

Initial direct 30-second artifact `sector-control-2026-11-02T19-16-39-154Z` verified three keyboard throws, inventory reaching zero, three explosions exactly 90 ticks after release, visible flight/smoke and no recorded errors: 900 ticks, 59.30 FPS, 17.1 ms p95. It predates the final terrain/release refinements. Intermediate full-roster artifact `sector-control-2026-11-02T19-19-51-637Z` exposed a close-timber release overlap, so it is diagnostic rather than collision acceptance evidence. The grenade could become stuck and cause self damage; release now checks shell clearance in both ray directions. Separate real Ammo regression also caught tiny terrain-sweep penetration, fixed with an authoritative map sweep alongside native collision.

Final full-roster recording `sector-control-2026-11-02T19-22-51-595Z` used direct keyboard movement/throws with 25 soldiers per team: 1,050 ticks, 59.20 FPS, 17.5 ms p95, three frames over 33 ms, zero errors, 1,785 rifle shots, 763 impacts, 54 deaths, Blue 31 / Red 23. Two grenades were thrown and both exploded exactly 90 ticks later. The close-wall grenade bounced back and continued moving instead of remaining embedded; the second crossed the center and bounced in the opposing trench. These explosions had no damage hits in this native run; thrown-grenade damage to a sheltered opposing trench occupant is covered by both simulation and real Ammo regressions. A later attempted throw was blocked while dead. Restart through Deploy again restored HP/ammo/three grenades and reset the match. Video fully decoded; `grenade-flight-preview.gif` and `grenade-smoke-review.jpg` show flight and the rising smoke. Video, JSON, events and `grenade-review-metrics.json` are under ignored playtest-artifacts/.

Final validation: **65 tests**, strict TypeScript, production build (existing bundle-size warning only), diff whitespace check. New coverage includes per-spawn inventory/cooldown, aimed arc/fuse, finite supply, dead/mantling actions, thin-panel bounces, release clearance, real Ammo floor/bank collision, real Ammo grenade damage across trenches, falloff/cover, friendly/protected/self damage, single-death scoring, live grenades after owner death, snapshot isolation, event logs and match-end cleanup. This is not a new full manual eight-minute or controlled GPU acceptance run.

## Approved bot accuracy reduction — November 2, 2026

User approved smoothly drifting bot aim with bloom: roughly 0.8 m maximum fresh-shot spread at 40 m, growing to 1.4 m in sustained fire, then recovering during pauses. Trench base error is now 0.02 rad (previously 0.01); actual shots add 0.25 bloom up to 1, scaling error by up to 1.75. Non-firing ticks recover 1/18, so full recovery takes 0.6 seconds. Independent yaw/pitch offsets interpolate smoothly over one-second intervals. Industrial retains its existing 0.035 rad base and uses the bloom/drift behavior. Human rifle trajectories and fire cadence remain unchanged. Custom zero aim error still works.

A repeatable one-minute headless 25v25 comparison at seed 12345 measured before: 3,491 shots, 454 damaging impacts (13.00%), 111 deaths; after: 5,111 shots, 320 damaging impacts (6.26%), 77 deaths. These are match-level metrics, affected by changed survival/respawn time rather than a universal per-shot probability. The temporary baseline copy/measurement runner was removed after recording `bot-bloom-comparison.json`. A permanent controlled exposed-head duel separately verifies fewer actual hits at equal firing cadence, while still producing hits.

Native Chrome log-only artifact `sector-control-2026-11-02T20-28-40-573Z`: 1,800 ticks, 4,637 shots, 392 damaging impacts (8.45%), 93 deaths, Blue 48 / Red 45, 59.83 render FPS, 18.4 ms p95, one frame over 33 ms, zero errors. Snapshots recorded bloom from 0 to 1. JSON/events and `bot-bloom-native-metrics.json` are under ignored playtest-artifacts/. The first attempt was restarted after a development reload; this artifact is the uninterrupted final-code run. No video was captured for this simulation check.

Final checks: **69 tests**, strict TypeScript, production build with the known bundle warning, and whitespace checks. New tests cover real burst buildup/recovery/respawn, angular bounds/smoothness, reduced exposed-head hit rate, unchanged cadence and human trajectories. The lead-target regression now sets aim error to zero to isolate projectile interception from the intentional drift. The eight-minute headless duel still fires and kills in its final minute. This does not establish a new full manual match or controlled GPU acceptance result; difficulty still merits player feedback.

## Grenade terrain and cover destruction — November 2, 2026 (local)

Implemented the approved prototype: shared explosion profiles, persistent quarter-meter terrain excavation, cumulative bowls/crest damage, staged wood/sandbag destruction, actual local terrain mesh/collider replacement, bot route invalidation, isolated match state and reset. Buildings/bunkers remain solid; cosmetic fragments complement the existing explosion smoke. Thirteen new destruction regressions plus a timber separation regression bring the suite from 69 to **83 tests**. Coverage includes a thrown grenade, cumulative depth/slope limits, a walkable breach after concentrated repeated hits, cover shielding/foundation protection, staged sandbag height, destroyed-cover movement/LOS and same-blast protection, route cache invalidation, unrelated mantles, future larger profiles and actual Ammo rays on changed floors/parapets.

Initial 30-second direct artifact `sector-control-2026-11-03T02-39-51-419Z`: one crater, 72 edited samples, damaged lining, 59.90 FPS / 17.5 ms p95, zero errors. The 60-second close inspection `...T02-43-36-053Z` verified movement around the changed firing-step/ramp and persistent damage, 59.97 FPS / 17.5 ms p95, zero errors. Deploy again restored scores, full inventory and the authored geometry without runtime errors. These precede the final visual/mesh refinements.

Initial full-roster artifact `...T02-46-44-324Z` measured 59.65 FPS but included 50–83 ms frames around terrain changes (and a 216.7 ms startup frame). Terrain generation was then changed to refine only the affected two-meter cells within each eight-meter patch, and distant ground queries skip excavation lookup outside changed patches.

Optimized 25v25 recording `sector-control-2026-11-03T02-53-13-710Z`: 1,796 logged ticks before the 60-wall-second recording limit; the game subsequently completed at Blue 42 / Red 32. Three grenade explosions produced three craters, including overlapping edits in the opposing trench. 5,036 rifle shots, 2,690 impacts, 74 deaths, 59.80 FPS, 16.8 ms p95, zero errors. Its only frame above 33.33 ms was 200 ms at startup; none coincided with explosions. This is a short recorded test, not a general frame-time guarantee.

User reported flickering walls during review. The timber face overlapped the earth surface at the same depth; panel/post top surfaces also overlapped. Lining now moves 4 cm toward the trench, and posts extend 6 cm above panels. The final normal-pointer-lock direct recording `sector-control-2026-11-03T03-00-56-503Z` verifies moving camera/approach views with clean timber, a crater (72 terrain edits), and three completely destroyed timber sections revealing the retained earth: 750 ticks, 1,501 frames, 60.03 FPS / 16.9 ms p95, zero frames over 33 ms, zero errors. Native Chrome Begin clicks reacquired pointer lock after the background tab-level click was denied; no permission settings were changed. Video fully decoded. `destruction-prototype-review.jpg` is a post-fix view. JSON/events/video and `destruction-review-metrics.json` live under ignored playtest-artifacts/.

Final verification: **83 tests**, strict TypeScript, production build (known engine/Ammo size warning), whitespace checks. The full eight-minute headless duel still has late combat. Remaining limits include no tunnels/overhangs/building collapse, cosmetic debris, fixed explosion profiles without artillery controls, and no new full manual eight-minute, Firefox, or controlled repeated-match GPU/memory acceptance pass.

## Larger rounded grenade excavation — November 2, 2026 (local)

User requested larger, rounded chunks out of the ground. Grenade crater radius rises from 1.2 to 1.75 m (3.5 m diameter) and nominal depth from 0.36 to 0.55 m. A rounded radial bowl replaces the pointed falloff, giving a broad middle and smooth center/rim. Existing damage radii, cover/foundation protection, cumulative limits and walkability constraints remain.

Native artifact `sector-control-2026-11-03T03-06-11-297Z`: 600 ticks, 60.05 FPS, 17.6 ms p95, zero errors, one grenade/crater and three destroyed timber sections. Video fully decoded; rounded-crater-review.jpg shows the enlarged bowl. JSON/events/video and rounded-crater-metrics.json are in ignored playtest-artifacts/. Strict TypeScript, all **84 tests**, build and whitespace checks pass. The new shape regression covers center curvature, broad middle, symmetry, footprint and walking through the bowl; existing actual Ammo collision tests still pass.

## Pre-cratered starting battlefield — November 2, 2026 (local)

User approved a lightly cratered starting map, with later explosions adding further deformation. The trench map now starts with six actual circular bowls and five broad, shallow elliptical depressions. Main bowls are 0.55–0.7 m deep and 3–4 m in radius, gentle depressions 0.12–0.18 m deep, combined relief at most 0.85 m. The field never rises above its previous elevation. Relief stays away from the front parapets and protects existing cover footing; spawns, trenches, ramps and firing steps keep their prior heights. Two scar centers move away from wire. Flat scar disks were removed, and their rim rubble follows the new ground.

Authored terrain and grenade changes share the quarter-meter surface/mesh interpolation but remain separate layers. Grenades deepen the starting bowls; reset restores the authored surface. Initial per-sample dictionary lookups slowed the full headless test beyond its 15-second limit; a compact numeric grid restored the entire suite to roughly ten seconds without increasing the timeout. Mesh refinement also uses local authored samples rather than scanning all relief keys per patch.

Final native 25v25 overview artifact `sector-control-2026-11-03T03-17-01-399Z`: 1200 ticks, 3557 shots, 49 deaths, Blue 29 / Red 20, 59.40 render FPS / 16.8 ms p95, 3 frames over 33 ms, zero errors. This run observes bot combat from above and uses no grenades; authored terrain is present at match start. Video fully decoded. JSON/events/video, starting-terrain-metrics.json and starting-terrain-review.jpg are in ignored playtest-artifacts/.

Validation: strict TypeScript, **88 tests**, production build (known bundle warning), and whitespace checks. New coverage verifies the six walkable bowls, downward-only/protected terrain, preserved pre-existing firing lanes, actual Ammo ground hits and grenade deepening/reset. Existing all-50-station paths and full eight-minute headless combat still pass. No new full manual match, Firefox or controlled GPU/memory acceptance is claimed.

## Artillery prototype — November 2, 2026 (local)

Q ground targeting, LMB confirmation, simulation validation, shared charges, warned five-shell missions, larger HE destruction, visible shells, whistle/impact audio, warning rings and bot evasion are implemented. Blue reserves the charge for the human; Red coordinates its own calls. See README for controls, timing, damage and limits. Bots retain the trench duel: no automatic assaults.

Initial 25v25 overview recording `sector-control-2026-11-03T03-38-25-424Z`: 1,800 ticks, two calls, ten impacts/craters, 26 retreat events, eleven destroyed cover sections, 59.87 FPS / 17.1 ms p95, four frames over 33 ms, zero game errors. A separate retreat regression then found a corner snag: a sampled diagonal could graze a firing-step edge that axis-wise movement could not follow. Retreat now checks the next segment before skipping a waypoint, slows near waypoints, and backs onto the floor after stalled motion. The regression follows actual collision movement to the safe destination, then verifies return to the firing post.

Direct-keyboard/mouse artifact `sector-control-2026-11-03T03-42-54-432Z`: 1,950 ticks, one call at tick 1494, five launches/impacts, five craters, two destroyed timber sections, 59.97 FPS / 17.0 ms p95, two frames over 33 ms, zero errors. Held Shift+W traversed rear ramp/communication trench to the front step, S stepped down and W returned. Early call showed reloading; a ready call below the parapet was rejected without consuming the charge; Q+LMB on the step confirmed and set the shared cooldown. Q release cancelled preview. Rifle ammo stayed 30 and zero fire events occurred during targeting clicks. This uses the existing `demo=1` keyboard/mouse path without pointer lock and `bots=0` to isolate controls; it does not replace a full manual combat acceptance run.

Final 25v25 overview artifact `sector-control-2026-11-03T03-44-41-968Z`: 1,800 ticks, Blue 37 / Red 28, 4,980 shots, 65 deaths, two calls (Blue player driver and Red bot), ten impacts/craters, 27 retreat events, eleven destroyed cover sections, 59.87 FPS / 16.8 ms p95, five frames over 33 ms, zero errors. First impacts arrived at tick 1081, six seconds after tick-901 calls; subsequent shells arrived a second apart, with the last Red shell delayed one tick as terrain changed. Both missions ended and active shells cleared. Bots avoided soldier blast damage in this run; controlled tests verify enemy/self damage and friendly protection. Videos decoded successfully; ffmpeg's null-output validation reported duplicate DTS timestamps on several frames, retained as a recorder limitation rather than a simulation error.

JSON/events/video, artillery-review-metrics.json, artillery-warning-review.jpg and artillery-prototype-review.jpg are in ignored playtest-artifacts/. Final validation: **97 tests**, strict TypeScript, production build (existing engine bundle warning), whitespace checks. The eight-minute headless duel still includes late shots and deaths without increasing its timeout. The terrain lookup cache keeps repeated cuts numeric while sparse edits remain authoritative and serializable. Restart resets charges, missions, shells, terrain and preview. Remaining work: balance and audiovisual polish, full manual eight-minute/Firefox/controlled GPU-memory acceptance, real suppression/visibility smoke, additional shell types and structural building collapse.
