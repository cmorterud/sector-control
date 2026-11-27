import { groundHeight, hillHeight, type Box, type MapDefinition, type TrenchLine, type Vec } from "./map";
import { buildTrenchBanks } from "./trench-banks";
import { coastalRules } from "./coastal-scenery";
import { gallipoliGround, gallipoliHeight, shoreX } from "./gallipoli-terrain";

// Gallipoli: Anzac, 6 to 8 August 1915, authored for play rather than
// reconstructed. ANZAC (blue) lands on the beach on the west and climbs; the
// Ottoman army (red) holds the ridge and the summit on the east, with its
// spawn on the reverse slope below Battleship Hill. The ground is
// src/gallipoli-terrain.ts: a 45 m climb through scrub gullies, baked into
// the terrain's `hill` field so the trenches below follow it.
//
// Two lanes climb side by side. North: Table Top (A), the Nek (C), Chunuk
// Bair (F). South: Owen's Gully (B), Lone Pine (D), Scrubby Knoll (E).
// Plugge's Plateau divides them below the ridge and Monash Valley joins them
// behind it. On the ridge the two sides' trenches are 20 to 25 m apart.
//
// The fought-over 208 x 144 m area sits inside a 16 m dead zone. Terrain
// patches are 8 m and start at whole multiples of 8, so both half extents stay
// multiples of 8. The sea is part of the terrain on the west and closed to
// movement by the coast.
const playWidth = 208, playDepth = 144, deadZone = 16, bankHeight = 2.4;
const width = playWidth + deadZone * 2, depth = playDepth + deadZone * 2;
type Team = "blue" | "red";
const sideOf = (team: Team) => (team === "blue" ? -1 : 1);

// The hillside under everything, at the terrain's 2 m triangles. Ground on a
// flat map stands at the bank height; here it stands at its height above the
// sea, plus the sea's level.
const spacing = 2, hillColumns = width / spacing + 1, hillRows = depth / spacing + 1;
const hillValues = new Float32Array(hillColumns * hillRows);
for (let row = 0; row < hillRows; row++)
  for (let col = 0; col < hillColumns; col++)
    hillValues[row * hillColumns + col] = gallipoliHeight(col * spacing - width / 2, row * spacing - depth / 2) + coastalRules.seaLevel - bankHeight;

const heights = new Float32Array(width * depth).fill(bankHeight);
const terrain: NonNullable<MapDefinition["terrain"]> = {
  bankHeight, cellSize: 1, columns: width, rows: depth, heights,
  rectangles: [], ramps: [], lining: [], craters: [], shellScars: [], depressions: [],
  trenchLines: [], communicationRoutes: [], branchRoutes: [], shelterBays: [],
  hill: { originX: -width / 2, originZ: -depth / 2, spacing, columns: hillColumns, rows: hillRows, values: hillValues },
};
const boxes: Box[] = [], vegetation: Box[] = [];
const platforms: { x: number; z: number; w: number; d: number; h: number }[] = [];
const dig = (x: number, z: number, w: number, d: number, h = 0) => terrain.rectangles.push({ x, z, w, d, h });
const ramp = (x: number, z: number, w: number, d: number, low: number, high: number, direction: 1 | -1) =>
  terrain.ramps.push({ x, z, w, d, low, high, direction });
// A 2 m communication trench through axis-aligned turns.
function route(points: Vec[], team: Team, h = 0, branch = false) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    dig((a.x + b.x) / 2, (a.z + b.z) / 2, Math.abs(a.x - b.x) + 2, Math.abs(a.z - b.z) + 2, h);
  }
  (branch ? terrain.branchRoutes! : terrain.communicationRoutes!).push({ team, entrance: points[0], points });
}

