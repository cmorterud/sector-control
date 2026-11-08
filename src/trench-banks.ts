import { terrainResolution, type MapDefinition, type TrenchBanks } from "./map";

// Bake once, then use the same triangles for rendering, movement and Ammo.
// Floor lanes are retained; only a narrow strip of earth outside them is scooped.
export function buildTrenchBanks(map: MapDefinition): TrenchBanks {
  const t = map.terrain!,
    spacing = terrainResolution,
    originX = -map.width / 2,
    originZ = -map.depth / 2,
    columns = map.width / spacing + 1,
    rows = map.depth / spacing + 1,
    values = new Float32Array(columns * rows),
    cellColumns = map.width / 2,
    cells = new Uint8Array((cellColumns * map.depth) / 2);
  const height = (col: number, row: number) =>
    col < 0 || row < 0 || col >= t.columns || row >= t.rows
      ? t.bankHeight
      : t.heights[row * t.columns + col];
  const rampAt = (x: number, z: number) =>
    t.ramps.find(
      (r) => Math.abs(x - r.x) <= r.w / 2 && Math.abs(z - r.z) < r.d / 2,
    );
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < columns; col++) {
      const x = originX + col * spacing,
        z = originZ + row * spacing,
        cx = Math.floor((x - originX) / t.cellSize),
        cz = Math.floor((z - originZ) / t.cellSize);
      let y = height(cx, cz);
      const ramp = rampAt(x, z);
      if (ramp)
        y =
          ramp.low +
          (ramp.high - ramp.low) *
            Math.max(
              0,
              Math.min(1, 0.5 + ((x - ramp.x) / ramp.w) * ramp.direction),
            );
      // Slow, fixed variation changes shoulder width, not the floor route or depth.
      const radius =
        0.72 +
        0.08 * Math.sin(x * 0.43 + z * 0.19) * Math.sin(z * 0.63 - x * 0.17);
      if (!ramp && y >= t.bankHeight - 0.01)
        for (let iz = cz - 1; iz <= cz + 1; iz++)
          for (let ix = cx - 1; ix <= cx + 1; ix++) {
            const low = height(ix, iz);
            if (low >= t.bankHeight - 0.01) continue;
            // The low authoring cells under a rear-entry ramp are not a ditch.
            if (
              rampAt(
                originX + (ix + 0.5) * t.cellSize,
                originZ + (iz + 0.5) * t.cellSize,
              )
            )
              continue;
            const dx = Math.max(
                0,
                Math.abs(x - (originX + (ix + 0.5) * t.cellSize)) -
                  t.cellSize / 2,
              ),
              dz = Math.max(
                0,
                Math.abs(z - (originZ + (iz + 0.5) * t.cellSize)) -
                  t.cellSize / 2,
              ),
              u = Math.min(1, Math.hypot(dx, dz) / radius);
            y = Math.min(y, low + (t.bankHeight - low) * u * u * (3 - 2 * u));
          }
      values[row * columns + col] = y;
      // Refine both sides of altered edge vertices so adjoining patches seal.
      if (y < height(cx, cz) - 0.001)
        for (const dx of [-0.001, 0.001])
          for (const dz of [-0.001, 0.001]) {
            const c = Math.floor((x - originX + dx) / 2),
              r = Math.floor((z - originZ + dz) / 2);
            if (c >= 0 && r >= 0 && c < cellColumns && r < map.depth / 2)
              cells[r * cellColumns + c] = 1;
          }
    }
  return {
    originX,
    originZ,
    spacing,
    columns,
    rows,
    values,
    cellColumns,
    cells,
  };
}
