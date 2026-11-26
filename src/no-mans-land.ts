import type { BackdropBox } from "./backdrop";
import { groundHeight, type MapDefinition, type Vec, type WireSegment } from "./map";

// No-man's land dressing: wire belts (simulated in map.wireBelts and cut by
// blasts), water standing in the old craters, and the debris of earlier
// fighting. Ponds and debris are presentation only, and debris lies flat, so
// it can never pose as cover.

const hash = (n: number) => {
  const s = Math.sin(n * 12.9898 + 5.17) * 43758.5453;
  return s - Math.floor(s);
};

// Pickets, strands, apron wire and a coil for every intact segment; a few
// broken stakes and a low tangle where a blast has cut one.
// A shell that cuts wire lands on a frame already busy with terrain and
// ragdolls, so a cache keeps each segment's geometry: only segments whose cut
// state changed, or that `stale` picks out, are sampled against the ground again.
export type WireCache = Map<string, { cut: boolean; boxes: BackdropBox[]; lines: number[] }>;
export function wireBeltGeometry(map: MapDefinition, cache?: WireCache, stale?: (segment: WireSegment) => boolean): { boxes: BackdropBox[]; lines: number[] } {
  const boxes: BackdropBox[] = [], lines: number[] = [], cut = map.destruction?.wire ?? {};
  (map.wireBelts ?? []).forEach((s, n) => {
    const isCut = !!cut[s.id];
    let entry = cache?.get(s.id);
    if (!entry || entry.cut !== isCut || stale?.(s)) {
      entry = { cut: isCut, ...segmentGeometry(map, s, n, isCut) };
      cache?.set(s.id, entry);
    }
    for (const box of entry.boxes) boxes.push(box);
    for (const v of entry.lines) lines.push(v);
  });
  return { boxes, lines };
}
function segmentGeometry(map: MapDefinition, s: WireSegment, n: number, isCut: boolean) {
  const boxes: BackdropBox[] = [], lines: number[] = [];
  const ground = (x: number, z: number) => groundHeight(x, z, map);
  const line = (a: number[], b: number[]) => lines.push(...a, ...b);
  {
    const z0 = s.z - s.d / 2, z1 = s.z + s.d / 2, rows = [s.x - s.w / 2 + 0.5, s.x + s.w / 2 - 0.5];
    if (isCut) {
      for (let i = 0; i < 3; i++) {
        const x = s.x + (hash(n * 3 + i) - 0.5) * s.w, z = z0 + hash(n * 5 + i) * s.d;
        boxes.push({ x, y: ground(x, z) - 0.05, z, w: 0.06, h: 0.5 + hash(n + i) * 0.5, d: 0.06, lean: 0.6 + hash(n * 7 + i), yaw: hash(n * 11 + i) * 6, color: "#3a332a" });
      }
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 4, r = 0.5 + 0.3 * Math.sin(i * 1.3);
        const p = (k: number) => {
          const t = a + k * 0.7, x = s.x + Math.cos(t) * r * 1.2, z = s.z + Math.sin(t) * r * 1.6;
          return [x, ground(x, z) + 0.12 + 0.1 * Math.sin(t * 3), z];
        };
        line(p(0), p(1));
      }
      return { boxes, lines };
    }
    for (const [r, x] of rows.entries()) {
      const posts: number[][] = [];
      for (let z = z0 + r; z <= z1 + 0.01; z += 2) {
        const y = ground(x, z);
        boxes.push({ x, y: y - 0.1, z, w: 0.06, h: 1.25 + hash(n * 13 + z) * 0.12, d: 0.06, color: "#3a332a" });
        posts.push([x, y, z]);
      }
      for (const h of [0.35, 0.75, 1.08])
        for (let i = 1; i < posts.length; i++) {
          const a = [posts[i - 1][0], posts[i - 1][1] + h, posts[i - 1][2]], b = [posts[i][0], posts[i][1] + h, posts[i][2]];
          const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.06, (a[2] + b[2]) / 2];
          line(a, mid);
          line(mid, b);
          for (const f of [0.25, 0.5, 0.75]) {
            const p = [a[0], a[1] + (b[1] - a[1]) * f - 0.04, a[2] + (b[2] - a[2]) * f];
            line([p[0] - 0.03, p[1] + 0.03, p[2] - 0.03], [p[0] + 0.03, p[1] - 0.03, p[2] + 0.03]);
          }
        }
    }
    // Apron wires from one row's post tops to the other row's feet.
    for (let z = z0; z <= z1 + 0.01; z += 2) {
      const [a, b] = rows;
      line([a, ground(a, z) + 1.05, z], [b, ground(b, z + 1) + 0.15, z + 1]);
    }
    let previous: number[] | null = null;
    for (let z = z0; z <= z1; z += 0.04) {
      const t = (z / 0.32) * Math.PI * 2, x = s.x - Math.cos(t) * 0.42, point = [x, ground(x, z) + 0.48 + Math.sin(t) * 0.42, z];
      if (previous) line(previous, point);
      previous = point;
    }
  }
  return { boxes, lines };
}