// ---------------------------------------------------------------------------
// The flags, on the places the ground was shaped for.
const place = gallipoliGround.places;
const sectors: MapDefinition["sectors"] = [
  { id: "A", name: "Table Top", x: place.tableTop.x, z: place.tableTop.z, home: "blue" },
  { id: "B", name: "Owen's Gully", x: place.owensGully.x, z: place.owensGully.z, home: "blue" },
  { id: "C", name: "The Nek", x: place.nek.x, z: place.nek.z },
  { id: "D", name: "Lone Pine", x: place.lonePine.x, z: place.lonePine.z },
  { id: "E", name: "Scrubby Knoll", x: place.scrubbyKnoll.x, z: place.scrubbyKnoll.z, home: "red" },
  { id: "F", name: "Chunuk Bair", x: place.chunukBair.x, z: place.chunukBair.z, home: "red" },
];
const flag = (id: string) => sectors.find((s) => s.id === id)!;

// ---------------------------------------------------------------------------
// Trench lines: zigzags of fire bays, as on the Western Front maps, but short
// and set on the ridge's two plateaus. ANZAC holds Russell's Top facing the
// Nek and the line in front of Lone Pine; the Ottoman front trenches face them
// 20 to 25 m away, with more lines behind up to the summit.
type LineSpec = {
  team: Team; x: number; role: "front" | "rear"; z0: number; z1: number;
  floor: { offset: number; half: number }; step: boolean; lengths: number[]; jogs: number[];
};
const lineSpecs: LineSpec[] = [
  // The Nek: Russell's Top and the Ottoman trenches across the saddle.
  { team: "blue", x: -6, role: "front", z0: -56, z1: -28, floor: { offset: 1, half: 2 }, step: true, lengths: [9, 10, 9], jogs: [0, -2, 1] },
  { team: "red", x: 18, role: "front", z0: -56, z1: -28, floor: { offset: 1, half: 2 }, step: true, lengths: [10, 8, 10], jogs: [0, 2, -1] },
  // Lone Pine: the ANZAC jump-off line and the Ottoman front trench, roofed in
  // the real one; the open trenches behind it.
  { team: "blue", x: -8, role: "front", z0: 20, z1: 66, floor: { offset: 1, half: 2 }, step: true, lengths: [12, 10, 14, 10], jogs: [0, -2, 1, -1] },
  { team: "red", x: 14, role: "front", z0: 22, z1: 64, floor: { offset: 1, half: 2 }, step: true, lengths: [10, 12, 10, 10], jogs: [0, 2, -1, 1] },
  { team: "red", x: 27, role: "rear", z0: 24, z1: 62, floor: { offset: 0.5, half: 1.5 }, step: true, lengths: [12, 14, 12], jogs: [0, -2, 1] },
  // Behind the Nek, under Baby 700.
  { team: "red", x: 34, role: "rear", z0: -58, z1: -26, floor: { offset: 0.5, half: 1.5 }, step: true, lengths: [10, 12, 10], jogs: [0, 2, -1] },
  // The summit line, west of Chunuk Bair and Scrubby Knoll.
  { team: "red", x: 52, role: "rear", z0: -62, z1: -22, floor: { offset: 0, half: 1 }, step: false, lengths: [14, 12, 14], jogs: [0, -2, 1] },
  { team: "red", x: 52, role: "rear", z0: 20, z1: 60, floor: { offset: 0, half: 1 }, step: false, lengths: [12, 14, 14], jogs: [0, 2, -1] },
];
const steps: { team: Team; s: number; x: number; z0: number; z1: number }[] = [];
for (const spec of lineSpecs) {
  const s = sideOf(spec.team), sections: TrenchLine["sections"] = [];
  for (let z = spec.z0, i = 0; z < spec.z1 - 2; i++) {
    const length = Math.min(spec.lengths[i % spec.lengths.length], spec.z1 - z);
    sections.push({ x: spec.x + s * spec.jogs[i % spec.jogs.length], z: z + length / 2, length });
    z += length;
  }
  terrain.trenchLines!.push({ team: spec.team, role: spec.role, sections, floor: spec.floor });
  const floorX = (x: number) => x - s * spec.floor.offset, fw = spec.floor.half * 2;
  sections.forEach((section, k) => {
    dig(floorX(section.x), section.z, fw, section.length);
    const next = sections[k + 1];
    if (next) {
      const a = floorX(section.x), b = floorX(next.x);
      dig((a + b) / 2, section.z + section.length / 2, Math.abs(a - b) + fw, 2);
    }
    if (spec.step && section.length >= 8)
      steps.push({ team: spec.team, s, x: floorX(section.x) - s * (spec.floor.half - 0.5), z0: section.z - section.length / 2 + 1.5, z1: section.z + section.length / 2 - 1.5 });
  });
}
const lines = terrain.trenchLines!;
function floorAt(line: TrenchLine, z: number) {
  const section = line.sections.find((q) => Math.abs(q.z - z) <= q.length / 2 - 1);
  return section && section.x - sideOf(line.team) * (line.floor?.offset ?? 0);
}
function fit(line: TrenchLine, z: number) {
  for (let dz = 0; dz <= 4; dz += 0.5) for (const sign of [1, -1]) {
    const x = floorAt(line, z + sign * dz);
    if (x !== undefined) return { x, z: z + sign * dz };
  }
  throw Error(`Gallipoli: no ${line.team} floor near z ${z}`);
}
// In lineSpecs' order.
const [nekAnzac, nekOttoman, pineAnzac, pineOttoman, pineRear, baby700, summitNorth, summitSouth] = lines;

