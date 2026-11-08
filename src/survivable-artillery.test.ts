import { it, expect } from "vitest";
import { Game, TestCollision, pathfind } from "./simulation";
import { industrialMap, groundHeight, blocked, walkSegment } from "./map";
import {
  artilleryExplosionProfile,
  grenadeExplosionProfile,
} from "./destruction";
import {
  requestArtillery,
  perceivedArtillery,
  evadeArtillery,
} from "./artillery";
import { trenchMap } from "./trench-map";
import { terrainRayCeiling } from "./terrain-ray-bounds";
import { Renderer } from "./rendering";
const flat = { ...industrialMap, boxes: [] };
const scene = () => {
  const g = new Game(new TestCollision(flat), false, 5000, 12345, undefined, {
    map: flat,
  });
  Object.assign(g.players[0], { x: -25, z: 0, y: 0, protectedUntil: 0 });
  return g;
};
const cosmetic = {
  ...artilleryExplosionProfile,
  structuralDamage: 0,
  craterRadius: 0,
};
it("preserves the original open-ground kill radius while reducing only the excavation footprint", () => {
  const g = scene();
  for (const [i, x] of [0, 3, 5, 7, 9, 13].entries())
    g.players.push({ ...g.players[0], id: i + 1, x, team: "red", hp: 100 });
  g.explode({ x: 0, y: 0.9, z: 0 }, 0, "blue", cosmetic);
  expect(g.players.slice(1).map((p) => p.hp)).toEqual([0, 0, 0, 0, 40, 100]);
  expect(artilleryExplosionProfile.radius).toBe(12);
  expect(artilleryExplosionProfile.structuralDamage).toBe(260);
  expect(artilleryExplosionProfile.craterDepth).toBe(1.3);
  expect(artilleryExplosionProfile.craterRadius).toBe(2.5);
  expect(artilleryExplosionProfile.bankDepth).toBe(1.6);
});
it("protects partially exposed bodies and crouched soldiers behind earth without changing grenade damage", () => {
  const g = scene();
  g.players.push({ ...g.players[0], id: 1, x: 3, team: "red", hp: 100 });
  g.collision.ray = (_a, b) => (b.y >= 1.3 ? 1 : 0);
  g.explode({ x: 0, y: 0.9, z: 0 }, 0, "blue", cosmetic);
  expect(g.players[1].hp).toBe(40);
  g.players[1].crouched = true;
  g.explode({ x: 0, y: 0.9, z: 0 }, 0, "blue", cosmetic);
  expect(g.players[1].hp).toBe(40);
  Object.assign(g.players[1], { hp: 100, crouched: false });
  g.explode({ x: 0, y: 0.9, z: 0 }, 0, "blue", {
    ...grenadeExplosionProfile,
    structuralDamage: 0,
    craterRadius: 0,
  });
  expect(g.players[1].hp).toBe(20);
});
it("lets actual trench earth shield the floor and crouched step while exposed heads take damage", () => {
  const g = new Game(
    new TestCollision(trenchMap),
    false,
    5000,
    12345,
    undefined,
    { map: trenchMap },
  );
  Object.assign(g.players[0], { x: -60, z: 0, protectedUntil: 0 });
  const p = {
    ...g.players[0],
    id: 1,
    x: -21,
    y: 0,
    z: -1,
    team: "red" as const,
    hp: 100,
  };
  g.players.push(p);
  const at = { x: -16.5, y: 2.425, z: -1 };
  g.explode(at, 0, "blue", cosmetic);
  expect(p.hp).toBe(100);
  Object.assign(p, { x: -19, y: 0.85, hp: 100 });
  g.explode(at, 0, "blue", cosmetic);
  expect(p.hp).toBeGreaterThan(0);
  expect(p.hp).toBeLessThan(100);
  Object.assign(p, { hp: 100, crouched: true });
  g.explode(at, 0, "blue", cosmetic);
  expect(p.hp).toBe(100);
});
it("does not render hidden artillery mission warning rings", () => {
  const g = scene();
  g.tick = 600;
  expect(requestArtillery(g, g.players[0], { x: 10, z: 0 })).toBe(true);
  let destroyed = false;
  const renderer = Object.assign(Object.create(Renderer.prototype), {
    artilleryMarkers: new Map([
      [
        1,
        {
          destroy: () => {
            destroyed = true;
          },
        },
      ],
    ]),
    artilleryPreview: null,
    shells: new Map(),
  });
  renderer.drawArtillery(g, 0);
  expect(destroyed).toBe(true);
  expect(renderer.artilleryMarkers.size).toBe(0);
});
it("gives bots no advance mission knowledge and lets physical flight/impact memories expire", () => {
  const g = scene(),
    p = { ...g.players[0], id: 1, x: 10 };
  g.players.push(p);
  g.tick = 600;
  expect(requestArtillery(g, g.players[0], { x: 10, z: 0 })).toBe(true);
  expect(perceivedArtillery(g, p)).toBeUndefined();
  expect(evadeArtillery(g, p)).toBeNull();
  g.artillery.shells.push({
    id: 1,
    mission: 1,
    actor: 0,
    team: "blue",
    x: 10,
    y: 35,
    z: 0,
    vx: 0,
    vy: -40,
    vz: 0,
    bornAt: g.tick,
  });
  expect(perceivedArtillery(g, p)?.id).toBe(1);
  expect(evadeArtillery(g, p)).not.toBeNull();
  g.artillery.shells = [];
  g.artillery.reports = [{ mission: 1, at: { x: 10, z: 0 }, tick: g.tick }];
  expect(perceivedArtillery(g, p)?.id).toBe(1);
  g.tick += 91;
  expect(perceivedArtillery(g, p)).toBeUndefined();
  expect(evadeArtillery(g, p)).toBeNull();
});
it("connects the extra trench loops and six screened shelter bays with walkable, covered routes", () => {
  const g = new Game(
    new TestCollision(trenchMap),
    false,
    5000,
    12345,
    undefined,
    { map: trenchMap },
  );
  expect(g.map.terrain!.branchRoutes).toHaveLength(12);
  expect(g.map.terrain!.shelterBays).toHaveLength(6);
  for (const route of g.map.terrain!.branchRoutes!) {
    for (let i = 1; i < route.points.length; i++)
      expect(
        walkSegment(route.points[i - 1], route.points[i], g.map),
        JSON.stringify(route),
      ).toBe(true);
    const target = route.points.at(-1)!;
    expect(pathfind(route.points[0], target, g.map).length).toBeGreaterThan(0);
  }
  for (const bay of g.map.terrain!.shelterBays!) {
    expect(groundHeight(bay.x, bay.z, g.map)).toBe(0);
    expect(blocked(bay.x, bay.z, 0.7, g.map)).toBe(false);
    expect(
      g.collision.ray({ x: 0, y: 2.6, z: bay.z }, { ...bay, y: 1.05 }),
    ).toBeLessThan(1);
  }
});
it("keeps high-ray rejection conservative across raised terrain, solid cover and map boundaries", () => {
  const world = new TestCollision(trenchMap);
  expect(terrainRayCeiling(trenchMap, -20, 20, -2, 2)).toBeLessThan(2.5);
  expect(world.ray({ x: -15, y: 2.5, z: 0 }, { x: 15, y: 2.5, z: 0 })).toBe(1);
  expect(
    world.ray({ x: -21, y: 1, z: -1 }, { x: -15, y: 1, z: -1 }),
  ).toBeLessThan(1);
  expect(world.ray({ x: 77, y: 3, z: 0 }, { x: 81, y: 3, z: 0 })).toBeLessThan(
    1,
  );
  const wall = new TestCollision({
    ...flat,
    boxes: [{ x: 0, z: 0, w: 1, d: 4, h: 8, kind: "building" }],
  });
  expect(wall.ray({ x: -3, y: 5, z: 0 }, { x: 3, y: 5, z: 0 })).toBeLessThan(1);
});
