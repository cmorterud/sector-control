// Presentation only: each side's field battery, parked behind its spawn, and
// the shells it fires. The simulation owns a shell for its last 16 ticks
// (src/artillery.ts launchShell: 35 m up, 12 m out, falling onto the target);
// this file works out, from what the simulation has already decided, when a
// gun has to fire for its shell to arrive at that hand-off point on time, and
// where the shell is in between. Nothing here changes a match: the timing,
// scatter and damage of every strike stay as they were.
import { artilleryRules, nextAmbientShell, shellStart } from "./artillery";
import { backdropHeight, backdropScenery } from "./backdrop";
import { verdunBackdropScenery, verdunDeadZoneTrees } from "./verdun-backdrop";
import { gasShellTarget, gasStrikeRules } from "./gas";
import { groundHeight, type MapDefinition, type Vec } from "./map";
import type { Game, Team, V3 } from "./simulation";

export const batteryRules = {
  guns: 4,
  // Metres between guns along the battery's line.
  spacing: 13,
  // How far beyond the terrain edge the battery stands on maps that draw the
  // land out there: past the level band at the seam, 55 to 65 m behind the
  // soldiers deploying at the spawn.
  rear: 28,
  // A map bounded by the sea has no land to show a battery on: it fires from
  // out of sight this far beyond the edge, and only its flash over the water
  // and its shells climbing over the horizon are seen.
  hiddenRear: 90,
  hiddenHeight: 6,
  // Keep this far from the far scenery's ruins, parapets and trees.
  clearance: 3,
  // A shell's flight from the muzzle to its hand-off, at about this mean speed
  // over the ground, within these bounds. The longest has to fit inside the
  // gas strike's 3 s lead (74 ticks before its first hand-off) with the crew's
  // reaction; a high-explosive mission has 104.
  speed: 125,
  minFlightTicks: 36,
  maxFlightTicks: 66,
  // Trunnion height and barrel length (to the muzzle) of the field gun model.
  trunnion: 1.15,
  barrel: 2.7,
  // How long a gun recoils after firing, in ticks.
  recoilTicks: 24,
};

export interface BatteryGun {
  team: Team;
  index: number;
  x: number;
  y: number;
  z: number;
  // Facing toward the enemy, as a yaw (0 looks along -z, the game's convention).
  yaw: number;
  // Out of sight beyond the horizon: no model is drawn.
  hidden: boolean;
}

// The far scenery a gun must not stand in.
function obstacles(map: MapDefinition): { x: number; z: number; r: number }[] {
  if (!map.backdrop) return [];
  const boxes: { x: number; z: number; w: number; d: number }[] =
    map.id === "verdun" ? [...verdunBackdropScenery(map).boxes, ...verdunDeadZoneTrees(map).map((t) => ({ ...t, d: t.w }))] : backdropScenery(map).boxes;
  return boxes.map((b) => ({ x: b.x, z: b.z, r: Math.hypot(b.w, b.d) / 2 }));
}

const guns = new WeakMap<MapDefinition, BatteryGun[]>();
// The guns of both sides for a map: Blue's past the west edge, Red's past the
// east, centred on the spawn's line along the front, each stepped along the
// line clear of the far scenery.
export function batteryGuns(map: MapDefinition): BatteryGun[] {
  let list = guns.get(map);
  if (list) return list;
  list = [];
  const hidden = !!map.coast, blocks = obstacles(map);
  const clear = (x: number, z: number) => blocks.every((b) => Math.hypot(b.x - x, b.z - z) > b.r + batteryRules.clearance);
  for (const team of ["blue", "red"] as const) {
    const side = team === "blue" ? -1 : 1, x = side * (map.width / 2 + (hidden ? batteryRules.hiddenRear : batteryRules.rear));
    for (let i = 0; i < batteryRules.guns; i++) {
      const z0 = map.spawn[team].z + (i - (batteryRules.guns - 1) / 2) * batteryRules.spacing;
      let at = { x, z: z0 };
      search: for (const back of [0, 4, 8]) for (const dz of [0, 2, -2, 4, -4]) {
        if (clear(x + side * back, z0 + dz)) { at = { x: x + side * back, z: z0 + dz }; break search; }
      }
      const y = hidden ? groundHeight(at.x, at.z, map) + batteryRules.hiddenHeight : batteryGround(map, at.x, at.z);
      list.push({ team, index: i, ...at, y, yaw: side < 0 ? Math.PI / 2 : -Math.PI / 2, hidden });
    }
  }
  guns.set(map, list);
  return list;
}
// The land a gun stands on: the far ground's height for maps that draw it,
// otherwise the terrain at its edge.
export function batteryGround(map: MapDefinition, x: number, z: number) {
  return map.backdrop ? backdropHeight(map, x, z) : groundHeight(x, z, map);
}

export interface BatteryShot {
  key: string;
  team: Team;
  // Index into batteryGuns(map).
  gun: number;
  fireTick: number;
  handoffTick: number;
  gas: boolean;
  muzzle: V3;
  // Velocity at the muzzle and the constant acceleration that carries the
  // shell to the hand-off point with the simulation's own velocity there.
  v0: V3;
  a: V3;
}

