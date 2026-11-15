# Village Front outdoor pass

November 15, 2026. Addresses the user's observation that open stretches feel barren and require uneventful sprinting. The nine buildings, five flags, two-story manor, street widths and deployment positions retain their layout. The work gives the existing spaces distinct uses and intermediate cover instead of expanding the map or adding more large buildings.

## Outdoor rooms and routes

Ten authored yard areas: the school/aid-post yard, carriage yard, inn courtyard, baker's working yard, manor forecourt and rear kitchen garden, forge yard, farm orchard, cottage vegetable garden and post-office delivery court. Cobble, subdued gravel and furrowed planting soil bake into the existing deformable ground atlas. Thirty-six worn door-to-street paths match the real doorway offsets, including buildings with an even number of wall modules. They are reserved from new cover placement.

Low benches, worktables, raised planters, supply crates, carts, timber stacks and a stone trough make the yards readable and useful. The manor garden has two short fences with its center left open. Supply positions break up the flank approaches; staggered timber cover sits on both sides of the manor without narrowing carriage roads. Twelve small sparse-crowned orchard/yard trees use the existing tree damage and felling rules. Small fern/grass planting uses shared meshes in regional scenery batches and disappears with excavation.

New furnishing footprints stay at least 1.6 m from house walls, off the full width of the roads and away from doorway paths and deployment centers. Standing sightlines remain open over the new low cover. Timber stacks and trestles have one coarse collider each, not a collider per log or plank. Wood cover is cleared by direct grenades; the stone trough survives a grenade-sized hit better and can be broken by a direct artillery impact. Existing structural blast damage and artillery availability are unchanged.

## Rendering and destruction

Yard color/roughness/normal detail shares the ground atlas and the existing fresh-earth cut mask, so artillery exposes dirt instead of leaving paving or planting floating over a crater. Paved courts use paving footsteps until excavated. There are no separate yard-floor meshes, per-frame yard updates or dynamic rigid bodies. Other maps retain the original five-channel ground-field buffer; only Village allocates the gravel/garden channels. Timber, table and trough primitives use shared materials and regional cover batches. The selection card remains a labeled layout illustration, now including yards, paths and outdoor cover.

## Verification

Regressions cover road/door clearances, bounded geometry and collision envelopes, native material/parent cleanup, cover at crouch versus standing height, blast destruction, dirt/footsteps after excavation, deterministic low planting and actual soldier movement from both deployments to all five flags. `tools/village-outdoor-audit.ts` measures route travel and intervals without nearby solid cover; it is a proximity diagnostic, not an enemy visibility or safety model. It excludes earthen trench protection, so it can label sheltered approach ground as uncovered.

Browser inspection was attempted, but the computer-use host still cannot start. Rendered appearance, an actual screenshot preview and controlled GPU/frame-time comparisons remain outstanding. Do not treat geometry counts, simulation CPU timings or a layout illustration as rendered acceptance.

Final route audit: all ten actual soldier routes finish in 10.33–22.63 seconds. Central C takes 13.03 s / 13.17 s from the two deployments, unchanged from before the pass. The longest sampled interval without a solid within 5.5 m falls from 39.22 m to 22.60 m; the mean of the ten route maxima falls from 26.35 m to 19.13 m. This is cover proximity, with the trench limitation above, not proof of player safety. The pass adds 48 static cover envelopes (2,974 authored boxes total) and 12 trees (26 total).

Simulation-only bombardment audit: 120 s, 100 soldiers, 847 shots, 160 deaths, five captures, 71 impacts, both teams in the village and six soldiers upstairs. A separate 55-impact support-failure audit removes all 880 manor parts into 25 rubble envelopes; all five flags remain reachable. Maximum sampled destruction CPU call: 36.23 ms. This is not rendered frame time and is not a controlled performance comparison with older runs.

Final local regression run: **512 tests / 94 files pass in 151.36 s**, including the revised exposed-post fixture and all original movement, mantle, stairs, architecture, destruction and map regressions. Strict TypeScript and the Pages production build pass (`index-C0B1dt9b.js`).
