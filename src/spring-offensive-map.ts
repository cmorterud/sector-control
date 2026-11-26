import { groundHeight, type Box, type MapDefinition, type TrenchLine, type Vec, type WireSegment } from "./map";
import { buildTrenchBanks } from "./trench-banks";
import { buildTrenchElevation, buildTrenchRelief } from "./terrain-relief";

// Spring Offensive: the St. Quentin front on the morning of 21 March 1918,
// authored for play rather than reconstructed. Britain (blue, west) holds three
// lines in depth: a broken outpost line of posts with gaps between them, the
// battle-zone trench and a rear switch line. Imperial Germany (red, east) holds
// its jump-off trench, front line and support line. The north is infantry
// ground around the Hill Redoubt and the chalk quarry; the ruined village sits
// in the centre; the open chalk plain to the south is the tank lane, with
// filled crossings left in every line at z 57 to 67.
//
// The fought-over 288 x 176 m area sits inside a 16 m dead zone like Verdun's.
// Terrain patches are 8 m and start at whole multiples of 8, so both half
// extents stay multiples of 8.
const playWidth = 288, playDepth = 176, deadZone = 16, bankHeight = 2.4;
const width = playWidth + deadZone * 2, depth = playDepth + deadZone * 2;
const halfPlayZ = playDepth / 2;
type Team = "blue" | "red";
const sideOf = (team: Team) => (team === "blue" ? -1 : 1);

const heights = new Float32Array(width * depth).fill(bankHeight);
const terrain: NonNullable<MapDefinition["terrain"]> = {
  bankHeight, cellSize: 1, columns: width, rows: depth, heights,
  rectangles: [], ramps: [], lining: [], craters: [], shellScars: [], depressions: [],
  // No bot firing posts: as on Verdun, bots fight for the seven flags rather
  // than manning the steps, which Trench front's two-line layout is built for.
  trenchLines: [], communicationRoutes: [], branchRoutes: [], shelterBays: [],
};
const boxes: Box[] = [], vegetation: Box[] = [];
// Raised firing steps, applied after every dig so nothing cuts them away.
const platforms: { x: number; z: number; w: number; d: number; h: number }[] = [];
const dig = (x: number, z: number, w: number, d: number, h = 0) => terrain.rectangles.push({ x, z, w, d, h });
const ramp = (x: number, z: number, w: number, d: number, low: number, high: number, direction: 1 | -1) =>
  terrain.ramps.push({ x, z, w, d, low, high, direction });
// A 2 m communication trench through axis-aligned turns, as on Verdun.
function route(points: Vec[], team: Team, h = 0, branch = false) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    dig((a.x + b.x) / 2, (a.z + b.z) / 2, Math.abs(a.x - b.x) + 2, Math.abs(a.z - b.z) + 2, h);
  }
  (branch ? terrain.branchRoutes! : terrain.communicationRoutes!).push({ team, entrance: points[0], points });
}

