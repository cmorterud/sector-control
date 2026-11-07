import {
  baseGroundHeight,
  terrainResolution,
  terrainPatchSize,
  type Depression,
  type MapDefinition,
  type TerrainRelief,
  type TerrainElevation,
} from "./map";

const smooth = (t: number) => {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
};

// Broad, fixed landforms sampled on the existing mesh grid, rather than refining
// the entire battlefield to crater resolution. No gameplay RNG or runtime noise.
export function buildTrenchElevation(map: MapDefinition): TerrainElevation {
  const terrain = map.terrain!,
    spacing = 2,
    originX = -map.width / 2,
    originZ = -map.depth / 2,
    columns = map.width / spacing + 1,
    rows = map.depth / spacing + 1,
    values = new Float32Array(columns * rows);
  const distanceToRect = (
    x: number,
    z: number,
    rect: { x: number; z: number; w: number; d: number },
  ) =>
    Math.hypot(
      Math.max(0, Math.abs(x - rect.x) - rect.w / 2),
      Math.max(0, Math.abs(z - rect.z) - rect.d / 2),
    );
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < columns; col++) {
      const x = originX + col * spacing,
        z = originZ + row * spacing;
      let clearance = 8;
      const cx = Math.floor((x + map.width / 2) / terrain.cellSize),
        cz = Math.floor((z + map.depth / 2) / terrain.cellSize);
      for (
        let iz = Math.max(0, cz - 4);
        iz <= Math.min(terrain.rows - 1, cz + 4);
        iz++
      )
        for (
          let ix = Math.max(0, cx - 4);
          ix <= Math.min(terrain.columns - 1, cx + 4);
          ix++
        ) {
          if (
            terrain.heights[iz * terrain.columns + ix] >=
            terrain.bankHeight - 0.01
          )
            continue;
          clearance = Math.min(
            clearance,
            distanceToRect(x, z, {
              x: originX + (ix + 0.5) * terrain.cellSize,
              z: originZ + (iz + 0.5) * terrain.cellSize,
              w: terrain.cellSize,
              d: terrain.cellSize,
            }),
          );
        }
      let protection = smooth((clearance - 2) / 4);
      for (const ramp of terrain.ramps)
        protection = Math.min(
          protection,
          smooth((distanceToRect(x, z, ramp) - 2) / 4),
        );
      for (const box of map.boxes)
        protection = Math.min(
          protection,
          smooth((distanceToRect(x, z, box) - 2) / 3),
        );
      for (const spawn of Object.values(map.spawn))
        protection = Math.min(
          protection,
          smooth((Math.hypot(x - spawn.x, z - spawn.z) - 9) / 5),
        );
      protection = Math.min(
        protection,
        smooth(
          (Math.min(map.width / 2 - Math.abs(x), map.depth / 2 - Math.abs(z)) -
            1) /
            5,
        ),
      );
      const rolling =
        0.42 * Math.sin(x * 0.15 + z * 0.067 + 0.5) +
        0.3 * Math.sin(z * 0.155 - x * 0.08 + 2.1) +
        0.13 * Math.sin(x * 0.37 + z * 0.25) -
        0.24;
      // Keep crests below the firing-step muzzle line in no man's land. Larger
      // rear-ground rises blend in outside the front lines; hollows carry most
      // of the visible relief across the exposed central field.
      const crest = 0.06 + 0.26 * smooth((Math.abs(x) - 30) / 22);
      values[row * columns + col] =
        (rolling > 0
          ? crest * Math.tanh(rolling / crest)
          : Math.max(-0.95, rolling)) * protection;
    }
  return { originX, originZ, spacing, columns, rows, values };
}

// Author only depressions in the central field. Three meters of untouched earth
// remain before the nearest front parapet, and existing cover keeps level footing.
export function buildTrenchRelief(
  map: MapDefinition,
  depressions: Depression[],
): TerrainRelief {
  const cuts: Record<string, number> = {},
    patches: Record<string, true> = {};
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
