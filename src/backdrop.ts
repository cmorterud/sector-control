import { soilColor } from "./battlefield-look";
import { exposedEarth } from "./environment-surface";
import { hillHeight, type MapDefinition } from "./map";
import { coastalRules } from "./coastal-scenery";

// Presentation only: the land beyond a map's terrain edge, out to the horizon.
// Nothing here collides, navigates or simulates. A ring of rolling ground meets
// the terrain edge level, the trench lines run on into it as sandbag parapets,
// and ruins, broken woods, poles and balloons stand at fighting-front distances.
export const backdropRules = {
  radius: 300,
  cell: 6,
  // Level ground beside the terrain edge, so the seam cannot show.
  flatBand: 24,
  traverse: 14,
  jog: 3,
};

export type BackdropBox = {
  x: number; y: number; z: number; w: number; h: number; d: number;
  yaw?: number; lean?: number; color: string;
  // A box by default. "crown" is a squat eight-faced blob for a broadleaf
  // crown or a turret dome; "spire" a four-sided point for a pine.
  shape?: "box" | "crown" | "spire";
};
export type BackdropMesh = {
  positions: Float32Array; normals: Float32Array; uvs?: Float32Array; colors: Float32Array; indices: Uint32Array;
  // Unmirrored coordinates for tangents: mirrored ones cancel along each fold.
  tangentUvs?: Float32Array;
};

const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hash = (n: number) => {
  const s = Math.sin(n * 12.9898 + 4.1414) * 43758.5453;
  return s - Math.floor(s);
};
const linear = (hex: string, scale = 1) =>
  [1, 3, 5].map((i) => ((parseInt(hex.slice(i, i + 2), 16) / 255) * scale) ** 2.2);

// How far a point lies beyond the terrain edge (Chebyshev, so corners round off squarely).
const beyondEdge = (map: MapDefinition, x: number, z: number) =>
  Math.max(0, Math.abs(x) - map.width / 2, Math.abs(z) - map.depth / 2);

// How the land beyond each map's edge rolls, how far it climbs toward the
// horizon and from where, and any single hills. Verdun's is the hill country
// above the river: deeper folds, a long climb and a ridge for its fort.
export type BackdropRelief = { roll: number; rise: number; riseFrom: number; hills: { x: number; z: number; radius: number; height: number }[] };
const reliefs: Partial<Record<MapDefinition["id"], BackdropRelief>> = {
  verdun: { roll: 3.4, rise: 15, riseFrom: 70, hills: [{ x: 222, z: -46, radius: 75, height: 9 }] },
  // The Sari Bair range climbing on north-east toward Koja Chemen Tepe.
  gallipoli: { roll: 2.2, rise: 26, riseFrom: 40, hills: [{ x: 170, z: -210, radius: 150, height: 34 }, { x: 260, z: 60, radius: 90, height: 12 }] },
};
export const backdropRelief = (map: Pick<MapDefinition, "id">): BackdropRelief =>
  reliefs[map.id] ?? { roll: 2.4, rise: 7, riseFrom: 130, hills: [] };

export function backdropHeight(map: MapDefinition, x: number, z: number) {
  const bank = map.terrain?.bankHeight ?? 0, d = beyondEdge(map, x, z), relief = backdropRelief(map);
  const rolling =
    0.9 * Math.sin(x * 0.021 + z * 0.013 + 1.3) +
    0.6 * Math.sin(z * 0.027 - x * 0.011 + 4.2) +
    0.35 * Math.sin(x * 0.053 + z * 0.047);
  let hills = 0;
  for (const hill of relief.hills) {
    const r = Math.hypot(x - hill.x, z - hill.z) / hill.radius;
    if (r < 1) hills += hill.height * (1 - r * r) ** 2;
  }
  const away = smooth(backdropRules.flatBand, backdropRules.flatBand + 70, d);
  const land = bank + (rolling * relief.roll + hills) * away + relief.rise * smooth(relief.riseFrom, backdropRules.radius, d);
  if (!map.terrain?.hill) return land;
  // A hillside runs on past the edge as the edge's own ground, read from the
  // nearest edge point. Under the sea it sinks away out of sight; on land the
  // usual roll and rise come in once clear of the beach.
  const sea = coastalRules.seaLevel, edge = bank + hillHeight(x, z, map);
  if (edge < sea) return edge - 3 * away;
  return edge + (land - bank) * smooth(sea + 1.5, sea + 8, edge);
}

