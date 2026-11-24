import { hullRadius, type Rect, type ZeppelinLayout } from "./zeppelin-map";

// Presentation geometry for the Zeppelin map: the airship's skin and the
// bands of its main rings. Pure data, so it can be checked without a GPU.
export type MeshData = { positions: number[]; normals: number[]; uvs: number[]; indices: number[] };
type Point = [number, number, number];

// Where something passes through the skin, so that patch of skin is left out:
// the top of each stair tower, each gangway out to an engine car and each
// bomb door.
export function skinOpening(layout: ZeppelinLayout): (p: Point) => boolean {
  const inside = (r: Rect, x: number, z: number, margin = 0) =>
    x > r.x0 - margin && x < r.x1 + margin && z > r.z0 - margin && z < r.z1 + margin;
  const towers = layout.towers.map((t) => t.interior);
  return ([x, y, z]) =>
    towers.some((r) => inside(r, x, z, 0.4)) ||
    layout.engineCars.some((c) => Math.abs(x - (c.x0 + c.x1) / 2) < 1.3 && Math.sign(z) === Math.sign(c.z0) && y < 2.9 && y > -1) ||
    layout.bombDoors.some((d) => inside(d, x, z, 0.3) && y < 0.5);
}

// A band of the hull between two stations along its length, `inflate`
// metres proud of the skin, in `sides` facets round the axis.
export function hullBand(layout: ZeppelinLayout, x0: number, x1: number, step: number, sides: number,
  inflate = 0, open: (p: Point) => boolean = () => false): MeshData {
  const { axis } = layout.hull;
  const stations: number[] = [];
  for (let x = x0; x < x1 - 1e-6; x += step) stations.push(x);
  stations.push(x1);
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  const radius = (x: number) => hullRadius(x) + (hullRadius(x) > 0 ? inflate : 0);
  for (const x of stations) {
    const r = radius(x), slope = (radius(x + 0.05) - radius(x - 0.05)) / 0.1;
    for (let j = 0; j <= sides; j++) {
      // Angle from the top of the hull, positive toward +z.
      const a = (j / sides) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      positions.push(x, axis + r * c, r * s);
      const n = Math.hypot(slope, 1);
      normals.push(-slope / n, c / n, s / n);
      uvs.push(x / 2.6, (a * Math.max(r, 0.5)) / 2.6);
    }
  }
  const row = sides + 1;
  for (let i = 0; i + 1 < stations.length; i++)
    for (let j = 0; j < sides; j++) {
      const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
      const centre: Point = [0, 0, 0];
      for (const k of [a, b, c, d]) for (let m = 0; m < 3; m++) centre[m] += positions[k * 3 + m] / 4;
      if (open(centre)) continue;
      // Wound so the outside faces outward.
      indices.push(a, b, c, b, d, c);
    }
  return { positions, normals, uvs, indices };
}

export const hullSkin = (layout: ZeppelinLayout) =>
  hullBand(layout, -layout.hull.half, layout.hull.half, 1.5, 48, 0, skinOpening(layout));

// A narrow band over each main ring every 10 m, a little proud of the skin.
export function ringBands(layout: ZeppelinLayout): MeshData {
  const out: MeshData = { positions: [], normals: [], uvs: [], indices: [] }, open = skinOpening(layout);
  for (let x = -70; x <= 70; x += 10) {
    const band = hullBand(layout, x - 0.14, x + 0.14, 0.28, 48, 0.035, open), base = out.positions.length / 3;
    out.positions.push(...band.positions); out.normals.push(...band.normals); out.uvs.push(...band.uvs);
    out.indices.push(...band.indices.map((i) => i + base));
  }
  return out;
}
