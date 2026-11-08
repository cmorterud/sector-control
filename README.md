# Sector Control

Continuing from another chat? Read [HANDOFF.md](HANDOFF.md) for project decisions, implementation state, validation, and the Chrome control and recorded-playtest status.

Local single-player third-person shooter. Industrial is 5v5 territory control; Trench front and Village front are 50v50 domination maps with four flags. Matches last up to eight minutes.

## Run

Requires Node.js 22.12+ (developed with Node 26).

```sh
npm ci
npm run dev
```

Open the printed localhost URL, then click **Begin operation** to capture the mouse. WASD moves, mouse aims, Shift sprints, right mouse aims down range, each left click fires one round, R reloads, Tab holds the scoreboard, and Escape pauses. Press Escape again to resume, or click Resume. After Escape releases the mouse, the next movement/action key or a click on the game recaptures it automatically; that capture click does not fire a shot. Losing focus pauses the local simulation.

```sh
npm run check
npm run build
npm run preview
```

GitHub Actions runs `npm ci`, `npm run check -- --maxWorkers=1` (TypeScript and tests), and `npm run build` on every push to `main`. The [Build and test workflow](.github/workflows/ci.yml) uses Node.js 26 on Ubuntu with npm caching. It can also be started manually from the repository's Actions tab.

Development scenarios: `?bots=0` disables bots; `?duration=30` runs a thirty-second match; `?demo=1` permits observation without pointer lock; `?overview=1&autoplay=1` gives a top-down observer view for reviewing the layout and bot routes. These do not change normal gameplay defaults.

Walk over a trench edge to drop in naturally; no Space press is needed. Gravity carries you onto the firing step or floor, with a small landing pose. Press **Space** to hop on open ground or mantle upward to climb out. Hopping over an edge continues the arc down to the ground below.

Trench riflemen, including the player, carry a **bolt-action service rifle** with a long wooden stock, five rounds and 60 reserve. Click once to fire; the right hand opens, pulls and closes the bolt before another shot is possible (1.2 seconds between shots). Press R for a 3.2-second clip reload. Service rounds deal 50 damage and have stronger recoil, a deeper report and mechanical bolt/clip sounds. Industrial keeps its 30-round semi-auto rifle. Holding the mouse does not repeat fire; a press during reload or cycling must be released before trying again.

Service-rifle and semi-auto rifle rounds travel at **64 m/s**, twice their previous speed. Machine-gun rounds remain at 32 m/s. All retain a 60 m range, visible tracers, swept collision and damage on impact; bot lead follows each weapon’s speed.

**Machine gunners:** four bots per team in 50v50 (two in 25v25) carry a longer wooden-stock weapon with a pan magazine and folded bipod. They fire four-to-six-round bursts at 600 rounds/minute, then pause for 1.5–3 seconds. They retain recognition delay, imperfect aim, recoil, suppression and sight-loss interruption, with more aim wander than riflemen. Their magazines hold 60 rounds with 240 reserve and a three-second reload. They stay with the covering force rather than joining assault squads. Human players keep their map’s rifle; small 5v5 rosters stay rifle-only.

Rifles now kick upward and slightly sideways on every shot. The kick moves the barrel, shoulder and camera and changes subsequent projectile directions for players and bots. Pull down to compensate, or space your shots and let the rifle settle. Right-mouse aiming reduces recoil by 20%; crouching reduces it by another 15%. The support hand stays on the grip.

Press **V** for melee. Trench service rifles use a **bayonet thrust**: 65 damage, a short wind-up, 1.8 m reach and recovery between attacks. Build up forward sprint speed, then press V for a **bayonet charge**: 100 damage and limited turning. Keep sprinting forward to hold the bayonet raised and readied until the first body contact, which lowers it and starts a longer recovery. Releasing sprint or forward movement, hitting solid cover, becoming airborne, or dying ends the charge. Allies and protected soldiers can absorb the first contact without damage. Machine guns and industrial rifles use a shorter, weaker weapon-butt strike (45 damage, 1.25 m reach). Holding V does not repeat attacks.

