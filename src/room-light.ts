import type { MapDefinition } from "./map";
import type { ArchitectureMesh } from "./architecture-geometry";
import { kitStory } from "./house-kit";

type Building = NonNullable<MapDefinition["buildings"]>[number];
type Vec3 = [number, number, number];
type Opening = { at: Vec3 };

// Baked daylight for kit-building interiors: rooms darken away from their
// windows and doors. The value multiplies vertex colour once, at build time,
// so it costs nothing per frame and works at every quality level.
export const roomLightRules = { indoor: 0.4, reach: 1.8, strength: 0.6 };

const openingCache = new WeakMap<Building, Opening[]>();
function openings(b: Building): Opening[] {
  let list = openingCache.get(b);
  if (!list) {
    const kit = b.kit!;
    list = [
      // Window posts stand 1 m inside; the light comes through the opening.
      ...kit.windows.map((w) => ({ at: [w.x + Math.sin(w.yaw), (w.y ?? b.baseY) + 1.6, w.z - Math.cos(w.yaw)] as Vec3 })),
      ...kit.entrances.map((e) => ({ at: [e.x, b.baseY + 1.1, e.z] as Vec3 })),
    ];
    openingCache.set(b, list);
  }
  return list;
}

export function insideBuilding(b: Building, p: Vec3) {
  return Math.abs(p[0] - b.x) < b.w / 2 - 0.02 && Math.abs(p[2] - b.z) < b.d / 2 - 0.02
    && p[1] > b.baseY - 0.2 && p[1] < b.baseY + b.stories * kitStory + 0.05;
}

// 1 outdoors; indoors between roomLightRules.indoor and 1.
export function roomLight(b: Building, p: Vec3, n: Vec3) {
  if (!b.kit || !insideBuilding(b, p)) return 1;
  let sum = 0;
  for (const o of openings(b)) {
    const dx = o.at[0] - p[0], dy = o.at[1] - p[1], dz = o.at[2] - p[2];
    // Light from another storey doesn't reach this one.
    if (dy < -1.2 || dy > 2.4) continue;
    const d = Math.hypot(dx, dy, dz) || 1, facing = (dx * n[0] + dy * n[1] + dz * n[2]) / d;
    sum += Math.min(1, Math.max(0, facing * 0.6 + 0.4)) / (1 + (d / roomLightRules.reach) ** 2);
  }
  return Math.min(1, roomLightRules.indoor + roomLightRules.strength * Math.min(1, sum));
}

// Darkens the vertex colours of one architecture box's meshes in place.
// The meshes are local to the box centre (base + h / 2).
export function shadeArchitecture(meshes: ArchitectureMesh[], box: { x: number; z: number; baseY?: number }, h: number, b: Building) {
  const cy = (box.baseY ?? 0) + h / 2;
  for (const m of meshes) for (let i = 0; i < m.positions.length / 3; i++) {
    const n: Vec3 = [m.normals[i * 3], m.normals[i * 3 + 1], m.normals[i * 3 + 2]];
    const p: Vec3 = [box.x + m.positions[i * 3] + n[0] * 0.05, cy + m.positions[i * 3 + 1] + n[1] * 0.05, box.z + m.positions[i * 3 + 2] + n[2] * 0.05];
    const light = roomLight(b, p, n);
    for (let k = 0; k < 3; k++) m.colors[i * 4 + k] *= light;
  }
  return meshes;
}
