import { blocked, groundHeight as worldGround, hillHeight, playArea, type MapDefinition, type Vec } from "./map";
// Measured from the hillside under it, so a slope is not a crater.
const groundHeight = (x: number, z: number, map: MapDefinition) => worldGround(x, z, map) - hillHeight(x, z, map);
export interface CraterCover extends Vec {
  radius: number;
  depth: number;
  created: boolean;
}
export function craterDepth(map: MapDefinition, p: Vec, radius = 3) {
  return (
    Math.max(
      ...[
        [radius + 1, 0],
        [-radius - 1, 0],
        [0, radius + 1],
        [0, -radius - 1],
      ].map(([dx, dz]) => groundHeight(p.x + dx, p.z + dz, map)),
    ) - groundHeight(p.x, p.z, map)
  );
}
export function availableCraterCover(map: MapDefinition): CraterCover[] {
  const source = [
    ...(map.terrain?.craters ?? []).map((c) => ({ ...c, created: false })),
    ...(map.destruction?.craters ?? [])
      .slice(-80)
      .map((c) => ({ ...c, created: true })),
  ];
  const result: CraterCover[] = [];
  for (const c of source) {
    if (
      Math.abs(c.x) >= 14 ||
      Math.abs(c.z) > playArea(map).depth / 2 - 4 ||
      blocked(c.x, c.z, 0.8, map)
    )
      continue;
    const depth = craterDepth(map, c, c.radius);
    if (depth < 0.35) continue;
    const duplicate = result.findIndex(
      (q) => Math.hypot(q.x - c.x, q.z - c.z) < 2,
    );
    const cover = {
      x: c.x,
      z: c.z,
      radius: c.radius,
      depth,
      created: c.created,
    };
    if (duplicate < 0) result.push(cover);
    else if (depth > result[duplicate].depth || c.created)
      result[duplicate] = cover;
  }
  return result;
}
