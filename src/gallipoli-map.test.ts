import { expect, it, vi } from "vitest";
import { gallipoliMap as map } from "./gallipoli-map";
import { gallipoliGround, gallipoliHeight, shoreX } from "./gallipoli-terrain";
import { blocked, coastDistance, groundHeight, hillHeight, outOfBounds, walkSegment } from "./map";
import { Game, TestCollision, pathfind, botCommand, resolveTeamSize } from "./simulation";
import { dominationRules } from "./domination";
import { coastalRules } from "./coastal-scenery";
import { factionFor } from "./loadouts";
import { supportsTanks } from "./tanks";
import { gasMap } from "./gas";
import { mortarMap } from "./mortar";
import { createFlames } from "./flamethrower";
import { backdropHeight, backdropScenery } from "./backdrop";
import { grenadeExplosionProfile } from "./destruction";

// Building the navigation graph for a field this size takes a few seconds on a busy machine.
vi.setConfig({ testTimeout: 90000 });

const scene = (bots = true, teamSize?: number) =>
  new Game(new TestCollision(map), bots, 3600, 1915, undefined, { map, humanPlayerIds: [], ambientArtillery: false, teamSize });
// Height above the sea of the finished ground.
const above = (x: number, z: number) => groundHeight(x, z, map) - coastalRules.seaLevel;

it("climbs about 45 m from the beach to Chunuk Bair, with each flag on level ground at its planned height", () => {
  expect([map.width, map.depth]).toEqual([240, 176]);
  expect(map.playArea).toEqual({ width: 208, depth: 144 });
  expect(above(map.spawn.blue.x, map.spawn.blue.z)).toBeLessThan(2.2);
  expect(above(map.spawn.blue.x, map.spawn.blue.z)).toBeGreaterThan(0.3);
  const heights = Object.fromEntries(map.sectors.map((s) => [s.id, above(s.x, s.z)]));
  // Pits and trench floors sit below the ground the flag stands in.
  for (const [id, planned] of [["A", 16], ["B", 14.5], ["C", 28], ["D", 26], ["E", 40], ["F", 45]] as const) {
    const s = map.sectors.find((q) => q.id === id)!;
    expect(gallipoliHeight(s.x, s.z), id).toBeCloseTo(planned, 0);
    expect(heights[id], id).toBeLessThanOrEqual(planned + 0.5);
    expect(heights[id], id).toBeGreaterThan(planned - 2.6);
    // A capture ring never spans the slope: the whole ring is within reach of the flag's height.
    const y = groundHeight(s.x, s.z, map);
    for (let a = 0; a < 16; a++) {
      const x = s.x + Math.cos(a * Math.PI / 8) * dominationRules.radius * 0.7, z = s.z + Math.sin(a * Math.PI / 8) * dominationRules.radius * 0.7;
      if (groundHeight(x, z, map) - hillHeight(x, z, map) < 2) continue; // in the pit or trench
      expect(Math.abs(hillHeight(x, z, map) - hillHeight(s.x, s.z, map)), `${id} ring`).toBeLessThan(0.6);
    }
    expect(y).toBeGreaterThan(0);
  }
  expect(Math.max(...Object.values(heights))).toBe(heights.F);
  // The Ottoman spawn is behind the crest, out of sight of the beach.
  expect(above(map.spawn.red.x, map.spawn.red.z)).toBeGreaterThan(35);
  expect(above(map.spawn.red.x, map.spawn.red.z)).toBeLessThan(above(76, 0));
});

it("puts the sea on the west: closed to movement, with a beach running into it and no cliff on the sand", () => {
  for (let z = -70; z <= 70; z += 10) {
    const shore = shoreX(z);
    expect(outOfBounds(shore - 3, z, 0.5, map), `sea at ${z}`).toBe(true);
    expect(groundHeight(shore - 3, z, map)).toBeLessThan(coastalRules.seaLevel);
    expect(outOfBounds(shore + 6, z, 0.5, map), `beach at ${z}`).toBe(false);
    expect(coastDistance(map.spawn.blue.x, z, map)).toBeGreaterThan(4);
    const beach = above(shore + gallipoliGround.beachWidth / 2, z);
    expect(beach).toBeGreaterThan(0.3);
    expect(beach).toBeLessThan(1.6);
  }
  // Past the edge the land runs on: below the sea on the west, up the range on the east.
  expect(backdropHeight(map, -200, 0)).toBeLessThan(coastalRules.seaLevel - 1);
  expect(backdropHeight(map, 240, 0)).toBeGreaterThan(groundHeight(119, 0, map));
  expect(backdropHeight(map, map.width / 2, 10)).toBeCloseTo(groundHeight(map.width / 2 - 0.01, 10, map) - (groundHeight(map.width / 2 - 0.01, 10, map) - hillHeight(map.width / 2 - 0.01, 10, map) - map.terrain!.bankHeight), 0);
});

