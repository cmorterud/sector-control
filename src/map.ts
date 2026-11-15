import type { FarmFront } from "./farm-front";
import type { Woodland } from "./verdun-forest";
import type { Landmark } from "./landmarks";
import type { DestructionState } from "./destruction";
export const terrainResolution = 0.25;
export const terrainPatchSize = 8;
export type Vec = { x: number; z: number; y?: number };
export type Box = Vec & {
  id?: string;
  w: number;
  d: number;
  h: number;
  kind:
    | "building"
    | "container"
    | "barrier"
    | "sandbag"
    | "wire"
    | "bunker"
    | "wood"
    | "tree"
    | "brush"
    | "log"
    | "stump"
    | "masonry"
    | "concrete"
    | "gun"
    | "rubble";
  landmark?: string;
  supports?: string[];
  baseY?: number;
  farmProp?: "crate" | "cart" | "fence" | "relayMast" | "radio" | "bench" | "planter" | "fountain" | "timber" | "worktable" | "trough";
  footingY?: number;
  architecture?: {
    building: string;
    part: "wall" | "floor" | "roof" | "stair" | "ceiling" | "detail";
    level: number;
    bearing?: boolean;
    tint?: string;
    roofPitch?: number;
    opening?: "window" | "door";
    corner?: -1 | 1;
    sign?: string;
    feature?: "bookcase" | "desk" | "table" | "bed" | "oven" | "hearth" | "counter" | "stall" | "cupboard" | "workbench" | "bell" | "clock";
  };
  walkable?: boolean;
  // A loaded exterior model drawn in place of the plain box, which remains
  // the collision shape. Position defaults to the box center.
  model?: { name: "lighthouse" | "church" | "tenement"; yaw?: number; x?: number; z?: number };
  treeStyle?: "bare" | "snapped" | "sparse" | "pine";
};
export const sectors = [
  { id: "A", x: -28, z: -16 },
  { id: "B", x: 0, z: 8 },
  { id: "C", x: 28, z: 16 },
];
export const spawn = { blue: { x: -42, z: 40 }, red: { x: 42, z: -40 } };
export const boxes: Box[] = [
  { x: -23, z: 21, w: 16, d: 10, h: 9, kind: "building" },
  { x: 23, z: -21, w: 16, d: 10, h: 11, kind: "building" },
  { x: -25, z: -37, w: 19, d: 10, h: 12, kind: "building" },
  { x: 25, z: 37, w: 19, d: 10, h: 8, kind: "building" },
  { x: 0, z: -23, w: 11, d: 12, h: 8, kind: "building" },
  { x: -43, z: 0, w: 9, d: 17, h: 10, kind: "building" },
  { x: 43, z: 0, w: 9, d: 17, h: 10, kind: "building" },
  { x: 0, z: 36, w: 10, d: 8, h: 7, kind: "building" },
  { x: -14, z: -7, w: 3, d: 10, h: 3, kind: "container" },
  { x: 15, z: 16, w: 3, d: 10, h: 3, kind: "container" },
  { x: -30, z: 2, w: 9, d: 2, h: 1.4, kind: "barrier" },
  { x: 30, z: -2, w: 9, d: 2, h: 1.4, kind: "barrier" },
  { x: -7, z: 15, w: 5, d: 2, h: 1.4, kind: "barrier" },
  { x: 7, z: 0, w: 5, d: 2, h: 1.4, kind: "barrier" },
  { x: -38, z: -23, w: 4, d: 3, h: 2, kind: "container" },
  { x: 38, z: 23, w: 4, d: 3, h: 2, kind: "container" },
];
export type Ramp = Vec & {
  w: number;
  d: number;
  low: number;
  high: number;
  direction: 1 | -1;
};
export type TerrainRect = Vec & { w: number; d: number; h: number };
export interface TerrainElevation {
  originX: number;
  originZ: number;
  spacing: number;
  columns: number;
  rows: number;
  values: Float32Array;
}
export interface TrenchBanks extends TerrainElevation {
  cellColumns: number;
  cells: Uint8Array;
}
export interface TerrainRelief {
  grid?: {
    originX: number;
    originZ: number;
    columns: number;
    rows: number;
    values: Float32Array;
  };
  cuts: Record<string, number>;
  patches: Record<string, true>;
}
export type Depression = Vec & {
  radiusX: number;
  radiusZ: number;
  depth: number;
  rotation?: number;
  irregularity?: number;
  phase?: number;
};
export interface TrenchLine {
  team: "blue" | "red";
  role: "front" | "rear";
  sections: (Vec & { length: number; stepZ?: number })[];
}
export interface CommunicationRoute {
  team: "blue" | "red";
  entrance: Vec;
  points: Vec[];
}
export interface MapDefinition {
  id: "industrial" | "trenches" | "village" | "verdun" | "headland" | "training";
  name: string;
  width: number;
  depth: number;
  navSpacing: number;
  navigationPoints?: Vec[];
  buildings?: {
    id: string; name: string; x: number; z: number; w: number; d: number;
    stories: number; baseY: number; flag?: string;
    posts: Vec[];
  }[];
  streets?: { points: Vec[]; width: number }[];
  // Closed outline of the playable land. Ground beyond it is sea: authored
  // below the land and closed to movement, navigation and deployment.
  coast?: Vec[];
  scoring?: "sectors" | "eliminations" | "domination";
  spawn: Record<"blue" | "red", Vec>;
  landmarks?: Landmark[];
  farmland?: FarmFront;
  woodland?: Woodland;
  sectors: (Vec & { id: string; name?: string; home?: "blue" | "red" })[];
  boxes: Box[];
  vegetation?: Box[];
  destruction?: DestructionState;
  terrain?: {
    bankHeight: number;
    firingPositions?: (Vec & { team: "blue" | "red" })[];
    trenchLines?: TrenchLine[];
    communicationRoutes?: CommunicationRoute[];
    branchRoutes?: CommunicationRoute[];
    shelterBays?: (Vec & { team: "blue" | "red" })[];
    cellSize: number;
    columns: number;
    rows: number;
    heights: Float32Array;
    rectangles: TerrainRect[];
    ramps: Ramp[];
    lining: (Vec & { w: number; d: number })[];
    craters: (Vec & { radius: number; depth?: number })[];
    depressions?: Depression[];
    shellScars?: Depression[];
    elevation?: TerrainElevation;
    banks?: TrenchBanks;
    relief?: TerrainRelief;
  };
}
export const industrialMap: MapDefinition = {
  id: "industrial",
  name: "Industrial district",
  width: 100,
  depth: 100,
  navSpacing: 5,
  spawn,
  sectors,
  boxes,
};
function authoredMapHeight(
  x: number,
  z: number,
  map: MapDefinition = industrialMap,
): number {
  const terrain = map.terrain;
  if (!terrain) return 0;
  for (const ramp of terrain.ramps)
    if (
      Math.abs(x - ramp.x) <= ramp.w / 2 &&
      Math.abs(z - ramp.z) < ramp.d / 2
    ) {
      const t = Math.max(
        0,
        Math.min(1, 0.5 + ((x - ramp.x) / ramp.w) * ramp.direction),
      );
      return ramp.low + (ramp.high - ramp.low) * t;
    }
  const gx = (x + map.width / 2) / terrain.cellSize,
    gz = (z + map.depth / 2) / terrain.cellSize,
    col = Math.floor(gx),
    row = Math.floor(gz);
  if (col < 0 || col >= terrain.columns || row < 0 || row >= terrain.rows)
    return terrain.bankHeight;
  const height = terrain.heights[row * terrain.columns + col];
  // The authored lane/step stays flat. Most soldier queries never need the
  // denser shoulder field; ramps already returned their exact height above.
  if (height < terrain.bankHeight - 0.01) return height;
  const banks = terrain.banks;
  if (
    banks?.cells[Math.floor(row / 2) * banks.cellColumns + Math.floor(col / 2)]
  ) {
    const rounded = groundElevationField(x, z, banks);
    if (Math.abs(rounded) < 1e-8) return 0;
    return (
      rounded +
      (rounded >= terrain.bankHeight - 0.01 ? groundElevation(x, z, map) : 0)
    );
  }
  // Floors, steps and ramps are protected from elevation. Reuse the authored
  // cell lookup for open ground instead of doing a second grid lookup per ray.
  return (
    height +
    (terrain.elevation && height >= terrain.bankHeight - 0.01
      ? terrain.elevation.spacing === terrain.cellSize
        ? elevationCell(terrain.elevation, col, row, gx - col, gz - row)
        : groundElevation(x, z, map)
      : 0)
  );
}
export function baseGroundHeight(
  x: number,
  z: number,
  map: MapDefinition = industrialMap,
): number {
  return authoredMapHeight(x, z, map) - authoredTerrainCut(x, z, map);
}
// The same diagonal as terrainGeometry's two-meter surface quads. Interpolating
// this cached field keeps movement, ray queries and the coarse mesh in agreement.
export function groundElevation(
  x: number,
  z: number,
  map: MapDefinition,
): number {
  const field = map.terrain?.elevation;
  if (!field) return 0;
  return groundElevationField(x, z, field);
}
function groundElevationField(x: number, z: number, field: TerrainElevation) {
  const gx = (x - field.originX) / field.spacing,
    gz = (z - field.originZ) / field.spacing;
  if (gx < 0 || gz < 0 || gx > field.columns - 1 || gz > field.rows - 1)
    return 0;
  const ix = Math.min(field.columns - 2, Math.floor(gx)),
    iz = Math.min(field.rows - 2, Math.floor(gz)),
    tx = gx - ix,
    tz = gz - iz;
  return elevationCell(field, ix, iz, tx, tz);
}
function elevationCell(
  field: TerrainElevation,
  ix: number,
  iz: number,
  tx: number,
  tz: number,
) {
  const i = iz * field.columns + ix,
    a = field.values[i],
    b = field.values[i + 1],
    c = field.values[i + field.columns],
    d = field.values[i + field.columns + 1];
  return tx <= tz
    ? a + (d - c) * tx + (c - a) * tz
    : a + (b - a) * tx + (d - b) * tz;
}
export function authoredTerrainCut(
  x: number,
  z: number,
  map: MapDefinition,
): number {
  return sampleTerrainCuts(x, z, map.terrain?.relief);
}
export function groundHeight(
  x: number,
  z: number,
  map: MapDefinition = industrialMap,
): number {
  return Math.max(-0.9, baseGroundHeight(x, z, map) - terrainCut(x, z, map));
}
// Numeric lookup keeps repeated movement/ray queries cheap after large barrages.
// Sparse, serializable cuts remain authoritative; the cache expires per revision.
const runtimeCutGrids = new WeakMap<
  DestructionState,
  { revision: number; relief: TerrainRelief }
