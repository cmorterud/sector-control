import {
  baseGroundHeight,
  groundHeight,
  terrainResolution,
  terrainPatchSize,
  type Box,
  type MapDefinition,
  type Vec,
} from "./map";

export type Point = Vec & { y: number };
export interface ExplosionProfile {
  kind: string;
  radius: number;
  damage: number;
  structuralRadius: number;
  structuralDamage: number;
  craterRadius: number;
  craterDepth: number;
  terrainReach: number;
}
export const grenadeExplosionProfile: ExplosionProfile = {
  kind: "grenade",
  radius: 7,
  damage: 140,
  structuralRadius: 4,
  structuralDamage: 100,
  craterRadius: 1.75,
  craterDepth: 0.55,
  terrainReach: 3,
};
export { terrainResolution, terrainPatchSize } from "./map";
export interface Destructible {
  id: string;
  original: Box;
  hp: number;
  maxHp: number;
  stage: 0 | 1 | 2;
  lining: boolean;
}
export interface Crater extends Point {
  id: number;
  radius: number;
  depth: number;
}
export interface DestructionState {
  revision: number;
  cuts: Record<string, number>;
  objects: Record<string, Destructible>;
  craters: Crater[];
  patches: Record<string, true>;
}
export interface DestructionChange {
  revision: number;
  kind: string;
  at: Point;
  crater: Crater | null;
  terrain: { key: string; depth: number }[];
  objects: { id: string; hp: number; stage: number }[];
  patches: string[];
}
export function runtimeMap(source: MapDefinition): MapDefinition {
  const map: MapDefinition = {
    ...source,
    boxes: source.boxes.map((box, i) => ({
      ...box,
      id: box.id ?? `cover-${i}`,
    })),
    destruction: {
      revision: 0,
      cuts: {},
      objects: {},
      craters: [],
      patches: {},
    },
  };
  const add = (original: Box, lining = false) => {
    const id = original.id!;
    const maxHp = original.kind === "sandbag" ? 160 : 40;
    map.destruction!.objects[id] = {
      id,
      original: { ...original },
      hp: maxHp,
      maxHp,
      stage: 0,
      lining,
    };
  };
  for (const box of map.boxes)
    if (box.kind === "sandbag" || box.kind === "wood") add(box);
  for (const [i, wall] of (source.terrain?.lining ?? []).entries()) {
    const segments = Math.ceil(wall.d);
    for (let j = 0; j < segments; j++) {
      const z = wall.z - wall.d / 2 + ((j + 0.5) * wall.d) / segments;
      const floorDirection =
        baseGroundHeight(wall.x - 0.2, z, source) <
        baseGroundHeight(wall.x + 0.2, z, source)
          ? -1
          : 1;
      add(
        {
          id: `lining-${i}-${j}`,
          kind: "wood",
          x: wall.x + floorDirection * 0.04,
          z,
          w: wall.w,
          d: wall.d / segments,
          h: source.terrain!.bankHeight - 0.1,
        },
        true,
      );
    }
  }
  return map;
}
const patchKey = (x: number, z: number) =>
  `${Math.floor(x / terrainPatchSize)},${Math.floor(z / terrainPatchSize)}`;