// ---------------------------------------------------------------------------
// Trench lines. Each is a zigzag of fire bays and traverses: sections step a
// few metres toward and away from the enemy, joined by short cross floors.
// `gaps` are stretches of z left undug: the tank crossings, and on the British
// outpost line the open ground between posts.
const tankLane = { z0: 57, z1: 67 };
const crossings: [number, number][] = [[tankLane.z0, tankLane.z1]];
type LineSpec = {
  team: Team; x: number; role: "front" | "rear";
  floor: { offset: number; half: number }; step: boolean;
  lengths: number[]; jogs: number[]; gaps: [number, number][];
};
const lineSpecs: LineSpec[] = [];
for (const team of ["blue", "red"] as const) {
  const s = sideOf(team);
  // First line: the British outpost line is posts with gaps; the German jump-off trench runs almost unbroken.
  lineSpecs.push({
    team, x: s * 38, role: "front", floor: { offset: 1, half: 2 }, step: true,
    lengths: team === "blue" ? [14, 12, 16, 12] : [12, 14, 12, 16],
    jogs: team === "blue" ? [0, -3, 1, -2] : [0, 2, -2, 3],
    gaps: team === "blue"
      ? [[-74, -64], [-40, -30], [-10, -4], [16, 24], ...crossings, [78, 84]]
      : [[-28, -24], ...crossings],
  });
  // Second line: the battle zone, a wider floor with its own firing step.
  lineSpecs.push({
    team, x: s * 72, role: "rear", floor: { offset: 0.5, half: 1.5 }, step: true,
    lengths: [18, 16, 20, 16], jogs: team === "blue" ? [0, 3, -1, 2] : [0, -2, 2, -3], gaps: [...crossings],
  });
  // Third line: rear switch / support line, a plain 2 m trench with dugouts.
  lineSpecs.push({
    team, x: s * 110, role: "rear", floor: { offset: 0, half: 1 }, step: false,
    lengths: [20, 18, 16, 20], jogs: [0, 2, -2, 1], gaps: [...crossings],
  });
}
const steps: { team: Team; s: number; x: number; z0: number; z1: number }[] = [];
const runs: { line: TrenchLine; sections: TrenchLine["sections"] }[] = [];
const lineEnd = halfPlayZ + 12; // runs on into the dead zone, closed by sandbags at the boundary
const blocks: { x: number; z: number; w: number }[] = [];
for (const spec of lineSpecs) {
  const s = sideOf(spec.team);
  const sections: TrenchLine["sections"] = [];
  const segments: TrenchLine["sections"][] = [[]];
  let z = -lineEnd, i = 0;
  while (z < lineEnd) {
    const length = Math.min(spec.lengths[i % spec.lengths.length], lineEnd - z);
    const z0 = z, z1 = z + length;
    const gap = spec.gaps.find(([g0, g1]) => z1 > g0 && z0 < g1);
    if (gap) {
      // Dig up to the gap, then resume beyond it.
      if (gap[0] - z0 >= 4) {
        const section = { x: spec.x + s * spec.jogs[i % spec.jogs.length], z: (z0 + gap[0]) / 2, length: gap[0] - z0 };
        sections.push(section); segments.at(-1)!.push(section);
      }
      segments.push([]);
      z = gap[1];
    } else {
      const section = { x: spec.x + s * spec.jogs[i % spec.jogs.length], z: (z0 + z1) / 2, length };
      sections.push(section); segments.at(-1)!.push(section);
      z = z1;
    }
    i++;
  }
  terrain.trenchLines!.push({ team: spec.team, role: spec.role, sections, floor: spec.floor });
  runs.push(...segments.filter((run) => run.length).map((run) => ({ line: terrain.trenchLines!.at(-1)!, sections: run })));
  const floorX = (x: number) => x - s * spec.floor.offset, fw = spec.floor.half * 2;
  for (const run of segments) run.forEach((section, k) => {
    dig(floorX(section.x), section.z, fw, section.length);
    const next = run[k + 1];
    if (next) {
      const a = floorX(section.x), b = floorX(next.x);
      dig((a + b) / 2, section.z + section.length / 2, Math.abs(a - b) + fw, 2);
    }
    const inside = Math.abs(section.z) < halfPlayZ - 2;
    if (spec.step && section.length >= 10 && inside) {
      // A 0.85 m firing step along the enemy wall, with a short ramp up to it.
      // Built once the routes and ramps are known, so it can stop short of their mouths.
      steps.push({ team: spec.team, s, x: floorX(section.x) - s * (spec.floor.half - 0.5), z0: section.z - section.length / 2 + 2, z1: section.z + section.length / 2 - 2 });
    }
  });
  // Sandbag blocks close each line where it leaves the play area.
  for (const end of [-1, 1]) {
    const at = end * (halfPlayZ - 0.7);
    const section = sections.find((q) => Math.abs(q.z - at) <= q.length / 2);
    if (section) blocks.push({ x: floorX(section.x), z: at, w: fw });
  }
}
const lines = terrain.trenchLines!;
const lineOf = (team: Team, n: 0 | 1 | 2) => lines.filter((l) => l.team === team)[n];
// The floor centre of a line at z, or undefined where the line has a gap.
function floorAt(line: TrenchLine, z: number) {
  const section = line.sections.find((q) => Math.abs(q.z - z) <= q.length / 2 - 1);
  return section && section.x - sideOf(line.team) * (line.floor?.offset ?? 0);
}
// The floor nearest z, within 3 m, clear of a bend or gap.
function fit(line: TrenchLine, z: number) {
  for (let dz = 0; dz <= 3; dz += 0.5) for (const sign of [1, -1]) {
    const x = floorAt(line, z + sign * dz);
    if (x !== undefined) return { x, z: z + sign * dz };
  }
  throw Error(`Spring Offensive: no ${line.team} ${line.role} floor near z ${z}`);
}

// ---------------------------------------------------------------------------
// Communication trenches join the lines with a dogleg, as on Verdun, and the
// rear line has ramps up to the spawn ground behind it.
const commZ: Record<Team, [number[], number[]]> = {
  blue: [[-50, -18, 30, 74], [-62, -20, 24, 76]],
  red: [[-52, -12, 28, 76], [-64, -18, 20, 78]],
};
for (const team of ["blue", "red"] as const) {
  const s = sideOf(team);
  for (const [n, zs] of commZ[team].entries()) {
    const near = lineOf(team, n as 0 | 1), far = lineOf(team, (n + 1) as 1 | 2);
    for (const z of zs) {
      const a = fit(near, z), b = fit(far, z + 4);
      const mid = Math.round((a.x + b.x) / 2);
      route([b, { x: mid, z: b.z }, { x: mid, z: a.z }, a], team);
    }
  }
  // Ramps out of the rear line toward the spawn ground.
  const rear = lineOf(team, 2);
  for (const target of [-44, 0, 40]) {
    const { x, z } = fit(rear, target);
    ramp(x + s * 5.5, z, 9, 3, 0, bankHeight, s as 1 | -1);
  }
  // Sally ramps out of the first and second lines toward the enemy.
  for (const [n, zs] of [[0, team === "blue" ? [-46, -20, 46] : [-40, 8, 44]], [1, [-36, 12, 48]]] as const) {
    const line = lineOf(team, n as 0 | 1);
    for (const target of zs) {
      const { x, z } = fit(line, target);
      const half = line.floor!.half;
      ramp(x - s * (half + 4), z, 9, 3, 0, bankHeight, -s as 1 | -1);
    }
  }
  // Dugout bays behind the second and third lines.
  for (const [n, zs] of [[1, [-48, 6, 52]], [2, [-28, 22, 70]]] as const) {
    const line = lineOf(team, n as 1 | 2);
    for (const target of zs) {
      const { x, z } = fit(line, target);
      const bay = { x: x + s * (line.floor!.half + 2.5), z: z + 4, team };
      dig(x + s * (line.floor!.half + 1), z + 4, 3, 2);
      dig(bay.x, bay.z, 4, 4);
      terrain.shelterBays!.push(bay);
    }
  }
}

