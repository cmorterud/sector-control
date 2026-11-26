// Tanks on Trench front and Verdun sector (briefing toggle, or ?tanks=1).
//
// One tank a side at a time. A bot crews it by default; a human who climbs in
// takes command and the bot climbs out. Tanks are slow, cross ordinary
// trenches, flatten wire and push over shattered trees.
//
// Bullets never wear a tank down. They "splash" it: rounds striking the
// plates blur the crew's view, spoil their aim and slow a bot driver. Hull
// damage comes only from explosions: grenades on or against the plates (the
// period's bundled charges), artillery and other tanks' guns. A badly hurt
// tank throws a track and becomes a pillbox; a destroyed one leaves a wreck
// that stops bullets, and its crew bail out. Tanks also ditch in gaps too
// wide to bridge, such as shell-widened trenches, and now and then stall.
import { angleDelta } from "./awareness";
import { carriedFlag } from "./ctf";
import { crushWire, damageVegetation, type DestructionChange, type ExplosionProfile } from "./destruction";
import type { DamageDetails } from "./combat-history";
import { factionFor, type FactionId } from "./loadouts";
import { beyondPlayArea, bodyBlocked, dist, groundHeight, outOfBounds, supportHeight, type MapDefinition, type Vec } from "./map";
import { idle, raySphere, type Command, type Game, type Projectile, type Soldier, type Team, type V3 } from "./simulation";
import { hitHeights, hitRadius } from "./crouch";
import { weaponStats } from "./weapon-stats";
import { weaponProfile } from "./weapons";

export const tankRules = {
  length: 8,
  width: 3.4,
  height: 2.45,
  // Walking pace is 4.5 m/s. A Mark IV managed about 6 km/h on good ground;
  // these make about 4.7 km/h and turn slowly.
  maxSpeed: 1.3,
  reverseSpeed: 0.55,
  acceleration: 0.35,
  turnRate: 0.2,
  hp: 600,
  // Below this share of its hull points a tank has thrown a track.
  immobilizedBelow: 0.35,
  // Obstacles up to this high are climbed or crushed.
  climb: 1.25,
  maxSlope: 0.6,
  // Gaps at least this wide under both tracks ditch the tank. The maps' fire
  // trenches, firing step included, are about 4.5 m across; a shell-widened
  // stretch or a long junction bay is wider.
  ditchGap: 5.5,
  // The hull stays level until its middle is this far past a lip.
  overhang: 1.5,
  ditchTicks: 20 * 30,
  stallTicks: 8 * 30,
  boardRange: 1.6,
  respawnTicks: 90 * 30,
  refillTicks: 15 * 30,
  wrecksPerTeam: 2,
  mgShotTicks: 4,
  mgBelt: 250,
  mgReserve: 1500,
  mgReloadTicks: 4 * 30,
  cannonReloadTicks: Math.round(3.5 * 30),
  cannonAmmo: 40,
  cannonRange: 90,
  // Metres a second: fast, but slow enough to see the shell cross the field.
  shellSpeed: 330,
  splashPerHit: 0.05,
  slitSplash: 0.15,
  splashDecayPerTick: 0.3 / 30,
  // Bot drivers stop this far short of the flag they are taking.
  standoff: 9,
  sight: 60,
};

// A tank gun's high-explosive shell: well short of a field gun's. It bursts
// on contact and barely marks the ground, so it leaves terrain (and the bots'
// routes over it) alone; it still knocks cover about.
export const tankShellProfile: ExplosionProfile = {
  kind: "tank-shell",
  radius: 5,
  damage: 150,
  structuralRadius: 3,
  structuralDamage: 140,
  craterRadius: 0,
  craterDepth: 0,
  terrainReach: 0,
};

export type TankModel = "mark-iv" | "a7v" | "saint-chamond";
export type TankCondition = "mobile" | "ditched" | "stalled" | "immobilized" | "wreck";
export interface Tank extends V3 {
  id: number;
  team: Team;
  model: TankModel;
  name: string;
  yaw: number;
  pitch: number;
  roll: number;
  // Last tick's pose, for drawing between ticks.
  previous: { x: number; y: number; z: number; yaw: number; pitch: number; roll: number };
  speed: number;
  // Metres travelled, for the track animation.
  travel: number;
  hp: number;
  state: TankCondition;
  until: number;
  gap: number;
  driver?: number;
  splash: number;
  aimYaw: number;
  aimPitch: number;
  // Where the commander's crosshair rests, and which machine-gun mount
  // (an index into machineGunMounts) can bear on it, or -1 when none can.
  aim: V3;
  mg: { ammo: number; reserve: number; nextShot: number; reloadAt: number; weaponId: string; mount: number };
  // refused: the last tick the trigger was held while the gun could not fire.
  // firedAt and muzzle: the last shot, for the smoke drawn at the barrel.
  // clear: whether the gun has a line to the crosshair (a gun low in the hull
  // cannot see down into a trench the commander's raised view looks into).
  cannon: { ammo: number; nextShot: number; held: boolean; refused: number; firedAt: number; muzzle: V3; clear: boolean };
  knockedOutAt?: number;
  bot: { objective?: Vec; nextPlan: number; target: number; nextScan: number; check: Vec & { tick: number }; reverseUntil: number; turn: number; heading?: number; nextSteer: number };
}
export type TankEvent = {
  type: "tank";
  tank: number;
  team: Team;
  phase: "spawn" | "board" | "exit" | "cannon" | "ditched" | "unditched" | "stalled" | "restarted" | "immobilized" | "knockedOut" | "crush";
  actor?: number;
  at: V3;
  to?: V3;
};
type Hurt = (p: Soldier, amount: number, source: number, team: Team | null, details: DamageDetails) => void;
// A main-gun shell in flight: flat and fast, it bursts on whatever it meets
// or where its range runs out.
export interface TankShell extends V3 {
  id: number;
  tank: number;
  actor: number;
  team: Team;
  vx: number;
  vy: number;
  vz: number;
  remaining: number;
  previous: V3;
}
export interface TankState {
  enabled: boolean;
  list: Tank[];
  shells: TankShell[];
  sequence: number;
  nextSpawn: Record<Team, number>;
  fillAt: Record<Team, number>;
  hurt: Hurt;
  destroy: (actor: number, change: DestructionChange) => void;
}

export const supportsTanks = (map: Pick<MapDefinition, "id">) => map.id === "trenches" || map.id === "verdun";

const models: Record<FactionId, { model: TankModel; name: string }> = {
  british: { model: "mark-iv", name: "Mark IV" },
  german: { model: "a7v", name: "A7V" },
  french: { model: "saint-chamond", name: "Saint-Chamond" },
  trainingBlue: { model: "mark-iv", name: "Mark IV" },
  trainingRed: { model: "a7v", name: "A7V" },
};
export const tankModelFor = (map: Pick<MapDefinition, "id">, team: Team) => models[factionFor(map, team)];
export const tankGun = (model: TankModel) =>
  model === "mark-iv" ? "6-pounder" : model === "a7v" ? "57 mm gun" : "75 mm gun";

