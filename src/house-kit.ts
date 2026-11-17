import type { Box, KitRuntime, MapDefinition, Vec } from "./map";

// Reusable buildings assembled from 2.5 m bays (docs/HOUSE_KIT.md). A plan
// describes rooms per level; walls, doors, floors, stairs and supports are
// derived from it. Every visible structural piece is also its collision box.

export const kitBay = 2.5;
export const kitStory = 3.4;
export const kitStairSteps = 16;
export const kitStairRun = (kitBay * 2) / kitStairSteps;
export const kitStairRise = kitStory / kitStairSteps;
export const kitOpening = kitBay / 2;
export const kitRoofPitch = 0.3;
const pierWidth = (kitBay - kitOpening) / 2;
const treadThickness = 0.25;
const floorThickness = 0.22;

export type KitSide = "north" | "south" | "west" | "east";
export type KitRoomType = "shop" | "kitchen" | "hall" | "landing" | "parlour" | "bedroom" | "workroom" |
  "garret" | "barn" | "store" | "stair" | "void";
type Feature = NonNullable<NonNullable<Box["architecture"]>["feature"]>;
// Cells are named like the plans in docs/HOUSE_KIT.md: column letter from the
// west, row number from the front (north) facade, e.g. "B3".
export type KitCell = string;
export type KitEdge = [KitCell, KitCell];
export interface KitRoom { type: KitRoomType; name: string; strongpoint?: boolean }
export interface KitOpening { at: KitCell; side: KitSide; kind: "window" | "door" | "double" }
export interface KitFurniture { at: KitCell; feature: Feature; w: number; d: number; h: number; dx?: number; dz?: number }
export interface KitLevel {
  // One string per row, front first; one character per bay naming its room.
  cells: string[];
  rooms: Record<string, KitRoom>;
  stone?: KitEdge[];
  open?: KitEdge[];
  doors?: KitEdge[];
  openings?: KitOpening[];
  furniture?: KitFurniture[];
}
// A flight climbs from the far edge of `at` toward `climb`. Sixteen steps
// span two bays and a full story; eight steps span one bay and half a story.
export interface KitFlight { at: KitCell; level: number; climb: KitSide; steps: 8 | 16; from: number; solid?: boolean; route?: string }
export interface KitLanding { cells: KitCell[]; level: number; height: number; solid?: boolean; route?: string }
export interface KitPlan {
  id: string;
  name: string;
  style?: string;
  bays: { x: number; z: number };
  levels: KitLevel[];
  mansard?: boolean;
  // Plank sheds and barns: timber facades that grenades breach and rounds pass.
  exterior?: "stone" | "timber";
  party?: KitSide[];
  paved?: KitRoomType[];
  flights: KitFlight[];
  landings?: KitLanding[];
  chimneys?: { at: KitCell; side: KitSide }[];
  // Timber posts at bay corners, given as grid points [column line, row line].
  // Each stands floor to ceiling on its levels and carries what rests on it.
  posts?: { at: [number, number]; levels?: number[] }[];
  wings: { id: string; from: KitCell; to: KitCell }[];
}
export interface KitPlacement {
  id: string;
  name?: string;
  x: number;
  z: number;
  baseY: number;
  // Quarter turns. The ridge always runs north-south in world space.
  turns?: 0 | 1 | 2 | 3;
  flag?: string;
  variant?: number;
  // Palette for architecture-geometry.ts; defaults to the plan id's palette.
  style?: string;
  // A porch canopy and painted name over one ground-floor exterior door.
  entrance?: { at: KitCell; side: KitSide; sign?: string; porch?: boolean };
  // Omit this plan side's party wall and rest on a neighbour's instead.
  borrow?: { side: KitSide; edges: KitSharedEdges; owner: string };
}
// Pieces of one side's party wall, keyed "level:row index", for a neighbour to share.
export type KitSharedEdges = Record<string, EdgePieces>;
interface EdgePieces { bottom: string[]; middle: string[]; top: string[] }

type Material = "stone" | "party" | "timber" | "mansard";
interface Edge {
  key: string;
  axis: "x" | "z";
  line: number;
  index: number;
  material: Material;
  exterior?: KitSide;
  opening?: "window" | "door" | "double";
  cells: [number, number][];
}
const side = (s: KitSide) => ({ north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] } as const)[s];
export function parseCell(label: KitCell) {
  const col = label.charCodeAt(0) - 65, row = Number(label.slice(1)) - 1;
  if (!(col >= 0) || !(row >= 0) || !Number.isInteger(row)) throw new Error("Bad kit cell " + label);
  return { col, row };
}
const edgeKey = (axis: "x" | "z", line: number, index: number) => axis + ":" + line + ":" + index;
export function kitEdgeBetween(a: KitCell, b: KitCell) {
  const p = parseCell(a), q = parseCell(b);
  if (p.row === q.row && Math.abs(p.col - q.col) === 1) return edgeKey("z", Math.max(p.col, q.col), p.row);
  if (p.col === q.col && Math.abs(p.row - q.row) === 1) return edgeKey("x", Math.max(p.row, q.row), p.col);
  throw new Error("Kit cells " + a + " and " + b + " are not neighbours");
}
export function kitExteriorEdge(at: KitCell, s: KitSide) {
  const { col, row } = parseCell(at);
  return s === "north" ? edgeKey("x", row, col) : s === "south" ? edgeKey("x", row + 1, col) :
    s === "west" ? edgeKey("z", col, row) : edgeKey("z", col + 1, row);
}
const tints = ["#a5947d", "#b8a68c", "#9b8272", "#a29b87"];
const centralFurniture: Feature[] = ["table", "desk", "counter", "workbench", "stall"];

