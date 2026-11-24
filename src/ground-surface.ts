import { groundHeight, trenchGround, type MapDefinition, type Vec } from "./map";
import { lookNoise, surfacePixels } from "./battlefield-look";
import { woodlandDensity } from "./verdun-forest";
import { villagePaving,villageYardSurface } from "./village-outdoors";

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (a: number, b: number, n: number) => {
  const t = clamp((n - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const streetSegments=new WeakMap<NonNullable<MapDefinition["streets"]>,Segment[]>();
type Segment = { a: Vec; b: Vec; width?:number };
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
  { paths: Segment[]; farmPaths:Segment[]; base: MapDefinition }
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
    const farmPaths:Segment[]=[];
    for(const track of map.farmland?.tracks??[])for(let i=1;i<track.points.length;i++)farmPaths.push({a:track.points[i-1],b:track.points[i],width:track.width});
    for (const track of map.woodland?.tracks ?? [])
      for (let i = 1; i < track.points.length; i++)
        paths.push({ a: track.points[i - 1], b: track.points[i] });
    c = { paths, farmPaths, base: { ...map, destruction: undefined } };
    contexts.set(map.terrain!, c);
  }
  return c;
}
// Paving shares the mud atlas and deformed surface, rather than leaving
// a separate road mesh floating over an excavated crater.
export function villageRoad(map: MapDefinition, x: number, z: number) {
  if (map.id !== "village" && !map.streets) return 0;
  if(map.streets) {
    let segments=streetSegments.get(map.streets);
    if(!segments){segments=map.streets.flatMap(s=>s.points.slice(1).map((b,i)=>({a:s.points[i],b,width:s.width})));streetSegments.set(map.streets,segments);}
    let value=0;const p={x,z};
    for(const segment of segments)value=Math.max(value,1-smooth(segment.width!/2-.6,segment.width!/2+.6,distance(p,segment)));
    return Math.max(value,villagePaving(map,x,z));
  }
  const edge = (lookNoise(x * 0.28 + 53, z * 0.28) - 0.5) * 1.1;
  const main = 1 - smooth(2.6 + edge, 4.1 + edge, Math.abs(x));
  const cross =
    (1 - smooth(2 + edge, 3.4 + edge, Math.abs(z))) *
    (1 - smooth(29, 36, Math.abs(x)));
  return Math.max(main, cross);
}
// 1 in no-man's land and beside a trench, falling to 0 on the open rear ground.
export function trenchChurn(map: MapDefinition, x: number, z: number) {
  const lines = map.terrain?.trenchLines ?? [];
  let front = Infinity, trench = Infinity;
  for (const line of lines)
    for (const s of line.sections) {
      if (line.role === "front") front = Math.min(front, Math.abs(s.x));
      trench = Math.min(trench, Math.hypot(Math.max(0, Math.abs(x - s.x) - 2), Math.max(0, Math.abs(z - s.z) - s.length / 2)));
    }
  if (front === Infinity) return 0;
  const between = (1 - smooth(front - 6, front, Math.abs(x))) * (0.75 + lookNoise(x * 0.09 + 3, z * 0.09) * 0.25);
  return Math.max(between, (1 - smooth(1.5, 7, trench)) * 0.8);
}
export function groundField(map: MapDefinition, x: number, z: number) {
  const c = context(map);
  const wx = x + (lookNoise(x * 0.028 + 17, z * 0.028) - 0.5) * 9;
  const wz = z + (lookNoise(x * 0.028, z * 0.028 + 31) - 0.5) * 9;
  let road=0,ruts=0;
  for(const path of c.farmPaths){const d=distance({x,z},path);road=Math.max(road,1-smooth(path.width!/2,path.width!/2+1,d));ruts=Math.max(ruts,Math.exp(-(((d-.72)/.16)**2))*(1-smooth(path.width!/2,path.width!/2+.5,d)));}
  let wet = Math.max(smooth(0.28, 0.73, lookNoise(wx * 0.057 + 40, wz * 0.057 + 17)),ruts*.85);
  for(const pool of map.farmland?.pools??[])wet=Math.max(wet,(1-smooth(.8,2.8,Math.hypot(x-pool.x,z-pool.z)))*.95);
  const dry =
    smooth(0.32, 0.76, lookNoise(wx * 0.041 - 13, wz * 0.041 + 9)) *
    (1 - wet * 0.75);
  let near = 1e9;
  for (const path of c.paths) near = Math.min(near, distance({ x, z }, path));
  const wear = Math.max((1-smooth(.3,2.3,near))*(.35+lookNoise(x*.29,z*.29)*.65),road*(.7+lookNoise(x*.7,z*.7)*.3));
  const litter = map.woodland
    ? woodlandDensity(map.woodland, wx, wz) * (1 - wear * .9) * (.65 + lookNoise(x * .21, z * .21) * .35)
    : 0;
  const grass =
    smooth(0.51, 0.76, lookNoise(wx * 0.047 + 3, wz * 0.047 - 20)) *
    (1 - wet * 0.65) *
    (1 - wear) *
    (0.35 + smooth(8, 42, Math.abs(x)) * 0.65) * (1 - litter * .85);
  const indoors=map.buildings?.some(b=>Math.abs(x-b.x)<b.w/2 && Math.abs(z-b.z)<b.d/2);
  const yard=villageYardSurface(map,x,z),gravel=indoors?0:Math.max(yard.gravel,yard.path),garden=indoors?0:yard.garden;
  // The Trench front is churned: no-man's land between the front lines is
  // bare, wet earth, and the ground within a few metres of any trench is
  // trodden mud. Grass survives only on the rear ground.
  const churn = trenchGround(map) ? trenchChurn(map, x, z) : 0;
  if (churn > 0) {
    wet = Math.max(wet, churn * (0.4 + lookNoise(x * 0.13 + 5, z * 0.13 - 8) * 0.55));
    return { wet, dry: dry * (1 - churn * 0.8), grass: grass * (1 - churn), wear: Math.max(wear, churn * 0.55), litter, gravel, garden };
  }
  return { wet, dry, grass:indoors?0:grass*(1-Math.max(gravel,yard.paving)),
    wear:indoors?Math.max(.8,wear):Math.max(wear,gravel*.8,yard.paving*.9), litter, gravel,garden };
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
  const channels=map.id==="village"?7:5,fields = new Float32Array(columns * rows * channels);
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < columns; col++) {
      const f = groundField(
        map,
        -map.width / 2 + col * spacing,
        -map.depth / 2 + row * spacing,
      );
      const values=[f.wet,f.dry,f.grass,f.wear,f.litter];
      if(channels===7)values.push(f.gravel,f.garden);
      fields.set(values, (row * columns + col) * channels);
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
        if(k>=channels)return 0;
        const at = (dx: number, dz: number) =>
          fields[((iz + dz) * columns + ix + dx) * channels + k];
        return (
          (at(0, 0) * (1 - fx) + at(1, 0) * fx) * (1 - fz) +
          (at(0, 1) * (1 - fx) + at(1, 1) * fx) * fz
        );
      };
      const wet = channel(0),
        dry = channel(1),
        grass = channel(2),
        wear = channel(3),
        litter = channel(4),gravel=channel(5),garden=channel(6);
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
      // Trench front grass is winter-dead straw rather than green.
      const tint = trenchGround(map) ? [0.05, 0.03, 0.17] : [0.15, -0.015, 0.105];
      diffuse.set(
        [
          clamp(shade - grass * tint[0]) * 255,
          clamp(shade * 0.94 - grass * tint[1]) * 255,
          clamp(shade * 0.83 - grass * tint[2]) * 255,
          255,
        ],
        i,
      );
      if (litter > .01) {
        // Broken leaves and needles are baked into the same deformable atlas;
        // fresh blast cuts expose the ordinary soil through the existing mask.
        const fleck = lookNoise(x * 3.1 + 71, z * 3.1 - 29);
        const mix = litter * .7;
        const leaf = [.48 + fleck * .13, .40 + fleck * .10, .28 + fleck * .07];
        for (let c = 0; c < 3; c++)
          diffuse[i + c] = diffuse[i + c] * (1 - mix) + leaf[c] * 255 * mix;
      }
      if(gravel>.01||garden>.01) {
        const grit=lookNoise(x*8.3+43,z*8.3-11),furrow=Math.sin(x*6.8+Math.sin(z*.3)*.3)*.025;
        const colors=[.64+grit*.13,.59+grit*.13,.48+grit*.12];
        for(let c=0;c<3;c++)diffuse[i+c]=diffuse[i+c]*(1-gravel*.82)+colors[c]*255*gravel*.82;
        const soil=[.43+furrow+grit*.06,.38+furrow+grit*.05,.27+grit*.04];
        for(let c=0;c<3;c++)diffuse[i+c]=diffuse[i+c]*(1-garden*.78)+soil[c]*255*garden*.78;
      }
      const road = villageRoad(map, x, z);
      let pavingRelief=0;
      if (road > 0) {
        const pavingRow = Math.floor(z / 0.43),
          px = (((x / 0.6 + (pavingRow % 2) * 0.5) % 1) + 1) % 1,
          pz = (((z / 0.43) % 1) + 1) % 1;
        const joint = Math.min(px, 1 - px, pz, 1 - pz) < 0.075;
        const block=lookNoise(Math.floor(x/.6+(pavingRow%2)*.5)*3,pavingRow*3);
        const stone = (joint ? 0.49 : 0.67+block*.17) + lookNoise(x * 12, z * 12) * 0.055;
        const mix = road * (0.88 + lookNoise(x * 0.7, z * 0.7) * 0.12);
        for (let c = 0; c < 3; c++)
          diffuse[i + c] = diffuse[i + c] * (1 - mix) + stone * 255 * mix;
        pavingRelief=joint?-.018:.018+Math.sin(px*Math.PI)*Math.sin(pz*Math.PI)*.025;
      }
      const shine = (18 + wet * 112 + wear * wet * 65) * (1 - litter * .45)*(1-gravel*.65)*(1-garden*.6);
      gloss.set([shine, shine, shine, 255], i);
      heights[row * size + col] =
        (detail * (0.7 - wet * 0.35) + wear * (a - b) * 0.18 + garden*Math.sin(x*6.8)*.045)*(1-road)+pavingRelief*road;
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
  return [...candidates.slice(0,9),...(map.farmland?.pools??[])].flatMap((c, index) => {
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
