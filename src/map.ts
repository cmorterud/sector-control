export type Vec = { x: number; z: number };
export type Box = Vec & {
  w: number;
  d: number;
  h: number;
  kind: "building" | "container" | "barrier" | "sandbag" | "wire" | "bunker";
  baseY?: number;
};
export const sectors = [
  { id: "A", x: -28, z: -16 },
  { id: "B", x: 0, z: 8 },
  { id: "C", x: 28, z: 16 },
];
export const spawn = { blue: { x: -42, z: 40 }, red: { x: 42, z: -40 } };
export const boxes: Box[] = [
  { x: -23, z: 21, w: 16, d: 10, h: 9, kind: "building" },
  { x: 23, z: -21, w: 16, d: 10, h: 11, kind: "building" },
  { x: -25, z: -37, w: 19, d: 10, h: 12, kind: "building" },
  { x: 25, z: 37, w: 19, d: 10, h: 8, kind: "building" },
  { x: 0, z: -23, w: 11, d: 12, h: 8, kind: "building" },
  { x: -43, z: 0, w: 9, d: 17, h: 10, kind: "building" },
  { x: 43, z: 0, w: 9, d: 17, h: 10, kind: "building" },
  { x: 0, z: 36, w: 10, d: 8, h: 7, kind: "building" },
  { x: -14, z: -7, w: 3, d: 10, h: 3, kind: "container" },
  { x: 15, z: 16, w: 3, d: 10, h: 3, kind: "container" },
  { x: -30, z: 2, w: 9, d: 2, h: 1.4, kind: "barrier" },
  { x: 30, z: -2, w: 9, d: 2, h: 1.4, kind: "barrier" },
  { x: -7, z: 15, w: 5, d: 2, h: 1.4, kind: "barrier" },
  { x: 7, z: 0, w: 5, d: 2, h: 1.4, kind: "barrier" },
  { x: -38, z: -23, w: 4, d: 3, h: 2, kind: "container" },
  { x: 38, z: 23, w: 4, d: 3, h: 2, kind: "container" },
];
export type Ramp = Vec & {
  w: number;
  d: number;
  low: number;
  high: number;
  direction: 1 | -1;
};
export type TerrainRect = Vec & { w: number; d: number; h: number };
export interface MapDefinition {
  id: "industrial" | "trenches";
  name: string;
  width: number;
  depth: number;
  navSpacing: number;
  spawn: Record<"blue" | "red", Vec>;
  sectors: (Vec & { id: string })[];
  boxes: Box[];
  terrain?: {
    bankHeight: number;
    cellSize: number;
    columns: number;
    rows: number;
    heights: Float32Array;
    rectangles: TerrainRect[];
    ramps: Ramp[];
    lining: (Vec & { w: number; d: number })[];
    craters: (Vec & { radius: number })[];
  };
}
export const industrialMap: MapDefinition = {
  id: "industrial",
  name: "Industrial district",
  width: 100,
  depth: 100,
  navSpacing: 5,
  spawn,
  sectors,
  boxes,
};
export function groundHeight(
  x: number,
  z: number,
  map: MapDefinition = industrialMap,
): number {
  const terrain = map.terrain;
  if (!terrain) return 0;
  for (const ramp of terrain.ramps)
    if (
      Math.abs(x - ramp.x) <= ramp.w / 2 &&
      Math.abs(z - ramp.z) < ramp.d / 2
    ) {
      const t = Math.max(
        0,
        Math.min(1, 0.5 + ((x - ramp.x) / ramp.w) * ramp.direction),
      );
      return ramp.low + (ramp.high - ramp.low) * t;
    }
  const col = Math.floor((x + map.width / 2) / terrain.cellSize);
  const row = Math.floor((z + map.depth / 2) / terrain.cellSize);
  if (col < 0 || col >= terrain.columns || row < 0 || row >= terrain.rows)
    return terrain.bankHeight;
  return terrain.heights[row * terrain.columns + col];
}
export function blocked(
  x: number,
  z: number,
  r = 0.5,
  map: MapDefinition = industrialMap,
): boolean {
  return (
    Math.abs(x) > map.width / 2 - 1 - r ||
    Math.abs(z) > map.depth / 2 - 1 - r ||
    map.boxes.some(
      (b) => Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r,
    )
  );
}
export function moveOnMap(
  p: Vec,
  d: Vec,
  map: MapDefinition = industrialMap,
): Vec {
  const steps = Math.max(1, Math.ceil(Math.hypot(d.x, d.z) / 0.15));
  let x = p.x,
    z = p.z;
  for (let i = 0; i < steps; i++) {
    const nx = x + d.x / steps;
    if (
      !blocked(nx, z, 0.45, map) &&
      Math.abs(groundHeight(nx, z, map) - groundHeight(x, z, map)) <= 0.23
    )
      x = nx;
    const nz = z + d.z / steps;
    if (
      !blocked(x, nz, 0.45, map) &&
      Math.abs(groundHeight(x, nz, map) - groundHeight(x, z, map)) <= 0.23
    )
      z = nz;
  }
  return { x, z };
}
export function walkSegment(
  a: Vec,
  b: Vec,
  map: MapDefinition = industrialMap,
): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 0.35));
  let height = groundHeight(a.x, a.z, map);
  for (let i = 0; i <= n; i++) {
    const x = a.x + ((b.x - a.x) * i) / n,
      z = a.z + ((b.z - a.z) * i) / n;
    const next = groundHeight(x, z, map);
    if (blocked(x, z, 0.6, map) || Math.abs(next - height) > 0.23) return false;
    height = next;
  }
  return true;
}
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z);

// Mantles apply to terrain ledges. Solid cover is never treated as a climbable bank.
export function mantleRoute(
  p: Vec,
  direction: Vec,
  map: MapDefinition,
): { landing: Vec; edge: Vec } | null {
  if (!map.terrain) return null;
  const length = Math.hypot(direction.x, direction.z);
  if (length < 0.1) return null;
  const dx = direction.x / length,
    dz = direction.z / length;
  const fromHeight = groundHeight(p.x, p.z, map);
  let previousHeight = fromHeight;
  for (let distance = 0.15; distance <= 1.35; distance += 0.15) {
    const x = p.x + dx * distance,
      z = p.z + dz * distance;
    if (blocked(x, z, 0.45, map)) return null;
    const nextHeight = groundHeight(x, z, map);
    const step = nextHeight - previousHeight;
    previousHeight = nextHeight;
    const rise = nextHeight - fromHeight;
    // Walkable slopes are not ledges; Space on a ramp should hop normally.
    if (Math.abs(step) < 0.3) continue;
    if (Math.abs(rise) > 2.5) return null;
    const landing = { x: x + dx * 0.85, z: z + dz * 0.85 };
    const height = groundHeight(landing.x, landing.z, map);
    if (Math.abs(height - fromHeight - rise) > 0.12) return null;
    // Leave a full soldier footprint on a stable landing surface.
    for (const [ox, oz] of [
      [0, 0],
      [-0.45, 0],
      [0.45, 0],
      [0, -0.45],
      [0, 0.45],
    ])
      if (
        blocked(landing.x + ox, landing.z + oz, 0.45, map) ||
        Math.abs(groundHeight(landing.x + ox, landing.z + oz, map) - height) >
          0.12
      )
        return null;
    return { landing, edge: { x, z } };
  }
  return null;
}

export function mantleLanding(
  p: Vec,
  direction: Vec,
  map: MapDefinition,
): Vec | null {
  return mantleRoute(p, direction, map)?.landing ?? null;
}
