import { expect, it } from "vitest";
import {
  exactFieldChurn,
  fieldChurn,
  groundField,
  groundSurfacePixels,
  trenchChurn,
  groundPuddles,
  groundRubble,
} from "./ground-surface";
import { soilColor } from "./battlefield-look";
import { trenchMap } from "./trench-map";
import { verdunMap } from "./verdun-map";
import { villageMap } from "./village-map";
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

it("churns no-man's land and the trench sides to bare wet mud, keeping grass on the rear ground", () => {
  const mean = (points: [number, number][], key: "wet" | "grass" | "wear") =>
    points.reduce((n, [x, z]) => n + groundField(trenchMap, x, z)[key], 0) / points.length;
  const grid = (x0: number, x1: number) => {
    const out: [number, number][] = [];
    for (let x = x0; x <= x1; x += 2) for (let z = -50; z <= 50; z += 5) out.push([x, z]);
    return out;
  };
  const noMans = grid(-10, 10), rear = [...grid(-76, -62), ...grid(62, 76)];
  expect(mean(noMans, "grass")).toBeLessThan(0.03);
  expect(mean(rear, "grass")).toBeGreaterThan(mean(noMans, "grass") * 5);
  expect(mean(noMans, "wet")).toBeGreaterThan(mean(rear, "wet"));
  expect(mean(noMans, "wear")).toBeGreaterThan(0.35);
  for (const [x, z] of noMans) expect(trenchChurn(trenchMap, x, z)).toBeGreaterThan(0.7);
  // Beside a rear trench the ground is trodden; 20 m behind it, it is not.
  expect(trenchChurn(trenchMap, -44.5, 13)).toBeGreaterThan(0.5);
  expect(trenchChurn(trenchMap, -70, 13)).toBe(0);
  expect(trenchChurn(industrialMap, 0, 0)).toBe(0);
  // Dead grass bakes as straw: no greener than it is red.
  const size = 96, pixels = groundSurfacePixels(trenchMap, size).diffuse;
  let greener = 0;
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 1] > pixels[i]) greener++;
  expect(greener).toBe(0);
});

it("churns Verdun where it was fought over, but keeps the leaf litter under its trees", () => {
  const t = verdunMap.terrain!;
  // Every trench floor is trodden mud, and so is every shell scar's bowl.
  for (const line of t.trenchLines!) for (const s of line.sections) expect(fieldChurn(verdunMap, s.x, s.z)).toBeGreaterThan(0.75);
  for (const scar of t.shellScars!) expect(fieldChurn(verdunMap, scar.x, scar.z)).toBeGreaterThan(0.8);
  // The baked grid matches the exact field to within its interpolation.
  for (const [x, z] of [[-30, 7], [12.3, -40.1], [-80, 30], [55.5, 0.25]])
    expect(Math.abs(fieldChurn(verdunMap, x, z) - exactFieldChurn(verdunMap, x, z))).toBeLessThan(0.06);
  // Deep in a woodland belt the ground is barely touched and the litter remains;
  // behind the rear lines it is untouched.
  expect(fieldChurn(verdunMap, -34, 48)).toBeLessThan(0.3);
  expect(groundField(verdunMap, -34, 48).litter).toBeGreaterThan(0.5);
  expect(fieldChurn(verdunMap, -96, 0)).toBe(0);
  // Open ground between the front lines is mostly bare.
  const open = [[-20, -1], [26, 1], [0, 21], [-24, 21]].map(([x, z]) => groundField(verdunMap, x, z).grass);
  expect(Math.max(...open)).toBeLessThan(0.3);
  // Churn is Verdun's opt-in: Village front's ground is unchanged.
  expect(villageMap.noMansLand).toBeUndefined();
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

it("keeps cobble relief independent of the soil footpaths beneath a fully paved surface",()=>{
  const map={...trenchMap,id:"industrial" as const,width:12,depth:12,buildings:[],streets:[{width:20,points:[{x:-12,z:0},{x:12,z:0}]}],
    terrain:{...trenchMap.terrain!,communicationRoutes:[]}};
  const worn={...map,terrain:{...map.terrain,communicationRoutes:[{team:"blue" as const,entrance:{x:0,z:-6},points:[{x:0,z:-6},{x:0,z:6}]}]}};
  expect(groundField(worn,0,-5).wear).not.toBe(groundField(map,0,-5).wear);
  const first=groundSurfacePixels(map,96),second=groundSurfacePixels(worn,96);
  expect(first.normal).toEqual(second.normal);
  expect(new Set(first.normal).size).toBeGreaterThan(15);
});

it("places shallow level puddles inside authored hollows and low rubble near worn approaches", () => {
  const puddles = groundPuddles(trenchMap);
  expect(puddles.length).toBeGreaterThanOrEqual(6);
  expect(puddles.length).toBeLessThanOrEqual(13);
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
