import { expect, it } from "vitest";
import { boundaryCountdown, boundaryRules, salvoTargets } from "./boundary";
import { beyondPlayArea, groundHeight, inBoundaryWire, playArea } from "./map";
import { Game, TestCollision, botCommand, idle, type Command, type Event as GameEvent } from "./simulation";
import { trenchMap } from "./trench-map";

const area = playArea(trenchMap);
const solo = () => {
  const g = new Game(new TestCollision(trenchMap), false, 3000, 12345, undefined, { map: trenchMap, ambientArtillery: false });
  const p = g.players[0];
  return { g, p };
};
const place = (g: Game, x: number, z: number) =>
  Object.assign(g.players[0], { x, z, y: groundHeight(x, z, trenchMap), vx: 0, vz: 0 });
const run = (g: Game, ticks: number, command: Partial<Command> = {}) => {
  const events: GameEvent[] = [];
  for (let i = 0; i < ticks && g.phase === "playing"; i++) {
    g.step({ ...idle(), ...command });
    events.push(...g.events);
  }
  return events;
};
const boundaryEvents = (events: GameEvent[]) =>
  events.flatMap((e) => (e.type === "boundary" ? [e.phase] : []));

it("rings the 160 by 160 m sector with a 16 m dead zone", () => {
  expect(area).toEqual({ width: 160, depth: 160 });
  expect([trenchMap.width, trenchMap.depth]).toEqual([192, 192]);
  // Whole 8 m terrain patches tile the map exactly, edge to edge.
  expect((trenchMap.width / 2) % 8).toBe(0);
  expect((trenchMap.depth / 2) % 8).toBe(0);
  expect(trenchMap.boundary).toEqual({ warningTicks: 150, wireDepth: 3 });
  const inside = [
    ...Object.values(trenchMap.spawn),
    ...trenchMap.sectors,
    ...trenchMap.terrain!.firingPositions!,
    ...trenchMap.terrain!.shelterBays!,
  ];
  for (const point of inside) expect(beyondPlayArea(point.x, point.z, trenchMap)).toBeLessThan(-4);
  expect(inBoundaryWire(-81.5, 0, trenchMap)).toBe(true);
  expect(inBoundaryWire(0, 81, trenchMap)).toBe(true);
  expect(inBoundaryWire(-79.5, 0, trenchMap)).toBe(false);
  expect(inBoundaryWire(-86, 0, trenchMap)).toBe(false);
  // The dead zone beyond the wire is level, open ground.
  for (const [x, z] of [[-88, 0], [88, 20], [0, -88], [-60, 88]])
    expect(groundHeight(x, z, trenchMap)).toBeCloseTo(trenchMap.terrain!.bankHeight, 1);
});

it("carries every trench line past the north and south wire behind a sandbag block", () => {
  const blocks = trenchMap.boxes.filter((b) => b.id?.startsWith("trench-block-"));
  expect(blocks).toHaveLength(8);
  for (const line of trenchMap.terrain!.trenchLines!) {
    for (const [section, north] of [[line.sections[0], -1], [line.sections.at(-1)!, 1]] as const) {
      const x = section.x - (line.role === "front" ? (line.team === "blue" ? -1 : 1) : 0);
      // Trench floor on both sides of the boundary, out to the dead zone.
      for (const z of [north * (area.depth / 2 - 2), north * (area.depth / 2 + 6)])
        expect(groundHeight(x, z, trenchMap)).toBeLessThan(0.3);
      const block = blocks.find((b) => b.x === x && Math.sign(b.z) === north)!;
      expect(block.kind).toBe("sandbag");
      expect(beyondPlayArea(block.x, block.z, trenchMap)).toBeLessThan(0);
      expect(block.baseY).toBeLessThan(0.3);
    }
  }
});

it("warns, then walks a salvo onto a soldier who stays outside, credited to no one", () => {
  const { g, p } = solo();
  place(g, -81.5, 0);
  const start = g.tick;
  const events = run(g, 220);
  expect(boundaryEvents(events)[0]).toBe("warning");
  const launches = events.filter((e) => e.type === "artilleryLaunch").map((e) => e.tick - start);
  expect(launches.slice(0, 3)).toEqual([151, 157, 163]);
  expect(p.hp).toBe(0);
  expect(p.lastDeath?.weapon).toBe("Left the battlefield");
  expect(p.lastDeath?.sourceName).toBe("Battlefield shellfire");
  expect(g.players.every((q) => q.kills === 0)).toBe(true);
  expect(g.scores).toEqual({ blue: 0, red: 0 });
});

it("counts down from five seconds and spares a soldier who returns in time", () => {
  const { g, p } = solo();
  place(g, -80.4, 0);
  run(g, 1);
  expect(boundaryCountdown(g, p)).toBe(5);
  run(g, 60);
  expect(boundaryCountdown(g, p)).toBe(3);
  place(g, -78, 0);
  const events = run(g, 200);
  expect(boundaryEvents(events)).toEqual(["clear"]);
  expect(events.some((e) => e.type === "artilleryLaunch")).toBe(false);
  expect(p.hp).toBe(100);
});

it("keeps the countdown running when a soldier only steps back in briefly", () => {
  const { g } = solo();
  place(g, -81, 0);
  const start = g.tick;
  run(g, 100);
  place(g, -78, 0);
  run(g, boundaryRules.clearTicks - 10);
  place(g, -81, 0);
  const events = run(g, 60);
  const salvo = events.find((e) => e.type === "boundary" && e.phase === "salvo")!;
  expect(salvo.tick - start).toBe(151);
});

it("slows soldiers in the wire to a walk and stops them hopping or mantling", () => {
  const { g, p } = solo();
  // Open ground behind the spawn, well short of the wire.
  place(g, -66, 0);
  run(g, 20, { x: -1, sprint: true });
  const open = p.vx;
  place(g, -80.2, 0);
  const before = p.x;
  run(g, 30, { x: -1, sprint: true });
  expect(open).toBeLessThan(-6);
  expect(before - p.x).toBeLessThan(boundaryRules.wireSpeed + 0.1);
  expect(before - p.x).toBeGreaterThan(1.2);
  const hops = run(g, 10, { mantle: true });
  expect(hops.some((e) => e.type === "hop" || e.type === "mantle")).toBe(false);
});

it("aims each salvo along the edge the soldier crossed", () => {
  for (const [x, z] of [[-82, 10], [30, 66]]) {
    const targets = salvoTargets(trenchMap, { x, z });
    expect(targets.at(-1)).toEqual({ x, z });
    for (const t of targets) expect(beyondPlayArea(t.x, t.z, trenchMap)).toBeCloseTo(beyondPlayArea(x, z, trenchMap));
  }
});

it("keeps every bot inside the play area through a seeded battle", () => {
  const g = new Game(new TestCollision(trenchMap), true, 1200, 6842, undefined, { map: trenchMap, humanPlayerIds: [] });
  let warnings = 0, closest = -Infinity;
  while (g.phase === "playing") {
    g.step(g.players[0].hp > 0 ? botCommand(g, g.players[0]) : idle());
    warnings += g.events.filter((e) => e.type === "boundary").length;
    for (const p of g.players) if (p.hp > 0) closest = Math.max(closest, beyondPlayArea(p.x, p.z, trenchMap));
  }
  expect(warnings).toBe(0);
  expect(closest).toBeLessThan(-4);
}, 30_000); // A 40-second 50v50 battle.
