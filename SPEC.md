# Sector Control — MVP v0.1

Implementation baseline: the user-supplied Sector Control MVP specification, with two agreed decisions: returning defenders restore partial neutralization, and delivery is local first. Deployment is deferred.

## Match and combat

- Desktop WebGL 2, standalone PlayCanvas, strict TypeScript, Vite, Vitest, HTML/CSS HUD. No editor account or backend.
- Blue: one human plus four bots. Red: five bots. Three sectors, eight minutes, initial scores zero. One point per owned sector every five seconds; highest score wins, equal scores draw.
- Camera-relative WASD movement, 4.5 m/s walk, 7 m/s sprint, smooth acceleration/deceleration, shoulder camera, 70-degree vertical FOV, mouse aim, restricted pitch, obstruction handling. No free jumping or crouching. The trench prototype supports contextual Space mantling up/down nearby terrain edges.
- Shift sprint, right mouse aim, left mouse automatic fire, R reload, Tab scoreboard, Escape release/pause. Pointer lock begins on user interaction.
- Shared rifle: 25 damage, 100 HP, 30-round magazine, 120 reserve, 600 RPM, two-second reload, 60-meter projectile range. Rounds travel at a deliberately visible 32 m/s without gravity, with bright cyan/orange tracers. Damage and hit feedback occur on impact. Validate the muzzle and sweep each traveled segment against world cover and soldier volumes. No friendly damage.
- Death disables actions. Respawn after five seconds with fresh ammunition and two seconds of protection, ending on firing.

## Objectives and bots

- A/B/C use eight-meter horizontal radii. Neutral capture takes ten seconds. Enemy objectives take ten seconds to neutralize plus ten seconds to capture. Extra occupants do not accelerate progress.
- Both factions contest and pause progress. Empty sectors retain progress. Opposing occupancy reverses progress, including defenders restoring neutralization. Ownership is retained until neutralization completes.
- Bots share commands, combat rules, and movement. They select objectives with assignment penalties, navigate a waypoint graph with A*, avoid obstacles, separate locally, acquire visible enemies, delay reactions, fire inaccurate bursts, reposition, reload, die, and respawn.
- Reaction delay, aim error, engagement range, and burst timing are configurable in `BotSettings`.

## World and presentation

- Default: one approximately 100 × 100-meter flat industrial map with opposing spawns, several routes, buildings, containers, barriers, cover, fog, warm light, and faction colors.
- Procedural soldier geometry and animation; muzzle/impact effects; gunfire, impact confirmation, reload, damage, capture, and start/end audio cues.
- HUD: scores, timer, objective ownership, reticle, hit marker, capture status, health, weapon/ammunition, reload state. Start/pause/respawn/results screens, scoreboard, restart without refresh.

## Engineering and acceptance

- Authoritative local 30 Hz simulation, separate rendering, engine-independent rules/bots, stable IDs, typed commands/events, serializable snapshots, explicit collision adapter. Rendering/animation never controls damage or timing.
- Unit coverage for combat, reload, death/respawn, protection, capture transitions/contests, scoring, timeout/outcomes, navigation, and repeatable full matches.
- Target 60 FPS at 1080p, ordinary gameplay floor 30 FPS, ten soldiers, no sustained memory growth over repeated matches. These targets require profiling on the supported test machine.
- Complete local acceptance requires a human to play an eight-minute 5v5 match, verify collisions/combat/objectives/results, and restart. Headless tests supplement that acceptance.
- Out of scope: hosting for this iteration, networking, accounts, persistent progression, classes/loadouts, vehicles, destruction, additional maps beyond the approved trench prototype, advanced AI/graphics, chat, mobile controls, rankings, monetization, customization, minimap, and kill feed.

## Approved trench experiment

- Selectable `map=trenches`, 160 × 128 meters; 25 soldiers per faction (human + 24 Blue bots, 25 Red bots). Industrial remains the default 5v5 option.
- Zigzag front trenches, rear support and communication routes, earth banks, ramps, timber lining, sandbags, wire, bunkers, and shell scars. Three sectors in no man's land; normal scoring and eight-minute match duration.
- Trench floor at 0 m, land at 2.4 m, firing steps at 1.05 m. Center-trench standing hit volumes are below the parapet; raised steps expose soldiers and allow firing. Openings and ramps do not provide full enclosure.
- Space mantles nearby terrain edges up/down, maximum 2.5-meter change, one-second action plus half-second cooldown. Stable landing and world sweep required. No firing or capturing during the climb; bullets can still hit exposed climbing soldiers. Death/respawn clears the action.
- Current rifle, projectile speed, faction colors, and articulated soldiers are retained for the prototype. Historical equipment/art and tuned faction balance are future work.
- Large-team scoreboard uses scrollable parallel rosters. Native short-run performance is measured separately from a controlled 1080p/full-match acceptance pass.