// The machine guns each tank carries, in its own frame: f metres forward of
// the centre, s to the right, y above the tracks' bottom. Each swings `arc`
// radians either side of its rest `bearing` (0 ahead, positive to the right).
// Whichever mount can bear on the crosshair and is nearest to it fires, so
// the gun the player sees firing is a real one, and a target no mount can
// reach (dead astern of the Mark IV, dead ahead of nothing) needs the hull
// turned. The renderer draws the same mounts.
export interface GunMount { name: string; f: number; s: number; y: number; bearing: number; arc: number }
const side = (name: string, f: number, s: number, y: number, bearing: number, arc: number): GunMount[] =>
  [{ name: `left ${name}`, f, s: -s, y, bearing: -bearing, arc }, { name: `right ${name}`, f, s, y, bearing, arc }];
export const machineGunMounts: Record<TankModel, GunMount[]> = {
  // A male Mark IV: a gun in the front plate, one at the back of each
  // sponson and one in the rear door.
  "mark-iv": [
    { name: "front gun", f: 3.25, s: 0, y: 1.3, bearing: 0, arc: 0.65 },
    ...side("sponson gun", -0.1, 2.05, 1.25, Math.PI / 2 + 0.25, 1.3),
    { name: "rear gun", f: -3.3, s: 0, y: 1.45, bearing: Math.PI, arc: 0.6 },
  ],
  // The A7V: six Maxims, two down each side and two in the rear plate.
  a7v: [
    ...side("bow gun", 1.6, 1.62, 1.45, 1.05, 1.2),
    ...side("waist gun", -0.8, 1.62, 1.45, Math.PI / 2 + 0.2, 0.9),
    ...side("stern gun", -3.35, 0.8, 1.6, Math.PI, 0.75),
  ],
  // The Saint-Chamond: a bow gun beside the 75, one each side and one astern.
  "saint-chamond": [
    { name: "bow gun", f: 3.6, s: 0.75, y: 1.6, bearing: 0, arc: 0.8 },
    ...side("side gun", 0.5, 1.4, 1.6, Math.PI / 2, 1.1),
    { name: "stern gun", f: -3.85, s: 0, y: 1.6, bearing: Math.PI, arc: 0.85 },
  ],
};

export function createTanks(g: Game, enabled: boolean, hurt: Hurt, destroy: TankState["destroy"]): TankState {
  const state: TankState = {
    enabled: enabled && supportsTanks(g.map),
    list: [],
    shells: [],
    sequence: 0,
    nextSpawn: { blue: 0, red: 0 },
    fillAt: { blue: 0, red: 0 },
    hurt,
    destroy,
  };
  return state;
}

// ---- Geometry -----------------------------------------------------------

const forwardOf = (yaw: number) => ({ x: Math.sin(yaw), z: -Math.cos(yaw) });
const rightOf = (yaw: number) => ({ x: Math.cos(yaw), z: Math.sin(yaw) });
// A world point in the hull's frame: f forward, s to the right.
export function toLocal(t: { x: number; z: number; yaw: number }, p: Vec) {
  const dx = p.x - t.x, dz = p.z - t.z;
  return { f: dx * Math.sin(t.yaw) - dz * Math.cos(t.yaw), s: dx * Math.cos(t.yaw) + dz * Math.sin(t.yaw) };
}
export function toWorld(t: { x: number; z: number; yaw: number }, f: number, s: number): Vec {
  const fw = forwardOf(t.yaw), r = rightOf(t.yaw);
  return { x: t.x + fw.x * f + r.x * s, z: t.z + fw.z * f + r.z * s };
}
const halfL = tankRules.length / 2, halfW = tankRules.width / 2;

export function insideTank(t: Tank, p: V3, margin = 0) {
  const l = toLocal(t, p);
  return Math.abs(l.f) < halfL + margin && Math.abs(l.s) < halfW + margin &&
    p.y > t.y - margin && p.y < t.y + tankRules.height + margin;
}

// Distance from a point to the hull box (0 inside).
export function hullDistance(t: Tank, p: V3) {
  const l = toLocal(t, p);
  const df = Math.max(0, Math.abs(l.f) - halfL), ds = Math.max(0, Math.abs(l.s) - halfW);
  const dy = Math.max(0, t.y - p.y, p.y - (t.y + tankRules.height));
  return Math.hypot(df, ds, dy);
}

// First hit of segment a→b on the hull box, as a fraction (1 = no hit).
export function rayHull(t: Tank, a: V3, b: V3): number {
  const la = toLocal(t, a), lb = toLocal(t, b);
  const o = [la.f, la.s, a.y], d = [lb.f - la.f, lb.s - la.s, b.y - a.y];
  const lo = [-halfL, -halfW, t.y], hi = [halfL, halfW, t.y + tankRules.height];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < lo[i] || o[i] > hi[i]) return 1;
      continue;
    }
    let u = (lo[i] - o[i]) / d[i], v = (hi[i] - o[i]) / d[i];
    if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u);
    t1 = Math.min(t1, v);
    if (t0 > t1) return 1;
  }
  return t0;
}

export function rayTanks(g: Game, a: V3, b: V3, ignore?: Tank): { t: number; tank?: Tank } {
  let best = 1, hit: Tank | undefined;
  for (const tank of g.tanks?.list ?? []) {
    if (tank === ignore) continue;
    // Cheap reject: segment far from the hull.
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, half = Math.hypot(b.x - a.x, b.z - a.z) / 2;
    if (Math.hypot(mx - tank.x, mz - tank.z) > half + 5) continue;
    const t = rayHull(tank, a, b);
    if (t < best) { best = t; hit = tank; }
  }
  return { t: best, tank: hit };
}

// Sample the ground under both tracks. The hull rests on the highest support
// front and back, so it bridges an ordinary trench without dropping into it.
export function tankPose(map: MapDefinition, x: number, z: number, yaw: number) {
  const fw = forwardOf(yaw), r = rightOf(yaw), track = halfW - 0.45, n = 17;
  const left: number[] = [], right: number[] = [];
  for (let i = 0; i < n; i++) {
    const f = -halfL + (i * tankRules.length) / (n - 1);
    for (const [side, list] of [[-track, left], [track, right]] as const)
      list.push(groundHeight(x + fw.x * f + r.x * side, z + fw.z * f + r.z * side, map));
  }
  // Front and rear supports overlap about the middle, so a hull whose centre
  // of gravity is still close to a lip stays level instead of nosing in.
  const mid = (n - 1) / 2, overlap = Math.round((tankRules.overhang / tankRules.length) * (n - 1));
  const max = (list: number[], from: number, to: number) => Math.max(...list.slice(from, to + 1));
  const front = Math.max(max(left, mid - overlap, n - 1), max(right, mid - overlap, n - 1));
  const rear = Math.max(max(left, 0, mid + overlap), max(right, 0, mid + overlap));
  const l = Math.max(...left), rt = Math.max(...right);
  const y = (front + rear) / 2;
  const pitch = Math.atan2(front - rear, halfL);
  const roll = Math.atan2(l - rt, track * 2);
  let run = 0, gap = 0;
  for (let i = 0; i < n; i++) {
    const f = -halfL + (i * tankRules.length) / (n - 1);
    const hull = y + (f / halfL) * (front - rear) / 2 - 1;
    if (left[i] < hull && right[i] < hull) gap = Math.max(gap, ++run * tankRules.length / (n - 1));
    else run = 0;
  }
  return { y, pitch, roll, gap };
}