// Every unbroken run of trench gets a way out: a run with no communication
// trench or ramp of its own (an isolated outpost) gets a ramp up its rear wall.
for (const run of runs) {
  const s = sideOf(run.line.team), half = run.line.floor!.half;
  const z0 = run.sections[0].z - run.sections[0].length / 2, z1 = run.sections.at(-1)!.z + run.sections.at(-1)!.length / 2;
  if (z1 < -halfPlayZ + 4 || z0 > halfPlayZ - 4) continue;
  const lineX = run.sections[0].x;
  const served = [...terrain.communicationRoutes!, ...terrain.branchRoutes!].some((r) => r.points.some((p) => p.z > z0 && p.z < z1 && Math.abs(p.x - lineX) < 8)) ||
    terrain.ramps.some((r) => r.w > 2 && r.z > z0 && r.z < z1 && Math.abs(r.x - lineX) < 10);
  if (served) continue;
  const { x, z } = fit(run.line, Math.max(-halfPlayZ + 6, Math.min(halfPlayZ - 6, (z0 + z1) / 2)));
  ramp(x + s * (half + 4), z, 9, 3, 0, bankHeight, s as 1 | -1);
}

// ---------------------------------------------------------------------------
// Objectives. Home flags sit between each side's second and third lines, so an
// attacker has to break the battle zone to reach them; the three neutral flags
// stand across no-man's land.
const sectors: MapDefinition["sectors"] = [
  { id: "A", name: "Battle-zone keep", x: -88, z: -44, home: "blue" },
  { id: "B", name: "Railway cutting", x: -88, z: 48, home: "blue" },
  { id: "C", name: "Hill Redoubt", x: 0, z: -54 },
  { id: "D", name: "Ruined village", x: 0, z: 0 },
  { id: "E", name: "Windmill crossroads", x: 4, z: 52 },
  { id: "F", name: "Chalk quarry", x: 88, z: -44, home: "red" },
  { id: "G", name: "Sunken road", x: 90, z: 44, home: "red" },
];
const flag = (id: string) => sectors.find((s) => s.id === id)!;

// A: Battle-zone keep. A half-depth earthwork behind the British battle zone,
// joined to both lines, with a concrete machine-gun post in its west corner.
{
  const { x, z } = flag("A");
  dig(x, z, 14, 12, 1.2);
  ramp(x + 9, z - 3, 4, 3, 1.2, bankHeight, 1);
  ramp(x - 9, z + 3, 4, 3, 1.2, bankHeight, -1);
  const l2 = fit(lineOf("blue", 1), z + 4), l3 = fit(lineOf("blue", 2), z - 3);
  route([l2, { x: x + 7, z: l2.z }], "blue", 0, true);
  ramp(x + 8.5, l2.z, 3, 2, 0, 1.2, -1);
  route([{ x: x - 7, z: l3.z }, l3], "blue", 0, true);
  ramp(x - 8.5, l3.z, 3, 2, 0, 1.2, 1);
}
// B: Railway cutting. The line from the British railhead runs east in a
// shallow cutting; a derailed wagon and the stores stand at its east end.
{
  const { z } = flag("B");
  dig(-111, z, 58, 6, 1.3);
  ramp(-80, z, 4, 6, 1.3, bankHeight, 1);
  ramp(-142, z, 4, 6, 1.3, bankHeight, -1);
}
// C: Hill Redoubt. A square ring trench around a ruined blockhouse, open in
// the middle of each face so soldiers can walk in over the top.
{
  const { x, z } = flag("C");
  for (const end of [-1, 1]) {
    for (const half of [-1, 1]) {
      dig(x + half * 6.5, z + end * 10, 7, 2);
      dig(x + end * 10, z + half * 6.5, 2, 7);
    }
  }
}
// F: Chalk quarry. A two-step working pit behind the German front line.
{
  const { x, z } = flag("F");
  dig(x, z, 22, 18, 1.4);
  dig(x, z, 12, 10, 0.5);
  ramp(x - 13, z + 5, 4, 4, 1.4, bankHeight, -1);
  ramp(x + 13, z - 5, 4, 4, 1.4, bankHeight, 1);
  ramp(x - 7.5, z, 3, 4, 0.5, 1.4, -1);
  ramp(x + 7.5, z, 3, 4, 0.5, 1.4, 1);
  const l2 = fit(lineOf("red", 1), z - 6), l3 = fit(lineOf("red", 2), z + 6);
  route([l2, { x: x - 11, z: l2.z }], "red", 0, true);
  ramp(x - 12.5, l2.z, 3, 2, 0, 1.4, 1);
  route([{ x: x + 11, z: l3.z }, l3], "red", 0, true);
  ramp(x + 12.5, l3.z, 3, 2, 0, 1.4, -1);
}
// G: Sunken road. An old lane cut 1.2 m into the chalk, slanting south-east
// behind the German front line; the A7V crosses it on the tank lane.
const sunkenRoad: Vec[] = [];
{
  for (let k = 0; k <= 10; k++) {
    const z0 = 4 + k * 8, x = 80 + k * 2.2;
    dig(x, z0 + 4, 5, 8 + 0.01, 1.2);
    if (k) dig(x - 1.1, z0, 7.2, 2, 1.2);
    sunkenRoad.push({ x, z: z0 + 4 });
  }
  const l2 = fit(lineOf("red", 1), 24);
  route([l2, { x: 79, z: l2.z }], "red", 0, true);
  ramp(80.5, l2.z, 3, 2, 0, 1.2, 1);
  // Ramps up out of the lane onto the fields either side.
  ramp(91.1, 32, 4, 4, 1.2, bankHeight, 1);
  ramp(88.7, 56, 4, 4, 1.2, bankHeight, -1);
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
// A firing step never crosses the mouth of a communication trench or a sally ramp.
const junctions = [
  ...[...terrain.communicationRoutes!, ...terrain.branchRoutes!].flatMap((r) => r.points.slice(1).map((b, i) => {
    const a = r.points[i];
    return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, w: Math.abs(a.x - b.x) + 2, d: Math.abs(a.z - b.z) + 2 };
  })),
  ...terrain.ramps.filter((r) => r.w > 2),
];
const atJunction = (x: number, z: number, margin: number) =>
  junctions.some((j) => Math.abs(j.x - x) < j.w / 2 + margin && Math.abs(j.z - z) < j.d / 2 + margin);
