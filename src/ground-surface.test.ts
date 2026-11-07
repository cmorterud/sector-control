import { expect, it } from "vitest";
import {
  groundField,
  groundSurfacePixels,
  groundPuddles,
  groundRubble,
} from "./ground-surface";
import { soilColor } from "./battlefield-look";
import { trenchMap } from "./trench-map";
import { groundHeight, industrialMap } from "./map";
import { Game, TestCollision } from "./simulation";
import { grenadeExplosionProfile } from "./destruction";
import { terrainGeometry } from "./terrain-geometry";

it("spreads distinct wet, dry and faded grass areas over the field and wears authored approaches", () => {
  const samples = [];
  for (let x = -72; x <= 72; x += 4)
    for (let z = -56; z <= 56; z += 4)
      samples.push(groundField(trenchMap, x, z));
  for (const channel of ["wet", "dry", "grass"] as const) {
    const values = samples.map((s) => s[channel]);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.5);
    expect(values.every((v) => v >= 0 && v <= 1)).toBe(true);
  }
  for (const r of trenchMap.terrain!.communicationRoutes!)
    expect(
      groundField(trenchMap, r.entrance.x, r.entrance.z).wear,
    ).toBeGreaterThanOrEqual(0.35);
  expect(groundField(trenchMap, -75, 56).wear).toBe(0);
});

it("bakes a reproducible map-wide surface without a repeated three-meter color/normal/gloss tile", () => {
  const map = new Game(
    new TestCollision(trenchMap),
    false,
    500,
    12345,
    undefined,
    { map: trenchMap },
  ).map;
  const before = JSON.stringify(map.destruction);
  const first = groundSurfacePixels(map, 160),
    second = groundSurfacePixels(map, 160);
  expect(first).toEqual(second);
  expect(JSON.stringify(map.destruction)).toBe(before);
  let colorDifference = 0,
    comparisons = 0;
  for (let z = 10; z < 150; z += 4)
    for (let x = 10; x < 145; x += 4) {
      const i = (z * 160 + x) * 4,
        j = i + 3 * 4;
      colorDifference += Math.abs(first.diffuse[i] - first.diffuse[j]);
      comparisons++;
      const n = [first.normal[i], first.normal[i + 1], first.normal[i + 2]].map(
        (v) => (v / 255) * 2 - 1,
      );
      expect(Math.hypot(...n)).toBeCloseTo(1, 1);
      expect(first.diffuse[i + 3]).toBe(255);
    }
  expect(colorDifference / comparisons).toBeGreaterThan(3);
  expect(
    new Set(first.gloss.filter((_, i) => i % 4 === 0)).size,
  ).toBeGreaterThan(60);
});

it("places shallow level puddles inside authored hollows and low rubble near worn approaches", () => {
  const puddles = groundPuddles(trenchMap);
  expect(puddles.length).toBeGreaterThanOrEqual(6);
  expect(puddles.length).toBeLessThanOrEqual(9);
  for (const p of puddles) {
    expect(p.indices.length).toBeGreaterThan(0);
    expect(p.positions.every(Number.isFinite)).toBe(true);
    for (let i = 0; i < p.positions.length; i += 3) {
      const [x, y, z] = p.positions.slice(i, i + 3);
      expect(y).toBe(p.y);
      expect(Math.hypot(x - p.x, z - p.z)).toBeLessThanOrEqual(
        p.radius + 0.001,
      );
      const depth = y - groundHeight(x, z, trenchMap);
      expect(depth).toBeGreaterThan(-0.02);
      expect(depth).toBeLessThan(0.1);
    }
  }
  const rubble = groundRubble(trenchMap);
  expect(rubble).toHaveLength(30);
  expect(
    rubble.every(
      (p) =>
        p.h <= 0.1 && Math.abs(p.y - groundHeight(p.x, p.z, trenchMap)) < 0.001,
    ),
  ).toBe(true);
  expect(groundPuddles(industrialMap)).toEqual([]);
  expect(groundRubble(industrialMap)).toEqual([]);
});

it("gives fresh runtime cuts warmer exposed soil without changing geometry, old scars or baked material registration", () => {
  const g = new Game(
    new TestCollision(trenchMap),
    false,
    1000,
    12345,
    undefined,
    { map: trenchMap },
  );
  const before = terrainGeometry(g.map, "0,0");
  const weathered = soilColor(0, 2.4, 0, false, 0),
    fresh = soilColor(0, 2.4, 0, false, 0.7);
  expect(fresh[0] / fresh[2]).toBeGreaterThan(weathered[0] / weathered[2]);
  const bakedBefore = groundSurfacePixels(g.map, 32);
  const expected = groundField(g.map, 0, 0);
  g.explode({ x: 0, y: groundHeight(0, 0, g.map) + 0.05, z: 0 }, 0, "blue", {
    ...grenadeExplosionProfile,
    damage: 0,
  });
  const after = terrainGeometry(g.map, "0,0");
  expect(after.positions).not.toEqual(before.positions);
  expect(after.colors).not.toEqual(before.colors);
  expect(groundSurfacePixels(g.map, 32)).toEqual(bakedBefore);
  expect(groundField(g.map, 0, 0)).toEqual(expected);
  const freshMatch = new Game(
    new TestCollision(trenchMap),
    false,
    1000,
    12345,
    undefined,
    { map: trenchMap },
  );
  expect(terrainGeometry(freshMatch.map, "0,0")).toEqual(before);
});
