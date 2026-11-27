import { terrainPatchSize, type MapDefinition } from "./map";

// Authored heights are immutable; explosions only subtract from them. A cached
// upper bound can reject rays above the earth without sampling every 20 cm.
const cache = new WeakMap<
  NonNullable<MapDefinition["terrain"]>,
  {
    base: number;
    columns: number;
    rows: number;
    x: number;
    z: number;
    peaks: Float32Array;
  }
>();
export function terrainRayCeiling(
  map: MapDefinition,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number,
) {
  const t = map.terrain;
  if (!t) return 0;
  let bound = cache.get(t);
  if (!bound) {
    const x = Math.floor(-map.width / 2 / terrainPatchSize),
      z = Math.floor(-map.depth / 2 / terrainPatchSize),
      columns = Math.ceil(map.width / 2 / terrainPatchSize) - x,
      rows = Math.ceil(map.depth / 2 / terrainPatchSize) - z,
      peaks = new Float32Array(columns * rows);
    let base = t.bankHeight;
    for (const height of t.heights) base = Math.max(base, height);
    for (const ramp of t.ramps) base = Math.max(base, ramp.high, ramp.low);
    // Each patch's highest rolling-ground sample, plus (separately, since the
    // two add) its highest hillside sample: a bound that stays above both.
    const patchPeaks = (field: NonNullable<typeof t.elevation>) => {
      const out = new Float32Array(columns * rows);
      for (let row = 0; row < field.rows; row++)
        for (let col = 0; col < field.columns; col++) {
          const height = field.values[row * field.columns + col];
          if (height <= 0) continue;
          const wx = field.originX + col * field.spacing,
            wz = field.originZ + row * field.spacing;
          for (const dx of [0, -0.00001])
            for (const dz of [0, -0.00001]) {
              const ix = Math.floor((wx + dx) / terrainPatchSize) - x,
                iz = Math.floor((wz + dz) / terrainPatchSize) - z;
              if (ix >= 0 && iz >= 0 && ix < columns && iz < rows)
                out[iz * columns + ix] = Math.max(out[iz * columns + ix], height);
            }
        }
      return out;
    };
    if (t.elevation) peaks.set(patchPeaks(t.elevation));
    if (t.hill) {
      const hill = patchPeaks(t.hill);
      for (let i = 0; i < peaks.length; i++) peaks[i] += hill[i];
    }
    bound = { base, columns, rows, x, z, peaks };
    cache.set(t, bound);
  }
  if (!t.elevation && !t.hill) return bound.base;
  let peak = 0;
  for (
    let z = Math.max(0, Math.floor(minZ / terrainPatchSize) - bound.z);
    z <=
    Math.min(bound.rows - 1, Math.floor(maxZ / terrainPatchSize) - bound.z);
    z++
  )
    for (
      let x = Math.max(0, Math.floor(minX / terrainPatchSize) - bound.x);
      x <=
      Math.min(
        bound.columns - 1,
        Math.floor(maxX / terrainPatchSize) - bound.x,
      );
      x++
    )
      peak = Math.max(peak, bound.peaks[z * bound.columns + x]);
  return bound.base + peak;
}