// Split each firing step around any junction it would cross; keep pieces of 3 m or more.
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

export const springOffensiveMap: MapDefinition = {
  id: "spring-offensive", name: "Spring Offensive", width, depth, navSpacing: 4, scoring: "domination",
  playArea: { width: playWidth, depth: playDepth }, boundary: { warningTicks: 5 * 30, wireDepth: 3 }, backdrop: true,
  // 64 a side is the target once frame time allows it; today's matches start at 50.
  defaultTeamSize: 50, maxTeamSize: 64,
  navigationPoints: [],
  spawn: { blue: { x: -132, z: 0 }, red: { x: 132, z: 0 } },
  boxes, vegetation, terrain, sectors,
  streets: [
    { points: [{ x: -60, z: -3 }, { x: -20, z: -2 }, { x: 20, z: 2 }, { x: 60, z: 3 }], width: 5 },
    { points: [{ x: 0, z: -30 }, { x: 0, z: 0 }, { x: 2, z: 30 }, { x: 4, z: 52 }, { x: 2, z: 86 }], width: 4 },
  ],
  landmarks: [
    { id: "A", name: "Battle-zone keep", kind: "bunker", x: -88, z: -44, radius: 8 },
    { id: "B", name: "Railway cutting", kind: "farmhouse", x: -88, z: 48, radius: 8 },
    { id: "C", name: "Hill Redoubt", kind: "bunker", x: 0, z: -54, radius: 11 },
    { id: "D", name: "Ruined village", kind: "farmhouse", x: 0, z: 0, radius: 16 },
    { id: "E", name: "Windmill crossroads", kind: "relay", x: 4, z: 52, radius: 9 },
    { id: "F", name: "Chalk quarry", kind: "gunpit", x: 88, z: -44, radius: 11 },
    { id: "G", name: "Sunken road", kind: "woodland", x: 90, z: 44, radius: 8 },
  ],
  // Forward deployment: while a side holds one of its home flags, its soldiers
  // may deploy here, 14 m behind the flag and outside its capture ring.
  deployments: [
    { sector: "A", x: -100, z: -34 },
    { sector: "B", x: -102, z: 38 },
    { sector: "F", x: 103, z: -44 },
    { sector: "G", x: 104, z: 34 },
  ],
};
const map = springOffensiveMap;
terrain.banks = buildTrenchBanks(map);
terrain.elevation = buildTrenchElevation(map);

// ---------------------------------------------------------------------------
// Structures and cover. `add` places a box on the finished ground.
const add = (id: string, x: number, z: number, w: number, d: number, h: number, kind: Box["kind"] = "masonry", extra: Partial<Box> = {}) => {
  const b: Box = { id: `so-${id}`, x, z, w, d, h, kind, ...extra };
  boxes.push(b);
  return b;
};
// A shelled house: broken walls, two wide doorways, a chimney stack and one
// roof fragment resting on what is left.
function ruinedHouse(id: string, cx: number, cz: number, flip: 1 | -1, landmark: string) {
  const parts: Box[] = [];
  const wall = (n: string, x: number, z: number, w: number, d: number, h: number, kind: Box["kind"] = "masonry") =>
    parts.push(add(`${id}-${n}`, cx + x * flip, cz + z, w, d, h, kind, { landmark }));
  for (const z of [-3.5, 3.5])
    for (const x of [-3, -1, 1, 3]) {
      if ((z < 0 && x === 1) || (z > 0 && x === -1)) continue;
      wall(`wall-${x}-${z}`, x, z, 1.8, 0.48, x === -3 ? 2.4 : x === 3 ? 0.9 : 1.5);
    }
  for (const x of [-4, 4])
    for (const z of [-2.4, 0, 2.4]) {
      if (x === 4 && z === 0) continue;
      wall(`end-${x}-${z}`, x, z, 0.48, 1.8, z === 0 ? 2.6 : 1.2);
    }
  wall("chimney", -2.7, 2.3, 1.1, 1.1, 4.6);
  wall("timber", -3.4, 1, 0.22, 0.25, 2.9, "wood");
  const support = parts.filter((b) => b.id === `so-${id}-end--4-0` || b.id === `so-${id}-timber`);
  add(`${id}-roof`, cx - 3 * flip, cz, 2.5, 3.6, 0.18, "wood", { landmark, baseY: 2.4, supports: support.map((b) => b.id!) });
  for (const [k, [dx, dz]] of [[5.8, 1], [-1, 5.4]].entries()) add(`${id}-rubble-${k}`, cx + dx * flip, cz + dz, 1.8, 1.2, 0.55, "rubble", { landmark });
}

