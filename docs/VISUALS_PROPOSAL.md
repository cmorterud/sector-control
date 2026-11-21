# Visuals proposal

Proposal, November 20, 2026. **Status: phase 1 implemented; phases 2–6 proposed.** Phase 1 is in `src/map-look.ts` (per-map moods), `src/sky.ts` (generated sky), `src/room-light.ts` (baked room shading), `src/graphics-quality.ts` (quality levels and Auto) and `Renderer.buildSky` / `Renderer.setQuality` in `src/rendering.ts`, with tests in `src/visual-look.test.ts`.

The aim is a game that looks deliberate and atmospheric rather than unfinished. It should keep its stylized, generated-in-code look (no accounts, no asset pipeline). It must stay smooth on an ordinary laptop: Village front already runs well in Chrome on the owner's Mac, so there is some headroom, but not unlimited.

## Phase 1 results

Each map now has its own sun, sky, fog and colour grade. One generated sky cubemap per map is both the visible sky and the ambient light: shade facing the sky is bluer, and surfaces facing the ground get a warm bounce. Rooms in kit buildings are darker away from their windows and doors. On Medium and High, PlayCanvas's `CameraFrame` adds Neutral tone mapping, the grade, a light vignette and ambient occlusion. Cascaded shadows reach 90 m on Medium and 120 m on High.

Frame rate in a live 50-a-side Village front battle, measured in headless Chrome on the owner's Mac (Apple M3, Metal) at 1920 × 1080, in 40–60 s runs:

| Build | Average fps | 95th-percentile frame |
| --- | --- | --- |
| `main` before phase 1 | 48–54 | 16.8–33.4 ms |
| Low | 51–55 | 16.8 ms |
| Medium | 54 | 16.8 ms |
| High | 37–49 | 33–50 ms |
| Auto (settled at Medium) | 54.6 | 16.8 ms |

What this shows:
- **Low and Medium cost nothing measurable** against the old renderer.
- **High is too heavy for this Mac under sustained load.** Each part alone (full-resolution ambient occlusion, 4× multisampling, three cascades) costs only 1–3 fps, but together they slow down further over a few minutes, which looks like a fanless laptop GPU throttling. High is for stronger machines, and Auto keeps this one on Medium.
- The proposal's target of 60 fps average was unrealistic: headless Chrome at 1080p doesn't reach it even on the old renderer. The working target is therefore "Auto's level costs nothing against `main`", and it is met.

What differs from the plan:
- **Auto** starts at High. It steps down while the median frame is over 20 ms, or, at High only, while more than 8% of frames take over 25 ms. A level must pass six 4-second windows in a row, about half a minute of play, to be kept. The result is stored in the browser as `auto:<level>`. At Medium and Low, hitches are the simulation's own, so they don't count there.
- **The sky arrived in phase 1,** because the ambient light comes from it: a gradient, clouds and a sun glow per map. Phase 2 keeps the backdrop ring, height fog and soft boundaries.
- **Two cubemaps.** The lighting copy is 1.35 times brighter than the visible sky, so shaded faces aren't near black while the sky keeps its colour.
- **Rifle steel and puddles reflect less.** With sky reflections, the old specular made rifle steel read as chrome and puddles as ice.
- **Kit-building pieces no longer share meshes,** since each bakes its own room light. Batching still merges them, so draw calls are unchanged. The bake doesn't update when walls are breached.

## How it looks today

The evidence is the CI renders from `main` (`render-village`, `render-verdun`), `public/previews/` and playtest screenshots.

- **Flat light.** Every map except Industrial uses the same overcast setup: a weak sun (intensity 0.85, shadows at 65% strength, out to 50 m), one flat ambient colour and linear grey fog. There is no tone mapping, environment lighting or ambient occlusion. Surfaces facing away from the sun all get the same grey-blue fill, so rooms, trench walls and corners all read at the same brightness.
- **Interiors look like the outside.** The manor's rooms (`detail-manor-room.png`) are evenly lit from wall to wall. Nothing darkens into corners or away from windows, so rooms don't feel enclosed.
- **Hard, empty horizon.** The ground ends in a straight line against a plain sky. Distant buildings stand on a featureless plain with nothing beyond them. Playtesters already asked for "softer, more natural map boundaries".
- **Visible tiling.** The cobbled streets show a regular dark grid from the repeating 1.6 m tile, which is obvious in third person and from above.
- **Box edges everywhere.** Props, weapons and buildings are made of sharp-edged boxes. With no bevels there are no edge highlights, and the first-person rifle in particular looks blocky.
- **Thin effects.** Smoke is a pale blob, puddles are flat dark discs, and explosions and muzzle flashes don't light anything around them.

What already works and should be kept: the generated plaster, timber and floorboard textures; the furnished interiors; the soldiers' readable silhouettes; the Verdun forest; the soft sun shadows.

## Constraints

- **Generated in code.** Textures, skies and backdrops are generated procedurally, as now. Bringing in CC0 textures is an open decision, below.
- **Simulation stays untouched.** All changes are in `src/rendering.ts`, `src/architecture-geometry.ts`, `src/battlefield-look.ts` and new render-only modules. Collision, navigation and headless tests don't change.
- **A quality setting.** A new "Graphics" select (Low / Medium / High, plus `?quality=`) gates every costly effect. Low must be no slower than today. CI's software renderer uses Low for its gameplay checks and High for one screenshot set.

## Proposed phases

Ordered by how much they change the look for the work involved.

### 1. Light and colour

The biggest single improvement, mostly configuration of what PlayCanvas 2.23 already provides.

