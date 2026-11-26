import { duckboards, intactBoard } from "./battlefield";
import { groundHeight, type MapDefinition, type Vec } from "./map";
import { fillCrater } from "./no-mans-land";
import { trenchStretches } from "./trench-dressing";
import { lookNoise } from "./battlefield-look";

// Rain over Ypres, August 1917. The water that stands in the shell holes and
// along the trench floors rises through the match, and the churned ground
// drags at every stride except along the duckboards. The flood level is a
// pure function of the match tick, so the simulation stays deterministic.

export const rainMaps: readonly MapDefinition["id"][] = ["trenches"];
export const supportsRain = (map: Pick<MapDefinition, "id">) => rainMaps.includes(map.id);
export const rainStorageKey = "sector-control:rain";

export const weatherRules = {
  // The flood when the match opens (it has rained for a fortnight) and how
  // long the water takes to reach its height.
  startFlood: 0.2,
  riseSeconds: 420,
  // Stride multipliers: churned mud anywhere off the boards, the flooded
  // trench floor at full flood, and water at `deepWater` metres or more.
  mudPace: 0.93,
  trenchWade: 0.82,
  deepWade: 0.62,
  deepWater: 0.4,
  // How high above its floor a shell hole fills at full flood.
  pondDepth: 0.45,
  // The trench floor's water level, below and at full flood. The duckboards'
  // top is 0.0475, so the planks always break the surface.
  trenchLow: 0.012,
  trenchHigh: 0.04,
};

const smooth = (t: number) => t * t * (3 - 2 * t);
// 0 when the match opens, 1 at full flood.
export function floodAt(tick: number) {
  const t = Math.max(0, Math.min(1, tick / 30 / weatherRules.riseSeconds));
  return weatherRules.startFlood + (1 - weatherRules.startFlood) * smooth(t);
}

// A shell hole that fills: from `low`, a puddle in the bottom of the bowl,
// up to `high`. `edge` is drawn at the high water and runs under the
// bank, so the ground clips the lower water too.
export type RainPond = { x: number; z: number; low: number; high: number; radius: number; reach: number; edge: number[] };
const pondCache = new WeakMap<object, RainPond[]>();
export function rainPonds(map: MapDefinition): RainPond[] {
  const source = map.terrain;
  if (!source) return [];
  const cached = pondCache.get(source);
  if (cached) return cached;
  const bowls = [
    ...(source.craters ?? []),
    ...(source.shellScars ?? []).map((s) => ({ x: s.x, z: s.z, radius: Math.min(s.radiusX, s.radiusZ) })),
  ];
  const out: RainPond[] = [];
  for (const c of bowls) {
    // An authored crater is often also drawn as a scar: fill it once.
    if (out.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < 1.5)) continue;
    const high = fillCrater(c, map, weatherRules.pondDepth, 0.1, true);
    if (!high) continue;
    // From a puddle in the bottom of the bowl up to the brim.
    out.push({
      x: high.x, z: high.z, low: high.floor + 0.03, high: high.y,
      radius: high.radius, reach: Math.max(...high.edge), edge: high.edge,
    });
  }
  pondCache.set(source, out);
  return out;
}
export const pondLevel = (pond: RainPond, flood: number) => pond.low + (pond.high - pond.low) * flood;

// Trench floors and communication routes as rectangles of floor that flood.
export type FloodStrip = { x0: number; x1: number; z0: number; z1: number };
const stripCache = new WeakMap<object, FloodStrip[]>();
export function floodStrips(map: MapDefinition): FloodStrip[] {
  const source = map.terrain;
  if (!source) return [];
  const cached = stripCache.get(source);
  if (cached) return cached;
  const out: FloodStrip[] = trenchStretches(map).map((s) => ({
    x0: s.floorX - s.half - 0.3, x1: s.floorX + s.half + 0.3, z0: s.z0, z1: s.z1,
  }));
  for (const r of source.communicationRoutes ?? [])
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1], b = r.points[i];
      out.push({ x0: Math.min(a.x, b.x) - 1.3, x1: Math.max(a.x, b.x) + 1.3, z0: Math.min(a.z, b.z) - 1.3, z1: Math.max(a.z, b.z) + 1.3 });
    }
  stripCache.set(source, out);
  return out;
}
export const trenchWaterLevel = (flood: number) => weatherRules.trenchLow + (weatherRules.trenchHigh - weatherRules.trenchLow) * flood;
const inStrip = (p: Vec, s: FloodStrip) => p.x >= s.x0 && p.x <= s.x1 && p.z >= s.z0 && p.z <= s.z1;