// `radius` is how far the water reaches in its narrowest direction (footstep
// splashes use it). `edge` is the drawn outline: one radius per direction,
// running a little past the waterline under the bank so the ground clips the
// water instead of a flat disc floating over the lower parts of the bowl.
export type CraterPond = { x: number; z: number; y: number; radius: number; edge: number[] };
// Standing water in each authored crater: a little above the bowl's floor and
// only where the bowl holds it, its level lowered until the rim closes all round.
const ponds = new WeakMap<object, CraterPond[]>();
export const pondDirections = 24;
export function craterPonds(map: MapDefinition): CraterPond[] {
  const source = map.terrain;
  if (!source) return [];
  let cached = ponds.get(source);
  if (cached) return cached;
  cached = [];
  // Shell scars are irregular ovals; their narrower half-axis bounds the water.
  const scars = map.noMansLand?.scarPonds
    ? (source.shellScars ?? []).map((s) => ({ x: s.x, z: s.z, radius: Math.min(s.radiusX, s.radiusZ) }))
    : [];
  for (const c of [...(source.craters ?? []), ...scars]) {
    const pond = fillCrater(c, map, 0.16, 0.03);
    if (pond) cached.push({ x: pond.x, z: pond.z, y: pond.y, radius: pond.radius, edge: pond.edge });
  }
  ponds.set(source, cached);
  return cached;
}
// Water standing in one bowl: the deepest level from `deepest` down to
// `shallowest` above its floor at which the rim closes all round.
// `strict` (rising water) also lowers the level until every edge vertex can
// tuck in under a bank that stands clear of the water.
export function fillCrater(c: Vec & { radius: number }, map: MapDefinition, deepest: number, shallowest: number, strict = false): (CraterPond & { floor: number }) | undefined {
  const step = 0.05;
  // The bowl's floor: the lowest ground near the middle.
  let floor = Infinity, fx = c.x, fz = c.z;
  for (let r = 0; r <= c.radius * 0.5; r += 0.25)
    for (let i = 0; i < (r ? 12 : 1); i++) {
      const x = c.x + Math.cos((i / 12) * Math.PI * 2) * r, z = c.z + Math.sin((i / 12) * Math.PI * 2) * r, h = groundHeight(x, z, map);
      if (h < floor) { floor = h; fx = x; fz = z; }
    }
  // Walk out from the floor in each direction to where the ground rises
  // above the water. A side that never closes within the scar would spill,
  // so lower the water and try again.
  for (let depth = deepest; depth >= shallowest; depth -= 0.01) {
    const y = floor + depth, shore: number[] = [];
    for (let i = 0; i < pondDirections; i++) {
      const a = (i / pondDirections) * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
      let r = 0;
      while (r < c.radius * 1.5 && groundHeight(fx + dx * (r + step), fz + dz * (r + step), map) < y) r += step;
      if (r >= c.radius * 1.5) break;
      shore.push(r);
    }
    if (shore.length < pondDirections || Math.min(...shore) < 0.6) continue;
    // Carry each edge vertex on until it is safely under the bank.
    let open = false;
    const edge = shore.map((r, i) => {
      const a = (i / pondDirections) * Math.PI * 2;
      let e = r + step;
      while (e < r + 0.6 && groundHeight(fx + Math.cos(a) * e, fz + Math.sin(a) * e, map) < y + 0.05) e += step;
      if (!strict) return e + 0.1;
      if (groundHeight(fx + Math.cos(a) * e, fz + Math.sin(a) * e, map) < y + 0.03) open = true;
      return e;
    });
    if (open) continue;
    return { x: fx, z: fz, y, floor, radius: Math.min(...shore) - 0.05, edge };
  }
  return undefined;
}
export const inCraterPond = (p: Vec, map: MapDefinition) =>
  craterPonds(map).some((pond) => Math.hypot(p.x - pond.x, p.z - pond.z) < pond.radius && (p.y ?? groundHeight(p.x, p.z, map)) < pond.y + 0.1);

// Rifles, helmets, planks, spilled sandbags and shell cases, all lying flat.
export function noMansLandDebris(map: MapDefinition): BackdropBox[] {
  const kinds = [
    { w: 0.07, h: 0.06, d: 1.2, color: "#3b3127" },
    { w: 0.3, h: 0.12, d: 0.3, color: "#46503f" },
    { w: 0.3, h: 0.12, d: 0.3, color: "#5b5b52" },
    { w: 0.2, h: 0.04, d: 1.4, color: "#5e4d36" },
    { w: 0.34, h: 0.15, d: 0.5, color: "#74674c" },
    { w: 0.09, h: 0.09, d: 0.3, color: "#7d6838" },
  ];
  const out: BackdropBox[] = [], wet = craterPonds(map), belts = map.wireBelts ?? [];
  // Seventy pieces across Ypres's 32 m band; the same density on a wider one.
  const width = map.noMansLand?.width ?? 32, count = Math.round((70 * width) / 32);
  for (let i = 0; out.length < count && i < count * 6; i++) {
    const x = (hash(i * 1.3) - 0.5) * width, z = (hash(i * 2.1) - 0.5) * 118;
    if (wet.some((p) => Math.hypot(x - p.x, z - p.z) < p.radius + 0.4)) continue;
    if (belts.some((b) => Math.abs(x - b.x) < b.w / 2 + 0.5 && Math.abs(z - b.z) < b.d / 2 + 0.5)) continue;
    const y = groundHeight(x, z, map);
    if (y < (map.terrain?.bankHeight ?? 0) - 1.2) continue;
    const kind = kinds[i % kinds.length];
    out.push({ ...kind, x, y: y - 0.02, z, yaw: hash(i * 3.7) * Math.PI, lean: kind.h > 0.1 ? 0 : (hash(i * 4.1) - 0.5) * 0.1 });
  }
  return out;
}
