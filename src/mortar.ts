// The trench mortar: Support's second set-up kit. It goes down like the
// emplaced machine gun (src/emplacements.ts), then the mortarman turns the
// tube, winds the range card between 40 and 80 m and drops bombs one at a
// time. Each bomb lobs high and lands inside a ring around the aim point that
// blooms when the tube is moved or fired and settles while it is still.
import { angleDelta } from "./awareness";
import { emplacementRules, type Emplacement } from "./emplacements";
import { dist, groundHeight, type Vec } from "./map";
import { mortarExplosionProfile, mortarRules } from "./mortar-stats";
import type { Command, Game, Soldier, Team, V3 } from "./simulation";
import { spawnLineDistance } from "./spawn-front";
import { teamSpawn } from "./offensive";

export interface MortarBomb extends V3 {
  id: number;
  actor: number;
  team: Team;
  // The tube it left, and the point it was aimed at.
  owner: number;
  from: V3;
  aim: Vec;
  // Where it will come down.
  target: V3;
  weaponId: string;
  vx: number;
  vy: number;
  vz: number;
  bornAt: number;
  landsAt: number;
  whistled?: boolean;
}
export interface MortarState { bombs: MortarBomb[]; sequence: number }
export const createMortarState = (): MortarState => ({ bombs: [], sequence: 0 });

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const clampRange = (range: number) => clamp(range, mortarRules.minRange, mortarRules.maxRange);

// The ring the next bomb will land in, in metres from the aim point.
export const mortarSpread = (gun: Pick<Emplacement, "mortar">) =>
  mortarRules.spread + (gun.mortar?.bloom ?? 0);

export function flightTicks(range: number) {
  const [short, long] = mortarRules.flightTicks;
  const t = (clampRange(range) - mortarRules.minRange) / (mortarRules.maxRange - mortarRules.minRange);
  return Math.round(short + (long - short) * t);
}

// Where the tube is laid: its range along its bearing, on the ground there.
export function mortarAim(g: Game, gun: Emplacement): V3 {
  const range = gun.mortar?.range ?? mortarRules.startRange;
  const x = gun.at.x + Math.sin(gun.yaw) * range, z = gun.at.z - Math.cos(gun.yaw) * range;
  return { x, y: surfaceAt(g, x, z), z };
}

// The top surface under a point: a roof, a parapet or the ground.
function surfaceAt(g: Game, x: number, z: number) {
  const floor = groundHeight(x, z, g.map);
  const above = { x, y: floor + 40, z }, below = { x, y: floor + 0.025, z };
  return above.y + (below.y - above.y) * g.collision.ray(above, below);
}

// No bombs on either side's deployment line: spawns are not a target.
export function mortarTargetBlocked(g: Game, at: Vec) {
  return (["blue", "red"] as const).some(team =>
    dist(g.map.spawn[team], at) < mortarRules.spawnClearance ||
    spawnLineDistance(g.map, team, at, teamSpawn(g, team)) < mortarRules.spawnClearance);
}

export function operateMortar(g: Game, p: Soldier, gun: Emplacement, c: Command) {
  const m = gun.mortar!;
  // A human winds the range with forward/back; a bot names the range it wants.
  const throttle = c.drive?.throttle ?? 0;
  const wanted = c.mortarRange ?? m.range + throttle * mortarRules.rangeRate;
  const step = mortarRules.rangeRate / 30;
  const range = clampRange(m.range + clamp(wanted - m.range, -step, step));
  const arc = angleDelta(gun.baseYaw, c.yaw);
  const yaw = gun.baseYaw + clamp(arc, -emplacementRules.traverse, emplacementRules.traverse);
  m.bloom = Math.min(mortarRules.bloomMax, m.bloom +
    Math.abs(angleDelta(gun.yaw, yaw)) * mortarRules.bloomPerRadian + Math.abs(range - m.range) * mortarRules.bloomPerMetre);
  m.range = range;
  gun.yaw = yaw;
  // The view looks where the player looks; the tube's elevation follows the range.
  gun.pitch = clamp(c.pitch, -0.45, 0.5);
  Object.assign(c, { x: 0, z: 0, sprint: false, crouch: true });
  Object.assign(p, gun.seat, { yaw: gun.yaw, pitch: gun.pitch, crouched: true, vx: 0, vz: 0, triggerPressed: false, triggerHeld: c.fire });
  if (c.fire && gun.ammo > 0 && g.tick >= gun.nextShot && g.tick >= gun.readyAt && g.tick >= p.staggerUntil)
    fireMortar(g, p, gun);
}