// How deep the water stands at a point, in metres (0 when dry).
export function waterDepth(p: Vec, map: MapDefinition, flood: number) {
  let ground: number | undefined, depth = 0;
  for (const pond of rainPonds(map)) {
    if (Math.abs(p.x - pond.x) > pond.reach || Math.abs(p.z - pond.z) > pond.reach) continue;
    ground ??= groundHeight(p.x, p.z, map);
    depth = Math.max(depth, pondLevel(pond, flood) - ground);
  }
  if (floodStrips(map).some((s) => inStrip(p, s))) {
    ground ??= groundHeight(p.x, p.z, map);
    depth = Math.max(depth, trenchWaterLevel(flood) - ground);
  }
  return Math.max(0, depth);
}

// Duckboards bucketed by 2 m of z, so a stride looks at a handful, not all.
const boardCache = new WeakMap<object, Map<number, Vec[]>>();
function boardBuckets(map: MapDefinition) {
  const source = map.terrain!;
  let buckets = boardCache.get(source);
  if (!buckets) {
    buckets = new Map();
    for (const b of duckboards(map)) {
      const key = Math.floor(b.z / 2);
      buckets.set(key, [...(buckets.get(key) ?? []), b]);
    }
    boardCache.set(source, buckets);
  }
  return buckets;
}
export function onDuckboard(p: Vec, map: MapDefinition) {
  if (!map.terrain) return false;
  const buckets = boardBuckets(map), key = Math.floor(p.z / 2);
  for (let k = key - 1; k <= key + 1; k++)
    for (const b of buckets.get(k) ?? [])
      if (Math.abs(p.x - b.x) <= 0.65 && Math.abs(p.z - b.z) <= 0.9 && intactBoard(b, map)) return true;
  return false;
}

// What the ground does to a stride in the rain: 1 on the boards, a little
// less in the mud, and less again wading the flooded floor or a shell hole.
// Runs for every soldier every tick, so it asks for the ground height once
// and only looks for boards down on a trench floor.
export function rainPace(p: Vec, map: MapDefinition, flood: number) {
  if (!map.terrain) return 1;
  const r = weatherRules, ground = groundHeight(p.x, p.z, map);
  let pace = r.mudPace;
  if (ground < 0.08) {
    if (onDuckboard(p, map)) return 1;
    for (const s of floodStrips(map))
      if (inStrip(p, s)) { pace = 1 - (1 - r.trenchWade) * flood; break; }
  }
  for (const pond of rainPonds(map)) {
    if (Math.abs(p.x - pond.x) > pond.reach || Math.abs(p.z - pond.z) > pond.reach) continue;
    const depth = pondLevel(pond, flood) - ground;
    if (depth > 0.04) pace = Math.min(pace, 1 - (1 - r.deepWade) * Math.min(1, depth / r.deepWater));
  }
  return pace;
}

// Presentation only. Showers come and go: 0.55 to 1, varying over a minute
// or so, so the hiss and the streaks swell and ease together.
export function rainIntensity(seconds: number) {
  const swell = Math.sin(seconds * 0.071) * 0.6 + Math.sin(seconds * 0.173 + 1.3) * 0.4;
  return 0.775 + swell * 0.225;
}

// Falling rain as a fixed set of drops that wrap around the viewer: a box
// `span` wide and `height` tall that moves with the eye, so the drops never
// run out and nothing is spawned. Each drop's place in the box is hashed
// from its index; the box only scrolls.
export const rainBox = { span: 26, height: 15, speed: 9.5, wind: [0.17, -1, 0.06] as const };
const hash = (n: number) => {
  const s = Math.sin(n * 12.9898 + 4.1414) * 43758.5453;
  return s - Math.floor(s);
};
export const rainDropCount = { low: 450, medium: 1100, high: 1600 } as const;
const wrap = (v: number, size: number) => ((v % size) + size) % size;
export type RainDrop = { x: number; y: number; z: number; length: number; alpha: number };
// Writes up to `count` drops into `out` (reused between frames) and returns how
// many it wrote. Drops closer than 0.6 m are left out rather than smearing the view.
export function rainDrops(eye: Vec & { y: number }, seconds: number, count: number, out: RainDrop[]) {
  const { span, height, speed, wind } = rainBox, n = Math.hypot(...wind);
  const dx = wind[0] / n, dy = wind[1] / n, dz = wind[2] / n;
  let written = 0;
  for (let i = 0; i < count; i++) {
    const fall = wrap(hash(i * 3.7) * height + seconds * speed * (0.9 + hash(i * 1.3) * 0.2), height);
    const y = eye.y + height * 0.55 - fall;
    // The drift of the slant over the fall keeps the column under the wind.
    const drift = (fall / -dy);
    const x = eye.x - span / 2 + wrap(hash(i * 1.9) * span + dx * drift - eye.x + span / 2, span);
    const z = eye.z - span / 2 + wrap(hash(i * 5.3) * span + dz * drift - eye.z + span / 2, span);
    const distance = Math.hypot(x - eye.x, y - eye.y, z - eye.z);
    if (distance < 0.6) continue;
    const d = out[written] ??= { x: 0, y: 0, z: 0, length: 0, alpha: 0 };
    d.x = x; d.y = y; d.z = z;
    d.length = 0.45 + hash(i * 7.1) * 0.35;
    // Fade the farthest drops into the haze and the box's edge.
    d.alpha = Math.min(1, distance / 1.5) * Math.max(0, 1 - distance / (span * 0.55));
    written++;
  }
  return written;
}
export const rainDirection = (() => {
  const n = Math.hypot(...rainBox.wind);
  return rainBox.wind.map((c) => c / n) as [number, number, number];
})();

