import { expect, it } from "vitest";
import { industrialMap, walkSegment, groundHeight, bodyBlocked, type MapDefinition } from "./map";
import { Game, TestCollision, idle, pathfind, collapseDamage } from "./simulation";
import { artilleryExplosionProfile, grenadeExplosionProfile, runtimeMap } from "./destruction";
import { buildKitHouse, buildKitTerrace, kitBay, kitStory, type KitPlacement, type KitPlan } from "./house-kit";
import { narrowTownhouse, tenement, kitPlans } from "./house-kit-plans";
import { kitOpenRuns, kitPartBudget, kitPlanProblems } from "./house-kit-audit";
import { kitStanding, kitWarningMaxTicks } from "./kit-collapse";
import { architectureGeometry } from "./architecture-geometry";

// Flat terrain gives soldiers the support-aware movement used on building maps.
const flat = (): MapDefinition => ({ ...industrialMap, width: 90, depth: 90, boxes: [], buildings: [], navigationPoints: [],
  spawn: { blue: { x: -38, z: 0 }, red: { x: 38, z: 0 } },
  sectors: [{ id: "A", name: "A", x: 36, z: 36 }] as MapDefinition["sectors"],
  terrain: { bankHeight: 0, cellSize: 1, columns: 90, rows: 90, heights: new Float32Array(90 * 90), rectangles: [], ramps: [], lining: [], craters: [] } });
const placed = (plan: KitPlan, at: Partial<KitPlacement> = {}) => {
  const map = flat(), placement = { id: "house", x: 0, z: 0, baseY: 0, ...at };
  buildKitHouse(map, plan, placement);
  return { map, placement };
};
const scene = (map: MapDefinition) => new Game(new TestCollision(map), false, 6000, 7, undefined, { map, ambientArtillery: false });
// Removes exactly the piece it is centred on.
// Kills any wall (240 HP at most) but leaves 450 HP corner piers and chimneys.
const pinpoint = { ...artilleryExplosionProfile, damage: 0, structuralDamage: 300, structuralRadius: 0.05, craterRadius: 0, craterDepth: 0, terrainReach: 0 };
const smash = (g: Game, ids: string[]) => {
  for (const id of ids) {
    const o = g.map.destruction!.objects[id];
    if (!o || o.stage === 2) continue;
    const b = o.original, y = (b.baseY ?? 0) + b.h / 2, gap = 0.005;
    // Detonate just off a face that is not buried in a neighbouring piece.
    const faces = [{ x: b.x, y: (b.baseY ?? 0) + b.h + gap, z: b.z }, { x: b.x - b.w / 2 - gap, y, z: b.z }, { x: b.x + b.w / 2 + gap, y, z: b.z },
      { x: b.x, y, z: b.z - b.d / 2 - gap }, { x: b.x, y, z: b.z + b.d / 2 + gap }, { x: b.x, y: (b.baseY ?? 0) - gap, z: b.z }];
    const clear = faces.find((f) => !g.map.boxes.some((q) => q.id !== id && Math.abs(f.x - q.x) < q.w / 2 && Math.abs(f.z - q.z) < q.d / 2 &&
      f.y > (q.baseY ?? 0) && f.y < (q.baseY ?? 0) + q.h));
    g.explode(clear ?? faces[0], -1, null, pinpoint);
  }
};
const settle = (g: Game, ticks = 70) => { for (let i = 0; i < ticks; i++) g.step(idle()); };
const piece = (g: Game, id: string) => g.map.destruction!.objects["kit-house-" + id];
const drive = (g: Game, route: { x: number; z: number; y?: number }[]) => {
  const soldier = g.players[0];
  let i = 0;
  for (let tick = 0; tick < 900 && i < route.length; tick++) {
    const next = route[i], dx = next.x - soldier.x, dz = next.z - soldier.z, length = Math.hypot(dx, dz);
    if (length < 0.45 && Math.abs(soldier.y - (next.y ?? groundHeight(next.x, next.z, g.map))) < 0.3) { i++; continue; }
    g.step({ ...idle(), x: dx / Math.max(1, length), z: dz / Math.max(1, length) });
  }
  return i;
};

it("lays out every plan by the rooms-first rules, within its part budget", () => {
  for (const plan of kitPlans) {
    expect(kitPlanProblems(plan)).toEqual([]);
    const { map } = placed(plan);
    const parts = map.boxes.filter((b) => b.architecture?.building === "house");
    expect(parts.length).toBeLessThanOrEqual(kitPartBudget(plan.levels.length));
    const ids = new Set(parts.map((b) => b.id));
    expect(ids.size).toBe(parts.length);
    for (const b of parts) for (const s of [...b.supports ?? [], ...b.spanSupports ?? []]) expect(ids.has(s), b.id + " → " + s).toBe(true);
    // Intact, every piece has an unbroken chain of supports to the ground.
    const live = runtimeMap(map), kit = live.buildings![0].kit!;
    const { standing } = kitStanding(live, kit);
    expect(kit.parts.filter((id) => !standing.has(id))).toEqual([]);
  }
});