// The ground material paints the whole map onto one clamped texture, so a
// point beyond the edge would smear the edge texels outward. Mirror its texture
// coordinate back into the map instead: continuous at the seam, never stretched.
export function mirrorIntoMap(v: number, half: number) {
  const span = half * 2, period = span * 2;
  let t = (((v + half) % period) + period) % period;
  if (t > span) t = period - t;
  return t - half;
}

// A square ring of ground from the terrain edge to the horizon radius.
export function backdropGround(map: MapDefinition): BackdropMesh {
  const { radius, cell } = backdropRules, hx = map.width / 2, hz = map.depth / 2;
  const ticks = (edge: number) => {
    const set = new Set<number>([-edge, edge]);
    for (let v = -radius; v <= radius; v += cell) set.add(v);
    return [...set].sort((a, b) => a - b);
  };
  const xs = ticks(hx), zs = ticks(hz);
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], tangentUvs: number[] = [], colors: number[] = [], indices: number[] = [];
  const node = new Map<number, number>();
  const vertex = (i: number, j: number) => {
    const key = j * xs.length + i;
    let index = node.get(key);
    if (index !== undefined) return index;
    const x = xs[i], z = zs[j], y = backdropHeight(map, x, z), e = 0.8;
    const nx = backdropHeight(map, x - e, z) - backdropHeight(map, x + e, z),
      nz = backdropHeight(map, x, z - e) - backdropHeight(map, x, z + e),
      length = Math.hypot(nx, 2 * e, nz);
    index = positions.length / 3;
    positions.push(x, y, z);
    normals.push(nx / length, (2 * e) / length, nz / length);
    uvs.push(mirrorIntoMap(x, hx) / 3, mirrorIntoMap(z, hz) / 3);
    tangentUvs.push(x / 3, z / 3);
    colors.push(...soilColor(x, y, z, false, 0), exposedEarth(0));
    node.set(key, index);
    return index;
  };
  for (let j = 0; j < zs.length - 1; j++)
    for (let i = 0; i < xs.length - 1; i++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
      if (Math.abs(cx) < hx && Math.abs(cz) < hz) continue;
      const a = vertex(i, j), b = vertex(i + 1, j), c = vertex(i + 1, j + 1), d = vertex(i, j + 1);
      indices.push(a, d, c, a, c, b);
    }
  return {
    positions: new Float32Array(positions), normals: new Float32Array(normals),
    uvs: new Float32Array(uvs), tangentUvs: new Float32Array(tangentUvs), colors: new Float32Array(colors), indices: new Uint32Array(indices),
  };
}

// Each trench end that reaches the terrain edge, with the floor width there.
export function trenchEnds(map: MapDefinition) {
  const ends: { x: number; north: 1 | -1; width: number; front: boolean; team: "blue" | "red" }[] = [];
  for (const line of map.terrain?.trenchLines ?? []) {
    const side = line.team === "blue" ? -1 : 1, front = line.role === "front";
    for (const [section, north] of [[line.sections[0], -1], [line.sections.at(-1)!, 1]] as const)
      ends.push({ x: section.x - (front ? side : 0), north, width: front ? 4 : 2, front, team: line.team });
  }
  return ends;
}

// The continuing front: a zigzag of traverses from each trench end outward.
export function backdropTrenches(map: MapDefinition) {
  const { traverse, jog, radius } = backdropRules, edge = map.depth / 2;
  return trenchEnds(map).map((end, n) => {
    const points = [{ x: end.x, z: end.north * edge }];
    let x = end.x;
    for (let z = edge + traverse, i = 0; z < radius - 20; z += traverse, i++) {
      points.push({ x, z: end.north * z });
      x = end.x + (i % 2 === 0 ? jog : 0) * (hash(n * 7 + i) < 0.5 ? 1 : -1);
      points.push({ x, z: end.north * z });
    }
    return { ...end, points };
  });
}

// Every solid silhouette: parapets, wire pickets, end caps, woods, ruins and poles.
export function backdropScenery(map: MapDefinition): { boxes: BackdropBox[]; lines: number[] } {
  const boxes: BackdropBox[] = [], lines: number[] = [];
  // Gallipoli's trenches stop short of its edges, and the Western Front's
  // woods, villages and towns have no place on the peninsula.
  if (map.id === "gallipoli") return { boxes, lines };
  continuingFront(map, backdropTrenches(map), boxes, lines, true);
  trenchFrontScenery(map, boxes, lines);
  return { boxes, lines };
}

