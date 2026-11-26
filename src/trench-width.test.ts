import { expect, it } from "vitest";
import { Entity } from "playcanvas";
import { TestCollision } from "./simulation";
import { trenchMap } from "./trench-map";
import { groundHeight, walkSegment } from "./map";
import { terrainGeometry } from "./terrain-geometry";
import { TerrainPhysics } from "./physics";

it("keeps two-meter floor lanes and a compact four-meter firing bay with a real ramp and step", () => {
  for (const x of [-21.8, -21, -20.2])
    expect(groundHeight(x, -1, trenchMap)).toBe(0);
  expect(groundHeight(-22.9, -1, trenchMap)).toBeCloseTo(2.4);
  expect(groundHeight(-19.5, -1, trenchMap)).toBeCloseTo(0.425);
  expect(groundHeight(-18.5, -1, trenchMap)).toBeCloseTo(0.85);
  expect(groundHeight(-17.1, -1, trenchMap)).toBeCloseTo(2.4);
  expect(walkSegment({ x: -21, z: -1 }, { x: -18.5, z: -1 }, trenchMap)).toBe(
    true,
  );
  for (const [x, z] of [
    [-45, -25],
    [-31, -43],
  ]) {
    expect(groundHeight(x, z, trenchMap)).toBe(0);
    expect(groundHeight(x - 0.8, z, trenchMap)).toBe(0);
    expect(groundHeight(x + 0.8, z, trenchMap)).toBe(0);
    expect(groundHeight(x - 1.9, z, trenchMap)).toBeCloseTo(2.4);
    expect(groundHeight(x + 1.9, z, trenchMap)).toBeCloseTo(2.4);
  }
});
it("matches real Ammo to narrow floors, step ramps and banks without refining distant open ground", () => {
  const physics = new TerrainPhysics(),
    root = new Entity("tight trenches");
  try {
    const sites = [
      [-21.4, -1],
      [-20.1, -1],
      [-19.75, -1],
      [-19.25, -1],
      [-18.5, -1],
      [-17.5, -1],
      [-45, -19],
      [-31, -33],
      [-43, -1],
    ];
    for (const key of new Set(
      sites.map(([x, z]) => `${Math.floor(x / 8)},${Math.floor(z / 8)}`),
    ))
      physics.setPatch(key, terrainGeometry(trenchMap, key), root);
    for (const [x, z] of sites)
      expect(
        6 - 8 * physics.ray({ x, y: 6, z }, { x, y: -2, z }),
        `${x},${z}`,
      ).toBeCloseTo(groundHeight(x, z, trenchMap), 3);
    expect(terrainGeometry(trenchMap, "8,0").positions.length).toBe(192);
  } finally {
    physics.destroy();
    root.destroy();
  }
});

it("seals the earth faces at narrow junctions in the rendered Ammo mesh", () => {
  const map = { ...trenchMap, boxes: [], vegetation: [] };
  const expected = new TestCollision(map);
  const physics = new TerrainPhysics(),
    root = new Entity("sealed junctions");
  const sites = [
    ...map.terrain!.communicationRoutes!,
    ...map.terrain!.branchRoutes!,
  ].flatMap((r) => r.points);
  try {
    const patches = new Set<string>();
    for (const p of sites)
      for (const dx of [-4, 0, 4])
        for (const dz of [-4, 0, 4])
          patches.add(
            `${Math.floor((p.x + dx) / 8)},${Math.floor((p.z + dz) / 8)}`,
          );
    for (const key of patches)
      physics.setPatch(key, terrainGeometry(map, key), root);
    for (const p of sites)
      for (const dx of [-3, -1.5, 0, 1.5, 3])
        for (const dz of [-3, -1.5, 0, 1.5, 3]) {
          if (!dx && !dz) continue;
          const a = { x: p.x + 0.13, z: p.z + 0.17, y: 1 },
            b = { x: a.x + dx, z: a.z + dz, y: 1 };
          const hit = expected.ray(a, b);
          if (hit < 0.999)
            expect(physics.ray(a, b), JSON.stringify({ a, b })).toBeCloseTo(
              hit,
              2,
            );
        }
  } finally {
    physics.destroy();
    root.destroy();
  }
});