const crushable = new Set(["sandbag", "wire", "log", "stump", "rubble", "brush"]);
type Obstacle = { kind: "solid" } | { kind: "tree"; at: V3 } | null;
// The first obstacle the hull would overlap at this pose.
function obstacle(g: Game, self: Tank | undefined, x: number, z: number, yaw: number, y: number): Obstacle {
  const pose = { x, z, yaw };
  for (const [f, s] of [[halfL, halfW], [halfL, -halfW], [-halfL, halfW], [-halfL, -halfW]]) {
    const corner = toWorld(pose, f, s);
    if (beyondPlayArea(corner.x, corner.z, g.map) > -0.5 || outOfBounds(corner.x, corner.z, 1, g.map)) return { kind: "solid" };
  }
  const reach = Math.hypot(halfL, halfW);
  const fw = forwardOf(yaw), r = rightOf(yaw);
  for (const b of g.map.boxes) {
    if (Math.abs(b.x - x) > reach + b.w / 2 || Math.abs(b.z - z) > reach + b.d / 2) continue;
    const base = b.baseY ?? 0, top = base + b.h;
    if (top <= y + tankRules.climb || base >= y + tankRules.height) continue;
    if (crushable.has(b.kind) && top <= y + 1.6) continue;
    if (b.kind === "wood" && Math.max(b.w, b.d) <= 0.3) continue;
    // Separating axes: the box's two and the hull's two.
    const dx = b.x - x, dz = b.z - z;
    const hullOnX = halfL * Math.abs(fw.x) + halfW * Math.abs(r.x), hullOnZ = halfL * Math.abs(fw.z) + halfW * Math.abs(r.z);
    if (Math.abs(dx) > b.w / 2 + hullOnX || Math.abs(dz) > b.d / 2 + hullOnZ) continue;
    const boxOnF = (b.w / 2) * Math.abs(fw.x) + (b.d / 2) * Math.abs(fw.z), boxOnS = (b.w / 2) * Math.abs(r.x) + (b.d / 2) * Math.abs(r.z);
    if (Math.abs(dx * fw.x + dz * fw.z) > halfL + boxOnF || Math.abs(dx * r.x + dz * r.z) > halfW + boxOnS) continue;
    if (b.kind === "tree") return { kind: "tree", at: { x: b.x, y: base + 1, z: b.z } };
    return { kind: "solid" };
  }
  for (const other of g.tanks.list) {
    if (other === self) continue;
    if (Math.hypot(other.x - x, other.z - z) > tankRules.length + 0.2) continue;
    // Approximate the other hull with five points along its spine.
    for (let f = -halfL; f <= halfL; f += 2) {
      const p = toWorld(other, f, 0), l = toLocal(pose, p);
      if (Math.abs(l.f) < halfL + halfW && Math.abs(l.s) < halfW * 2) return { kind: "solid" };
    }
  }
  return null;
}

// ---- Life cycle ------------------------------------------------------------

function spawnTank(g: Game, team: Team) {
  const spawn = g.map.spawn[team], ahead = team === "blue" ? 1 : -1;
  const yaw = team === "blue" ? Math.PI / 2 : -Math.PI / 2;
  // Beside the infantry's formation and a few metres behind it.
  const candidates: Vec[] = [];
  for (let dz = 0; dz <= 30; dz += 2)
    for (const side of dz ? [1, -1] : [1])
      for (const dx of [-3, 0, -6, 3, -9])
        candidates.push({ x: spawn.x + dx * ahead, z: spawn.z + 14 + side * dz });
  for (const c of candidates) {
    const pose = tankPose(g.map, c.x, c.z, yaw);
    if (Math.abs(pose.pitch) > 0.15 || Math.abs(pose.roll) > 0.15 || pose.gap > 0.6) continue;
    if (obstacle(g, undefined, c.x, c.z, yaw, pose.y)) continue;
    const { model, name } = tankModelFor(g.map, team);
    const weaponId = weaponStats.find(w => w.role === "emplaced" && w.faction === factionFor(g.map, team))?.name ?? "Vickers";
    const tank: Tank = {
      id: ++g.tanks.sequence, team, model, name,
      x: c.x, y: pose.y, z: c.z, yaw, pitch: pose.pitch, roll: pose.roll,
      previous: { x: c.x, y: pose.y, z: c.z, yaw, pitch: pose.pitch, roll: pose.roll },
      speed: 0, travel: 0, hp: tankRules.hp, state: "mobile", until: 0, gap: 0, splash: 0,
      aimYaw: yaw, aimPitch: 0, aim: { ...toWorld({ x: c.x, z: c.z, yaw }, 30, 0), y: pose.y + 1.3 },
      mg: { ammo: tankRules.mgBelt, reserve: tankRules.mgReserve, nextShot: 0, reloadAt: 0, weaponId, mount: -1 },
      cannon: { ammo: tankRules.cannonAmmo, nextShot: 0, held: false, refused: -1, firedAt: -1, muzzle: { x: c.x, y: pose.y, z: c.z }, clear: true },
      bot: { nextPlan: 0, target: -1, nextScan: 0, check: { x: c.x, z: c.z, tick: g.tick }, reverseUntil: 0, turn: 1, nextSteer: 0 },
    };
    g.tanks.list.push(tank);
    g.tanks.fillAt[team] = g.tick;
    g.emit({ type: "tank", tank: tank.id, team, phase: "spawn", at: { x: tank.x, y: tank.y, z: tank.z } });
    // Clear soldiers standing where it arrived.
    for (const p of g.players) if (p.hp > 0 && p.tank === undefined) pushOut(g, tank, p, false);
    return tank;
  }
  return undefined;
}

export const crewTank = (g: Game, p: Soldier) =>
  p.tank === undefined ? undefined : g.tanks?.list.find(t => t.id === p.tank);
export const activeTank = (g: Game, team: Team) =>
  g.tanks?.list.find(t => t.team === team && t.state !== "wreck");
const alive = (t: Tank) => t.state !== "wreck";
const mobile = (t: Tank) => t.state === "mobile";

function seat(t: Tank, p: Soldier) {
  p.x = t.x;
  p.z = t.z;
  p.y = t.y + 0.4;
  p.vx = p.vz = 0;
}

function board(g: Game, t: Tank, p: Soldier) {
  const previous = t.driver === undefined ? undefined : g.players[t.driver];
  if (previous && previous !== p) leave(g, previous, true);
  t.driver = p.id;
  p.tank = t.id;
  p.mantle = null;
  p.hop = null;
  p.fall = null;
  p.crouched = false;
  p.reloadAt = 0;
  p.throwAction = null;
  p.throwUntil = 0;
  p.path = [];
  p.mode = "Tank";
  t.aimYaw = p.yaw;
  t.aimPitch = 0;
  seat(t, p);
  g.emit({ type: "tank", tank: t.id, team: t.team, phase: "board", actor: p.id, at: { x: t.x, y: t.y, z: t.z } });
}

