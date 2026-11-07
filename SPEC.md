# Sector Control — MVP v0.1

Implementation baseline: the user-supplied Sector Control MVP specification, with two agreed decisions: returning defenders restore partial neutralization, and delivery is local first. Deployment is deferred.

## Match and combat

- Desktop WebGL 2, standalone PlayCanvas, strict TypeScript, Vite, Vitest, HTML/CSS HUD. No editor account or backend.
- Blue: one human plus four bots. Red: five bots. Three sectors, eight minutes, initial scores zero. One point per owned sector every five seconds; highest score wins, equal scores draw.
- Camera-relative WASD movement, 4.5 m/s walk, 7 m/s sprint, smooth acceleration/deceleration, shoulder camera, 70-degree vertical FOV, mouse aim, restricted pitch, obstruction handling. Space mantles nearby trench edges when possible, otherwise performs a short ballistic hop. No air jumping. C toggles crouching on/off.
- Shift sprint, right mouse aim, left mouse automatic fire, R reload, Tab scoreboard, Escape release/pause. Pointer lock begins on user interaction.
- Shared rifle: 25 damage, 100 HP, 30-round magazine, 120 reserve, 600 RPM, two-second reload, 60-meter projectile range. Rounds travel at a deliberately visible 32 m/s without gravity, with bright cyan/orange tracers. Damage and hit feedback occur on impact. Validate the muzzle and sweep each traveled segment against world cover and soldier volumes. No friendly damage.
- Grenades: G throws one of three replenished on each spawn. 20 m/s launch, 10 m/s² gravity, aim pitch plus 0.65-radian loft clamped to 0.15–1.25 radians; three-second fuse, 0.8-second throw cooldown and 0.5-second rifle interruption. Swept 0.12 m shell, damped wall/floor bounces. Seven-meter radius, ceil(140 × (1 − distance / 7)) damage measured to body center, with world cover rays blocking blast. Enemy kills count normally; self damage awards no kill/score, teammates and protected spawns are safe. Released grenades survive the thrower’s death and clear at match end/restart. Flash, expanding radius effect, four-second rising/fading smoke and sound; smoke has no gameplay occlusion. AI retains rifle-only behavior for now.
- Death disables actions. Respawn after five seconds with fresh ammunition and two seconds of protection, ending on firing.

## Objectives and bots

- A/B/C use eight-meter horizontal radii. Neutral capture takes ten seconds. Enemy objectives take ten seconds to neutralize plus ten seconds to capture. Extra occupants do not accelerate progress.
- Both factions contest and pause progress. Empty sectors retain progress. Opposing occupancy reverses progress, including defenders restoring neutralization. Ownership is retained until neutralization completes.
- Bots share commands, combat rules, and movement. They select objectives with assignment penalties, navigate a waypoint graph with A*, avoid obstacles, separate locally, acquire visible enemies, delay reactions, fire inaccurate bursts, reposition, reload, die, and respawn.
- Reaction delay, aim error, engagement range, and burst timing are configurable in `BotSettings`. Bot aim uses separate smoothly interpolated yaw/pitch offsets within a disk. Each actual shot adds 0.25 bloom (capped at 1), multiplying base error by 1–1.75; stopping fire recovers 1/18 bloom per tick. Trench base error is 0.02 rad, giving approximately 0.8–1.4 m maximum spread at 40 m. Industrial retains its 0.035 rad base. Player rifle trajectories are unaffected, respawn resets bloom, and zero custom aim error remains perfect.

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
- Four zigzag trench lines (rear and front for each faction), linked by three communication routes per side. Teams spawn on open ground immediately behind their first/rear line, aligned with broad entry ramps. Exposed central no man's land has two low sandbag remnants and two small wire patches; bunkers stay behind the rear lines. Earth banks, firing steps, timber lining, and shell scars remain. Continuous front parapets with no ramps into no man's land. Rear entry ramps remain. Trench mode now uses domination (see current rules below); Industrial keeps sector scoring.
- Trench floor at 0 m, land at 2.4 m, firing steps at 0.85 m. Center-trench standing hit volumes are below the parapet; raised steps expose the head/helmet and raised rifle while the torso remains below the bank. Shots and target acquisition use actual bank occlusion. Front entrances are sealed; only rear entry ramps remain.
- Space mantles nearby terrain edges up/down, maximum 2.5-meter change, 1.2-second action plus half-second cooldown. Stable landing and world sweep required. No firing or capturing during the climb; bullets can still hit exposed climbing soldiers. Death/respawn clears the action.
- Current rifle, projectile speed, faction colors, and articulated soldiers are retained for the prototype. Historical equipment/art and tuned faction balance are future work.
- Large-team scoreboard uses scrollable parallel rosters. Native short-run performance is measured separately from a controlled 1080p/full-match acceptance pass.

