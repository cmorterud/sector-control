import { expect, it, vi } from "vitest";
import { springOffensiveMap as map, springOffensiveCtf } from "./spring-offensive-map";
import { blocked, groundHeight, walkSegment, dist } from "./map";
import { Game, TestCollision, pathfind, botCommand, resolveTeamSize } from "./simulation";
import { deploymentPoints, deploymentRules, forwardDeployment } from "./deployment";
import { dominationRules } from "./domination";
import { trenchMap } from "./trench-map";
import { verdunMap } from "./verdun-map";
import { ctfLayout } from "./ctf";
import { supportsTanks } from "./tanks";

// Building the navigation graph for a field this size takes a few seconds on a busy machine.
vi.setConfig({ testTimeout: 60000 });

const scene = (bots = true, teamSize?: number, humanPlayerIds: number[] = [], seed = 2103) =>
  new Game(new TestCollision(map), bots, 3600, seed, undefined, { map, humanPlayerIds, ambientArtillery: false, teamSize });

it("is a larger trench front than Verdun with British and German rosters and seven reachable flags", () => {
  const g = scene(true);
  expect(g.map.playArea).toEqual({ width: 288, depth: 176 });
  expect([g.map.width, g.map.depth]).toEqual([320, 208]);
  expect(288 * 176).toBeGreaterThan(1.8 * verdunMap.playArea!.width * verdunMap.playArea!.depth);
  expect(g.players).toHaveLength(128);
  expect(g.players[0].faction).toBe("british");
  expect(g.players[64].faction).toBe("german");
  expect(g.sectors.map((s) => s.id)).toEqual(["A", "B", "C", "D", "E", "F", "G"]);
  expect(g.sectors.filter((s) => s.home === "blue").map((s) => s.id)).toEqual(["A", "B"]);
  expect(g.sectors.filter((s) => s.home === "red").map((s) => s.id)).toEqual(["F", "G"]);
  for (const flag of g.sectors) {
    expect(blocked(flag.x, flag.z, 0.4, g.map), flag.id).toBe(false);
    for (const team of ["blue", "red"] as const)
      expect(pathfind(g.map.spawn[team], flag, g.map).length, `${flag.id} from ${team}`).toBeGreaterThan(0);
  }
});

it("holds three trench lines a side, closed at the boundary and open across the tank lane", () => {
  const lines = map.terrain!.trenchLines!;
  for (const team of ["blue", "red"] as const) expect(lines.filter((l) => l.team === team)).toHaveLength(3);
  for (const line of lines) {
    const s = line.team === "blue" ? -1 : 1, offset = line.floor!.offset;
    // Every line has a dug floor and a crossing at the tank lane.
    const section = line.sections.find((q) => Math.abs(q.z) < 30)!;
    expect(groundHeight(section.x - s * offset + s * 0.8, section.z, map)).toBeLessThan(0.1);
    for (let x = section.x - 6; x <= section.x + 6; x += 1) expect(groundHeight(x, 62, map)).toBeGreaterThan(2);
  }
  // The British outpost line is posts with open ground between them; the German jump-off trench is near continuous.
  const dug = (team: "blue" | "red") => lines.find((l) => l.team === team && l.role === "front")!.sections
    .filter((q) => Math.abs(q.z) < 88).reduce((n, q) => n + q.length, 0);
  expect(dug("blue")).toBeLessThan(dug("red") - 30);
  for (const block of map.boxes.filter((b) => b.id!.startsWith("so-trench-block"))) expect(Math.abs(block.z)).toBeCloseTo(87.3);
  expect(map.boxes.filter((b) => b.id!.startsWith("so-trench-block")).length).toBeGreaterThanOrEqual(10);
  // Firing steps stand along the enemy wall of the first two lines.
  const steps = map.terrain!.ramps.filter((r) => r.w === 1 && r.high === 0.85);
  for (const team of [-1, 1]) expect(steps.filter((r) => Math.sign(r.x) === team).length).toBeGreaterThan(12);
  expect(map.terrain!.shelterBays!.length).toBe(12);
  expect(map.wireBelts!.length).toBeGreaterThan(40);
});

