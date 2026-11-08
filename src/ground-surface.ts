import { groundHeight, type MapDefinition, type Vec } from "./map";
import { lookNoise, surfacePixels } from "./battlefield-look";

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (a: number, b: number, n: number) => {
  const t = clamp((n - a) / (b - a));
  return t * t * (3 - 2 * t);
};
type Segment = { a: Vec; b: Vec };
function distance(p: Vec, { a, b }: Segment) {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const t = clamp(
    ((p.x - a.x) * dx + (p.z - a.z) * dz) / Math.max(0.001, dx * dx + dz * dz),
  );
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}
const contexts = new WeakMap<
  NonNullable<MapDefinition["terrain"]>,
  { paths: Segment[]; base: MapDefinition }
>();
function context(map: MapDefinition) {
  let c = contexts.get(map.terrain!);
  if (!c) {
    const paths: Segment[] = [];
    for (const r of map.terrain?.communicationRoutes ?? []) {
      const points = [map.spawn[r.team], r.entrance, ...r.points];
      for (let i = 1; i < points.length; i++)
        paths.push({ a: points[i - 1], b: points[i] });
    }
    // Faint, broken crossing tracks, independent of live bots or their RNG.
    for (const z of [-39, -12, 19, 43]) {
      const points = [
        { x: -30, z },
        { x: -6, z: z + 3 },
        { x: 9, z: z - 2 },
        { x: 31, z: z + 1 },
      ];
      for (let i = 1; i < points.length; i++)
        paths.push({ a: points[i - 1], b: points[i] });
    }
    c = { paths, base: { ...map, destruction: undefined } };
    contexts.set(map.terrain!, c);
  }
  return c;
}
// Paving shares the mud atlas and deformed surface, rather than leaving
// a separate road mesh floating over an excavated crater.
export function villageRoad(map: MapDefinition, x: number, z: number) {
  if (map.id !== "village") return 0;
  const edge = (lookNoise(x * 0.28 + 53, z * 0.28) - 0.5) * 1.1;
  const main = 1 - smooth(2.6 + edge, 4.1 + edge, Math.abs(x));
  const cross =
    (1 - smooth(2 + edge, 3.4 + edge, Math.abs(z))) *
    (1 - smooth(29, 36, Math.abs(x)));
  return Math.max(main, cross);
}
export function groundField(map: MapDefinition, x: number, z: number) {
  const c = context(map);
  const wx = x + (lookNoise(x * 0.028 + 17, z * 0.028) - 0.5) * 9;
  const wz = z + (lookNoise(x * 0.028, z * 0.028 + 31) - 0.5) * 9;
  const wet = smooth(0.28, 0.73, lookNoise(wx * 0.057 + 40, wz * 0.057 + 17));
  const dry =
    smooth(0.32, 0.76, lookNoise(wx * 0.041 - 13, wz * 0.041 + 9)) *
    (1 - wet * 0.75);
  let near = 1e9;
  for (const path of c.paths) near = Math.min(near, distance({ x, z }, path));
  const wear =
    (1 - smooth(0.3, 2.3, near)) *
    (0.35 + lookNoise(x * 0.29, z * 0.29) * 0.65);
  const grass =
    smooth(0.51, 0.76, lookNoise(wx * 0.047 + 3, wz * 0.047 - 20)) *
    (1 - wet * 0.65) *
    (1 - wear) *
    (0.35 + smooth(8, 42, Math.abs(x)) * 0.65);
  return { wet, dry, grass, wear };
}

