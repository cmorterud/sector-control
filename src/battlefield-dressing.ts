import { lookNoise } from "./battlefield-look";
import { hillHeight, blocked, groundHeight, type MapDefinition, type Vec } from "./map";

export type BattlefieldProp = Vec & {
  y: number;
  yaw: number;
  kind: "helmet" | "pack" | "planks";
};

// Low, cosmetic clutter at corridor edges. It never supplies invisible cover.
export function battlefieldProps(map: MapDefinition): BattlefieldProp[] {
  const props: BattlefieldProp[] = [];
  for (const [i, route] of (map.terrain?.communicationRoutes ?? []).entries()) {
    const a = route.points[1],
      b = route.points[2];
    if (!a || !b) continue;
    for (const side of [-1, 1]) {
      const x = (a.x + b.x) / 2 + side * 0.55,
        z = (a.z + b.z) / 2 + side * 0.6,
        y = groundHeight(x, z, map);
      if (blocked(x, z, 0.45, map) || y > 0.1) continue;
      if (
        [
          [-0.25, 0],
          [0.25, 0],
          [0, -0.5],
          [0, 0.5],
        ].some(
          ([dx, dz]) => Math.abs(groundHeight(x + dx, z + dz, map) - y) > 0.08,
        )
      )
        continue;
      props.push({
        x,
        z,
        y,
        yaw: (i * 73 + side * 29) % 180,
        kind: (["helmet", "pack", "planks"] as const)[
          (i * 2 + (side > 0 ? 1 : 0)) % 3
        ],
      });
      if (props.length === 20) return props;
    }
  }
  return props;
}

export type TrenchRoot = { x: number; z: number; points: { x: number; y: number; z: number }[] };
// Thin exposed roots follow existing sloped earth. Bounded cosmetic geometry;
// they never enlarge a bank or provide false cover in a traversable corridor.
export function trenchRoots(map: MapDefinition): TrenchRoot[] {
  if (!map.terrain) return [];
  const roots: TrenchRoot[] = [];
  for (const line of map.terrain.trenchLines ?? []) for (const section of line.sections) {
    for (let z = section.z - section.length / 2 + 0.7; z < section.z + section.length / 2; z += 2.7) {
      for (const side of [-1, 1]) {
        let found: number | undefined;
        for (let offset = 0.3; offset < 3.5; offset += 0.1) {
          const x = section.x + side * offset, h = groundHeight(x, z, map) - hillHeight(x, z, map);
          if (h > 0.5 && h < map.terrain.bankHeight - 0.3) { found = x; break; }
        }
        if (found === undefined) continue;
        const x = found, points: TrenchRoot["points"] = [];
        const length = 0.22 + lookNoise(x + 17, z) * 0.23;
        for (let i = 0; i <= 3; i++) {
          const px = x + side * length * i / 3, pz = z + Math.sin(i * 1.9 + z) * 0.045;
          points.push({ x: px, y: groundHeight(px, pz, map) + 0.018, z: pz });
        }
        if (points.some((p, i) => i > 0 && Math.abs(p.y - points[i - 1].y) > 0.24)) continue;
        roots.push({ x, z, points });
        if (roots.length === 180) return roots;
      }
    }
  }
  return roots;
}
