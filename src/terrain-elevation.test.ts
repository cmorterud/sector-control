import { expect, it } from "vitest";
import { Entity } from "playcanvas";
import {
  baseGroundHeight,
  groundElevation,
  groundHeight,
  walkSegment,
  type MapDefinition,
} from "./map";
import { trenchMap } from "./trench-map";
import { buildTrenchElevation } from "./terrain-relief";
import { terrainGeometry } from "./terrain-geometry";
import { TerrainPhysics } from "./physics";
import { Game, TestCollision } from "./simulation";
import { grenadeExplosionProfile } from "./destruction";

const level: MapDefinition = {
  ...trenchMap,
  terrain: { ...trenchMap.terrain!, elevation: undefined },
};

it("starts with repeatable broad rises and hollows across the field and rear ground", () => {
  const field = trenchMap.terrain!.elevation!;
  expect(buildTrenchElevation(trenchMap)).toEqual(field);
  const values = [...field.values];
  expect(Math.min(...values)).toBeLessThan(-0.7);
  expect(Math.max(...values)).toBeGreaterThan(0.2);
  expect(
    values.every((h) => Number.isFinite(h) && h >= -0.951 && h <= 0.321),
  ).toBe(true);
  for (const area of [
    { min: -14, max: 14 },
    { min: -76, max: -54 },
    { min: 54, max: 76 },
  ]) {
    let changed = 0;
    const heights: number[] = [];
    for (let x = area.min; x <= area.max; x += 2)
      for (let z = -56; z <= 56; z += 2) {
        const h = groundElevation(x, z, trenchMap);
        heights.push(h);
        if (Math.abs(h) > 0.08) changed++;
      }
    expect(changed).toBeGreaterThan(70);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.8);
  }
});

it("preserves trench floors, firing steps, bank lips, entry ramps and fixed footing", () => {
  const t = trenchMap.terrain!;
  for (let row = 0; row < t.rows; row++)
    for (let col = 0; col < t.columns; col++) {
      if (t.heights[row * t.columns + col] >= t.bankHeight) continue;
      const x = -trenchMap.width / 2 + (col + 0.5) * t.cellSize,
        z = -trenchMap.depth / 2 + (row + 0.5) * t.cellSize;
      for (const [dx, dz] of [
        [0, 0],
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ])
        expect(groundHeight(x + dx, z + dz, trenchMap)).toBe(
          groundHeight(x + dx, z + dz, level),
        );
    }
  for (const rect of [...t.ramps, ...trenchMap.boxes])
    for (const dx of [-rect.w / 2, 0, rect.w / 2])
      for (const dz of [-rect.d / 2, 0, rect.d / 2])
        expect(groundElevation(rect.x + dx, rect.z + dz, trenchMap)).toBe(0);
  for (const spawn of Object.values(trenchMap.spawn))
    for (let dx = -5; dx <= 5; dx++)
      for (let dz = -4; dz <= 4; dz++)
        expect(groundElevation(spawn.x + dx, spawn.z + dz, trenchMap)).toBe(0);
  for (const b of trenchMap.vegetation!)
    expect(b.baseY).toBe(groundHeight(b.x, b.z, trenchMap));
  expect(
    trenchMap.vegetation!.some((b) => Math.abs(b.baseY! - t.bankHeight) > 0.1),
  ).toBe(true);
});

it("uses walkable slopes and matching real Ammo triangles without globally refining terrain", () => {
  for (const z of [-56, -32, -8, 0, 8, 32, 56])
    expect(walkSegment({ x: -14, z }, { x: 14, z }, trenchMap)).toBe(true);
  const field = trenchMap.terrain!.elevation!;
  const extremes = [0, 0];
  for (let i = 0; i < field.values.length; i++) {
    if (field.values[i] < field.values[extremes[0]]) extremes[0] = i;
    if (field.values[i] > field.values[extremes[1]]) extremes[1] = i;
  }
  const physics = new TerrainPhysics(),
    entities: Entity[] = [];
  try {
    for (const index of extremes) {
      const x = field.originX + (index % field.columns) * field.spacing + 0.37,
        z =
          field.originZ +
          Math.floor(index / field.columns) * field.spacing +
          0.61,
        key = `${Math.floor(x / 8)},${Math.floor(z / 8)}`,
        data = terrainGeometry(trenchMap, key),
        entity = new Entity("rolling terrain");
      entities.push(entity);
      expect(data.positions.length).toBe(
        terrainGeometry(level, key).positions.length,
      );
      physics.setPatch(key, data, entity);
      for (const [dx, dz] of [
        [0, 0],
        [0.13, -0.21],
        [-0.11, 0.17],
      ]) {
        const a = { x: x + dx, y: 6, z: z + dz },
          b = { ...a, y: -1 };
        expect(6 - physics.ray(a, b) * 7).toBeCloseTo(
          groundHeight(a.x, a.z, trenchMap),
          3,
        );
      }
    }
  } finally {
    physics.destroy();
    for (const e of entities) e.destroy();
  }
});

it("excavates the uneven starting surface and restores it on a fresh match", () => {
  const create = () =>
    new Game(new TestCollision(trenchMap), false, 300, 12345, undefined, {
      map: trenchMap,
    });
  const g = create(),
    x = 0,
    z = -8,
    before = groundHeight(x, z, g.map);
  expect(Math.abs(groundElevation(x, z, g.map))).toBeGreaterThan(0.1);
  g.explode({ x, y: before + 0.025, z }, 0, "blue", grenadeExplosionProfile);
  expect(groundHeight(x, z, g.map)).toBeLessThan(before - 0.4);
  expect(baseGroundHeight(x, z, g.map)).toBe(before);
  expect(groundHeight(x, z, create().map)).toBe(before);
  expect(groundHeight(x, z, trenchMap)).toBe(before);
});