// Out by the nearest free door: either side, then behind, then in front.
function exitPoint(g: Game, t: Tank, p: Soldier): V3 {
  for (const [f, s] of [[0, halfW + 0.8], [0, -halfW - 0.8], [-halfL - 0.8, 0], [halfL + 0.8, 0], [-2, halfW + 0.8], [2, -halfW - 0.8]]) {
    const at = toWorld(t, f, s);
    const y = supportHeight(at.x, at.z, g.map, t.y + 1.5, 0.45);
    if (bodyBlocked(at.x, at.z, y, 0.45, g.map) || g.tanks.list.some(o => insideTank(o, { ...at, y: y + 1 }, 0.4))) continue;
    return { ...at, y };
  }
  const at = toWorld(t, 0, halfW + 0.8);
  return { ...at, y: groundHeight(at.x, at.z, g.map) };
}

// The crew member climbs out. Used on dismounting, being bumped by a human,
// bailing out and dying.
export function leave(g: Game, p: Soldier, kicked = false) {
  const t = crewTank(g, p);
  p.tank = undefined;
  if (!t) return;
  if (t.driver === p.id) t.driver = undefined;
  if (p.hp > 0) Object.assign(p, exitPoint(g, t, p));
  p.path = [];
  p.nextThink = g.tick;
  p.mode = "Navigate";
  p.command = idle();
  // A bot bumped out by a human goes back to the fight; anyone else leaving
  // an empty tank leaves it for a bot to crew a little later.
  if (alive(t) && !kicked) g.tanks.fillAt[t.team] = g.tick + tankRules.refillTicks;
  g.emit({ type: "tank", tank: t.id, team: t.team, phase: "exit", actor: p.id, at: { x: p.x, y: p.y, z: p.z } });
}

// The interact key next to or inside a tank. Only humans take command; a
// bot already inside climbs out for them.
export function tankInteraction(g: Game, p: Soldier, pressed: boolean): boolean {
  if (!pressed || !g.tanks?.enabled || p.hp <= 0) return false;
  if (p.tank !== undefined) {
    leave(g, p);
    return true;
  }
  if (!g.humanPlayerIds.includes(p.id) || p.mountedGun !== undefined || carriedFlag(g, p)) return false;
  const t = nearbyTank(g, p);
  if (!t) return false;
  board(g, t, p);
  return true;
}

// ?tank=1 starts a match in command of your side's tank.
export function takeCommand(g: Game, p: Soldier) {
  const t = activeTank(g, p.team);
  if (!t || p.hp <= 0 || p.tank !== undefined) return false;
  board(g, t, p);
  return true;
}

export function nearbyTank(g: Game, p: Soldier) {
  if (!g.tanks?.enabled || p.tank !== undefined || p.hp <= 0) return undefined;
  return g.tanks.list.find(t => t.team === p.team && alive(t) &&
    hullDistance(t, { x: p.x, y: p.y + 1, z: p.z }) < tankRules.boardRange &&
    (t.driver === undefined || !g.humanPlayerIds.includes(t.driver)));
}

// A respawning bot takes an empty tank's seat.
export function crewOnRespawn(g: Game, p: Soldier) {
  if (!g.tanks?.enabled || g.humanPlayerIds.includes(p.id)) return;
  const t = activeTank(g, p.team);
  if (t && t.driver === undefined && g.tick >= g.tanks.fillAt[t.team]) board(g, t, p);
}

function fill(g: Game, t: Tank) {
  if (t.driver !== undefined || g.tick < g.tanks.fillAt[t.team]) return;
  // A bot already close by climbs in; otherwise the next one to respawn does.
  const near = g.players.filter(q => q.team === t.team && q.hp > 0 && q.tank === undefined && !g.humanPlayerIds.includes(q.id) &&
    q.mountedGun === undefined && !q.charge && !q.mantle && !carriedFlag(g, q) && dist(q, t) < 25)
    .sort((a, b) => dist(a, t) - dist(b, t))[0];
  if (near) board(g, t, near);
  else if (g.tick === g.tanks.fillAt[t.team] && g.tick < 30) {
    // At the start of a match the side's last soldier crews it.
    const first = [...g.players].reverse().find(q => q.team === t.team && q.hp > 0 && !g.humanPlayerIds.includes(q.id) && q.tank === undefined);
    if (first) board(g, t, first);
  }
}

export function damageTank(g: Game, t: Tank, amount: number, actor: number, team: Team | null) {
  if (!alive(t) || amount <= 0) return;
  t.hp = Math.max(0, t.hp - amount);
  if (t.hp <= 0) {
    t.state = "wreck";
    t.speed = 0;
    t.knockedOutAt = g.tick;
    g.tanks.nextSpawn[t.team] = g.tick + tankRules.respawnTicks;
    const killer = g.players.find(q => q.id === actor);
    if (killer && team !== null && team !== t.team) killer.kills++;
    g.emit({ type: "tank", tank: t.id, team: t.team, phase: "knockedOut", actor, at: { x: t.x, y: t.y, z: t.z } });
    const crew = t.driver === undefined ? undefined : g.players[t.driver];
    if (crew) {
      leave(g, crew);
      // Bailing out of a burning tank.
      g.tanks.hurt(crew, 35, actor, team, { kind: "burn", weapon: `${t.name} knocked out`, from: { x: t.x, y: t.y + 1, z: t.z } });
    }
    const wrecks = g.tanks.list.filter(o => o.team === t.team && o.state === "wreck");
    if (wrecks.length > tankRules.wrecksPerTeam) g.tanks.list.splice(g.tanks.list.indexOf(wrecks[0]), 1);
  } else if (t.hp < tankRules.hp * tankRules.immobilizedBelow && t.state !== "immobilized") {
    t.state = "immobilized";
    t.speed = 0;
    g.emit({ type: "tank", tank: t.id, team: t.team, phase: "immobilized", actor, at: { x: t.x, y: t.y, z: t.z } });
  }
}

// Blasts against the plates. Close and contact charges count for far more
// than shells landing nearby.
export function explosionOnTanks(g: Game, at: V3, actor: number, team: Team | null, profile: ExplosionProfile) {
  if (!g.tanks?.list.length) return;
  const weight = profile.kind.startsWith("artillery") ? 1.15 : profile.kind === "tank-shell" ? 0.9 : profile.kind === "grenade" ? 1 : 0;
  if (!weight) return;
  for (const t of g.tanks.list) {
    if (!alive(t) || (team !== null && t.team === team)) continue;
    const d = hullDistance(t, at);
    if (d >= profile.structuralRadius) continue;
    damageTank(g, t, profile.structuralDamage * weight * (1 - d / profile.structuralRadius) ** 2, actor, team);
  }
}

