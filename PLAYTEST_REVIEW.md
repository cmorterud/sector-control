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
