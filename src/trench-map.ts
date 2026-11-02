import {
  groundHeight,
  type MapDefinition,
  type Ramp,
  type TerrainRect,
  type Vec,
  type Box,
} from "./map";

const bankHeight = 2.4;
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
for (const side of [-1, 1] as const) {
  // Broad rear assembly area, support trench, and three communication routes.
  floors.push(
    { x: side * 65, z: -1, w: 14, d: 14 },
    { x: side * 49, z: -1, w: 8, d: 112 },
    { x: side * 57, z: -1, w: 18, d: 6 },
  );
  for (let i = 0; i < 7; i++) {
    const x = side * (i % 2 ? 21 : 29),
      z = -49 + i * 16;
    floors.push({ x, z, w: 6, d: 16 });
    if (i < 6) floors.push({ x: side * 25, z: z + 8, w: 14, d: 6 });
    for (const edge of [-1, 1])
      liningCandidates.push({ x: x + edge * 3.06, z, w: 0.12, d: 9 });
    // Raised firing steps have their own short approach ramps.
    if (i % 2 === 0) {
      platforms.push({ x: x - side * 2, z, w: 2, d: 6, h: 1.05 });
      ramps.push({
        x,
        z,
        w: 2,
        d: 6,
        low: 0,
        high: 1.05,
        direction: side === -1 ? 1 : -1,
      });
    }
  }
  for (const z of [-33, -1, 31]) {
    floors.push({ x: side * 35, z, w: 30, d: 6 });
    ramps.push({
      x: side * 14,
      z,
      w: 8,
      d: 6,
      low: 0,
      high: bankHeight,
      direction: side === -1 ? 1 : -1,
    });
  }
  for (const z of [-32, 0, 32]) {
    cover.push({
      x: side * 8,
      z: z + 6,
      w: 6,
      d: 1.2,
      h: 1.05,
      baseY: bankHeight,
      kind: "sandbag",
    });
    cover.push({
      x: side * 12,
      z: z - 7,
      w: 1.2,
      d: 4,
      h: 0.9,
      baseY: bankHeight,
      kind: "sandbag",
    });
  }
  for (const z of [-13, 11])
    cover.push({
      x: side * 65,
      z,
      w: 10,
      d: 3,
      h: 2,
      baseY: bankHeight,
      kind: "bunker",
    });
}
for (const z of [-16, 16])
  cover.push({
    x: 0,
    z,
    w: 14,
    d: 0.7,
    h: 0.75,
    baseY: bankHeight,
    kind: "wire",
  });
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
  spawn: { blue: { x: -65, z: -1 }, red: { x: 65, z: -1 } },
  sectors: [
    { id: "A", x: 0, z: -32 },
    { id: "B", x: 0, z: 0 },
    { id: "C", x: 0, z: 32 },
  ],
  boxes: cover,
  terrain: {
    bankHeight,
    cellSize,
    columns,
    rows,
    heights,
    rectangles,
    ramps,
    lining: [],
    craters: [
      { x: -4, z: -48, radius: 3.6 },
      { x: 9, z: -25, radius: 3 },
      { x: -10, z: -9, radius: 3.2 },
      { x: 8, z: 10, radius: 3.5 },
      { x: -7, z: 24, radius: 3 },
      { x: 3, z: 48, radius: 4 },
    ],
  },
};

// Timber belongs against solid earth, never across a communication trench or ramp.
// Clip each decorative panel to the actual terrain boundary so its visible shape
// agrees with the earth collision, including the six mirrored trench junctions.
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