// A: concrete machine-gun post in the keep's west corner, sandbags on its east lip.
{
  const { x, z } = flag("A");
  for (const [i, [dx, dz, w, d, h]] of [[-6, -5, 1.2, 1.2, 2.2], [-6, -1.6, 1.2, 1, 2.2], [-3.4, -5, 1, 1.2, 2.2], [-4.6, -2.2, 0.6, 0.6, 1.0]].entries())
    add(`keep-post-${i}`, x + dx, z + dz, w, d, h, "concrete", { landmark: "A" });
  add("keep-post-roof", x - 5, z - 3.6, 3.4, 3.4, 0.4, "concrete", { landmark: "A", baseY: 2.15, supports: ["so-keep-post-0", "so-keep-post-1", "so-keep-post-2"] });
  add("keep-bags-0", x + 7.6, z + 1, 0.8, 2.6, 0.75, "sandbag", { landmark: "A" });
  for (const [i, dx] of [-1, 3.5].entries()) add(`keep-bags-${i + 1}`, x + dx, z + 6.7, 2.6, 0.8, 0.75, "sandbag", { landmark: "A" });
  add("keep-ammo", x + 3, z + 4.2, 0.9, 0.7, 0.55, "wood", { landmark: "A", farmProp: "crate" });
  add("keep-crates", x - 1.5, z + 4.6, 1.4, 0.8, 0.6, "wood", { landmark: "A", farmProp: "barrels" });
}
// B: railhead stores and a derailed wagon in the cutting.
{
  const { x, z } = flag("B");
  add("rail-wagon", x - 8, z - 1.2, 5.2, 2.2, 1.9, "wood", { landmark: "B", farmProp: "cart" });
  add("rail-wagon-2", x - 20, z + 1.6, 5.2, 2.2, 1.9, "wood", { landmark: "B", farmProp: "cart" });
  add("rail-sleepers", x + 6, z + 2, 2.4, 1.2, 0.7, "wood", { landmark: "B", farmProp: "timber" });
  add("rail-crates", x + 5, z - 2.2, 1.2, 0.9, 0.8, "wood", { landmark: "B", farmProp: "crate" });
  add("rail-barrels", x - 3, z + 2.3, 1.2, 0.9, 0.9, "wood", { landmark: "B", farmProp: "barrels" });
  add("rail-bags", x + 2, z - 2.4, 2.6, 0.7, 0.7, "sandbag", { landmark: "B" });
  // A signal box on the bank above the cutting.
  ruinedHouse("signal-box", x + 2, z - 9, 1, "B");
}
// C: Hill Redoubt's ruined blockhouse and a wire apron round the ring.
{
  const { x, z } = flag("C");
  for (const [i, [dx, dz, w, d, h]] of [[-4.5, -4.2, 1.3, 1.2, 2.6], [-4.5, -0.8, 1.3, 1.4, 1.1], [-1.6, -4.5, 2.6, 0.9, 2.3], [1.6, -4.5, 1.6, 0.9, 1.2], [3.6, -3.2, 1, 1.6, 1.8]].entries())
    add(`redoubt-concrete-${i}`, x + dx, z + dz, w, d, h, "concrete", { landmark: "C" });
  add("redoubt-roof", x - 2.6, z - 3.4, 3.6, 2.6, 0.4, "concrete", { landmark: "C", baseY: 2.25, supports: ["so-redoubt-concrete-0", "so-redoubt-concrete-2"] });
  for (const [i, [dx, dz, w, d]] of [[4, 3, 2.2, 0.7], [-3, 4, 2.2, 0.7], [5, 0, 0.7, 2]].entries())
    add(`redoubt-bags-${i}`, x + dx, z + dz, w, d, 0.8, "sandbag", { landmark: "C" });
  for (const [i, [dx, dz, w, d]] of [[-8, -15, 6, 0.7], [8, -15, 6, 0.7], [-8, 15, 6, 0.7], [8, 15, 6, 0.7], [-15, -8, 0.7, 6], [15, 8, 0.7, 6]].entries())
    add(`redoubt-wire-${i}`, x + dx, z + dz, w, d, 0.65, "wire", { landmark: "C" });
}
// D: the ruined village round its church square.
const villageHouses: [number, number, 1 | -1][] = [[-16, -12, 1], [-16, 10, -1], [16, -11, -1], [16, 12, 1], [-6, -20, 1], [7, 21, -1], [-25, 1, 1], [25, -2, -1]];
villageHouses.forEach(([x, z, flip], i) => ruinedHouse(`house-${i}`, x, z, flip, "D"));
{
  // The church: a roofless nave north of the square and the stump of its tower.
  const cx = 0, cz = -11;
  for (const [i, [dx, dz, w, d, h]] of [
    [-4, -4, 0.6, 5, 3.4], [-4, 3, 0.6, 3, 2.2], [4, -3, 0.6, 6, 2.8], [4, 4, 0.6, 2, 1.4],
    [-2.6, -7, 3, 0.6, 3.8], [2.6, -7, 3, 0.6, 2.6],
  ].entries()) add(`church-wall-${i}`, cx + dx, cz + dz, w, d, h, "masonry", { landmark: "D" });
  for (const [i, [dx, dz, w, d, h]] of [[-1.4, -9.2, 1.2, 1.2, 6.5], [1.4, -9.2, 1.2, 1.2, 4.2], [-1.4, -11.6, 1.2, 1.2, 5.4]].entries())
    add(`church-tower-${i}`, cx + dx, cz + dz, w, d, h, "masonry", { landmark: "D" });
  for (const [i, [dx, dz]] of [[-1.5, 0], [2, -3], [1, 2.5]].entries()) add(`church-rubble-${i}`, cx + dx, cz + dz, 1.8, 1.4, 0.6, "rubble", { landmark: "D" });
  // Square cover: a dry well, a cart and a sandbag post.
  add("square-well", 5, 4, 1.4, 1.4, 0.9, "masonry", { landmark: "D" });
  add("square-cart", -6, 5, 2.6, 1.4, 1.2, "wood", { landmark: "D", farmProp: "cart" });
  add("square-bags", -2, 7.5, 3, 0.7, 0.75, "sandbag", { landmark: "D" });
  add("square-trough", 7, -4, 1.8, 0.6, 0.6, "wood", { landmark: "D", farmProp: "trough" });
}
// E: the windmill's broken tower, its fallen sails and a crossroads shrine.
{
  const { x, z } = flag("E");
  const mx = x - 9, mz = z - 4;
  for (const [i, [dx, dz, w, d, h]] of [
    [-2.2, -1, 0.7, 2.4, 4.4], [2.2, 0.8, 0.7, 2.4, 2.2], [0.6, -2.2, 2.4, 0.7, 3.4], [-1.5, 2.2, 1.4, 0.7, 1.6],
    [-1.8, -2, 0.8, 0.8, 4.8], [1.8, -1.8, 0.8, 0.8, 2.6],
  ].entries()) add(`mill-${i}`, mx + dx, mz + dz, w, d, h, "masonry", { landmark: "E" });
  add("mill-sail-0", mx + 4.5, mz + 4, 0.45, 7, 0.4, "wood", { landmark: "E" });
  add("mill-sail-1", mx - 3, mz + 6, 6, 0.45, 0.4, "wood", { landmark: "E" });
  add("mill-shaft", mx + 1, mz + 3.4, 2.8, 0.7, 0.7, "log", { landmark: "E" });
  add("crossroads-shrine", x + 4.5, z - 5, 1, 1, 2, "masonry", { landmark: "E" });
  for (const [i, [dx, dz, w, d]] of [[5, 4, 2.6, 0.7], [-3, 6, 0.7, 2.4]].entries())
    add(`crossroads-bags-${i}`, x + dx, z + dz, w, d, 0.7, "sandbag", { landmark: "E" });
}
// F: chalk boulders, quarry stores and a winch frame.
{
  const { x, z } = flag("F");
  for (const [i, [dx, dz, w, d, h]] of [[-8.5, -6.5, 2, 1.6, 1.2], [8.6, 6, 1.6, 2, 1], [-3, 6.6, 2.2, 1.4, 0.9], [4, -6.8, 1.8, 1.4, 1.1], [9, -6.5, 1.4, 1.4, 0.8]].entries())
    add(`quarry-chalk-${i}`, x + dx, z + dz, w, d, h, "rubble", { landmark: "F" });
  add("quarry-cart", x + 2.5, z + 3, 2.6, 1.4, 1.2, "wood", { landmark: "F", farmProp: "cart" });
  add("quarry-timber", x - 3, z - 3.2, 2.4, 1, 0.7, "wood", { landmark: "F", farmProp: "timber" });
  add("quarry-crates", x - 4, z + 3, 1, 0.8, 0.7, "wood", { landmark: "F", farmProp: "crate" });
  add("quarry-bench", x + 9.5, z + 1, 2, 0.8, 0.9, "wood", { landmark: "F", farmProp: "worktable" });
  for (const [i, [dx, dz]] of [[-5, -9.7], [3, 9.7]].entries()) add(`quarry-bags-${i}`, x + dx, z + dz, 3, 0.8, 0.75, "sandbag", { landmark: "F" });
}
// G: the lane's cart, a wayside shrine and German stores in the cut.
{
  const { x, z } = flag("G");
  add("lane-cart", x - 1, z - 6, 1.4, 2.6, 1.2, "wood", { landmark: "G", farmProp: "cart" });
  add("lane-crates", x + 1.4, z + 4, 0.9, 1.2, 0.7, "wood", { landmark: "G", farmProp: "crate" });
  add("lane-barrels", x - 1.4, z + 7, 0.9, 1.2, 0.9, "wood", { landmark: "G", farmProp: "barrels" });
  add("lane-shrine", x + 5, z - 2, 1, 1, 2.1, "masonry", { landmark: "G" });
  add("lane-bags", x - 3.3, z + 1, 0.7, 2.6, 0.75, "sandbag", { landmark: "G" });
}
// Rear-line bunkers and screens, as on Trench front.
for (const team of ["blue", "red"] as const) {
  const s = sideOf(team);
  for (const z of [-66, 62 + 12, 14]) add(`${team}-bunker-${z}`, s * 122, z, 8, 3, 1.8, "bunker");
  add(`${team}-screen-0`, s * 118, -14, 0.25, 2.5, 1.2, "wood");
  add(`${team}-screen-1`, s * 120, 26, 2.5, 0.25, 1.2, "wood");
}
// Scraps of cover across no-man's land: shallow scrapes and broken pickets.
for (let i = 0; i < 22; i++) {
  const x = -26 + (i % 6) * 10 + (i % 2) * 3, z = -80 + Math.floor(i / 6) * 44 + ((i * 7) % 11);
  if (sectors.some((f) => Math.hypot(f.x - x, f.z - z) < 13)) continue;
  if (villageHouses.some(([hx, hz]) => Math.abs(hx - x) < 8 && Math.abs(hz - z) < 8)) continue;
  add(`nml-${i}`, x, z, i % 3 ? 2.4 : 3.2, 0.8, i % 3 ? 0.7 : 0.6, i % 4 === 0 ? "log" : "sandbag");
}
// Sandbag blocks close every line at the boundary.
for (const block of blocks) add(`trench-block-${block.x}-${block.z}`, block.x, block.z, block.w + 0.6, 1.1, 1.3, "sandbag", { baseY: 0 });