Melee checks the victim's position at contact, so stepping away can make it miss. Earth and solid cover stop it, and friendly/protected soldiers block the thrust without taking damage. An attack interrupts firing, loading, throwing and climbing until recovery ends. You cannot begin while reloading, throwing, airborne or stunned. A landed blow briefly staggers a surviving soldier and can interrupt their wind-up. Bots use melee only against a nearby recognized enemy, after a close-range reaction delay; artillery evasion and suppression cover still take priority. No spoken callouts are added.

Press **G** to throw a grenade in the direction you're looking. Each soldier gets **three per spawn**. Grenades arc under gravity, bounce off terrain/cover, and explode **three seconds after release**, with a flash, expanding blast effect, rising smoke, and sound. The **7 m blast radius** deals up to 140 damage with distance falloff; solid cover blocks damage. Your own grenade can hurt you; teammates and protected spawns take no damage. Aim up/down to change the arc. Throws briefly interrupt rifle fire; a held G does not repeatedly throw. A connected column of thrown-up dirt rises above the trench lip so a burst inside it remains visible. Flash and damage still respect solid earth. Explosive blast smoke is cosmetic. Press **F** for a separate concealing smoke grenade; bots use these during squad advances, while explosive grenade throws remain player-controlled.

## Trench domination

Capture **A and B** in Blue’s front trench and **C and D** in Red’s. All four start neutral. Stand within six meters of a flag in its connected trench space: bank tops and solid walls do not count. A neutral flag takes **15 seconds** to capture; an enemy flag takes 15 seconds to neutralize, then 15 more to claim. Extra soldiers do not speed this up. Both teams present freeze progress and income. Ownership remains after leaving.

Each uncontested flag earns its owner **one point every three seconds**. First to **300** wins; otherwise the higher score after eight minutes wins, with ties drawn. Kills remain personal scoreboard statistics and earn no team points. The HUD shows ownership, contested flags and capture progress; the Q tactical map also marks public flag ownership. Named landmarks help orient the four areas: **A Farmhouse**, **B Shattered Wood**, **C Gun Pit**, and **D Broken Bunker**. Flags remain in their original trench positions; the ruins, shattered trees and abandoned gun stand nearby without closing the existing trench routes.

Bots still cover from firing steps and cross in small smoke-screened squads. Assaults target enemy flags; survivors capture them on the floor, then defend nearby steps. Nearby riflemen retake threatened home flags while machine gunners keep covering. Respawns remain behind each team’s rear trench. Industrial retains its original three-sector rules. This is an initial balance prototype.

## Village front prototype

