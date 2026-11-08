import { expect, it } from "vitest";
import { Entity } from "playcanvas";
import {
  authoredTerrainCut,
  baseGroundHeight,
  groundHeight,
  groundElevation,
  walkSegment,
  type MapDefinition,
} from "./map";
import { trenchMap } from "./trench-map";
import { Game, idle, TestCollision } from "./simulation";
import { grenadeExplosionProfile } from "./destruction";
import { TerrainPhysics } from "./physics";
import { terrainGeometry } from "./terrain-geometry";

// Terrain-only slope/earth fixtures exclude deliberately obstructing landmarks.
const terrainOnly: MapDefinition = {
  ...trenchMap,
  boxes: trenchMap.boxes.filter((b) => !b.landmark),
};

const unscarred: MapDefinition = {
  ...trenchMap,
  terrain: { ...trenchMap.terrain!, relief: undefined },
};

it("starts with six actual shallow shell craters and gentle traversable depressions", () => {
  const terrain = trenchMap.terrain!;
  expect(terrain.craters).toHaveLength(6);
  for (const crater of terrain.craters) {
    const cut = authoredTerrainCut(crater.x, crater.z, trenchMap);
    expect(cut).toBeGreaterThanOrEqual(crater.depth! - 0.001);
    expect(cut).toBeLessThanOrEqual(0.851);
    expect(groundHeight(crater.x, crater.z, trenchMap)).toBeLessThan(2);
    const a = { x: crater.x - crater.radius - 1, z: crater.z },
      b = { x: crater.x + crater.radius + 1, z: crater.z };
    expect(walkSegment(a, b, terrainOnly)).toBe(true);
  }
  expect(authoredTerrainCut(0, 0, trenchMap)).toBeGreaterThan(0.1);
});

it("never raises terrain and preserves parapets, trench floors, spawns and cover footing", () => {
  let changed = 0;
  for (let x = -78; x <= 78; x += 1)
    for (let z = -62; z <= 62; z += 1) {
      const before = groundHeight(x, z, unscarred),
        after = groundHeight(x, z, trenchMap);
      expect(after).toBeLessThanOrEqual(before + 0.00001);
      if (Math.abs(x) >= 15 || before - groundElevation(x, z, unscarred) < 2.39)
        expect(after).toBe(before);
      if (after < before - 0.01) changed++;
    }
  expect(changed).toBeGreaterThan(500);
  for (const box of trenchMap.boxes.filter((b) => !b.landmark))
    for (const dx of [-box.w / 2, 0, box.w / 2])
      for (const dz of [-box.d / 2, 0, box.d / 2])
        expect(groundHeight(box.x + dx, box.z + dz, trenchMap)).toBe(
          groundHeight(box.x + dx, box.z + dz, unscarred),
        );
  const world = new TestCollision(trenchMap);
  const beforeWorld = new TestCollision(unscarred);
  let clear = 0;
  for (const station of trenchMap.terrain!.firingPositions!.filter(
    (p) => p.team === "blue",
  )) {
    const from = { x: station.x, y: 2.5, z: station.z },
      to = { x: -station.x, y: 2.5, z: station.z };
    const before = beforeWorld.ray(from, to),
      after = world.ray(from, to);
    expect(after).toBeGreaterThanOrEqual(before);
    if (before === 1) {
      expect(after).toBe(1);
      clear++;
    }
  }
  expect(clear).toBeGreaterThanOrEqual(20);
});

it("matches actual Ammo ground hits to the pre-existing crater and keeps terrain firing lanes open", () => {
  const physics = new TerrainPhysics(),
    entity = new Entity("authored crater");
  try {
    physics.setPatch("1,-4", terrainGeometry(trenchMap, "1,-4"), entity);
    for (const [x, z] of [
      [9, -25],
      [9.13, -25.21],
      [10, -26],
    ]) {
      const a = { x, y: 5, z },
        b = { x, y: 0, z };
      expect(5 - physics.ray(a, b) * 5).toBeCloseTo(
        groundHeight(x, z, trenchMap),
        3,
      );
    }
    expect(
      physics.ray({ x: 8, y: 2.5, z: -25 }, { x: 15, y: 2.5, z: -25 }),
    ).toBe(1);
  } finally {
    physics.destroy();
    entity.destroy();
  }
});

it("lets grenades deepen authored craters and restores their original shape in a fresh match", () => {
  const create = () =>
    new Game(new TestCollision(terrainOnly), false, 600, 12345, undefined, {
      map: terrainOnly,
    });
  const game = create(),
    x = 9,
    z = -25;
  const baseline = groundHeight(x, z, game.map);
  expect(game.map.destruction!.revision).toBe(0);
  expect(game.map.destruction!.craters).toHaveLength(0);
  game.explode(
    { x, y: baseline + 0.15, z },
    0,
    "blue",
    grenadeExplosionProfile,
  );
  expect(groundHeight(x, z, game.map)).toBeLessThan(baseline - 0.4);
  expect(baseGroundHeight(x, z, game.map)).toBe(baseline);
  expect(groundHeight(x, z, trenchMap)).toBe(baseline);
  expect(groundHeight(x, z, create().map)).toBe(baseline);
  game.step(idle());
  expect(game.snapshot().world!.craters).toHaveLength(1);
});