>();
// Official explosion edits can patch the existing numeric grid. Rebuilding it
// from every accumulated sparse sample for each shell grows with match age.
export function updateTerrainCutGrid(
  map: MapDefinition,
  previous: number,
  edits: Map<string, number>,
) {
  const state = map.destruction;
  const cached = state && runtimeCutGrids.get(state);
  if (!state || !cached || cached.revision !== previous || !cached.relief.grid)
    return;
  const grid = cached.relief.grid;
  for (const [key, depth] of edits) {
    const comma = key.indexOf(","),
      col = Number(key.slice(0, comma)) - grid.originX,
      row = Number(key.slice(comma + 1)) - grid.originZ;
    if (col >= 0 && row >= 0 && col < grid.columns && row < grid.rows)
      grid.values[row * grid.columns + col] = depth;
  }
  cached.revision = state.terrainRevision ?? state.revision;
}
export function terrainCut(x: number, z: number, map: MapDefinition): number {
  const state = map.destruction;
  const revision = state?.terrainRevision ?? state?.revision ?? 0;
  if (!state || !revision) return 0;
  let cached = runtimeCutGrids.get(state);
  if (!cached || cached.revision !== revision) {
    const originX = Math.floor(-map.width / 2 / terrainResolution) - 1;
    const originZ = Math.floor(-map.depth / 2 / terrainResolution) - 1;
    const columns = Math.ceil(map.width / terrainResolution) + 3;
    const rows = Math.ceil(map.depth / terrainResolution) + 3;
    const values = new Float32Array(columns * rows);
    for (const [key, depth] of Object.entries(state.cuts)) {
      const [ix, iz] = key.split(",").map(Number);
      const col = ix - originX,
        row = iz - originZ;
      if (col >= 0 && col < columns && row >= 0 && row < rows)
        values[row * columns + col] = depth;
    }
    cached = {
      revision,
      relief: {
        cuts: state.cuts,
        patches: state.patches,
        grid: { originX, originZ, columns, rows, values },
      },
    };
    runtimeCutGrids.set(state, cached);
  }
  return sampleTerrainCuts(x, z, cached.relief, map);
}
function sampleTerrainCuts(
  x: number,
  z: number,
  state?: TerrainRelief,
  runtimeMap?: MapDefinition,
): number {
  if (!state) return 0;
  const gx = x / terrainResolution,
    gz = z / terrainResolution;
  const ix = Math.floor(gx),
    iz = Math.floor(gz);
  const tx = gx - ix,
    tz = gz - iz;
  let a: number, b: number, c: number, d: number;
  if (state.grid) {
    const grid = state.grid,
      col = ix - grid.originX,
      row = iz - grid.originZ;
    if (col < 0 || row < 0 || col + 1 >= grid.columns || row + 1 >= grid.rows)
      return 0;
    const i = row * grid.columns + col;
    a = grid.values[i];
    b = grid.values[i + 1];
    c = grid.values[i + grid.columns];
    d = grid.values[i + grid.columns + 1];
  } else {
    if (
      !state.patches[
        `${Math.floor(x / terrainPatchSize)},${Math.floor(z / terrainPatchSize)}`
      ]
    )
      return 0;
    a = state.cuts[`${ix},${iz}`] ?? 0;
    b = state.cuts[`${ix + 1},${iz}`] ?? 0;
    c = state.cuts[`${ix},${iz + 1}`] ?? 0;
    d = state.cuts[`${ix + 1},${iz + 1}`] ?? 0;
  }
  // Untouched cells cannot need the eroded-cliff correction below. Most floor
  // and movement probes still land on four zero cuts, even late in a match.
  if (a === 0 && b === 0 && c === 0 && d === 0) return 0;
  const interpolate = (a: number, b: number, c: number, d: number) =>
    tx <= tz
      ? a + (d - c) * tx + (c - a) * tz
      : a + (b - a) * tx + (d - b) * tz;
  // Keep intact authored cliffs vertical. Once their upper samples erode,
  // interpolate final heights rather than cuts measured from different bases.
  // Otherwise a collapsed sample can have a 2.4 m lip a few microns beside it.
  const terrain = runtimeMap?.terrain;
  const cliffCell =
    terrain &&
    (((ix + 1) * terrainResolution + runtimeMap.width / 2) %
      terrain.cellSize ===
      0 ||
      ((iz + 1) * terrainResolution + runtimeMap.depth / 2) %
        terrain.cellSize ===
        0);
  if (
    runtimeMap &&
    (Math.max(a, b, c, d) - Math.min(a, b, c, d) > 0.3 ||
      (cliffCell && Math.max(a, b, c, d) > 0.15))
  ) {
    const bases = [
      [ix, iz],
      [ix + 1, iz],
      [ix, iz + 1],
      [ix + 1, iz + 1],
    ].map(([gx, gz]) =>
      baseGroundHeight(
        gx * terrainResolution,
        gz * terrainResolution,
        runtimeMap,
      ),
    );
    const low = Math.min(...bases);
    if (Math.max(...bases) - low > 0.3) {
      const heights = [a, b, c, d].map((cut, i) => {
        const dx = i % 2,
          dz = Math.floor(i / 2);
        // A partly cut bank can still stand above its neighboring floor/ramp.
        // Cap each shared sample to this cell's side of the authored cliff;
        // otherwise interpolation tries to raise the floor, then a query-time
        // clamp creates a curved lip that disagrees with the mesh triangles.
        const sideBase = baseGroundHeight(
          (ix + dx) * terrainResolution + (dx ? -0.00001 : 0.00001),
          (iz + dz) * terrainResolution + (dz ? -0.00001 : 0.00001),
          runtimeMap,
        );
        return Math.max(-0.9, Math.min(sideBase, bases[i] - cut));
      });
      if (bases.some((base, i) => base > low + 0.3 && heights[i] < base - 0.15))
        return Math.max(
          0,
          baseGroundHeight(x, z, runtimeMap) -
            interpolate(heights[0], heights[1], heights[2], heights[3]),
        );
    }
  }
  return interpolate(a, b, c, d);
}
const coverLookup = new WeakMap<
  MapDefinition,
  { boxes: Box[]; length: number; revision: number; cells: Map<string, Box[]> }
