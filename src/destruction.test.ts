import { expect, it } from "vitest";
import { Entity } from "playcanvas";
import { Game, TestCollision, idle, pathfind } from "./simulation";
import {
  groundHeight,
  baseGroundHeight,
  industrialMap,
  moveOnMap,
  walkSegment,
  type MapDefinition,
} from "./map";
import { trenchMap } from "./trench-map";
import {
  deformExplosion,
  grenadeExplosionProfile as grenade,
  runtimeMap,
} from "./destruction";
import { TerrainPhysics } from "./physics";
import { terrainGeometry } from "./terrain-geometry";
import { PlaytestLog } from "./playtest";

const empty: MapDefinition = {
  ...industrialMap,
  boxes: [],
  spawn: { blue: { x: -10, z: 0 }, red: { x: 10, z: 0 } },
};
function gameFor(map = empty) {
  const game = new Game(new TestCollision(map), false, 1200, 12345, undefined, {
    map,
  });
  game.botSettings.engagementRange = 0;
  return game;
}
const blast = (
  game: Game,
  x: number,
  z: number,
  y = groundHeight(x, z, game.map) + 0.15,
) => game.explode({ x, y, z }, 0, "blue", grenade);

it("creates a persistent crater from an actual thrown grenade, serializes it, and restores pristine terrain in a new match", () => {
  const game = gameFor();
  game.step({ ...idle(), grenade: true, yaw: Math.PI / 2 });
  const log = new PlaytestLog();
  for (let i = 0; i < 90; i++) {
    game.step(idle());
    log.recordTick(game, idle(), i / 30);
  }
  const explosion = game.events.find((e) => e.type === "grenadeExplosion");
  expect(explosion?.type).toBe("grenadeExplosion");
  if (explosion?.type !== "grenadeExplosion")
    throw new Error("Missing explosion");
  const height = groundHeight(explosion.at.x, explosion.at.z, game.map);
  expect(height).toBeLessThan(-0.1);
  expect(game.snapshot().world?.craters).toHaveLength(1);
  expect(log.summary().craters).toBe(1);
  const snapshot = game.snapshot();
  snapshot.world!.cuts = {};
  expect(groundHeight(explosion.at.x, explosion.at.z, game.map)).toBe(height);
  expect(groundHeight(explosion.at.x, explosion.at.z, empty)).toBe(0);
  expect(gameFor().snapshot().world?.revision).toBe(0);
  expect(Object.keys(gameFor().map.destruction!.cuts)).toHaveLength(0);
});

it("accumulates excavation, widens deep bowls to keep them walkable, and bounds the lowest floor", () => {
  const game = gameFor(trenchMap);
  const original = groundHeight(0, 0, game.map);
  const distantOriginal = groundHeight(12, 0, game.map);
  blast(game, 0, 0);
  const first = groundHeight(0, 0, game.map);
  expect(original - first).toBeGreaterThan(0.25);
  expect(original - first).toBeLessThanOrEqual(grenade.craterDepth);
  blast(game, 0, 0);
  expect(groundHeight(0, 0, game.map)).toBeLessThan(first);
  for (let i = 0; i < 20; i++) blast(game, 0, 0);
  expect(groundHeight(0, 0, game.map)).toBeCloseTo(-0.9, 3);
  expect(walkSegment({ x: -6, z: 0 }, { x: 6, z: 0 }, game.map)).toBe(true);
  for (let x = -5; x <= 5; x += 0.25) {
    const height = groundHeight(x, 0, game.map);
    expect(Number.isFinite(height)).toBe(true);
    expect(height).toBeGreaterThanOrEqual(-0.90001);
    expect(
      Math.abs(height - groundHeight(x + 0.25, 0, game.map)),
    ).toBeLessThanOrEqual(0.2001);
  }
  expect(groundHeight(12, 0, game.map)).toBe(distantOriginal);
});

it("deforms trench floors and parapet tops without erasing the adjacent bank in one blast", () => {
  const game = gameFor(trenchMap);
  blast(game, 23, -1);
  expect(groundHeight(23, -1, game.map)).toBeLessThan(-0.25);
  expect(groundHeight(17, -1, game.map)).toBeCloseTo(2.4);
  blast(game, 17, -1);
  expect(groundHeight(17, -1, game.map)).toBeGreaterThan(1.8);
  expect(groundHeight(17, -1, game.map)).toBeLessThan(2.05);
  expect(
    game.collision.ray({ x: 15, y: 1.5, z: -1 }, { x: 23, y: 1.5, z: -1 }),
  ).toBeLessThan(1);
});

it("attenuates airbursts and lets intact roofs shield terrain below", () => {
  const roof: MapDefinition = {
    ...empty,
    boxes: [{ kind: "building", x: 0, z: 0, w: 4, d: 4, h: 1, baseY: 1.2 }],
  };
  const game = gameFor(roof);
  blast(game, 0, 0, 2.8);
  expect(groundHeight(0, 0, game.map)).toBe(0);
  expect(game.map.boxes).toHaveLength(1);
  blast(game, 8, 0, 8);
  expect(groundHeight(8, 0, game.map)).toBe(0);
  blast(game, 0, 0, 0.15);
  expect(groundHeight(0, 0, game.map)).toBeLessThan(-0.25);
});