it("fields ANZAC against the Ottoman army with no tanks, gas or flame kits, and keeps the trench mortar", () => {
  const g = scene(true);
  expect(g.players).toHaveLength(100);
  expect(resolveTeamSize(map)).toBe(50);
  expect(factionFor(map, "blue")).toBe("anzac");
  expect(factionFor(map, "red")).toBe("ottoman");
  expect(supportsTanks(map)).toBe(false);
  expect(gasMap(map)).toBe(false);
  expect(mortarMap(map)).toBe(true);
  expect(createFlames(map).kits).toEqual([]);
  expect(g.sectors.map((s) => s.id)).toEqual(["A", "B", "C", "D", "E", "F"]);
  for (const p of g.players) {
    expect(blocked(p.x, p.z, 0.4, g.map), `soldier ${p.id} at ${p.x},${p.z}`).toBe(false);
    expect(coastDistance(p.x, p.z, map)).toBeGreaterThan(4);
    // ANZAC deploys on the beach; the Ottomans hold the first phase from behind their front lines.
    if (p.team === "blue") expect(above(p.x, p.z)).toBeLessThan(3);
    else {
      expect(above(p.x, p.z)).toBeGreaterThan(24);
      expect(p.x).toBeGreaterThan(map.sectors.find((s) => s.id === "C")!.x + 8);
    }
  }
});

it("reaches every flag from both spawns, and keeps every trench route and ramp walkable", () => {
  for (const flag of map.sectors) {
    expect(blocked(flag.x, flag.z, 0.4, map), flag.id).toBe(false);
    for (const team of ["blue", "red"] as const)
      expect(pathfind(map.spawn[team], flag, map).length, `${flag.id} from ${team}`).toBeGreaterThan(0);
  }
  for (const r of [...map.terrain!.communicationRoutes!, ...map.terrain!.branchRoutes!]) {
    for (const p of r.points) expect(blocked(p.x, p.z, 0.6, map), JSON.stringify(p)).toBe(false);
    for (let i = 1; i < r.points.length; i++) expect(walkSegment(r.points[i - 1], r.points[i], map), JSON.stringify(r.points)).toBe(true);
  }
  for (const ramp of map.terrain!.ramps.filter((r) => r.w > 2)) {
    const a = { x: ramp.x - ramp.direction * ramp.w / 2 + ramp.direction * 0.3, z: ramp.z };
    const b = { x: ramp.x + ramp.direction * ramp.w / 2 - ramp.direction * 0.3, z: ramp.z };
    expect(walkSegment(a, b, map) && walkSegment(b, a, map), JSON.stringify(ramp)).toBe(true);
  }
});

it("plays a 100-soldier attack in which both sides climb, fight and capture", () => {
  const g = scene(true);
  let shots = 0, deaths = 0, captures = 0;
  for (let i = 0; i < 120 * 30; i++) {
    g.step(botCommand(g, g.players[0]));
    for (const e of g.events) {
      if (e.type === "fire") shots++;
      if (e.type === "death") deaths++;
      if (e.type === "capture") captures++;
    }
  }
  expect(shots).toBeGreaterThan(200);
  expect(deaths).toBeGreaterThan(10);
  expect(captures).toBeGreaterThan(1);
  // Played as attack and defend, ANZAC takes the first spurs inside two minutes.
  expect(g.offensive!.phase).toBeGreaterThanOrEqual(1);
});

it("roofs the Lone Pine trench in lengths over the rear of its floor, clear of the step and D's pole, on posts that bring it down", () => {
  const roofs = map.boxes.filter((b) => b.id?.startsWith("gp-pine-roof-") && b.supports);
  expect(roofs.length).toBeGreaterThan(5);
  const d = map.sectors.find((s) => s.id === "D")!;
  for (const roof of roofs) {
    expect(Math.abs(roof.z - d.z)).toBeGreaterThan(3);
    const floor = groundHeight(roof.x, roof.z, map);
    // Flush with the ground at the trench lip, with headroom underneath.
    expect(roof.baseY! + roof.h - (hillHeight(roof.x, roof.z, map) + map.terrain!.bankHeight)).toBeCloseTo(0, 1);
    expect(roof.baseY! - floor).toBeGreaterThan(1.9);
    expect(blocked(roof.x, roof.z, 0.4, map), roof.id).toBe(false);
    expect(roof.supports).toHaveLength(2);
    for (const id of roof.supports!) expect(map.boxes.find((b) => b.id === id)?.kind).toBe("log");
  }
  // The firing step in front of every roof stays walkable.
  for (const roof of roofs) expect(blocked(roof.x - roof.w / 2 - 1.2, roof.z, 0.4, map), roof.id).toBe(false);
});

it("dresses the beach and puts warships offshore", () => {
  expect(map.boxes.some((b) => b.id === "gp-pier-deck")).toBe(true);
  const ships = backdropScenery(map).boxes;
  expect(ships.length).toBeGreaterThan(10);
  for (const s of ships) expect(coastDistance(s.x, s.z, map)).toBeLessThan(-100);
});

it("brings a Lone Pine roof down when a shell takes out its posts", () => {
  const g = new Game(new TestCollision(map), false, 1000, 1915, undefined, { map, humanPlayerIds: [0], ambientArtillery: false });
  const roof = g.map.boxes.find((b) => b.id?.startsWith("gp-pine-roof-") && b.supports)!;
  const post = g.map.boxes.find((b) => b.id === roof.supports![0])!;
  g.explode({ x: post.x - 0.5, y: post.baseY! + 1, z: post.z }, -1, null, { ...grenadeExplosionProfile, radius: 0, craterRadius: 0, craterDepth: 0, terrainReach: 0, structuralDamage: 1000, structuralRadius: 0.8 });
  expect(g.map.destruction!.objects[post.id!].stage).toBe(2);
  expect(g.map.destruction!.objects[roof.id!].stage).toBe(2);
  expect(g.map.boxes.some((b) => b.id === roof.id)).toBe(false);
});
