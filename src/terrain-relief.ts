import {
  baseGroundHeight,
  terrainResolution,
  terrainPatchSize,
  type Depression,
  type MapDefinition,
  type TerrainRelief,
} from "./map";

// Author only depressions in the central field. Three meters of untouched earth
// remain before the nearest front parapet, and existing cover keeps level footing.
export function buildTrenchRelief(
  map: MapDefinition,
  depressions: Depression[],
): TerrainRelief {
  const cuts: Record<string, number> = {},
    patches: Record<string, true> = {};
  const smooth = (t: number) => {
    const u = Math.max(0, Math.min(1, t));
    return u * u * (3 - 2 * u);
  };
  for (const depression of depressions)
    for (
      let ix = Math.ceil(
        (depression.x - depression.radiusX) / terrainResolution,
      );
      ix <= Math.floor((depression.x + depression.radiusX) / terrainResolution);
      ix++
    )
      for (
        let iz = Math.ceil(
          (depression.z - depression.radiusZ) / terrainResolution,
        );
        iz <=
        Math.floor((depression.z + depression.radiusZ) / terrainResolution);
        iz++
      ) {
        const x = ix * terrainResolution,
          z = iz * terrainResolution;
        const r2 =
          ((x - depression.x) / depression.radiusX) ** 2 +
          ((z - depression.z) / depression.radiusZ) ** 2;
        if (r2 >= 1 || Math.abs(x) >= 15 || Math.abs(z) >= map.depth / 2 - 2)
          continue;
        if (baseGroundHeight(x, z, map) < map.terrain!.bankHeight - 0.01)
          continue;
        let protection = smooth((15 - Math.abs(x)) / 3);
        for (const box of map.boxes) {
          const distance = Math.hypot(
            Math.max(0, Math.abs(x - box.x) - box.w / 2),
            Math.max(0, Math.abs(z - box.z) - box.d / 2),
          );
          protection = Math.min(protection, smooth((distance - 0.75) / 1.5));
        }
        const amount = depression.depth * (1 - r2) ** 2 * protection;
        if (amount < 0.0001) continue;
        const key = `${ix},${iz}`;
        cuts[key] = Math.min(0.85, (cuts[key] ?? 0) + amount);
        for (const dx of [-terrainResolution, terrainResolution])
          for (const dz of [-terrainResolution, terrainResolution])
            patches[
              `${Math.floor((x + dx) / terrainPatchSize)},${Math.floor((z + dz) / terrainPatchSize)}`
            ] = true;
      }
  const originX = -16 / terrainResolution,
    originZ = -map.depth / 2 / terrainResolution;
  const columns = 32 / terrainResolution + 1,
    rows = map.depth / terrainResolution + 1;
  const values = new Float32Array(columns * rows);
  for (const [key, depth] of Object.entries(cuts)) {
    const [x, z] = key.split(",").map(Number);
    values[(z - originZ) * columns + x - originX] = depth;
  }
  return { cuts, patches, grid: { originX, originZ, columns, rows, values } };
}