Choose **Village front** in the start menu or open [the village map](http://localhost:5173/?map=village). It keeps the trench map's 50v50 roster, service rifles, machine gunners, grenades, bayonets and artillery, with the same domination rules.

The 144 × 112 m battlefield has four flags: **A Orchard**, **B Schoolhouse**, **C Market Court** and **D East Gate**. Seven open-roof building ruins, garden walls and broken sandbags create shorter fights and several routes to a cobbled central road. A sparse shattered orchard offers a longer northern flank. Each team starts behind two short sunken trench lines with communication turns and walkable entry/exit slopes. Unlike Trench front, these approaches lead out into the village without requiring a mantle.

Masonry sections and partial roofs use the existing destruction system: blasts open walls, collapse supported roof fragments and leave real low rubble cover. Terrain and trees remain destructible. The tactical map shows the road, surviving masonry, sunken approaches and public flags. A few riflemen spend their normal smoke supplies to screen exposed road crossings individually. Bots deploy behind three separate entrances and reserve different capture or covering positions around each flag. They prefer real walls, sandbags and rubble, steer around approaching teammates, and keep moving toward cover when a distant enemy appears. At low cover they crouch while reloading or under pressure and stand to engage. Stalls, suppression, destroyed cover and changing objectives can trigger a new position; target information comes from their existing observations. No squad system is introduced.

Playtest logs include `botPosition` events with the chosen position and reason (`deploy`, `objective`, `stuck`, `underFire`, `coverLost` or `reposition`), plus cover-choice/stuck-replan counters. Plans are included in snapshots and clear on respawn.

This is a layout/balance prototype. The latest full-presentation production recording runs 100 soldiers for 60 seconds with four captures, artillery, collapses and zero reported errors, averaging 44.11 FPS on the development machine. It records cover changes under fire and after destruction, with much less opening congestion. The earlier 9.24 FPS development recording and 55.21 FPS isolated fixture used different workloads/build conditions; these results do not isolate the cause of that performance difference. Longer performance and manual-play acceptance remain follow-ups. See PLAYTEST_REVIEW.md.

## Soldiers

Soldiers have rounded, tapered limbs and tailored coats, smaller human-shaped heads, curved steel helmets, puttees and oval boots. Muted team-colored uniforms, armbands, webbing, pouches, packs and rolled blankets retain team readability. The models are stylized procedural figures. Stride timing, upper-body sway and idle breathing vary between soldiers. Reloads visibly load a service-rifle clip or exchange the other weapons’ magazines; the right hand works the action while the left stays on its grip. Walking, crouching, mantling, blast reactions and falling bodies retain their articulated poses.

A killed soldier buckles and falls over roughly 0.85 seconds. Nearby bodies remain for about 20 seconds, fading at the end; at most 24 are retained. They follow excavated ground and are cosmetic, so they do not block movement, shots or objectives. Respawning soldiers are independent of the retained body. Pausing freezes the presentation and a fresh match clears it.

Spoken soldier callouts are removed, including smoke, grenade and incoming-artillery lines. Weapon fire, explosions, incoming-shell whistles, footsteps and other battlefield effects remain audible.

## Battlefield appearance

Trench terrain now has mottled damp soil, fine mud detail and locally darker exposed earth after excavation. Timber lining and duckboards have worn grain. Materials stay attached to the rebuilt terrain, including bank faces and craters. Trench banks have steep scooped sides, rounded shoulders and softened outside corners, with slight fixed variation along the edge. Short timber retainers sit below the earthen shoulders. The two-meter floor lanes, firing steps and rear entry ramps remain; rounded earth still requires a mantle to climb.

Cool overcast light, softer shadows, a clouded sky and light distance haze give the battlefield depth. Explosions throw a brief dirt column and tumbling clods, followed by irregular dust that spreads, drifts and fades. Concealing smoke uses soft textured billows. Its existing visibility rules remain the same; explosion dust remains cosmetic. These effects pause with the game, reset with the match and have bounded overlapping particles.

## Battlefield sound and reactions

Rifles, explosions and incoming shells now have directional sound, distance filtering and cover muffling. Nearby rounds produce sharp spatial cracks using the actual unobstructed near-miss events. Rifle tails soften with distance; artillery has a falling whistle, a sudden broadband crack and an unpitched low rumble. Explosions can take a voice from quieter rifle chatter so their sound is not lost in a crowded mix. Sounds are synthesized locally as a prototype.

Footsteps follow distance actually walked: mud outside the trenches, wood on visible duckboards, and concrete in the industrial district. Sprinting is louder and crouching quieter. Planks disappear where excavation removes their support, and footsteps there return to mud. Nearby soldiers contribute footsteps; airborne or stationary soldiers do not.

Nearby explosions briefly jolt the camera, muffle battlefield sound and add falling-dirt audio. Cover reduces the reaction, hearing recovers over a few seconds, and nearby soldier rigs briefly brace. These are presentation effects and do not alter input, aim, damage or bot decisions. Start/pause menus include a **Battlefield volume** slider (zero mutes) and a **Blast camera motion** toggle. Headphones help with direction.

Recorded playtests now include the game's stereo output, along with presentation counters and a bounded recent-sound log in the JSON. They capture no microphone or desktop audio. Sound voices and audible footsteps are capped for the 100-soldier battle; pausing cancels active/scheduled sounds and restarting clears feedback.

## Destruction prototype

Grenades now excavate persistent craters and damage wooden obstacles, trench lining, and sandbags in both maps. A ground-level grenade can dig roughly 0.5 m at its center across an initial 3.5 m footprint, with a smooth rounded bowl; airbursts dig less. Repeated hits deepen and widen the bowl, with a lowest floor of −0.9 m. Craters affect walking height, cover, bullets, camera collision, and bot routes. Parapet crests can be chipped, and repeated concentrated hits can create a breach. Wooden lining can break away while the earth behind it remains solid. When excavation removes its backing, the remaining lining breaks away too, so a walkable breach cannot retain a standing wooden facade. Sandbags lose height before disappearing. Two light wooden screens behind the trench lines provide additional destructible cover.

Explosions against an exposed trench face now cut rounded chunks sideways into the bank. Repeated grenade hits or a strong artillery strike can make an **open, walkable breach** with matching terrain collision; partial cuts leave earth that still stops shots. Intact solid screens block excavation.

Artillery bowls now vary in size, depth, elliptical orientation, offset and softly irregular rims, deterministically per impact. Low firing-step ends crumble locally into rounded pockets when directly struck; relaxation cannot carve remote intact trench edges. Meshes, rays and movement share the same deformed surface. Artillery also slumps damaged narrow earth remnants into low rubble slopes. Partially eroded bank edges blend consistently between terrain samples, preventing thin upright sheets with collision. Intact distant walls and fixed foundations remain protected.

Scattered grass, shrubs and battle-scarred trees break up the rear banks and flanks while no man’s land stays relatively open. Most trees are bare or snapped, with exposed roots and splintered tops; a few retain small, muted crowns. Bare branches provide no invisible foliage concealment, while trunks remain solid and destructible. Weathered, split timber posts and low abandoned helmets, packs and planks dress the trench edges; this small clutter is cosmetic and clears where explosions excavate its footing. Foliage obscures bot sight but lets soldiers and bullets pass; trunks are solid. Explosions clear brush, strip tree crowns and fell trunks into destructible logs and stumps that become new cover. Rifle impacts can chip and eventually fell trees too. Roots exposed by excavation also fail. Squads can choose newly excavated craters as regrouping cover and crouch in deeper bowls. Flying dirt and fragments remain cosmetic. Trees now tip over with an accelerating fall, a small landing bounce and a timed timber thud before settling into their log and stump. Wood splinters, leaves and dirt tumble, bounce against the terrain and settle briefly before fading. These effects pause with the game and remain cosmetic.

The trench landmarks add sectional destruction: brick farmhouse walls, a concrete bunker and an abandoned gun can take blast damage. Damaged wall sections lose height; destroyed sections disappear and leave low rubble that blocks movement and shots until further blasts clear it. The farmhouse roof patch and bunker slab collapse when too few tall supports remain. Excavated footing can also bring down unsupported sections. Dust, chunky fragments and collapse sounds accompany the change; flying fragments are cosmetic, while settled rubble is real cover. Restart restores everything.

Industrial buildings, bunkers, containers and concrete barriers retain their existing fixed geometry. Terrain remains a height field without enclosed tunnels; landmark roofs are separate supported box geometry. This is a sectional-collapse prototype rather than a general structural physics system. Explosion profiles keep soldier damage, structural damage and excavation settings separate.

Destruction events record the source, world revision, object health/stage, changed terrain samples and rebuilt patches. JSON snapshots include the accumulated world state. The renderer replaces only affected local terrain meshes/colliders and refreshes damaged cover; bots recalculate routes after changes.

## Artillery prototype

Press **Q** to open a quick tactical map, then click a broad **16 m sector** to request fire. Press Q again or right-click to cancel. The battle keeps moving; movement and crouch still work, while aiming/firing/throws are suppressed. The map shows the authored trench layout and your position, without live enemy markers. Mouse capture stays active during normal play, using a visible map cursor.

You can request artillery from the trench floor or behind cover. Calls are approximate: the salvo center may drift up to **6 m with a clear view**, or **10 m when blind**, followed by the existing **14 m shell scatter**. You cannot refine a call into a precise point. Range remains **15–70 m**, evaluated to the sector center; unavailable sectors are dimmed with a reason. Charge/cooldown and human-team ownership still apply. Map-edge impacts stay inside the battlefield.

Each team has one shared charge: first available **10 seconds** into the match, then **30 seconds** after each confirmed call. Death does not replenish it or cancel an ordered barrage. If a team has a human player, only that human can call its artillery, including while waiting to respawn. Teams made entirely of bots coordinate their own calls. In normal play this reserves Blue's charge for you; autoplay has no human-controlled soldiers, so both teams can call automatically.

An ordered barrage takes roughly **four seconds** to reach the battlefield, without an enemy countdown or ground warning ring. Listen for the actual incoming shells. Eight shells scatter within **14 m** of the target and land across the same **four-second first-to-last window**, with irregular gaps of roughly **0.23–0.93 seconds**. Visible shells descend in **0.8 seconds**, whistle, and burst on the first solid surface, including bunker roofs.

Each shell retains **240 maximum damage with a 12 m falloff radius**: an unshielded soldier can still be killed within roughly seven meters. Intact earth fully shields blocked bodies, and partial cover scales artillery damage by how much of the body is exposed. Moving off the firing step or crouching behind the lip offers strong protection; a direct hit inside the trench remains deadly. Craters are smaller: nominal **2.5 m radius / 1.3 m depth**, terrain reach 3.5 m and bank-cut depth 1.6 m. Irregular shape, dust, flying dirt, structural damage and repeated excavation remain. Fixed buildings/bunkers protect their foundations. Self damage applies; teammates and protected spawns retain grenade protection. Artillery dust is cosmetic; dedicated smoke grenades conceal vision.

Bots react to nearby physical shell flight and impacts, then seek earth cover or the screened rear shelter bays; they no longer know about calls before shells arrive. Survivors return to nearby intact stations. **Future request: creeping barrage**, a fire line that advances slowly forward; deliberately deferred.

Typed `artilleryCall`, `artilleryLaunch`, `artilleryImpact`, `artilleryEvade` and `artilleryEnd` events link mission/shell IDs; snapshots include team cooldowns, missions, shells and retreat state. Recorder summaries count calls, impacts and retreats. Runtime terrain cuts remain sparse/serializable with a revision-based numeric lookup cache for movement and rays.

### Stray heavy artillery

On Trench front, a single heavy shell also falls spontaneously every **8–22 seconds**, at irregular intervals. These land at random battlefield positions, independently of either team's calls, with no countdown or ground marker. Their blast radius is **24 m** (twice the guided shell's 12 m), with twice-size flash/dust and a roughly **5 m crater radius**, retaining the existing irregular shapes and cut depth. Peak damage stays 240; the larger radius carries damage farther. Intact earth still blocks blasts and partial exposure reduces damage. Heavy shells threaten both teams, preserve spawn protection, and award no kills or team points. They avoid the spawn assembly areas and never aim at a particular soldier. Team artillery charges and guided barrages are unchanged.

