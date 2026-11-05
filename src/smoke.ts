import { foliageBlocks } from "./vegetation";
import type { Game, V3, Team } from "./simulation";

export interface SmokeCloud extends V3 {
  id: number;
  actor: number;
  team: Team;
  bornAt: number;
  expiresAt: number;
}
export const smokeRules = {
  fuse: 75,
  lifetime: 20 * 30,
  grow: 45,
  fade: 90,
  radius: 6.5,
  height: 3.2,
};
export function smokeDensity(cloud: SmokeCloud, tick: number): number {
  return Math.max(
    0,
    Math.min(
      1,
      (tick - cloud.bornAt) / smokeRules.grow,
      (cloud.expiresAt - tick) / smokeRules.fade,
    ),
  );
}
// Integrate the visible segment through each ellipsoid; the same envelope drives rendering.
export function smokeBlocks(
  g: Pick<Game, "smokeClouds" | "tick"> & Partial<Pick<Game, "map">>,
  from: V3,
  to: V3,
): boolean {
  if (g.map && foliageBlocks(g.map, from, to)) return true;
  let opacity = 0;
  const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  if (length < 0.001) return false;
  for (const cloud of g.smokeClouds) {
    const density = smokeDensity(cloud, g.tick);
    if (density <= 0) continue;
    const radius = smokeRules.radius * (0.3 + 0.7 * density),
      height = smokeRules.height * (0.5 + 0.5 * density);
    const x = (from.x - cloud.x) / radius,
      y = (from.y - cloud.y) / height,
      z = (from.z - cloud.z) / radius;
    const dx = (to.x - from.x) / radius,
      dy = (to.y - from.y) / height,
      dz = (to.z - from.z) / radius;
    const a = dx * dx + dy * dy + dz * dz,
      b = 2 * (x * dx + y * dy + z * dz),
      c = x * x + y * y + z * z - 1;
    const discriminant = b * b - 4 * a * c;
    if (discriminant <= 0) continue;
    const root = Math.sqrt(discriminant);
    const entry = Math.max(0, (-b - root) / (2 * a)),
      exit = Math.min(1, (-b + root) / (2 * a));
    opacity += Math.max(0, exit - entry) * length * density;
    if (opacity >= 1.5) return true;
  }
  return false;
}