// A rifle or machine-gun round striking the plates.
export function bulletOnTank(t: Tank, at: V3) {
  const l = toLocal(t, at);
  // Vision slits and the driver's cab sit high at the front.
  const slit = l.f > halfL - 1.6 && at.y > t.y + 1.4;
  t.splash = Math.min(1, t.splash + (slit ? tankRules.slitSplash : tankRules.splashPerHit));
}

// ---- Movement ------------------------------------------------------------

// Push a soldier out of the hull. A tank on the move crushes one it cannot push.
function pushOut(g: Game, t: Tank, p: Soldier, moving: boolean, actor?: number): "clear" | "blocked" {
  if (p.hp <= 0 || p.tank !== undefined) return "clear";
  // Men down in a trench the tank is bridging are below its belly.
  if (p.y + 1.6 < t.y + 0.9 || p.y > t.y + tankRules.height) return "clear";
  const margin = 0.45;
  const l = toLocal(t, p);
  const pf = halfL + margin - Math.abs(l.f), ps = halfW + margin - Math.abs(l.s);
  if (pf <= 0 || ps <= 0) return "clear";
  const out = ps < pf
    ? toWorld(t, l.f, Math.sign(l.s || 1) * (halfW + margin + 0.02))
    : toWorld(t, Math.sign(l.f || 1) * (halfL + margin + 0.02), l.s);
  const y = supportHeight(out.x, out.z, g.map, p.y + 0.6, 0.45);
  const free = !bodyBlocked(out.x, out.z, y, 0.45, g.map) && Math.abs(y - p.y) < 1.2 &&
    !g.tanks.list.some(o => o !== t && insideTank(o, { ...out, y: y + 1 }, margin));
  if (free) {
    p.x = out.x;
    p.z = out.z;
    if (Math.abs(y - p.y) < 0.4) p.y = y;
    return "clear";
  }
  // A tank never runs down its own side's soldiers: it stops for them.
  if (!moving || p.team === t.team) return "blocked";
  g.emit({ type: "tank", tank: t.id, team: t.team, phase: "crush", actor: p.id, at: { x: p.x, y: p.y, z: p.z } });
  g.tanks.hurt(p, p.hp, actor ?? -1, actor === undefined ? null : t.team, { kind: "collapse", weapon: `Crushed by ${t.name}`, from: { x: t.x, y: t.y + 1, z: t.z } });
  return "clear";
}

export function keepClearOfTanks(g: Game, p: Soldier) {
  if (!g.tanks?.list.length || p.tank !== undefined) return;
  for (const t of g.tanks.list) if (Math.abs(t.x - p.x) < 6 && Math.abs(t.z - p.z) < 6) pushOut(g, t, p, false);
}

function settle(g: Game, t: Tank, x: number, z: number, yaw: number) {
  const pose = tankPose(g.map, x, z, yaw);
  if (Math.abs(pose.pitch) > tankRules.maxSlope || Math.abs(pose.roll) > tankRules.maxSlope) return { ok: false as const };
  const hit = obstacle(g, t, x, z, yaw, Math.min(pose.y, t.y + 0.5));
  if (hit) return { ok: false as const, hit };
  return { ok: true as const, pose };
}

function drive(g: Game, t: Tank, throttle: number, turn: number) {
  throttle = Math.max(-1, Math.min(1, throttle));
  turn = Math.max(-1, Math.min(1, turn));
  if (!mobile(t)) {
    t.speed = 0;
    return;
  }
  const target = throttle >= 0 ? throttle * tankRules.maxSpeed : throttle * tankRules.reverseSpeed;
  const step = tankRules.acceleration / 30;
  t.speed += Math.max(-step, Math.min(step, target - t.speed));
  if (Math.abs(target) < 0.01 && Math.abs(t.speed) < step) t.speed = 0;
  const yaw = t.yaw + turn * (tankRules.turnRate / 30) * (Math.abs(t.speed) < 0.2 ? 0.7 : 1);
  if (!t.speed && !turn) return;
  const fw = forwardOf(yaw);
  const x = t.x + (fw.x * t.speed) / 30, z = t.z + (fw.z * t.speed) / 30;
  let next = settle(g, t, x, z, yaw);
  let pose = { x, z, yaw };
  if (!next.ok && turn) {
    const straight = forwardOf(t.yaw);
    pose = { x: t.x + (straight.x * t.speed) / 30, z: t.z + (straight.z * t.speed) / 30, yaw: t.yaw };
    const alt = settle(g, t, pose.x, pose.z, pose.yaw);
    if (alt.ok || !next.hit || next.hit.kind !== "tree") next = alt;
  }
  if (!next.ok) {
    // Leaning on a shattered tree pushes it over in a few seconds.
    if (next.hit?.kind === "tree" && Math.abs(t.speed) > 0.1) {
      const change = damageVegetation(g.map, next.hit.at, 6);
      if (change) g.tanks.destroy(t.driver ?? -1, change);
    }
    t.speed = 0;
    return;
  }
  const before = { x: t.x, z: t.z, yaw: t.yaw, y: t.y, pitch: t.pitch, roll: t.roll, gap: t.gap };
  Object.assign(t, { x: pose.x, z: pose.z, yaw: pose.yaw, y: next.pose.y, pitch: next.pose.pitch, roll: next.pose.roll, gap: next.pose.gap });
  let held = false;
  for (const p of g.players)
    if (Math.abs(p.x - t.x) < 6 && Math.abs(p.z - t.z) < 6 && pushOut(g, t, p, Math.abs(t.speed) > 0.2, t.driver) === "blocked") held = true;
  if (held) {
    Object.assign(t, before);
    t.speed = 0;
    return;
  }
  t.travel += Math.hypot(pose.x - before.x, pose.z - before.z) * Math.sign(t.speed || 1);
  // Flatten any wire under the tracks.
  const wire = (g.map.wireBelts ?? []).filter(b => !g.map.destruction?.wire?.[b.id] &&
    hullDistance(t, { x: b.x, y: t.y + 0.5, z: b.z }) < Math.max(b.w, b.d) / 2);
  if (wire.length) {
    const change = crushWire(g.map, wire.map(b => b.id), { x: t.x, y: t.y, z: t.z });
    if (change) g.tanks.destroy(t.driver ?? -1, change);
  }
  if (t.gap >= tankRules.ditchGap) {
    t.state = "ditched";
    t.until = g.tick + tankRules.ditchTicks;
    t.speed = 0;
    g.emit({ type: "tank", tank: t.id, team: t.team, phase: "ditched", at: { x: t.x, y: t.y, z: t.z } });
    return;
  }
  // Mechanical trouble: rare, likelier once hurt.
  if (g.tick % 30 === t.id % 30 && Math.abs(t.speed) > 0.3) {
    const chance = 1 / 600 + (1 - t.hp / tankRules.hp) / 200;
    if (g.random() < chance) {
      t.state = "stalled";
      t.until = g.tick + tankRules.stallTicks;
      t.speed = 0;
      g.emit({ type: "tank", tank: t.id, team: t.team, phase: "stalled", at: { x: t.x, y: t.y, z: t.z } });
    }
  }
}

