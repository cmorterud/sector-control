import { expect, it } from "vitest";
import { Game, TestCollision, pathfind } from "./simulation";
import { blocked, dist, groundHeight, walkSegment, type MapDefinition } from "./map";
import { trenchMap } from "./trench-map";
import { nightRaidMap } from "./night-map";
import { villageMap } from "./village-map";
import { verdunMap } from "./verdun-map";
import { springOffensiveMap } from "./spring-offensive-map";
import { headlandMap } from "./headland-map";
import { fortVauxMap } from "./fort-vaux-map";
import { zeppelinMap } from "./zeppelin-map";
import { deploymentRules } from "./deployment";
import { frontSlot, spawnFront, spawnFrontRules, spawnLineDistance, spreadsAlongFront } from "./spawn-front";
import { ambientArtilleryRules } from "./artillery";

const game = (map: MapDefinition, humanPlayerIds: number[] = []) =>
  new Game(new TestCollision(map), true, 1800, 12345, undefined, { map, humanPlayerIds, ambientArtillery: false });

const outdoor = [trenchMap, nightRaidMap, villageMap, verdunMap, springOffensiveMap, headlandMap];

it("starts every side on the outdoor maps in a line along its whole front, not one clump", () => {
  for (const map of outdoor) {
    expect(spreadsAlongFront(map), map.id).toBe(true);
    const g = game(map);
    for (const team of ["blue", "red"] as const) {
      const front = spawnFront(map, team), side = g.players.filter((p) => p.team === team);
      const zs = side.map((p) => p.z).sort((a, b) => a - b);
      // From one end of the line to the other, with no long gap.
      expect(zs[0] - front.z0, `${map.id} ${team}`).toBeLessThan(6);
      expect(front.z1 - zs.at(-1)!, `${map.id} ${team}`).toBeLessThan(6);
      for (let i = 1; i < zs.length; i++) expect(zs[i] - zs[i - 1], `${map.id} ${team}`).toBeLessThan(8);
      for (const p of side) {
        const at = `${map.id} soldier ${p.id} at ${p.x},${p.z}`;
        expect(Math.abs(p.x - front.x), at).toBeLessThan(8);
        expect(blocked(p.x, p.z, 0.5, map), at).toBe(false);
        expect(p.y, at).toBeCloseTo(groundHeight(p.x, p.z, map));
        for (const s of map.sectors) expect(dist(p, s), at).toBeGreaterThanOrEqual(spawnFrontRules.flagClearance);
        for (const q of side) if (q !== p) expect(dist(p, q), at).toBeGreaterThan(1.3);
        const route = pathfind(p, map.spawn[team], map);
        expect(route.length, at).toBeGreaterThan(0);
        expect(walkSegment(p, route[0], map), at).toBe(true);
      }
    }
  }
  // Ypres's 160 m sector: fifty a side across about 140 m of it.
  const ypres = spawnFront(trenchMap, "blue");
  expect(ypres.z1 - ypres.z0).toBeGreaterThan(130);
  expect(spawnFront(nightRaidMap, "red")).toEqual(spawnFront(trenchMap, "red"));
}, 120000);

it("respawns each soldier at their own place on the line, and the player in the middle", () => {
  const g = game(trenchMap, [0]);
  const p = g.players[0], bot = g.players[20];
  expect(Math.abs(p.z - trenchMap.spawn.blue.z)).toBeLessThan(3);
  const first = { x: bot.x, z: bot.z };
  Object.assign(bot, { x: 0, z: 0, hp: 0 });
  g.respawn(bot);
  expect(dist(bot, first)).toBeLessThan(1);
  // Squads are consecutive indices: they deploy side by side.
  const front = spawnFront(trenchMap, "blue");
  expect(Math.abs(frontSlot(front, 6, 50).z - frontSlot(front, 7, 50).z)).toBeLessThan(4);
});

it("keeps indoor, airborne and small arenas on their own spawns", () => {
  for (const map of [fortVauxMap, zeppelinMap]) expect(spreadsAlongFront(map), map.id).toBe(false);
});

it("spreads forward deployment across the flag's sector and never onto a flag", () => {
  const g = game(springOffensiveMap);
  for (const s of g.sectors) if (s.home) s.owner = s.home;
  const centre = g.sectors.findIndex((s) => s.id === "D");
  const bots = g.players.filter((p) => p.team === "blue");
  for (const p of bots) Object.assign(p, { hp: 0, objective: centre });
  for (const p of bots) g.respawn(p);
  const forward = bots.filter((p) => springOffensiveMap.deployments!.some((d) => dist(p, d) < deploymentRules.width / 2 + 3));
  expect(forward.length).toBeGreaterThan(20);
  const zs = forward.map((p) => p.z);
  expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(deploymentRules.width * 0.8);
  for (const p of forward) {
    expect(blocked(p.x, p.z, 0.5, g.map)).toBe(false);
    for (const s of g.sectors) expect(dist(p, s)).toBeGreaterThanOrEqual(spawnFrontRules.flagClearance);
  }
}, 60000);

it("keeps stray heavy shells and gas off the whole spawn line", () => {
  const front = spawnFront(trenchMap, "blue");
  expect(spawnLineDistance(trenchMap, "blue", { x: front.x, z: front.z1 - 1 })).toBe(0);
  expect(spawnLineDistance(trenchMap, "blue", { x: front.x + 10, z: front.z0 })).toBeCloseTo(10);
  expect(spawnLineDistance(trenchMap, "blue", { x: front.x, z: front.z1 + 5 })).toBeCloseTo(5);
  expect(ambientArtilleryRules.spawnLineClearance).toBeGreaterThan(18);
});