// Shell scars: the bombardment fell heaviest on the British outpost line and in no-man's land.
let seed = 21;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const clearOfWork = (x: number, z: number, r: number) =>
  !sectors.some((f) => Math.hypot(f.x - x, f.z - z) < 10 + r) &&
  !boxes.some((b) => Math.abs(b.x - x) < b.w / 2 + r + 1 && Math.abs(b.z - z) < b.d / 2 + r + 1) &&
  !terrain.rectangles.some((q) => Math.abs(q.x - x) < q.w / 2 + r + 1.5 && Math.abs(q.z - z) < q.d / 2 + r + 1.5) &&
  !terrain.ramps.some((q) => Math.abs(q.x - x) < q.w / 2 + r + 1.5 && Math.abs(q.z - z) < q.d / 2 + r + 1.5);
for (let tries = 0, placed = 0; placed < 64 && tries < 900; tries++) {
  const x = (rand() * 2 - 1) * (tries % 3 ? 33 : 62), z = (rand() * 2 - 1) * (halfPlayZ - 6);
  const r = 2 + rand() * 1.8;
  if (Math.abs(z - (tankLane.z0 + tankLane.z1) / 2) < 6 && rand() < 0.6) continue;
  if (!clearOfWork(x, z, r)) continue;
  terrain.shellScars!.push({ x, z, radiusX: r * (0.85 + rand() * 0.3), radiusZ: r * (0.85 + rand() * 0.3), depth: 0.45 + rand() * 0.35, rotation: rand() * 3, irregularity: 0.13, phase: rand() * 6 });
  if (placed % 4 === 0) terrain.craters.push({ x, z, radius: r, depth: 0.6 });
  placed++;
}
terrain.depressions!.push(
  { x: -10, z: -34, radiusX: 14, radiusZ: 12, depth: 0.16 },
  { x: 12, z: 30, radiusX: 12, radiusZ: 14, depth: 0.14 },
  { x: -14, z: 70, radiusX: 16, radiusZ: 10, depth: 0.12 },
  { x: 20, z: -74, radiusX: 12, radiusZ: 10, depth: 0.15 },
);
terrain.relief = buildTrenchRelief(map, [...terrain.shellScars!, ...terrain.depressions!]);
for (const b of boxes) b.baseY = groundHeight(b.x, b.z, map) - 0.03 + (b.baseY ?? 0);
// Roof pieces carry their height above the ground in baseY; walls stand on it.

