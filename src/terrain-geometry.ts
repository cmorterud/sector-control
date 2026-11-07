import { soilColor } from "./battlefield-look";
import {
  groundHeight,
  terrainCut,
  authoredTerrainCut,
  type MapDefinition,
} from "./map";
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
export function terrainGeometry(
  map: MapDefinition,
  key: string,
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
  const quad = (points: number[][], dark = false) => {
    const start = positions.length / 3;
    const acrossX =
      Math.abs(points[1][0] - points[0][0]) >
      Math.abs(points[1][2] - points[0][2]);
    for (const [x, y, z] of points) {
      uvs.push((dark ? (acrossX ? x : z) : x) / 3, (dark ? y : z) / 3);
      positions.push(x, y, z);
      if (map.terrain)
        colors.push(
          ...soilColor(
            x,
            y,
            z,
            dark,
            terrainCut(x, z, map) + authoredTerrainCut(x, z, map) * 0.45,
          ),
          1,
        );
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
      for (const cutKey of Object.keys(field.cuts)) {
        const [gx, gz] = cutKey.split(",").map(Number);
        const wx = gx * terrainResolution,
          wz = gz * terrainResolution;
        if (wx < x0 || wx > x1 || wz < z0 || wz > z1) continue;
        refine(wx, wz);
      }
    }
  }
  for (let cellX = x0; cellX < x1; cellX += 2)
    for (let cellZ = z0; cellZ < z1; cellZ += 2) {
      const step = refined.has(
        `${Math.floor((cellX - x0) / 2)},${Math.floor((cellZ - z0) / 2)}`,
      )
        ? terrainResolution
        : 2;
      for (let x = cellX; x < Math.min(x1, cellX + 2) - epsilon; x += step)
        for (let z = cellZ; z < Math.min(z1, cellZ + 2) - epsilon; z += step) {
          const right = Math.min(x1, cellX + 2, x + step),
            back = Math.min(z1, cellZ + 2, z + step);
          const a = [x, groundHeight(x + epsilon, z + epsilon, map), z];
          const b = [x, groundHeight(x + epsilon, back - epsilon, map), back];
          const c = [
            right,
            groundHeight(right - epsilon, back - epsilon, map),
            back,
          ];
          const d = [right, groundHeight(right - epsilon, z + epsilon, map), z];
          quad([a, b, c, d]);
          const sides = [
            [
              a,
              d,
              groundHeight(x + epsilon, z - epsilon, map),
              groundHeight(right - epsilon, z - epsilon, map),
            ],
            [
              d,
              c,
              groundHeight(right + epsilon, z + epsilon, map),
              groundHeight(right + epsilon, back - epsilon, map),
            ],
            [
              c,
              b,
              groundHeight(right - epsilon, back + epsilon, map),
              groundHeight(x + epsilon, back + epsilon, map),
            ],
            [
              b,
              a,
              groundHeight(x - epsilon, back - epsilon, map),
              groundHeight(x - epsilon, z + epsilon, map),
            ],
          ] as const;
          for (const [p, q, lowP, lowQ] of sides)
            if ((p[1] + q[1]) / 2 > (lowP + lowQ) / 2 + 0.001)
              quad([p, q, [q[0], lowQ, q[2]], [p[0], lowP, p[2]]], true);
        }
    }
  return { positions, indices, colors, uvs };
}