// Sandbag parapets either side of each continuing trench, and a wire belt on the
// no-man's-land side of front lines. Where a carved trench meets the terrain
// edge, an earth face closes it.
export function continuingFront(
  map: MapDefinition,
  trenches: { x: number; north: 1 | -1; width: number; front: boolean; team: "blue" | "red"; points: { x: number; z: number }[] }[],
  boxes: BackdropBox[], lines: number[], earthFaces: boolean,
) {
  const ground = (x: number, z: number) => backdropHeight(map, x, z);
  const bank = map.terrain?.bankHeight ?? 0, hz = map.depth / 2;
  for (const trench of trenches) {
    if (earthFaces)
      boxes.push({ x: trench.x, y: -0.2, z: trench.north * (hz + 0.15), w: trench.width + 2.2, h: bank + 0.2, d: 0.3, color: "#6b5d47" });
    for (let i = 1; i < trench.points.length; i++) {
      const a = trench.points[i - 1], b = trench.points[i], length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length < 0.5) continue;
      const alongZ = Math.abs(b.z - a.z) > Math.abs(b.x - a.x), offset = trench.width / 2 + 0.9;
      for (let t = 0; t < length; t += 3.6) {
        const f = (t + 1.6) / length, cx = a.x + (b.x - a.x) * Math.min(f, 1), cz = a.z + (b.z - a.z) * Math.min(f, 1);
        for (const s of [-1, 1]) {
          const x = alongZ ? cx + s * offset : cx, z = alongZ ? cz : cz + s * offset;
          const tall = 0.45 + 0.15 * hash(x * 3.1 + z);
          boxes.push({ x, y: ground(x, z) - 0.1, z, w: alongZ ? 1.3 : 3.3, h: tall, d: alongZ ? 3.3 : 1.3, color: s * trench.north > 0 ? "#7d705a" : "#6a5d48" });
        }
      }
      // Front lines keep a wire belt on their no-man's-land side.
      if (trench.front && alongZ) {
        const out = (trench.team === "blue" ? 1 : -1) * (offset + 5);
        let previous: number[] | null = null;
        for (let t = 0; t <= length; t += 3) {
          const z = a.z + Math.sign(b.z - a.z) * t, x = a.x + out, y = ground(x, z);
          boxes.push({ x, y, z, w: 0.07, h: 1.1, d: 0.07, color: "#2f2a23" });
          const top = [x, y + 1, z];
          if (previous) lines.push(...previous, ...top, previous[0], previous[1] - 0.55, previous[2], top[0], top[1] - 0.55, top[2]);
          previous = top;
        }
      }
    }
  }
}