it("destroys wood, opens collision and movement, and shields a soldier from the explosion that removes the cover", () => {
  const source: MapDefinition = {
    ...empty,
    boxes: [{ kind: "wood", x: 0, z: 0, w: 0.2, d: 4, h: 2 }],
  };
  const game = gameFor(source);
  const target = {
    ...game.players[0],
    id: 1,
    team: "red" as const,
    x: 1,
    y: 0,
    z: 0,
    hp: 100,
    protectedUntil: 0,
  };
  game.players.push(target);
  const from = { x: -2, y: 0.8, z: 0 },
    to = { x: 2, y: 0.8, z: 0 };
  expect(game.collision.ray(from, to)).toBeLessThan(1);
  expect(walkSegment(from, to, game.map)).toBe(false);
  blast(game, -1, 0, 0.5);
  expect(target.hp).toBe(100);
  expect(game.map.destruction!.objects["cover-0"].stage).toBe(2);
  expect(game.map.boxes).toHaveLength(0);
  expect(game.collision.ray(from, to)).toBe(1);
  expect(walkSegment(from, to, game.map)).toBe(true);
  expect(moveOnMap({ x: -1, z: 0 }, { x: 2, z: 0 }, game.map).x).toBeCloseTo(1);
  expect(source.boxes).toHaveLength(1);
});

it("reduces sandbag height before destruction and never damages concrete buildings", () => {
  const source: MapDefinition = {
    ...empty,
    boxes: [
      { kind: "sandbag", x: 0, z: 0, w: 0.8, d: 3, h: 1.2 },
      { kind: "bunker", x: 0, z: 6, w: 2, d: 2, h: 3 },
    ],
  };
  const game = gameFor(source);
  blast(game, -1, 0, 0.5);
  expect(game.map.destruction!.objects["cover-0"].stage).toBe(1);
  expect(game.map.boxes[0].h).toBeCloseTo(0.72);
  expect(
    game.collision.ray({ x: -2, y: 0.9, z: 0 }, { x: 2, y: 0.9, z: 0 }),
  ).toBe(1);
  blast(game, -1, 0, 0.5);
  expect(game.map.destruction!.objects["cover-0"].stage).toBe(2);
  blast(game, -1.2, 6, 1);
  expect(game.map.boxes.some((box) => box.kind === "bunker")).toBe(true);
});

it("invalidates cached bot navigation so routes can use a destroyed opening", () => {
  const source: MapDefinition = {
    ...empty,
    width: 40,
    depth: 40,
    navSpacing: 2,
    boxes: [
      ...Array.from({ length: 20 }, (_, i) => ({
        kind: "wood" as const,
        x: 0,
        z: -19 + i * 2,
        w: 0.2,
        d: 2,
        h: 2,
      })),
      { kind: "container", x: 6, z: 0, w: 2, d: 6, h: 4 },
    ],
  };
  const game = gameFor(source);
  const a = { x: -10, z: 0 },
    b = { x: 12, z: 0 };
  expect(pathfind(a, b, game.map)).toEqual([]);
  blast(game, -1, 0, 0.5);
  const route = pathfind(a, b, game.map);
  expect(route.length).toBeGreaterThan(1);
  let previous = a;
  for (const point of route) {
    expect(walkSegment(previous, point, game.map)).toBe(true);
    previous = point;
  }
});

it("updates actual Ammo terrain collision to the crater surface and removes the old floor", () => {
  const map = runtimeMap({ ...empty, width: 16, depth: 16 });
  const physics = new TerrainPhysics();
  const entity = new Entity("terrain test");
  try {
    physics.setPatch("0,0", terrainGeometry(map, "0,0"), entity);
    const a = { x: 2, y: 2, z: 2 },
      b = { ...a, y: -2 };
    expect(physics.ray(a, b)).toBeCloseTo(0.5);
    const change = deformExplosion(
      map,
      { x: 2, y: 0.15, z: 2 },
      grenade,
      (a, b) => physics.ray(a, b),
    );
    expect(change?.terrain.length).toBeGreaterThan(0);
    for (const key of change!.patches)
      physics.setPatch(key, terrainGeometry(map, key), entity);
    expect(physics.ray(a, { ...a, y: -0.1 })).toBe(1);
    for (const [x, z] of [
      [2, 2],
      [2.13, 2.21],
      [1.8, 1.93],
    ]) {
      const from = { x, y: 2, z },
        to = { x, y: -2, z };
      const hitHeight = 2 - physics.ray(from, to) * 4;
      expect(hitHeight).toBeCloseTo(groundHeight(x, z, map), 3);
    }
  } finally {
    physics.destroy();
    entity.destroy();
  }
});

