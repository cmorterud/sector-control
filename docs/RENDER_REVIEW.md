# Rendered review

The build/test/publish workflow renders its built archive in headless Chrome on GitHub’s Ubuntu runners. Seven matrix jobs cover Industrial, Trenches, Verdun, Village, Lighthouse, Training grounds and Fort Vaux. They can start while game tests run. Production and same-repository PR previews wait for the build, all test shards and every browser check. Fork PRs receive checks, and branch-only runs are available manually. See [PR_PREVIEWS.md](PR_PREVIEWS.md).

Each `render-<map>` artifact contains four PNGs: `overview-intact.png` (HUD hidden for map inspection), `overview-battle.png`, `first-person.png` and `third-person.png`. `report.json`, the overview and ground playtest logs, and `chrome.log` record the source SHA, WebGL renderer, simulation progress, browser errors and actual battle events. A failure screenshot is retained when possible. The job summary links to its artifact. Screenshot artifacts expire after 14 days; the intermediate build expires after seven days.

Village also saves clean, fixed player-height inspection views: `detail-school.png`, `detail-inn.png`, `detail-street.png` and `detail-manor-room.png`. These hide the HUD and first-person weapon to show facade identity, roadside cover and a furnished interior before the battle advances.

Fort Vaux saves inspection views of the cistern, barracks, casemate, Sunken Yard and both signed tunnel approaches. The browser walks through both yard exits in first person, verifies the 6v6 default and captures the floor plan. It also checks that the map and HUD have no artillery targeting and both scenarios have zero impacts.

Village's diagnostic recording window is also ten minutes: software rendering the additional inspection views can exceed the ordinary two-minute wall-clock recording window before the 900-step battle advance begins. The simulated match duration and required tick/frame checks are unchanged.

The script uses real browser WebGL and an explicit `renderReview` bridge available only alongside the autoplay/playtest URL parameters. It advances the same simulation, collision, events and presentation functions through 900 fixed steps, then waits for real browser frames at each checkpoint. The two ground views use clear survey positions near the fighting, so they show the environment rather than only the rear spawn. Normal gameplay does not install the bridge or change its simulation cadence. This avoids tying a 30-second battle snapshot to the speed of a software GPU. A fixed seed helps comparisons, but animation/battle timing still varies, so exact pixel differences are not a merge gate. Missing resources, JavaScript errors/assertions, missing WebGL or a game that does not advance fail the check. All maps must pass before main deploys.

Industrial additionally fires real controlled rounds to verify hit direction, death reports, the brief death camera and its end after a scoped death, normal respawn, death-map marker expiry and damage-based assists. The check uses the normal tactical/scoreboard key handlers, verifies the assist column and checks death-card bounds at 600px height. Additional `combat-*.png` captures and `combatChecks` in the report preserve the evidence.

Each build's browser jobs check the map links and available loadouts in the briefing, including the emplacement kit. Industrial follows the briefing's **Armoury** URL and checks each faction's Armoury cards against the gameplay profiles. It checks comparison-table visibility and sorting and saves `armoury-comparison.png`. Training drives deployment, mounting, firing, reloading, dismounting and packing through the normal input handlers.

## Before-and-after images

**Map and model visual comparison** builds both the target branch and proposed merge on map, model and rendering PRs. Each map job uses the same browser, graphics preset, opening seed and camera setup for both revisions. Download `visual-comparison-<map>` from the run summary, extract it and open `index.html` to compare overviews and first-person views side by side. Village and Fort Vaux also include four inspection views each. New maps receive screenshots of the proposed build until a base revision contains the map. These opening scenes are for review and do not gate publishing or merges.

## Nightly and on-demand audits

**Battlefield audits** runs on `main` nightly at 08:23 UTC. Use **Run workflow** in Actions for an on-demand run. The `audit-ai`, `audit-maps` and `audit-performance` artifacts contain JSON reports and any failure logs. They cover squad behavior and reactions, objective routes and structural collapse, and CPU timings for simulated battles, terrain updates and scenery rebuilds. The audit groups are independent of the PR gate, and their reported timings are diagnostic without a timing threshold. Run a group locally after `npm ci` with `node tools/run-battlefield-audits.mjs ai`, `maps` or `performance` as the last argument.

## Local and deployed browser checks

SwiftShader is selected explicitly on the display-less hosted runner. Its FPS is diagnostic only and must not be reported as representative of a player’s GPU. This is also not a complete manual controls, aiming or movement acceptance test. Review screenshots for layout, materials, lighting, models and obvious visual regressions; use the existing simulation/native-physics tests for mechanics.

For a local review after a production build: `node tools/render-review.mjs village dist`. `CHROME_PATH` selects an installed Chrome binary; the default is the Ubuntu runner’s `/usr/bin/google-chrome`. Chrome uses a fresh temporary profile, localhost-only server and debugging connection. The script leaves Chrome’s browser sandbox enabled.

`PAGES_BASE_PATH` selects a PR's nested asset base when serving locally. `REVIEW_BASE_URL` points the same browser check at a deployed HTTPS site. The publisher verifies every published asset's SHA-256, then runs Village, Industrial combat feedback, and Training controls on three separate read-only runners. Their `deployed-browser-<map>` artifacts contain the screenshots and diagnostic logs. `preview-ready` requires all three replays of the same published build.