// One map-sized atlas: two rotated/incommensurate mud samples and a warped,
// nonperiodic blend. No repeating 3 m diffuse tile or per-frame texture updates.
export function groundSurfacePixels(map: MapDefinition, size = 1024) {
  const sourceSize = 256,
    source = surfacePixels("mud", sourceSize);
  const diffuse = new Uint8Array(size * size * 4),
    normal = new Uint8Array(diffuse.length),
    gloss = new Uint8Array(diffuse.length);
  const heights = new Float32Array(size * size);
  const spacing = 0.5,
    columns = Math.ceil(map.width / spacing) + 1,
    rows = Math.ceil(map.depth / spacing) + 1;
  const fields = new Float32Array(columns * rows * 4);
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < columns; col++) {
      const f = groundField(
        map,
        -map.width / 2 + col * spacing,
        -map.depth / 2 + row * spacing,
      );
      fields.set([f.wet, f.dry, f.grass, f.wear], (row * columns + col) * 4);
    }
  const sample = (x: number, y: number) => {
    x = (((x % 1) + 1) % 1) * sourceSize;
    y = (((y % 1) + 1) % 1) * sourceSize;
    const ix = Math.floor(x),
      iy = Math.floor(y),
      fx = x - ix,
      fy = y - iy;
    const at = (dx: number, dy: number) =>
      source.diffuse[
        (((iy + dy) % sourceSize) * sourceSize + ((ix + dx) % sourceSize)) * 4
      ] / 255;
    return (
      (at(0, 0) * (1 - fx) + at(1, 0) * fx) * (1 - fy) +
      (at(0, 1) * (1 - fx) + at(1, 1) * fx) * fy
    );
  };
  for (let row = 0; row < size; row++)
    for (let col = 0; col < size; col++) {
      // Texel centers match the material's normalized world coordinates.
      const x = ((col + 0.5) / size - 0.5) * map.width,
        z = ((row + 0.5) / size - 0.5) * map.depth;
      const gx = (x + map.width / 2) / spacing,
        gz = (z + map.depth / 2) / spacing;
      const ix = Math.floor(gx),
        iz = Math.floor(gz),
        fx = gx - ix,
        fz = gz - iz;
      const channel = (k: number) => {
        const at = (dx: number, dz: number) =>
          fields[((iz + dz) * columns + ix + dx) * 4 + k];
        return (
          (at(0, 0) * (1 - fx) + at(1, 0) * fx) * (1 - fz) +
          (at(0, 1) * (1 - fx) + at(1, 1) * fx) * fz
        );
      };
      const wet = channel(0),
        dry = channel(1),
        grass = channel(2),
        wear = channel(3);
      const warp = (wet - dry) * 0.8;
      const a = sample(
        (x * 0.857 - z * 0.515) / 4.7 + warp,
        (x * 0.515 + z * 0.857) / 4.7,
      );
      const b = sample(
        (x * 0.602 + z * 0.799) / 8.3,
        (-x * 0.799 + z * 0.602) / 8.3 - warp,
      );
      const blend = clamp(wet * 0.6 + dry * 0.4),
        detail = a * (1 - blend) + b * blend - 0.78;
      const shade =
        0.83 + dry * 0.18 - wet * 0.25 - wear * 0.12 + detail * 0.52;
      const i = (row * size + col) * 4;
      diffuse.set(
        [
          clamp(shade - grass * 0.15) * 255,
          clamp(shade * 0.94 + grass * 0.015) * 255,
          clamp(shade * 0.83 - grass * 0.105) * 255,
          255,
        ],
        i,
      );
      const road = villageRoad(map, x, z);
      if (road > 0) {
        const pavingRow = Math.floor(z / 0.43),
          px = (((x / 0.6 + (pavingRow % 2) * 0.5) % 1) + 1) % 1,
          pz = (((z / 0.43) % 1) + 1) % 1;
        const joint = Math.min(px, 1 - px, pz, 1 - pz) < 0.075;
        const stone = (joint ? 0.46 : 0.76) + lookNoise(x * 5, z * 5) * 0.12;
        const mix = road * (0.65 + lookNoise(x * 0.7, z * 0.7) * 0.35);
        for (let c = 0; c < 3; c++)
          diffuse[i + c] = diffuse[i + c] * (1 - mix) + stone * 255 * mix;
      }
      const shine = 18 + wet * 112 + wear * wet * 65;
      gloss.set([shine, shine, shine, 255], i);
      heights[row * size + col] =
        detail * (0.7 - wet * 0.35) + wear * (a - b) * 0.18;
    }
  const h = (x: number, z: number) =>
    heights[
      Math.max(0, Math.min(size - 1, z)) * size +
        Math.max(0, Math.min(size - 1, x))
    ];
  for (let z = 0; z < size; z++)
    for (let x = 0; x < size; x++) {
      const dx = (h(x - 1, z) - h(x + 1, z)) * 1.4,
        dz = (h(x, z - 1) - h(x, z + 1)) * 1.4,
        length = Math.hypot(dx, dz, 1);
      normal.set(
        [
          ((dx / length) * 0.5 + 0.5) * 255,
          ((dz / length) * 0.5 + 0.5) * 255,
          ((1 / length) * 0.5 + 0.5) * 255,
          255,
        ],
        (z * size + x) * 4,
      );
    }
  return { diffuse, normal, gloss };
}

