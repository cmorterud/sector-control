import { expect, it } from "vitest";
import { footSurface } from "./battlefield";
import { grenadeExplosionProfile } from "./destruction";
import { beyondPlayArea, groundHeight, inWire } from "./map";
import { craterPonds, inCraterPond, noMansLandDebris, wireBeltGeometry, type WireCache } from "./no-mans-land";
import { Game, TestCollision, idle } from "./simulation";
import { trenchMap } from "./trench-map";
import { verdunMap } from "./verdun-map";
import { villageMap } from "./village-map";

const game = () => new Game(new TestCollision(trenchMap), false, 3000, 12345, undefined, { map: trenchMap, ambientArtillery: false });
const belts = trenchMap.wireBelts!;
const gaps = { blue: [-33, 35, -1], red: [-27, 31, -1] };

it("lays a belt in front of each front line, with gaps at the defenders' flags and the centre", () => {
  for (const team of ["blue", "red"] as const) {
    const own = belts.filter((b) => b.team === team), side = team === "blue" ? -1 : 1;
    expect(own.length).toBeGreaterThan(18);
    const line = trenchMap.terrain!.trenchLines!.find((l) => l.team === team && l.role === "front")!;
    for (const b of own) {
      const section = line.sections.find((s) => Math.abs(b.z - s.z) <= s.length / 2)!;
      expect(b.x).toBe(section.x - side * 9.5);
      expect(beyondPlayArea(b.x, b.z, trenchMap)).toBeLessThan(0);
      for (const gap of gaps[team]) expect(Math.abs(b.z - gap)).toBeGreaterThanOrEqual(4);
      // Open ground in no-man's land (perhaps a shell hole's rim), never a trench floor.
      expect(groundHeight(b.x, b.z, trenchMap)).toBeGreaterThan(1.2);
    }
  }
  const counts = ["blue", "red"].map((t) => belts.filter((b) => b.team === t).length);
  expect(Math.abs(counts[0] - counts[1])).toBeLessThanOrEqual(4);
});

it("slows only the enemy, and only through intact wire", () => {
  const blueBelt = belts.find((b) => b.team === "blue")!;
  expect(inWire(blueBelt.x, blueBelt.z, trenchMap, "red")).toBe(true);
  expect(inWire(blueBelt.x, blueBelt.z, trenchMap, "blue")).toBe(false);
  expect(inWire(blueBelt.x, -1, trenchMap, "red")).toBe(false);
  const g = game(), p = g.players[0];
  const walk = (team: "blue" | "red") => {
    Object.assign(p, { team, x: blueBelt.x - 1.4, z: blueBelt.z, y: groundHeight(blueBelt.x - 1.4, blueBelt.z, g.map), vx: 0, vz: 0 });
    const start = p.x;
    for (let i = 0; i < 30; i++) g.step({ ...idle(), x: 1 });
    return p.x - start;
  };
  expect(walk("red")).toBeLessThan(2.2);
  expect(walk("blue")).toBeGreaterThan(3.5);
});

it("cuts a segment with a nearby blast but not with a distant one", () => {
  const g = game(), target = belts.find((b) => b.team === "red")!, y = groundHeight(target.x, target.z, g.map);
  g.explode({ x: target.x, y: y + 0.05, z: target.z + target.d / 2 + 4 }, -1, null, grenadeExplosionProfile);
  expect(g.map.destruction!.wire?.[target.id]).toBeUndefined();
  g.explode({ x: target.x, y: y + 0.05, z: target.z }, -1, null, grenadeExplosionProfile);
  expect(g.map.destruction!.wire?.[target.id]).toBe(true);
  expect(g.events.some((e) => e.type === "destruction" && e.change.wire?.includes(target.id))).toBe(true);
  expect(inWire(target.x, target.z, g.map, "blue")).toBe(false);
  // The cut segment now draws as broken stakes and a low tangle.
  const intact = wireBeltGeometry(trenchMap), cut = wireBeltGeometry(g.map);
  expect(cut.boxes.length).toBeLessThan(intact.boxes.length);
});

it("fills the old craters with standing water you splash through", () => {
  const ponds = craterPonds(trenchMap);
  expect(ponds.length).toBeGreaterThanOrEqual(4);
  for (const pond of ponds) {
    expect(groundHeight(pond.x, pond.z, trenchMap)).toBeLessThan(pond.y);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      expect(groundHeight(pond.x + Math.cos(a) * pond.radius, pond.z + Math.sin(a) * pond.radius, trenchMap)).toBeLessThan(pond.y + 0.02);
    }
    expect(inCraterPond({ x: pond.x, z: pond.z }, trenchMap)).toBe(true);
    expect(footSurface({ x: pond.x, z: pond.z }, trenchMap)).toBe("splash");
  }
  expect(footSurface({ x: -40, z: 0, y: 2.4 }, trenchMap)).not.toBe("splash");
});