it("supports larger future explosion profiles through the same world-damage interface", () => {
  const map = runtimeMap(empty);
  const profile = {
    ...grenade,
    kind: "artillery-test",
    craterRadius: 3,
    craterDepth: 0.7,
  };
  const change = deformExplosion(map, { x: 0, y: 0.1, z: 0 }, profile, () => 1);
  expect(change?.kind).toBe("artillery-test");
  expect(groundHeight(0, 0, map)).toBeLessThan(-0.6);
  expect(groundHeight(2, 0, map)).toBeLessThan(0);
  expect(baseGroundHeight(0, 0, map)).toBe(0);
});

it("one grenade strips lining and chips the bank while lower earth still stops shots", () => {
  const game = gameFor(trenchMap);
  const lining = Object.values(game.map.destruction!.objects).find(
    (object) =>
      object.lining &&
      Math.abs(object.original.x + 18) < 0.2 &&
      Math.abs(object.original.z + 1) < 0.6,
  )!;
  expect(lining).toBeDefined();
  blast(game, -18.5, -1, 1.2);
  expect(lining.stage).toBe(2);
  expect(groundHeight(-17.5, -1, game.map)).toBeGreaterThan(1.3);
  expect(groundHeight(-17.5, -1, game.map)).toBeLessThan(2);
  expect(
    game.collision.ray(
      { x: -18.5, y: 1.2, z: -1 },
      { x: -17.5, y: 1.2, z: -1 },
    ),
  ).toBeLessThan(1);
});

it("actual Ammo rays recognize a chipped parapet crest while the lower bank still blocks shots", () => {
  const map = runtimeMap(trenchMap);
  const physics = new TerrainPhysics();
  const entity = new Entity("bank test");
  try {
    physics.setPatch("-3,-1", terrainGeometry(map, "-3,-1"), entity);
    const a = { x: -18.5, y: 2.25, z: -1 },
      b = { x: -17.5, y: 2.25, z: -1 };
    expect(physics.ray(a, b)).toBeLessThan(1);
    const change = deformExplosion(
      map,
      { x: -17.75, y: 2.55, z: -1 },
      grenade,
      (a, b) => physics.ray(a, b),
    );
    expect(change).not.toBeNull();
    for (const key of change!.patches)
      physics.setPatch(key, terrainGeometry(map, key), entity);
    expect(physics.ray(a, b)).toBe(1);
    expect(physics.ray({ ...a, y: 1.2 }, { ...b, y: 1.2 })).toBeLessThan(1);
  } finally {
    physics.destroy();
    entity.destroy();
  }
});

it("keeps an unrelated mantle running when an explosion changes distant terrain", () => {
  const game = gameFor(trenchMap);
  Object.assign(game.players[0], { x: -18.5, y: 0, z: -27 });
  game.step({ ...idle(), yaw: Math.PI / 2, mantle: true });
  const mantle = game.players[0].mantle;
  expect(mantle).not.toBeNull();
  blast(game, 0, 0);
  expect(game.players[0].mantle).toBe(mantle);
});

it("repeated parapet hits can open a walkable breach without requiring a mantle", () => {
  const game = gameFor(trenchMap);
  const a = { x: -23, z: -1 },
    b = { x: -12, z: -1 };
  expect(walkSegment(a, b, game.map)).toBe(false);
  for (let i = 0; i < 24; i++) blast(game, -17.75, -1);
  expect(walkSegment(a, b, game.map)).toBe(true);
});

it("keeps timber facing surfaces clear of earth to prevent coplanar wall flicker", () => {
  const map = runtimeMap(trenchMap);
  for (const object of Object.values(map.destruction!.objects)) {
    if (!object.lining) continue;
    const box = object.original;
    const direction =
      baseGroundHeight(box.x - 0.2, box.z, map) <
      baseGroundHeight(box.x + 0.2, box.z, map)
        ? -1
        : 1;
    const face = box.x + (direction * box.w) / 2;
    expect(baseGroundHeight(face, box.z, map)).toBeLessThan(
      map.terrain!.bankHeight - 0.05,
    );
  }
});

it("cuts a wider rounded bowl with a soft center and a broad middle rather than a pointed dent", () => {
  const game = gameFor();
  blast(game, 0, 0);
  const depth = (x: number, z = 0) => -groundHeight(x, z, game.map);
  expect(depth(0)).toBeGreaterThan(0.5);
  expect(depth(1.25)).toBeGreaterThan(0.1);
  expect(depth(0) - depth(0.25)).toBeLessThan(0.04);
  expect(depth(0.75)).toBeCloseTo(depth(-0.75), 6);
  expect(depth(0.75)).toBeCloseTo(depth(0, 0.75), 6);
  expect(depth(2.25)).toBeCloseTo(0);
  expect(walkSegment({ x: -3, z: 0 }, { x: 3, z: 0 }, game.map)).toBe(true);
});
