import { expect, it } from "vitest";
import { industrialMap, bodyBlocked, type MapDefinition } from "./map";
import { Game, TestCollision, idle } from "./simulation";
import { buildKitHouse, kitBay, kitStory, parseCell, type KitPlan } from "./house-kit";
import { narrowTownhouse, kitPlans } from "./house-kit-plans";
import { villageMap } from "./village-map";

// Flat terrain gives soldiers the support-aware movement used on building maps.
const built = (plan: KitPlan) => {
  const map: MapDefinition = { ...industrialMap, width: 60, depth: 60, boxes: [], buildings: [], navigationPoints: [], sectors: [],
    spawn: { blue: { x: -25, z: 0 }, red: { x: 25, z: 0 } },
    terrain: { bankHeight: 0, cellSize: 1, columns: 60, rows: 60, heights: new Float32Array(3600), rectangles: [], ramps: [], lining: [], craters: [] } };
  buildKitHouse(map, plan, { id: "house", x: 0, z: 0, baseY: 0 });
  return new Game(new TestCollision(map), false, 6000, 5, undefined, { map, ambientArtillery: false });
};
const townhouse = () => built(narrowTownhouse);
const vault = (g: Game, at: { x: number; z: number; y: number }, yaw: number) => {
  const p = g.players[0];
  Object.assign(p, { ...at, vx: 0, vz: 0, protectedUntil: Infinity, nextMantle: 0, nextHop: 0 });
  g.step({ ...idle(), yaw, mantle: true });
  const started = p.mantle;
  for (let i = 0; i < 60; i++) g.step({ ...idle(), yaw });
  return started;
};

it("vaults in through a ground-floor window and lands clear inside", () => {
  // The townhouse's front window at C1 is centred on x = 2.5 in the north facade (z = -6.25).
  const g = townhouse(), p = g.players[0];
  const started = vault(g, { x: 2.5, z: -7.1, y: 0 }, Math.PI);
  expect(started?.vault).toBe(true);
  expect(p.z).toBeGreaterThan(-5.9);
  expect(p.y).toBeCloseTo(0.02, 1);
  expect(p.mantle).toBeNull();
  expect(bodyBlocked(p.x, p.z, p.y, 0.45, g.map)).toBe(false);
});

it("vaults back out through the same window", () => {
  const g = townhouse(), p = g.players[0];
  expect(vault(g, { x: 2.5, z: -5.4, y: 0.02 }, 0)?.vault).toBe(true);
  expect(p.z).toBeLessThan(-6.6);
});

it("refuses solid walls and windows above a drop", () => {
  const g = townhouse(), p = g.players[0];
  // A solid party wall stays solid: the soldier hops instead of vaulting.
  expect(vault(g, { x: -3, z: 0, y: 0 }, -Math.PI / 2)?.vault).toBeFalsy();
  expect(p.x).toBeGreaterThan(-3.6);
  // Upper windows would drop a full story: no vault out of the front room.
  expect(vault(g, { x: -2.5, z: -5.4, y: kitStory }, 0)?.vault).toBeFalsy();
  expect(p.z).toBeGreaterThan(-6.3);
});

it("also vaults through the older village buildings' windows", () => {
  const g = new Game(new TestCollision(villageMap), false, 6000, 5, undefined, { map: villageMap, ambientArtillery: false });
  const sill = g.map.boxes.find((b) => b.id === "village-school-north-0-2-0")!;
  const p = g.players[0];
  const started = vault(g, { x: sill.x, z: sill.z - 0.9, y: 2.4 }, Math.PI);
  expect(started?.vault).toBe(true);
  expect(p.z).toBeGreaterThan(sill.z + 0.5);
});

// Ground-floor windows count as exits, so each must be vaultable both ways.
it("keeps every kit ground-floor window vaultable in and out", () => {
  const facing = { north: [0, -1, 0], south: [0, 1, Math.PI], west: [-1, 0, -Math.PI / 2], east: [1, 0, Math.PI / 2] } as const;
  for (const plan of kitPlans) {
    const g = built(plan), p = g.players[0];
    const W = plan.bays.x * kitBay, D = plan.bays.z * kitBay;
    for (const o of plan.levels[0].openings ?? []) {
      if (o.kind !== "window") continue;
      const { col, row } = parseCell(o.at), [nx, nz, outward] = facing[o.side];
      const cx = -W / 2 + (col + 0.5) * kitBay + nx * kitBay / 2, cz = -D / 2 + (row + 0.5) * kitBay + nz * kitBay / 2;
      const label = plan.id + " " + o.at + " " + o.side;
      expect(vault(g, { x: cx + nx * 0.85, z: cz + nz * 0.85, y: 0 }, outward + Math.PI)?.vault, label + " in").toBe(true);
      expect((p.x - cx) * nx + (p.z - cz) * nz, label + " landed inside").toBeLessThan(-0.5);
      expect(vault(g, { x: cx - nx * 0.85, z: cz - nz * 0.85, y: 0.02 }, outward)?.vault, label + " out").toBe(true);
      expect((p.x - cx) * nx + (p.z - cz) * nz, label + " landed outside").toBeGreaterThan(0.5);
    }
  }
});