export function fireMortar(g: Game, p: Soldier, gun: Emplacement) {
  const aim = mortarAim(g, gun);
  if (mortarTargetBlocked(g, aim)) {
    gun.nextShot = g.tick + 15;
    g.emit({ type: "mortar", phase: "refused", actor: p.id, owner: gun.owner, at: aim });
    return;
  }
  // Uniform over the ring's area, so most bombs fall well inside it.
  const r = mortarSpread(gun) * Math.sqrt(g.random()), a = g.random() * Math.PI * 2;
  const x = aim.x + Math.cos(a) * r, z = aim.z + Math.sin(a) * r;
  const target = { x, y: surfaceAt(g, x, z), z };
  const from = { ...gun.at, y: gun.at.y + mortarRules.muzzleHeight };
  const ticks = flightTicks(gun.mortar!.range), t = ticks / 30;
  const bomb: MortarBomb = {
    id: ++g.mortars.sequence, actor: p.id, team: p.team, owner: gun.owner, from: { ...from }, aim: { x: aim.x, z: aim.z }, target,
    weaponId: gun.weaponId, ...from,
    vx: (target.x - from.x) / t,
    vy: (target.y - from.y) / t + mortarRules.gravity * t / 2,
    vz: (target.z - from.z) / t,
    bornAt: g.tick, landsAt: g.tick + ticks,
  };
  g.mortars.bombs.push(bomb);
  gun.ammo--;
  gun.nextShot = g.tick + mortarRules.loadTicks;
  gun.lastShotAt = g.tick;
  gun.mortar!.bloom = Math.min(mortarRules.bloomMax, gun.mortar!.bloom + mortarRules.bloomPerShot);
  p.protectedUntil = 0;
  g.emit({ type: "mortar", phase: "launch", actor: p.id, owner: gun.owner, at: from, bomb: bomb.id, landsAt: bomb.landsAt });
}

export function advanceMortars(g: Game) {
  for (const gun of g.emplacements.values())
    if (gun.mortar) gun.mortar.bloom = Math.max(0, gun.mortar.bloom - mortarRules.bloomSettle / 30);
  const flying: MortarBomb[] = [];
  for (const bomb of g.mortars.bombs) {
    if (!bomb.whistled && bomb.landsAt - g.tick <= mortarRules.whistleTicks) {
      bomb.whistled = true;
      // Where it is going to come down, as the falling whistle gives it away.
      const t = (bomb.landsAt - g.tick) / 30;
      g.emit({ type: "mortar", phase: "whistle", actor: bomb.actor, owner: bomb.owner, bomb: bomb.id, landsAt: bomb.landsAt,
        at: { x: bomb.x + bomb.vx * t, y: bomb.y, z: bomb.z + bomb.vz * t } });
    }
    const from = { x: bomb.x, y: bomb.y, z: bomb.z };
    const to = {
      x: bomb.x + bomb.vx / 30,
      y: bomb.y + bomb.vy / 30 - mortarRules.gravity / (2 * 30 * 30),
      z: bomb.z + bomb.vz / 30,
    };
    bomb.vy -= mortarRules.gravity / 30;
    // Leaving the tube it cannot strike its own baseplate.
    let fraction = g.tick - bomb.bornAt < 3 ? 1 : g.collision.ray(from, to);
    if (to.y <= groundHeight(to.x, to.z, g.map) + 0.025) {
      let low = 0, high = 1;
      for (let i = 0; i < 12; i++) {
        const t = (low + high) / 2;
        const y = from.y + (to.y - from.y) * t;
        if (y <= groundHeight(from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t, g.map) + 0.025) high = t;
        else low = t;
      }
      fraction = Math.min(fraction, high);
    }
    bomb.x = from.x + (to.x - from.x) * fraction;
    bomb.y = from.y + (to.y - from.y) * fraction;
    bomb.z = from.z + (to.z - from.z) * fraction;
    if (fraction < 1 || g.tick - bomb.bornAt > mortarRules.flightTicks[1] + 60) detonate(g, bomb);
    else flying.push(bomb);
  }
  g.mortars.bombs = flying;
}

function detonate(g: Game, bomb: MortarBomb) {
  const at = { x: bomb.x, y: bomb.y + 0.025, z: bomb.z };
  const hits = g.explode(at, bomb.actor, bomb.team, { ...mortarExplosionProfile, label: bomb.weaponId });
  // A grenade-sized burst for the effects, sounds and hit marker.
  g.emit({ type: "grenadeExplosion", actor: bomb.actor, grenade: -1000 - bomb.id, at, radius: mortarExplosionProfile.radius, hits, mortar: true });
  g.emit({ type: "mortar", phase: "impact", actor: bomb.actor, owner: bomb.owner, bomb: bomb.id, at, aim: bomb.aim, from: bomb.from, hits });
}

// How a bomb fell against the aim point, as the mortarman reads the splash:
// along the line of fire (short or long) and across it (left or right).
export function splashReport(from: Vec, aim: Vec, at: Vec) {
  const bearing = { x: aim.x - from.x, z: aim.z - from.z }, length = Math.hypot(bearing.x, bearing.z) || 1;
  const ux = bearing.x / length, uz = bearing.z / length;
  const dx = at.x - aim.x, dz = at.z - aim.z;
  const along = dx * ux + dz * uz, across = dx * -uz + dz * ux;
  if (Math.hypot(along, across) < 2) return "ON TARGET";
  const parts: string[] = [];
  if (Math.abs(along) >= 1.5) parts.push(`${along < 0 ? "SHORT" : "LONG"} ${Math.round(Math.abs(along))} m`);
  if (Math.abs(across) >= 1.5) parts.push(`${across < 0 ? "LEFT" : "RIGHT"} ${Math.round(Math.abs(across))} m`);
  return parts.join(" · ");
}

// Maps where Support may take the mortar: those with artillery and open
// ground to lob over. The training ground and graybox maps wait.
export const mortarMap = (map: { id: string; artillery?: boolean }) =>
  map.artillery !== false && !["industrial", "training", "headland"].includes(map.id);

// The tube's elevation for a range: steepest at the shortest range, as on a
// real mortar's range table (radians above the horizon).
export function tubeElevation(range: number) {
  const t = (clampRange(range) - mortarRules.minRange) / (mortarRules.maxRange - mortarRules.minRange);
  return (80 - 25 * t) * Math.PI / 180;
}
