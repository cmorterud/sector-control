import type { Box, MapDefinition, Vec } from "./map";

export interface FortRect { x0: number; x1: number; z0: number; z1: number }
interface FortRoom extends FortRect { id: string; name: string; vault?: true }
export interface FortLayout {
  rooms: FortRoom[];
  passages: FortRect[];
  yard: FortRect;
  yardPassage: { z: number; width: number };
  water: FortRect;
  waterHeight: number;
  ceilings: Box[];
  // serviceEntry is where each team's stores room opens onto the service
  // passage, so a flanker walks its length instead of cutting through the Cistern.
  approach: { service: Vec; serviceEntry: Record<"blue" | "red", Vec>; yard: Vec };
}

const rooms: FortRoom[] = [
  { id: "rear", name: "Rear entry", x0: -57, x1: -42, z0: -7, z1: 7 },
  { id: "barracks", name: "Barracks", x0: -37, x1: -22, z0: -7, z1: 7, vault: true },
  { id: "west-stores", name: "West stores", x0: -35, x1: -24, z0: -22, z1: -14 },
  { id: "cistern", name: "Cistern", x0: -8, x1: 8, z0: -7, z1: 7, vault: true },
  { id: "east-stores", name: "East stores", x0: 24, x1: 35, z0: -22, z1: -14 },
  { id: "casemate", name: "East casemate", x0: 22, x1: 37, z0: -7, z1: 7, vault: true },
  { id: "breach", name: "Breached entry", x0: 42, x1: 57, z0: -7, z1: 7 },
];
const yard: FortRect = { x0: -8, x1: 8, z0: 14, z1: 25 };
const yardPassage = { z: 19, width: 3.5 };
const serviceRoute: [number, number][] = [[-25, -19], [-18, -19], [-18, -16], [18, -16], [18, -19], [25, -19]];
const water: FortRect = { x0: -7.7, x1: 6.35, z0: -6.7, z1: 4.9 };

// The turns break sight lines into the spawns and across the service passage.
// Paths overlap rooms by half their width, making a continuous floor plan.
const routes: { points: [number, number][]; width: number }[] = [
  { points: [[-43, 0], [-36, 0]], width: 4 },
  { points: [[-23, 0], [-17, 0], [-17, 3], [-7, 3]], width: 4 },
  { points: [[7, -3], [17, -3], [17, 0], [23, 0]], width: 4 },
  { points: [[36, 0], [43, 0]], width: 4 },
  { points: [[-52, -6], [-52, -11], [-48, -11], [-48, -17], [-32, -17]], width: 3.5 },
  { points: [[52, -6], [52, -11], [48, -11], [48, -17], [32, -17]], width: 3.5 },
  { points: serviceRoute, width: 3.5 },
  { points: [[0, -16], [0, -6]], width: 3.6 },
  { points: [[-29, 6], [-29, yardPassage.z], [yard.x0 + 1, yardPassage.z]], width: yardPassage.width },
  { points: [[29, 6], [29, yardPassage.z], [yard.x1 - 1, yardPassage.z]], width: yardPassage.width },
];
const passages = routes.flatMap(({ points, width }) => points.slice(1).map(([x, z], i) => {
  const [fromX, fromZ] = points[i], r = width / 2;
  return { x0: Math.min(x, fromX) - r, x1: Math.max(x, fromX) + r,
    z0: Math.min(z, fromZ) - r, z1: Math.max(z, fromZ) + r };
}));
export const inFortRect = ({ x, z }: Vec, r: FortRect) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
const center = (r: FortRect) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });
const box = (id: string, r: FortRect, baseY: number, h: number): Box => ({
  id, ...center(r), w: r.x1 - r.x0, d: r.z1 - r.z0, baseY, h, kind: "bunker",
});