it("keeps every open run inside a room within the sprint limit", () => {
  for (const plan of kitPlans) for (const turns of [0, 1] as const) {
    const { map, placement } = placed(plan, { turns });
    for (const r of kitOpenRuns(map, plan, placement)) expect(r.run, plan.id + " " + r.level + " " + r.room).toBeLessThanOrEqual(r.limit);
  }
  // A bare 3 × 3-bay room is exactly the empty space the rule forbids.
  const bare: KitPlan = { id: "bare", name: "Bare room", bays: { x: 3, z: 3 }, flights: [], wings: [{ id: "all", from: "A1", to: "C3" }],
    levels: [{ cells: ["RRR", "RRR", "RRR"], rooms: { R: { type: "parlour", name: "Room" } },
      openings: [{ at: "B1", side: "north", kind: "door" }, { at: "B3", side: "south", kind: "door" }] }] };
  const { map, placement } = placed(bare);
  expect(Math.max(...kitOpenRuns(map, bare, placement).map((r) => r.run))).toBeGreaterThan(5);
});

it("stands furniture clear of every wall", () => {
  for (const plan of kitPlans) {
    const { map } = placed(plan);
    const parts = map.boxes.filter((b) => b.architecture?.building === "house");
    for (const f of parts.filter((b) => b.architecture!.feature)) for (const w of parts.filter((b) => b.architecture!.part === "wall")) {
      const overlap = Math.abs(f.x - w.x) < (f.w + w.w) / 2 - 0.001 && Math.abs(f.z - w.z) < (f.d + w.d) / 2 - 0.001 &&
        (f.baseY ?? 0) < (w.baseY ?? 0) + w.h && (w.baseY ?? 0) < (f.baseY ?? 0) + f.h;
      expect(overlap, plan.id + " " + f.id + " in " + w.id).toBe(false);
    }
  }
});

it("derives half-bay openings with piers, sills and lintels from the plan", () => {
  const { map } = placed(narrowTownhouse);
  const window = map.boxes.filter((b) => b.id?.startsWith("kit-house-wall-0-x-0-0-"));
  expect(window.map((b) => b.id!.split("-").pop()).sort()).toEqual(["2", "a", "b", "sill"]);
  const sill = window.find((b) => b.id!.endsWith("sill"))!;
  expect(sill.w).toBeCloseTo(kitBay / 2);
  expect(sill.architecture!.opening).toBe("window");
  // The double door leaves the full bay open beneath its lintel.
  expect(map.boxes.filter((b) => b.id?.startsWith("kit-house-wall-0-x-0-1-")).map((b) => b.id!.split("-").pop())).toEqual(["2"]);
  // Stone stops; timber partitions are thin and weaker.
  const partition = map.boxes.find((b) => b.id === "kit-house-wall-0-z-1-2-0")!;
  expect(partition.kind).toBe("wood");
  expect(partition.d).toBeCloseTo(kitBay);
  expect(partition.w).toBeCloseTo(0.16);
  expect(partition.maxHp).toBe(60);
});

it("reaches every room on every level from the street, through doors kept clear of furniture", () => {
  for (const plan of kitPlans) {
    const { map } = placed(plan);
    const W = plan.bays.x * kitBay, D = plan.bays.z * kitBay, street = { x: 0, z: -D / 2 - 3, y: 0 };
    for (const [level, spec] of plan.levels.entries()) for (const [key, room] of Object.entries(spec.rooms)) {
      if (room.type === "void" || room.type === "stair") continue;
      const cells = spec.cells.flatMap((row, r) => [...row].map((k, c) => ({ k, c, r }))).filter((q) => q.k === key);
      const goals = cells.flatMap(({ c, r }) => [0, -0.6, 0.6].flatMap((du) => [0, -0.6, 0.6].map((dv) =>
        ({ x: -W / 2 + (c + 0.5) * kitBay + du, z: -D / 2 + (r + 0.5) * kitBay + dv, y: level * kitStory }))))
        .filter((q) => !bodyBlocked(q.x, q.z, q.y, 0.6, map));
      expect(goals.length, plan.id + " " + room.name).toBeGreaterThan(0);
      expect(pathfind(street, goals[0], map).length, plan.id + " level " + level + " " + room.name).toBeGreaterThan(0);
    }
    const doorways = map.buildings![0].kit!.doorways;
    for (let i = 0; i < doorways.length; i += 2)
      expect(walkSegment(doorways[i], doorways[i + 1], map), plan.id + " door " + JSON.stringify(doorways[i])).toBe(true);
  }
});

