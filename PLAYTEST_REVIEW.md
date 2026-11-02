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