// Ottoman communication trenches: from each front up through the lines behind
// it to the summit, and out of the summit lines toward the spawn.
for (const [near, far, zs] of [
  [nekOttoman, baby700, [-48, -34]], [baby700, summitNorth, [-52, -32]],
  [pineOttoman, pineRear, [30, 50]], [pineRear, summitSouth, [34, 54]],
] as const) for (const z of zs) {
  const a = fit(near, z), b = fit(far, z + 3), mid = Math.round((a.x + b.x) / 2);
  route([b, { x: mid, z: b.z }, { x: mid, z: a.z }, a], "red");
}
for (const line of [summitNorth, summitSouth]) for (const target of line === summitNorth ? [-54, -30] : [28, 52]) {
  const { x, z } = fit(line, target);
  ramp(x + 5.5, z, 9, 3, 0, bankHeight, 1);
}
// Ramps out of the rear of each ANZAC line, down toward Monash Valley, and
// sally ramps forward out of every front line.
for (const [line, zs] of [[nekAnzac, [-50, -34]], [pineAnzac, [26, 44, 60]]] as const) for (const target of zs) {
  const { x, z } = fit(line, target);
  ramp(x - 5.5, z, 9, 3, 0, bankHeight, -1);
}
for (const [line, zs] of [[nekAnzac, [-46, -38]], [nekOttoman, [-50, -34]], [pineAnzac, [34, 54]], [pineOttoman, [26, 58]], [pineRear, [44]], [baby700, [-42]]] as const)
  for (const target of zs) {
    const { x, z } = fit(line, target), s = sideOf(line.team);
    ramp(x - s * (line.floor!.half + 4), z, 9, 3, 0, bankHeight, -s as 1 | -1);
  }

// A, E and F: shallow pits on the spur and knoll tops, with a ramp in from each side.
for (const id of ["A", "E", "F"]) {
  const { x, z } = flag(id);
  dig(x, z, 14, 12, 1.2);
  ramp(x - 9, z + 3, 4, 3, 1.2, bankHeight, -1);
  ramp(x + 9, z - 3, 4, 3, 1.2, bankHeight, 1);
}
// E and F join the summit line behind them.
for (const id of ["E", "F"]) {
  const { x, z } = flag(id), line = id === "E" ? summitSouth : summitNorth, a = fit(line, z - 4);
  route([a, { x: x - 7, z: a.z }], "red", 0, true);
  ramp(x - 8.5, a.z, 3, 2, 0, 1.2, 1);
}
// B: a bombing sap from the head of Owen's Gully up toward Lone Pine.
{
  const { x, z } = flag("B");
  route([{ x: x + 9, z: z - 4 }, { x: x + 9, z: z - 12 }, { x: x + 22, z: z - 12 }], "red", 0, true);
  ramp(x + 6.5, z - 4, 3, 2, 0, bankHeight, -1);
}