export interface KitBuilt {
  parts: Box[];
  building: NonNullable<MapDefinition["buildings"]>[number];
  // Each side's party wall, for a neighbour to share instead of duplicating it.
  party: Partial<Record<KitSide, KitSharedEdges>>;
}

export function buildKitHouse(map: MapDefinition, plan: KitPlan, at: KitPlacement): KitBuilt {
  const W = plan.bays.x * kitBay, D = plan.bays.z * kitBay, turns = at.turns ?? 0;
  const levels = plan.levels.length, top = levels * kitStory, base = at.baseY;
  const tint = tints[(at.variant ?? 0) % tints.length], style = at.style ?? plan.style ?? plan.id;
  const pieceId = (name: string) => "kit-" + at.id + "-" + name;
  // Plan coordinates: u east, v south, from the footprint centre.
  const world = (u: number, v: number) => turns === 0 ? { x: at.x + u, z: at.z + v } : turns === 1 ? { x: at.x - v, z: at.z + u } :
    turns === 2 ? { x: at.x - u, z: at.z - v } : { x: at.x + v, z: at.z - u };
  const turn = (nu: number, nv: number) => turns === 0 ? [nu, nv] : turns === 1 ? [-nv, nu] : turns === 2 ? [-nu, -nv] : [nv, -nu];
  const odd = turns % 2 === 1;
  const worldW = odd ? D : W, worldD = odd ? W : D;
  const parts: Box[] = [], local = new Map<string, { u: number; v: number; w: number; d: number }>();
  const add = (name: string, u: number, v: number, w: number, d: number, y: number, h: number,
    part: NonNullable<Box["architecture"]>["part"], level: number, kind: Box["kind"], maxHp: number,
    extra: Partial<NonNullable<Box["architecture"]>> = {}) => {
    const p = world(u, v);
    const b: Box = { id: pieceId(name), x: p.x, z: p.z, w: odd ? d : w, d: odd ? w : d, h, baseY: base + y, kind, maxHp,
      landmark: at.flag, architecture: { building: at.id, part, level, tint, style, ...extra } };
    parts.push(b);
    local.set(b.id!, { u, v, w, d });
    return b;
  };
  const cellCenter = (col: number, row: number) => ({ u: -W / 2 + (col + 0.5) * kitBay, v: -D / 2 + (row + 0.5) * kitBay });
  const runtime: KitRuntime = { plan: plan.id, parts: [], wings: [], routes: [[]], floors: [[]], survivors: [], doorways: [], entrances: [], fallen: {} };
  const routeGroups: Map<string, string[]>[] = [];
  const routeOf = (level: number, name = "main") => {
    const groups = (routeGroups[level + 1] ??= new Map());
    if (!groups.has(name)) groups.set(name, []);
    return groups.get(name)!;
  };
  const navigation = (map.navigationPoints ??= []);
  const building = { id: at.id, name: at.name ?? plan.name, x: at.x, z: at.z, w: worldW, d: worldD, stories: levels,
    baseY: base, flag: at.flag, posts: [] as Vec[], kit: runtime };
  const party: KitBuilt["party"] = {};
  const levelEdges: Map<string, EdgePieces>[] = [];
  const floorAt: Map<string, string>[] = [];
  const postAt: Map<string, string>[] = [];
  const postsAround = (level: number, col: number, row: number) => [[col, row], [col + 1, row], [col, row + 1], [col + 1, row + 1]]
    .map(([c, r]) => postAt[level]?.get(c + "," + r)).filter((id): id is string => !!id);
  const roomType = (level: number, col: number, row: number) => {
    const key = plan.levels[level].cells[row]?.[col];
    const room = key === undefined ? undefined : plan.levels[level].rooms[key];
    if (!room) throw new Error(plan.id + " level " + level + " has no room at " + String.fromCharCode(65 + col) + (row + 1));
    return room.type;
  };

  for (let level = 0; level < levels; level++) {
    const spec = plan.levels[level], y0 = level * kitStory;
    if (spec.cells.length !== plan.bays.z || spec.cells.some((r) => r.length !== plan.bays.x))
      throw new Error(plan.id + " level " + level + " cells do not match its footprint");
    const mansard = !!plan.mansard && level === levels - 1;
    const edges = new Map<string, Edge>();
    const exterior = (axis: "x" | "z", line: number, index: number, s: KitSide, cell: [number, number]) => {
      const owned = at.borrow?.side === s;
      if (owned) return;
      edges.set(edgeKey(axis, line, index), { key: edgeKey(axis, line, index), axis, line, index, exterior: s, cells: [cell],
        material: plan.party?.includes(s) ? "party" : mansard ? "mansard" : plan.exterior === "timber" ? "timber" : "stone" });
    };
    for (let col = 0; col < plan.bays.x; col++) {
      exterior("x", 0, col, "north", [col, 0]);
      exterior("x", plan.bays.z, col, "south", [col, plan.bays.z - 1]);
    }
    for (let row = 0; row < plan.bays.z; row++) {
      exterior("z", 0, row, "west", [0, row]);
      exterior("z", plan.bays.x, row, "east", [plan.bays.x - 1, row]);
    }
    const listed = (list: KitEdge[] | undefined) => new Set((list ?? []).map(([a, b]) => kitEdgeBetween(a, b)));
    const stone = listed(spec.stone), open = listed(spec.open), doors = listed(spec.doors);
    for (const key of [...stone, ...open, ...doors]) {
      const [axis, line, index] = key.split(":");
      const p = axis === "z" ? [Number(line) - 1, Number(index), Number(line), Number(index)] : [Number(index), Number(line) - 1, Number(index), Number(line)];
      if (spec.cells[p[1]][p[0]] === spec.cells[p[3]][p[2]] && !open.has(key))
        throw new Error(plan.id + " level " + level + " lists " + key + " inside one room");
    }
    for (let row = 0; row < plan.bays.z; row++) for (let col = 0; col < plan.bays.x; col++) {
      const here = spec.cells[row][col];
      for (const [dc, dr] of [[1, 0], [0, 1]]) {
        const c = col + dc, r = row + dr;
        if (c >= plan.bays.x || r >= plan.bays.z || spec.cells[r][c] === here) continue;
        const key = dc ? edgeKey("z", c, row) : edgeKey("x", r, col);
        if (open.has(key)) continue;
        edges.set(key, { key, axis: dc ? "z" : "x", line: dc ? c : r, index: dc ? row : col, cells: [[col, row], [c, r]],
          material: stone.has(key) ? "stone" : "timber", ...(doors.has(key) ? { opening: "door" as const } : {}) });
      }
    }
    for (const key of doors) if (!edges.get(key)) throw new Error(plan.id + " door " + key + " has no wall");
    for (const o of spec.openings ?? []) {
      const e = edges.get(kitExteriorEdge(o.at, o.side));
      if (!e || e.material === "party") throw new Error(plan.id + " opening " + o.at + " " + o.side + " is not on a facade");
      e.opening = o.kind;
    }
    // Floors come before this level's walls, which may stand on them.
    const floors = new Map<string, string>();
    floorAt[level] = floors;
    if (level > 0) runtime.floors[level] = [];
    for (let row = 0; row < plan.bays.z; row++) for (let col = 0; col < plan.bays.x; col++) {
      const type = roomType(level, col, row), c = cellCenter(col, row);
      if (level > 0 && (type === "void" || type === "stair")) continue;
      const paved = level === 0 && (plan.paved ?? []).includes(type);
      const floor = level === 0
        ? add("floor-0-" + col + "-" + row, c.u, c.v, kitBay, kitBay, -0.12, 0.14, "floor", 0, paved ? "concrete" : "wood", paved ? 200 : 140)
        : add("floor-" + level + "-" + col + "-" + row, c.u, c.v, kitBay, kitBay, y0 - floorThickness, floorThickness, "floor", level, "wood", 140);
      floor.walkable = true;
      if (paved) floor.architecture!.tint = "#8a8170";
      else if (level === 0) floor.architecture!.tint = "#7c674e";
      floors.set(col + "," + row, floor.id!);
      if (level > 0) {
        runtime.floors[level].push(floor.id!);
        const below = levelEdges[level - 1];
        floor.supports = [kitExteriorEdge(String.fromCharCode(65 + col) + (row + 1), "north"),
          kitExteriorEdge(String.fromCharCode(65 + col) + (row + 1), "south"),
          kitExteriorEdge(String.fromCharCode(65 + col) + (row + 1), "west"),
          kitExteriorEdge(String.fromCharCode(65 + col) + (row + 1), "east")].flatMap((key) => below.get(key)?.top ?? []);
        if (at.borrow) floor.supports.push(...borrowedTop(at.borrow, level - 1, col, row, plan));
        floor.supports.push(...postsAround(level - 1, col, row));
      }
      if (level > 0) building.posts.push({ ...world(c.u, c.v), y: base + y0 });
    }
    // Joists span the short way across the footprint.
    const joistsAlongU = plan.bays.x <= plan.bays.z;
    if (level > 0) for (const [cell, id] of floors) {
      const [col, row] = cell.split(",").map(Number);
      const span = (joistsAlongU ? [[col - 1, row], [col + 1, row]] : [[col, row - 1], [col, row + 1]])
        .map(([c, r]) => floors.get(c + "," + r)).filter((s): s is string => !!s);
      if (span.length) parts.find((p) => p.id === id)!.spanSupports = span;
    }
    // Walls: three rows per bay, or piers and a lintel around a half-bay opening.
    const pieces = new Map<string, EdgePieces>();
    levelEdges[level] = pieces;
    for (const e of edges.values()) {
      const thickness = e.material === "timber" ? 0.16 : e.material === "mansard" ? 0.3 : 0.44;
      const kind: Box["kind"] = e.material === "timber" || e.material === "mansard" ? "wood" : "masonry";
      const hp = e.material === "timber" || e.material === "mansard" ? 60 : e.exterior && e.material === "stone" ? 180 : 240;
      const centre = e.axis === "x" ? { u: -W / 2 + (e.index + 0.5) * kitBay, v: -D / 2 + e.line * kitBay }
        : { u: -W / 2 + e.line * kitBay, v: -D / 2 + (e.index + 0.5) * kitBay };
      const set: EdgePieces = { bottom: [], middle: [], top: [] };
      pieces.set(e.key, set);
      const last = e.axis === "x" ? plan.bays.x - 1 : plan.bays.z - 1;
      const piece = (name: string, t0: number, t1: number, ya: number, yb: number, row: 0 | 1 | 2, extra: Partial<NonNullable<Box["architecture"]>> = {}) => {
        const t = (t0 + t1) / 2, length = t1 - t0;
        const u = e.axis === "x" ? centre.u + t : centre.u, v = e.axis === "x" ? centre.v : centre.v + t;
        const b = add("wall-" + level + "-" + e.key.replace(/:/g, "-") + "-" + name, u, v,
          e.axis === "x" ? length : thickness, e.axis === "x" ? thickness : length, y0 + ya, yb - ya, "wall", level, kind, hp,
          { wallRow: row, bearing: row === 0 && (e.material === "stone" || e.material === "party"), ...extra });
        if (e.material === "mansard") b.architecture!.mansard = true;
        if (e.exterior) {
          const [nu, nv] = side(e.exterior), [nx, nz] = turn(nu, nv);
          b.architecture!.exterior = (b.w > b.d ? Math.sign(nz) : Math.sign(nx)) as -1 | 1;
          const axisSign = e.axis === "x" ? turn(1, 0) : turn(0, 1), sign = axisSign[0] + axisSign[1];
          if (e.index === 0 && t0 <= -kitBay / 2 + 0.01) b.architecture!.corner = (-sign) as -1 | 1;
          if (e.index === last && t1 >= kitBay / 2 - 0.01) b.architecture!.corner = sign as -1 | 1;
        }
        return b.id!;
      };
      const exteriorOpening = e.exterior ? e.opening : undefined;
      if (!e.opening) {
        set.bottom.push(piece("0", -kitBay / 2, kitBay / 2, 0, 1, 0));
        set.middle.push(piece("1", -kitBay / 2, kitBay / 2, 1, 2.25, 1));
        set.top.push(piece("2", -kitBay / 2, kitBay / 2, 2.25, kitStory, 2));
      } else if (e.opening === "double") {
        set.top.push(piece("2", -kitBay / 2, kitBay / 2, 2.25, kitStory, 2, { opening: "door" }));
      } else {
        const opening = exteriorOpening ? { opening: e.opening, openingWidth: kitOpening } : {};
        for (const [name, t0, t1] of [["pier-a", -kitBay / 2, -kitBay / 2 + pierWidth], ["pier-b", kitBay / 2 - pierWidth, kitBay / 2]] as const) {
          const id = piece(name, t0, t1, 0, 2.25, 0);
          set.bottom.push(id); set.middle.push(id);
        }
        if (e.opening === "window") set.bottom.push(piece("sill", -kitOpening / 2, kitOpening / 2, 0, 1, 0, exteriorOpening ? { opening: "window" } : {}));
        set.top.push(piece("2", -kitBay / 2, kitBay / 2, 2.25, kitStory, 2, opening));
      }
      if (level === 0 && at.entrance?.sign && e.key === kitExteriorEdge(at.entrance.at, at.entrance.side))
        parts.find((p) => p.id === set.top[0])!.architecture!.sign = at.entrance.sign;
      if (e.opening === "door" || e.opening === "double") {
        const [nu, nv] = e.axis === "x" ? [0, 1] : [1, 0];
        for (const n of [-1, 0, 1]) {
          const p = { ...world(centre.u + nu * n, centre.v + nv * n), ...(level ? { y: base + y0 } : {}) };
          navigation.push(p);
          if (n) runtime.doorways.push({ ...world(centre.u + nu * n * 1.3, centre.v + nv * n * 1.3), y: base + y0 });
        }
      }
      if (e.material === "party" && e.exterior) (party[e.exterior] ??= {})[level + ":" + e.index] = set;
      if (level === 0 && e.exterior && (e.opening === "door" || e.opening === "double")) {
        const [nu, nv] = side(e.exterior);
        runtime.entrances.push({ ...world(centre.u + nu * 0.7, centre.v + nv * 0.7) });
      }
    }
    // Posts stand on the floor (or the post below) and reach the floor above.
    postAt[level] = new Map();
    for (const post of plan.posts ?? []) {
      if (post.levels && !post.levels.includes(level)) continue;
      const [c, r] = post.at, u = -W / 2 + c * kitBay, v = -D / 2 + r * kitBay;
      const height = level === levels - 1 ? kitStory : kitStory - floorThickness;
      const b = add("post-" + level + "-" + c + "-" + r, u, v, 0.3, 0.3, y0, height, "detail", level, "wood", 120);
      b.architecture!.tint = "#5f4a35";
      if (level > 0) {
        const below = postAt[level - 1].get(c + "," + r);
        const around = [[c - 1, r - 1], [c, r - 1], [c - 1, r], [c, r]].map(([cc, rr]) => floors.get(cc + "," + rr)).filter((id): id is string => !!id);
        b.supports = [...(below ? [below] : []), ...around];
      }
      postAt[level].set(c + "," + r, b.id!);
    }
    // Rows stand on the row below in their own bay or a neighbouring one.
    const neighbours = (e: Edge, row: "bottom" | "middle") => [-1, 0, 1].flatMap((n) => pieces.get(edgeKey(e.axis, e.line, e.index + n))?.[row] ?? []);
    for (const e of edges.values()) {
      const set = pieces.get(e.key)!;
      const assign = (ids: string[], supports: string[]) => {
        for (const id of ids) {
          const b = parts.find((p) => p.id === id)!;
          const own = supports.filter((s) => s !== id);
          if (b.supports) b.supports.push(...own.filter((s) => !b.supports!.includes(s)));
          else if (own.length) b.supports = own;
        }
      };
      const middleOnly = set.middle.filter((id) => !set.bottom.includes(id));
      assign(middleOnly, neighbours(e, "bottom"));
      assign(set.top, neighbours(e, "middle").length ? neighbours(e, "middle") : neighbours(e, "bottom"));
      if (level > 0) {
        const below = levelEdges[level - 1].get(e.key)?.top ?? [];
        const onFloors = e.cells.map(([c, r]) => floors.get(c + "," + r)).filter((s): s is string => !!s);
        assign(set.bottom, [...below, ...onFloors]);
      }
    }
  }
  // Stairs: solid ground-story flights; stacked upper flights get thin treads.
  for (const [n, f] of plan.flights.entries()) {
    const { col, row } = parseCell(f.at), [du, dv] = side(f.climb), c = cellCenter(col, row);
    const run = f.steps === 16 ? kitStairRun : kitBay / 8, rise = kitStairRise, y0 = f.level * kitStory + f.from;
    const start = { u: c.u - du * kitBay / 2, v: c.v - dv * kitBay / 2 };
    const flanking = flightFlanks(f, levelEdges[f.level]);
    for (let i = 0; i < f.steps; i++) {
      const u = start.u + du * (i + 0.5) * run, v = start.v + dv * (i + 0.5) * run, height = y0 + rise * (i + 1);
      const tread = f.solid
        ? add("stair-" + n + "-" + i, u, v, du ? run : 2, du ? 2 : run, f.level * kitStory, height - f.level * kitStory, "stair", f.level, "wood", 200)
        : add("stair-" + n + "-" + i, u, v, du ? run : 2, du ? 2 : run, height - treadThickness, treadThickness, "stair", f.level, "wood", 200);
      tread.walkable = true;
      if (!f.solid) tread.supports = [...flanking];
      routeOf(f.level, f.route).push(tread.id!);
      navigation.push({ ...world(u, v), y: base + height });
    }
  }
  for (const [n, l] of (plan.landings ?? []).entries()) for (const cell of l.cells) {
    const { col, row } = parseCell(cell), c = cellCenter(col, row), y = l.level * kitStory;
    const slab = l.solid
      ? add("landing-" + n + "-" + cell, c.u, c.v, kitBay - 0.44, kitBay - 0.44, y, l.height, "stair", l.level, "wood", 200)
      : add("landing-" + n + "-" + cell, c.u, c.v, kitBay - 0.44, kitBay - 0.44, y + l.height - floorThickness, floorThickness, "floor", l.level, "wood", 200);
    slab.walkable = true;
    if (!l.solid) slab.supports = cellWalls(col, row, levelEdges[l.level]);
    routeOf(l.level, l.route).push(slab.id!);
    navigation.push({ ...world(c.u, c.v), y: base + y + l.height });
  }
  for (let level = 1; level < levels; level++) runtime.routes[level] = [...(routeGroups[level]?.values() ?? [])];
  // Thin treads also rest on the landings of their own route.
  for (const groups of routeGroups) for (const route of groups?.values() ?? []) {
    const landings = route.filter((id) => id.includes("-landing-"));
    for (const id of route) {
      const b = parts.find((p) => p.id === id)!;
      if (b.architecture?.part === "stair" && b.supports) b.supports.push(...landings.filter((l) => !b.supports!.includes(l)));
    }
  }
  // Furniture: central pieces outlast the partitions around them.
  for (const [level, spec] of plan.levels.entries()) for (const [n, f] of (spec.furniture ?? []).entries()) {
    const { col, row } = parseCell(f.at), c = cellCenter(col, row);
    const masonry = f.feature === "hearth" || f.feature === "oven";
    const hp = centralFurniture.includes(f.feature) ? 80 : f.feature === "chair" ? 30 : 60;
    const b = add("furniture-" + level + "-" + n, c.u + (f.dx ?? 0), c.v + (f.dz ?? 0), f.w, f.d, level * kitStory + (level ? 0 : 0.02), f.h,
      "detail", level, masonry ? "masonry" : "wood", hp, { feature: f.feature });
    b.architecture!.tint = "#685841";
    const floor = floorAt[level].get(col + "," + row);
    if (level && floor) b.supports = [floor];
  }
  // Corner piers and chimney stacks stand on the ground and outlast the house.
  const stoneTop = (plan.mansard ? levels - 1 : levels) * kitStory;
  const partySide = (s: KitSide) => plan.party?.includes(s) || at.borrow?.side === s;
  for (const [cu, cv, a, b] of [[-1, -1, "west", "north"], [1, -1, "east", "north"], [-1, 1, "west", "south"], [1, 1, "east", "south"]] as const) {
    if (partySide(a) || partySide(b)) continue;
    const pier = add("corner-pier-" + a + "-" + b, cu * (W / 2 - 0.1), cv * (D / 2 - 0.1), 0.7, 0.7, 0, stoneTop, "detail", 0, "masonry", 450);
    pier.architecture!.tint = "#9a8a74";
    runtime.survivors.push(pier.id!);
  }
  const roofHeight = (x: number) => top + Math.tan(kitRoofPitch) * (worldW / 2 - Math.abs(x));
  for (const [n, ch] of (plan.chimneys ?? []).entries()) {
    const { col, row } = parseCell(ch.at), c = cellCenter(col, row), [du, dv] = side(ch.side);
    const u = c.u + du * (kitBay / 2 - 0.68), v = c.v + dv * (kitBay / 2 - 0.68);
    const p = world(u, v), h = roofHeight(p.x - at.x) + 1.2;
    const chimney = add("chimney-" + n, u, v, 0.9, 0.9, 0, h, "detail", levels, "masonry", 450);
    chimney.architecture!.tint = "#7a6658";
    runtime.survivors.push(chimney.id!);
  }
  // Roof and gables are laid out in world space: the ridge runs along z.
  const topLevel = levels - 1;
  const topPieces = [...[...levelEdges[topLevel].values()].flatMap((s) => s.top), ...(postAt[topLevel]?.values() ?? [])]
    .map((id) => parts.find((p) => p.id === id)!);
  const overlapping = (x: number, z: number, w: number, d: number, list: Box[]) => list.filter((p) =>
    Math.abs(p.x - x) <= (p.w + w) / 2 + 0.3 && Math.abs(p.z - z) <= (p.d + d) / 2 + 0.3).map((p) => p.id!);
  const nx = Math.round(worldW / kitBay), nz = Math.round(worldD / kitBay), pw = worldW / nx, pd = worldD / nz;
  const roofs = new Map<string, Box>();
  const mansardTop = !!plan.mansard;
  const gables: Box[] = [];
  for (const s of [-1, 1]) {
    const count = nx, w = worldW / count;
    for (let i = 0; i < count; i++) {
      const x = -worldW / 2 + (i + 0.5) * w, slope = -Math.sign(x) * Math.tan(kitRoofPitch);
      const h = Math.tan(kitRoofPitch) * (worldW / 2 - Math.abs(x)) + Math.abs(slope) * w / 2 + 0.2;
      const gable: Box = { id: pieceId("gable-" + s + "-" + i), x: at.x + x, z: at.z + s * (worldD / 2), w, d: 0.4, h, baseY: base + top,
        kind: mansardTop ? "wood" : "masonry", maxHp: mansardTop ? 60 : 180, landmark: at.flag,
        architecture: { building: at.id, part: "wall", level: levels, tint, style, exterior: s as -1 | 1, gableSlope: slope, ...(mansardTop ? { mansard: true } : {}) } };
      gable.supports = overlapping(gable.x, gable.z, gable.w, gable.d, topPieces);
      parts.push(gable); gables.push(gable);
    }
  }
  for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
    const x = -worldW / 2 + (ix + 0.5) * pw, z = -worldD / 2 + (iz + 0.5) * pd;
    const pitch = Math.abs(x) < 0.01 ? 0 : -Math.sign(x) * kitRoofPitch;
    const roof: Box = { id: pieceId("roof-" + ix + "-" + iz), x: at.x + x, z: at.z + z, w: pw / Math.cos(pitch) + 0.025, d: pd + 0.02, h: 0.25,
      baseY: base + top + Math.tan(kitRoofPitch) * (worldW / 2 - Math.abs(x)), kind: "wood", maxHp: 50, landmark: at.flag,
      architecture: { building: at.id, part: "roof", level: levels, roofPitch: pitch, style, tint: (at.variant ?? 0) % 2 ? "#605c58" : "#68534a" } };
    if (ix === 0 || ix === nx - 1) roof.architecture!.eave = ix === 0 ? -1 : 1;
    if (ix === Math.floor(nx / 2)) roof.architecture!.ridge = nx % 2 === 0 ? -pw / 2 + 0.09 : 0;
    roof.supports = [...overlapping(roof.x, roof.z, roof.w, roof.d, topPieces),
      ...(iz === 0 || iz === nz - 1 ? overlapping(roof.x, roof.z, roof.w, roof.d, gables) : [])];
    parts.push(roof); roofs.set(ix + "," + iz, roof);
  }
  for (const [key, roof] of roofs) {
    const [ix, iz] = key.split(",").map(Number);
    roof.spanSupports = [roofs.get(ix - 1 + "," + iz), roofs.get(ix + 1 + "," + iz)].filter((r): r is Box => !!r).map((r) => r.id!);
  }
  // Finished ceilings close the top rooms; each hangs from the two roof
  // panels above it and falls once both are gone.
  for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz += 2) {
    const span = Math.min(2, nz - iz), x = -worldW / 2 + (ix + 0.5) * pw, z = -worldD / 2 + (iz + span / 2) * pd;
    const ceiling: Box = { id: pieceId("ceiling-" + ix + "-" + iz), x: at.x + x, z: at.z + z, w: pw, d: pd * span, h: 0.1,
      baseY: base + top - 0.18, kind: "wood", maxHp: 40, landmark: at.flag,
      architecture: { building: at.id, part: "ceiling", level: levels - 1, tint, style } };
    ceiling.supports = Array.from({ length: span }, (_, i) => roofs.get(ix + "," + (iz + i))!.id!);
    parts.push(ceiling);
  }
  // An entrance porch: two stone columns carrying a timber canopy.
  if (at.entrance?.porch) {
    const { col, row } = parseCell(at.entrance.at), c = cellCenter(col, row), [du, dv] = side(at.entrance.side);
    const face = { u: c.u + du * kitBay / 2, v: c.v + dv * kitBay / 2 }, across = du ? [0, 1] : [1, 0];
    const columns = [-1.9, 1.9].map((t, i) => add("porch-column-" + i, face.u + du * 1.3 + across[0] * t, face.v + dv * 1.3 + across[1] * t,
      0.65, 0.65, 0, 2.7, "detail", 0, "masonry", 180));
    const canopy = add("porch", face.u + du * 1.1, face.v + dv * 1.1, du ? 2.6 : 4.6, du ? 4.6 : 2.6, 2.7, 0.2, "roof", 0, "wood", 50);
    canopy.supports = columns.map((p) => p.id!);
    canopy.architecture!.tint = "#6b6558";
  }
  // Wings: any piece within or on the edge of a wing's bays.
  for (const wing of plan.wings) {
    const a = parseCell(wing.from), b = parseCell(wing.to);
    const u0 = -W / 2 + Math.min(a.col, b.col) * kitBay - 0.3, u1 = -W / 2 + (Math.max(a.col, b.col) + 1) * kitBay + 0.3;
    const v0 = -D / 2 + Math.min(a.row, b.row) * kitBay - 0.3, v1 = -D / 2 + (Math.max(a.row, b.row) + 1) * kitBay + 0.3;
    const inWing = (p: Box) => {
      const l = local.get(p.id!);
      if (l) return l.u >= u0 && l.u <= u1 && l.v >= v0 && l.v <= v1;
      // Roof and gable pieces were placed in world space.
      const dx = p.x - at.x, dz = p.z - at.z;
      const [u, v] = turns === 0 ? [dx, dz] : turns === 1 ? [dz, -dx] : turns === 2 ? [-dx, -dz] : [-dz, dx];
      return u >= u0 && u <= u1 && v >= v0 && v <= v1;
    };
    const members = parts.filter(inWing);
    runtime.wings.push({ id: wing.id, parts: members.map((p) => p.id!), bearing: members.filter((p) => p.architecture?.bearing).map((p) => p.id!) });
  }
  if (at.borrow) {
    // The shared wall belongs to the neighbour; this house leans on it.
    const owner = map.buildings?.find((b) => b.id === at.borrow!.owner)?.kit;
    const shared = Object.values(at.borrow.edges).flatMap((s) => [...s.bottom, ...s.middle, ...s.top]);
    owner?.survivors.push(...shared.filter((id) => !owner.survivors.includes(id)));
  }
  // Navigation anchors: in each bay, the clear points nearest its centre and
  // each edge, found after furniture is placed so routes thread past it.
  for (let level = 0; level < levels; level++) for (let row = 0; row < plan.bays.z; row++) for (let col = 0; col < plan.bays.x; col++) {
    const type = roomType(level, col, row);
    if (type === "void" || type === "stair") continue;
    const c = cellCenter(col, row), feet = base + level * kitStory + (level ? 0 : 0.02), centre = world(c.u, c.v);
    const near = parts.filter((p) => Math.abs(p.x - centre.x) < p.w / 2 + 2 && Math.abs(p.z - centre.z) < p.d / 2 + 2 &&
      (p.baseY ?? 0) < feet + 1.775 && (p.baseY ?? 0) + p.h > feet + (p.walkable ? 0.23 : 0.025));
    const clear: { u: number; v: number }[] = [];
    for (let du = -1.1; du <= 1.1001; du += 0.1) for (let dv = -1.1; dv <= 1.1001; dv += 0.1) {
      const q = world(c.u + du, c.v + dv);
      if (!near.some((p) => Math.abs(q.x - p.x) < p.w / 2 + 0.62 && Math.abs(q.z - p.z) < p.d / 2 + 0.62)) clear.push({ u: c.u + du, v: c.v + dv });
    }
    const chosen: { u: number; v: number }[] = [];
    for (const [tu, tv] of [[0, 0], [-0.8, 0], [0.8, 0], [0, -0.8], [0, 0.8]]) {
      const target = { u: c.u + tu, v: c.v + tv };
      const best = clear.reduce<{ u: number; v: number } | null>((a, q) =>
        !a || Math.hypot(q.u - target.u, q.v - target.v) < Math.hypot(a.u - target.u, a.v - target.v) ? q : a, null);
      if (best && chosen.every((q) => Math.hypot(q.u - best.u, q.v - best.v) > 0.45)) chosen.push(best);
    }
    for (const q of chosen) navigation.push(level === 0 ? { ...world(q.u, q.v) } : { ...world(q.u, q.v), y: base + level * kitStory });
  }
  runtime.parts = parts.map((p) => p.id!);
  for (const [u, v] of [[-1, 0], [1, 0], [0, -1], [0, 1]])
    navigation.push({ ...world(u * (W / 2 + 1.8), v * (D / 2 + 1.8)) });
  // A map may already list this building for its flags and landmarks.
  const existing = map.buildings?.find((b) => b.id === at.id);
  if (existing) Object.assign(existing, building);
  else (map.buildings ??= []).push(building);
  map.boxes.push(...parts);
  return { parts, building: existing ?? building, party };
}

