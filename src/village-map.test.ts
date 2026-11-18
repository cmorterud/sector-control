import { expect, it } from "vitest";
import { villageMap } from "./village-map";
import { blocked, groundHeight, walkSegment } from "./map";
import { Game, TestCollision, pathfind, botCommand } from "./simulation";
import { artilleryExplosionProfile } from "./destruction";
import { villageRoad } from "./ground-surface";
import { footSurface } from "./battlefield";

const scene = (bots = false) =>
  new Game(new TestCollision(villageMap), bots, 3600, 12345, undefined, {
    map: villageMap,
    humanPlayerIds: [],
    ambientArtillery: false,
  });
it("offers 50v50 domination with WW1 weapons and clear spawning/flag footing", () => {
  const g = scene(true);
  expect(g.players).toHaveLength(100);
  expect(g.scoring).toBe("domination");
  expect(g.players.filter((p) => p.weapon === "machineGun")).toHaveLength(8);
  for (const p of g.players) expect(blocked(p.x, p.z, 0.6, g.map)).toBe(false);
  for (const flag of g.sectors)
    expect(blocked(flag.x, flag.z, 0.5, g.map)).toBe(false);
  expect(villageMap.terrain!.trenchLines).toHaveLength(4);
});
it("connects both spawn formations through sunken approaches to every flag", () => {
  const g = scene();
  for (const team of ["blue", "red"] as const)
    for (const flag of g.sectors) {
      let p = villageMap.spawn[team];
      const route = pathfind(p, flag, g.map);
      expect(route.length, `${team} to ${flag.id}`).toBeGreaterThan(0);
      for (const next of route) {
        expect(
          walkSegment(p, next, g.map),
          `${team} to ${flag.id}: ${JSON.stringify([p, next])}`,
        ).toBe(true);
        p = next;
      }
    }
});
it("turns ruined walls into low rubble cover and persists excavation without editing the source map", () => {
  const g = scene(),
    wall = g.map.boxes.find((b) => b.id === "kit-school-wall-0-x-0-1-0")!;
  expect(wall).toBeDefined();
  const point = { x: wall.x, y: (wall.baseY ?? 0) + 0.7, z: wall.z - 0.5 };
  const before = groundHeight(point.x, point.z, g.map);
  for (let i = 0; i < 2; i++)
    g.explode(point, -1, null, { ...artilleryExplosionProfile, damage: 0 });
  expect(g.map.destruction!.objects[wall.id!].stage).toBe(2);
  expect(
    g.map.boxes.some(
      (b) =>
        b.kind === "rubble" && Math.hypot(b.x - point.x, b.z - point.z) < 6,
    ),
  ).toBe(true);
  expect(groundHeight(point.x, point.z, g.map)).toBeLessThan(before);
  expect(villageMap.boxes.some((b) => b.id === wall.id)).toBe(true);
  expect(villageMap.destruction).toBeUndefined();
});
it("keeps a distinct paved road and makes excavated paving sound like earth", () => {
  const g = scene();
  expect(villageRoad(g.map, 23, 18)).toBe(1);
  expect(villageRoad(g.map, 15, 18)).toBe(0);
  expect(footSurface({ x: 23, z: 18 }, g.map)).toBe("concrete");
  g.explode({ x: 23, z: 18, y: groundHeight(23, 18, g.map) + 0.02 }, -1, null, {
    ...artilleryExplosionProfile,
    damage: 0,
  });
  expect(footSurface({ x: 23, z: 18 }, g.map)).toBe("mud");
});
it("lets both teams advance and contest the village in a live 100-soldier battle", () => {
  const g = scene(true);
  let shots = 0,
    captures = 0;
  const flags = new Set<string>();
  for (let tick = 0; tick < 1800; tick++) {
    g.step(botCommand(g, g.players[0]));
    for (const e of g.events) {
      if (e.type === "fire") shots++;
      if (e.type === "capture") captures++;
    }
    for (const p of g.players) if (Math.abs(p.x) < 33) flags.add(p.team);
  }
  expect([...flags].sort()).toEqual(["blue", "red"]);
  // Squads fire from cover and fight fewer melee scrums than individual bots did.
  expect(shots).toBeGreaterThan(60);
  expect(captures).toBeGreaterThanOrEqual(2);
}, 30000);

it("screens exposed village road crossings with a limited individual smoke throw", () => {
  const g = scene(true),
    p = g.players[8];
  p.x = -23;
  p.z = 5;
  p.y = groundHeight(p.x, p.z, g.map);
  p.objective = 3;
  p.nextThink = Infinity;
  g.tick = 248;
  const supply = p.smokes;
  expect(botCommand(g, p).smoke).toBe(true);
  expect(p.smokes).toBe(supply);
  p.smokes = 0;
  expect(botCommand(g, p).smoke).not.toBe(true);
  p.smokes = supply;
  p.reloadAt = g.tick + 30;
  expect(botCommand(g, p).smoke).not.toBe(true);
});