>();
const noCover: Box[] = [];
export function invalidateCoverLookup(map: MapDefinition): void {
  coverLookup.delete(map);
}
// Broad phase only. Expand cell membership by the largest ordinary movement
// radius so a point query needs no temporary set or neighboring-cell scans.
// Every candidate still goes through the original exact collision predicates.
function nearbyCover(
  x: number,
  z: number,
  radius: number,
  map: MapDefinition,
): Box[] {
  if (radius > 0.75 || map.boxes.length < 32) return map.boxes;
  const revision = map.destruction?.revision ?? 0;
  let lookup = coverLookup.get(map);
  if (
    !lookup ||
    lookup.boxes !== map.boxes ||
    lookup.length !== map.boxes.length ||
    lookup.revision !== revision
  ) {
    const cells = new Map<string, Box[]>();
    for (const b of map.boxes)
      for (
        let ix = Math.floor((b.x - b.w / 2 - 0.75) / 8);
        ix <= Math.floor((b.x + b.w / 2 + 0.75) / 8);
        ix++
      )
        for (
          let iz = Math.floor((b.z - b.d / 2 - 0.75) / 8);
          iz <= Math.floor((b.z + b.d / 2 + 0.75) / 8);
          iz++
        ) {
          const key = `${ix},${iz}`,
            bucket = cells.get(key);
          if (bucket) bucket.push(b);
          else cells.set(key, [b]);
        }
    lookup = { boxes: map.boxes, length: map.boxes.length, revision, cells };
    coverLookup.set(map, lookup);
  }
  return lookup.cells.get(`${Math.floor(x / 8)},${Math.floor(z / 8)}`) ?? noCover;
}
// Floors and stair treads are explicit solids, separate from the height field.
// Select only support reachable from the actor's current height: the same x/z
// can be a downstairs room or an upstairs landing, without snapping between.
export function supportHeight(x: number, z: number, map: MapDefinition, maxY = Infinity, radius = 0): number {
  let height = groundHeight(x, z, map);
  if (!map.buildings) return height;
  for (const b of nearbyCover(x, z, radius, map)) {
    const top = (b.baseY ?? 0) + b.h;
    const solidTop=b.walkable || (["masonry","wood","sandbag","barrier","rubble","concrete","container","log"].includes(b.kind) && b.architecture?.part!=="roof");
    if (solidTop && top <= maxY + 0.001 && top > height &&
      Math.abs(x - b.x) <= b.w / 2 + radius + 0.001 && Math.abs(z - b.z) <= b.d / 2 + radius + 0.001)
      height = top;
  }
  return height;
}
const coastFields = new WeakMap<Vec[], { columns: number; rows: number; values: Float32Array }>();
// Signed distance to the coastline in meters, positive on land. Baked once
// at half-meter resolution so movement queries stay a single array lookup.
export function coastDistance(x: number, z: number, map: MapDefinition): number {
  const coast = map.coast;
  if (!coast) return Infinity;
  let field = coastFields.get(coast);
  if (!field) {
    const columns = map.width * 2, rows = map.depth * 2, values = new Float32Array(columns * rows);
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      const px = -map.width / 2 + (col + 0.5) / 2, pz = -map.depth / 2 + (row + 0.5) / 2;
      let inside = false, nearest = Infinity;
      for (let i = 0, j = coast.length - 1; i < coast.length; j = i++) {
        const a = coast[i], b = coast[j];
        if ((a.z > pz) !== (b.z > pz) && px < ((b.x - a.x) * (pz - a.z)) / (b.z - a.z) + a.x) inside = !inside;
        const dx = b.x - a.x, dz = b.z - a.z;
        const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / (dx * dx + dz * dz || 1)));
        nearest = Math.min(nearest, Math.hypot(px - a.x - dx * t, pz - a.z - dz * t));
      }
      values[row * columns + col] = inside ? nearest : -nearest;
    }
    coastFields.set(coast, (field = { columns, rows, values }));
  }
  const col = Math.floor((x + map.width / 2) * 2), row = Math.floor((z + map.depth / 2) * 2);
  if (col < 0 || row < 0 || col >= field.columns || row >= field.rows) return -Infinity;
  return field.values[row * field.columns + col];
}
// The rectangular map edge and, where authored, the coastline.
export function outOfBounds(x: number, z: number, margin: number, map: MapDefinition): boolean {
  return Math.abs(x) > map.width / 2 - margin || Math.abs(z) > map.depth / 2 - margin ||
    (!!map.coast && coastDistance(x, z, map) < margin);
}
export function bodyBlocked(x: number, z: number, feet: number, r: number, map: MapDefinition, bodyHeight = 1.8): boolean {
  return outOfBounds(x, z, 1 + r, map) ||
    nearbyCover(x, z, r, map).some(b => Math.abs(x-b.x) < b.w/2+r && Math.abs(z-b.z) < b.d/2+r &&
      (b.baseY ?? 0) + b.h > feet + (b.walkable ? 0.23 : 0.025) && (b.baseY ?? 0) < feet + bodyHeight - 0.025);
}
export function blocked(
  x: number,
  z: number,
  r = 0.5,
  map: MapDefinition = industrialMap,
): boolean {
  if (map.buildings) return bodyBlocked(x, z, groundHeight(x, z, map), r, map);
  return (
    outOfBounds(x, z, 1 + r, map) ||
    nearbyCover(x, z, r, map).some(
      (b) =>
        Math.abs(x - b.x) < b.w / 2 + r &&
        Math.abs(z - b.z) < b.d / 2 + r &&
        (!b.supports || (b.baseY ?? 0) <= groundHeight(x, z, map) + 1.8),
    )
  );
}
// Keep the actor's actual vertical position when a tread/floor ends. Only
// small grounded steps can adjust it immediately; larger drops enter gravity.
function moveAcrossSupports(p:Vec & {fall?:unknown;hop?:unknown;crouched?:boolean},d:Vec,map:MapDefinition):Vec {
  let x=p.x,z=p.z,feet=p.y??groundHeight(x,z,map);
  const floor=supportHeight(x,z,map,feet+.23,.45);
  let airborne=!!(p.hop||p.fall)||feet-floor>.23;
  if(!airborne)feet=floor;
  const n=Math.max(1,Math.ceil(Math.hypot(d.x,d.z)/.15));
  const area=(b:Box,nx:number,nz:number)=>Math.max(0,b.w/2+.45-Math.abs(nx-b.x))*Math.max(0,b.d/2+.45-Math.abs(nz-b.z));
  const advance=(nx:number,nz:number)=>{
    const next=supportHeight(nx,nz,map,feet+(airborne?0:.23),.45);
    const targetFeet=!airborne&&next>=feet-.23?next:feet;
    if(outOfBounds(nx,nz,1.45,map))return;
    if(map.terrain?.banks&&!airborne&&next>feet+.00001 && groundHeight(x+Math.sign(nx-x)*.15,z+Math.sign(nz-z)*.15,map)-feet>.23)return;
    const collision=nearbyCover(nx,nz,.45,map).some(b=>{
      const overlap=area(b,nx,nz);
      if(!overlap || (b.baseY??0)+b.h<=targetFeet+.025 || (b.baseY??0)>=targetFeet+(p.crouched?1.25:1.8)-.025)return false;
      if(b.walkable && (b.baseY??0)+b.h<=targetFeet+.23)return false;
      // A survivor of a previously embedded state may move OUT of a tread;
      // this never permits entry into another solid or through a brick wall.
      return !(b.walkable && area(b,x,z)>0 && overlap<area(b,x,z)-.000001);
    });
    if(collision)return;
    x=nx;z=nz;
    if(!airborne&&next<feet-.23)airborne=true;
    feet=targetFeet;
  };
  for(let i=0;i<n;i++){advance(x+d.x/n,z);advance(x,z+d.z/n);}
  return {x,z,y:feet};
}
export function moveOnMap(
  p: Vec & { y?: number; fall?: unknown; hop?: { velocity: number } | null; crouched?: boolean },
  d: Vec,
  map: MapDefinition = industrialMap,
): Vec {
  if(map.buildings)return moveAcrossSupports(p,d,map);
  const steps = Math.max(1, Math.ceil(Math.hypot(d.x, d.z) / 0.15));
  let x = p.x,
    z = p.z;
  let support = supportHeight(x, z, map, (p.y ?? groundHeight(x,z,map)) + 0.23);
  const airborne = p.y !== undefined && p.y > support + 0.23;
  const canMove = (nx: number, nz: number) => {
    const ground = support,
      next = supportHeight(nx, nz, map, (airborne ? p.y! : ground) + 0.23);
    const feet = airborne ? p.y! : ground;
    // A rounded bank is continuous: checking only this frame's small delta
    // would let a slow soldier creep up a wall that stops a sprinting one.
    // Keep the same 15 cm step budget at every movement speed.
    const uphill =
      map.terrain?.banks &&
      !airborne &&
      next > ground + 0.00001 &&
      groundHeight(
        x + Math.sign(nx - x) * 0.15,
        z + Math.sign(nz - z) * 0.15,
        map,
      ) -
        ground >
        0.23;
    if (
      uphill ||
      next - feet > 0.23 ||
      outOfBounds(nx, nz, 1.45, map)
    )
      return false;
    return !nearbyCover(nx, nz, 0.45, map).some((b) => {
      if (
        Math.abs(nx - b.x) >= b.w / 2 + 0.45 ||
        Math.abs(nz - b.z) >= b.d / 2 + 0.45
      )
        return false;
      if (b.supports && feet + 1.8 < (b.baseY ?? 0)) return false;
      if (b.id?.startsWith("lining-")) {
        // Step over the recessed timber crest, then fall beside its earth face.
        if ((p.y ?? ground) >= (b.baseY ?? 0) + b.h - 0.01) return false;
        if (
          (p.fall || (p.hop && p.hop.velocity < 0)) &&
          (p.y ?? ground) > next + 0.23
        )
          return false;
        const overlapping =
          Math.abs(x - b.x) < b.w / 2 + 0.45 &&
          Math.abs(z - b.z) < b.d / 2 + 0.45;
        if (
          overlapping &&
          Math.hypot(nx - b.x, nz - b.z) > Math.hypot(x - b.x, z - b.z)
        )
          return false;
      }
      return true;
    });
  };
  for (let i = 0; i < steps; i++) {
    const nx = x + d.x / steps;
    if (canMove(nx, z)) { x = nx; support = supportHeight(x,z,map,(airborne ? p.y! : support)+0.23); }
    const nz = z + d.z / steps;
    if (canMove(x, nz)) { z = nz; support = supportHeight(x,z,map,(airborne ? p.y! : support)+0.23); }
  }
  return { x, z };
}
export function walkSegment(
  a: Vec,
  b: Vec,
  map: MapDefinition = industrialMap,
): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 0.25));
  let height = map.buildings ? a.y ?? groundHeight(a.x, a.z, map) : groundHeight(a.x, a.z, map);
  for (let i = 0; i <= n; i++) {
    const x = a.x + ((b.x - a.x) * i) / n,
      z = a.z + ((b.z - a.z) * i) / n;
    const next = supportHeight(x, z, map, height + 0.23, map.buildings ? .45 : 0);
    if ((map.buildings ? bodyBlocked(x,z,next,0.6,map) : blocked(x,z,0.6,map)) || Math.abs(next - height) > 0.23) return false;
    height = next;
  }
  return !map.buildings || Math.abs(height - (b.y ?? groundHeight(b.x,b.z,map))) < 0.23;
}
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.z - b.z);