// Revetment along every dug wall, as on Verdun.
for (const line of lines) {
  const half = line.floor!.half, s = sideOf(line.team);
  for (const section of line.sections) for (const edge of [-1, 1]) {
    const x = section.x - s * line.floor!.offset + edge * (half + 0.15);
    for (let z = section.z - section.length / 2 + 1; z < section.z + section.length / 2; z += 2)
      if (groundHeight(x + edge * 0.25, z, map) > 0.3 && groundHeight(x - edge * 0.35, z, map) < 0.1) terrain.lining.push({ x, z, w: 0.12, d: 1.8 });
  }
}

// ---------------------------------------------------------------------------
// Vegetation: two shattered copses on the flanks, bare trees about the village
// and hedge brush along the sunken road's banks.
const plantClear = (x: number, z: number, r: number) => {
  for (const s of Object.values(map.spawn)) if (Math.hypot(x - s.x, z - s.z) < 16) return false;
  if (sectors.some((f) => Math.hypot(f.x - x, f.z - z) < 6)) return false;
  if (boxes.some((b) => Math.abs(x - b.x) < b.w / 2 + r + 0.3 && Math.abs(z - b.z) < b.d / 2 + r + 0.3)) return false;
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++)
    if (Math.abs(groundHeight(x + dx, z + dz, map) - groundHeight(x, z, map)) > 0.4 || groundHeight(x + dx, z + dz, map) < bankHeight - 0.6) return false;
  return true;
};
const styles: Box["treeStyle"][] = ["bare", "snapped", "sparse", "bare"];
let trees = 0;
const plant = (x: number, z: number, h: number) => {
  if (!plantClear(x, z, 0.4)) return;
  vegetation.push({ id: `tree-so-${trees}`, x, z, w: 0.65, d: 0.65, h, kind: "tree", treeStyle: styles[trees % 4], baseY: groundHeight(x, z, map) - 0.025 });
  trees++;
};
for (const [cx, cz, n] of [[-52, -74, 16], [118, -72, 14], [-124, 74, 10], [60, 80, 10], [-40, 80, 8]] as const)
  for (let i = 0; i < n; i++) {
    const a = i * 2.4, r = 2 + (i % 5) * 1.9;
    plant(cx + Math.cos(a) * r, cz + Math.sin(a) * r * 0.8, 3.4 + (i % 4) * 1.4);
  }