// Every solid silhouette: parapets, wire pickets, end caps, woods, ruins and poles.
function trenchFrontScenery(map: MapDefinition, boxes: BackdropBox[], lines: number[]) {
  const ground = (x: number, z: number) => backdropHeight(map, x, z), hx = map.width / 2;
  // Shattered woods: splintered, leaning trunks with a few broken limbs.
  const wood = (cx: number, cz: number, count: number, spread: number, seed: number) => {
    for (let i = 0; i < count; i++) {
      const x = cx + (hash(seed + i * 3.7) - 0.5) * spread, z = cz + (hash(seed + i * 5.3) - 0.5) * spread * 0.7;
      const h = 3.5 + hash(seed + i * 1.9) * 8, w = 0.22 + hash(seed + i) * 0.3, yaw = hash(seed + i * 9.1) * Math.PI;
      boxes.push({ x, y: ground(x, z) - 0.3, z, w, h, d: w, yaw, lean: (hash(seed + i * 2.3) - 0.5) * 0.3, color: "#2d2722" });
      if (hash(seed + i * 4.4) > 0.55)
        boxes.push({ x: x + 0.4, y: ground(x, z) + h * 0.55, z, w: 0.12, h: 1.6 + hash(i) * 1.5, d: 0.12, yaw, lean: 0.9, color: "#2d2722" });
    }
  };
  wood(-150, -95, 34, 70, 11); wood(165, 120, 30, 60, 23); wood(-40, -190, 26, 80, 37);
  wood(55, 200, 24, 70, 41); wood(205, -15, 20, 40, 53);
  // A shelled village behind Blue: roofless shells and the stump of a church spire.
  const stone = (x: number, z: number, w: number, d: number, h: number, yaw: number, seed: number) => {
    const y = ground(x, z) - 0.2, c = Math.cos(yaw), s = Math.sin(yaw);
    for (const [ox, oz, ww, dd] of [[0, -d / 2, w, 0.5], [0, d / 2, w, 0.5], [-w / 2, 0, 0.5, d], [w / 2, 0, 0.5, d]]) {
      if (hash(seed + ox * 3 + oz) < 0.25) continue;
      const height = h * (0.45 + 0.55 * hash(seed + ox + oz * 7));
      boxes.push({ x: x + ox * c - oz * s, y, z: z + ox * s + oz * c, w: ww, h: height, d: dd, yaw, color: hash(seed + oz) < 0.5 ? "#6a645a" : "#5c574f" });
    }
  };
  for (let i = 0; i < 9; i++)
    stone(-175 + (hash(i * 2.1) - 0.5) * 50, 50 + (hash(i * 3.3) - 0.5) * 60, 6 + hash(i) * 4, 5 + hash(i * 1.7) * 3, 4 + hash(i * 2.9) * 3, hash(i * 4.1) * 0.6, i * 13);
  // The church: a roofless nave and a shell-broken tower with a jagged crown.
  stone(-161, 78, 13, 6, 6, 0, 91);
  const churchY = ground(-152, 78) - 0.2;
  boxes.push({ x: -152, y: churchY, z: 78, w: 3.2, h: 10.5, d: 3.2, color: "#615c54" },
    { x: -152.7, y: churchY + 10.5, z: 77.4, w: 1.4, h: 2.6, d: 1.6, color: "#58534c" },
    { x: -151.3, y: churchY + 10.5, z: 78.8, w: 1.1, h: 1.5, d: 1.2, lean: 0.2, color: "#58534c" });
  // Ypres on the western skyline, behind the British: the roofless Cloth Hall
  // with the broken stump of its belfry, and St Martin's tower beyond it.
  stone(-228, -22, 9, 44, 8, 0, 131);
  const belfryY = ground(-224, -22) - 0.2;
  boxes.push({ x: -224, y: belfryY, z: -22, w: 8, h: 17, d: 8, color: "#5f5a52" },
    { x: -225.6, y: belfryY + 17, z: -24.2, w: 2.2, h: 3.4, d: 2.4, color: "#57524b" },
    { x: -222.3, y: belfryY + 17, z: -20.1, w: 1.8, h: 2.1, d: 2, lean: 0.15, color: "#57524b" },
    { x: -224.4, y: belfryY + 17, z: -19.4, w: 1.4, h: 1.2, d: 1.5, color: "#57524b" });
  stone(-240, 12, 10, 18, 7, 0.1, 137);
  const cathedralY = ground(-236, 6) - 0.2;
  boxes.push({ x: -236, y: cathedralY, z: 6, w: 6, h: 14, d: 6, color: "#615c54" },
    { x: -237.2, y: cathedralY + 14, z: 4.6, w: 1.6, h: 2.6, d: 1.8, color: "#58534c" });
  // A ruined château and a windmill skeleton behind Red.
  stone(188, -60, 30, 10, 9, 0.08, 101);
  stone(205, -51, 9, 8, 6, 0.08, 113);
  const chateauY = ground(172, -61) - 0.2;
  boxes.push({ x: 172, y: chateauY, z: -61, w: 6, h: 12.5, d: 6, color: "#625c52" },
    { x: 172.8, y: chateauY + 12.5, z: -60.4, w: 2.4, h: 1.8, d: 2.6, color: "#58534b" });
  const millY = ground(160, 95);
  boxes.push({ x: 160, y: millY - 0.2, z: 95, w: 4, h: 11, d: 4, color: "#55504a" });
  for (let i = 0; i < 4; i++)
    boxes.push({ x: 160, y: millY + 6, z: 92.6, w: 0.35, h: 9, d: 0.2, yaw: 0, lean: i * Math.PI / 2 + 0.4, color: "#3b342c" });
  // Telegraph poles carrying wires back along both rear roads.
  for (const side of [-1, 1]) {
    let previous: number[] | null = null;
    for (let x = hx + 6; x < backdropRules.radius - 10; x += 24) {
      const px = side * x, pz = side * 9 - 4, y = ground(px, pz);
      boxes.push({ x: px, y: y - 0.2, z: pz, w: 0.22, h: 6.4, d: 0.22, color: "#3a3128" },
        { x: px, y: y + 5.7, z: pz, w: 0.14, h: 0.12, d: 1.6, color: "#3a3128" });
      const top = [px, y + 5.65, pz];
      if (previous)
        for (const dz of [-0.65, 0.65]) {
          const mid = [(previous[0] + top[0]) / 2, (previous[1] + top[1]) / 2 - 0.5, (previous[2] + top[2]) / 2 + dz];
          lines.push(previous[0], previous[1], previous[2] + dz, ...mid, ...mid, top[0], top[1], top[2] + dz);
        }
      previous = top;
    }
  }
}

