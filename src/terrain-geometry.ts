import { exposedEarth } from "./environment-surface";
import { soilColor } from "./battlefield-look";
import {
  groundHeight,
  terrainCut,
  authoredTerrainCut,
  type MapDefinition,
} from "./map";
import type { DestructionChange } from "./destruction";
import { terrainPatchSize, terrainResolution } from "./destruction";

export interface TerrainGeometry {
  positions: number[];
  indices: number[];
  colors: number[];
  uvs: number[];
}
export function terrainPatchKeys(map: MapDefinition) {
  const keys: string[] = [];
  for (
    let x = Math.floor(-map.width / 2 / terrainPatchSize);
    x < map.width / 2 / terrainPatchSize;
    x++
  )
    for (
      let z = Math.floor(-map.depth / 2 / terrainPatchSize);
      z < map.depth / 2 / terrainPatchSize;
      z++
    )
      keys.push(`${x},${z}`);
  return keys;
}
function buildTerrainGeometry(
  map: MapDefinition,
  key: string,
  cells?: Map<string, TerrainGeometry>,
): TerrainGeometry {
  const [ix, iz] = key.split(",").map(Number);
  const x0 = Math.max(-map.width / 2, ix * terrainPatchSize),
    x1 = Math.min(map.width / 2, (ix + 1) * terrainPatchSize);
  const z0 = Math.max(-map.depth / 2, iz * terrainPatchSize),
    z1 = Math.min(map.depth / 2, (iz + 1) * terrainPatchSize);
  const positions: number[] = [],
    indices: number[] = [],
    colors: number[] = [],
    uvs: number[] = [];
  // Adjacent quads repeatedly probe the same side of shared corners. Cache
  // exact coordinates only for this build; the next blast gets fresh samples.
  // Keep opposite epsilon probes distinct so authored cliffs stay vertical.
  const heights = new Map<number, Map<number, number>>();
  const height = (x: number, z: number) => {
    let row = heights.get(x);
    if (!row) { row = new Map(); heights.set(x, row); }
    let y = row.get(z);
    if (y === undefined) { y = groundHeight(x, z, map); row.set(z, y); }
    return y;
  };
  const quad = (points: number[][], dark = false) => {
    const start = positions.length / 3;
    const acrossX =
      Math.abs(points[1][0] - points[0][0]) >
      Math.abs(points[1][2] - points[0][2]);
    for (const [x, y, z] of points) {
      uvs.push((dark ? (acrossX ? x : z) : x) / 3, (dark ? y : z) / 3);
      positions.push(x, y, z);
      if (map.terrain) {
        const cut = terrainCut(x, z, map);
        colors.push(...soilColor(x, y, z, dark, cut), exposedEarth(cut, dark));
      }
      else
        colors.push(
          ...[0.46, 0.49, 0.43].map(
            (v) =>
              (v *
                Math.max(
                  0.45,
                  1 -
                    terrainCut(x, z, map) * 1.5 -
                    authoredTerrainCut(x, z, map) * 0.65,
                ) *
                (dark ? 0.7 : 1)) **
              2.2,
          ),
          1,
        );
    }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  };
  const epsilon = 0.00001;
  // Refine only the two-meter cells touched by excavation, not the whole patch.
  const refined = new Set<string>();
  const refine = (wx: number, wz: number) => {
    for (const dx of [0, -epsilon])
      for (const dz of [0, -epsilon])
        refined.add(
          `${Math.floor((wx - x0 + dx) / 2)},${Math.floor((wz - z0 + dz) / 2)}`,
        );
  };
  for (const field of [map.terrain?.relief, map.destruction]) {
    if (!field?.patches[key]) continue;
    if ("grid" in field && field.grid) {
      const grid = field.grid;
      for (let x = x0; x <= x1; x += terrainResolution)
        for (let z = z0; z <= z1; z += terrainResolution) {
          const col = x / terrainResolution - grid.originX,
            row = z / terrainResolution - grid.originZ;
          if (
            col >= 0 &&
            row >= 0 &&
            col < grid.columns &&
            row < grid.rows &&
            grid.values[row * grid.columns + col] > 0
          )
            refine(x, z);
        }
    } else {
      // Probe only this patch instead of scanning every cut accumulated during
      // the entire match. Sparse samples are keyed in integer grid coordinates.
      for (let gx = Math.ceil(x0 / terrainResolution); gx <= Math.floor(x1 / terrainResolution); gx++)
        for (let gz = Math.ceil(z0 / terrainResolution); gz <= Math.floor(z1 / terrainResolution); gz++)
          if (Object.hasOwn(field.cuts, `${gx},${gz}`))
            refine(gx * terrainResolution, gz * terrainResolution);
    }
  }
  for (let cellX = x0; cellX < x1; cellX += 2)
    for (let cellZ = z0; cellZ < z1; cellZ += 2) {
      const cellKey = `${cellX},${cellZ}`;
      const cached = cells?.get(cellKey);
      if (cached) {
        const base = positions.length / 3;
        for (const value of cached.positions) positions.push(value);
        for (const value of cached.colors) colors.push(value);
        for (const value of cached.uvs) uvs.push(value);
        for (const value of cached.indices) indices.push(value + base);
        continue;
      }
      const startVertex = positions.length / 3, startIndex = indices.length;
      const terrain = map.terrain;
      let authoredStep = 2;
      if (terrain && terrain.cellSize < 2) {
        const size = terrain.cellSize;
        const col = Math.floor((cellX + map.width / 2) / size);
        const row = Math.floor((cellZ + map.depth / 2) / size);
        const first = terrain.heights[row * terrain.columns + col];
        let boundary = false;
        // Both sides of a corner must have matching edge vertices. Refining
        // only the low cell leaves a diagonal gap (or false wall) where its
        // neighbor's two-meter cliff edge spans a one-meter turn.
        for (let dz = -1; dz <= 2 / size; dz++)
          for (let dx = -1; dx <= 2 / size; dx++)
            if (
              row + dz >= 0 &&
              row + dz < terrain.rows &&
              col + dx >= 0 &&
              col + dx < terrain.columns
            )
              boundary ||=
                terrain.heights[(row + dz) * terrain.columns + col + dx] !==
                first;
        if (
          boundary ||
          terrain.ramps.some(
            (r) =>
              r.x + r.w / 2 > cellX - size &&
              r.x - r.w / 2 < cellX + 2 + size &&
              r.z + r.d / 2 > cellZ - size &&
              r.z - r.d / 2 < cellZ + 2 + size,
          )
        )
          authoredStep = size;
      }
      const banks = terrain?.banks;
      const rounded =
        banks?.cells[
          Math.floor((cellZ + map.depth / 2) / 2) * banks.cellColumns +
            Math.floor((cellX + map.width / 2) / 2)
        ];
      const step =
        rounded ||
        refined.has(
          `${Math.floor((cellX - x0) / 2)},${Math.floor((cellZ - z0) / 2)}`,
        )
          ? terrainResolution
          : authoredStep;
      for (let x = cellX; x < Math.min(x1, cellX + 2) - epsilon; x += step)
        for (let z = cellZ; z < Math.min(z1, cellZ + 2) - epsilon; z += step) {
          const right = Math.min(x1, cellX + 2, x + step),
            back = Math.min(z1, cellZ + 2, z + step);
          const a = [x, height(x + epsilon, z + epsilon), z];
          const b = [x, height(x + epsilon, back - epsilon), back];
          const c = [
            right,
            height(right - epsilon, back - epsilon),
            back,
          ];
          const d = [right, height(right - epsilon, z + epsilon), z];
          quad([a, b, c, d]);
          const sides = [
            [
              a,
              d,
              height(x + epsilon, z - epsilon),
              height(right - epsilon, z - epsilon),
            ],
            [
              d,
              c,
              height(right + epsilon, z + epsilon),
              height(right + epsilon, back - epsilon),
            ],
            [
              c,
              b,
              height(right - epsilon, back + epsilon),
              height(x + epsilon, back + epsilon),
            ],
            [
              b,
              a,
              height(x - epsilon, back - epsilon),
              height(x - epsilon, z + epsilon),
            ],
          ] as const;
          for (const [p, q, lowP, lowQ] of sides)
            if ((p[1] + q[1]) / 2 > (lowP + lowQ) / 2 + 0.001)
              quad([p, q, [q[0], lowQ, q[2]], [p[0], lowP, p[2]]], true);
        }
      cells?.set(cellKey, {
        positions: positions.slice(startVertex * 3),
        colors: colors.slice(startVertex * 4),
        uvs: uvs.slice(startVertex * 2),
        indices: indices.slice(startIndex).map(i => i - startVertex),
      });
    }
  return { positions, indices, colors, uvs };
}

