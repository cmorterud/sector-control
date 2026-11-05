import {
  groundHeight,
  baseGroundHeight,
  type Box,
  type MapDefinition,
} from "./map";
import type { Destructible } from "./destruction";
import type { V3 } from "./simulation";

export function vegetationFor(map: MapDefinition): Box[] {
  const items: Box[] = [];
  const clear = (x: number, z: number, r: number) => {
    if (
      Math.hypot(x - map.spawn.blue.x, z - map.spawn.blue.z) < 16 ||
      Math.hypot(x - map.spawn.red.x, z - map.spawn.red.z) < 16
    )
      return false;
    if (
      map.boxes.some(
        (b) =>
          Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r,
      )
    )
      return false;
    return [
      [0, 0],
      [-r, 0],
      [r, 0],
      [0, -r],
      [0, r],
    ].every(
      ([dx, dz]) =>
        Math.abs(baseGroundHeight(x + dx, z + dz, map) - 2.4) < 0.03,
    );
  };
  const trees = [
    [-68, -51],
    [-59, -44],
    [-65, -31],
    [-71, 38],
    [-61, 49],
    [65, -53],
    [58, -44],
    [70, -30],
    [63, 35],
    [70, 52],
    [-37, -53],
    [-35, -45],
    [-35, 15],
    [-33, 43],
    [-35, 55],
    [35, -51],
    [33, -29],
    [35, -15],
    [37, 17],
    [35, 47],
    [-11, -55],
    [11, 55],
  ];
  for (const [i, [x, z]] of trees.entries())
    if (clear(x, z, 2.6))
      items.push({
        id: `tree-${i}`,
        kind: "tree",
        x,
        z,
        w: 0.8 + (i % 3) * 0.1,
        d: 0.8 + (i % 3) * 0.1,
        h: 6.2 + (i % 4) * 0.7,
        baseY: groundHeight(x, z, map),
      });
  for (let x = -72; x <= 72; x += 8)
    for (let z = -57; z <= 57; z += 7) {
      const n = Math.abs(Math.sin(x * 12.93 + z * 4.17));
      if (n < 0.83 || (Math.abs(x) < 16 && n < 0.97) || !clear(x, z, 1.3))
        continue;
      if (items.some((b) => Math.hypot(x - b.x, z - b.z) < 2)) continue;
      const tall = Math.abs(x) > 16 && n > 0.97;
      items.push({
        id: `brush-${items.length}`,
        kind: "brush",
        x,
        z,
        w: tall ? 2.2 : 1.25,
        d: tall ? 1.9 : 1.1,
        h: tall ? 1.35 : 0.25 + (n % 0.2),
        baseY: groundHeight(x, z, map),
      });
    }
  return items;
}

export function fallenTreeParts(
  map: MapDefinition,
  object: Destructible,
  at: V3,
): Box[] {
  const b = object.original;
  const axis = Math.abs(b.x - at.x) > Math.abs(b.z - at.z) ? "x" : "z";
  const sign = (axis === "x" ? b.x - at.x : b.z - at.z) >= 0 ? 1 : -1;
  const base = groundHeight(b.x, b.z, map);
  let length = 0;
  for (let d = 0.5; d <= Math.min(5.5, b.h * 0.75); d += 0.5) {
    const x = b.x + (axis === "x" ? sign * d : 0),
      z = b.z + (axis === "z" ? sign * d : 0);
    if (
      Math.abs(x) > map.width / 2 - 2 ||
      Math.abs(z) > map.depth / 2 - 2 ||
      Math.abs(groundHeight(x, z, map) - base) > 1.5
    )
      break;
    if (
      map.boxes.some(
        (q) =>
          q.id !== b.id &&
          Math.abs(x - q.x) < q.w / 2 + 0.5 &&
          Math.abs(z - q.z) < q.d / 2 + 0.5,
      )
    )
      break;
    length = d;
  }
  const stump: Box = {
    id: `stump-${b.id}`,
    kind: "stump",
    x: b.x,
    z: b.z,
    w: b.w,
    d: b.d,
    h: 1.15,
    baseY: base,
  };
  if (length < 1.5) return [stump];
  const log: Box = {
    id: `log-${b.id}`,
    kind: "log",
    x: b.x + (axis === "x" ? (sign * length) / 2 : 0),
    z: b.z + (axis === "z" ? (sign * length) / 2 : 0),
    w: axis === "x" ? length : b.w,
    h: b.w,
    d: axis === "z" ? length : b.d,
    baseY: base,
  };
  log.baseY = timberSupport(map, log);
  return [stump, log];
}

// A level fallen trunk bridges a small bowl instead of clipping into its rim.
export function timberSupport(map: MapDefinition, b: Box): number {
  const alongX = b.w > b.d;
  const length = Math.max(b.w, b.d);
  return Math.max(
    ...Array.from({ length: Math.ceil(length / 0.5) + 1 }, (_, i) => {
      const offset = (i / Math.ceil(length / 0.5) - 0.5) * length;
      return groundHeight(
        b.x + (alongX ? offset : 0),
        b.z + (alongX ? 0 : offset),
        map,
      );
    }),
  );
}

// Foliage can obscure a silhouette but does not stop a projectile or a soldier.
export function foliageBlocks(map: MapDefinition, from: V3, to: V3): boolean {
  const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  if (length < 0.01) return false;
  let cover = 0;
  for (const b of map.vegetation ?? []) {
    const object = map.destruction?.objects[b.id!];
    const stage = object?.stage ?? 0;
    if (stage === 2 || (b.kind === "tree" && stage > 0) || b.h < 0.6) continue;
    const radius = b.kind === "tree" ? b.h * 0.3 : b.w * 0.55;
    if (
      Math.max(from.x, to.x) < b.x - radius ||
      Math.min(from.x, to.x) > b.x + radius ||
      Math.max(from.z, to.z) < b.z - radius ||
      Math.min(from.z, to.z) > b.z + radius
    )
      continue;
    const base = b.baseY ?? 0;
    const h = b.h * (stage === 1 ? 0.6 : 1);
    const cy = base + (b.kind === "tree" ? h * 0.65 : h * 0.55);
    const ry = b.kind === "tree" ? h * 0.4 : h * 0.6;
    const x = (from.x - b.x) / radius,
      y = (from.y - cy) / ry,
      z = (from.z - b.z) / radius;
    const dx = (to.x - from.x) / radius,
      dy = (to.y - from.y) / ry,
      dz = (to.z - from.z) / radius;
    const a = dx * dx + dy * dy + dz * dz,
      bb = 2 * (x * dx + y * dy + z * dz),
      c = x * x + y * y + z * z - 1;
    const disc = bb * bb - 4 * a * c;
    if (disc <= 0) continue;
    const root = Math.sqrt(disc),
      entry = Math.max(0, (-bb - root) / (2 * a)),
      exit = Math.min(1, (-bb + root) / (2 * a));
    cover +=
      Math.max(0, exit - entry) *
      length *
      (b.kind === "tree" ? 0.6 : 0.85) *
      (stage === 1 ? 0.5 : 1);
    if (cover > 1.5) return true;
  }
  return false;
}
