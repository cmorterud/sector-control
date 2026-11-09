# Sector Control — MVP v0.1

Implementation baseline: the user-supplied Sector Control MVP specification, with two agreed decisions: returning defenders restore partial neutralization, and delivery is local first. Deployment is deferred.

## Match and combat

- Desktop WebGL 2, standalone PlayCanvas, strict TypeScript, Vite, Vitest, HTML/CSS HUD. No editor account or backend.
- Blue: one human plus four bots. Red: five bots. Three sectors, eight minutes, initial scores zero. One point per owned sector every five seconds; highest score wins, equal scores draw.
- Camera-relative WASD movement, 4.5 m/s walk, 7 m/s sprint, smooth acceleration/deceleration, T toggles shoulder/first-person view, 70-degree vertical FOV, mouse aim, restricted pitch, obstruction handling. RMB uses first-person open iron sights from either view (50-degree FOV); releasing returns to the preferred view. Camera-local sight/barrel geometry is shared with the first-person projectile origin, and muzzle-to-target convergence retains close-cover obstruction checks. Space mantles nearby trench edges when possible, otherwise performs a short ballistic hop. No air jumping. C toggles crouching on/off.
- Shift sprint, right mouse aim, left mouse automatic fire, R reload, Tab scoreboard, Escape release/pause; a new Escape press while paused resumes an active match. Held repeats and the Escape that caused pointer-lock loss cannot immediately resume it. Mouse capture is restored on the next fresh gameplay key/canvas click when browser activation is needed; a capture click is consumed without shooting. Focus loss still pauses. Pointer lock begins on user interaction.
- Weapons: trench service rifle has 50 damage, five rounds, 60 reserve, 18-tick bolt cycle and 48-tick clip reload. Industrial rifle has 25 damage, 30 rounds, 120 reserve, six-tick semi-auto cycle and 30-tick reload. Machine gun has 25 damage, 60 rounds, 240 reserve, three-tick shot cycle and 45-tick reload. Soldiers have 100 HP; all rounds have a 60-meter projectile range. Rifle rounds travel at 128 m/s and machine-gun rounds at 32 m/s without gravity, with bright cyan/orange tracers. Damage and hit feedback occur on impact. Validate the muzzle and sweep each traveled segment against world cover and soldier volumes. No friendly damage.
- Grenades: G throws one of three replenished on each spawn. 20 m/s launch, 10 m/s² gravity, human aim pitch plus a shallow 0.1-radian bias clamped to −1.1–1.25 radians (bot smoke retains 0.65-radian loft and its 0.15–1.25 clamp); three-second fuse, 0.8-second throw cooldown and 0.5-second rifle interruption. Swept 0.12 m shell, damped wall/floor bounces. Seven-meter radius, ceil(140 × (1 − distance / 7)) damage measured to body center, with world cover rays blocking blast. Enemy kills count normally; self damage awards no kill/score, teammates and protected spawns are safe. Released grenades survive the thrower’s death and clear at match end/restart. Flash, expanding radius effect, four-second rising/fading smoke and sound; smoke has no gameplay occlusion. AI retains rifle-only behavior for now.
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
- Trench riflemen use wooden-stock bolt-action service rifles; minority machine gunners retain bursts. Shared procedural soldiers have curved heads/helmets, tapered jointed limbs, tailored coats and readable muted faction colors. Historical authenticity and tuned faction balance remain future work.
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
- Minority bot machine gunners use short rapid bursts with awareness, erratic aim and recoil; human trench rifles use individual clicks with a bolt cycle; industrial rifles remain semi-automatic.
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


### Spontaneous heavy artillery — November 7, 2026

Trench maps enable independent stray heavy shells: one at a time, random 8–22-second launch gaps, uniform bounded location sampling away from spawn assemblies. No team request/charge, advance warning marker or countdown. Existing 24-tick ballistic flight, real surface collision and cover checks apply. Twice guided spatial footprint:24m blast radius,14m structural radius,5m nominal crater radius and7m terrain reach; peak damage240, structural damage260 and crater/bank depth stay unchanged. Both teams can take damage, protected spawns remain immune, and environmental deaths award no player/team kill credit. Physical shell/impact perception remains available to bots. Presentation doubles flash/dust spatial scale without extending lifetime, with stronger sound and broader shock reach. Snapshot-owned RNG/schedule resets on a new match and pauses with simulation; industrial maps retain existing behavior. Launch/impact events carry ambient=true and actor=-1; playtest summaries count heavy impacts separately. Creeping barrage remains deferred.


### Ground material variation — November 7, 2026

Replace trench ground's repeated3m diffuse/normal/gloss material with a clamped1024² world-registered atlas. Broad warped wet/dry/faded-grass fields and route wear blend two rotated mud samples at4.7/8.3m scales; a quiet rotated fine normal layer supports close views. Immutable authored layout controls dressing and material fields, independently of live bots/combat RNG. Existing terrain vertices/indices/UVs/collision are unchanged. Thirty cosmetic approach clods have no collision. Up to nine level puddles are clipped into authored hollow surfaces, at roughly7.5cm maximum water depth; no water physics or planar reflections. Puddle meshes release on map rebuild and existing explosion dressing rules hide affected water/clods. Runtime cut depth colors warmer fresh clay and dark centers, separately from weathered authored scars. Shared cached textures/materials require no per-frame rebaking. Industrial presentation remains unchanged.