export function terrainGeometry(map: MapDefinition, key: string): TerrainGeometry {
  return buildTerrainGeometry(map, key);
}

// Keep a bounded working set of recently rebuilt patches. Each two-meter cell
// keeps its exact topology and colors until a changed height sample can reach it.
export class TerrainGeometryCache {
  private patches = new Map<string, Map<string, TerrainGeometry>>();
  private revision: number;
  constructor(private map: MapDefinition, private capacity = 64) {
    this.revision = this.currentRevision();
  }
  private currentRevision() {
    return this.map.destruction?.terrainRevision ?? this.map.destruction?.revision ?? 0;
  }
  invalidate(change: Pick<DestructionChange, "terrain">) {
    const revision = this.currentRevision();
    if (revision === this.revision) return;
    if (revision !== this.revision + 1 || !change.terrain.length) this.patches.clear();
    else {
      let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
      for (const edit of change.terrain) {
        const [x, z] = edit.key.split(",").map(v => Number(v) * terrainResolution);
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      }
      // Bilinear height/color sampling and opposite-side cliff probes.
      const pad = terrainResolution + 0.0001;
      for (const cells of this.patches.values()) for (const key of cells.keys()) {
        const [x, z] = key.split(",").map(Number);
        if (x <= maxX + pad && x + 2 >= minX - pad && z <= maxZ + pad && z + 2 >= minZ - pad)
          cells.delete(key);
      }
    }
    this.revision = revision;
  }
  build(key: string) {
    if (this.currentRevision() !== this.revision) {
      this.patches.clear(); this.revision = this.currentRevision();
    }
    const cells = this.patches.get(key) ?? new Map<string, TerrainGeometry>();
    this.patches.delete(key); this.patches.set(key, cells);
    if (this.patches.size > this.capacity) this.patches.delete(this.patches.keys().next().value!);
    return buildTerrainGeometry(this.map, key, cells);
  }
}