- Space fallback hop: initial vertical speed 3.8 m/s, gravity 16 m/s², peak about 0.45 m, roughly 0.47 s airborne, eight-tick landing cooldown. Preserve conservative horizontal walking collision; sweep upward for ceilings. Hop state resets on death/respawn and emits takeoff/landing events.
- Mantles use approach/reach/pull/crouched-cross/stand root motion. A free right hand braces on the ledge while the left stays attached to the tucked rifle. Knees lift to clear the parapet, then extend into landing; feet/torso/head sweeps use the matching tucked-foot clearance.

- Four-line layout acceptance: four separate dug bands at representative firing-line cross sections; all 50 spawn positions are on ground behind their first line, can move directly down an entrance, and retain a route to their assigned friendly front firing position. Central cover footprint is under 15 m², all at most 0.65 m tall, with no cover boxes within 10 m of a sector.

- Fifty firing stations: 25 per faction distributed along seven front-line step sections. Bots hold these positions, acquire exposed heads with up to 59 m engagement range, and do not mantle into no man's land. Industrial AI remains objective-driven.
- Trench rifle muzzle/LOS height is 1.65 m above the feet; bot aim targets head height rather than the concealed torso. Articulated arm poses raise and support the weapon without detaching the left hand.
- Original elimination scoring is retained as an explicit simulation fixture; current trench play uses domination. Manual over-the-top mantling is retained; there is no automatic exit route.

## Destruction prototype

- Runtime world state is isolated per match: sparse 0.25 m excavation samples, stable cover IDs/health/stages, crater records and monotonically increasing revisions. Authored maps remain pristine.
- Grenade explosion profile: soldier radius/damage 7 m / 140; structural radius/damage 4 m / 100; crater radius/depth 1.75 m / 0.55 m; excavation uses a rounded radial bowl, attenuates with standoff up to 3 m and respects pre-explosion cover.
- Wood has 40 HP; sandbags have 160 HP. Damaged cover at half health retains 60% height; destroyed cover removes its collision. Timber lining is segmented and exposes retained earth when destroyed. Fixed buildings/bunkers/containers/concrete barriers are indestructible and protect foundations.
- Repeated excavation accumulates, spreading outward to keep continuous surfaces navigable; minimum world height −0.9 m. Original trench walls remain until actually excavated. Soldier damage is evaluated before cover removal from that explosion. Unrelated mantles continue; changed endpoints invalidate a climb.
- Ground meshes and actual Ammo terrain collision share the same sampled surface. Eight-meter patches refine only affected two-meter cells; unaffected geometry stays coarse. Camera/projectile/LOS queries include dynamic terrain. Navigation caches and bot paths refresh after changes. Full restart restores pristine geometry and releases the terrain physics world's cached triangle data.
- Destruction produces transient cosmetic fragments alongside grenade flash/smoke/audio. No tunnels, overhangs, persistent physics debris, building collapse, or artillery firing UI in this prototype. Future explosion profiles use the same damage/deformation entry point.

## Authored starting terrain

