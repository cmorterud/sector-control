import { groundHeight, terrainResolution, type MapDefinition } from "./map";
import type { TerrainGeometry } from "./terrain-geometry";

// Lighting follows the same world-space height field on both sides of UV,
// quad and patch seams. Rendering keeps the exact existing collision vertices.
export function terrainNormals(
  map: MapDefinition,
  data: TerrainGeometry,
  faceNormals: number[],
): number[] {
  if (!map.terrain) return faceNormals;
  const normals = [...faceNormals];
  const cache = new Map<string, number[]>();
  const probe = 0.001;
  const step = terrainResolution;
  for (let i = 0; i < data.positions.length; i += 3) {
    let face = faceNormals.slice(i, i + 3);
    if (Math.hypot(...face) < 0.5) {
      // A collapsed end of a vertical side can belong only to its degenerate
      // triangle. Borrow the other end's face normal instead of normalizing zero.
      const start = Math.floor(i / 12) * 12;
      for (let j = start; j < start + 12; j += 3) {
        const candidate = faceNormals.slice(j, j + 3);
        if (Math.hypot(...candidate) > 0.5) { face = candidate; break; }
      }
      if (Math.hypot(...face) < 0.5) face = [0, 1, 0];
      normals.splice(i, 3, ...face);
    }
    // Explicit vertical retaining cuts keep their hard silhouette/edge normals.
    if (Math.abs(face[1]) < 0.01) continue;
    const [x, y, z] = data.positions.slice(i, i + 3);
    const key = `${x},${Math.round(y * 1000)},${z}`;
    let normal = cache.get(key);
    if (!normal) {
      const corners = [-1, 1].flatMap(dx => [-1, 1].map(dz => ({
        x: x + dx * probe,
        z: z + dz * probe,
        error: Math.abs(groundHeight(x + dx * probe, z + dz * probe, map) - y),
      })));
      // At a real authored cliff, sample the connected side rather than
      // blending a flat floor into the unrelated top of the bank.
      const discontinuous = corners.some(c => c.error > 0.03);
      const point = discontinuous
        ? corners.reduce((a, b) => a.error <= b.error ? a : b)
        : { x, z };
      const height = groundHeight(point.x, point.z, map);
      const slope = (dx: number, dz: number) => {
        const low = groundHeight(point.x - dx * probe, point.z - dz * probe, map);
        const high = groundHeight(point.x + dx * probe, point.z + dz * probe, map);
        const left = Math.abs(low - height) < 0.03;
        const right = Math.abs(high - height) < 0.03;
        const before = groundHeight(point.x - dx * step, point.z - dz * step, map);
        const after = groundHeight(point.x + dx * step, point.z + dz * step, map);
        if (left && right) return (after - before) / (step * 2);
        if (right) return (after - height) / step;
        if (left) return (height - before) / step;
        return 0;
      };
      const dx = slope(1, 0), dz = slope(0, 1);
      const length = Math.hypot(dx, 1, dz);
      normal = [-dx / length, 1 / length, -dz / length];
      cache.set(key, normal);
    }
    normals[i] = normal[0];
    normals[i + 1] = normal[1];
    normals[i + 2] = normal[2];
  }
  return normals;
}
