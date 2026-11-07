import { blocked, groundHeight, type MapDefinition, type Vec } from "./map";

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
      const x = (a.x + b.x) / 2 + side * 1.7,
        z = (a.z + b.z) / 2 + side * 1.1,
        y = groundHeight(x, z, map);
      if (blocked(x, z, 0.45, map) || y > 0.1) continue;
      if (
        [
          [-0.5, 0],
          [0.5, 0],
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