export function deformExplosion(
  map: MapDefinition,
  at: Point,
  profile: ExplosionProfile,
  ray: (a: Point, b: Point) => number,
): DestructionChange | null {
  const state = map.destruction;
  if (!state) return null;
  const objects: DestructionChange["objects"] = [];
  // Evaluate all cover against the world as it stood before this explosion.
  for (const object of Object.values(state.objects)) {
    if (object.stage === 2) continue;
    const box = object.original,
      base = box.baseY ?? 0;
    const nearest = {
      x: Math.max(box.x - box.w / 2, Math.min(box.x + box.w / 2, at.x)),
      y: Math.max(
        base,
        Math.min(base + box.h * (object.stage === 1 ? 0.6 : 1), at.y),
      ),
      z: Math.max(box.z - box.d / 2, Math.min(box.z + box.d / 2, at.z)),
    };
    const distance = Math.hypot(
      nearest.x - at.x,
      nearest.y - at.y,
      nearest.z - at.z,
    );
    if (distance >= profile.structuralRadius) continue;
    // Stop just short of its near surface, so the object doesn't shield itself.
    const f = Math.max(0, 1 - 0.04 / Math.max(distance, 0.04));
    const surface = {
      x: at.x + (nearest.x - at.x) * f,
      y: at.y + (nearest.y - at.y) * f,
      z: at.z + (nearest.z - at.z) * f,
    };
    if (ray(at, surface) < 0.995) continue;
    const hp = Math.max(
      0,
      object.hp -
        Math.ceil(
          profile.structuralDamage * (1 - distance / profile.structuralRadius),
        ),
    );
    const stage = hp === 0 ? 2 : hp <= object.maxHp / 2 ? 1 : 0;
    objects.push({ id: object.id, hp, stage });
  }
  const edits = new Map<string, number>();
  const queue: { x: number; z: number }[] = [];
  const read = (x: number, z: number) =>
    edits.get(`${x},${z}`) ?? state.cuts[`${x},${z}`] ?? 0;
  const lower = (x: number, z: number, depth: number) => {
    const wx = x * terrainResolution,
      wz = z * terrainResolution;
    if (Math.abs(wx) >= map.width / 2 - 1 || Math.abs(wz) >= map.depth / 2 - 1)
      return;
    if (
      map.boxes.some(
        (box) =>
          ["building", "bunker", "container", "barrier"].includes(box.kind) &&
          (box.baseY ?? 0) <= baseGroundHeight(wx, wz, map) + 0.1 &&
          Math.abs(wx - box.x) <= box.w / 2 &&
          Math.abs(wz - box.z) <= box.d / 2,
      )
    )
      return;
    const limit = Math.max(0, baseGroundHeight(wx, wz, map) + 0.9);
    const next = Math.min(limit, depth);
    if (next <= read(x, z) + 0.0001) return;
    edits.set(`${x},${z}`, next);
    queue.push({ x, z });
  };
  const r = profile.craterRadius;
  if (r > 0 && profile.craterDepth > 0)
    for (
      let x = Math.ceil((at.x - r) / terrainResolution);
      x <= Math.floor((at.x + r) / terrainResolution);
      x++
    )
      for (
        let z = Math.ceil((at.z - r) / terrainResolution);
        z <= Math.floor((at.z + r) / terrainResolution);
        z++
      ) {
        const wx = x * terrainResolution,
          wz = z * terrainResolution;
        const distance = Math.hypot(wx - at.x, wz - at.z);
        if (distance >= r) continue;
        const surface = groundHeight(wx, wz, map);
        const standoff = Math.abs(at.y - surface);
        if (
          standoff >= profile.terrainReach ||
          ray(at, { x: wx, y: surface + 0.025, z: wz }) < 0.995
        )
          continue;
        const depth =
          profile.craterDepth *
          (1 - standoff / profile.terrainReach) *
          (1 - (distance / r) ** 2) ** 2;
        lower(x, z, read(x, z) + depth);
      }
  // Relax the bowl outward as repeated hits deepen it. Preserve existing steep
  // trench walls, but don't introduce unwalkable slopes on one continuous surface.
  for (let i = 0; i < queue.length; i++) {
    const { x, z } = queue[i];
    const base = baseGroundHeight(
      x * terrainResolution,
      z * terrainResolution,
      map,
    );
    const height = base - read(x, z);
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        nz = z + dz;
      const neighborBase = baseGroundHeight(
        nx * terrainResolution,
        nz * terrainResolution,
        map,
      );
      if (Math.abs(neighborBase - base) > 0.3) continue;
      const maxHeight = height + terrainResolution * 0.45;
      if (neighborBase - read(nx, nz) > maxHeight + 0.0001)
        lower(nx, nz, neighborBase - maxHeight);
    }
  }
  if (!edits.size && !objects.length) return null;
  const patches = new Set<string>();
  for (const [key, depth] of edits) {
    state.cuts[key] = depth;
    const [x, z] = key.split(",").map(Number);
    for (const dx of [-terrainResolution, terrainResolution])
      for (const dz of [-terrainResolution, terrainResolution])
        patches.add(
          patchKey(x * terrainResolution + dx, z * terrainResolution + dz),
        );
  }
  for (const change of objects) {
    const object = state.objects[change.id];
    object.hp = change.hp;
    object.stage = change.stage as 0 | 1 | 2;
    const box = map.boxes.find((b) => b.id === object.id);
    if (box && object.stage === 1) box.h = object.original.h * 0.6;
    if (object.stage === 2)
      map.boxes = map.boxes.filter((b) => b.id !== object.id);
  }
  const crater = edits.size
    ? {
        id: state.craters.length + 1,
        ...at,
        radius: r,
        depth: profile.craterDepth,
      }
    : null;
  if (crater) state.craters.push(crater);
  for (const key of patches) state.patches[key] = true;
  state.revision++;
  return {
    revision: state.revision,
    kind: profile.kind,
    at: { ...at },
    crater,
    terrain: [...edits].map(([key, depth]) => ({ key, depth })),
    objects,
    patches: [...patches],
  };
}
