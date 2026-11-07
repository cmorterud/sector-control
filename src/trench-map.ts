import { vegetationFor } from "./vegetation";
import {
  groundHeight,
  type MapDefinition,
  type Ramp,
  type TerrainRect,
  type Vec,
  type Box,
  type TrenchLine,
  type CommunicationRoute,
} from "./map";
import { buildTrenchRelief, buildTrenchElevation } from "./terrain-relief";

const bankHeight = 2.4;
const spawnDistance = 60,
  rearCoverDistance = 55;
const width = 160,
  depth = 128,
  cellSize = 2;
const columns = width / cellSize,
  rows = depth / cellSize;
const floors: (Vec & { w: number; d: number })[] = [];
const platforms: TerrainRect[] = [];
const ramps: Ramp[] = [];
const liningCandidates: (Vec & { w: number; d: number })[] = [];
const cover: Box[] = [];
const firingPositions: (Vec & { team: "blue" | "red" })[] = [];
// Fixed, independently authored lines: long Blue stretches and tighter Red bends.
// Coordinates also describe the firing steps and communication paths to the AI.
const trenchLines: TrenchLine[] = [
  {
    team: "blue",
    role: "front",
    sections: [
      { x: -29, z: -49, length: 16 },
      { x: -21, z: -29, length: 24, stepZ: -33 },
      { x: -27, z: -13, length: 8 },
      { x: -21, z: -1, length: 16 },
      { x: -25, z: 17, length: 20 },
      { x: -21, z: 35, length: 16 },
      { x: -29, z: 51, length: 16 },
    ],
  },
  {
    team: "blue",
    role: "rear",
    sections: [
      { x: -45, z: -49, length: 16 },
      { x: -41, z: -31, length: 20 },
      { x: -45, z: -13, length: 16 },
      { x: -37, z: -1, length: 8 },
      { x: -41, z: 13, length: 20 },
      { x: -39, z: 31, length: 16 },
      { x: -45, z: 49, length: 20 },
    ],
  },
  {
    team: "red",
    role: "front",
    sections: [
      { x: 25, z: -51, length: 12 },
      { x: 21, z: -39, length: 12 },
      { x: 27, z: -27, length: 12 },
      { x: 23, z: -15, length: 12 },
      { x: 21, z: -1, length: 16 },
      { x: 29, z: 15, length: 16 },
      { x: 23, z: 31, length: 16 },
      { x: 27, z: 47, length: 16 },
    ],
  },
  {
    team: "red",
    role: "rear",
    sections: [
      { x: 43, z: -49, length: 16 },
      { x: 39, z: -33, length: 16 },
      { x: 45, z: -17, length: 16 },
      { x: 37, z: -1, length: 16 },
      { x: 45, z: 15, length: 16 },
      { x: 41, z: 33, length: 20 },
      { x: 43, z: 51, length: 16 },
    ],
  },
];
const communicationRoutes: CommunicationRoute[] = [];
for (const line of trenchLines) {
  const side = line.team === "blue" ? -1 : 1;
  const counts =
    line.team === "blue" ? [8, 8, 4, 8, 8, 7, 7] : [7, 7, 6, 6, 6, 6, 6, 6];
  line.sections.forEach((section, i) => {
    const { x, z, length } = section;
    floors.push({ x, z, w: 6, d: length });
    const next = line.sections[i + 1];
    if (next)
      floors.push({
        x: (x + next.x) / 2,
        z: z + length / 2,
        w: Math.abs(x - next.x) + 6,
        d: 6,
      });
    for (const edge of [-1, 1])
      liningCandidates.push({
        x: x + edge * 3.06,
        z,
        w: 0.12,
        d: Math.max(2, length - 6),
      });
    if (line.role === "front" || i % 2 === 0) {
      const stepZ = section.stepZ ?? z;
      // Longer steps fit the doubled roster; the tight Blue setback keeps four posts.
      const stepDepth = line.role === "front" && counts[i] > 4 ? 10 : 6;
      platforms.push({
        x: x - side * 2,
        z: stepZ,
        w: 2,
        d: stepDepth,
        h: 0.85,
      });
      ramps.push({
        x,
        z: stepZ,
        w: 2,
        d: stepDepth,
        low: 0,
        high: 0.85,
        direction: -side as -1 | 1,
      });
    }
  });
  if (line.role === "front")
    for (let row = 0; row < Math.max(...counts); row++)
      line.sections.forEach((section, segment) => {
        if (row >= counts[segment]) return;
        firingPositions.push({
          team: line.team,
          x: section.x - side * 2,
          z:
            (section.stepZ ?? section.z) +
            (row - (counts[segment] - 1) / 2) * 1.2,
        });
      });
}
for (const team of ["blue", "red"] as const) {
  const side = team === "blue" ? -1 : 1;
  const front = trenchLines.find((l) => l.team === team && l.role === "front")!;
  const rear = trenchLines.find((l) => l.team === team && l.role === "rear")!;
  for (const z of team === "blue" ? [-33, -1, 35] : [-39, -1, 31]) {
    const near = (line: TrenchLine) =>
      line.sections.find((s) => Math.abs(s.z - z) < s.length / 2)!.x;
    const f = near(front),
      r = near(rear),
      middle = (f + r) / 2;
    floors.push({
      x: (f + middle) / 2,
      z: z - 5,
      w: Math.abs(f - middle) + 2,
      d: 4,
    });
    floors.push({ x: middle, z, w: 6, d: 14 });
    floors.push({
      x: (r + middle) / 2,
      z: z + 5,
      w: Math.abs(r - middle) + 2,
      d: 4,
    });
    const entrance = { x: r + side * 8, z };
    ramps.push({
      ...entrance,
      w: 10,
      d: 10,
      low: 0,
      high: bankHeight,
      direction: side,
    });
    communicationRoutes.push({
      team,
      entrance,
      points: [
        { x: r, z: z + 5 },
        { x: middle, z: z + 5 },
        { x: middle, z: z - 5 },
        { x: f, z: z - 5 },
      ],
    });
  }
  for (const z of [-21, 21])
    cover.push({
      x: side * (rearCoverDistance + 3),
      z,
      w: 8,
      d: 3,
      h: 1.8,
      baseY: bankHeight,
      kind: "bunker",
    });
}
// Small shelter bays interrupt the regular corridor footprint without opening a parapet.
floors.push(
  { x: -33, z: -49, w: 4, d: 6 },
  { x: -29, z: 17, w: 4, d: 8 },
  { x: -45, z: -31, w: 4, d: 6 },
  { x: 31, z: -27, w: 4, d: 6 },
  { x: 27, z: 31, w: 4, d: 6 },
  { x: 49, z: 15, w: 4, d: 6 },
);
// Light rear-line screens sit away from entry ramps and can be blown apart.
for (const side of [-1, 1])
  cover.push({
    id: `rear-wood-${side}`,
    x: side * (rearCoverDistance - 4),
    z: side * 9,
    w: 0.25,
    d: 2.5,
    h: 1.2,
    baseY: bankHeight,
    kind: "wood",
  });
