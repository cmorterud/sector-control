import { it, expect } from "vitest";
import { Game, TestCollision, idle } from "./simulation";
import {
  industrialMap,
  groundHeight,
  moveOnMap,
  type MapDefinition,
} from "./map";
import { trenchMap } from "./trench-map";
import {
  damageVegetation,
  grenadeExplosionProfile,
  artilleryExplosionProfile,
  runtimeMap,
} from "./destruction";
import { foliageBlocks } from "./vegetation";
import { availableCraterCover } from "./crater-cover";
import { advanceAssaults, assaultCommand } from "./assault";
import { PlaytestLog } from "./playtest";
const source: MapDefinition = {
  ...industrialMap,
  boxes: [],
  vegetation: [
    { id: "tree-test", kind: "tree", x: 0, z: 0, w: 1, d: 1, h: 6, baseY: 0 },
    {
      id: "brush-test",
      kind: "brush",
      x: 6,
      z: 0,
      w: 2.4,
      d: 2.4,
      h: 1.5,
      baseY: 0,
    },
  ],
};
const shot = { x: -0.5, y: 1, z: 0 };
it("adds deterministic sparse vegetation with clear spawn footprints, solid trunks and soft foliage", () => {
  const trees = trenchMap.vegetation!.filter((b) => b.kind === "tree"),
    brush = trenchMap.vegetation!.filter((b) => b.kind === "brush");
  expect(trees.length).toBeGreaterThanOrEqual(8);
  expect(brush.length).toBeGreaterThan(20);
  for (const b of trees) {
    expect(Math.hypot(b.x + 60, b.z + 1)).toBeGreaterThanOrEqual(16);
    expect(Math.hypot(b.x - 60, b.z + 1)).toBeGreaterThanOrEqual(16);
  }
  const map = runtimeMap(source),
    world = new TestCollision(map);
  expect(world.ray({ x: -3, y: 1, z: 0 }, { x: 3, y: 1, z: 0 })).toBeLessThan(
    1,
  );
  expect(world.ray({ x: -3, y: 4, z: 1 }, { x: 3, y: 4, z: 1 })).toBe(1);
  expect(foliageBlocks(map, { x: -3, y: 4, z: 1 }, { x: 3, y: 4, z: 1 })).toBe(
    true,
  );
  expect(world.ray({ x: 3, y: 0.7, z: 0 }, { x: 9, y: 0.7, z: 0 })).toBe(1);
  expect(
    foliageBlocks(map, { x: 3, y: 0.7, z: 0 }, { x: 9, y: 0.7, z: 0 }),
  ).toBe(true);
  expect(moveOnMap({ x: 4, z: 0 }, { x: 4, z: 0 }, map).x).toBeCloseTo(8);
});
it("chips trees, strips their crowns, then replaces them with destructible physical logs and stumps", () => {
  const map = runtimeMap(source),
    world = new TestCollision(map);
  const first = damageVegetation(map, shot)!;
  expect(first.geometry).toBe(false);
  expect(map.destruction!.terrainRevision).toBe(0);
  for (let i = 1; i < 23; i++) damageVegetation(map, shot);
  expect(map.destruction!.objects["tree-test"].stage).toBe(1);
  expect(foliageBlocks(map, { x: -3, y: 4, z: 1 }, { x: 3, y: 4, z: 1 })).toBe(
    false,
  );
  for (let i = 23; i < 45; i++) damageVegetation(map, shot);
  expect(map.destruction!.objects["tree-test"].stage).toBe(2);
  expect(map.boxes.some((b) => b.id === "tree-test")).toBe(false);
  const log = map.boxes.find((b) => b.kind === "log")!;
  expect(log).toBeDefined();
  expect(map.boxes.some((b) => b.kind === "stump")).toBe(true);
  expect(
    world.ray({ x: log.x, y: 0.6, z: -2 }, { x: log.x, y: 0.6, z: 2 }),
  ).toBeLessThan(1);
  expect(
    world.ray({ x: log.x, y: 1.7, z: -2 }, { x: log.x, y: 1.7, z: 2 }),
  ).toBe(1);
  const g = new Game(new TestCollision(source), false, 1200, 12345, undefined, {
    map: source,
  });
  g.explode({ x: -1, y: 0.5, z: 0 }, 0, "blue", {
    ...artilleryExplosionProfile,
    damage: 0,
  });
  expect(g.map.destruction!.objects["tree-test"].stage).toBe(2);
  expect(g.map.boxes.some((b) => b.kind === "log")).toBe(true);
});
it("rifle projectile impacts actually damage a trunk and eventually fell it", () => {
  const g = new Game(
    new TestCollision(source),
    false,
    2000,
    12345,
    { engagementRange: 0 },
    { map: source },
  );
  const p = g.players[0];
  Object.assign(p, {
    id: 0,
    x: -4,
    y: 0,
    z: 0,
    ammo: 1000,
    yaw: Math.PI / 2,
    pitch: 0,
    nextThink: 1e9,
  });
  const log = new PlaytestLog();
  for (let i = 0; i < 45; i++) {
    p.yaw = Math.PI / 2;
    p.pitch = 0;
    p.recoilPitch = p.recoilYaw = 0;
    g.fire(p);
    for (let j = 0; j < 6; j++) {
      g.step(idle());
      log.recordTick(g, idle(), g.tick / 30);
    }
  }
  expect(g.map.destruction!.objects["tree-test"].stage).toBe(2);
  expect(log.summary().treesFelled).toBe(1);
});
it("clears brush with blast damage and restores pristine vegetation in a new match", () => {
  const g = new Game(new TestCollision(source), false, 1200, 12345, undefined, {
    map: source,
  });
  g.explode({ x: 6, y: 0.2, z: 0 }, 0, "blue", {
    ...grenadeExplosionProfile,
    damage: 0,
  });
  expect(g.map.destruction!.objects["brush-test"].stage).toBe(2);
  expect(
    foliageBlocks(g.map, { x: 3, y: 0.7, z: 0 }, { x: 9, y: 0.7, z: 0 }),
  ).toBe(false);
  const snap = g.snapshot();
  snap.world!.objects["brush-test"].hp = 999;
  expect(g.map.destruction!.objects["brush-test"].hp).toBe(0);
  const fresh = runtimeMap(source);
  expect(fresh.destruction!.objects["brush-test"].stage).toBe(0);
  expect(fresh.boxes.some((b) => b.kind === "log")).toBe(false);
});
it("creates a persistent artillery bowl that actually shields a crouched soldier and is available to squads", () => {
  const g = new Game(
    new TestCollision(trenchMap),
    false,
    1200,
    12345,
    undefined,
    { map: trenchMap },
  );
  const y = groundHeight(0, 0, g.map);
  g.explode({ x: 0, y: y + 0.025, z: 0 }, 0, "blue", {
    ...artilleryExplosionProfile,
    damage: 0,
    structuralDamage: 0,
  });
  const hole = availableCraterCover(g.map).find(
    (c) => c.created && Math.hypot(c.x, c.z) < 1,
  )!;
  expect(hole).toBeDefined();
  expect(hole.depth).toBeGreaterThan(1.1);
  const floor = groundHeight(0, 0, g.map);
  expect(
    g.collision.ray({ x: -10, y: 2.5, z: 0 }, { x: 0, y: floor + 1.05, z: 0 }),
  ).toBeLessThan(1);
  expect(groundHeight(0, 0, trenchMap)).toBe(y);
});
it("routes a later wave through a newly excavated crater and crouches while regrouping there", () => {
  const g = new Game(
    new TestCollision(trenchMap),
    true,
    3000,
    12345,
    undefined,
    { map: trenchMap, teamSize: 25, humanPlayerIds: [] },
  );
  for (const p of g.players) {
    p.hp = 0;
    p.respawnAt = 1e9;
  }
  for (let i = 0; i < 3; i++)
    Object.assign(g.players[i], {
      x: -19,
      z: -1 + i * 0.3,
      y: 0.85,
      hp: 100,
      ammo: 30,
      smokes: 2,
      protectedUntil: 0,
    });
  g.explode(
    { x: -10, y: groundHeight(-10, -1, g.map) + 0.025, z: -1 },
    0,
    "blue",
    { ...artilleryExplosionProfile, damage: 0, structuralDamage: 0 },
  );
  g.tick = 540;
  advanceAssaults(g);
  const m = g.assaults.missions.find((m) => m.team === "blue")!;
  expect(m).toBeDefined();
  expect(m.route[0]).toEqual({ x: -10, z: -1 });
  const p = g.players[m.members[0]];
  m.progress[p.id] = 1;
  m.waitUntil[p.id] = g.tick + 60;
  m.screens[1] = { actor: p.id, tick: g.tick - 100, ready: true };
  Object.assign(p, { x: -10, z: -1, y: groundHeight(-10, -1, g.map) });
  expect(assaultCommand(g, p, idle()).crouch).toBe(true);
});
