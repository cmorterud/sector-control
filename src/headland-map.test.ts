import { expect, it } from "vitest";
import { headlandMap } from "./headland-map";
import { blocked, coastDistance, groundHeight, walkSegment } from "./map";
import { Game, TestCollision, pathfind, botCommand, idle } from "./simulation";
import { terrainPatchKeys } from "./terrain-geometry";

const scene = (bots = false, teamSize?: number) =>
  new Game(new TestCollision(headlandMap), bots, 3600, 12345, undefined, {
    map: headlandMap,
    humanPlayerIds: [],
    ambientArtillery: false,
    teamSize,
  });
it("offers three-flag 25v25 domination between France and Germany with clear spawns", () => {
  const g = scene(true);
  expect(g.players).toHaveLength(50);
  expect(g.scoring).toBe("domination");
  expect(g.sectors.map((s) => s.id)).toEqual(["A", "B", "C"]);
  expect(new Set(g.players.map((p) => p.faction))).toEqual(new Set(["french", "german"]));
  for (const p of g.players) {
    expect(blocked(p.x, p.z, 0.6, g.map), JSON.stringify([p.x, p.z])).toBe(false);
    // Up on the headland, not the beach: the line runs along the land,
    // through a dip to about 1.5 m behind the German end.
    expect(p.y).toBeGreaterThan(1.2);
    expect(coastDistance(p.x, p.z, g.map)).toBeGreaterThan(4);
  }
  for (const flag of g.sectors) expect(blocked(flag.x, flag.z, 0.5, g.map)).toBe(false);
});
it("keeps every building, flag and spawn on land, clear of roads and each other", () => {
  const solids = headlandMap.boxes.filter((b) => b.kind === "building");
  expect(solids.map((b) => b.id)).toContain("headland-lighthouse");
  // Each landmark model has a collision box at least as tall as a soldier can see over.
  expect(solids.filter((b) => b.model).map((b) => b.model!.name).sort()).toEqual(["church", "lighthouse", "tenement", "tenement"]);
  for (const b of solids) expect(b.h).toBeGreaterThan(7);
  const footprints = [...headlandMap.buildings!, ...solids];
  for (const b of footprints)
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      expect(coastDistance(b.x + (sx * b.w) / 2, b.z + (sz * b.d) / 2, headlandMap), b.id).toBeGreaterThan(3);
  for (const [i, a] of footprints.entries()) for (const b of footprints.slice(i + 1))
    expect(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 - 1e-6 || Math.abs(a.z - b.z) >= (a.d + b.d) / 2 - 1e-6, `${a.id} / ${b.id}`).toBe(true);
  for (const street of headlandMap.streets!) for (let i = 1; i < street.points.length; i++)
    for (let t = 0; t <= 1; t += 0.02) {
      const x = street.points[i - 1].x + (street.points[i].x - street.points[i - 1].x) * t,
        z = street.points[i - 1].z + (street.points[i].z - street.points[i - 1].z) * t;
      expect(coastDistance(x, z, headlandMap), JSON.stringify([x, z])).toBeGreaterThan(2);
      for (const b of footprints)
        expect(Math.abs(x - b.x) < b.w / 2 + 1 && Math.abs(z - b.z) < b.d / 2 + 1, `${b.id} on road at ${x},${z}`).toBe(false);
    }
  for (const p of [...headlandMap.sectors, ...Object.values(headlandMap.spawn)])
    expect(coastDistance(p.x, p.z, headlandMap)).toBeGreaterThan(10);
});
it("drops the sea bed below the land and closes it to movement", () => {
  expect(groundHeight(0, 80, headlandMap)).toBeLessThan(0.5);
  expect(groundHeight(5, -9, headlandMap)).toBeGreaterThan(2);
  expect(blocked(0, 80, 0.5, headlandMap)).toBe(true);
  expect(blocked(140, 40, 0.5, headlandMap)).toBe(true);
  // Walk a soldier north from the park until the cliff stops them on land.
  const g = scene(), p = g.players[0];
  Object.assign(p, { x: -63, z: -40, y: groundHeight(-63, -40, g.map), protectedUntil: Infinity });
  for (let i = 0; i < 600; i++) g.step({ ...idle(), z: -1, sprint: true });
  expect(p.z).toBeLessThan(-50);
  expect(coastDistance(p.x, p.z, g.map)).toBeGreaterThan(1);
  expect(p.y).toBeGreaterThan(2);
  expect(p.fall).toBeNull();
  // Open sea is left out of the ground mesh.
  expect(terrainPatchKeys(headlandMap).length).toBeLessThan((300 / 8) * (170 / 8) * 0.8);
});
it("connects both spawns to every flag over walkable ground", () => {
  const g = scene();
  for (const team of ["blue", "red"] as const)
    for (const flag of g.sectors) {
      let p = headlandMap.spawn[team];
      const route = pathfind(p, flag, g.map);
      expect(route.length, `${team} to ${flag.id}`).toBeGreaterThan(0);
      for (const next of route) {
        expect(walkSegment(p, next, g.map), `${team} to ${flag.id}: ${JSON.stringify([p, next])}`).toBe(true);
        p = next;
      }
    }
}, 15000);
it("plays a bot battle in which both teams leave their spawns, fight and capture", () => {
  const g = scene(true);
  let shots = 0, deaths = 0, captures = 0;
  for (let i = 0; i < 90 * 30; i++) {
    g.step(botCommand(g, g.players[0]));
    for (const e of g.events) {
      if (e.type === "fire") shots++;
      if (e.type === "death") deaths++;
      if (e.type === "capture") captures++;
    }
    if (i % 30 === 0) for (const p of g.players) {
      expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
      if (p.hp > 0) expect(coastDistance(p.x, p.z, g.map), `soldier ${p.id} at ${p.x},${p.z}`).toBeGreaterThan(0);
    }
  }
  expect(captures).toBeGreaterThanOrEqual(2);
  expect(shots).toBeGreaterThan(100);
  expect(deaths).toBeGreaterThan(5);
  expect(g.sectors.some((s) => s.owner === "blue")).toBe(true);
  expect(g.sectors.some((s) => s.owner === "red")).toBe(true);
}, 120000);