// Unit shapes in the box's local frame (x and z across [-0.5, 0.5], y up [0, 1]),
// as triangles wound outward from the shape's centre.
const outward = (triangles: number[][][], centre: number[]) => triangles.map(([a, b, c]) => {
  const u = [0, 1, 2].map((k) => b[k] - a[k]), v = [0, 1, 2].map((k) => c[k] - a[k]);
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const out = [0, 1, 2].map((k) => (a[k] + b[k] + c[k]) / 3 - centre[k]);
  return n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0 ? [a, b, c] : [a, c, b];
});
const ring = (sides: number, y: number, radius: number, turn = 0) =>
  Array.from({ length: sides }, (_, i) => {
    const a = ((i + turn) / sides) * Math.PI * 2;
    return [Math.cos(a) * radius, y, Math.sin(a) * radius];
  });
// A faceted, rounded crown: apex, two staggered rings of eight, a blunt base.
const crownTriangles = (() => {
  const top = [0, 1, 0], bottom = [0, 0.04, 0], upper = ring(8, 0.7, 0.4), lower = ring(8, 0.32, 0.5, 0.5);
  const triangles: number[][][] = [];
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    triangles.push([upper[i], top, upper[j]], [upper[i], upper[j], lower[i]], [upper[j], lower[j], lower[i]], [lower[i], lower[j], bottom]);
  }
  return outward(triangles, [0, 0.5, 0]);
})();
// A six-sided point: a pine tier, or a tapering trunk.
const spireTriangles = (() => {
  const apex = [0, 1, 0], base = ring(6, 0, 0.5);
  return outward(base.map((a, i) => [a, base[(i + 1) % 6], apex]), [0, 0.3, 0]);
})();

export function backdropBoxMesh(boxes: BackdropBox[]): BackdropMesh {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  const faces = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  ];
  for (const b of boxes) {
    const cy = Math.cos(b.yaw ?? 0), sy = Math.sin(b.yaw ?? 0), cl = Math.cos(b.lean ?? 0), sl = Math.sin(b.lean ?? 0);
    // Lean about the box's local z axis at its foot, then turn by yaw.
    const transform = (v: number[]) => {
      const lx = v[0] * cl - v[1] * sl, ly = v[0] * sl + v[1] * cl, lz = v[2];
      return [lx * cy + lz * sy, ly, -lx * sy + lz * cy];
    };
    const tint = linear(b.color);
    if (b.shape === "crown" || b.shape === "spire") {
      for (const triangle of b.shape === "crown" ? crownTriangles : spireTriangles) {
        const first = positions.length / 3;
        const world = triangle.map((p) => transform([p[0] * b.w, p[1] * b.h, p[2] * b.d]));
        // Flat shading: the face normal, from the scaled and turned corners.
        const u = [0, 1, 2].map((k) => world[1][k] - world[0][k]), v = [0, 1, 2].map((k) => world[2][k] - world[0][k]);
        const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], length = Math.hypot(...n) || 1;
        for (const p of world) {
          positions.push(b.x + p[0], b.y + p[1], b.z + p[2]);
          normals.push(n[0] / length, n[1] / length, n[2] / length);
          colors.push(...tint.map((c) => c * (n[1] < 0 ? 0.6 : 1)), 1);
        }
        indices.push(first, first + 1, first + 2);
      }
      continue;
    }
    for (const [n, u, v] of faces) {
      const first = positions.length / 3, normal = transform(n);
      for (const [p, q] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const local = [0, 1, 2].map((k) => (n[k] + u[k] * p + v[k] * q) / 2);
        const scaled = [local[0] * b.w, (local[1] + 0.5) * b.h, local[2] * b.d], world = transform(scaled);
        positions.push(b.x + world[0], b.y + world[1], b.z + world[2]);
        normals.push(...normal);
        colors.push(...tint.map((c) => c * (n[1] < 0 ? 0.6 : 1)), 1);
      }
      indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
    }
  }
  return { positions: new Float32Array(positions), normals: new Float32Array(normals), colors: new Float32Array(colors), indices: new Uint32Array(indices) };
}

