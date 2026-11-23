import { expect, it } from "vitest";
import { footSurface } from "./battlefield";
import { grenadeExplosionProfile } from "./destruction";
import { beyondPlayArea, groundHeight, inWire } from "./map";
import { craterPonds, inCraterPond, noMansLandDebris, wireBeltGeometry } from "./no-mans-land";
import { Game, TestCollision, idle } from "./simulation";
import { trenchMap } from "./trench-map";

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
