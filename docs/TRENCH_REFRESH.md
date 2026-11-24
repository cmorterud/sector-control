# Trench front refresh

A six-phase pass on Trench front for immersion and look, plus an out-of-bounds rule. The fought-over 160 × 128 m sector, its flags, bank heights, firing steps and sightlines are unchanged throughout.

## What changed

| Phase | PR | Change |
|---|---|---|
| 1 | #40 | Dead zone around the sector, boundary wire belt, five-second out-of-bounds countdown and salvo, trench blocks |
| 2 | #41 | Backdrop to the horizon: rolling ground, continuing trench lines, woods, ruins, poles, balloons, smoke, distant bursts and flares |
| 3 | #42 | Lower, warmer dawn sun; mist banks; brazier and crater smoke; cloth on the wire; trench soundscape |
| 4 | #43 | Parados sandbags, faction revetments, dugouts, signboards, props, cable, sump water |
| fix | #44 | Mirrored ground texture on the backdrop, 16 m dead zone so terrain patches tile exactly |
| 5 | #46 | Owned wire belts in no-man's land that blasts cut, crater ponds, debris |
| 6 | this PR | Churned mud in no-man's land and beside trenches; straw-dead grass on the rear ground |

## Rules and numbers

- **Terrain:** 192 × 160 m, with `playArea` 160 × 128 m. Bots, artillery targeting, ambient shells, the minimap and the tactical map all use `playArea(map)`.
- **Out of bounds:** leaving the play area starts a 150-tick countdown. At zero, three shells land along the wire at +0, +6 and +12 ticks, the last on the soldier, repeating every 45 ticks. A full second back inside clears it. It credits no one.
- **Boundary wire:** a 3 m belt just outside the play area. Inside it soldiers move at 1.8 m/s and cannot hop; they can mantle only sideways or back toward the line. From inside the sector no mantle lands beyond the play area, so the trench blocks cannot be vaulted outward.
- **No-man's land belts:** 4 m segments, 9.5 m in front of each front line's centre, with gaps within 4 m of z −33, 35 and −1 (Blue) and −27, 31 and −1 (Red). Only the enemy is slowed. A shell cuts segments within 2.4 m, a grenade within 1.4 m.
- **Distant bursts:** one per 150-tick slot at 150–260 m, on a fixed timetable from the match tick. The rumble is delayed by distance at 343 m/s.

## Where the code lives

- `src/boundary.ts`, `src/boundary-wire.ts`: the countdown and the boundary belt geometry.
- `src/backdrop.ts`: ground ring, continuing trenches, silhouettes, burst and flare timetables. `backdropBoxMesh` is the shared vertex-coloured box mesher.
- `src/atmosphere.ts`: mist banks, brazier sites, cloth scraps. Enabled per map through `MapLook.atmosphere`.
- `src/trench-dressing.ts`: parados bags, revetment styles and textures, dugouts, signboards, props.
- `src/no-mans-land.ts`: belt geometry, crater ponds, debris.
- `src/ground-surface.ts`: `trenchChurn` and the Trench front grass tint.

Everything outside `boundary.ts`, `map.ts` and the wire checks in `simulation.ts` and `destruction.ts` is presentation only: no colliders, no navigation.

## Lessons worth keeping

- **Half extents must be multiples of 8 m.** Terrain patches start at whole multiples of 8. A 184 m wide map made the outer patches overhang its edge.
- **The ground material is one clamped map-sized texture.** Geometry beyond the map must mirror its texture coordinates back in (`mirrorIntoMap`) and take tangents from unmirrored coordinates.
- **Flat translucent sheets make bad mist.** Seen from above they wash out everything beneath them. Billboards that hide within 7 m of the camera work.
- **Wire that slows everyone punishes the defenders' own assaults.** Belts are owned for that reason; seeded battles stayed balanced only after the change.
- **Judge light on a real GPU.** CI's software renderer shows shade far brighter than real hardware does. The first look was tuned against CI screenshots and came out crushed to black inside the trenches. `detail-firing-step` is the view to check.
- **One quad per entity adds up.** Mist, smoke and cloth were about 225 separate draws. They are now a handful of dynamic meshes (`src/billboards.ts`), with fades carried in vertex alpha instead of per-frame material updates. The perf log's `drawables` gauge counts mesh instances, which compares across machines where frame times do not.
- **Bot matches are nearly deterministic.** The seed barely changes them, so a seeded match is one sample, not many.

## Validation

Each phase ran the full Vitest suite, the Pages tests, a production build and the Trench front render check, which now also walks the player out through the wire and asserts the warning and the boundary death. Close-ups saved by CI in the `render-trenches` artifact: `detail-boundary-wire`, `detail-trench-block`, `detail-trench-dugout`, `detail-trench-sign`, `detail-no-mans-land`, `boundary-warning`.
