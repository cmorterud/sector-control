import { beyondPlayArea, blocked, coastDistance, dist, inWire, outOfBounds, playArea, walkSegment, type MapDefinition, type Vec } from "./map";
import { dominationRules } from "./domination";
import { pathfind, type Game, type Soldier, type Team } from "./simulation";

// Spawning along the front. On the open battlefields a side does not appear in
// one clump around its spawn point: it deploys in a line across the whole
// length of its front, at the spawn's distance from the enemy, so a match
// starts with soldiers spread from one flank to the other and respawns come in
// all along the line. Indoor, airborne and tutorial maps keep their own spawns.

export const spawnFrontRules = {
  // Metres kept clear of the play area's long edges and the boundary wire.
  edgeMargin: 10,
  // Closest spacing along the line; a second row forms behind when it would be tighter.
  spacing: 2.4,
  rowGap: 2,
  // Nobody deploys on a flag (its capture ring plus a pace or two), or beside a tank.
  flagClearance: dominationRules.radius + 3,
  tankClearance: 6,
};

// The open, outdoor battlefields, where a side holds a front.
export const spreadsAlongFront = (map: Pick<MapDefinition, "id" | "sky">) =>
  !map.sky && (map.id === "trenches" || map.id === "night-raid" || map.id === "village" ||
    map.id === "verdun" || map.id === "spring-offensive" || map.id === "headland");

export interface SpawnFront { x: number; z0: number; z1: number }

const fronts = new WeakMap<MapDefinition, Partial<Record<Team, SpawnFront>>>();

// Where a side's line runs: across z at its spawn's x, as long as the land and
// play area allow, and no longer than the side's own trench lines where it has them.
export function spawnFront(map: MapDefinition, team: Team): SpawnFront {
  let cache = fronts.get(map);
  if (!cache) fronts.set(map, (cache = {}));
  const known = cache[team];
  if (known) return known;
  const s = map.spawn[team], m = spawnFrontRules.edgeMargin;
  let limit = playArea(map).depth / 2 - m;
  const lines = map.terrain?.trenchLines?.filter((l) => l.team === team) ?? [];
  let lo = -limit, hi = limit;
  if (lines.length) {
    lo = Math.max(lo, Math.min(...lines.flatMap((l) => l.sections.map((q) => q.z - q.length / 2))));
    hi = Math.min(hi, Math.max(...lines.flatMap((l) => l.sections.map((q) => q.z + q.length / 2))));
  }
  // Walk out from the spawn while there is land under foot.
  const land = (z: number) => !outOfBounds(s.x, z, 2, map) && (!map.coast || coastDistance(s.x, z, map) > 4);
  let z0 = s.z, z1 = s.z;
  while (z0 - 1 >= lo && land(z0 - 1)) z0--;
  while (z1 + 1 <= hi && land(z1 + 1)) z1++;
  return (cache[team] = { x: s.x, z0, z1 });
}

// How far a point is from a side's spawn line, for keeping shells and gas off it.
export function spawnLineDistance(map: MapDefinition, team: Team, at: Vec): number {
  if (!spreadsAlongFront(map)) return dist(at, map.spawn[team]);
  const f = spawnFront(map, team);
  return Math.hypot(at.x - f.x, Math.max(f.z0 - at.z, 0, at.z - f.z1));
}

// Bots must be able to plan a route out: a spot is kept only if the planner
// joins it to the side's main spawn. Slots repeat, so the answer is remembered
// per map and destruction revision.
const routes = new WeakMap<MapDefinition, { revision: number; known: Map<string, boolean> }>();
function routed(map: MapDefinition, team: Team, x: number, z: number) {
  const revision = map.destruction?.revision ?? 0;
  let memo = routes.get(map);
  if (!memo || memo.revision !== revision) routes.set(map, (memo = { revision, known: new Map() }));
  const key = team + x.toFixed(2) + "," + z.toFixed(2);
  let ok = memo.known.get(key);
  if (ok === undefined) {
    const path = dist({ x, z }, map.spawn[team]) < 1 ? [map.spawn[team]] : pathfind({ x, z }, map.spawn[team], map);
    // The first leg must leave from the spot itself, not a step beside it.
    memo.known.set(key, (ok = path.length > 0 && walkSegment({ x, z }, path[0], map)));
  }
  return ok;
}

// A free place to stand near `at`: not in a wall, wire, the sea or past the
// play area, not on a flag, beside a tank or on a teammate. Steps back from the
// enemy first, then sideways. Null when nothing within a few metres is clear.
export function clearSpawnSpot(g: Game, p: Soldier, at: Vec, back: number): Vec | null {
  const flags: Vec[] = [...g.sectors, ...(g.ctf?.flags.map((f) => f.home) ?? [])];
  const ok = (x: number, z: number) =>
    !blocked(x, z, 0.5, g.map) && beyondPlayArea(x, z, g.map) < -3 && !inWire(x, z, g.map, p.team) &&
    (!g.map.coast || coastDistance(x, z, g.map) > 4) &&
    !flags.some((f) => dist(f, { x, z }) < spawnFrontRules.flagClearance) &&
    !g.tanks?.list.some((t) => dist(t, { x, z }) < spawnFrontRules.tankClearance) &&
    !g.players.some((q) => q !== p && q.hp > 0 && Math.abs(q.x - x) < 1.4 && Math.abs(q.z - z) < 1.4) &&
    routed(g.map, p.team, x, z);
  for (let r = 0; r <= 6; r++)
    for (const [dx, dz] of r ? [[r, 0], [0, r * 0.6], [0, -r * 0.6], [r, r * 0.6], [r, -r * 0.6], [-r * 0.5, 0]] : [[0, 0]]) {
      const x = at.x + dx * back, z = at.z + dz;
      if (ok(x, z)) return { x, z };
    }
  return null;
}

// Where soldier `index` of a side `size` strong stands on its line. Slot 0, the
// player's, is the middle of the front; the rest run out to one flank and on
// from the other, so squads (consecutive indices) stay side by side. When the
// line would be tighter than the spacing, the side forms equal rows, each
// spread over the whole front and staggered by half a place.
export function frontSlot(front: SpawnFront, index: number, size: number) {
  const length = Math.max(1, front.z1 - front.z0);
  const most = Math.max(1, Math.floor(length / spawnFrontRules.spacing) + 1);
  const rows = Math.min(3, Math.ceil(size / most)), columns = Math.max(1, Math.ceil(size / rows));
  const row = Math.floor(index / columns) % rows;
  const column = (index + Math.floor(columns / 2)) % columns, stagger = rows > 1 ? row / rows : 0.5;
  return { z: front.z0 + ((column + stagger) / columns) * length, row };
}

// The line position for a soldier on a map that spreads along its front, or null.
export function frontSpawn(g: Game, p: Soldier): Vec | null {
  if (!spreadsAlongFront(g.map)) return null;
  const front = spawnFront(g.map, p.team);
  const back = -Math.sign(g.map.spawn[p.team === "blue" ? "red" : "blue"].x - front.x) || (p.team === "blue" ? -1 : 1);
  const slot = frontSlot(front, p.teamIndex, g.teamSize);
  return clearSpawnSpot(g, p, { x: front.x + back * slot.row * spawnFrontRules.rowGap, z: slot.z }, back);
}