it("walks up the townhouse stair, through the back room and down the outside stair", () => {
  const { map } = placed(narrowTownhouse);
  const g = scene(map), p = g.players[0];
  Object.assign(p, { x: 0, z: -9, y: 0, protectedUntil: Infinity });
  const target = { x: 0, z: 4.6, y: kitStory };
  const up = pathfind({ x: 0, z: -9, y: 0 }, target, g.map);
  expect(up.some((q) => (q.y ?? 0) > 1 && (q.y ?? 0) < 3)).toBe(true);
  expect(drive(g, up)).toBe(up.length);
  expect(p.y).toBeCloseTo(kitStory, 1);
  // Out of the back door and down the timber stair into the yard.
  const yard = { x: -3.5, z: 9.5 };
  const down = pathfind({ x: p.x, z: p.z, y: p.y }, yard, g.map);
  expect(down.length).toBeGreaterThan(2);
  expect(drive(g, down)).toBe(down.length);
  expect(p.y).toBeLessThan(0.3);
});

it("climbs all three tenement stories through the stone stair core", () => {
  const { map } = placed(tenement);
  const g = scene(map), p = g.players[0];
  Object.assign(p, { x: 1.25, z: -9, y: 0, protectedUntil: Infinity });
  const garret = { x: 3.75, z: 3.75, y: 2 * kitStory };
  const route = pathfind({ x: 1.25, z: -9, y: 0 }, garret, g.map);
  expect(route.length).toBeGreaterThan(6);
  let from: { x: number; z: number; y: number } = { x: 1.25, z: -9, y: 0 };
  for (const next of route) {
    expect(walkSegment(from, next, g.map), JSON.stringify([from, next])).toBe(true);
    from = { ...next, y: next.y ?? groundHeight(next.x, next.z, g.map) };
  }
  expect(drive(g, route)).toBe(route.length);
  expect(p.y).toBeCloseTo(2 * kitStory, 1);
  expect(p.fall).toBeNull();
});

it("warns before an unsupported floor falls, then hurts whoever is still beneath it", () => {
  const { map } = placed(narrowTownhouse);
  const g = scene(map), p = g.players[0], kit = g.map.buildings![0].kit!;
  // Under the back room floor, in the kitchen.
  Object.assign(p, { x: 2.5, z: 2.5, y: 0, protectedUntil: 0 });
  const tick = g.tick;
  // Break both routes up: the upper floor must not be left stranded.
  smash(g, ["kit-house-stair-0-3", "kit-house-stair-1-3"]);
  const failing = g.map.destruction!.failing!;
  expect(kit.floors[1].every((id) => id in failing)).toBe(true);
  for (const id of kit.floors[1]) {
    expect(g.map.boxes.some((b) => b.id === id)).toBe(true);
    expect(failing[id] - tick).toBeGreaterThanOrEqual(18);
    expect(failing[id] - tick).toBeLessThanOrEqual(kitWarningMaxTicks);
  }
  settle(g, 60);
  for (const id of kit.floors[1]) expect(g.map.destruction!.objects[id].stage).toBe(2);
  expect(p.hp).toBe(100 - collapseDamage);
  // The walls and ground floor still stand: only the unreachable floor dropped.
  expect(piece(g, "wall-0-x-0-0-2").stage).not.toBe(2);
  expect(piece(g, "floor-0-1-3").stage).not.toBe(2);
});

it("keeps the upper floor while one of its two stairs survives", () => {
  const { map } = placed(narrowTownhouse);
  const g = scene(map), kit = g.map.buildings![0].kit!;
  smash(g, ["kit-house-stair-0-3", "kit-house-stair-0-9"]);
  settle(g);
  expect(kit.floors[1].every((id) => g.map.destruction!.objects[id].stage !== 2)).toBe(true);
});