// Sparse, low remnants leave the central crossing exposed. No objective fortresses.
for (const side of [-1, 1] as const) {
  cover.push({
    x: side * 4,
    z: side * 18,
    w: 3.2,
    d: 0.8,
    h: 0.65,
    baseY: bankHeight,
    kind: "sandbag",
  });
  cover.push({
    x: side * 4,
    z: side * 48,
    w: 6,
    d: 0.7,
    h: 0.65,
    baseY: bankHeight,
    kind: "wire",
  });
}
const inside = (x: number, z: number, r: Vec & { w: number; d: number }) =>
  Math.abs(x - r.x) < r.w / 2 && Math.abs(z - r.z) < r.d / 2;
const heights = new Float32Array(columns * rows);
for (let row = 0; row < rows; row++)
  for (let col = 0; col < columns; col++) {
    const x = -width / 2 + (col + 0.5) * cellSize,
      z = -depth / 2 + (row + 0.5) * cellSize;
    let h = floors.some((f) => inside(x, z, f)) ? 0 : bankHeight;
    for (const platform of platforms)
      if (inside(x, z, platform)) h = platform.h;
    if (ramps.some((r) => inside(x, z, r))) h = 0;
    heights[row * columns + col] = h;
  }
// Merge equal-height terrain cells into a small number of static earth blocks.
const used = new Uint8Array(heights.length);
const rectangles: TerrainRect[] = [];
for (let row = 0; row < rows; row++)
  for (let col = 0; col < columns; col++) {
    const index = row * columns + col,
      h = heights[index];
    if (!h || used[index]) continue;
    let w = 1,
      d = 1;
    while (col + w < columns && !used[index + w] && heights[index + w] === h)
      w++;
    outer: while (row + d < rows) {
      for (let dx = 0; dx < w; dx++)
        if (
          used[(row + d) * columns + col + dx] ||
          heights[(row + d) * columns + col + dx] !== h
        )
          break outer;
      d++;
    }
    for (let dz = 0; dz < d; dz++)
      for (let dx = 0; dx < w; dx++) used[(row + dz) * columns + col + dx] = 1;
    rectangles.push({
      x: -width / 2 + (col + w / 2) * cellSize,
      z: -depth / 2 + (row + d / 2) * cellSize,
      w: w * cellSize,
      d: d * cellSize,
      h,
    });
  }
