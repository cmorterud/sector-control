import { expect, it } from "vitest";
import { artilleryTargetReason, botArtilleryTarget } from "./artillery";
import { footSurface } from "./battlefield";
import { grenadeExplosionProfile } from "./destruction";
import { flagContains } from "./domination";
import { fortVauxMap, fortVaultHeight, inFortRect } from "./fort-vaux-map";
import { bodyBlocked, supportHeight, walkSegment } from "./map";
import { Game, TestCollision, botCommand, idle, pathfind, resolveTeamSize } from "./simulation";
import { planVillageMove } from "./village-tactics";

const match = (bots = true) => new Game(new TestCollision(fortVauxMap), bots, 3600, 12345, undefined,
  { map: fortVauxMap, ambientArtillery: true });

it("defaults to six French and six German soldiers in clear spawn rooms", () => {
  const g = match();
  expect(g.scoring).toBe("domination");
  expect(g.teamSize).toBe(6);
  expect(g.players.filter(p => p.faction === "french")).toHaveLength(6);
  expect(g.players.filter(p => p.faction === "german")).toHaveLength(6);
  expect(resolveTeamSize(fortVauxMap, 12)).toBe(12);
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
  const z = fort.yardPassage.z;
  for (const edge of [fort.yard.x0, fort.yard.x1]) {
    expect(roofRay(edge + Math.sign(edge), z)).toBeLessThan(1);
    expect(roofRay(edge - Math.sign(edge), z)).toBe(1);
  }
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

it.each([6, 12])("lets both sides contest the Cistern with %i soldiers per team", (teamSize) => {
  const g = new Game(new TestCollision(fortVauxMap), true, 2700, 12345, undefined, { map: fortVauxMap, teamSize, humanPlayerIds: [] });
  const firstAtB = { blue: Infinity, red: Infinity };
  const routes = { blue: new Set<string>(), red: new Set<string>() };
  const fort = g.map.fort!;
  let contested = false;
  while (g.phase === "playing") {
    g.step(g.players[0].hp > 0 ? botCommand(g, g.players[0]) : idle());
    contested ||= g.sectors[1].contested;
    for (const p of g.players) {
      if (p.hp <= 0) continue;
      if (flagContains(g, p, g.sectors[1])) firstAtB[p.team] = Math.min(firstAtB[p.team], g.tick);
      if (Math.abs(p.x) > 8 && Math.abs(p.x) < 17 && Math.abs(p.z) < 6) routes[p.team].add("gallery");
      // The service passage counts only on the team's own half: reaching it
      // from the Cistern down the short link is not a flank.
      const ownHalf = p.x * (p.team === "blue" ? 1 : -1) < -4;
      if (ownHalf && Math.abs(p.x) < 12 && Math.abs(p.z - fort.approach.service.z) < 2) routes[p.team].add("service");
      if (inFortRect(p, fort.yard)) routes[p.team].add("yard");
    }
  }
  for (const team of ["blue", "red"] as const) {
    expect(routes[team].has("gallery")).toBe(true);
    expect(routes[team].has("service")).toBe(true);
  }
  expect(Math.abs(firstAtB.blue - firstAtB.red)).toBeLessThan(75);
  expect(contested).toBe(true);
});

const crossesCistern = (path: { x: number; z: number }[]) => path.some(q => Math.abs(q.x) < 8 && Math.abs(q.z) < 7);

it("connects each spawn through its stores to the service passage without the Cistern", () => {
  const { spawn, fort } = fortVauxMap;
  for (const team of ["blue", "red"] as const) {
    const side = team === "blue" ? -1 : 1;
    for (const goal of [{ x: 50 * side, z: -11 }, { x: 30 * side, z: -17 }, fort!.approach.serviceEntry[team], { x: 12 * side, z: -16 }]) {
      const path = pathfind(spawn[team], goal, fortVauxMap);
      expect(path.length).toBeGreaterThan(0);
      expect(crossesCistern(path)).toBe(false);
    }
  }
});

it("sends service and yard flankers round the Cistern for both teams", () => {
  const g = new Game(new TestCollision(fortVauxMap), true, 600, 12345, undefined, { map: fortVauxMap, teamSize: 6, humanPlayerIds: [] });
  const fort = g.map.fort!, flag = (id: string) => g.sectors.findIndex(s => s.id === id);
  for (const team of ["blue", "red"] as const) {
    const soldier = (index: number) => g.players.find(p => p.team === team && p.teamIndex === index)!;
    for (const [p, objective, approach] of [
      [soldier(1), flag("B"), fort.approach.serviceEntry[team]],
      [soldier(2), flag(team === "blue" ? "C" : "A"), fort.approach.yard],
    ] as const) {
      Object.assign(p, { ...g.map.spawn[team], suppression: 0, objective, villagePlan: null });
      planVillageMove(g, p, (a, b) => pathfind(a, b, g.map));
      expect(p.villagePlan?.approach).toBe(approach);
      expect(p.path.length).toBeGreaterThan(0);
      expect(crossesCistern(p.path)).toBe(false);
    }
  }
});

it("gives each gallery door of the Cistern a pier and matching cover", () => {
  const room = fortVauxMap.fort!.rooms.find(r => r.id === "cistern")!;
  const flag = fortVauxMap.sectors.find(s => s.id === "B")!;
  expect(flag).toMatchObject({ x: 0, z: 0 });
  const added = fortVauxMap.boxes.filter(b => /^fort-(pier-|cistern-barricade|crate-cistern-)/.test(b.id ?? ""));
  expect(added.map(b => b.id).sort()).toEqual(["fort-cistern-barricade", "fort-cistern-barricade-east",
    "fort-crate-cistern-north", "fort-crate-cistern-south", "fort-pier-0", "fort-pier-1"]);
  // Whatever one team finds on its side, the other finds mirrored through the flag.
  for (const b of added) {
    expect(added.some(q => q !== b && Math.abs(q.x + b.x) < 1e-9 && Math.abs(q.z + b.z) < 1e-9 && q.w === b.w && q.d === b.d && q.h === b.h),
      `${b.id} has a twin`).toBe(true);
    expect(inFortRect(b, room)).toBe(true);
  }
  const piers = added.filter(b => b.id!.startsWith("fort-pier-"));
  for (const pier of piers) {
    // Stone from the floor into the vault, a step or two inside its door.
    expect(pier.kind).toBe("bunker");
    expect((pier.baseY ?? 0) + pier.h).toBeGreaterThanOrEqual(fortVaultHeight((pier.z - room.z0) / (room.z1 - room.z0)));
    const door = { x: Math.sign(pier.x) * 8, z: Math.sign(pier.x) * -3 };
    expect(Math.hypot(pier.x - door.x, pier.z - door.z)).toBeLessThan(3);
  }
  // Nobody stepping through one gallery door is in view of the other.
  const collision = new TestCollision(fortVauxMap);
  for (const y of [.6, 1.25, 1.7]) {
    expect(collision.ray({ x: -8.5, y, z: 3 }, { x: 8.5, y, z: -3 })).toBeLessThan(1);
  }
  // The doors stay open: a soldier can walk in and round either side of the pier to the flag.
  for (const side of [-1, 1]) {
    const door = { x: side * 9.5, z: side * -3 };
    for (const beside of [{ x: side * 5.6, z: side * -4.2 }, { x: side * 5.6, z: side * -.4 }]) {
      const path = pathfind(door, beside, fortVauxMap);
      expect(path.length, `past the pier at ${beside.x}, ${beside.z}`).toBeGreaterThan(0);
      expect(path.every(q => Math.abs(q.x) < 12)).toBe(true);
    }
    expect(pathfind(door, flag, fortVauxMap).length).toBeGreaterThan(0);
  }
});
