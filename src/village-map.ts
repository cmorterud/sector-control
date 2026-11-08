import {
  groundHeight,
  type Box,
  type MapDefinition,
  type TerrainRect,
  type TrenchLine,
  type CommunicationRoute,
} from "./map";
import { buildTrenchBanks } from "./trench-banks";
import { buildTrenchElevation, buildTrenchRelief } from "./terrain-relief";

const width = 144,
  depth = 112,
  bankHeight = 2.4;
const heights = new Float32Array(width * depth).fill(bankHeight);
const rectangles: TerrainRect[] = [],
  trenchLines: TrenchLine[] = [],
  communicationRoutes: CommunicationRoute[] = [];
const boxes: Box[] = [],
  vegetation: Box[] = [];
const dig = (x: number, z: number, w: number, d: number) => {
  rectangles.push({ x, z, w, d, h: 0 });
  for (let row = 0; row < depth; row++)
    for (let col = 0; col < width; col++)
      if (
        Math.abs(col + 0.5 - width / 2 - x) < w / 2 &&
        Math.abs(row + 0.5 - depth / 2 - z) < d / 2
      )
        heights[row * width + col] = 0;
};
const ramps: NonNullable<MapDefinition["terrain"]>["ramps"] = [];
for (const team of ["blue", "red"] as const) {
  const side = team === "blue" ? -1 : 1;
  for (const role of ["rear", "front"] as const) {
    const xs =
      role === "rear"
        ? [50, 48, 50]
        : team === "blue"
          ? [41, 43, 39]
          : [43, 40, 42];
    const sections = [
      { x: side * xs[0], z: -28, length: 20 },
      { x: side * xs[1], z: -4, length: 28 },
      { x: side * xs[2], z: 22, length: 24 },
    ];
    trenchLines.push({ team, role, sections });
    sections.forEach((s, i) => {
      dig(s.x, s.z, 2, s.length);
      if (i) {
        const last = sections[i - 1],
          z = s.z - s.length / 2;
        dig((last.x + s.x) / 2, z, Math.abs(last.x - s.x) + 2, 2);
      }
    });
  }
  const front = trenchLines.find((l) => l.team === team && l.role === "front")!;
  const rear = trenchLines.find((l) => l.team === team && l.role === "rear")!;
  for (let i = 0; i < 3; i++) {
    const z = [-28, -4, 24][i],
      a = rear.sections[i].x,
      b = front.sections[i].x;
    const points = [
      { x: a, z },
      { x: (a + b) / 2, z },
      { x: (a + b) / 2, z: z + 3 },
      { x: b, z: z + 3 },
    ];
    for (let n = 1; n < points.length; n++)
      dig(
        (points[n - 1].x + points[n].x) / 2,
        (points[n - 1].z + points[n].z) / 2,
        Math.abs(points[n].x - points[n - 1].x) + 2,
        Math.abs(points[n].z - points[n - 1].z) + 2,
      );
    communicationRoutes.push({ team, entrance: { x: a, z }, points });
    ramps.push({
      x: a + side * 4.5,
      z,
      w: 9,
      d: 3,
      low: 0,
      high: bankHeight,
      direction: side,
    });
    ramps.push({
      x: b - side * 4.5,
      z: z + 3,
      w: 9,
      d: 3,
      low: 0,
      high: bankHeight,
      direction: -side as 1 | -1,
    });
  }
}