export const trenchMap: MapDefinition = {
  id: "trenches",
  name: "Trench front",
  width,
  depth,
  navSpacing: 4,
  scoring: "domination",
  spawn: {
    blue: { x: -spawnDistance, z: -1 },
    red: { x: spawnDistance, z: -1 },
  },
  sectors: [
    { id: "A", x: -22.5, z: -33, home: "blue" },
    { id: "B", x: -22.5, z: 35, home: "blue" },
    { id: "C", x: 28.5, z: -27, home: "red" },
    { id: "D", x: 24.5, z: 31, home: "red" },
  ],
  boxes: cover,
  terrain: {
    bankHeight,
    firingPositions,
    trenchLines,
    communicationRoutes,
    cellSize,
    columns,
    rows,
    heights,
    rectangles,
    ramps,
    lining: [],
    craters: [
      { x: -4, z: -43, radius: 3.6, depth: 0.6 },
      { x: 9, z: -25, radius: 3, depth: 0.55 },
      { x: -10, z: -9, radius: 3.2, depth: 0.65 },
      { x: 8, z: 10, radius: 3.5, depth: 0.6 },
      { x: -7, z: 24, radius: 3, depth: 0.7 },
      { x: 3, z: 42, radius: 4, depth: 0.65 },
    ],
    depressions: [
      { x: -3, z: -39, radiusX: 10, radiusZ: 14, depth: 0.16 },
      { x: 4, z: -17, radiusX: 9, radiusZ: 12, depth: 0.14 },
      { x: -2, z: 3, radiusX: 12, radiusZ: 15, depth: 0.18 },
      { x: 3, z: 29, radiusX: 10, radiusZ: 14, depth: 0.15 },
      { x: -1, z: 51, radiusX: 10, radiusZ: 10, depth: 0.12 },
    ],
  },
};

trenchMap.terrain!.relief = buildTrenchRelief(trenchMap, [
  ...trenchMap.terrain!.craters.map((crater) => ({
    ...crater,
    radiusX: crater.radius,
    radiusZ: crater.radius,
    depth: crater.depth!,
  })),
  ...trenchMap.terrain!.depressions!,
]);
trenchMap.terrain!.elevation = buildTrenchElevation(trenchMap);

// Timber belongs against solid earth, never across a communication trench or ramp.
// Clip each decorative panel to the actual terrain boundary so its visible shape
// agrees with the earth collision, including the independently authored communication junctions.
for (const wall of liningCandidates) {
  const end = wall.z + wall.d / 2;
  let start: number | null = null;
  const addPanel = (to: number) => {
    if (start === null) return;
    trenchMap.terrain!.lining.push({
      ...wall,
      z: (start + to) / 2,
      d: to - start,
    });
    start = null;
  };
  for (let z = wall.z - wall.d / 2; z < end; z += 0.5) {
    const middle = (z + Math.min(z + 0.5, end)) / 2;
    const left = groundHeight(wall.x - 0.2, middle, trenchMap);
    const right = groundHeight(wall.x + 0.2, middle, trenchMap);
    const againstEarth =
      Math.max(left, right) >= bankHeight - 0.05 &&
      Math.abs(left - right) > 0.3;
    if (againstEarth) start ??= z;
    else addPanel(z);
  }
  addPanel(end);
}

trenchMap.vegetation = vegetationFor(trenchMap);