// Bake the dug rectangles, then the firing steps on top of them.
const bake = (r: { x: number; z: number; w: number; d: number }, h: number, raise = false) => {
  const c0 = Math.max(0, Math.ceil(r.x - r.w / 2 + width / 2 - 0.5)), c1 = Math.min(width - 1, Math.floor(r.x + r.w / 2 + width / 2 - 0.5));
  const r0 = Math.max(0, Math.ceil(r.z - r.d / 2 + depth / 2 - 0.5)), r1 = Math.min(depth - 1, Math.floor(r.z + r.d / 2 + depth / 2 - 0.5));
  for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) {
    const cx = col + 0.5 - width / 2, cz = row + 0.5 - depth / 2;
    if (Math.abs(cx - r.x) < r.w / 2 && Math.abs(cz - r.z) < r.d / 2)
      heights[row * width + col] = raise ? h : Math.min(heights[row * width + col], h);
  }
};
for (const r of terrain.rectangles) bake(r, r.h);
const junctions = [
  ...[...terrain.communicationRoutes!, ...terrain.branchRoutes!].flatMap((r) => r.points.slice(1).map((b, i) => {
    const a = r.points[i];
    return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, w: Math.abs(a.x - b.x) + 2, d: Math.abs(a.z - b.z) + 2 };
  })),
  ...terrain.ramps.filter((r) => r.w > 2),
];
const atJunction = (x: number, z: number, margin: number) =>
  junctions.some((j) => Math.abs(j.x - x) < j.w / 2 + margin && Math.abs(j.z - z) < j.d / 2 + margin);
// A 0.85 m firing step along the enemy wall, split around every junction.
for (const step of steps) {
  let start: number | null = null;
  const finish = (end: number) => {
    if (start !== null && end - start >= 3) {
      const z = (start + end) / 2, d = end - start;
      platforms.push({ x: step.x, z, w: 1, d, h: 0.85 });
      ramp(step.x + step.s, z, 1, d, 0, 0.85, -step.s as 1 | -1);
    }
    start = null;
  };
  for (let z = step.z0; z < step.z1; z += 0.5) {
    if (atJunction(step.x, z + 0.25, 0.8) || atJunction(step.x + step.s, z + 0.25, 0.8)) finish(z);
    else start ??= z;
  }
  finish(step.z1);
}
for (const p of platforms) bake(p, p.h, true);

// The coastline: the land east of the waterline, closed beyond the terrain
// edges where nothing is drawn and no edge is near enough to close ground.
const coast: Vec[] = [];
for (let z = -100; z <= 100; z += 4) coast.push({ x: shoreX(z), z });
coast.push({ x: 200, z: 100 }, { x: 200, z: -100 });

