import { groundHeight, terrainResolution, type MapDefinition } from "./map";
import type { DestructionChange } from "./destruction";
import type { TerrainGeometry } from "./terrain-geometry";

type NormalEntry = {x:number;z:number;normal:number[]};
type NormalCache = {revision:number;entries:Map<string,NormalEntry>;buckets:Map<string,Set<string>>};
const normalCaches = new WeakMap<MapDefinition,NormalCache>();
const revisionOf = (map:MapDefinition) => map.destruction?.terrainRevision ?? map.destruction?.revision ?? 0;
function normalCache(map:MapDefinition) {
  const revision=revisionOf(map);let cache=normalCaches.get(map);
  if(!cache || cache.revision!==revision){cache={revision,entries:new Map(),buckets:new Map()};normalCaches.set(map,cache);}
  return cache;
}
// Official changes retain normals outside the cut's sampling footprint. A caller
// that changes revision without this notification safely gets a cold cache.
export function invalidateTerrainNormals(map:MapDefinition,change:Pick<DestructionChange,"terrain">) {
  const cache=normalCaches.get(map),revision=revisionOf(map);
  if(!cache || cache.revision===revision)return;
  if(cache.revision!==revision-1 || !change.terrain.length){normalCaches.delete(map);return;}
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const edit of change.terrain){const [gx,gz]=edit.key.split(',').map(Number),x=gx*terrainResolution,z=gz*terrainResolution;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);}
  const padding=terrainResolution*2+.004;minX-=padding;maxX+=padding;minZ-=padding;maxZ+=padding;
  for(let x=Math.floor(minX/4);x<=Math.floor(maxX/4);x++)for(let z=Math.floor(minZ/4);z<=Math.floor(maxZ/4);z++){
    const bucket=cache.buckets.get(`${x},${z}`);if(!bucket)continue;
    for(const key of bucket){const entry=cache.entries.get(key)!;if(entry.x>=minX && entry.x<=maxX && entry.z>=minZ && entry.z<=maxZ){cache.entries.delete(key);bucket.delete(key);}}
    if(!bucket.size)cache.buckets.delete(`${x},${z}`);
  }
  cache.revision=revision;
}

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
  const shared = normalCache(map);
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
      const exactKey = `${x},${y},${z}`;
      normal = shared.entries.get(exactKey)?.normal;
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
        shared.entries.set(exactKey,{x,z,normal});
        const bucketKey=`${Math.floor(x/4)},${Math.floor(z/4)}`;
        let bucket=shared.buckets.get(bucketKey);if(!bucket){bucket=new Set();shared.buckets.set(bucketKey,bucket);}bucket.add(exactKey);
      }
      cache.set(key, normal);
    }
    normals[i] = normal[0];
    normals[i + 1] = normal[1];
    normals[i + 2] = normal[2];
  }
  return normals;
}