// Low solid cover uses a vault with an explicitly clear far-side landing.
function coverVaultRoute(p:Vec,direction:Vec,map:MapDefinition):{landing:Vec;edge:Vec;vault:true}|null {
  const length=Math.hypot(direction.x,direction.z);if(length<.1)return null;
  const dx=direction.x/length,dz=direction.z/length,from=p.y??groundHeight(p.x,p.z,map);
  const hits:{b:Box;near:number;far:number}[]=[];
  for(const b of nearbyCover(p.x+dx,p.z+dz,2.8,map)) {
    if(["tree","brush","wire"].includes(b.kind) || (b.baseY??0)>from+1.8 || (b.baseY??0)+b.h<from+.26)continue;
    let near=-Infinity,far=Infinity;
    for(const [a,c,half,v] of [[p.x,b.x,b.w/2,dx],[p.z,b.z,b.d/2,dz]]) {
      if(Math.abs(v)<.0001){if(Math.abs(a-c)>half){near=Infinity;break;}continue;}
      const t1=(c-half-a)/v,t2=(c+half-a)/v;
      near=Math.max(near,Math.min(t1,t2));far=Math.min(far,Math.max(t1,t2));
    }
    if(near<=far && near>=-.1 && near<=1.5 && far>0)hits.push({b,near,far});
  }
  hits.sort((a,b)=>a.near-b.near);
  const first=hits[0];if(!first)return null;
  const top=(first.b.baseY??0)+first.b.h;
  if(top-from>1.6)return null;
  for(let distance=Math.max(first.far+.8,first.near+1);distance<=3.6;distance+=.15) {
    const x=p.x+dx*distance,z=p.z+dz*distance;
    const y=supportHeight(x,z,map,top+.05);
    if(y-from>1.6 || from-y>1 || bodyBlocked(x,z,y,.45,map,1.98))continue;
    if([[0,0],[-.45,0],[.45,0],[0,-.45],[0,.45]].some(([ox,oz])=>
      Math.abs(supportHeight(x+ox,z+oz,map,y+.23)-y)>.23))continue;
    return {landing:{x,z,y},edge:{x:p.x+dx*first.near,z:p.z+dz*first.near,y:top},vault:true};
  }
  return null;
}