export const gallipoliMap: MapDefinition = {
  id: "gallipoli", name: "Gallipoli", width, depth, navSpacing: 4, scoring: "domination",
  playArea: { width: playWidth, depth: playDepth }, boundary: { warningTicks: 5 * 30, wireDepth: 3 }, backdrop: true,
  // Neither side used gas at Gallipoli, and the flame kit stays home.
  gas: false, flamethrower: false,
  defaultTeamSize: 50, maxTeamSize: 64,
  coast,
  navigationPoints: [],
  // ANZAC on the beach; the Ottoman army behind the crest, out of sight of the sea.
  spawn: { blue: { x: -85, z: 0 }, red: { x: 96, z: 0 } },
  // Attack and defend by default (?mode=domination for flags both ways). The
  // Ottoman line comes forward to hold the first spurs, then falls back to the
  // crest; ANZAC follows up behind each line it takes.
  offensive: {
    attacker: "blue",
    phases: [
      { flags: ["A", "B"], spawn: { red: { x: 30, z: 0 } } },
      { flags: ["C", "D"], spawn: { blue: { x: -24, z: 0 }, red: { x: 74, z: 0 } } },
      { flags: ["E", "F"], spawn: { blue: { x: 25, z: 0 }, red: { x: 96, z: 0 } } },
    ],
    pool: { perSoldier: 2, perPhase: 1 },
    clock: { start: 300, perPhase: 240 },
    defenderRespawn: 10,
  },
  boxes, vegetation, terrain, sectors,
  landmarks: [
    { id: "A", name: "Table Top", kind: "gunpit", x: flag("A").x, z: flag("A").z, radius: 9 },
    { id: "B", name: "Owen's Gully", kind: "woodland", x: flag("B").x, z: flag("B").z, radius: 9 },
    { id: "C", name: "The Nek", kind: "bunker", x: flag("C").x, z: flag("C").z, radius: 10 },
    { id: "D", name: "Lone Pine", kind: "bunker", x: flag("D").x, z: flag("D").z, radius: 12 },
    { id: "E", name: "Scrubby Knoll", kind: "relay", x: flag("E").x, z: flag("E").z, radius: 9 },
    { id: "F", name: "Chunuk Bair", kind: "gunpit", x: flag("F").x, z: flag("F").z, radius: 9 },
  ],
};
const map = gallipoliMap;
terrain.banks = buildTrenchBanks(map);
// Height of the dug-out ground under the hillside, so the rules written for
// flat maps (a trench is below the bank) still read the same.
const local = (x: number, z: number) => groundHeight(x, z, map) - hillHeight(x, z, map);

// ---------------------------------------------------------------------------
// Cover. `add` places a box on the finished ground.
const add = (id: string, x: number, z: number, w: number, d: number, h: number, kind: Box["kind"] = "sandbag", extra: Partial<Box> = {}) => {
  const b: Box = { id: `gp-${id}`, x, z, w, d, h, kind, ...extra };
  boxes.push(b);
  return b;
};
// A: sandbags round the Table Top outpost's west and north lips.
{
  const { x, z } = flag("A");
  add("tabletop-bags-0", x - 7.6, z - 1, 0.8, 3, 0.75, "sandbag", { landmark: "A" });
  add("tabletop-bags-1", x - 2, z - 6.7, 3, 0.8, 0.75, "sandbag", { landmark: "A" });
  add("tabletop-bags-2", x + 3, z + 6.7, 3, 0.8, 0.75, "sandbag", { landmark: "A" });
}
// B: Ottoman sniper posts on the spurs either side of the gully head.
for (const [i, [dx, dz]] of [[-6, -13], [-4, 14]].entries()) {
  const { x, z } = flag("B");
  add(`sniper-${i}-0`, x + dx, z + dz, 2.4, 0.8, 0.8, "sandbag", { landmark: "B" });
  add(`sniper-${i}-1`, x + dx - 1.6, z + dz + (dz < 0 ? 1.1 : -1.1), 0.8, 2, 0.8, "sandbag", { landmark: "B" });
}
// E: the command post's dugout walls; F: sandbags round the summit pit.
{
  const { x, z } = flag("E");
  add("knoll-post-0", x + 3, z - 2.5, 3, 0.6, 1.6, "wood", { landmark: "E" });
  add("knoll-post-1", x + 4.6, z - 0.6, 0.6, 3.2, 1.6, "wood", { landmark: "E" });
  add("knoll-bags", x - 3, z + 6.7, 3, 0.8, 0.75, "sandbag", { landmark: "E" });
}
{
  const { x, z } = flag("F");
  add("summit-bags-0", x - 7.6, z, 0.8, 3, 0.75, "sandbag", { landmark: "F" });
  add("summit-bags-1", x + 1, z - 6.7, 3, 0.8, 0.75, "sandbag", { landmark: "F" });
}
// The beach: stacked stores and a sandbag wall at each end of the ANZAC line,
// lighters drawn up on the sand, and dugouts terraced into the foot of the slope.
for (const [i, [x, z, w, d, h, kind]] of ([
  [-88, -30, 2.4, 1.4, 1.1, "wood"], [-86, -27, 1.4, 1.2, 0.9, "wood"], [-82, 12, 2.6, 1.6, 1.2, "wood"],
  [-84, 30, 1.6, 1.2, 0.9, "wood"], [-83, -52, 3, 0.8, 0.8, "sandbag"], [-83, 58, 3, 0.8, 0.8, "sandbag"],
  [-89, 18, 1.2, 1.2, 0.7, "wood"], [-87, 20.5, 2, 1.2, 1, "wood"], [-88, -12, 1.6, 2.4, 0.9, "wood"],
  [-86, 44, 1.2, 1.6, 0.8, "wood"], [-89, -40, 2.2, 1.2, 1, "wood"],
] as const).entries())
  add(`beach-${i}`, x, z, w, d, h, kind, kind === "wood" ? { farmProp: "crate" } : {});