// After the crew have worked it free, the tank lurches across the gap, or
// back out of it if the far side is blocked.
function unditch(g: Game, t: Tank) {
  for (const distance of [t.gap + 1, t.gap + 2, -(t.gap + 1), -(halfL + 1)]) {
    const fw = forwardOf(t.yaw);
    const x = t.x + fw.x * distance, z = t.z + fw.z * distance;
    const next = settle(g, t, x, z, t.yaw);
    if (!next.ok || next.pose.gap >= tankRules.ditchGap) continue;
    Object.assign(t, { x, z, y: next.pose.y, pitch: next.pose.pitch, roll: next.pose.roll, gap: next.pose.gap });
    t.previous = { x, y: t.y, z, yaw: t.yaw, pitch: t.pitch, roll: t.roll };
    for (const p of g.players) pushOut(g, t, p, false);
    break;
  }
  t.state = "mobile";
  g.emit({ type: "tank", tank: t.id, team: t.team, phase: "unditched", at: { x: t.x, y: t.y, z: t.z } });
}

// ---- Weapons -------------------------------------------------------------

const lookDir = (yaw: number, pitch: number): V3 => ({
  x: Math.sin(yaw) * Math.cos(pitch),
  y: Math.sin(pitch),
  z: -Math.cos(yaw) * Math.cos(pitch),
});

// The third-person view a commander sees, also used to find what the
// crosshair rests on.
export function tankCamera(t: Pick<Tank, "x" | "y" | "z">, yaw: number, pitch: number) {
  const dir = lookDir(yaw, pitch), distance = 10;
  const pivot = { x: t.x, y: t.y + 3.4, z: t.z };
  return { pivot, dir, desired: { x: pivot.x - dir.x * distance, y: pivot.y + 1 - dir.y * distance, z: pivot.z - dir.z * distance } };
}

// A gun can bear on a bearing relative to the hull: the Mark IV's 6-pounders
// sit in side sponsons, the A7V's and Saint-Chamond's guns in the nose.
export function cannonBears(t: Tank, yaw: number) {
  const rel = Math.abs(angleDelta(t.yaw, yaw));
  return t.model === "mark-iv" ? rel > 0.35 && rel < 2.75 : rel < (t.model === "a7v" ? 0.8 : 0.55);
}

function cannonMuzzle(t: Tank, yaw: number, pitch: number): V3 {
  const rel = angleDelta(t.yaw, yaw);
  const mount = t.model === "mark-iv" ? toWorld(t, 0.6, Math.sign(rel) * (halfW + 0.15)) : toWorld(t, halfL + 0.15, t.model === "saint-chamond" ? 0 : 0.3);
  const d = lookDir(yaw, pitch);
  return { x: mount.x + d.x * 0.6, y: t.y + 1.25 + d.y * 0.6, z: mount.z + d.z * 0.6 };
}

// A mount's position in the world.
export function mountAt(t: Tank, m: GunMount): V3 {
  const at = toWorld(t, m.f, m.s);
  return { x: at.x, y: t.y + m.y, z: at.z };
}

// The machine gun that fires at a point: of the mounts whose arc covers it
// with a clear line past the hull, the nearest. -1 when none can bear.
export function bearingMount(t: Tank, target: V3) {
  let best = -1, nearest = Infinity;
  machineGunMounts[t.model].forEach((m, i) => {
    const at = mountAt(t, m);
    const d = Math.hypot(target.x - at.x, target.z - at.z);
    if (d < 0.5 || d >= nearest) return;
    const bearing = Math.atan2(target.x - at.x, at.z - target.z);
    if (Math.abs(angleDelta(t.yaw + m.bearing, bearing)) > m.arc) return;
    if (rayHull(t, mgMuzzle(t, m, target), target) < 1) return;
    best = i;
    nearest = d;
  });
  return best;
}

// Where a machine gun's bullets start: just outside the plates along its line.
function mgMuzzle(t: Tank, m: GunMount, target: V3): V3 {
  const at = mountAt(t, m);
  const len = Math.max(0.001, Math.hypot(target.x - at.x, target.y - at.y, target.z - at.z));
  const d = { x: (target.x - at.x) / len, y: (target.y - at.y) / len, z: (target.z - at.z) / len };
  const reach = 6;
  const out = { x: at.x + d.x * reach, y: at.y + d.y * reach, z: at.z + d.z * reach };
  // rayHull from outside back in finds where the line leaves the hull.
  const exit = reach * (1 - rayHull(t, out, at)) + 0.2;
  return { x: at.x + d.x * exit, y: at.y + d.y * exit, z: at.z + d.z * exit };
}

// What lies first along a ray: the world, a soldier outside a tank, or a tank.
function firstHit(g: Game, from: V3, to: V3, self?: Tank) {
  let t = g.collision.ray(from, to), victim: Soldier | undefined, tank: Tank | undefined;
  for (const q of g.players) {
    if (q.hp <= 0 || q.tank !== undefined) continue;
    if (Math.abs(q.x - from.x) > Math.abs(to.x - from.x) + 1 && Math.abs(q.z - from.z) > Math.abs(to.z - from.z) + 1) continue;
    for (const y of hitHeights(q)) {
      const s = raySphere(from, to, { x: q.x, y: q.y + y, z: q.z }, hitRadius(q));
      if (s < t) { t = s; victim = q; }
    }
  }
  const armour = rayTanks(g, from, to, self);
  if (armour.t < t) { t = armour.t; tank = armour.tank; victim = undefined; }
  return { t, victim, tank, at: { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t } };
}

function aimPoint(g: Game, t: Tank, p: Soldier, yaw: number, pitch: number, range: number): V3 {
  if (!g.humanPlayerIds.includes(p.id)) {
    const d = lookDir(yaw, pitch), from = { x: t.x, y: t.y + 1.35, z: t.z };
    return { x: from.x + d.x * range, y: from.y + d.y * range, z: from.z + d.z * range };
  }
  const view = tankCamera(t, yaw, pitch);
  const f = g.collision.ray(view.pivot, view.desired) * 0.95;
  const camera = { x: view.pivot.x + (view.desired.x - view.pivot.x) * f, y: view.pivot.y + (view.desired.y - view.pivot.y) * f, z: view.pivot.z + (view.desired.z - view.pivot.z) * f };
  const far = { x: camera.x + view.dir.x * (range + 10), y: camera.y + view.dir.y * (range + 10), z: camera.z + view.dir.z * (range + 10) };
  // Skip past the commander's own hull.
  const start = rayHull(t, far, camera);
  const near = { x: far.x + (camera.x - far.x) * start, y: far.y + (camera.y - far.y) * start, z: far.z + (camera.z - far.z) * start };
  return firstHit(g, near, far, t).at;
}