// A shell flying under a constant acceleration from `from` that reaches `to`
// after `seconds` moving at `v1`: a parabola in every axis, so the arc rises
// high and steep out of the gun and plunges onto the target, and the hand-off
// to the simulation's falling shell has no kink in position or speed.
export function arc(from: V3, to: V3, v1: V3, seconds: number) {
  const v0 = {
    x: (2 * (to.x - from.x)) / seconds - v1.x,
    y: (2 * (to.y - from.y)) / seconds - v1.y,
    z: (2 * (to.z - from.z)) / seconds - v1.z,
  };
  const a = { x: (v1.x - v0.x) / seconds, y: (v1.y - v0.y) / seconds, z: (v1.z - v0.z) / seconds };
  return { v0, a };
}

export function flightTicks(from: Vec, to: Vec) {
  const ticks = Math.round((Math.hypot(to.x - from.x, to.z - from.z) / batteryRules.speed) * 30);
  return Math.max(batteryRules.minFlightTicks, Math.min(batteryRules.maxFlightTicks, ticks));
}

// The muzzle of a gun laid toward a hand-off point: aim from the trunnion,
// then measure the arc from the muzzle that aim puts it at.
function plan(g: Game, key: string, gunIndex: number, team: Team, target: Vec, handoffTick: number, gas: boolean): BatteryShot {
  const gun = batteryGuns(g.map)[gunIndex];
  const start = shellStart(g, target, team);
  const to = { x: start.x, y: start.y, z: start.z }, v1 = { x: start.vx, y: start.vy, z: start.vz };
  const ticks = flightTicks(gun, to), seconds = ticks / 30;
  const trunnion = { x: gun.x, y: gun.y + batteryRules.trunnion, z: gun.z };
  const laid = arc(trunnion, to, v1, seconds).v0, speed = Math.hypot(laid.x, laid.y, laid.z);
  const muzzle = {
    x: trunnion.x + (laid.x / speed) * batteryRules.barrel,
    y: trunnion.y + (laid.y / speed) * batteryRules.barrel,
    z: trunnion.z + (laid.z / speed) * batteryRules.barrel,
  };
  const { v0, a } = arc(muzzle, to, v1, seconds);
  return { key, team, gun: gunIndex, fireTick: handoffTick - ticks, handoffTick, gas, muzzle, v0, a };
}

// Where a shell is `seconds` after it left the muzzle.
export function shotPosition(shot: BatteryShot, seconds: number, out: V3 = { x: 0, y: 0, z: 0 }): V3 {
  const h = (seconds * seconds) / 2;
  out.x = shot.muzzle.x + shot.v0.x * seconds + shot.a.x * h;
  out.y = shot.muzzle.y + shot.v0.y * seconds + shot.a.y * h;
  out.z = shot.muzzle.z + shot.v0.z * seconds + shot.a.z * h;
  return out;
}
export function shotVelocity(shot: BatteryShot, seconds: number, out: V3 = { x: 0, y: 0, z: 0 }): V3 {
  out.x = shot.v0.x + shot.a.x * seconds;
  out.y = shot.v0.y + shot.a.y * seconds;
  out.z = shot.v0.z + shot.a.z * seconds;
  return out;
}

const gunFor = (team: Team, i: number) => (team === "blue" ? 0 : batteryRules.guns) + (i % batteryRules.guns);

// Every shell the batteries fire for what the simulation has scheduled: each
// fire mission's eight shells, each gas strike's four and the next stray. A
// shot is planned once (it reads the ground under its target) and kept by key
// in `cache` until its hand-off has passed.
export class BatteryPlan {
  private cache = new Map<string, BatteryShot>();
  private seen = new Set<string>();
  shots: BatteryShot[] = [];
  private game?: Game;
  // The next stray, read again only when the stream moves on.
  private stray?: { nextAt: number; seed: number; shell: ReturnType<typeof nextAmbientShell> };

  update(g: Game): BatteryShot[] {
    if (g !== this.game) {
      this.cache.clear();
      this.stray = undefined;
      this.game = g;
    }
    this.shots.length = 0;
    this.seen.clear();
    if (!g.artillery.enabled) return this.shots;
    const drop = artilleryRules.flightTicks;
    const want = (key: string, team: Team, gun: number, target: Vec, handoff: number, gas = false) => {
      this.seen.add(key);
      let shot = this.cache.get(key);
      if (!shot) this.cache.set(key, (shot = plan(g, key, gun, team, target, handoff, gas)));
      this.shots.push(shot);
    };
    for (const m of g.artillery.missions)
      for (let i = 0; i < m.impacts.length; i++)
        want(`m${m.id}.${i}`, m.team, gunFor(m.team, i), m.impacts[i], m.firstImpactAt - drop + m.impactOffsets[i]);
    for (const cloud of g.gas.clouds) {
      if (cloud.launched === undefined) continue;
      for (let i = 0; i < gasStrikeRules.shells; i++)
        want(`g${cloud.id}.${i}`, cloud.team, gunFor(cloud.team, i + cloud.id), gasShellTarget(cloud, i), cloud.landAt - drop + gasStrikeRules.shellSpread[i], true);
    }
    if (g.phase === "playing") {
      const { nextAt, seed } = g.artillery.ambient;
      if (this.stray?.nextAt !== nextAt || this.stray.seed !== seed) this.stray = { nextAt, seed, shell: nextAmbientShell(g) };
      const stray = this.stray.shell;
      if (stray) want(`a${stray.tick}`, stray.team, gunFor(stray.team, stray.tick), stray.target, stray.tick);
    }
    for (const key of this.cache.keys()) if (!this.seen.has(key)) this.cache.delete(key);
    return this.shots;
  }
}
