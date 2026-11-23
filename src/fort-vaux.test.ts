import { expect, it } from "vitest";
import { artilleryTargetReason, botArtilleryTarget } from "./artillery";
import { footSurface } from "./battlefield";
import { grenadeExplosionProfile } from "./destruction";
import { flagContains } from "./domination";
import { fortVauxMap, inFortRect } from "./fort-vaux-map";
import { bodyBlocked, supportHeight, walkSegment } from "./map";
import { Game, TestCollision, botCommand, idle, pathfind } from "./simulation";

const match = (bots = true) => new Game(new TestCollision(fortVauxMap), bots, 3600, 12345, undefined,
  { map: fortVauxMap, ambientArtillery: true });

it("deploys 12 French and 12 German soldiers in clear spawn rooms", () => {
  const g = match();
  expect(g.scoring).toBe("domination");
  expect(g.teamSize).toBe(12);
  expect(g.players.filter(p => p.faction === "french")).toHaveLength(12);
  expect(g.players.filter(p => p.faction === "german")).toHaveLength(12);
  expect(g.sectors.map(s => [s.id, s.name])).toEqual([["A", "Barracks"], ["B", "Cistern"], ["C", "East Casemate"]]);
  for (const p of g.players) {
    expect(bodyBlocked(p.x, p.z, p.y, .6, g.map)).toBe(false);
    expect(inFortRect(p, fortVauxMap.fort!.rooms.find(r => r.id === (p.team === "blue" ? "rear" : "breach"))!)).toBe(true);
  }
});

it("lets both teams reach each sector and cross through the service and yard loops", () => {
  const g = match(false);
  const fort = g.map.fort!;
  for (const spawn of Object.values(g.map.spawn)) {
    for (const flag of g.sectors) {
      expect(pathfind(spawn, flag, g.map).length, `route to ${flag.name}`).toBeGreaterThan(0);
      expect(flagContains(g, { ...flag, y: 0 }, flag)).toBe(true);
    }
  }
  const north = [{ x: -52, z: -4 }, { x: -52, z: -11 }, { x: -48, z: -11 }, { x: -48, z: -17 },
    { x: -26, z: -17 }, { x: -26, z: -19 }, { x: -18, z: -19 }, { x: -18, z: -16 }, { x: 0, z: -16 }, { x: 0, z: -5 }];
  const south = [{ x: -29, z: 3 }, { x: -29, z: 19 }, { x: 29, z: 19 }, { x: 29, z: 3 }];
  const walk = (points: typeof north) => {
    for (let i = 1; i < points.length; i++)
      expect(walkSegment(points[i - 1], points[i], g.map), `${JSON.stringify(points[i - 1])} to ${JSON.stringify(points[i])}`).toBe(true);
  };
  walk(north);
  walk(north.map(({ x, z }) => ({ x: -x, z })));
  walk(south);
  const roofRay = (x: number, z: number) => g.collision.ray({ x, y: 2, z }, { x, y: 6, z });
  expect(roofRay(0, -1)).toBeLessThan(1);
  expect(roofRay(0, -16)).toBeLessThan(1);
  expect(roofRay(0, 19)).toBe(1);
  expect(inFortRect({ x: 0, z: 19 }, fort.yard)).toBe(true);
});

it("keeps artillery disabled even when explicitly requested or when ambient shells are enabled by the caller", () => {
  const g = match(false);
  const p = g.players[0], target = { x: -25, z: 0, area: true as const };
  expect(g.artillery.enabled).toBe(false);
  expect(g.artillery.ambient.enabled).toBe(false);
  for (let i = 0; i < 2400; i++) {
    g.step(i % 30 === 0 ? { ...idle(), artillery: target } : idle());
    expect(g.events.some(e => e.type === "artilleryCall" || e.type === "artilleryImpact")).toBe(false);
  }
  expect(artilleryTargetReason(g, p, target)).toBeTruthy();
  expect(botArtilleryTarget(g, p)).toBeNull();
  expect(g.artillery.missions).toHaveLength(0);
  expect(g.artillery.shells).toHaveLength(0);
});

it("breaks timber cover with grenades and preserves the fort shell, walkway and footing", () => {
  const g = match(false);
  const barricade = g.map.boxes.find(b => b.id === "fort-cistern-barricade")!;
  g.explode({ x: barricade.x, y: .5, z: barricade.z - .25 }, -1, null, grenadeExplosionProfile);
  expect(g.map.boxes.some(b => b.id === barricade.id)).toBe(false);
  expect(g.map.boxes.filter(b => b.kind === "bunker")).toHaveLength(fortVauxMap.boxes.filter(b => b.kind === "bunker").length);
  expect(supportHeight(7, 5.7, g.map, .23)).toBeCloseTo(.18);
  expect(footSurface({ x: 0, z: 0, y: 0 }, g.map, [])).toBe("splash");
  expect(footSurface({ x: 7, z: 5.7, y: .18 }, g.map, [])).toBe("concrete");
});

it("spreads a seeded match into the gallery, service passage and yard on both sides", () => {
  const g = new Game(new TestCollision(fortVauxMap), true, 2700, 12345, undefined, { map: fortVauxMap, humanPlayerIds: [] });
  const firstAtB = { blue: Infinity, red: Infinity };
  const routes = { blue: new Set<string>(), red: new Set<string>() };
  const fort = g.map.fort!;
  while (g.phase === "playing") {
    g.step(g.players[0].hp > 0 ? botCommand(g, g.players[0]) : idle());
    for (const p of g.players) {
      if (p.hp <= 0) continue;
      if (flagContains(g, p, g.sectors[1])) firstAtB[p.team] = Math.min(firstAtB[p.team], g.tick);
      if (Math.abs(p.x) > 8 && Math.abs(p.x) < 17 && Math.abs(p.z) < 6) routes[p.team].add("gallery");
      if (Math.abs(p.x) < 12 && Math.abs(p.z - fort.approach.service.z) < 2) routes[p.team].add("service");
      if (inFortRect(p, fort.yard)) routes[p.team].add("yard");
    }
  }
  for (const team of ["blue", "red"] as const) expect(routes[team]).toEqual(new Set(["gallery", "service", "yard"]));
  expect(Math.abs(firstAtB.blue - firstAtB.red)).toBeLessThan(75);
});