function fireMachineGun(g: Game, t: Tank, p: Soldier) {
  const gun = t.mg;
  if (gun.reloadAt || gun.ammo <= 0 || g.tick < gun.nextShot || gun.mount < 0) return;
  const profile = weaponProfile({ weapon: "machineGun", weaponId: gun.weaponId });
  const spread = 0.012 + t.splash * 0.05;
  const target = t.aim;
  const from = mgMuzzle(t, machineGunMounts[t.model][gun.mount], target);
  const len = Math.max(0.001, Math.hypot(target.x - from.x, target.y - from.y, target.z - from.z));
  let d = { x: (target.x - from.x) / len, y: (target.y - from.y) / len, z: (target.z - from.z) / len };
  d = { x: d.x + (g.random() - 0.5) * spread, y: d.y + (g.random() - 0.5) * spread, z: d.z + (g.random() - 0.5) * spread };
  const n = Math.hypot(d.x, d.y, d.z), speed = profile.projectileSpeed;
  const shot: Projectile = {
    origin: { ...from }, weapon: "machineGun", weaponId: gun.weaponId,
    id: ++g.projectileSequence, damage: profile.damage, actor: p.id, team: p.team, ...from,
    vx: (d.x / n) * speed, vy: (d.y / n) * speed, vz: (d.z / n) * speed,
    remaining: 70, bornAt: g.tick,
  };
  gun.ammo--;
  gun.nextShot = g.tick + tankRules.mgShotTicks;
  if (!gun.ammo && gun.reserve) gun.reloadAt = g.tick + tankRules.mgReloadTicks;
  p.lastShotAt = g.tick;
  p.protectedUntil = 0;
  g.projectiles.push(shot);
  g.emit({
    type: "fire", weapon: "machineGun", weaponId: gun.weaponId, actor: p.id, projectile: shot.id,
    recoil: { pitch: 0, yaw: 0 }, from,
    to: { x: from.x + (shot.vx / speed) * 70, y: from.y + (shot.vy / speed) * 70, z: from.z + (shot.vz / speed) * 70 },
  });
}

// Whether the main gun can reach where the crosshair rests: ground, a
// parapet or sandbags stopping the shell more than a few metres short means
// the gun, sitting low in the hull, cannot see what the commander sees.
export const cannonBlockedShort = 3;
function cannonLine(g: Game, t: Tank, p: Soldier, yaw: number, pitch: number) {
  const target = aimPoint(g, t, p, yaw, pitch, tankRules.cannonRange);
  const from = cannonMuzzle(t, yaw, pitch);
  const len = Math.hypot(target.x - from.x, target.y - from.y, target.z - from.z);
  return { target, from, clear: (1 - g.collision.ray(from, target)) * len <= cannonBlockedShort };
}

function fireCannon(g: Game, t: Tank, p: Soldier, line?: ReturnType<typeof cannonLine>) {
  const gun = t.cannon;
  if (gun.ammo <= 0 || g.tick < gun.nextShot || !line?.clear) return false;
  const { target, from } = line;
  const spread = 0.006 + t.splash * 0.03;
  const len = Math.max(0.001, Math.hypot(target.x - from.x, target.y - from.y, target.z - from.z));
  const range = Math.min(tankRules.cannonRange, len + 2);
  const d = {
    x: (target.x - from.x) / len + (g.random() - 0.5) * spread,
    y: (target.y - from.y) / len + (g.random() - 0.5) * spread,
    z: (target.z - from.z) / len + (g.random() - 0.5) * spread,
  };
  const n = Math.hypot(d.x, d.y, d.z);
  const speed = tankRules.shellSpeed;
  gun.ammo--;
  gun.nextShot = g.tick + tankRules.cannonReloadTicks;
  gun.firedAt = g.tick;
  gun.muzzle = from;
  p.protectedUntil = 0;
  g.tanks.shells.push({
    id: ++g.tanks.sequence, tank: t.id, actor: p.id, team: p.team, ...from, previous: { ...from },
    vx: (d.x / n) * speed, vy: (d.y / n) * speed, vz: (d.z / n) * speed, remaining: range,
  });
  g.emit({ type: "tank", tank: t.id, team: t.team, phase: "cannon", actor: p.id, at: from, to: { x: from.x + (d.x / n) * range, y: from.y + (d.y / n) * range, z: from.z + (d.z / n) * range } });
  return true;
}

// Shells move one tick's flight and burst on the first thing in their way.
function advanceShells(g: Game) {
  const shells = g.tanks.shells;
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i];
    s.previous = { x: s.x, y: s.y, z: s.z };
    const speed = Math.hypot(s.vx, s.vy, s.vz), step = Math.min(s.remaining, speed / 30);
    const to = { x: s.x + (s.vx / speed) * step, y: s.y + (s.vy / speed) * step, z: s.z + (s.vz / speed) * step };
    const hit = firstHit(g, s, to, g.tanks.list.find(t => t.id === s.tank));
    s.remaining -= step;
    if (hit.t >= 1 && s.remaining > 1e-6) {
      Object.assign(s, to);
      continue;
    }
    shells.splice(i, 1);
    // A shell that flies its full range bursts where it comes down.
    const at = hit.t < 1 ? hit.at : { ...to, y: Math.max(to.y, groundHeight(to.x, to.z, g.map)) };
    const hits = g.explode(at, s.actor, s.team, tankShellProfile);
    g.emit({ type: "grenadeExplosion", actor: s.actor, grenade: -s.tank, at, radius: tankShellProfile.radius, hits });
  }
}

// ---- Crew ----------------------------------------------------------------

// One crew member drives and fights the tank: W/S throttle, A/D steer, the
// mouse lays the guns, left button the machine guns, right button the main gun.
export function operateTank(g: Game, p: Soldier, t: Tank, c: Command) {
  p.yaw = c.yaw;
  p.pitch = Math.max(-0.5, Math.min(0.5, c.pitch));
  t.aimYaw = p.yaw;
  t.aimPitch = p.pitch;
  const human = g.humanPlayerIds.includes(p.id);
  const slowed = human ? 1 : 1 - 0.5 * t.splash;
  drive(g, t, (c.drive?.throttle ?? 0) * slowed, c.drive?.turn ?? 0);
  seat(t, p);
  t.aim = aimPoint(g, t, p, p.yaw, p.pitch, 70);
  t.mg.mount = bearingMount(t, t.aim);
  if (c.fire) fireMachineGun(g, t, p);
  // Holding the right button keeps the main gun firing each time it is
  // loaded and bears, so a press during the reload is not lost.
  const line = cannonBears(t, p.yaw) ? cannonLine(g, t, p, p.yaw, p.pitch) : undefined;
  t.cannon.clear = line?.clear ?? true;
  t.cannon.held = !!c.aim;
  if (t.cannon.held && !fireCannon(g, t, p, line)) t.cannon.refused = g.tick;
}

// Whether the tank could drive a few metres along a heading without being
// blocked or ditched. Trees count as clear: the tank pushes them over.
function clearAhead(g: Game, t: Tank, heading: number) {
  const fw = forwardOf(heading);
  for (const d of [1.5, 3, 4.5, 6]) {
    const x = t.x + fw.x * d, z = t.z + fw.z * d;
    const next = settle(g, t, x, z, heading);
    if (!next.ok && next.hit?.kind !== "tree") return false;
    if (next.ok && next.pose.gap >= tankRules.ditchGap) return false;
  }
  return true;
}