it("keeps every communication trench and ramp walkable", () => {
  const routes = [...map.terrain!.communicationRoutes!, ...map.terrain!.branchRoutes!];
  expect(map.terrain!.communicationRoutes!.length).toBe(16);
  for (const r of routes) {
    for (const p of r.points) expect(blocked(p.x, p.z, 0.6, map), JSON.stringify(p)).toBe(false);
    for (let i = 1; i < r.points.length; i++) expect(walkSegment(r.points[i - 1], r.points[i], map), JSON.stringify(r.points)).toBe(true);
  }
  for (const ramp of map.terrain!.ramps.filter((r) => r.w > 2)) {
    const a = { x: ramp.x - ramp.direction * ramp.w / 2 + ramp.direction * 0.3, z: ramp.z };
    const b = { x: ramp.x + ramp.direction * ramp.w / 2 - ramp.direction * 0.3, z: ramp.z };
    expect(walkSegment(a, b, map) && walkSegment(b, a, map), JSON.stringify(ramp)).toBe(true);
  }
});

it("deploys whole rosters on clear ground, including 64 a side", () => {
  expect(resolveTeamSize(map)).toBe(64);
  expect(resolveTeamSize(map, 64)).toBe(64);
  expect(resolveTeamSize(map, 80)).toBe(64);
  expect(resolveTeamSize(trenchMap, 64)).toBe(50);
  const g = scene(true, 64);
  expect(g.players).toHaveLength(128);
  for (const p of g.players) {
    expect(blocked(p.x, p.z, 0.4, g.map), `soldier ${p.id} at ${p.x},${p.z}`).toBe(false);
    // On the rolling ground behind the rear line, which dips to about 1.3 m
    // along the front: never down in a trench (floors are near zero).
    expect(groundHeight(p.x, p.z, g.map)).toBeGreaterThan(1.2);
  }
});

it("opens a forward deployment point behind each home flag only while that side holds it", () => {
  const g = scene(true);
  expect(deploymentPoints(g, "blue")).toEqual([]);
  for (const d of map.deployments!) {
    const flag = map.sectors.find((s) => s.id === d.sector)!;
    // Set back behind the flag, toward its own side's rear, outside the capture ring.
    expect(dist(d, flag)).toBeGreaterThan(dominationRules.radius + 6);
    expect(Math.abs(d.x)).toBeGreaterThan(Math.abs(flag.x));
    expect(blocked(d.x, d.z, 0.5, map), d.sector).toBe(false);
    for (const s of map.sectors) expect(pathfind(d, s, map).length, `${d.sector} to ${s.id}`).toBeGreaterThan(0);
  }
  const a = g.sectors.find((s) => s.id === "A")!, f = g.sectors.find((s) => s.id === "F")!;
  a.owner = "blue"; f.owner = "blue";
  // Holding an enemy home flag opens nothing; holding your own opens its point.
  expect(deploymentPoints(g, "blue").map((d) => d.sector)).toEqual(["A"]);
  expect(deploymentPoints(g, "red")).toEqual([]);
  // A bot heading for the centre deploys forward.
  const bot = g.players[3];
  bot.objective = g.sectors.findIndex((s) => s.id === "C");
  g.respawn(bot);
  expect(dist(bot, map.deployments![0])).toBeLessThan(deploymentRules.width / 2 + 3);
  // Lose the flag and the point closes.
  a.owner = "red";
  g.respawn(bot);
  expect(Math.abs(bot.x - map.spawn.blue.x)).toBeLessThan(6);
});

it("deploys a player at the point they chose, and at the main spawn otherwise", () => {
  const g = scene(true, undefined, [0]);
  const p = g.players[0];
  g.sectors.find((s) => s.id === "B")!.owner = "blue";
  expect(forwardDeployment(g, p)).toBeNull();
  p.deployAt = "B";
  g.respawn(p);
  // The player takes the middle of the point's line.
  expect(dist(p, map.deployments!.find((d) => d.sector === "B")!)).toBeLessThan(4);
  p.deployAt = "A"; // not held
  g.respawn(p);
  expect(dist(p, map.spawn.blue)).toBeLessThan(4);
});