function wallsFor(spaces: FortRect[]): Box[] {
  const coordinate = (axis: "x" | "z") => [...new Set(spaces.flatMap(r => [r[`${axis}0`], r[`${axis}1`]]))].sort((a, b) => a - b);
  const walls: Box[] = [];
  for (const axis of ["x", "z"] as const) {
    const along = coordinate(axis === "x" ? "z" : "x");
    for (const edge of coordinate(axis)) {
      const inside = (across: number, run: number) => spaces.some(r => inFortRect(axis === "x" ? { x: across, z: run } : { x: run, z: across }, r));
      const half = 0.20;
      let start: number | undefined;
      for (let i = 0; i < along.length; i++) {
        const a = along[i], mid = (a + along[i + 1]) / 2;
        if (inside(edge - .001, mid) !== inside(edge + .001, mid)) {
          start ??= a;
        } else if (start !== undefined) {
          const strip = axis === "x" ? { x0: edge - half, x1: edge + half, z0: start, z1: a }
            : { x0: start, x1: a, z0: edge - half, z1: edge + half };
          walls.push(box(`fort-wall-${walls.length}`, strip, 0, 4.25));
          start = undefined;
        }
      }
    }
  }
  return walls;
}

// Runs of ceiling stop at a room's vault and the open yard. Where passage
// rectangles overlap at a turn, combine their cross-section into one slab.
function passageCeilings() {
  const spaces = [...passages, ...rooms.filter(r => !r.vault)];
  const excluded = [...rooms.filter(r => r.vault), yard];
  const coords = (axis: "x" | "z") => [...new Set([...spaces, ...excluded].flatMap(r => [r[`${axis}0`], r[`${axis}1`]]))].sort((a, b) => a - b);
  const xs = coords("x"), zs = coords("z"), slabs: Box[] = [];
  for (let j = 1; j < zs.length; j++) {
    const z0 = zs[j - 1], z1 = zs[j];
    let start: number | undefined;
    for (let i = 0; i < xs.length; i++) {
      const p = { x: (xs[i] + xs[i + 1]) / 2, z: (z0 + z1) / 2 };
      if (spaces.some(r => inFortRect(p, r)) && !excluded.some(r => inFortRect(p, r))) {
        start ??= xs[i];
      } else if (start !== undefined) {
        slabs.push(box(`fort-roof-${slabs.length}`, { x0: start, x1: xs[i], z0, z1 }, 2.85, 1.4));
        start = undefined;
      }
    }
  }
  return slabs;
}

export const fortVault = { spring: 2.85, crown: 4.25, segments: 12 };
export const fortVaultHeight = (fraction: number) => fortVault.spring + (fortVault.crown - fortVault.spring) * Math.sin(fraction * Math.PI);
const vaultColliders = rooms.filter(r => r.vault).flatMap(room => Array.from({ length: fortVault.segments }, (_, i) => {
  const depth = (room.z1 - room.z0) / fortVault.segments;
  const base = fortVaultHeight((i + .5) / fortVault.segments);
  return box(`fort-vault-${room.id}-${i}`, { ...room, z0: room.z0 + i * depth, z1: room.z0 + (i + 1) * depth }, base, 4.45 - base);
}));
const ceilings = passageCeilings();
const solid = wallsFor([...rooms, ...passages, yard]);
const walkway = [
  box("fort-walkway-south", { x0: -8, x1: 8, z0: water.z1, z1: 7 }, 0, .18),
  box("fort-walkway-east", { x0: water.x1, x1: 8, z0: -7, z1: water.z1 }, 0, .18),
];
walkway.forEach(b => { b.walkable = true; });