export const villageMap: MapDefinition = {
  id: "village",
  name: "Village front",
  width,
  depth,
  navSpacing: 4,
  navigationPoints: [],
  scoring: "domination",
  spawn: { blue: { x: -62, z: -4 }, red: { x: 62, z: -4 } },
  sectors: [
    { id: "A", name: "Orchard", x: -23, z: -31, home: "blue" },
    { id: "B", name: "Schoolhouse", x: -20, z: 18, home: "blue" },
    { id: "C", name: "Market Court", x: 21, z: -13, home: "red" },
    { id: "D", name: "East Gate", x: 24, z: 28, home: "red" },
  ],
  boxes,
  vegetation,
  landmarks: [
    { id: "A", name: "Orchard", kind: "woodland", x: -23, z: -31, radius: 9 },
    {
      id: "B",
      name: "Schoolhouse",
      kind: "farmhouse",
      x: -20,
      z: 18,
      radius: 7,
    },
    {
      id: "C",
      name: "Market Court",
      kind: "farmhouse",
      x: 21,
      z: -13,
      radius: 7,
    },
    { id: "D", name: "East Gate", kind: "bunker", x: 24, z: 28, radius: 7 },
  ],
  terrain: {
    bankHeight,
    cellSize: 1,
    columns: width,
    rows: depth,
    heights,
    rectangles,
    ramps,
    lining: [],
    trenchLines,
    communicationRoutes,
    craters: [],
    shellScars: [
      {
        x: 0,
        z: 8,
        radiusX: 2.8,
        radiusZ: 2,
        depth: 0.5,
        rotation: 0.6,
        irregularity: 0.12,
        phase: 1,
      },
      {
        x: 5,
        z: -27,
        radiusX: 2.2,
        radiusZ: 3,
        depth: 0.4,
        rotation: 1.3,
        irregularity: 0.1,
        phase: 2,
      },
      {
        x: -18,
        z: -43,
        radiusX: 3.2,
        radiusZ: 2.6,
        depth: 0.5,
        rotation: 0.8,
        irregularity: 0.14,
        phase: 3,
      },
      {
        x: 29,
        z: 43,
        radiusX: 2.2,
        radiusZ: 3.4,
        depth: 0.5,
        rotation: 2,
        irregularity: 0.12,
        phase: 4,
      },
    ],
  },
};
const add = (
  id: string,
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
  kind: Box["kind"] = "masonry",
  landmark?: string,
) => {
  const b: Box = { id: `village-${id}`, x, z, w, d, h, kind, landmark };
  boxes.push(b);
  return b;
};
function house(id: string, x: number, z: number, variant: number) {
  for (const dz of [-5.5, -2.5, 2.5, 5.5])
    villageMap.navigationPoints!.push({ x, z: z + dz });
  for (const dx of [3.5, 6.5, ...(variant % 2 ? [-3.5, -6.5] : [])])
    villageMap.navigationPoints!.push({ x: x + dx, z });
  const walls: Box[] = [];
  for (const dz of [-4, 4])
    for (let n = 0; n < 5; n++) {
      const dx = (n - 2) * 2;
      if (n === 2 || (n === 0 && dz > 0 && variant % 2)) continue;
      walls.push(
        add(
          `${id}-wall-${dx}-${dz}`,
          x + dx,
          z + dz,
          1.82,
          0.5,
          [1.2, 2.5, 3.3, 2.1][(n + variant + (dz > 0 ? 1 : 0)) % 4],
          "masonry",
          id,
        ),
      );
    }
  for (const dx of [-5, 5])
    for (const dz of [-2.8, 0, 2.8]) {
      if (dz === 0 && (dx > 0 || variant % 2)) continue;
      walls.push(
        add(
          `${id}-end-${dx}-${dz}`,
          x + dx,
          z + dz,
          0.5,
          1.9,
          dz === 0 ? 3.5 : 2.3,
          "masonry",
          id,
        ),
      );
    }
  add(`${id}-chimney`, x - 3, z + 2, 1, 1, 4.6, "masonry", id);
  const supports = walls.filter((b) => b.x < x - 2 && b.h > 2);
  if (supports.length >= 2) {
    const roof = add(`${id}-roof`, x - 3.5, z, 2.4, 4.8, 0.2, "wood", id);
    roof.baseY = bankHeight + 2.1;
    roof.supports = supports.slice(0, 3).map((b) => b.id!);
  }
  for (const [n, dx, dz] of [
    [0, -3, -2],
    [1, 3, 2],
    [2, -3.8, 3],
  ])
    add(`${id}-rubble-${n}`, x + dx, z + dz, 1.2, 0.9, 0.32, "rubble", id);
}
house("school", -20, 18, 0);
house("baker", -20, -13, 1);
house("market", 21, -13, 2);
house("gatehouse", 24, 28, 3);
house("cottage", -26, 36, 2);
house("smith", 22, 10, 1);
house("north-house", 22, -35, 3);
// Garden walls leave several wide side passages and staggered approaches to the road.
for (const [i, x, z, w, d, h] of [
  [0, -10, -21, 0.55, 9, 1.05],
  [1, -10, 14, 0.55, 7, 1.2],
  [2, -8, 34, 0.55, 8, 0.9],
  [3, 10, -10, 0.55, 6, 1.1],
  [4, 9, 22, 0.55, 8, 0.95],
  [5, -29, -23, 7, 0.5, 1.1],
  [6, 31, -25, 6, 0.5, 1.25],
  [7, -28, 8, 7, 0.5, 1],
  [8, 28, 20, 7, 0.5, 1.1],
  [9, 22, 35, 7, 0.6, 1.7],
  [10, 16, 35, 2, 0.6, 2.8],
  [11, 28, 35, 2, 0.6, 2.2],
])
  add(`garden-${i}`, x, z, w, d, h);