// Kite balloons tethered behind each line, and smoke rising from distant fires.
export const backdropBalloons = [
  { x: -215, z: 35, y: 58, yaw: 0.3 },
  { x: 225, z: -40, y: 62, yaw: 2.9 },
];
export const backdropSmoke = [
  { x: -165, z: -125, scale: 1 },
  { x: 180, z: 105, scale: 1.3 },
  { x: 40, z: -215, scale: 0.9 },
];
// Verdun's balloons hang behind each side's rear, clear of the village and the fort.
const verdunLife = {
  balloons: [
    { x: -238, z: -30, y: 60, yaw: 0.5 },
    { x: 246, z: 40, y: 64, yaw: 2.7 },
  ],
  smoke: [
    { x: -190, z: -140, scale: 1.1 },
    { x: 196, z: 128, scale: 1.2 },
    { x: -40, z: 220, scale: 0.9 },
  ],
};
// No kite balloons over Anzac's ridge; smoke from fires inland and up the coast.
const gallipoliLife = {
  balloons: [],
  smoke: [
    { x: 190, z: -150, scale: 1 },
    { x: 230, z: 120, scale: 0.9 },
  ],
};
export const backdropLife = (map: Pick<MapDefinition, "id">) =>
  map.id === "verdun" ? verdunLife : map.id === "gallipoli" ? gallipoliLife : { balloons: backdropBalloons, smoke: backdropSmoke };

// Distant shell bursts and flares follow a fixed timetable from the match tick,
// so the flash and its delayed rumble can be produced independently and agree.
export type DistantFlash = { tick: number; x: number; y: number; z: number };
export function distantFlashes(map: MapDefinition, from: number, to: number): DistantFlash[] {
  const out: DistantFlash[] = [];
  for (let slot = Math.max(0, Math.floor(from / 150) - 1); slot * 150 < to; slot++) {
    const tick = slot * 150 + Math.floor(hash(slot * 1.31) * 140);
    if (tick < from || tick >= to) continue;
    const angle = hash(slot * 2.77) * Math.PI * 2, distance = 150 + hash(slot * 3.91) * 110;
    const x = Math.cos(angle) * distance, z = Math.sin(angle) * distance, y = backdropHeight(map, x, z);
    // Nothing bursts under the sea.
    if (map.coast && y < coastalRules.seaLevel) continue;
    out.push({ tick, x, y, z });
  }
  return out;
}
export type DistantFlare = { tick: number; x: number; z: number; drift: number };
export function distantFlares(from: number, to: number): DistantFlare[] {
  const out: DistantFlare[] = [];
  for (let slot = Math.max(0, Math.floor(from / 600) - 1); slot * 600 < to; slot++) {
    const tick = slot * 600 + Math.floor(hash(slot * 5.17) * 420);
    if (tick < from || tick >= to) continue;
    const north = hash(slot * 6.3) < 0.5 ? -1 : 1;
    out.push({ tick, x: (hash(slot * 7.9) - 0.5) * 90, z: north * (120 + hash(slot * 8.7) * 80), drift: (hash(slot * 9.1) - 0.5) * 6 });
  }
  return out;
}
export const flareTicks = 7 * 30;
// A flare rises for 2.5 s, then hangs and sinks slowly while it burns.
export function flarePosition(flare: DistantFlare, tick: number) {
  const t = (tick - flare.tick) / 30;
  const y = t < 2.5 ? 42 * Math.sin((t / 2.5) * Math.PI / 2) : 42 - (t - 2.5) * 3.4;
  return { x: flare.x + flare.drift * t * 0.4, y, z: flare.z, burning: t >= 0 && t < flareTicks / 30 };
}
