import { groundHeight, playArea, type MapDefinition } from "./map";

// The barbed-wire belt just outside a map's play area: two staggered rows of
// screw pickets strung at three heights, diagonal apron wires between them and
// a concertina coil down the middle. Pickets are boxes; every wire is a line
// segment, about as wide on screen as real wire at fighting distance.
export const boundaryWireLayout = {
  rows: [0.6, 2.4],
  coil: { offset: 1.5, radius: 0.42, height: 0.48, pitch: 0.32, segments: 10 },
  picketSpacing: 2.4,
  picketSize: 0.06,
  strandHeights: [0.32, 0.72, 1.08],
  barbSpacing: 0.3,
};

export interface BoundaryWireGeometry {
  pickets: { positions: Float32Array; normals: Float32Array; indices: Uint32Array; bases: { x: number; z: number; y: number }[] };
  lines: Float32Array;
}

const hash = (n: number) => {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

export function boundaryWireGeometry(
  map: MapDefinition,
  ground: (x: number, z: number) => number = (x, z) => groundHeight(x, z, map),
): BoundaryWireGeometry {
  const positions: number[] = [], normals: number[] = [], indices: number[] = [], lines: number[] = [];
  const bases: { x: number; z: number; y: number }[] = [];
  const empty = { pickets: { positions: new Float32Array(), normals: new Float32Array(), indices: new Uint32Array(), bases }, lines: new Float32Array() };
  if (!map.boundary) return empty;
  const area = playArea(map), depth = map.boundary.wireDepth, L = boundaryWireLayout;
  const line = (a: number[], b: number[]) => lines.push(...a, ...b);
  const picket = (x: number, z: number, h: number) => {
    const y = ground(x, z), s = L.picketSize / 2;
    bases.push({ x, z, y });
    // Each face's u × v is its outward normal, so the quads wind counter-clockwise.
    for (const [n, u, v] of [
      [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
      [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
      [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    ]) {
      const first = positions.length / 3;
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const p = [0, 1, 2].map((k) => n[k] * s + u[k] * a * s + v[k] * b * s);
        positions.push(x + p[0], y + h / 2 + p[1] * (h / L.picketSize), z + p[2]);
        normals.push(...n);
      }
      indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
    }
    return y;
  };
  // A sagging strand between two posts, with small barbs along it.
  const strand = (a: number[], b: number[], seed: number) => {
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.05 - 0.04 * hash(seed), (a[2] + b[2]) / 2];
    for (const [from, to] of [[a, mid], [mid, b]]) {
      line(from, to);
      const length = Math.hypot(to[0] - from[0], to[2] - from[2]);
      for (let t = L.barbSpacing / 2; t < length; t += L.barbSpacing) {
        const f = t / length, p = [0, 1, 2].map((k) => from[k] + (to[k] - from[k]) * f);
        line([p[0] - 0.03, p[1] + 0.03, p[2] + 0.03], [p[0] + 0.03, p[1] - 0.03, p[2] - 0.03]);
        line([p[0] + 0.03, p[1] + 0.03, p[2] - 0.03], [p[0] - 0.03, p[1] - 0.03, p[2] + 0.03]);
      }
    }
  };
  // Four edges, each running past the corners so the belt closes.
  for (const [axis, side] of [["x", -1], ["x", 1], ["z", -1], ["z", 1]] as const) {
    const edge = (axis === "x" ? area.width : area.depth) / 2,
      half = (axis === "x" ? area.depth : area.width) / 2 + depth - 0.2;
    const at = (along: number, out: number): [number, number] =>
      axis === "x" ? [side * (edge + out), along] : [along, side * (edge + out)];
    const seed = (axis === "x" ? 1 : 3) + side;
    const rows = L.rows.map((out, r) => {
      const posts: number[][] = [];
      for (let along = -half + r * L.picketSpacing / 2; along <= half; along += L.picketSpacing) {
        const [x, z] = at(along, out), y = picket(x, z, 1.18 + 0.14 * hash(along * 7.1 + seed + r));
        posts.push([x, y, z]);
      }
      L.strandHeights.forEach((h, s) => {
        for (let i = 1; i < posts.length; i++)
          strand([posts[i - 1][0], posts[i - 1][1] + h, posts[i - 1][2]], [posts[i][0], posts[i][1] + h, posts[i][2]], i * 3 + s + seed * 101);
      });
      return posts;
    });
    // Apron wires zigzag between the rows, from each post top to the next post foot.
    const [a, b] = rows;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      line([a[i][0], a[i][1] + 1.08, a[i][2]], [b[i][0], b[i][1] + 0.18, b[i][2]]);
      if (a[i + 1]) line([b[i][0], b[i][1] + 1.08, b[i][2]], [a[i + 1][0], a[i + 1][1] + 0.18, a[i + 1][2]]);
    }
    const { offset, radius, height, pitch, segments } = L.coil;
    let previous: number[] | null = null;
    for (let along = -half; along <= half; along += pitch / segments) {
      const turn = (along / pitch) * Math.PI * 2, r = radius * (0.9 + 0.1 * Math.sin(along * 0.7 + seed));
      const [cx, cz] = at(along, offset - Math.cos(turn) * r);
      const point = [cx, ground(cx, cz) + height + Math.sin(turn) * r, cz];
      if (previous) line(previous, point);
      previous = point;
    }
  }
  return {
    pickets: { positions: new Float32Array(positions), normals: new Float32Array(normals), indices: new Uint32Array(indices), bases },
    lines: new Float32Array(lines),
  };
}