## Flag landmarks and sectional collapse — November 7

A Farmhouse, B Shattered Wood, C Gun Pit and D Broken Bunker add distinct nearby silhouettes, named objective HUD/tooltips and tactical-map labels. Existing flag coordinates, trench capture rules, hundred firing posts and rear spawns remain. Landmark placement checks trench clearance and existing cover against the baked ground; it does not consume combat RNG.

Brick sections have180HP, bunker concrete340HP, the abandoned gun210HP and new rubble110HP. Damaged sections retain60% height; destroyed sections remove their visible and physical boxes, adding at most two low rubble pieces on suitable footing. Further blasts clear rubble without recursive debris. Supported roof boxes allow standing movement beneath them and block overhead rays; fewer than two surviving full-height supports collapses a roof. Footing excavation can collapse ground-standing sections. Rubble follows stable excavated ground or clears if footing becomes too steep. Collapse events drive bounded cosmetic stone/wood debris and spatial sound, and are counted in recorded summaries. Reset restores original parts. Industrial fixed structures remain unchanged; enclosed terrain tunnels and general rigid-body building simulation remain outside this prototype.

## Rounded trench banks — November 7

A fixed quarter-meter shoulder field scoops the earth outside existing low lanes, with a0.64–0.8m profile varying smoothly along the edge. Rounded cross-sections and outside corners replace square earth cliffs; narrow floor lanes,0.85m firing steps, their ramps and2.4m full bank height remain. Rear entry ramps keep their exact grades. Only affected two-meter cells get the denser mesh; distant ground remains coarse. Rendering, actual Ammo, movement, projectiles, visibility and excavation share the sampled surface. Timber lining is shortened to0.45m beneath the earthen shoulders.

Mantles seek a stable full-footprint landing beyond the rounded shoulder. Ground movement checks the same15cm uphill step budget even at very low speeds, preventing gradual wall climbing through tiny inputs. Walking down and hopping remain physical. Damage/capture rules are unchanged; the new terrain shape naturally changes local exposure. Start a fresh match.

## Artillery availability and spoken callouts — November 7

The shared team artillery charge unlocks at10seconds and replenishes30seconds after each confirmed call (previously20/50). Respawn still preserves charge timing; human-team ownership, active-mission lock, targeting scatter, shell timing/damage and spontaneous heavy shells keep their existing rules. Start/pause instructions reflect the shorter timings.

Live battlefield feedback no longer emits spoken smoke, grenade or incoming-artillery callouts. The Soldier voices menu option and speech preload are removed. Rifle/MG fire, whistles, explosions, debris, footsteps and other effects keep their current mix.


## Bayonets and close combat — November 8, 2026

- V is a debounced melee command. Service-rifle thrust: 65 damage/1.8 m reach, contact after 7 ticks, attack ends at 24 ticks, then 8 ticks of rest. Running charge requires standing forward sprint input and at least 5.5 m/s actual speed: 100 damage/1.9 m reach, contact becomes active after 12 ticks and is checked continuously while forward sprint input remains held. The readied charge has no short expiry; the first body contact lowers it and starts 30 recovery ticks plus 18 rest ticks. Charge turns at most 0.03 radians/tick and moves at 6.8 m/s until contact, then slows to 1.4 m/s during recovery. Releasing sprint/forward input, solid collision, death, airborne movement or interruption cancels it; friendly/protected contact is harmless and still ends the active charge. All movement passes through existing collision/gravity. Normal attacks allow 2.5 m/s and 0.1 rad/tick turning.
- Other weapons use a butt strike: 45 damage/1.25 m reach, 8-tick wind-up, 27-tick attack plus 9 rest ticks. Melee requires grounded, living, non-reloading/non-throwing/non-staggered actors. Attacking consumes spawn protection, blocks firearm/reload/throw/hop/mantle actions and retains normal stance. Falling, death and match end cancel it; respawn resets it.
- Contact selects the nearest living body in a 0.48-radian forward cone at strike time, using common standing/crouching hit heights, a vertical reach bound and solid-world rays. Allies/protected lives block without damage. Each attack strikes once; already-landed simultaneous blows can trade. Successful enemy hits use normal scoring/death/respawn rules and briefly stagger survivors for 9 ticks; visible reaction lasts 12 ticks. Melee hits interrupt unfinished melee.
- Bots consider only their current visible recognized target within 2.5 m and compatible height. Continuous close awareness lasts at least 18–30 ticks, plus their existing recognition-delay minimum, before they can commit; losing contact resets this close reaction. They turn and approach at ordinary movement speed, use their weapon's short melee attack and retain artillery/suppression priorities. They do not receive a new global enemy scan or automatic charge ability.
- A visible mounted blade, wind-up/thrust/recovery and butt-swing poses, two-hand IK, stumble/collapse, short swing/contact effects and hit markers communicate contact. No speech or new HUD warning system. Typed melee start/strike/end/cancel events and snapshots expose attack kind, timing, target, damage and kill result. Recorder summaries count attacks, charges, hits and kills.