it("scatters flat debris across no-man's land, clear of the wire and water", () => {
  const debris = noMansLandDebris(trenchMap), ponds = craterPonds(trenchMap);
  expect(debris.length).toBeGreaterThan(40);
  for (const d of debris) {
    expect(d.h).toBeLessThanOrEqual(0.15);
    expect(Math.abs(d.x)).toBeLessThan(17);
    for (const p of ponds) expect(Math.hypot(d.x - p.x, d.z - p.z)).toBeGreaterThan(p.radius);
    for (const b of belts) expect(Math.abs(d.x - b.x) < b.w / 2 && Math.abs(d.z - b.z) < b.d / 2).toBe(false);
  }
});

it("rebuilds only the cut and nearby wire segments from its cache", () => {
  const g = game(), cache: WireCache = new Map();
  const fresh = wireBeltGeometry(g.map), first = wireBeltGeometry(g.map, cache);
  expect(first).toEqual(fresh);
  expect(cache.size).toBe(belts.length);
  const before = new Map(cache);
  const target = belts.find((b) => b.team === "red")!, y = groundHeight(target.x, target.z, g.map);
  g.explode({ x: target.x, y: y + 0.05, z: target.z }, -1, null, grenadeExplosionProfile);
  const near = (s: { x: number; z: number }) => Math.hypot(s.x - target.x, s.z - target.z) < 10;
  const after = wireBeltGeometry(g.map, cache, near);
  // Identical to building everything from scratch on the changed map.
  expect(after).toEqual(wireBeltGeometry(g.map));
  const rebuilt = belts.filter((b) => cache.get(b.id) !== before.get(b.id)).map((b) => b.id);
  expect(rebuilt).toContain(target.id);
  expect(rebuilt.length).toBeLessThan(8);
  for (const id of rebuilt) expect(near(belts.find((b) => b.id === id)!) || id === target.id).toBe(true);
  expect(cache.get(target.id)!.cut).toBe(true);
});

it("wires Verdun's front lines without closing a single exit, and only slows the enemy", () => {
  const vBelts = verdunMap.wireBelts!, t = verdunMap.terrain!;
  const counts = (["blue", "red"] as const).map((team) => vBelts.filter((b) => b.team === team).length);
  expect(Math.min(...counts)).toBeGreaterThanOrEqual(6);
  expect(Math.abs(counts[0] - counts[1])).toBeLessThanOrEqual(2);
  for (const b of vBelts) {
    const side = b.team === "blue" ? -1 : 1;
    // In front of its own line, toward the enemy.
    expect(b.x * side).toBeLessThan(65);
    expect(b.x * side).toBeGreaterThan(50);
    expect(beyondPlayArea(b.x, b.z, verdunMap)).toBeLessThan(-15);
    // Clear of every dug sap, route, ramp and trench by 2 m, and of the flags.
    for (const r of [...t.rectangles, ...t.ramps])
      expect(Math.abs(r.x - b.x) >= (r.w + b.w) / 2 + 2 || Math.abs(r.z - b.z) >= (r.d + b.d) / 2 + 2).toBe(true);
    for (const f of verdunMap.sectors) expect(Math.hypot(f.x - b.x, f.z - b.z)).toBeGreaterThanOrEqual(9);
    expect(groundHeight(b.x, b.z, verdunMap)).toBeGreaterThan(t.bankHeight - 1.2);
    expect(inWire(b.x, b.z, verdunMap, b.team === "blue" ? "red" : "blue")).toBe(true);
    expect(inWire(b.x, b.z, verdunMap, b.team)).toBe(false);
  }
});

it("stands water in Verdun's shell scars and strews debris across its whole field", () => {
  const ponds = craterPonds(verdunMap);
  expect(ponds.length).toBeGreaterThan(15);
  for (const p of ponds) {
    const scar = verdunMap.terrain!.shellScars!.find((s) => s.x === p.x && s.z === p.z)!;
    expect(p.radius).toBeLessThanOrEqual(Math.min(scar.radiusX, scar.radiusZ));
    expect(groundHeight(p.x, p.z, verdunMap)).toBeLessThan(p.y);
  }
  const debris = noMansLandDebris(verdunMap);
  expect(debris).toHaveLength(Math.round((70 * 112) / 32));
  expect(debris.some((d) => d.x < -40) && debris.some((d) => d.x > 40)).toBe(true);
  for (const d of debris) expect(d.h).toBeLessThanOrEqual(0.15);
  // Other maps' shell scars stay dry: water there is Verdun's opt-in.
  expect(villageMap.terrain!.shellScars!.length).toBeGreaterThan(0);
  expect(craterPonds(villageMap)).toEqual([]);
});