// Preserve the terrain ledge route, with a separate checked route for low cover.
export function mantleRoute(
  p: Vec,
  direction: Vec,
  map: MapDefinition,
): { landing: Vec; edge: Vec; vault?: boolean } | null {
  const cover=coverVaultRoute(p,direction,map);
  if(cover)return cover;
  if (!map.terrain || (p.y!==undefined && Math.abs(p.y-groundHeight(p.x,p.z,map))>.24)) return null;
  const length = Math.hypot(direction.x, direction.z);
  if (length < 0.1) return null;
  const dx = direction.x / length,
    dz = direction.z / length;
  const fromHeight = groundHeight(p.x, p.z, map);
  let previousHeight = fromHeight;
  for (let distance = 0.15; distance <= 1.35; distance += 0.15) {
    const x = p.x + dx * distance,
      z = p.z + dz * distance;
    if (blocked(x, z, 0.45, map)) return null;
    const nextHeight = groundHeight(x, z, map);
    const step = nextHeight - previousHeight;
    previousHeight = nextHeight;
    const rise = nextHeight - fromHeight;
    // Walkable slopes are not ledges; Space on a ramp should hop normally.
    if (Math.abs(step) < 0.3) continue;
    if (rise <= 0 || rise > 2.5) return null;
    const landingReach = map.terrain.banks ? 1.35 : 0.85;
    const landing = { x: x + dx * landingReach, z: z + dz * landingReach };
    const height = groundHeight(landing.x, landing.z, map);
    if (
      map.terrain.banks
        ? height - fromHeight <= 0 || height - fromHeight > 2.5
        : Math.abs(height - fromHeight - rise) > 0.12
    )
      return null;
    // Leave a full soldier footprint on a stable landing surface.
    for (const [ox, oz] of [
      [0, 0],
      [-0.45, 0],
      [0.45, 0],
      [0, -0.45],
      [0, 0.45],
    ])
      if (
        blocked(landing.x + ox, landing.z + oz, 0.45, map) ||
        Math.abs(groundHeight(landing.x + ox, landing.z + oz, map) - height) >
          0.12
      )
        return null;
    return { landing, edge: { x, z } };
  }
  return null;
}

export function mantleLanding(
  p: Vec,
  direction: Vec,
  map: MapDefinition,
): Vec | null {
  return mantleRoute(p, direction, map)?.landing ?? null;
}
