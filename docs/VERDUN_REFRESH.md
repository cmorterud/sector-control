# Verdun refresh

Trench front's refresh (docs/TRENCH_REFRESH.md), carried over to Verdun, plus denser woods. The fought-over 208 × 128 m field, its five flags, trenches, routes and sightline breaks are unchanged throughout.

## What changed

| Phase | PR | Change |
|---|---|---|
| 1 | #67 | 16 m dead zone around the field, boundary wire belt, five-second out-of-bounds countdown and salvo |
| 2 | #68 | Woods carried on past the wire, hill country to the horizon, a ruined village and a fort on a ridge, balloons, smoke, distant bursts and flares |
| 3 | #69 | Mist through the woods and in the trenches, brazier and crater smoke, cloth on the wire, a lower overcast sun |
| 4 | | Parados bags, French and German revetments, dugouts, French and German signboards and props for the 2 m trenches |
| 5–6 | | Owned wire belts in front of the front lines, water in the shell scars, debris, and churned ground where the field was fought over |
| 7 | | Denser flank belts and central groves, and more trees past the wire |

## Rules and numbers

- **Terrain:** 240 × 160 m, with `playArea` 208 × 128 m. Nothing inside the play area moved when the dead zone was added: ground heights, cover, navigation and a seeded battle all matched.
- **Out of bounds:** the same rule as Trench front (`src/boundary.ts`). Bots dodging a barrage only run for cover inside the play area.
- **Wire belts:** 4 m segments about 6 m in front of each front line's centre, owned by that side. A segment is left out where a dug sap, route, ramp or trench comes within 2 m, a trunk stands on its wire, or a flag is within 9 m. The flags sit forward of the wire, so in bot matches it changes nothing.
- **Woods:** 313 field trees (180 in the flank belts, 133 in the central groves), up from 235. Three broad breaks across the centre stay fully open and standing sightlines across it are unchanged. Past the wire, about 176 trees continue the belts; beyond the terrain, about 1,900 low-poly silhouettes.

## Where the code lives

- `src/verdun-map.ts`: play area, boundary, wire belts, `noMansLand` settings.
- `src/verdun-forest.ts`: the field's trees; `woodlandDensity`.
- `src/verdun-backdrop.ts`: trees in the dead zone, silhouettes, the village and fort.
- `src/backdrop.ts`: per-map relief, `crown` and `spire` shapes, `continuingFront`, `backdropLife`.
- `src/atmosphere.ts`: mist banks over a per-map field width.
- `src/trench-dressing.ts`: per-line trench floors (`TrenchLine.floor`), faction revetments and signboard names.
- `src/no-mans-land.ts`: scar ponds and a per-map debris band.
- `src/ground-surface.ts`: `fieldChurn`, baked once per map on a 0.5 m grid.

As on Trench front, everything outside the boundary rule and the wire checks is presentation only: no colliders, no navigation.

## Lessons worth keeping

- **Size the forest by the play area, not the terrain.** The tree generator scattered across the terrain width; growing the terrain would have moved every tree.
- **A bigger terrain removes an old wall.** Bots dodging artillery picked escape points on a 24 m ring that the old terrain edge used to rule out. With a dead zone they ran into it and were shelled.
- **Carry density from inside the field.** Woodland density is already near zero at the field's edge, so the dead zone samples it 8 m inside.
- **Bake per-texel rules onto a grid.** The ground texture samples its churn for every texel; a 0.5 m grid made the cost vanish.
- **Kill vitest's workers, not just its runner.** Stopping a long scratch run left its fork workers playing matches with no parent.

## Validation

Each phase ran the full Vitest suite, the Pages tests, a production build, the Verdun render check (which walks out through the wire to the boundary death) and real-GPU captures in local Chrome on an Apple M3.