### Ground appearance

Trench front uses a continuous battlefield-sized material: broad irregular wet mud, lighter dry earth and sparse faded-green areas, with two differently rotated/scaled mud layers blended across them. Fine surface normals remain visible nearby without the former three-metre repeating color tile. Worn paths connect spawn approaches to rear entries and faint broken tracks cross the field. Thirty small cosmetic stones/clods sit near the approaches; up to nine shallow, glossy puddles fit inside existing hollows. Explosions remove affected dressing and reveal warmer, darker fresh-cut soil; authored old craters keep their weathered surface. This changes presentation without altering terrain heights, movement, blast rules or navigation.

## Crouching

**Press C** to crouch; press it again to stand. Crouch stays on after releasing the key and across pause/resume. Crouch walking is **2.25 m/s**, half normal walking speed, and holding Shift does not sprint while crouched. The soldier bends their knees, lowers their body/rifle and camera, and keeps their boots planted. There is no persistent stance status line.

Crouching changes the actual hit profile, bot sight/aim height, muzzle, grenade release and explosion cover checks. It hides a soldier below the parapet even on a firing step; rounds at standing head height pass overhead, while lower rounds can still hit. A lowered rifle strikes nearby cover normally, and blind tactical-map artillery requests remain available from cover.

Space stands the soldier to hop or mantle when there is clearance. Crouching waits until an airborne action finishes, then resumes if crouch is still toggled on. A solid overhead obstruction keeps the soldier crouched after toggling crouch off until there is room to stand. Adjacent earth banks are distinguished from ceilings. Death/respawn/restart reset stance. Commands/snapshots and typed `stance` transition events support recorded checks.