for (const [x, z] of [[-22, -18], [21, -19], [-23, 18], [22, 18], [-10, 24], [12, -26], [-30, -10], [30, 10]]) plant(x, z, 4 + (Math.abs(x + z) % 3));
let brush = 0;
for (const p of sunkenRoad) for (const edge of [-1, 1]) {
  const x = p.x + edge * 4.2, z = p.z + (edge > 0 ? 2 : -2);
  if (Math.abs(z - (tankLane.z0 + tankLane.z1) / 2) < 7 || !plantClear(x, z, 0.6)) continue;
  vegetation.push({ id: `brush-so-${brush++}`, x, z, w: 1.4, d: 2.2, h: 0.55, kind: "brush", baseY: groundHeight(x, z, map) - 0.025 });
}

// ---------------------------------------------------------------------------
// Wire belts about 9 m in front of the first and second lines, 4 m segments
// only the enemy is slowed by. A segment is left out near any dug route, ramp
// or cover, near a flag, and across the tank lane, so every exit stays open.
const wireBelts: WireSegment[] = [];
const near = (b: { x: number; z: number; w: number; d: number }, x: number, z: number, w: number, d: number, margin: number) =>
  Math.abs(b.x - x) < (b.w + w) / 2 + margin && Math.abs(b.z - z) < (b.d + d) / 2 + margin;
for (const line of lines.filter((_, i) => i % 3 !== 2)) {
  const s = sideOf(line.team), front = line.role === "front";
  for (const section of line.sections) {
    const x = section.x - s * (front ? 9.5 : 8);
    for (let z = section.z - section.length / 2 + 2; z <= section.z + section.length / 2 - 2; z += 4) {
      if (Math.abs(z) > halfPlayZ - 3) continue;
      if (z > tankLane.z0 - 4 && z < tankLane.z1 + 4) continue;
      if (terrain.rectangles.some((r) => near(r, x, z, 3, 4, 2))) continue;
      if (terrain.ramps.some((r) => near(r, x, z, 3, 4, 2))) continue;
      if ([...boxes, ...vegetation].some((b) => b.kind !== "brush" && near(b, x, z, 3, 4, 0.6))) continue;
      if (sectors.some((f) => Math.hypot(f.x - x, f.z - z) < 10)) continue;
      if (groundHeight(x, z, map) < bankHeight - 1.2) continue;
      wireBelts.push({ id: `belt-${line.team}-${line.role}-${Math.round(section.x)}-${z}`, team: line.team, x, z, w: 3, d: 4 });
    }
  }
}
map.wireBelts = wireBelts;
map.noMansLand = { width: 84, scarPonds: true };

// Fine waypoints through the flag works and the village to the coarse field graph.
for (const f of sectors) for (let x = -10; x <= 10; x += 2) for (let z = -10; z <= 10; z += 2) map.navigationPoints!.push({ x: f.x + x, z: f.z + z });
for (const r of [...terrain.communicationRoutes!, ...terrain.branchRoutes!]) for (const point of r.points) map.navigationPoints!.push({ ...point });
for (const r of terrain.ramps.filter((q) => q.w > 2)) for (const x of [r.x - r.w / 2, r.x, r.x + r.w / 2]) map.navigationPoints!.push({ x, z: r.z });
for (const d of map.deployments!) map.navigationPoints!.push({ x: d.x, z: d.z });


// Capture the flag: each side's three pickups stand on its first line's floor
// at the north, centre and south posts; the drop point is the battle-zone
// trench behind them, as on Trench front.
const floorNear = (line: TrenchLine, z: number) => {
  for (let dz = 0; dz < 20; dz++) for (const sign of [1, -1]) {
    const x = floorAt(line, z + sign * dz);
    // Stand on the rear half of the floor, clear of the firing step's ramp.
    if (x !== undefined) return { x: x + sideOf(line.team) * 0.8, z: z + sign * dz };
  }
  throw Error(`Spring Offensive: no floor near ${z}`);
};
export const springOffensiveCtf = {
  pickups: (["blue", "red"] as const).flatMap((team, t) =>
    ([["North post", -48], ["Centre post", 2], ["South post", 44]] as const).map(([name, z], i) => ({
      id: "ABCDEF"[t * 3 + i], team, name, ...floorNear(lineOf(team, 0), z),
    }))),
  drops: {
    blue: { name: "Battle-zone trench", ...floorNear(lineOf("blue", 1), -2) },
    red: { name: "Battle-zone trench", ...floorNear(lineOf("red", 1), -2) },
  },
};