export interface GroundPuddle extends Vec {
  y: number;
  radius: number;
  positions: number[];
  indices: number[];
}
export function groundPuddles(map: MapDefinition): GroundPuddle[] {
  if (!map.terrain) return [];
  const base = context(map).base;
  const candidates = [
    ...(map.terrain.shellScars ?? []),
    ...(map.terrain.depressions ?? []),
  ];
  return candidates.slice(0, 9).flatMap((c, index) => {
    let center = { x: c.x, z: c.z },
      low = groundHeight(c.x, c.z, base);
    for (let x = c.x - 0.6; x <= c.x + 0.6; x += 0.3)
      for (let z = c.z - 0.6; z <= c.z + 0.6; z += 0.3) {
        const y = groundHeight(x, z, base);
        if (y < low) {
          center = { x, z };
          low = y;
        }
      }
    const y = low + 0.075,
      radius = 1.5,
      positions: number[] = [],
      indices: number[] = [];
    type Point = Vec & { level: number };
    const point = (x: number, z: number): Point => ({
      x,
      z,
      level: Math.max(
        groundHeight(x, z, base) + 0.012 - y,
        (Math.hypot(
          (x - center.x) / 1.5,
          (z - center.z) / (0.95 + (index % 3) * 0.15),
        ) -
          1) *
          0.2,
      ),
    });
    const triangle = (vertices: Point[]) => {
      const clipped: Point[] = [];
      for (let i = 0; i < vertices.length; i++) {
        const a = vertices[i],
          b = vertices[(i + 1) % vertices.length];
        if (a.level <= 0) clipped.push(a);
        if (a.level < 0 !== b.level < 0) {
          const t = a.level / (a.level - b.level);
          clipped.push({
            x: a.x + (b.x - a.x) * t,
            z: a.z + (b.z - a.z) * t,
            level: 0,
          });
        }
      }
      const start = positions.length / 3;
      for (const p of clipped) positions.push(p.x, y, p.z);
      for (let i = 1; i < clipped.length - 1; i++)
        indices.push(start, start + i, start + i + 1);
    };
    for (let x = center.x - radius; x < center.x + radius; x += 0.25)
      for (let z = center.z - radius; z < center.z + radius; z += 0.25) {
        const a = point(x, z),
          b = point(x, z + 0.25),
          c = point(x + 0.25, z + 0.25),
          d = point(x + 0.25, z);
        triangle([a, b, c]);
        triangle([a, c, d]);
      }
    return indices.length ? [{ ...center, y, radius, positions, indices }] : [];
  });
}
export function groundRubble(map: MapDefinition) {
  return (map.terrain?.communicationRoutes ?? []).flatMap((r, i) =>
    Array.from({ length: 5 }, (_, j) => {
      const angle = j * 2.4 + i,
        side = r.team === "blue" ? -1 : 1;
      const x = r.entrance.x + side * (3.8 + Math.cos(angle) * 2.2),
        z = r.entrance.z + Math.sin(angle) * 3.3;
      return {
        x,
        z,
        y: groundHeight(x, z, context(map).base),
        w: 0.12 + lookNoise(x, z) * 0.2,
        h: 0.05 + (j % 3) * 0.025,
        d: 0.15 + (i % 3) * 0.05,
        yaw: angle * 57.3,
      };
    }),
  );
}