- **Tone mapping and grading.** Use `CameraFrame` (in the installed engine) for ACES or Neutral tone mapping, a per-map colour grade and a light vignette. Brighter sun, deeper shade, no washed-out greys.
- **Sky-based ambient light.** Render the procedural sky into a small cubemap at load and use it as the environment (`envAtlas`). Ambient light then comes from the sky above and warm ground bounce from below, instead of one flat colour, and metal and wet surfaces pick up soft reflections.
- **Ambient occlusion.** Screen-space AO from `CameraFrame` (Medium and High) darkens corners, contact points under carts and benches, trench floors and room edges.
- **Baked room shading for kit buildings.** At build time, compute a sky-visibility value per face from the building's own boxes: darker deep inside rooms and under stairs, brighter near windows and doors. Store it as vertex colour. It costs nothing per frame and works on Low.
- **Cascaded shadows.** Two or three cascades out to about 120 m, so the manor and distant houses cast shadows instead of only the nearest 50 m.
- **A mood per map,** replacing the shared overcast:

  | Map | Mood |
  | --- | --- |
  | Trench front | Cold grey dawn, low mist in no man's land |
  | Verdun sector | Overcast late morning, green-grey haze between trees |
  | Village front | Warm late afternoon, long shadows down the streets |
  | Lighthouse point | Bright coastal light, clear distance, sea glare |
  | Industrial | Smoky, hazy noon |

### 2. Sky and horizon

- **Proper skies.** Replace the near-uniform overcast sphere with a generated sky per map: a gradient, cloud layers, a sun glow matching the sun light's direction, and slow cloud drift.
- **A backdrop ring.** Low rolling terrain outside the play area, rising gently toward the horizon. It carries generated silhouettes: treelines, a distant church spire, farm roofs, a ruined windmill, and on the front maps a few distant smoke columns and the occasional far-off artillery flash. These are cheap, unlit, fogged meshes with no collision.
- **Height fog.** Exponential fog that is thicker low down, replacing the linear grey wall, so valleys and no man's land hold mist while rooftops stay clear.
- **Soft boundaries.** Hedgerows, wire and rubble along the playable edge, so the boundary reads as a place rather than a cut-off.

### 3. Surfaces

- **Break the tiling.** Sample cobble, paving and ground textures at two scales with per-tile rotation and colour variation, so the grid disappears.
- **Weathering.** A darker, damp band at the foot of exterior walls; streaks under windowsills; moss and colour variation on roofs; scuffed floorboards along walking routes.
- **Puddles.** Soft-edged, reflective (from the sky cubemap), with a ripple normal map, replacing the flat discs.
- **Battle marks.** Scorch decals that stay on craters, mud splashes on nearby walls after explosions, and tracks along the most-walked routes.

### 4. Silhouettes and props

- **Bevelled boxes.** Add a small chamfer option to `box-geometry.ts` and use it on props, furniture, trim and weapons. A 1–2 cm edge catching the light is the cheapest way to make a box-built world look finished. Large wall panels stay sharp to keep triangle counts down.
- **First-person weapons.** Bevelled parts, separate wood and blued-metal materials with proper specular, and a slight lighting boost for the viewmodel so it doesn't go black in shade.
- **Village vegetation.** Fuller, irregular orchard and street trees, and instanced grass tufts and weeds near the camera, extending what Lighthouse point already does.

### 5. Effects

- **Lights from fire.** Muzzle flashes, explosions and burning ruins briefly light their surroundings, using PlayCanvas clustered lighting with a hard cap (for example 8 short-lived lights) on Medium and High.
- **Smoke and dust.** Soft particles that fade into geometry instead of clipping, lit by the sun, drifting with a shared wind direction. Explosions throw a dust ring, and smoke shells billow.
- **Material-specific impacts.** Brick dust on masonry, splinters on timber, a dirt spray on ground, and a spark on metal.
- **Ambient life.** Drifting ash on the front maps, birds over Lighthouse point, and smoke from village chimneys while a house is intact.

### 6. Soldiers

- Faction detail within the current stylized rigs: helmet shapes, webbing and pouches, puttees, and greatcoats on Trench front. There is a per-faction colour pass already.
- Muddier uniforms the longer a soldier has been alive, as a cheap shader parameter.

## How each phase is proven

- **Same-shot comparisons.** The render check already captures fixed views per map (overview, first person, third person, Village details). Each phase's PR includes before and after images of the same views, and the High screenshot set becomes part of the render artifacts.
- **Performance on real hardware.** A live 50-a-side Village front battle in Chrome on the owner's Mac, measured with the playtest summary: the level Auto settles on costs nothing measurable against the previous build. Low must never be slower than it. (The original target of 60 fps average on High was revised after phase 1; see Phase 1 results.)
- **No gameplay change.** The full headless test suite passes unchanged, and the simulation files don't change.
- **Readability.** Enemies remain easy to spot at 50 m in every map's mood. That's checked in the third-person screenshots, and the grade is adjusted if contrast drops.

## Recommendation

Start with **phase 1 plus the quality setting**. It changes every screenshot, is mostly engine configuration plus one build-time bake, and makes the later phases look better too, since reflections, smoke and puddles depend on good light. Then phase 2, which answers existing playtest feedback, and phase 5, which is most visible in a fight. Phases 3, 4 and 6 are polish and can come in any order.

## Decisions

Agreed November 20, 2026:
1. **Clean, stylized art direction.** Add light and atmosphere rather than gritty realism.
2. **One fixed mood per map** for now. A time-of-day choice can follow if the fixed moods work.
3. **Generated textures only.** A single CC0 ground texture remains a possible exception later.
4. **Auto quality** from real frame times, remembered per browser, with Low / Medium / High in the briefing.
