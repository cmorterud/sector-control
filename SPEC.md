# Sector Control — MVP v0.1

Implementation baseline: the user-supplied Sector Control MVP specification, with two agreed decisions: returning defenders restore partial neutralization, and delivery is local first. Deployment is deferred.

## Match and combat

- Desktop WebGL 2, standalone PlayCanvas, strict TypeScript, Vite, Vitest, HTML/CSS HUD. No editor account or backend.
- Blue: one human plus four bots. Red: five bots. Three sectors, eight minutes, initial scores zero. One point per owned sector every five seconds; highest score wins, equal scores draw.
- Camera-relative WASD movement, 4.5 m/s walk, 7 m/s sprint, smooth acceleration/deceleration, shoulder camera, 70-degree vertical FOV, mouse aim, restricted pitch, obstruction handling. Space mantles nearby trench edges when possible, otherwise performs a short ballistic hop. No air jumping or crouching toggle.
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
- Four zigzag trench lines (rear and front for each faction), linked by three communication routes per side. Teams spawn on open ground immediately behind their first/rear line, aligned with broad entry ramps. Exposed central no man's land has two low sandbag remnants and two small wire patches; bunkers stay behind the rear lines. Earth banks, firing steps, timber lining, and shell scars remain. Continuous front parapets with no ramps into no man's land. Rear entry ramps remain. Trench mode scores enemy eliminations over eight minutes; Industrial keeps sector scoring.
- Trench floor at 0 m, land at 2.4 m, firing steps at 0.85 m. Center-trench standing hit volumes are below the parapet; raised steps expose the head/helmet and raised rifle while the torso remains below the bank. Shots and target acquisition use actual bank occlusion. Front entrances are sealed; only rear entry ramps remain.
- Space mantles nearby terrain edges up/down, maximum 2.5-meter change, 1.2-second action plus half-second cooldown. Stable landing and world sweep required. No firing or capturing during the climb; bullets can still hit exposed climbing soldiers. Death/respawn clears the action.
- Current rifle, projectile speed, faction colors, and articulated soldiers are retained for the prototype. Historical equipment/art and tuned faction balance are future work.
- Large-team scoreboard uses scrollable parallel rosters. Native short-run performance is measured separately from a controlled 1080p/full-match acceptance pass.

- Space fallback hop: initial vertical speed 3.8 m/s, gravity 16 m/s², peak about 0.45 m, roughly 0.47 s airborne, eight-tick landing cooldown. Preserve conservative horizontal walking collision; sweep upward for ceilings. Hop state resets on death/respawn and emits takeoff/landing events.
- Mantles use approach/reach/pull/crouched-cross/stand root motion. A free right hand braces on the ledge while the left stays attached to the tucked rifle. Knees lift to clear the parapet, then extend into landing; feet/torso/head sweeps use the matching tucked-foot clearance.

- Four-line layout acceptance: four separate dug bands at representative firing-line cross sections; all 50 spawn positions are on ground behind their first line, can move directly down an entrance, and retain a route to their assigned friendly front firing position. Central cover footprint is under 15 m², all at most 0.65 m tall, with no cover boxes within 10 m of a sector.

- Fifty firing stations: 25 per faction distributed along seven front-line step sections. Bots hold these positions, acquire exposed heads with up to 59 m engagement range, and do not mantle into no man's land. Industrial AI remains objective-driven.
- Trench rifle muzzle/LOS height is 1.65 m above the feet; bot aim targets head height rather than the concealed torso. Articulated arm poses raise and support the weapon without detaching the left hand.
- One point per enemy elimination; no sector capture awards, sector rings, or objective labels in trench mode. Faction scores track total opposing deaths. Manual over-the-top mantling is retained; there is no automatic exit route.
