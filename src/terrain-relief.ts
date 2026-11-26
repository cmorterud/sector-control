import {
  baseGroundHeight,
  playArea,
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

// A few broad lobes break the outline without creating sharp, unwalkable teeth.
export function scarEdge(scar: Depression, angle: number) {
  if (!scar.irregularity) return 1;
  const phase = scar.phase ?? 0;
  return (
    1 +
    (scar.irregularity ?? 0) *
      (0.65 * Math.sin(angle * 3 + phase) +
        0.35 * Math.sin(angle * 5 - phase * 1.7))
  );
}

export function scarRubble(scar: Depression) {
  const sample = (i: number) => {
    const n =
      Math.sin((i + 1) * 127.1 + scar.x * 17.3 + scar.z * 43.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const rotation = scar.rotation ?? 0,
    c = Math.cos(rotation),
    s = Math.sin(rotation);
  return Array.from({ length: 5 }, (_, i) => {
    const angle = ((i + sample(i) * 0.7) * Math.PI * 2) / 5,
      radius = scarEdge(scar, angle) * (0.82 + sample(i + 5) * 0.3),
      x = Math.cos(angle) * scar.radiusX * radius,
      z = Math.sin(angle) * scar.radiusZ * radius;
    return {
      x: scar.x + x * c - z * s,
      z: scar.z + x * s + z * c,
      w: 0.2 + sample(i + 10) * 0.4,
      h: 0.1 + sample(i + 15) * 0.16,
      d: 0.2 + sample(i + 20) * 0.3,
      yaw: sample(i + 25) * 180,
    };
  });
}

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
        let iz = Math.max(0, cz - Math.ceil(8 / terrain.cellSize));
        iz <= Math.min(terrain.rows - 1, cz + Math.ceil(8 / terrain.cellSize));
        iz++
      )
        for (
          let ix = Math.max(0, cx - Math.ceil(8 / terrain.cellSize));
          ix <=
          Math.min(terrain.columns - 1, cx + Math.ceil(8 / terrain.cellSize));
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
      let protection = smooth((clearance - 3) / 4);
      for (const ramp of terrain.ramps)
        protection = Math.min(
          protection,
          smooth((distanceToRect(x, z, ramp) - 2) / 4),
        );
      for (const box of map.boxes.filter((b) => !b.landmark))
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
          (Math.min(playArea(map).width / 2 - Math.abs(x), playArea(map).depth / 2 - Math.abs(z)) -
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
// Depressions are cut only within `half` metres of the centre line (Trench
// front's 32 m no-man's land by default; Verdun's wider field between its
// front lines), fading out over the last few metres before the trenches.
export function buildTrenchRelief(
  map: MapDefinition,
  depressions: Depression[],
  half = 16,
): TerrainRelief {
  const cuts: Record<string, number> = {},
    patches: Record<string, true> = {};
  const authored: MapDefinition = {
    ...map,
    terrain: { ...map.terrain!, relief: undefined, elevation: undefined },
  };
  for (const depression of depressions) {
    const rotation = depression.rotation ?? 0,
      c = Math.cos(rotation),
      s = Math.sin(rotation),
      extentX =
        Math.hypot(depression.radiusX * c, depression.radiusZ * s) *
        (1 + (depression.irregularity ?? 0)),
      extentZ =
        Math.hypot(depression.radiusX * s, depression.radiusZ * c) *
        (1 + (depression.irregularity ?? 0));
    for (
      let ix = Math.ceil((depression.x - extentX) / terrainResolution);
      ix <= Math.floor((depression.x + extentX) / terrainResolution);
      ix++
    )
      for (
        let iz = Math.ceil((depression.z - extentZ) / terrainResolution);
        iz <= Math.floor((depression.z + extentZ) / terrainResolution);
        iz++
      ) {
        const x = ix * terrainResolution,
          z = iz * terrainResolution;
        const dx = x - depression.x,
          dz = z - depression.z,
          nx = (dx * c + dz * s) / depression.radiusX,
          nz = (-dx * s + dz * c) / depression.radiusZ,
          edge = depression.irregularity
            ? scarEdge(depression, Math.atan2(nz, nx))
            : 1,
          r2 = (nx * nx + nz * nz) / (edge * edge);
        if (r2 >= 1 || Math.abs(x) >= half - 1 || Math.abs(z) >= playArea(map).depth / 2 - 2)
          continue;
        if (baseGroundHeight(x, z, authored) < map.terrain!.bankHeight - 0.01)
          continue;
        let protection = smooth((half - 1 - Math.abs(x)) / 3);
        for (const box of map.boxes) {
          if (box.landmark) continue;
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
  }
  const originX = -half / terrainResolution,
    originZ = -map.depth / 2 / terrainResolution;
  const columns = (half * 2) / terrainResolution + 1,
    rows = map.depth / terrainResolution + 1;
  const values = new Float32Array(columns * rows);
  for (const [key, depth] of Object.entries(cuts)) {
    const [x, z] = key.split(",").map(Number);
    values[(z - originZ) * columns + x - originX] = depth;
  }
  return { cuts, patches, grid: { originX, originZ, columns, rows, values } };
}