// Textures, as RGBA bytes so they build without a canvas.
// The rain atlas: a soft streak (u runs along the fall) and a splash.
export function rainAtlasPixels(cell = 32) {
  const width = cell * 2, out = new Uint8Array(width * cell * 4);
  for (let y = 0; y < cell; y++)
    for (let x = 0; x < width; x++) {
      const u = (x % cell + 0.5) / cell, v = (y + 0.5) / cell;
      const alpha = x < cell
        ? Math.sin(Math.PI * u) ** 0.8 * Math.exp(-(((v - 0.5) / 0.24) ** 2)) * (0.55 + 0.45 * u)
        : Math.exp(-(((u - 0.5) / 0.3) ** 2) - (((v - 0.62) / 0.22) ** 2)) * 0.9 + Math.exp(-(((u - 0.5) / 0.08) ** 2) - (((v - 0.3) / 0.2) ** 2)) * 0.6;
      out.set([255, 255, 255, Math.round(Math.min(1, alpha) * 255)], (y * width + x) * 4);
    }
  return out;
}
// Where a flat trench floor holds water first: blotches that join into a
// sheet as the alpha test drops with the flood.
export function puddleMaskPixels(size = 128) {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const n = lookNoise(u * 6, v * 6, 6) * 0.6 + lookNoise(u * 14, v * 14, 14) * 0.3 + lookNoise(u * 32, v * 32, 32) * 0.1;
      out.set([255, 255, 255, Math.round(Math.max(0, Math.min(1, (n - 0.2) / 0.6)) * 255)], (y * size + x) * 4);
    }
  return out;
}
// The alpha test that shows the floor's water at this flood: scattered pools
// at the start, the whole floor awash by full flood.
export const puddleThreshold = (flood: number) => Math.max(0, Math.min(1, 0.78 - flood * 0.82));
// Raindrops pocking standing water: many small dimples on a flat surface.
// The view jumps its offset several times a second so the pocks flicker.
export function rainRippleNormals(size = 128) {
  const height = new Float32Array(size * size);
  let seed = 1;
  const random = () => { const s = Math.sin(seed++ * 91.7) * 43758.5453; return s - Math.floor(s); };
  for (let k = 0; k < 90; k++) {
    const cx = random() * size, cy = random() * size, r = 2 + random() * 5;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++)
      for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
        const d = Math.hypot(dx, dy) / r;
        if (d >= 1) continue;
        const x = ((Math.floor(cx) + dx) % size + size) % size, y = ((Math.floor(cy) + dy) % size + size) % size;
        // A ring: a crest around a small dip.
        height[y * size + x] += Math.sin(d * Math.PI * 1.5) * (1 - d) * 0.9;
      }
  }
  const h = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const nx = h(x - 1, y) - h(x + 1, y), ny = h(x, y - 1) - h(x, y + 1), length = Math.hypot(nx, ny, 1);
      out.set([128 + (127 * nx) / length, 128 + (127 * ny) / length, 128 + 127 / length, 255], (y * size + x) * 4);
    }
  return out;
}

// The briefing's switch, on the maps that have weather.
export const rainChoice = (on: boolean) =>
  `<label class="tank-choice"><input id="rain" type="checkbox" ${on ? "checked" : ""}> Rain<small>A downpour all match: the shell holes and trench floors fill, and the mud drags at you off the duckboards</small></label>`;