## Suppression, smoke and squad prototype

Press **F** to throw a smoke grenade: **two per spawn**, independent of your three G explosives. The canister uses the same swept/bouncing physics, starts releasing smoke after roughly 2.5 seconds once it lands, and creates a growing **6.5 m radius cloud lasting 20 seconds**, including buildup/fade. Smoke causes no damage or excavation. It blocks vision for both bot teams and artillery spotting, while bullets still pass through it. Bots immediately drop obscured targets and must reacquire/react after visibility returns. Close silhouettes can still be seen. Explosive-grenade/artillery dust is a separate cosmetic effect.

Enemy rounds passing within 1.8 m build suppression only along their unobstructed path. Solid cover, teammates and spawn protection are respected; a round can suppress each soldier once. Suppression recovers when incoming fire stops. Suppressed bots lose accuracy and may leave their firing steps for about 1.5 seconds before returning. Human players hear nearby cracks and get a subtle edge effect; their aim/movement stay under direct control. There is no persistent suppression status line.

In trenches, **groups of three or four bots** periodically screen an advance while most soldiers maintain covering fire. Groups wait for a smoke screen, mantle out, sprint to a crater, regroup, lay another screen, and try to reach the opposite front trench. Surviving soldiers who enter the opposing trench hold their forward position until death. Humans are never assigned automatic movement. Nearby physical shells and impacts can interrupt an advance so bots seek earth cover. Waves require enough healthy, armed soldiers at a suitable firing step; starts and outcomes vary with combat. A new launch window opens every 12–18 seconds when enough soldiers are ready. Up to two squads can overlap on different launch areas, with at most eight bots committed, holding forward positions, or still returning from the field. Nearby craters and existing smoke influence route choice. A surviving member takes over if the smoke carrier dies or is reloading. Soldiers wait for thick smoke before the first departure; once committed to a leg they finish the dash even if its screen fades. Survivors already in the field who have exhausted their smoke regroup for three more seconds, then risk an unscreened dash to the next cover. Failed groups do not receive free invulnerability or replacement smoke. Industrial retains its sector behavior.

