import { describe, expect, it } from "vitest";
import { zeppelinMap, zeppelinLevels, hullRadius } from "./zeppelin-map";
import { hullSkin, skinOpening } from "./zeppelin-geometry";
import { Game, TestCollision, botCommand, idle, pathfind, prepareNavigation } from "./simulation";
import { bodyBlocked, groundHeight, mantleLanding, supportHeight, type Vec } from "./map";
import { flagContains } from "./domination";
import { footSurface } from "./battlefield";
import { terrainPatchKeys } from "./terrain-geometry";
import { kitFor } from "./loadouts";

const { keel, gallery, top } = zeppelinLevels;
const match = (bots = false, ticks = 3600) =>
  new Game(new TestCollision(zeppelinMap), bots, ticks, 7, undefined, { map: zeppelinMap, humanPlayerIds: bots ? [] : undefined });
const at = (x: number, z: number, y: number): Vec => ({ x, z, y: supportHeight(x, z, zeppelinMap, y + 0.23, 0.45) });

describe("Zeppelin layout", () => {
  it("sets six French against six German, with carbines, aboard and inside each spawn", () => {
    const g = match(true);
    expect(g.teamSize).toBe(6);
    expect(g.scoring).toBe("domination");
    expect(kitFor(zeppelinMap)).toBe("carbine");
    expect(g.players.filter((p) => p.faction === "french")).toHaveLength(6);
    expect(g.players.filter((p) => p.faction === "german")).toHaveLength(6);
    expect(g.flames.kits).toHaveLength(0);
    expect(g.sectors.map((s) => [s.id, s.name, s.y])).toEqual([["A", "Aft engines", keel], ["B", "Bomb bay", keel], ["C", "Forward engines", keel]]);
    for (const p of g.players) {
      const area = zeppelinMap.sky!.spawnAreas[p.team];
      expect(p.x).toBeGreaterThan(area.x0);
      expect(p.x).toBeLessThan(area.x1);
      expect(p.z).toBeGreaterThan(area.z0);
      expect(p.z).toBeLessThan(area.z1);
      expect(p.y).toBe(keel);
      expect(bodyBlocked(p.x, p.z, p.y, 0.45, g.map)).toBe(false);
    }
    // Soldier for soldier, the bow team stands where the stern team does, turned about.
    for (let i = 0; i < 6; i++) {
      const blue = g.players[i], red = g.players[i + 6];
      expect(red.x).toBeCloseTo(-blue.x, 6);
      expect(red.z).toBeCloseTo(-blue.z, 6);
    }
  });

  it("is the same airship both ways round", () => {
    const key = (b: { x: number; z: number; w: number; d: number; baseY?: number; h: number; walkable?: boolean }) =>
      [b.x, b.z, b.w, b.d, b.baseY ?? 0, b.h].map((v) => v.toFixed(3)).join(",") + (b.walkable ? "w" : "");
    const boxes = new Set(zeppelinMap.boxes.map(key));
    expect(zeppelinMap.boxes.filter((b) => !boxes.has(key({ ...b, x: -b.x, z: -b.z })))).toEqual([]);
    const anchor = (p: Vec) => `${p.x.toFixed(3)},${p.z.toFixed(3)},${p.y!.toFixed(3)}`;
    const anchors = new Set(zeppelinMap.navigationPoints!.map(anchor));
    expect(zeppelinMap.navigationPoints!.filter((p) => !anchors.has(anchor({ x: -p.x, z: -p.z, y: p.y })))).toEqual([]);
    const flags = zeppelinMap.sectors;
    expect(flags[0].x).toBe(-flags[2].x);
    expect(zeppelinMap.spawn.blue).toEqual({ x: -zeppelinMap.spawn.red.x, z: -zeppelinMap.spawn.red.z, y: zeppelinMap.spawn.red.y });
  });

  it("has no ground: open sky under the decks, and no ground mesh", () => {
    expect(groundHeight(0, 30, zeppelinMap)).toBe(zeppelinMap.sky!.floor);
    expect(supportHeight(0, 0, zeppelinMap, 0.23, 0.45)).toBe(keel);
    expect(terrainPatchKeys(zeppelinMap)).toEqual([]);
    expect(footSurface({ x: -40, z: 0, y: keel }, zeppelinMap)).toBe("wood");
  });

  it("reaches every flag, level and engine car from both spawns, by routes of equal length", () => {
    prepareNavigation(zeppelinMap);
    const goals: [string, Vec][] = [
      ["A", at(-30, 0, keel)], ["B", at(0, 0, keel)], ["C", at(30, 0, keel)],
      ["gallery", at(-45, -0.5, gallery)], ["A bridge", at(-30, 0, gallery)], ["B bridge", at(-5, 0, gallery)],
      ["top walk", at(-40, 1, top)], ["midships platform", at(-6, 3, top)],
      ["port engine car", at(-25.5, 9, keel)], ["starboard engine car", at(-34.5, -9, keel)],
    ];
    const length = (route: Vec[]) => route.reduce((sum, p, i) => sum + (i ? Math.hypot(p.x - route[i - 1].x, p.z - route[i - 1].z) : 0), 0);
    const blue = at(zeppelinMap.spawn.blue.x, zeppelinMap.spawn.blue.z, keel), red = at(zeppelinMap.spawn.red.x, zeppelinMap.spawn.red.z, keel);
    for (const [name, goal] of goals) {
      const twin = { x: -goal.x, z: -goal.z, y: goal.y };
      const ours = pathfind(blue, goal, zeppelinMap), theirs = pathfind(red, twin, zeppelinMap);
      expect(ours.length, `Blue to ${name}`).toBeGreaterThan(0);
      expect(theirs.length, `Red to ${name}`).toBeGreaterThan(0);
      // Ties between equal routes are broken by node order, so allow a few steps.
      expect(Math.abs(length(ours) - length(theirs)), name).toBeLessThan(2.5);
      // The route ends on the goal's own level.
      expect(Math.abs(ours.at(-1)!.y! - goal.y!)).toBeLessThan(0.3);
    }
  });

  it("counts a flag's capture from its floor, not from the bridge above it", () => {
    const g = match();
    for (const s of g.sectors) {
      expect(flagContains(g, { x: s.x + 2, z: s.z + 0.5, y: keel }, s)).toBe(true);
      expect(flagContains(g, { x: s.x + 2, z: s.z, y: gallery }, s)).toBe(false);
    }
  });

  it("keeps the skin out of the way of stairs, gangways and bomb doors, facing outward", () => {
    const layout = zeppelinMap.zeppelin!, skin = hullSkin(layout), open = skinOpening(layout);
    let outward = 0, inward = 0;
    for (let t = 0; t < skin.indices.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => skin.indices[t + k] * 3).map((i) => skin.positions.slice(i, i + 3));
      const centre = [0, 1, 2].map((k) => (a[k] + b[k] + c[k]) / 3) as [number, number, number];
      const u = b.map((v, k) => v - a[k]), v = c.map((w, k) => w - a[k]);
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const out = [0, centre[1] - layout.hull.axis, centre[2]];
      if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0) outward++; else inward++;
    }
    expect(inward).toBe(0);
    expect(outward).toBeGreaterThan(1000);
    // A gangway, a tower top and a bomb door each leave a hole.
    expect(open([-25.5, 1, hullRadius(-25.5) - 0.5])).toBe(true);
    expect(open([-55, 12, 3])).toBe(true);
    expect(open([-0.7, -2.2, 2.5])).toBe(true);
    expect(open([-40, layout.hull.axis + layout.hull.radius, 0])).toBe(false);
  });
});