const furnish = (id: string, x: number, z: number, w: number, d: number, h: number, feature?: "bed" | "workbench"): Box => ({
  id: `fort-${id}`, x, z, w, d, h, baseY: 0, kind: "wood", maxHp: 64,
  ...(feature ? { architecture: { building: "fort", part: "detail", level: 0, feature } } : { farmProp: id.startsWith("barrel") ? "barrels" : "crate" }),
});
const contents: Box[] = [
  ...[-34, -31.5, -26, -23.8].flatMap((x, i) => [-5.75, 5.75].map((z, side) => furnish(`bunk-${i}-${side}`, x, z, 2, 1.1, .85, "bed"))),
  furnish("bench", -28.5, -4.9, 2.4, 1, 1, "workbench"),
  furnish("barrel-stores-west", -30, -20.65, 1.55, .9, 1),
  furnish("crate-stores-east", 31, -20.65, 1.6, 1.2, 1.03),
  furnish("crate-casemate-north", 32, -5.6, 2.4, 1.25, 1.15),
  furnish("bench-casemate", 24, 5.7, 2, 1.1, .95, "workbench"),
  furnish("barrel-casemate", 34, 4.8, 1.65, 1, .95),
  furnish("crate-yard-west", -4.2, 21.3, 2.4, 1.4, 1.15),
  furnish("crate-yard-east", 4.2, 16.2, 2.1, 1.15, .9),
  { id: "fort-cistern-barricade", x: -.8, z: 1.45, w: 2.8, d: .48, h: 1.02, kind: "wood", maxHp: 76,
    architecture: { building: "fort", part: "detail", level: 0, feature: "barricade" } },
  // Its twin across the flag. Everything added to the Cistern is point-symmetric
  // about the room's center, like its two gallery doors.
  { id: "fort-cistern-barricade-east", x: .8, z: -1.45, w: 2.8, d: .48, h: 1.02, kind: "wood", maxHp: 76,
    architecture: { building: "fort", part: "detail", level: 0, feature: "barricade" } },
  // Low cover off each end wall; the northern one stands on the walkway.
  furnish("crate-cistern-south", -2.6, -5.6, 1.6, 1, 1.05),
  { ...furnish("crate-cistern-north", 2.6, 5.6, 1.6, 1, 1.05), baseY: .18 },
];
// Stone piers carry the Cistern's vault two paces inside each gallery door, on
// the line between the two doors. Nobody walking in is in view of the far door,
// and there is hard cover within a step. The room is point-symmetric about its
// center, so each team gets the same pier.
const cisternPiers = [{ x: -5.6, z: 2.2 }, { x: 5.6, z: -2.2 }].map(({ x, z }, i) => {
  const room = rooms.find(r => r.id === "cistern")!, top = fortVaultHeight((z - room.z0) / (room.z1 - room.z0));
  return box(`fort-pier-${i}`, { x0: x - .5, x1: x + .5, z0: z - .5, z1: z + .5 }, 0, top + .1);
});
const flags = [
  { id: "A", name: "Barracks", x: -29.5, z: 0, home: "blue" },
  { id: "B", name: "Cistern", x: 0, z: 0 },
  { id: "C", name: "East Casemate", x: 29.5, z: 0, home: "red" },
] satisfies MapDefinition["sectors"];

export const fortVauxMap: MapDefinition = {
  id: "fort-vaux", name: "Fort Vaux", width: 122, depth: 56, navSpacing: 2.5,
  defaultTeamSize: 6, scoring: "domination", artillery: false,
  fort: { rooms, passages, yard, yardPassage, water, waterHeight: .13, ceilings, approach: {
    service: { x: 0, z: -16 },
    serviceEntry: { blue: { x: serviceRoute[0][0], z: serviceRoute[0][1] }, red: { x: serviceRoute.at(-1)![0], z: serviceRoute.at(-1)![1] } },
    yard: center(yard),
  } },
  spawn: { blue: { x: -49.5, z: .8 }, red: { x: 49.5, z: -.8 } },
  sectors: flags,
  // Every 1.25 m along each route: the regular 2.5 m lattice can miss narrow
  // corridors entirely, leaving rooms such as the stores unreachable.
  navigationPoints: routes.flatMap(({ points }) => points.slice(1).flatMap(([x, z], i) => {
    const [fromX, fromZ] = points[i], steps = Math.max(1, Math.ceil(Math.hypot(x - fromX, z - fromZ) / 1.25));
    return Array.from({ length: steps + (i === points.length - 2 ? 1 : 0) }, (_, j) => ({ x: fromX + (x - fromX) * j / steps, z: fromZ + (z - fromZ) * j / steps }));
  })),
  buildings: rooms.map(room => ({ id: room.id, name: room.name, ...center(room), w: room.x1 - room.x0,
    d: room.z1 - room.z0, baseY: 0, stories: 1, posts: [] })),
  boxes: [...solid, ...ceilings, ...vaultColliders, ...walkway, ...cisternPiers, ...contents],
};