for (const [i, x, z] of [
  [0, -7, -3],
  [1, 7, 5],
  [2, -8, 29],
  [3, 8, -29],
])
  add(`road-bags-${i}`, x, z, 3, 0.75, 0.85, "sandbag");
// The orchard is deliberately sparse: trunks interrupt sight and become logs after blasts.
for (let row = 0; row < 3; row++)
  for (let col = 0; col < 7; col++) {
    const x = -30 + col * 9 + (row % 2) * 2,
      z = -46 + row * 7 + ((col % 3) - 1) * 0.8;
    if (Math.abs(x) < 5) continue;
    vegetation.push({
      id: `tree-village-orchard-${row}-${col}`,
      x,
      z,
      w: 0.65,
      d: 0.65,
      h: 3.7 + (col % 3) * 0.65,
      kind: "tree",
      treeStyle:
        (col + row) % 4 === 0 ? "sparse" : (col + row) % 3 ? "bare" : "snapped",
    });
  }
for (const [i, x, z] of [
  [0, -31, -35],
  [1, -16, -41],
  [2, 15, -43],
  [3, 33, -38],
  [4, -32, 46],
  [5, 33, 44],
])
  vegetation.push({
    id: `village-brush-${i}`,
    x,
    z,
    w: 2.2,
    d: 1.5,
    h: 0.65,
    kind: "brush",
  });
// Level foundations and gentle surrounding relief use the existing shared terrain surface.
villageMap.terrain!.banks = buildTrenchBanks(villageMap);
villageMap.terrain!.elevation = buildTrenchElevation({
  ...villageMap,
  boxes: boxes.map((b) => ({ ...b, landmark: undefined })),
});
villageMap.terrain!.relief = buildTrenchRelief(
  villageMap,
  villageMap.terrain!.shellScars!,
);
for (const b of [...boxes, ...vegetation]) {
  if (b.supports) continue;
  b.baseY = groundHeight(b.x, b.z, villageMap) - 0.03;
}
// Retainers stay against the actual earth; none span the usable floor or an exit ramp.
for (const line of trenchLines)
  for (const s of line.sections)
    for (const side of [-1, 1])
      for (let z = s.z - s.length / 2 + 1; z < s.z + s.length / 2; z += 2) {
        const x = s.x + side * 1.15;
        if (
          groundHeight(x + side * 0.25, z, villageMap) > 0.3 &&
          groundHeight(x - side * 0.35, z, villageMap) < 0.1
        )
          villageMap.terrain!.lining.push({ x, z, w: 0.12, d: 1.8 });
      }