it("brings down a tenement wing that loses its bearing walls, leaving the core and rear", () => {
  const { map } = placed(tenement);
  const g = scene(map), kit = g.map.buildings![0].kit!;
  const wing = (id: string) => kit.wings.find((w) => w.id === id)!;
  const shared = new Set([...wing("core").parts, ...wing("rear").parts]);
  smash(g, wing("front").bearing.filter((id) => !shared.has(id)));
  settle(g);
  const standing = (id: string) => g.map.destruction!.objects[id].stage !== 2;
  const front = wing("front").parts.filter((id) => !shared.has(id) && !kit.survivors.includes(id));
  const upper = front.filter((id) => g.map.destruction!.objects[id].original.supports);
  expect(upper.filter(standing)).toEqual([]);
  // The corner piers outlast the wing; the core stair and rear rooms remain.
  expect(standing("kit-house-corner-pier-west-north")).toBe(true);
  expect(kit.routes[2][0].every(standing)).toBe(true);
  // Rear wing floors: columns C–D, rows 3–5 (floor ids end in column-row).
  const rear = kit.floors[1].filter((id) => { const [col, row] = id.split("-").slice(-2).map(Number); return col >= 2 && row >= 2; });
  expect(rear.length).toBe(6);
  expect(rear.every(standing)).toBe(true);
  expect(g.map.boxes.some((b) => b.kind === "rubble" && b.h > 1)).toBe(true);
});

it("shares one party wall between terraced houses and keeps it for the surviving neighbour", () => {
  const map = flat();
  const houses = buildKitTerrace(map, narrowTownhouse, { id: "row", x: 0, z: 0, baseY: 0, count: 3 });
  const line = houses[0].building.x + houses[0].building.w / 2;
  const walls = map.boxes.filter((b) => b.architecture?.part === "wall" && Math.abs(b.x - line) < 0.01 && b.architecture.level === 0);
  expect(new Set(walls.map((b) => b.architecture!.building))).toEqual(new Set(["row-1"]));
  expect(new Set(walls.map((b) => b.z.toFixed(2))).size).toBe(walls.length / 3);
  const g = scene(map), first = g.map.buildings!.find((b) => b.id === "row-1")!.kit!;
  const own = first.wings[0].bearing.filter((id) => !first.survivors.includes(id));
  smash(g, own);
  settle(g, 90);
  const alive = (id: string) => g.map.destruction!.objects[id].stage !== 2;
  expect(walls.filter((b) => b.baseY! < 1).every((b) => alive(b.id!))).toBe(true);
  const second = g.map.buildings!.find((b) => b.id === "row-2")!.kit!;
  expect(second.floors[1].every(alive)).toBe(true);
});

it("sets hit points by structural role", () => {
  const { map } = placed(narrowTownhouse);
  const g = scene(map);
  const grenade = { ...grenadeExplosionProfile, damage: 0, craterRadius: 0, craterDepth: 0, terrainReach: 0 };
  const near = (id: string, offset: { x?: number; y?: number; z?: number }) => {
    const b = piece(g, id).original;
    g.explode({ x: b.x + (offset.x ?? 0), y: (b.baseY ?? 0) + b.h / 2 + (offset.y ?? 0), z: b.z + (offset.z ?? 0) }, -1, null, grenade);
  };
  // One grenade opens a timber partition.
  near("wall-0-z-1-2-0", { x: 0.12 });
  expect(piece(g, "wall-0-z-1-2-0").stage).toBe(2);
  // Stone needs two at contact.
  near("wall-0-x-5-1-0", { z: -0.26 });
  expect(piece(g, "wall-0-x-5-1-0").stage).toBe(1);
  near("wall-0-x-5-1-0", { z: -0.26 });
  expect(piece(g, "wall-0-x-5-1-0").stage).toBe(2);
  // An upper floor and a stair tread survive one.
  near("floor-1-1-0", { y: 0.15 });
  expect(piece(g, "floor-1-1-0").stage).not.toBe(2);
  near("stair-0-8", { y: 0.3 });
  expect(piece(g, "stair-0-8").stage).toBe(0);
});

it("renders every kit piece as finite geometry, with slate mansards and half-bay window framing", () => {
  for (const plan of kitPlans) {
    const { map } = placed(plan);
    for (const b of map.boxes.filter((q) => q.architecture?.building === "house")) for (const stage of [0, 1]) {
      const meshes = architectureGeometry(b, stage);
      expect(meshes.length, b.id).toBeGreaterThan(0);
      for (const m of meshes) expect([...m.positions, ...m.normals, ...m.uvs].every(Number.isFinite), b.id).toBe(true);
    }
  }
  const { map } = placed(tenement);
  const mansard = map.boxes.find((b) => b.architecture?.mansard && b.architecture.part === "wall" && b.architecture.level === 2)!;
  expect(architectureGeometry(mansard, 0).map((m) => m.surface)).toContain("slate");
  const lintel = map.boxes.find((b) => b.architecture?.openingWidth && b.architecture.opening === "window")!;
  expect(lintel.architecture!.openingWidth).toBeCloseTo(kitBay / 2);
});