// A bot commander: make for the nearest flag not yet held, stop short of it,
// and shoot whatever enemy it can see.
export function tankBotCommand(g: Game, p: Soldier, t: Tank): Command {
  const c = idle();
  c.yaw = p.yaw;
  c.pitch = 0;
  c.drive = { throttle: 0, turn: 0 };
  const bot = t.bot;
  if (g.tick >= bot.nextPlan) {
    bot.nextPlan = g.tick + 150 + (t.id % 30);
    const ctf = g.scoring === "ctf";
    const sectors = g.sectors.filter(s => ctf ? s.home !== t.team : s.owner !== t.team || s.contested);
    const pick = (sectors.length ? sectors : g.sectors.filter(s => s.home !== t.team)).sort((a, b) => dist(a, t) - dist(b, t))[0] ?? g.sectors[0];
    bot.objective = pick ? { x: pick.x, z: pick.z } : undefined;
  }
  // Targets: the nearest enemy soldier or tank in sight.
  if (g.tick >= bot.nextScan) {
    bot.nextScan = g.tick + 10;
    bot.target = -1;
    const eye = { x: t.x, y: t.y + tankRules.height + 0.2, z: t.z };
    let best = tankRules.sight;
    for (const q of g.players) {
      if (q.hp <= 0 || q.team === t.team || q.tank !== undefined || g.tick < q.protectedUntil) continue;
      const d = dist(q, t);
      if (d >= best) continue;
      if (g.collision.ray(eye, { x: q.x, y: q.y + 1.2, z: q.z }) < 0.99) continue;
      best = d;
      bot.target = q.id;
    }
    if (bot.target < 0) {
      const enemy = g.tanks.list.find(o => o.team !== t.team && alive(o) && dist(o, t) < tankRules.sight &&
        g.collision.ray(eye, { x: o.x, y: o.y + 1.5, z: o.z }) > 0.99);
      if (enemy) bot.target = -1000 - enemy.id;
    }
  }
  const enemyTank = bot.target <= -1000 ? g.tanks.list.find(o => o.id === -1000 - bot.target && alive(o)) : undefined;
  const target = bot.target >= 0 ? g.players[bot.target] : undefined;
  const aimAt = target && target.hp > 0 && target.tank === undefined ? { x: target.x, y: target.y + 1.1, z: target.z } :
    enemyTank ? { x: enemyTank.x, y: enemyTank.y + 1.2, z: enemyTank.z } : undefined;
  if (aimAt) {
    const from = { x: t.x, y: t.y + 1.35, z: t.z };
    const error = g.botSettings.aimError * (1 + 3 * t.splash);
    c.yaw = Math.atan2(aimAt.x - from.x, from.z - aimAt.z) + (g.random() - 0.5) * error;
    c.pitch = Math.atan2(aimAt.y - from.y, Math.hypot(aimAt.x - from.x, aimAt.z - from.z)) + (g.random() - 0.5) * error;
    const range = dist(aimAt, t);
    c.fire = !!target && (g.tick + t.id * 7) % 24 < 14;
    // The main gun for tanks, knots of men and machine-gun posts.
    const knot = target ? g.players.filter(q => q.hp > 0 && q.team === target.team && dist(q, target) < 4).length >= 2 : false;
    const post = target ? [...g.emplacements.values()].some(e => e.team === target.team && dist(e.at, target) < 3) : false;
    c.aim = range > 12 && range < 80 && (!!enemyTank || knot || post) && g.tick >= t.cannon.nextShot && cannonBears(t, c.yaw);
  }
  const goal = bot.objective;
  if (!goal || !mobile(t)) return c;
  // Stuck: back off and swing round for a few seconds.
  if (g.tick - bot.check.tick >= 90) {
    const progress = Math.hypot(t.x - bot.check.x, t.z - bot.check.z);
    const far = dist(goal, t) > tankRules.standoff + 1;
    if (far && progress < 0.4 && g.tick >= bot.reverseUntil) {
      bot.reverseUntil = g.tick + 90;
      bot.turn = g.random() < 0.5 ? -1 : 1;
      bot.heading = undefined;
    }
    bot.check = { x: t.x, z: t.z, tick: g.tick };
  }
  if (g.tick < bot.reverseUntil) {
    c.drive = { throttle: -1, turn: bot.turn };
    return c;
  }
  const d = dist(goal, t);
  if (d < tankRules.standoff) return c;
  const direct = Math.atan2(goal.x - t.x, t.z - goal.z);
  if (g.tick >= bot.nextSteer || bot.heading === undefined) {
    bot.nextSteer = g.tick + 15;
    // Keep a detour while it stays open and roughly on course.
    const keep = bot.heading !== undefined && Math.abs(angleDelta(direct, bot.heading)) < 1.2 && clearAhead(g, t, bot.heading);
    if (!keep || clearAhead(g, t, direct)) {
      bot.heading = direct;
      for (const offset of [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.75, -1.75])
        if (clearAhead(g, t, direct + offset * bot.turn)) { bot.heading = direct + offset * bot.turn; break; }
    }
  }
  const want = bot.heading ?? direct, off = angleDelta(t.yaw, want);
  c.drive = {
    turn: Math.max(-1, Math.min(1, off * 2.5)),
    throttle: Math.abs(off) > 0.6 ? 0 : Math.min(1, (d - tankRules.standoff) / 6 + 0.3),
  };
  return c;
}

// Once a tick, before soldiers act.
export function advanceTanks(g: Game) {
  const state = g.tanks;
  if (!state?.enabled) return;
  for (const team of ["blue", "red"] as const)
    if (!activeTank(g, team) && g.tick >= state.nextSpawn[team]) {
      state.nextSpawn[team] = g.tick + 150;
      spawnTank(g, team);
    }
  advanceShells(g);
  for (const t of state.list) {
    t.previous = { x: t.x, y: t.y, z: t.z, yaw: t.yaw, pitch: t.pitch, roll: t.roll };
    t.splash = Math.max(0, t.splash - tankRules.splashDecayPerTick);
    if (!alive(t)) continue;
    if (t.mg.reloadAt && g.tick >= t.mg.reloadAt) {
      const n = Math.min(tankRules.mgBelt - t.mg.ammo, t.mg.reserve);
      t.mg.ammo += n;
      t.mg.reserve -= n;
      t.mg.reloadAt = 0;
    }
    if (t.state === "ditched" && g.tick >= t.until) unditch(g, t);
    if (t.state === "stalled" && g.tick >= t.until) {
      t.state = "mobile";
      g.emit({ type: "tank", tank: t.id, team: t.team, phase: "restarted", at: { x: t.x, y: t.y, z: t.z } });
    }
    const driver = t.driver === undefined ? undefined : g.players[t.driver];
    if (driver && (driver.hp <= 0 || driver.tank !== t.id)) t.driver = undefined;
    fill(g, t);
  }
}

export const tankLabel = (t: Tank) =>
  t.state === "wreck" ? "KNOCKED OUT" : t.state === "immobilized" ? "TRACK THROWN · GUNS ONLY" :
  t.state === "ditched" ? "DITCHED · CREW UNDITCHING" : t.state === "stalled" ? "ENGINE STALLED" : "UNDER WAY";