for (const [i, z] of [-20, 36].entries()) {
  const x = shoreX(z) + 4.5;
  add(`lighter-${i}`, x, z, 2.4, 7, 0.95, "wood", { landmark: "beach" });
}
for (const [i, z] of [-46, -24, -6, 8, 26, 50].entries()) {
  // A sandbag front and a timber lintel where the beach meets the first slope.
  const x = -77.5;
  add(`dugout-${i}-bags`, x - 0.4, z, 0.8, 2.6, 0.9, "sandbag", { landmark: "beach" });
  add(`dugout-${i}-lintel`, x - 0.1, z, 0.3, 2.2, 0.22, "wood", { landmark: "beach", baseY: 1.25 });
  add(`dugout-${i}-post-0`, x - 0.1, z - 1.05, 0.22, 0.22, 1.25, "wood", { landmark: "beach" });
  add(`dugout-${i}-post-1`, x - 0.1, z + 1.05, 0.22, 0.22, 1.25, "wood", { landmark: "beach" });
}
for (const b of boxes) b.baseY = groundHeight(b.x, b.z, map) - 0.03 + (b.baseY ?? 0);

// Lone Pine: the Ottoman front trench roofed with pine logs, earthed over and
// flush with the ground, in short lengths with gaps between them where the
// attackers dropped in. The roof covers the rear half of the floor, so the
// firing step and the ramp up to it stay open along the front wall, and the
// flag pole stands in a gap. Each length rests on log posts
// against the rear wall: shell the posts away and the roof comes down.
{
  const s = sideOf(pineOttoman.team), half = pineOttoman.floor!.half, d = flag("D");
  for (const section of pineOttoman.sections) {
    const floorX = section.x - s * pineOttoman.floor!.offset;
    const x0 = floorX + s * 0.3, x1 = floorX + s * half, cx = (x0 + x1) / 2, w = Math.abs(x1 - x0);
    for (let z = section.z - section.length / 2 + 0.6; z + 3 <= section.z + section.length / 2 - 0.6; z += 4) {
      const cz = z + 1.5;
      if (Math.abs(cz - d.z) < 3.5 || atJunction(cx, z, 0.6) || atJunction(cx, z + 3, 0.6)) continue;
      const floor = groundHeight(cx, cz, map), id = `pine-roof-${boxes.length}`;
      const posts = [z + 0.15, z + 2.85].map((pz, j) =>
        add(`${id}-post-${j}`, x1 - s * 0.12, pz, 0.22, 0.22, bankHeight - 0.25, "log", { landmark: "D", baseY: floor - 0.03 }));
      add(id, cx, cz, w, 3, 0.25, "log", { landmark: "D", baseY: floor + bankHeight - 0.25, supports: posts.map((b) => b.id!) });
    }
  }
}
// The Nek: sandbag parados along the rear lip of both lines, broken where a
// route or ramp leaves, so the step's view over the front lip stays clear.
for (const line of [nekAnzac, nekOttoman]) {
  const s = sideOf(line.team), half = line.floor!.half;
  for (const section of line.sections) {
    const x = section.x - s * line.floor!.offset + s * (half + 0.55);
    for (let z = section.z - section.length / 2 + 0.6; z + 1.6 <= section.z + section.length / 2; z += 2.2) {
      if (atJunction(x, z + 0.8, 0.6)) continue;
      add(`nek-parados-${boxes.length}`, x, z + 0.8, 0.9, 1.6, 0.6, "sandbag", { landmark: "C", baseY: groundHeight(x, z + 0.8, map) - 0.03 });
    }
  }
}
// Watson's pier, run out from the beach into the sea on piles.
{
  const z = 2, x0 = shoreX(z) + 3, length = 30, deck = coastalRules.seaLevel + 0.7;
  add("pier-deck", x0 - length / 2, z, length, 2.6, 0.18, "wood", { landmark: "beach", baseY: deck, walkable: true });
  for (let x = x0 - 2; x > x0 - length; x -= 4)
    for (const dz of [-1.1, 1.1]) add(`pier-pile-${boxes.length}`, x, z + dz, 0.25, 0.25, deck + 3, "wood", { landmark: "beach", baseY: -3 });
}

