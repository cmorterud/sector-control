import { expect, it } from "vitest";
import { boundaryWireGeometry } from "./boundary-wire";
import { beyondPlayArea, groundHeight, inBoundaryWire, playArea } from "./map";
import { Game, TestCollision, botCommand, idle, type Event as GameEvent } from "./simulation";
import { verdunMap } from "./verdun-map";

const area = playArea(verdunMap);

it("rings Verdun's unchanged 208 by 128 m field with a 16 m dead zone", () => {
  expect(area).toEqual({ width: 208, depth: 128 });
  expect([verdunMap.width, verdunMap.depth]).toEqual([240, 160]);
  // Whole 8 m terrain patches tile the map exactly, edge to edge.
  expect((verdunMap.width / 2) % 8).toBe(0);
  expect((verdunMap.depth / 2) % 8).toBe(0);
  expect(verdunMap.boundary).toEqual({ warningTicks: 150, wireDepth: 3 });
  const t = verdunMap.terrain!;
  const inside = [...Object.values(verdunMap.spawn), ...verdunMap.sectors, ...t.shelterBays!, ...t.ramps,
    ...t.trenchLines!.flatMap((l) => l.sections), ...t.communicationRoutes!.flatMap((r) => r.points)];
  for (const point of inside) expect(beyondPlayArea(point.x, point.z, verdunMap)).toBeLessThan(-4);
  // Every tree, log and stump stands in the field, short of the wire.
  for (const b of [...verdunMap.boxes, ...verdunMap.vegetation!]) expect(beyondPlayArea(b.x, b.z, verdunMap)).toBeLessThan(-1);
  expect(inBoundaryWire(-105.5, 0, verdunMap)).toBe(true);
  expect(inBoundaryWire(0, 65, verdunMap)).toBe(true);
  expect(inBoundaryWire(-103.5, 0, verdunMap)).toBe(false);
  expect(inBoundaryWire(-110, 0, verdunMap)).toBe(false);
  // The dead zone beyond the wire is level, open ground.
  for (const [x, z] of [[-112, 0], [112, 20], [0, -72], [-60, 72], [90, -76]])
    expect(groundHeight(x, z, verdunMap)).toBeCloseTo(t.bankHeight, 1);
  const wire = boundaryWireGeometry(verdunMap);
  expect(wire.pickets.bases.length).toBeGreaterThan(500);
  for (const b of wire.pickets.bases) expect(beyondPlayArea(b.x, b.z, verdunMap)).toBeGreaterThan(0);
});

it("shells a soldier who walks out past Verdun's wire and stays there", () => {
  const g = new Game(new TestCollision(verdunMap), false, 3000, 12345, undefined, { map: verdunMap, ambientArtillery: false });
  const p = g.players[0];
  Object.assign(p, { x: -105.5, z: 4, y: groundHeight(-105.5, 4, verdunMap), vx: 0, vz: 0 });
  const events: GameEvent[] = [];
  for (let i = 0; i < 220 && g.phase === "playing"; i++) {
    g.step(idle());
    events.push(...g.events);
  }
  expect(events.find((e) => e.type === "boundary")).toMatchObject({ phase: "warning" });
  expect(p.hp).toBe(0);
  expect(p.lastDeath?.weapon).toBe("Left the battlefield");
  expect(g.players.every((q) => q.kills === 0)).toBe(true);
});

it("keeps every Verdun bot inside the play area through a seeded battle", () => {
  const g = new Game(new TestCollision(verdunMap), true, 1200, 6842, undefined, { map: verdunMap, humanPlayerIds: [] });
  let warnings = 0, closest = -Infinity;
  while (g.phase === "playing") {
    g.step(g.players[0].hp > 0 ? botCommand(g, g.players[0]) : idle());
    warnings += g.events.filter((e) => e.type === "boundary").length;
    for (const p of g.players) if (p.hp > 0) closest = Math.max(closest, beyondPlayArea(p.x, p.z, verdunMap));
  }
  expect(warnings).toBe(0);
  expect(closest).toBeLessThan(0);
}, 60000);
