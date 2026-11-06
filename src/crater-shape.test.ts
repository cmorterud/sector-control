import { it, expect } from "vitest";
import { Entity } from "playcanvas";
import { Game, TestCollision, idle } from "./simulation";
import { trenchMap } from "./trench-map";
import { groundHeight, walkSegment, type MapDefinition } from "./map";
import { artilleryExplosionProfile } from "./destruction";
import { TerrainPhysics } from "./physics";
import { terrainGeometry } from "./terrain-geometry";

const flat: MapDefinition = {
  ...trenchMap,
  boxes: [],
  vegetation: [],
  terrain: {
    ...trenchMap.terrain!,
    heights: new Float32Array(trenchMap.terrain!.heights.length).fill(2.4),
    ramps: [],
    rectangles: [],
    lining: [],
    relief: undefined,
    craters: [],
    firingPositions: [],
    trenchLines: [],
  },
};
const profile = {
  ...artilleryExplosionProfile,
  damage: 0,
  structuralDamage: 0,
};
const scene = (map = flat) =>
  new Game(new TestCollision(map), false, 3000, 12345, undefined, { map });
function burst(g: Game, x: number, z: number) {
  g.explode({ x, y: groundHeight(x, z, g.map) + 0.025, z }, 0, "blue", profile);
}

it("makes artillery bowls asymmetric, varied and repeatable without raising terrain", () => {
  const run = () => {
    const g = scene();
    for (const x of [-18, 0, 18]) burst(g, x, 0);
    return g;
  };
  const g = run(),
    repeat = run();
  expect(g.map.destruction!.cuts).toEqual(repeat.map.destruction!.cuts);
  const craters = g.map.destruction!.craters;
  expect(new Set(craters.map((c) => c.depth.toFixed(3))).size).toBe(3);
  expect(new Set(craters.map((c) => c.shape!.rotation.toFixed(3))).size).toBe(
    3,
  );
  const depths = Array.from(
    { length: 16 },
    (_, i) =>
      2.4 -
      groundHeight(
        Math.cos((i * Math.PI) / 8) * 2.5,
        Math.sin((i * Math.PI) / 8) * 2.5,
        g.map,
      ),
  );
  expect(Math.max(...depths) - Math.min(...depths)).toBeGreaterThan(0.12);
  expect(
    Math.max(...depths.slice(0, 8).map((d, i) => Math.abs(d - depths[i + 8]))),
  ).toBeGreaterThan(0.04);
  for (let x = -6; x <= 6; x += 0.25)
    for (let z = -6; z <= 6; z += 0.25) {
      const h = groundHeight(x, z, g.map);
      expect(h).toBeGreaterThanOrEqual(-0.90001);
      expect(h).toBeLessThanOrEqual(2.40001);
    }
});

it("uses local shape variation without consuming the combat random stream", () => {
  const a = scene(),
    b = scene();
  burst(a, 0, 0);
  expect(a.random()).toBe(b.random());
  const first = a.map.destruction!.craters[0].shape!;
  burst(a, 0, 0);
  expect(a.map.destruction!.craters[1].shape).not.toEqual(first);
  expect(a.map.destruction!.craters[1].radius).toBeLessThan(8);
});

it("rounds a struck firing-step end into the trench floor while preserving remote ledges and a walking exit", () => {
  const g = scene(trenchMap),
    p = g.players[0];
  Object.assign(p, { x: -19, z: 3.2, y: 0.85, hp: 100, protectedUntil: 0 });
  expect(
    Math.abs(groundHeight(-19, 3.999, g.map) - groundHeight(-19, 4.001, g.map)),
  ).toBeGreaterThan(0.8);
  const distant = groundHeight(-19, 35, g.map);
  burst(g, -19, 3.2);
  for (let x = -19.75; x <= -18.25; x += 0.25)
    expect(
      Math.abs(groundHeight(x, 3.999, g.map) - groundHeight(x, 4.001, g.map)),
    ).toBeLessThan(0.04);
  expect(walkSegment({ x: -19, z: 2.2 }, { x: -19, z: 6.5 }, g.map)).toBe(true);
  expect(groundHeight(-19, 35, g.map)).toBe(distant);
  expect(groundHeight(-17, 12, g.map)).toBeCloseTo(2.4);
  expect(p.fall).not.toBeNull();
  for (let i = 0; i < 45; i++) g.step(idle());
  for (let i = 0; i < 30; i++) g.step({ ...idle(), z: 1, yaw: Math.PI });
  expect(p.z).toBeGreaterThan(5.8);
  expect(p.fall).toBeNull();
  expect(p.y).toBeCloseTo(groundHeight(p.x, p.z, g.map));
  expect(p.hp).toBe(100);
});

it("keeps actual Ammo collision aligned with the rounded step pocket", () => {
  const g = scene(trenchMap);
  burst(g, -19, 3.2);
  const physics = new TerrainPhysics(),
    entity = new Entity("rounded crater");
  try {
    for (const key of Object.keys(g.map.destruction!.patches))
      physics.setPatch(key, terrainGeometry(g.map, key), entity);
    for (const z of [2.2, 3.9, 4.1, 5.5]) {
      const x = -19;
      const f = physics.ray({ x, y: 4, z }, { x, y: -2, z });
      expect(f).toBeLessThan(1);
      expect(4 - 6 * f).toBeCloseTo(groundHeight(x, z, g.map), 2);
    }
  } finally {
    physics.destroy();
    entity.destroy();
  }
});
