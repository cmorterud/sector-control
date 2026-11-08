import { expect, it } from "vitest";
import { Entity } from "playcanvas";
import { buildTrenchBanks } from "./trench-banks";
import { trenchMap } from "./trench-map";
import { groundHeight, industrialMap, moveOnMap, walkSegment } from "./map";
import { TerrainPhysics } from "./physics";
import { terrainGeometry } from "./terrain-geometry";

it("rounds both earth shoulders without narrowing the floor or turning banks into walkable exits", () => {
  for (const side of [-1, 1]) {
    const heights = [0, 0.25, 0.5, 0.75, 1].map((d) =>
      groundHeight(-45 + side * (1 + d), -9, trenchMap),
    );
    expect(heights[0]).toBe(0);
    expect(heights[1]).toBeGreaterThan(0.3);
    expect(heights[1]).toBeLessThan(1.1);
    expect(heights[2]).toBeGreaterThan(1.5);
    expect(heights[2]).toBeLessThan(2.4);
    expect(heights[4]).toBeCloseTo(2.4);
    expect(heights.every((h, i) => !i || h >= heights[i - 1])).toBe(true);
    expect(
      walkSegment({ x: -45, z: -9 }, { x: -45 + side * 3, z: -9 }, trenchMap),
    ).toBe(false);
  }
  for (const x of [-45.8, -45, -44.2])
    expect(groundHeight(x, -9, trenchMap)).toBe(0);
  expect(groundHeight(-19.5, -1, trenchMap)).toBeCloseTo(0.425);
  expect(groundHeight(-18.5, -1, trenchMap)).toBeCloseTo(0.85);
  const entry = trenchMap.terrain!.ramps.find(
    (r) => r.high === 2.4 && r.z === -1,
  )!;
  const outside = entry.x + entry.direction * (entry.w / 2 + 0.25);
  expect(groundHeight(outside, entry.z, trenchMap)).toBeCloseTo(2.4);
  expect(industrialMap.terrain).toBeUndefined();
});

it("seals rounded shoulders and corners with actual Ammo triangles, leaving remote ground coarse", () => {
  const physics = new TerrainPhysics(),
    root = new Entity("rounded banks");
  const sites = [
    [-46.13, -9.17],
    [-46.37, -9.17],
    [-46.62, -9.17],
    [-46.84, -9.17],
    [-43.86, -9.17],
    [-43.59, -9.17],
    [-46.37, -22.41],
    [-46.61, -22.19],
    [-22.42, -1.17],
    [-17.59, -1.17],
    [-48.2, -1.17],
  ];
  try {
    for (const key of new Set(
      sites.map(([x, z]) => `${Math.floor(x / 8)},${Math.floor(z / 8)}`),
    ))
      physics.setPatch(key, terrainGeometry(trenchMap, key), root);
    for (const [x, z] of sites)
      expect(
        6 - 8 * physics.ray({ x, z, y: 6 }, { x, z, y: -2 }),
        `${x},${z}`,
      ).toBeCloseTo(groundHeight(x, z, trenchMap), 3);
    expect(
      physics.ray({ x: -45, z: -9, y: 1.2 }, { x: -48, z: -9, y: 1.2 }),
    ).toBeLessThan(1);
    expect(terrainGeometry(trenchMap, "8,0").positions.length).toBe(192);
  } finally {
    physics.destroy();
    root.destroy();
  }
});

it("bakes the same resting shape again and varies shoulder width along the trench without runtime randomness", () => {
  expect(buildTrenchBanks(trenchMap)).toEqual(trenchMap.terrain!.banks);
  const shoulders = [-17, -15, -9, -11, -9].map((z) =>
    groundHeight(-46.5, z, trenchMap),
  );
  expect(Math.max(...shoulders) - Math.min(...shoulders)).toBeGreaterThan(0.05);
});

it("cannot creep up a rounded bank with tiny movement deltas", () => {
  for (const delta of [0.003, 0.03, 0.15]) {
    let p = { x: -18.6, z: -27 };
    for (let i = 0; i < Math.ceil(4 / delta); i++)
      p = moveOnMap(p, { x: delta, z: 0 }, trenchMap);
    expect(p.x).toBeLessThan(-17.8);
    expect(groundHeight(p.x, p.z, trenchMap)).toBeLessThan(0.23);
  }
});