// Revetment along the dug walls of the front lines.
for (const line of lines.filter((l) => l.role === "front")) {
  const half = line.floor!.half, s = sideOf(line.team);
  for (const section of line.sections) for (const edge of [-1, 1]) {
    const x = section.x - s * line.floor!.offset + edge * (half + 0.15);
    for (let z = section.z - section.length / 2 + 1; z < section.z + section.length / 2; z += 2)
      if (local(x + edge * 0.25, z) > 0.3 && local(x - edge * 0.35, z) < 0.1) terrain.lining.push({ x, z, w: 0.12, d: 1.8 });
  }
}

// ---------------------------------------------------------------------------
// Scrub: low holly-oak brush over the spurs and gully sides, thinner on the
// ridge plateaus and the summit. Concealment, not cover.
let seed = 1915;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const plantClear = (x: number, z: number) => {
  for (const s of Object.values(map.spawn)) if (Math.hypot(x - s.x, z - s.z) < 14) return false;
  if (x < shoreX(z) + gallipoliGround.beachWidth + 2) return false;
  if (sectors.some((f) => Math.hypot(f.x - x, f.z - z) < 8)) return false;
  if (boxes.some((b) => Math.abs(x - b.x) < b.w / 2 + 1 && Math.abs(z - b.z) < b.d / 2 + 1.4)) return false;
  for (let dx = -1.5; dx <= 1.5; dx += 1.5) for (let dz = -1.5; dz <= 1.5; dz += 1.5)
    if (local(x + dx, z + dz) < bankHeight - 0.3) return false;
  return true;
};
for (let tries = 0; vegetation.length < 280 && tries < 5000; tries++) {
  const x = -76 + rand() * 172, z = (rand() * 2 - 1) * (playDepth / 2 - 2);
  // Thickest in the gully country, sparse on the ridge.
  if (rand() > (x < -20 ? 0.9 : x < 40 ? 0.35 : 0.55)) continue;
  if (!plantClear(x, z)) continue;
  const w = 1.1 + rand() * 1.2;
  vegetation.push({ id: `scrub-gp-${vegetation.length}`, x, z, w, d: w * (1.2 + rand() * 0.6), h: 0.5 + rand() * 0.35, kind: "brush", baseY: groundHeight(x, z, map) - 0.025 });
}

// Fine waypoints through the flag works and every trench route, joined to the coarse field graph.
for (const f of sectors) for (let x = -10; x <= 10; x += 2) for (let z = -10; z <= 10; z += 2) map.navigationPoints!.push({ x: f.x + x, z: f.z + z });
for (const r of [...terrain.communicationRoutes!, ...terrain.branchRoutes!]) for (const point of r.points) map.navigationPoints!.push({ ...point });
for (const r of terrain.ramps.filter((q) => q.w > 2)) for (const x of [r.x - r.w / 2, r.x, r.x + r.w / 2]) map.navigationPoints!.push({ x, z: r.z });