## Village front prototype — November 8, 2026

A third selectable map, `?map=village`, uses 50v50 domination on a 144 × 112 m battlefield. Flags A Orchard (−23,−31), B Schoolhouse (−20,18), C Market Court (21,−13) and D East Gate (24,28) retain the shared 6 m clear-space capture radius, 15-second capture/neutralization, one point per three seconds and 300-point/eight-minute limit. Blue/Red start near (−62,−4)/(62,−4).

Four short two-meter trench lanes, dogleg communication connections and three sloped exits per side feed seven sectional masonry ruins, garden passages and an exposed cobbled crossroads. The shattered orchard is an alternate northern route. Roof fragments use support IDs and collapse to existing rubble; bank terrain, trees and structures retain the shared destruction rules. Ground-level paving is baked into the terrain atlas, with mud footsteps after excavation. The Q map includes the road and current masonry. Doorway navigation anchors connect narrow openings to the shared height-aware graph. Village bots keep usable paths until objectives/obstructions change, continue into unobstructed flag space and a small subset throw normal smoke across an exposed road crossing. Trench assaults remain map-specific; squads and creeping barrages remain deferred.

Terrain physics directly owns each native Ammo triangle mesh/BVH and frees it with its replaced patch. The engine's lifetime geometry-source cache no longer retains old crater revisions. Real Ammo rebuild/raycast tests cover replacement and release. This is a resource-lifetime correction, not a demonstrated FPS gain; full village presentation performance remains unresolved.

## Village individual positioning — November 8, 2026

Computer-controlled village soldiers deploy behind all three communication-trench entrances. Human deployment retains the existing formation position. Each bot chooses an individual, footprint-valid capture or support position within10m of its current flag. Geometry probes prefer low cover with a standing firing line or solid shelter; reservations discourage nearby friendly goals. Up to three riflemen's capture-capable reservations are prioritized before other soldiers prefer a wider supporting perimeter. Machine gunners prefer supporting positions. A bounded reachable shortlist is checked with the shared current-terrain pathfinder.

Plans persist for roughly6–7seconds, with staggered checks. Objective changes, lost cover after destruction, suppression against a recently observed threat, or three seconds without progress may select a new position. Known threat positions expire after three seconds; hidden live enemy coordinates are never read by the cover planner. Valid routes are reused, while dead lives release reservations and respawning clears the plan. Bots continue moving to cover rather than reducing every advance to20% movement on sighting a distant enemy; they cannot fire while making the resulting sprint. Friendly steering anticipates near crossings and only uses walkable side space. At actual low cover, reload/pressure/idle and a short peek cycle drive crouching. Existing melee, artillery evasion, suppression priority, accuracy and damage rules remain.

`botPosition` diagnostics record objective, goal, measured cover, capture eligibility and a reason: deploy/objective/stuck/underFire/coverLost/reposition. Snapshot-owned plans and summary counters support event-only checks. This pass is scoped to Village front; it adds no squad controller or new player controls.

## Pause and combat-control follow-up — November 8, 2026

Escape resumes the simulation/menu immediately even if browser mouse-lock rules require another activation. Fresh non-shortcut gameplay keys or a canvas click request recapture; refusal leaves Escape-resumed play active and waits for another real gesture. No timed lock retry or security bypass is used. Normal start/Resume-button capture errors still show the pause prompt. Mouse unlock ordering, held repeats, focus pauses and initial/end menus are guarded.

Projectile velocities are captured at launch. Simulation travel/range expiry, event endpoints, tracer interpolation and bot interception use the actual per-weapon speed, so changing a shooter's weapon or losing its owner does not alter a flying round. Full swept segments still catch thin cover at64m/s. Active charge contact checks current position and the previous movement origin to avoid stepping past close contact; one contact resolves at most once. Its serializable end marker is a finite safe integer until contact assigns the ordinary recovery endpoint. The renderer holds a raised, forward-ready rifle pose with both-hand IK throughout the sprint.

## Faster weapon handling — November 8, 2026

Reload durations are halved across all three profiles: rifle30ticks(1s), serviceRifle48ticks(1.6s), machineGun45ticks(1.5s). The service rifle's shot/bolt cycle halves36→18ticks(0.6s). Other shot cycles, ammo capacity, damage and awareness rules retain their values. Normalized reload poses automatically run twice as fast. The service bolt's original pose curve is resampled at double speed, restoring the firing grip before the shorter cycle completes. Mechanical events follow normalized phases: cycle boltOpen at5ticks/boltClose14ticks after firing; reload boltOpen3ticks/clip24ticks/boltClose42ticks after loading begins, with rounding to simulation ticks.

Rifle/serviceRifle projectile velocity doubles64→128m/s. Machine-gun rounds remain32m/s. Per-shot speed, bot interception, swept impact, tracer interpolation and60m expiry use the existing velocity/profile system. A nearby target's time to dodge is consequently shorter; tests that move targets during flight act before the faster round arrives.