- Trench no man's land starts with six rotated, softly irregular elliptical shell bowls (roughly 3–4 m radii, 0.55–0.7 m depths), nine smaller shoulder hollows (0.18–0.24 m depths) and five broad elliptical depressions (0.12–0.18 m depths). This local shell-scar layer is capped at 0.85 m downward displacement.
- The local shell-scar layer tapers out before |x| = 15 m, preserving at least three meters before the closest front parapet. Trenches, firing steps, ramps, spawns and existing cover footing retain their previous heights. Two legacy scar positions move clear of wire patches.
- Broad signed landforms cover the open field and rear ground on the existing two-meter mesh grid: up to 0.95 m hollows, central crests below 0.06 m, and rear rises below 0.32 m. Smooth masks protect trench lips/floors/steps, rear entry ramps, spawn assembly areas, fixed cover and map edges. Gentle-slope vegetation follows actual ground.
- Local shell relief uses a shared immutable quarter-meter grid, separate from the broad landforms and per-match explosion cuts. Actual terrain meshes/collision refine around both layers. Legacy flat scar disks are removed, and cosmetic rubble follows the ground. Grenades add excavation on top; restart restores the authored baseline.


### Latest prototype additions
- Minority bot machine gunners use short rapid bursts with awareness, erratic aim and recoil; human rifles remain semi-automatic.
- Q opens a broad-sector tactical artillery map; blind calls from cover have greater placement uncertainty. Shared charge, range and dense salvo timing remain; enemy countdowns and ground warning markers are removed.
- Artillery craters vary in shape/depth and locally round off blasted firing-step ends.
- Future only: a creeping barrage with a slowly advancing fire line.

- Artillery shells descend in 0.8 seconds, with irregular per-mission arrival gaps across the existing four-second barrage window; the hidden call-to-impact transit remains four seconds. Nearby physical shells/impacts cue bots and incoming voices.

## Current trench mode — domination (November 6)

Four initially neutral flags: A(−22.5,−33), B(−22.5,35) in Blue’s front line; C(28.5,−27), D(24.5,31) in Red’s. Six-meter radius, feet within 1.1 m of flag ground and unobstructed chest-height ray; alive, grounded soldiers only. Neutral capture 450 ticks; enemy neutralization 450 then capture 450, no numerical superiority bonus. Both teams present freeze capture and income; empty ownership persists. Every 90 ticks each owned, uncontested flag scores one point. First to 300 or higher score at eight minutes; ties draw. Kills affect personal K/D only. Rear spawns unchanged.

Flags are decorative, rebased to deformed ground; capture checks use actual shared terrain/collision. HUD/world/tactical map show public ownership and contests; scoreboard includes captures. Bot assaults target enemy flags, landed survivors capture then defend steps, nearby riflemen retake threatened home flags. Existing artillery evasion, suppression, awareness and machine-gunner covering roles retain priority. Industrial keeps its original capture/scoring rules. Creeping barrage remains deferred.

## Branching trenches and artillery protection — November 7

Six alternate connections and six turning shelter necks extend the four original lines; six recessed 6 × 6 m open-topped bays behind the rear lines provide earth-screened cover. All hundred firing stations, rear entries and continuous front parapets remain.

Artillery retains its original 240 damage / 12 m falloff radius. Partial exposure scales damage by visible body probes; intact earth fully shields blocked bodies, while direct trench hits remain dangerous. Crater radius is 2.5 m (formerly 3.5), terrain reach 3.5 m and bank depth 1.6 m; bowl depth stays 1.3 m and structural damage/reach 260/7 m. Grenade damage is unchanged. Bare/snapped trees, exposed roots and sparse small crowns plus low cosmetic equipment dress the battlefield; branches have no invisible foliage concealment, trunks remain destructible and excavation clears equipment footing.

## Tighter trench cross-sections — November 7

Support/communication corridors and connecting elbows are two meters wide; firing trenches are four meters overall (two-meter floor, one-meter ramp and one-meter step). Rear entries narrow to four meters and six screened bays to 4 × 4 m. The four asymmetric lines and continuous front parapets remain. One-meter authored terrain cells resolve the new edges, while distant open terrain retains its two-meter mesh. Navigation anchors, firing posts, retreat/duck targets, flags and decoration follow the revised geometry.