Trench flags now score through domination. Smoke and covering fire create opportunities to cross and contest enemy flags. Forward respawns, healing and player squad commands remain future work.

Snapshots include smoke, suppression, duck state and squad plans/progress. Typed `smokeThrow`, `smokeBloom`, `smokeEnd`, `nearMiss`, `suppression`, `duck`, `assaultStart`, `assaultProgress` and `assaultEnd` events support log-only checks. Recorder summaries count smoke, pinned bots, assaults and crater/trench arrivals. Tests may set `assaults: false` to isolate the original stationary trench geometry; normal trench play enables assaults.

## Trench front prototype

Choose **Trench front** on the start screen, or open [the 50v50 trench map](http://localhost:5173/?map=trenches). Blue has you plus 49 bots; Red has 50 bots. Industrial remains the default 5v5 map.

The 160 × 128-meter battlefield has **four zigzag trench lines: two per team**. Each team enters its rear line from open-ground spawns, then follows short dogleg communication trenches into its front line. Blue has longer uneven stretches and setbacks; Red has more frequent, independently placed bends. Six alternate connections create short loops around earth islands, and six recessed 4 × 4 m shelter bays have screened, turning access from the rear lines. These are open-topped earth shelters: a direct shell can still kill. The six original communication routes bridge **16–20 m** between paired lines, with offset entrances and earth traverses blocking straight shots. Spawns remain behind the rear lines. **The front parapets are continuous: there are no ramps or walk-through exits into no man's land.** Rear entry ramps remain.

Support and communication trenches retain **2 m floor lanes**, with compact dogleg turns instead of broad junctions. Rounded bank shoulders open outward by roughly 0.65–0.8 m, softening the corners while keeping the floor narrow. Front firing trenches are **4 m across**, including a two-meter floor lane, a one-meter ramp and a one-meter firing step. The six rear shelter bays are smaller, and rear entry ramps are four meters across. Timber, duckboards, abandoned kit and bot routes follow the tighter layout.

The battlefield starts with **rolling ground and broad hollows**, across no man's land and the rear areas, plus six real shell craters and five shallow depressions. The broad landforms dip by up to about 0.95 m; rear rises reach roughly 0.3 m, while central crests stay low enough to preserve firing-step sightlines. Six larger 0.55–0.7 m shell bowls have rotated, uneven outlines, with nine smaller 0.18–0.24 m hollows overlapping their shoulders and the broad depressions. Scattered clods vary in size and angle, replacing identical blocks around circular rims. The six major bowls remain the bots’ starting cover anchors. Slopes blend back to level around trench lips, floors, steps, rear entry ramps, spawns and fixed cover. Movement, bullets and camera collision share the visible surface; foliage roots follow it. Grenades and artillery continue excavating this starting terrain, and restarting restores it.

Fifty distinct firing positions per side are spread along longer steps, with 1.2 m spacing. The short Blue setback keeps four positions. Spawn formations start five metres farther back to keep the larger roster off the entrance ramps.

Trenches are **2.4 m deep**, with **0.85 m firing steps** along the front edges. The floor conceals a standing soldier from the opposing trench. On a step, the head/helmet and raised rifle clear the parapet while the torso stays behind earth. Walk back off the step to shelter. Cover and visibility come from the actual world geometry; shots aimed below the parapet strike the bank.

Most bots hold individual firing positions inside their own front trench and aim at exposed heads. Small groups now use smoke to advance through crater cover and into the opposing front trench. Bots first notice an enemy in their view, build recognition and turn their rifle toward them; close movement or recent nearby gunfire can draw their attention outside that view. Recognition takes roughly 0.9–1.5 seconds, with additional time to turn. They aim from periodically sampled last-seen positions and imperfect movement estimates. Aim wanders, individual shots vary, and movement/suppression make it worse. They fire uneven groups of two or three semi-auto shots with pauses, and lose focus after 2–4 seconds for a 0.8–1.8 second reassessment. They stop firing when sight is lost and briefly search the last known position before reacquiring. Each soldier has different timings. Players use the same recoil system; bot aim drift remains separate. Trench scoring uses the four domination flags described above; kills remain individual statistics. Industrial retains A/B/C territory scoring. No man's land remains sparsely covered with two short sandbag remnants, wire patches, and shell scars.

Walk over a downward edge to fall naturally. Walk near an upward edge and press **Space** to mantle out. The prompt appears when facing a nearby ledge; movement direction takes priority while walking. A climb takes 1.2 seconds: approach, reach with the free right hand, pull up, cross with tucked knees, and stand on the ledge. The left hand stays on the tucked rifle. Foot/torso/head clearance and a stable landing are checked; firing/capturing pauses during the climb. When there is no valid mantle, Space gives a small hop (about 0.45 m high, half a second airborne), with a knee tuck and soft landing. Upward motion stops at ceilings; airborne presses do not trigger another hop. Hops retain normal horizontal collision, so they do not bypass banks or solid cover. Mantling climbs terrain banks rather than buildings or solid cover. Manual mantling still lets you deliberately go over the top, fully exposed; assault squads also mantle terrain edges through the same movement checks. The prototype retains the current assault rifle and visible traveling rounds; historical weapons are a separate design pass.

For a log-only 100-soldier test: `http://localhost:5173/?map=trenches&playtest=1&video=0&autoplay=1&duration=60&clip=120`. Snapshots include map ID, scoring mode, team size, elevation, and active mantle state; `mantle` events record start/end and both endpoints; `hop` events record takeoff/landing, and snapshots include active hop height/velocity. A death can interrupt a climb. `teamSize=1..50` changes the roster for experiments.

## Recorded playtests

Open `http://localhost:5173/?playtest=1&autoplay=1&duration=60` and begin the operation. A bot drives the player through the real rendered game and collision adapter. The game records up to 60 seconds at 1280×720/30 FPS; `clip=120` raises the limit to two minutes. Omit `autoplay=1` to record manual play with normal pointer lock.

When the run finishes, the panel provides **Save events.txt** for a readable simulation-time event list, **Save json** for commands/events/state, and **Save webm** (or MP4 when supported) when video is enabled. Save the artifacts under `playtest-artifacts/` for review. The video includes a diagnostic HUD and the game’s stereo audio; the HTML/CSS overlay itself is not captured. JSON includes every player command, typed events, one state snapshot per simulation second, frame timings, and runtime errors. Wall-time timestamps align samples with the video. This records the WebGL canvas and the game’s own audio mix, without desktop/microphone permissions, external upload, or a backend. Recording overhead affects frame timings; benchmark normal play separately. Unavailable video encoding falls back to diagnostics only.

This enables repeatable autonomous navigation/combat/capture runs. It supplements tests of real keyboard/mouse input, pointer lock, menus, and subjective combat feel. Local browser-control permission is still required for an agent to launch and inspect runs; the recorder does not bypass it.

Chrome direct input, native video export, a full rendered autoplay match, and restart were verified on November 1, 2026. See [PLAYTEST_REVIEW.md](PLAYTEST_REVIEW.md) for recordings, measurements, the capture-cadence correction, and remaining acceptance checks.

For simulation checks without video, open `http://localhost:5173/?playtest=1&video=0&autoplay=1&duration=40`. Begin the operation, then use **Save events.txt** or **Save json** when it finishes. This skips canvas capture and MediaRecorder entirely. Omit `autoplay=1` to collect direct input instead. Events include simulation ticks/times, projectile IDs, fire/impact, damage, death/respawn, reload, capture, score, and results. JSON snapshots include all active projectile positions and velocities. The normal bounded clip limit still applies to log-only runs.

## Rules and architecture

All simulation uses 30 Hz ticks, plain serializable state, shared human/bot commands, typed events, and an injected collision boundary. `simulation.ts` runs in Node without PlayCanvas or a DOM. `map.ts` is the shared geometry and objective definition. `rendering.ts` adapts PlayCanvas/Ammo and procedural models. `main.ts` owns browser input, menus, audio, and the frame accumulator.

Industrial starts on flat ground with axis-aligned obstacles. Both maps support runtime grenade excavation. The trench map adds a shared height field, recessed floors, firing steps, and inclined ramps. Movement uses a conservative swept footprint with short substeps and wall sliding; static PlayCanvas/Ammo colliders handle line of sight, bullets, and camera queries. Soldier hit volumes are simulation-owned spheres approximating a capsule. Rendering never determines damage, reload, or capture timing. A future server needs its own trusted collision implementation, command validation, and networking.

Capture requires ten seconds from neutral to ownership; enemy sectors require ten seconds of neutralization followed by ten seconds of capture. Empty progress persists, both teams pause it, and defenders reverse neutralization. There is no capture speed bonus for extra soldiers. Dead soldiers cannot capture. Respawn protection lasts two seconds, permits capturing, and ends upon firing. Rifle rounds visibly travel at 64 m/s, expire after 60 meters, and deal damage on impact. Teammates block rounds without taking damage; protection is checked when the round arrives. Reserve ammo is finite until respawn.

## Local release scope

Primitive art, articulated block soldiers with bending knees/elbows, walking and sprinting motion, synthesized audio, two selectable maps, one rifle and throwable grenades. No backend, runtime CDN assets, deployment, accounts, progression, minimap, or kill feed. Hosting is deferred. Dependencies are locked; the Ammo package includes its own embedded runtime.

Use a WebGL 2 desktop browser. Manual release verification should include Chrome and Firefox, an eight-minute match, restarts, pointer-lock loss, movement against every obstacle, close-cover shooting, and 1080p frame/memory profiling on the target machine. Passing unit tests does not establish a GPU performance guarantee.