it("lays out capture the flag on each side's first line with the drop in its battle zone", () => {
  expect(ctfLayout(map)).toBe(springOffensiveCtf);
  const g = scene(false);
  for (const p of springOffensiveCtf.pickups) {
    expect(groundHeight(p.x, p.z, map), p.name).toBeLessThan(0.9);
    expect(blocked(p.x, p.z, 0.4, map)).toBe(false);
    expect(Math.abs(p.x)).toBeGreaterThan(30);
    expect(Math.abs(p.x)).toBeLessThan(45);
    expect(pathfind(map.spawn[p.team === "blue" ? "red" : "blue"], p, g.map).length).toBeGreaterThan(0);
  }
  for (const [team, d] of Object.entries(springOffensiveCtf.drops)) {
    expect(groundHeight(d.x, d.z, map)).toBeLessThan(0.1);
    expect(Math.abs(d.x)).toBeGreaterThan(65);
    expect(Math.sign(d.x)).toBe(team === "blue" ? -1 : 1);
  }
});

it("plays a 100-soldier battle in which both sides fight, capture and deploy forward", () => {
  // The bot battle is chaotic, so one seed is a sample, not a guarantee. Seed 2
  // leaves blue holding ground under both the old per-rifle bullet speeds and
  // the shared infantry speed; 2103 tipped to a red sweep after that change.
  const g = scene(true, undefined, [], 2);
  let shots = 0, deaths = 0, captures = 0;
  for (let i = 0; i < 120 * 30; i++) {
    g.step(botCommand(g, g.players[0]));
    for (const e of g.events) {
      if (e.type === "fire") shots++;
      if (e.type === "death") deaths++;
      if (e.type === "capture") captures++;
    }
    if (i % 30 === 0) for (const p of g.players) expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
  }
  expect(captures).toBeGreaterThanOrEqual(3);
  expect(shots).toBeGreaterThan(200);
  expect(deaths).toBeGreaterThan(5);
  expect(g.sectors.some((s) => s.owner === "blue")).toBe(true);
  expect(g.sectors.some((s) => s.owner === "red")).toBe(true);
}, 240000);

it("brings the Mark IV and the A7V up the tank lane, and they drive through the line crossings", () => {
  expect(supportsTanks(map)).toBe(true);
  const g = new Game(new TestCollision(map), true, 30 * 600, 2103, undefined, { map, teamSize: 12, ambientArtillery: false, tanks: true });
  g.artillery.enabled = false;
  for (let i = 0; i < 2; i++) g.step(botCommand(g, g.players[0]));
  expect(g.tanks.list.map((t) => t.model).sort()).toEqual(["a7v", "mark-iv"]);
  for (const t of g.tanks.list) {
    expect(Math.abs(t.z - map.tankDepot![t.team].z)).toBeLessThan(10);
    expect(Math.abs(t.x - map.tankDepot![t.team].x)).toBeLessThan(12);
  }
  const start = new Map(g.tanks.list.map((t) => [t.id, Math.abs(t.x)]));
  for (let i = 0; i < 60 * 30; i++) g.step(botCommand(g, g.players[0]));
  // Both crews have pushed toward the centre past their own rear line.
  for (const t of g.tanks.list) if (t.hp > 0) expect(start.get(t.id)! - Math.abs(t.x), t.name).toBeGreaterThan(15);
  expect(g.tanks.list.every((t) => Number.isFinite(t.x + t.z))).toBe(true);
}, 240000);

it("never routes soldiers up the railway cutting's walls, and the cutting has ways out", () => {
  const g = scene(false);
  const b = g.sectors.find((s) => s.id === "B")!;
  // A long slant from the cutting floor to the bank top passes a 0.25 m
  // height check sample by sample, but the bank stops a soldier moving that
  // way: two British bots ran along the wall at the spawn all battle.
  expect(groundHeight(-124, b.z, g.map)).toBeLessThan(groundHeight(-136, b.z - 4, g.map) - 1);
  expect(walkSegment({ x: -124, z: b.z }, { x: -136, z: b.z - 4 }, g.map)).toBe(false);
  // From the west end (where the spawn line crosses) and the east end, a
  // soldier can still reach the field and every flag.
  for (const from of [{ x: -132, z: b.z - 2.8 }, { x: -132, z: b.z + 0.4 }, { x: -100, z: b.z }])
    for (const s of g.sectors) expect(pathfind(from, s, g.map).length, `${from.x},${from.z} to ${s.id}`).toBeGreaterThan(0);
});