describe("Zeppelin edges", () => {
  it("keeps a soldier aboard who runs, hops or vaults at a rail", () => {
    const g = match(), p = g.players[0];
    // On the top walk, beside its edge rail, facing out over the side.
    Object.assign(p, { ...at(-40, 1.7, top), vx: 0, vz: 0, protectedUntil: Infinity, nextHop: 0, nextMantle: 0 });
    const out = { x: 0, z: 1 };
    expect(mantleLanding(p, out, zeppelinMap)).toBeNull();
    for (let i = 0; i < 90; i++) g.step({ ...idle(), ...out, sprint: true, mantle: i % 20 === 0, yaw: 0 });
    for (let i = 0; i < 30; i++) g.step({ ...idle(), ...out, yaw: 0 });
    expect(p.hp).toBe(100);
    expect(p.y).toBe(top);
    expect(p.z).toBeLessThan(2.25);
  });

  it("kills a soldier who drops past the hull, as a fall", () => {
    const g = match(), p = g.players[0];
    Object.assign(p, { x: -40, z: 12, y: keel, protectedUntil: Infinity });
    let report;
    for (let i = 0; i < 90 && !report; i++) {
      g.step(idle());
      report = g.events.find((e) => e.type === "death")?.report;
    }
    expect(report?.kind).toBe("fall");
    expect(report?.sourceName).toBe("The long fall");
    expect(p.hp).toBe(0);
  });

  it("plans a route for a soldier pressed against a narrow wall", () => {
    // The gallery is 3 m wide; standing 0.45 m from its wall is closer than
    // the planner's 0.6 m clearance, yet a route must still leave from there.
    const from = at(-14.7, 1.05, gallery);
    expect(bodyBlocked(from.x, from.z, from.y!, 0.45, zeppelinMap)).toBe(false);
    expect(bodyBlocked(from.x, from.z, from.y!, 0.6, zeppelinMap)).toBe(true);
    expect(pathfind(from, at(0, 0, keel), zeppelinMap).length).toBeGreaterThan(0);
  });
});

describe("Zeppelin bots", () => {
  it("contest the bomb bay over all three lanes, and nobody falls", () => {
    const g = match(true, 6000);
    const lanes = { blue: new Set<string>(), red: new Set<string>() }, firstAtB = { blue: Infinity, red: Infinity };
    let falls = 0, contested = false;
    while (g.phase === "playing") {
      g.step(g.players[0].hp > 0 ? botCommand(g, g.players[0]) : idle());
      for (const e of g.events) if (e.type === "death" && e.report?.kind === "fall") falls++;
      contested ||= g.sectors[1].contested;
      for (const p of g.players) {
        if (p.hp <= 0) continue;
        lanes[p.team].add(p.y > top - 1 ? "top" : p.y > gallery - 1 ? "gallery" : "keel");
        if (flagContains(g, p, g.sectors[1])) firstAtB[p.team] = Math.min(firstAtB[p.team], g.tick);
      }
    }
    expect(falls).toBe(0);
    expect(contested).toBe(true);
    for (const team of ["blue", "red"] as const) expect([...lanes[team]].sort()).toEqual(["gallery", "keel", "top"]);
    expect(Math.abs(firstAtB.blue - firstAtB.red)).toBeLessThan(150);
  }, 120_000);
});