// A borrowed party wall's top pieces at this cell carry the floor above it.
function borrowedTop(borrow: NonNullable<KitPlacement["borrow"]>, level: number, col: number, row: number, plan: KitPlan) {
  const touches = borrow.side === "west" ? col === 0 : borrow.side === "east" ? col === plan.bays.x - 1 :
    borrow.side === "north" ? row === 0 : row === plan.bays.z - 1;
  if (!touches) return [];
  const index = borrow.side === "west" || borrow.side === "east" ? row : col;
  return borrow.edges[level + ":" + index]?.top ?? [];
}
function flightFlanks(f: KitFlight, edges: Map<string, EdgePieces>) {
  const { col, row } = parseCell(f.at), along = f.climb === "north" || f.climb === "south";
  const cells = f.steps === 16 ? [[col, row], along ? [col, row + (f.climb === "south" ? 1 : -1)] : [col + (f.climb === "east" ? 1 : -1), row]] : [[col, row]];
  return cells.flatMap(([c, r]) => (along ? [edgeKey("z", c, r), edgeKey("z", c + 1, r)] : [edgeKey("x", r, c), edgeKey("x", r + 1, c)])
    .flatMap((key) => [...(edges.get(key)?.bottom ?? []), ...(edges.get(key)?.middle ?? [])]));
}
function cellWalls(col: number, row: number, edges: Map<string, EdgePieces>) {
  return [edgeKey("x", row, col), edgeKey("x", row + 1, col), edgeKey("z", col, row), edgeKey("z", col + 1, row)]
    .flatMap((key) => [...(edges.get(key)?.bottom ?? []), ...(edges.get(key)?.middle ?? [])]);
}

// Terraced houses share one party wall between neighbours.
export function buildKitTerrace(map: MapDefinition, plan: KitPlan, at: Omit<KitPlacement, "turns" | "borrow"> & { count: number }) {
  const W = plan.bays.x * kitBay, houses: KitBuilt[] = [];
  for (let i = 0; i < at.count; i++) {
    const previous = houses[i - 1];
    houses.push(buildKitHouse(map, plan, { ...at, id: at.id + "-" + (i + 1), name: (at.name ?? plan.name) + " " + (i + 1),
      x: at.x + (i - (at.count - 1) / 2) * W, variant: (at.variant ?? 0) + i,
      ...(previous?.party.east ? { borrow: { side: "west" as const, edges: previous.party.east, owner: previous.building.id } } : {}) }));
  }
  return houses;
}
