import {
  freshAwareness,
  awarenessSample,
  canNotice,
  observeTarget,
  turnToward,
  angleDelta,
  semiAutoIntent,
  type Awareness,
} from "./awareness";
import {
  stanceDrop,
  eyeHeightOf,
  cameraHeightOf,
  hitHeights,
  hitRadius,
  updateCrouch,
  crouchRules,
} from "./crouch";
import { smokeBlocks, smokeRules, type SmokeCloud } from "./smoke";
import { weaponAim, recoverRecoil, kickRecoil } from "./recoil";
import {
  suppressNearMiss,
  suppressionCommand,
  suppressionRules,
} from "./suppression";
import { createAssaultState, advanceAssaults, assaultCommand } from "./assault";
import {
  createArtilleryState,
  requestArtillery,
  advanceArtillery,
  botArtilleryTarget,
  evadeArtillery,
  type ArtilleryEvade,
} from "./artillery";
import {
  blocked,
  dist,
  industrialMap,
  groundHeight,
  moveOnMap,
  mantleLanding,
  mantleRoute,
  walkSegment,
  type Vec,
  type MapDefinition,
} from "./map";
import {
  runtimeMap,
  deformExplosion,
  damageVegetation,
  grenadeExplosionProfile,
  type DestructionChange,
  type ExplosionProfile,
} from "./destruction";
import { rosterWeapon, weaponProfiles, type WeaponKind } from "./weapons";
export type Team = "blue" | "red";
export type V3 = Vec & { y: number };
export interface CollisionWorld {
  setMap?(map: MapDefinition): void;
  updateWorld?(change: DestructionChange): void;
  move(from: Vec, delta: Vec): Vec;
  ray(from: V3, to: V3): number; // nearest world obstruction, fraction [0,1]
}
export interface Command {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  sprint: boolean;
  aim: boolean;
  fire: boolean;
  reload: boolean;
  mantle: boolean;
  grenade: boolean;
  artillery?: Vec & { area?: boolean };
  smoke?: boolean;
  crouch?: boolean;
}
export const idle = (): Command => ({
  x: 0,
  z: 0,
  yaw: 0,
  pitch: 0,
  sprint: false,
  aim: false,
  fire: false,
  reload: false,
  mantle: false,
  grenade: false,
});
export const grenadeFuseTicks = 90;
export const grenadeBlastRadius = grenadeExplosionProfile.radius;
export const grenadeRadius = 0.12;
export const grenadeSpeed = 20;
export const grenadeGravity = 10;
export interface Grenade extends V3 {
  kind?: "smoke";
  id: number;
  actor: number;
  team: Team;
  vx: number;
  vy: number;
  vz: number;
  bornAt: number;
  explodeAt: number;
}
export const projectileSpeed = 32;
export const projectileRange = 60;
export const rifleHeight = (map: MapDefinition, p?: Soldier) =>
  (map.terrain ? 1.65 : 1.45) - stanceDrop(p);
export const exposedAimHeight = (map: MapDefinition, p?: Soldier) =>
  (map.terrain ? 1.65 : 1.25) - stanceDrop(p);
export function firingPosition(g: Game, p: Soldier): Vec | undefined {
  const positions = g.map.terrain?.firingPositions?.filter(
    (position) => position.team === p.team,
  );
  if (p.forwardPost) return p.forwardPost;
  const original = positions?.[p.teamIndex % positions.length];
  if (!original || !g.map.destruction?.revision) return original;
  const intact = (v: Vec) =>
    groundHeight(v.x, v.z, g.map) + rifleHeight(g.map) >=
    g.map.terrain!.bankHeight + 0.04;
  if (intact(original)) return original;
  return (
    positions!
      .filter(intact)
      .sort((a, b) => dist(a, original) - dist(b, original))[0] ?? original
  );
}
export interface Projectile extends V3 {
  suppressed?: number[];
  id: number;
  actor: number;
  team: Team;
  vx: number;
  vy: number;
  vz: number;
  remaining: number;
  bornAt: number;
}
export interface Mantle {
  from: V3;
  to: V3;
  edge: V3;
  yaw: number;
  startTick: number;
  endTick: number;
}
export interface Hop {
  startTick: number;
  height: number;
  velocity: number;
  originY: number;
}
export interface Fall {
  startTick: number;
  velocity: number;
}
export const hopSpeed = 3.8;
export const hopGravity = 16;
export const smooth = (t: number) => {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
};
export const mantleProgress = (m: Mantle, tick: number) =>
  Math.max(0, Math.min(1, (tick - m.startTick) / (m.endTick - m.startTick)));
// Root height represents a standing base. Tucked legs lift the actual feet while crossing.
export function mantleFootLift(m: Mantle, tick: number): number {
  const t = mantleProgress(m, tick);
  return m.to.y > m.from.y
    ? 0.45 * smooth((t - 0.34) / 0.28) * (1 - smooth((t - 0.82) / 0.18))
    : 0.45 * smooth(t / 0.2) * (1 - smooth((t - 0.45) / 0.37));
}
export function mantlePosition(m: Mantle, tick: number): V3 {
  const t = mantleProgress(m, tick);
  const length = Math.hypot(m.to.x - m.from.x, m.to.z - m.from.z);
  const dx = (m.to.x - m.from.x) / Math.max(length, 0.001);
  const dz = (m.to.z - m.from.z) / Math.max(length, 0.001);
  const up = m.to.y > m.from.y;
  const approach = { x: m.edge.x - dx * 0.34, z: m.edge.z - dz * 0.34 };
  const points: { t: number; p: V3 }[] = up
    ? [
        { t: 0, p: m.from },
        { t: 0.16, p: { ...approach, y: m.from.y } },
        {
          t: 0.34,
          p: {
            ...approach,
            y: m.from.y + Math.min(0.55, (m.to.y - m.from.y) * 0.45),
          },
        },
        {
          t: 0.62,
          p: {
            x: m.edge.x - dx * 0.18,
            z: m.edge.z - dz * 0.18,
            y: m.to.y - 0.25,
          },
        },
        {
          t: 0.82,
          p: {
            x: m.edge.x + dx * 0.5,
            z: m.edge.z + dz * 0.5,
            y: m.to.y - 0.25,
          },
        },
        { t: 1, p: m.to },
      ]
    : [
        { t: 0, p: m.from },
        { t: 0.2, p: { ...approach, y: m.from.y - 0.2 } },
        {
          t: 0.45,
          p: {
            x: m.edge.x + dx * 0.5,
            z: m.edge.z + dz * 0.5,
            y: m.from.y - 0.25,
          },
        },
        { t: 0.82, p: { ...m.to, y: m.to.y + 0.06 } },
        { t: 1, p: m.to },
      ];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    if (t <= b.t) {
      const blend = smooth((t - a.t) / (b.t - a.t));
      return {
        x: a.p.x + (b.p.x - a.p.x) * blend,
        y: a.p.y + (b.p.y - a.p.y) * blend,
        z: a.p.z + (b.p.z - a.p.z) * blend,
      };
    }
  }
  return { ...m.to };
}
export interface Soldier extends Vec {
  weapon: WeaponKind;
  crouched: boolean;
  y: number;
  teamIndex: number;
  mantle: Mantle | null;
  hop: Hop | null;
  fall: Fall | null;
  nextHop: number;
  landedAt: number;
  nextMantle: number;
  id: number;
  team: Team;
  hp: number;
  ammo: number;
  reserve: number;
  grenades: number;
  smokes: number;
  suppression: number;
  duckUntil: number;
  nextDuck: number;
  nextNearMiss: number;
  suppressionShelter: Vec | null;
  assaultId: number | null;
  forwardPost: Vec | null;
  throwUntil: number;
  nextGrenade: number;
  yaw: number;
  pitch: number;
  vx: number;
  vz: number;
  reloadAt: number;
  nextShot: number;
  triggerHeld: boolean;
  triggerPressed: boolean;
  awareness: Awareness;
  aimBloom: number;
  recoilPitch: number;
  recoilYaw: number;
  recoilShots: number;
  lastShotAt: number;
  respawnAt: number;
  protectedUntil: number;
  kills: number;
  deaths: number;
  captures: number;
  command: Command;
  objective: number;
  path: Vec[];
  nextThink: number;
  target: number;
  spottedAt: number;
  focusUntil: number;
  distractedUntil: number;
  mode: string;
  artilleryEvade: ArtilleryEvade | null;
}
export interface Sector extends Vec {
  id: string;
  control: number;
  owner: Team | null;
  contested: boolean;
}
export interface BotSettings {
  awareness: boolean;
  reactionTicks: number;
  reactionJitterTicks: number;
  aimError: number;
  engagementRange: number;
  burstPeriodTicks: number;
  burstFireTicks: number;
  focusMinTicks: number;
  focusMaxTicks: number;
  distractionMinTicks: number;
  distractionMaxTicks: number;
}
export const defaultBotSettings: BotSettings = {
  awareness: true,
  reactionTicks: 27,
  reactionJitterTicks: 18,
  aimError: 0.075,
  engagementRange: 40,
  burstPeriodTicks: 24,
  burstFireTicks: 15,
  focusMinTicks: 60,
  focusMaxTicks: 120,
  distractionMinTicks: 24,
  distractionMaxTicks: 54,
};
export type Event = { id: number; tick: number } & (
  | {
      type: "botAttention";
      actor: number;
      target: number;
      phase: "acquired" | "lost" | "distracted";
      until: number;
    }
  | {
      type: "artilleryCall";
      actor: number;
      team: Team;
      mission: number;
      target: Vec;
      firstImpactAt: number;
      endsAt: number;
      radius: number;
      uncertainty?: number;
    }
  | {
      type: "artilleryLaunch";
      actor: number;
      mission: number;
      shell: number;
      from: V3;
    }
  | {
      type: "artilleryImpact";
      actor: number;
      mission: number;
      shell: number;
      at: V3;
      radius: number;
      hits: { target: number; damage: number }[];
    }
  | {
      type: "smokeBloom";
      actor: number;
      grenade: number;
      cloud: number;
      at: V3;
      expiresAt: number;
    }
  | { type: "smokeEnd"; cloud: number }
  | { type: "suppression"; actor: number; source: number; level: number }
  | {
      type: "nearMiss";
      actor: number;
      source: number;
      at: V3;
      distance: number;
    }
  | { type: "duck"; actor: number; phase: "start" | "end" }
  | {
      type: "assaultStart";
      mission: number;
      team: Team;
      members: number[];
      launch: Vec;
      route: Vec[];
    }
  | {
      type: "assaultProgress";
      mission: number;
      actor: number;
      stage: "crater" | "forwardCrater" | "trench";
      at: Vec;
    }
  | { type: "assaultEnd"; mission: number; team: Team; reached: number }
  | { type: "artilleryEnd"; mission: number }
  | { type: "artilleryEvade"; actor: number; mission: number; to: Vec }
  | { type: "destruction"; actor: number; change: DestructionChange }
  | {
      type: "grenadeThrow" | "smokeThrow";
      actor: number;
      grenade: number;
      from: V3;
      velocity: V3;
      explodeAt: number;
    }
  | { type: "grenadeBounce"; actor: number; grenade: number; at: V3 }
  | {
      type: "grenadeExplosion";
      actor: number;
      grenade: number;
      at: V3;
      radius: number;
      hits: { target: number; damage: number }[];
    }
  | {
      type: "fire";
      weapon?: WeaponKind;
      actor: number;
      projectile: number;
      from: V3;
      to: V3;
      recoil: { pitch: number; yaw: number };
    }
  | {
      type: "impact";
      actor: number;
      projectile: number;
      at: V3;
      target: number | null;
      hit: boolean;
    }
  | { type: "damage"; actor: number; source: number }
  | { type: "death" | "respawn" | "reload"; actor: number }
  | { type: "hop"; actor: number; phase: "start" | "land"; at: V3 }
  | { type: "mantle"; actor: number; phase: "start" | "end"; from: V3; to: V3 }
  | { type: "capture"; sector: string; team: Team }
  | { type: "contested"; sector: string }
  | { type: "stance"; actor: number; crouched: boolean }
  | { type: "fall"; actor: number; phase: "start" | "land"; at: V3 }
  | { type: "score" }
  | { type: "end"; winner: Team | "draw" }
);
type EventInput = Event extends infer E
  ? E extends Event
    ? Omit<E, "id" | "tick">
    : never
  : never;
export class TestCollision implements CollisionWorld {
  constructor(public map: MapDefinition = industrialMap) {}
  setMap(map: MapDefinition) {
    this.map = map;
  }
  move(p: Vec, d: Vec): Vec {
    if (this.map.terrain) return moveOnMap(p, d, this.map);
    let x = p.x,
      z = p.z;
    if (!blocked(x + d.x, z, 0.5, this.map)) x += d.x;
    if (!blocked(x, z + d.z, 0.5, this.map)) z += d.z;
    return { x, z };
  }
  ray(a: V3, b: V3): number {
    let nearest = 1;
    const minX = Math.min(a.x, b.x),
      maxX = Math.max(a.x, b.x),
      minY = Math.min(a.y, b.y),
      maxY = Math.max(a.y, b.y),
      minZ = Math.min(a.z, b.z),
      maxZ = Math.max(a.z, b.z);
    // Exact slabs matter for short grenade sweeps and very thin timber panels.
    for (const box of this.map.boxes) {
      // Most bullet/near-miss/canister sweeps are short. Reject distant boxes
      // before allocating slab endpoints and testing all three axes.
      if (
        maxX < box.x - box.w / 2 ||
        minX > box.x + box.w / 2 ||
        maxZ < box.z - box.d / 2 ||
        minZ > box.z + box.d / 2 ||
        maxY < (box.baseY ?? 0) ||
        minY > (box.baseY ?? 0) + box.h
      )
        continue;
      let entry = 0,
        exit = 1;
      const low = {
        x: box.x - box.w / 2,
        y: box.baseY ?? 0,
        z: box.z - box.d / 2,
      };
      const high = {
        x: box.x + box.w / 2,
        y: (box.baseY ?? 0) + box.h,
        z: box.z + box.d / 2,
      };
      for (const axis of ["x", "y", "z"] as const) {
        const delta = b[axis] - a[axis];
        if (Math.abs(delta) < 1e-10) {
          if (a[axis] < low[axis] || a[axis] > high[axis]) {
            entry = 2;
            break;
          }
        } else {
          const t1 = (low[axis] - a[axis]) / delta,
            t2 = (high[axis] - a[axis]) / delta;
          entry = Math.max(entry, Math.min(t1, t2));
          exit = Math.min(exit, Math.max(t1, t2));
        }
      }
      if (entry <= exit) nearest = Math.min(nearest, entry);
    }
    const n = Math.max(
      1,
      Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) * 5),
    );
    const terrainHit = (t: number) => {
      const x = a.x + (b.x - a.x) * t,
        y = a.y + (b.y - a.y) * t,
        z = a.z + (b.z - a.z) * t;
      return (
        y < groundHeight(x, z, this.map) ||
        (y < 4 &&
          (Math.abs(x) > this.map.width / 2 - 0.5 ||
            Math.abs(z) > this.map.depth / 2 - 0.5))
      );
    };
    for (let i = 1; i <= n; i++) {
      if (terrainHit(i / n)) {
        let low = (i - 1) / n,
          high = i / n;
        for (let j = 0; j < 12; j++) {
          const middle = (low + high) / 2;
          if (terrainHit(middle)) high = middle;
          else low = middle;
        }
        return Math.min(nearest, high);
      }
    }
    return nearest;
  }
}
export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
export function resolveTeamSize(map: MapDefinition, requested?: number) {
  const fallback = map.id === "trenches" ? 50 : 5;
  return clamp(
    Number.isFinite(requested) ? Math.round(requested!) : fallback,
    1,
    50,
  );
}
export function raySphere(a: V3, b: V3, c: V3, r: number): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    dz = b.z - a.z,
    ox = a.x - c.x,
    oy = a.y - c.y,
    oz = a.z - c.z;
  const A = dx * dx + dy * dy + dz * dz,
    B = ox * dx + oy * dy + oz * dz,
    C = ox * ox + oy * oy + oz * oz - r * r,
    D = B * B - A * C;
  if (C <= 0) return 0;
  if (A === 0 || D < 0) return 1;
  const t = (-B - Math.sqrt(D)) / A;
  return t >= 0 && t <= 1 ? t : 1;
}
export function capture(s: Sector, blue: boolean, red: boolean): Team | null {
  s.contested = blue && red;
  if (blue === red) return null;
  const previous = s.control,
    sign = blue ? 1 : -1;
  s.control = clamp(s.control + sign / 300, -1, 1);
  if (
    (s.owner === "blue" && s.control <= 1e-8) ||
    (s.owner === "red" && s.control >= -1e-8)
  ) {
    s.owner = null;
    s.control = 0;
  }
  if (Math.abs(s.control) > 1 - 1e-8) {
    s.control = sign;
    const team = sign === 1 ? "blue" : "red";
    if (s.owner !== team) {
      s.owner = team;
      return team;
    }
  }
  if (previous === s.control) return null;
  return null;
}
export class Game {
  tick = 0;
  duration: number;
  phase: "playing" | "ended" = "playing";
  winner: Team | "draw" = "draw";
  scores: Record<Team, number> = { blue: 0, red: 0 };
  players: Soldier[] = [];
  projectiles: Projectile[] = [];
  grenades: Grenade[] = [];
  artillery = createArtilleryState();
  assaults = createAssaultState();
  smokeClouds: SmokeCloud[] = [];
  smokeSequence = 0;
  grenadeSequence = 0;
  projectileSequence = 0;
  sectors: Sector[];
  readonly map: MapDefinition;
  readonly scoring: "sectors" | "eliminations";
  private grenadeCollision: TestCollision;
  botSettings: BotSettings;
  readonly teamSize: number;
  readonly humanPlayerIds: readonly number[];
  events: Event[] = [];
  sequence = 0;
  seed: number;
  constructor(
    public collision: CollisionWorld,
    public bots = true,
    duration = 14400,
    seed = 12345,
    botSettings?: Partial<BotSettings>,
    options: {
      map?: MapDefinition;
      teamSize?: number;
      humanPlayerIds?: readonly number[];
      assaults?: boolean;
    } = {},
  ) {
    this.humanPlayerIds = [...(options.humanPlayerIds ?? [0])];
    this.map = runtimeMap(options.map ?? industrialMap);
    this.assaults.enabled =
      (options.assaults ?? true) && this.map.id === "trenches";
    this.collision.setMap?.(this.map);
    this.grenadeCollision = new TestCollision(this.map);
    this.scoring = this.map.scoring ?? "sectors";
    this.botSettings = {
      ...defaultBotSettings,
      ...(this.map.terrain?.firingPositions
        ? { engagementRange: 59, aimError: 0.06 }
        : {}),
      ...botSettings,
    };
    this.teamSize = bots ? resolveTeamSize(this.map, options.teamSize) : 1;
    this.sectors = this.map.sectors.map((s) => ({
      ...s,
      control: 0,
      owner: null,
      contested: false,
    }));
    this.duration = duration;
    this.seed = seed;
    for (let i = 0; i < (bots ? this.teamSize * 2 : 1); i++) {
      const team: Team = i < this.teamSize ? "blue" : "red";
      this.players.push({
        id: i,
        weapon: rosterWeapon(
          i % this.teamSize,
          this.teamSize,
          this.humanPlayerIds.includes(i),
        ),
        team,
        teamIndex: i % this.teamSize,
        mantle: null,
        crouched: false,
        hop: null,
        fall: null,
        nextHop: 0,
        landedAt: -1000,
        nextMantle: 0,
        y: 0,
        x: 0,
        z: 0,
        hp: 100,
        ammo: 30,
        reserve: 120,
        grenades: 3,
        smokes: 2,
        suppression: 0,
        duckUntil: 0,
        nextDuck: 0,
        nextNearMiss: 0,
        suppressionShelter: null,
        assaultId: null,
        forwardPost: null,
        throwUntil: 0,
        nextGrenade: 0,
        yaw: 0,
        pitch: 0,
        vx: 0,
        vz: 0,
        reloadAt: 0,
        nextShot: 0,
        triggerHeld: false,
        triggerPressed: false,
        awareness: freshAwareness(),
        aimBloom: 0,
        recoilPitch: 0,
        recoilYaw: 0,
        recoilShots: 0,
        lastShotAt: -1000,
        respawnAt: 0,
        protectedUntil: 0,
        kills: 0,
        deaths: 0,
        captures: 0,
        command: idle(),
        objective: i % 3,
        path: [],
        nextThink: 0,
        target: -1,
        spottedAt: 0,
        focusUntil: 0,
        distractedUntil: 0,
        mode: "Navigate",
        artilleryEvade: null,
      });
      this.respawn(this.players[i]);
    }
  }
  random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  snapshot() {
    return structuredClone({
      tick: this.tick,
      mapId: this.map.id,
      scoring: this.scoring,
      teamSize: this.teamSize,
      humanPlayerIds: this.humanPlayerIds,
      duration: this.duration,
      phase: this.phase,
      winner: this.winner,
      scores: this.scores,
      players: this.players,
      projectiles: this.projectiles,
      projectileSequence: this.projectileSequence,
      grenades: this.grenades,
      grenadeSequence: this.grenadeSequence,
      artillery: this.artillery,
      assaults: this.assaults,
      smokeClouds: this.smokeClouds,
      smokeSequence: this.smokeSequence,
      sectors: this.sectors,
      sequence: this.sequence,
      seed: this.seed,
      world: this.map.destruction,
    });
  }
  emit(e: EventInput) {
    this.events.push({ ...e, id: ++this.sequence, tick: this.tick } as Event);
  }
  respawn(p: Soldier) {
    const s = this.map.spawn[p.team];
    if (this.teamSize <= 5 && !this.map.terrain) {
      p.x = s.x + (p.teamIndex - 2) * 1.8;
      p.z = s.z;
    } else {
      const columns = Math.ceil(Math.sqrt(this.teamSize));
      const rows = Math.ceil(this.teamSize / columns);
      p.x = s.x + ((p.teamIndex % columns) - (columns - 1) / 2) * 1.8;
      p.z = s.z + (Math.floor(p.teamIndex / columns) - (rows - 1) / 2) * 1.8;
    }
    p.y = groundHeight(p.x, p.z, this.map);
    p.yaw =
      this.map.id === "trenches"
        ? p.team === "blue"
          ? Math.PI / 2
          : -Math.PI / 2
        : 0;
    p.hp = 100;
    p.crouched = false;
    p.ammo = weaponProfiles[p.weapon].magazine;
    p.reserve = weaponProfiles[p.weapon].reserve;
    p.grenades = 3;
    p.smokes = 2;
    p.suppression = 0;
    p.duckUntil = 0;
    p.nextDuck = this.tick;
    p.nextNearMiss = this.tick;
    p.suppressionShelter = null;
    p.assaultId = null;
    p.forwardPost = null;
    p.throwUntil = 0;
    p.nextGrenade = this.tick;
    p.reloadAt = 0;
    p.mantle = null;
    p.hop = null;
    p.fall = null;
    p.nextHop = this.tick;
    p.landedAt = -1000;
    p.nextMantle = this.tick;
    p.vx = 0;
    p.vz = 0;
    p.nextShot = this.tick;
    p.triggerHeld = p.triggerPressed = false;
    p.awareness = freshAwareness();
    p.aimBloom = 0;
    p.recoilPitch = p.recoilYaw = p.recoilShots = 0;
    p.lastShotAt = -1000;
    p.protectedUntil = this.tick + 60;
    p.path = [];
    p.artilleryEvade = null;
    p.target = -1;
    p.spottedAt = this.tick;
    p.focusUntil = 0;
    p.distractedUntil = 0;
    p.mode = "Navigate";
    p.nextThink = this.tick + (p.teamIndex % 30);
    p.command = idle();
    this.emit({ type: "respawn", actor: p.id });
  }
  step(human: Command) {
    this.events = [];
    if (this.phase !== "playing") return;
    this.tick++;
    this.smokeClouds = this.smokeClouds.filter((s) => {
      if (this.tick < s.expiresAt) return true;
      this.emit({ type: "smokeEnd", cloud: s.id });
      return false;
    });
    advanceAssaults(this);
    for (const p of this.players) {
      if (p.hp <= 0) {
        if (this.tick >= p.respawnAt) {
          const held = p.triggerHeld;
          this.respawn(p);
          if (p.id === 0) p.triggerHeld = held;
        } else {
          p.triggerHeld = p.id === 0 && human.fire;
          p.triggerPressed = false;
          continue;
        }
      }
      p.suppression = Math.max(
        0,
        p.suppression - suppressionRules.recoveryPerTick,
      );
      p.command = p.id === 0 ? human : botCommand(this, p);
      const c = p.command;
      p.triggerPressed = c.fire && !p.triggerHeld;
      p.triggerHeld = c.fire;
      recoverRecoil(p);
      updateCrouch(this, p, c);
      if (c.artillery) requestArtillery(this, p, c.artillery);
      if (
        !c.fire ||
        p.reloadAt ||
        p.mantle ||
        p.ammo <= 0 ||
        this.tick < p.throwUntil
      )
        p.aimBloom = Math.max(0, p.aimBloom - 1 / 18);
      p.yaw = c.yaw;
      p.pitch = clamp(c.pitch, -1.1, 1.1);
      if (
        (c.grenade || c.smoke) &&
        !p.mantle &&
        !p.reloadAt &&
        (c.smoke ? p.smokes > 0 : p.grenades > 0) &&
        this.tick >= p.nextGrenade
      )
        this.throwGrenade(p, !!c.smoke);
      if (
        c.mantle &&
        !p.crouched &&
        !p.mantle &&
        !p.hop &&
        !p.fall &&
        this.tick >= p.nextMantle &&
        this.tick >= p.nextHop
      ) {
        if (!this.startMantle(p, c)) this.startHop(p);
      }
      if (p.mantle) {
        const m = p.mantle;
        p.yaw = m.yaw;
        Object.assign(p, mantlePosition(m, this.tick));
        p.vx = p.vz = 0;
        p.mode = "Mantle";
        if (this.tick >= m.endTick) {
          p.mantle = null;
          p.landedAt = this.tick;
          this.emit({
            type: "mantle",
            actor: p.id,
            phase: "end",
            from: m.from,
            to: m.to,
          });
        }
      } else {
        const len = Math.max(1, Math.hypot(c.x, c.z)),
          speed = p.crouched ? crouchRules.speed : c.sprint && !c.aim ? 7 : 4.5;
        p.vx += ((c.x / len) * speed - p.vx) * 0.24;
        p.vz += ((c.z / len) * speed - p.vz) * 0.24;
        const pos = this.collision.move(p, { x: p.vx / 30, z: p.vz / 30 });
        p.x = pos.x;
        p.z = pos.z;
        const ground = groundHeight(p.x, p.z, this.map);
        if (p.hop) this.advanceHop(p);
        else {
          if (!p.fall && p.y - ground > 0.23) this.startFall(p);
          if (p.fall) this.advanceFall(p);
          else p.y = ground;
        }
      }
      if (p.reloadAt && this.tick >= p.reloadAt) {
        const n = Math.min(
          weaponProfiles[p.weapon].magazine - p.ammo,
          p.reserve,
        );
        p.ammo += n;
        p.reserve -= n;
        p.reloadAt = 0;
      }
      if (
        c.reload &&
        !p.mantle &&
        !p.reloadAt &&
        p.ammo < weaponProfiles[p.weapon].magazine &&
        p.reserve > 0
      ) {
        p.reloadAt = this.tick + weaponProfiles[p.weapon].reloadTicks;
        this.emit({ type: "reload", actor: p.id });
      }
    }
    for (const p of this.players)
      if (
        p.hp > 0 &&
        !p.mantle &&
        this.tick >= p.throwUntil &&
        p.triggerPressed &&
        !p.reloadAt &&
        p.ammo > 0 &&
        this.tick >= p.nextShot
      )
        this.fire(p);
    this.advanceProjectiles();
    this.advanceGrenades();
    advanceArtillery(this);
    for (const s of this.scoring === "sectors" ? this.sectors : []) {
      const occupants = this.players.filter(
          (p) => p.hp > 0 && !p.mantle && dist(p, s) <= 8,
        ),
        was = s.contested;
      const team = capture(
        s,
        occupants.some((p) => p.team === "blue"),
        occupants.some((p) => p.team === "red"),
      );
      if (s.contested && !was) this.emit({ type: "contested", sector: s.id });
      if (team) {
        for (const p of occupants) if (p.team === team) p.captures++;
        this.emit({ type: "capture", sector: s.id, team });
      }
    }
    if (this.scoring === "sectors" && this.tick % 150 === 0) {
      for (const s of this.sectors) if (s.owner) this.scores[s.owner]++;
      this.emit({ type: "score" });
    }
    if (this.tick >= this.duration) {
      this.phase = "ended";
      this.projectiles = [];
      this.grenades = [];
      this.artillery.missions = [];
      this.artillery.shells = [];
      this.smokeClouds = [];
      this.assaults.missions = [];
      this.winner =
        this.scores.blue === this.scores.red
          ? "draw"
          : this.scores.blue > this.scores.red
            ? "blue"
            : "red";
      this.emit({ type: "end", winner: this.winner });
    }
  }
  private startHop(p: Soldier) {
    if (
      this.collision.ray(
        { x: p.x, y: p.y + 1.9, z: p.z },
        { x: p.x, y: p.y + 2.05, z: p.z },
      ) < 0.99
    )
      return;
    p.hop = {
      startTick: this.tick,
      height: 0,
      velocity: hopSpeed,
      originY: p.y,
    };
    p.mode = "Hop";
    this.emit({
      type: "hop",
      actor: p.id,
      phase: "start",
      at: { x: p.x, y: p.y, z: p.z },
    });
  }
  private advanceHop(p: Soldier) {
    const h = p.hop!;
    const next = p.y + h.velocity / 30 - hopGravity / (2 * 30 * 30);
    h.velocity -= hopGravity / 30;
    const ground = groundHeight(p.x, p.z, this.map);
    let height = Math.max(ground, next);
    if (height > p.y) {
      const from = { x: p.x, y: p.y + 1.9, z: p.z };
      const to = { ...from, y: height + 1.9 };
      const fraction = this.collision.ray(from, to);
      if (fraction < 1) {
        height = Math.max(p.y, p.y + (height - p.y) * fraction - 0.01);
        h.velocity = Math.min(0, h.velocity);
      }
    }
    h.height = Math.max(0, height - h.originY);
    p.y = height;
    p.mode = "Hop";
    if (next <= ground && h.velocity < 0) {
      p.hop = null;
      p.nextHop = this.tick + 8;
      p.landedAt = this.tick;
      this.emit({
        type: "hop",
        actor: p.id,
        phase: "land",
        at: { x: p.x, y: p.y, z: p.z },
      });
    }
  }
  private startFall(p: Soldier) {
    p.fall = { startTick: this.tick, velocity: 0 };
    this.emit({
      type: "fall",
      actor: p.id,
      phase: "start",
      at: { x: p.x, y: p.y, z: p.z },
    });
  }
  private advanceFall(p: Soldier) {
    const fall = p.fall!;
    const ground = groundHeight(p.x, p.z, this.map);
    p.y += fall.velocity / 30 - hopGravity / (2 * 30 * 30);
    fall.velocity -= hopGravity / 30;
    p.mode = "Falling";
    if (p.y <= ground) {
      p.y = ground;
      p.fall = null;
      p.landedAt = this.tick;
      p.mode = "Navigate";
      p.nextHop = this.tick + 8;
      this.emit({
        type: "fall",
        actor: p.id,
        phase: "land",
        at: { x: p.x, y: p.y, z: p.z },
      });
    }
  }
  private startMantle(p: Soldier, c: Command): boolean {
    const direction =
      Math.hypot(c.x, c.z) > 0.1
        ? c
        : { x: Math.sin(c.yaw), z: -Math.cos(c.yaw) };
    const route = mantleRoute(p, direction, this.map);
    if (!route) return false;
    const to = {
      ...route.landing,
      y: groundHeight(route.landing.x, route.landing.z, this.map),
    };
    const m: Mantle = {
      from: { x: p.x, y: p.y, z: p.z },
      to,
      edge: { ...route.edge, y: Math.max(p.y, to.y) },
      yaw: Math.atan2(to.x - p.x, -(to.z - p.z)),
      startTick: this.tick,
      endTick: this.tick + 36,
    };
    let previous = m.from;
    let previousLift = 0;
    for (let i = 1; i <= 36; i++) {
      const next = mantlePosition(m, this.tick + i);
      const lift = mantleFootLift(m, this.tick + i);
      for (const height of [0.1, 0.8, 1.8])
        if (
          this.collision.ray(
            {
              ...previous,
              y: previous.y + height + (height < 0.2 ? previousLift : 0),
            },
            { ...next, y: next.y + height + (height < 0.2 ? lift : 0) },
          ) < 0.99
        )
          return false;
      previous = next;
      previousLift = lift;
    }
    p.mantle = m;
    p.nextMantle = m.endTick + 15;
    p.vx = p.vz = 0;
    this.emit({
      type: "mantle",
      actor: p.id,
      phase: "start",
      from: m.from,
      to: m.to,
    });
    return true;
  }
  fire(p: Soldier) {
    const { yaw, pitch } = weaponAim(p);
    p.ammo--;
    p.nextShot = this.tick + weaponProfiles[p.weapon].shotTicks;
    // Bloom feeds bot aim drift; the shared recoil below applies to every rifle.
    p.aimBloom = Math.min(1, p.aimBloom + 0.25);
    p.protectedUntil = 0;
    const dir = {
      x: Math.sin(yaw) * Math.cos(pitch),
      y: Math.sin(pitch),
      z: -Math.cos(yaw) * Math.cos(pitch),
    };
    const pivot = { x: p.x, y: p.y + eyeHeightOf(p), z: p.z },
      distance = p.command.aim ? 2.5 : 4;
    const desired = {
      x: p.x - dir.x * distance + Math.cos(yaw) * 0.65,
      y: p.y + cameraHeightOf(p) - dir.y * distance,
      z: p.z - dir.z * distance + Math.sin(yaw) * 0.65,
    };
    const f = this.collision.ray(pivot, desired) * 0.95;
    const camera =
      p.id === 0
        ? {
            x: pivot.x + (desired.x - pivot.x) * f,
            y: pivot.y + (desired.y - pivot.y) * f,
            z: pivot.z + (desired.z - pivot.z) * f,
          }
        : pivot;
    let aim = {
      x: camera.x + dir.x * projectileRange,
      y: camera.y + dir.y * projectileRange,
      z: camera.z + dir.z * projectileRange,
    };
    let first = this.collision.ray(camera, aim);
    for (const q of this.players)
      if (q !== p && q.hp > 0)
        for (const y of hitHeights(q))
          first = Math.min(
            first,
            raySphere(
              camera,
              aim,
              { x: q.x, y: q.y + y, z: q.z },
              hitRadius(q),
            ),
          );
    aim = {
      x: camera.x + (aim.x - camera.x) * first,
      y: camera.y + (aim.y - camera.y) * first,
      z: camera.z + (aim.z - camera.z) * first,
    };
    const from = {
      x: p.x + Math.cos(yaw) * 0.32 + dir.x * 1.08,
      y: p.y + rifleHeight(this.map, p),
      z: p.z + Math.sin(yaw) * 0.32 + dir.z * 1.08,
    };
    const length = Math.max(
      0.001,
      Math.hypot(aim.x - from.x, aim.y - from.y, aim.z - from.z),
    );
    const shot: Projectile = {
      id: ++this.projectileSequence,
      actor: p.id,
      team: p.team,
      ...from,
      vx: ((aim.x - from.x) / length) * projectileSpeed,
      vy: ((aim.y - from.y) / length) * projectileSpeed,
      vz: ((aim.z - from.z) / length) * projectileSpeed,
      remaining: projectileRange,
      bornAt: this.tick,
    };
    this.emit({
      type: "fire",
      weapon: p.weapon,
      actor: p.id,
      projectile: shot.id,
      recoil: { pitch: p.recoilPitch, yaw: p.recoilYaw },
      from,
      to: {
        x: from.x + (shot.vx / projectileSpeed) * projectileRange,
        y: from.y + (shot.vy / projectileSpeed) * projectileRange,
        z: from.z + (shot.vz / projectileSpeed) * projectileRange,
      },
    });
    let obstruction = this.collision.ray(pivot, from);
    // Native mesh rays can miss a muzzle starting exactly on a bank face.
    // A crouched barrel must also clear the authoritative height field/cover.
    if (p.crouched)
      obstruction = Math.min(
        obstruction,
        this.grenadeCollision.ray(pivot, from),
      );
    let muzzleVictim: Soldier | undefined;
    for (const q of this.players)
      if (q !== p && q.hp > 0)
        for (const y of hitHeights(q)) {
          const t = raySphere(
            pivot,
            from,
            { x: q.x, y: q.y + y, z: q.z },
            hitRadius(q),
          );
          if (t < obstruction) {
            obstruction = t;
            muzzleVictim = q;
          }
        }
    if (obstruction < 1) {
      // Do not spawn beyond cover or a soldier intersecting the barrel.
      this.impact(
        shot,
        {
          x: pivot.x + (from.x - pivot.x) * obstruction,
          y: pivot.y + (from.y - pivot.y) * obstruction,
          z: pivot.z + (from.z - pivot.z) * obstruction,
        },
        muzzleVictim,
      );
    } else this.projectiles.push(shot);
    kickRecoil(p, this.tick);
  }
  private advanceProjectiles() {
    const active: Projectile[] = [];
    const cells = new Map<string, Soldier[]>();
    for (const p of this.players)
      if (p.hp > 0) {
        const key = `${Math.floor(p.x / 4)},${Math.floor(p.z / 4)}`;
        const list = cells.get(key);
        if (list) list.push(p);
        else cells.set(key, [p]);
      }
    for (const shot of this.projectiles) {
      // A newly fired round starts at the muzzle at this tick's boundary.
      if (shot.bornAt === this.tick) {
        active.push(shot);
        continue;
      }
      const travel = Math.min(projectileSpeed / 30, shot.remaining);
      const from = { x: shot.x, y: shot.y, z: shot.z };
      const to = {
        x: from.x + (shot.vx / projectileSpeed) * travel,
        y: from.y + (shot.vy / projectileSpeed) * travel,
        z: from.z + (shot.vz / projectileSpeed) * travel,
      };
      let nearest = this.collision.ray(from, to);
      let victim: Soldier | undefined;
      for (
        let cx = Math.floor((Math.min(from.x, to.x) - 0.38) / 4);
        cx <= Math.floor((Math.max(from.x, to.x) + 0.38) / 4);
        cx++
      )
        for (
          let cz = Math.floor((Math.min(from.z, to.z) - 0.38) / 4);
          cz <= Math.floor((Math.max(from.z, to.z) + 0.38) / 4);
          cz++
        )
          for (const q of cells.get(`${cx},${cz}`) ?? [])
            if (q.id !== shot.actor && q.hp > 0)
              for (const y of hitHeights(q)) {
                const t = raySphere(
                  from,
                  to,
                  { x: q.x, y: q.y + y, z: q.z },
                  hitRadius(q),
                );
                if (t < nearest) {
                  nearest = t;
                  victim = q;
                }
              }
      shot.x = from.x + (to.x - from.x) * nearest;
      shot.y = from.y + (to.y - from.y) * nearest;
      shot.z = from.z + (to.z - from.z) * nearest;
      for (
        let cx = Math.floor(
          (Math.min(from.x, shot.x) - suppressionRules.radius) / 4,
        );
        cx <=
        Math.floor((Math.max(from.x, shot.x) + suppressionRules.radius) / 4);
        cx++
      )
        for (
          let cz = Math.floor(
            (Math.min(from.z, shot.z) - suppressionRules.radius) / 4,
          );
          cz <=
          Math.floor((Math.max(from.z, shot.z) + suppressionRules.radius) / 4);
          cz++
        )
          for (const q of cells.get(`${cx},${cz}`) ?? [])
            suppressNearMiss(this, q, shot, from, shot);
      shot.remaining = Math.max(0, shot.remaining - travel);
      if (nearest < 1)
        this.impact(shot, { x: shot.x, y: shot.y, z: shot.z }, victim);
      else if (shot.remaining > 0) active.push(shot);
    }
    this.projectiles = active;
  }
  private damage(victim: Soldier, amount: number, source: number, team: Team) {
    victim.hp = Math.max(0, victim.hp - amount);
    this.emit({ type: "damage", actor: victim.id, source });
    if (!victim.hp) {
      victim.deaths++;
      const shooter = this.players.find((p) => p.id === source);
      if (victim.team !== team) {
        if (shooter) shooter.kills++;
        if (this.scoring === "eliminations") {
          this.scores[team]++;
          this.emit({ type: "score" });
        }
      }
      victim.respawnAt = this.tick + 150;
      victim.mode = "Respawn";
      victim.reloadAt = 0;
      victim.throwUntil = 0;
      victim.mantle = null;
      victim.crouched = false;
      victim.hop = null;
      victim.fall = null;
      victim.y = groundHeight(victim.x, victim.z, this.map);
      this.emit({ type: "death", actor: victim.id });
    }
  }
  private impact(shot: Projectile, at: V3, victim?: Soldier) {
    const hit =
      !!victim &&
      victim.team !== shot.team &&
      this.tick >= victim.protectedUntil;
    if (hit && victim) this.damage(victim, 25, shot.actor, shot.team);
    if (!victim) {
      const change = damageVegetation(this.map, at);
      if (change) this.applyDestruction(shot.actor, change);
    }
    this.emit({
      type: "impact",
      actor: shot.actor,
      projectile: shot.id,
      at,
      target: victim?.id ?? null,
      hit,
    });
  }
  // Sweep the center and six points on the grenade shell, including during release.
  private grenadeSweep(from: V3, to: V3) {
    let fraction = 1;
    for (const offset of [
      { x: 0, y: 0, z: 0 },
      ...(["x", "y", "z"] as const).flatMap((axis) =>
        [-grenadeRadius, grenadeRadius].map((sign) => ({
          x: 0,
          y: 0,
          z: 0,
          [axis]: sign,
        })),
      ),
    ])
      fraction = Math.min(
        fraction,
        this.collision.ray(
          { x: from.x + offset.x, y: from.y + offset.y, z: from.z + offset.z },
          { x: to.x + offset.x, y: to.y + offset.y, z: to.z + offset.z },
        ),
        // Keep tiny sweeps outside the authoritative height field even when
        // the engine's short ray begins within a collider's contact tolerance.
        this.grenadeCollision.ray(
          { x: from.x + offset.x, y: from.y + offset.y, z: from.z + offset.z },
          { x: to.x + offset.x, y: to.y + offset.y, z: to.z + offset.z },
        ),
      );
    return fraction;
  }
  private throwGrenade(p: Soldier, smoke = false) {
    const speed = smoke ? 13 : grenadeSpeed;
    const elevation = clamp(p.pitch + 0.65, 0.15, 1.25);
    // Timber can extend slightly beyond the height-field bank. Find clearance
    // within the soldier's footprint before releasing; never start inside it.
    const origin = { x: p.x, y: p.y + 1.8 - stanceDrop(p), z: p.z };
    const from = [
      origin,
      {
        ...origin,
        x: origin.x - Math.sin(p.yaw) * 0.35,
        z: origin.z + Math.cos(p.yaw) * 0.35,
      },
      {
        ...origin,
        x: origin.x + Math.sin(p.yaw) * 0.35,
        z: origin.z - Math.cos(p.yaw) * 0.35,
      },
      { ...origin, y: origin.y + 0.4 },
    ].find((candidate) =>
      (["x", "y", "z"] as const).every((axis) =>
        [-1, 1].every((sign) => {
          const edge = {
            ...candidate,
            [axis]: candidate[axis] + sign * (grenadeRadius + 0.02),
          };
          return (
            this.collision.ray(candidate, edge) >= 1 &&
            this.collision.ray(edge, candidate) >= 1 &&
            this.grenadeCollision.ray(candidate, edge) >= 1 &&
            this.grenadeCollision.ray(edge, candidate) >= 1
          );
        }),
      ),
    );
    if (!from) return;
    const desired = {
      x: from.x + Math.sin(p.yaw) * 0.55,
      y: from.y + 0.15,
      z: from.z - Math.cos(p.yaw) * 0.55,
    };
    const f = Math.max(0, this.grenadeSweep(from, desired) - 0.03);
    const grenade: Grenade = {
      id: ++this.grenadeSequence,
      actor: p.id,
      team: p.team,
      x: from.x + (desired.x - from.x) * f,
      y: from.y + (desired.y - from.y) * f,
      z: from.z + (desired.z - from.z) * f,
      vx: Math.sin(p.yaw) * Math.cos(elevation) * speed,
      vy: Math.sin(elevation) * speed,
      vz: -Math.cos(p.yaw) * Math.cos(elevation) * speed,
      bornAt: this.tick,
      explodeAt: this.tick + (smoke ? smokeRules.fuse : grenadeFuseTicks),
      ...(smoke ? { kind: "smoke" as const } : {}),
    };
    if (smoke) {
      p.smokes--;
      const mission = this.assaults.missions.find((m) => m.id === p.assaultId);
      if (mission)
        mission.screens[mission.progress[p.id]] = {
          actor: p.id,
          tick: this.tick,
        };
    } else p.grenades--;
    p.protectedUntil = 0;
    p.throwUntil = this.tick + 15;
    p.nextGrenade = this.tick + 24;
    this.grenades.push(grenade);
    this.emit({
      type: smoke ? "smokeThrow" : "grenadeThrow",
      actor: p.id,
      grenade: grenade.id,
      from: { x: grenade.x, y: grenade.y, z: grenade.z },
      velocity: { x: grenade.vx, y: grenade.vy, z: grenade.vz },
      explodeAt: grenade.explodeAt,
    });
  }
  private advanceGrenades() {
    const active: Grenade[] = [];
    for (const g of this.grenades) {
      if (
        this.tick >= g.explodeAt &&
        (g.kind !== "smoke" ||
          g.y - groundHeight(g.x, g.z, this.map) < 0.5 ||
          this.tick - g.bornAt >= 180)
      ) {
        this.explodeGrenade(g);
        continue;
      }
      if (g.bornAt < this.tick) {
        let bounced = false;
        // Short, axis-separated sweeps give banks/walls a deterministic bounce.
        for (let substep = 0; substep < 4; substep++) {
          const dt = 1 / 120;
          g.vy -= grenadeGravity * dt;
          for (const [axis, velocity] of [
            ["x", "vx"],
            ["z", "vz"],
            ["y", "vy"],
          ] as const) {
            const delta = g[velocity] * dt;
            if (Math.abs(delta) < 1e-8) continue;
            const from = { x: g.x, y: g.y, z: g.z };
            const to = { ...from, [axis]: from[axis] + delta };
            const f = this.grenadeSweep(from, to);
            g[axis] +=
              delta * (f < 1 ? Math.max(0, f - 0.003 / Math.abs(delta)) : 1);
            if (f < 1) {
              if (Math.abs(g[velocity]) > 1.5) bounced = true;
              g[velocity] *= -0.38;
              if (axis === "y") {
                g.vx *= 0.7;
                g.vz *= 0.7;
                if (Math.abs(g.vy) < 0.6) g.vy = 0;
              }
            }
          }
        }
        if (bounced)
          this.emit({
            type: "grenadeBounce",
            actor: g.actor,
            grenade: g.id,
            at: { x: g.x, y: g.y, z: g.z },
          });
      }
      active.push(g);
    }
    this.grenades = active;
  }
  private explodeGrenade(g: Grenade) {
    if (g.kind === "smoke") {
      const cloud: SmokeCloud = {
        id: ++this.smokeSequence,
        actor: g.actor,
        team: g.team,
        x: g.x,
        z: g.z,
        y: Math.max(g.y, groundHeight(g.x, g.z, this.map)) + 1.4,
        bornAt: this.tick,
        expiresAt: this.tick + smokeRules.lifetime,
      };
      this.smokeClouds.push(cloud);
      this.emit({
        type: "smokeBloom",
        actor: g.actor,
        grenade: g.id,
        cloud: cloud.id,
        at: { x: cloud.x, y: cloud.y, z: cloud.z },
        expiresAt: cloud.expiresAt,
      });
      return;
    }
    const at = { x: g.x, y: g.y, z: g.z };
    const hits = this.explode(at, g.actor, g.team, grenadeExplosionProfile);
    this.emit({
      type: "grenadeExplosion",
      actor: g.actor,
      grenade: g.id,
      at,
      radius: grenadeBlastRadius,
      hits,
    });
  }
  explode(at: V3, actor: number, team: Team, profile: ExplosionProfile) {
    const hits: { target: number; damage: number }[] = [];
    for (const p of this.players) {
      if (
        p.hp <= 0 ||
        (p.team === team && p.id !== actor) ||
        this.tick < p.protectedUntil
      )
        continue;
      const distance = Math.hypot(
        p.x - at.x,
        p.y + (p.crouched ? 0.6 : 0.9) - at.y,
        p.z - at.z,
      );
      if (distance >= profile.radius) continue;
      const visible = hitHeights(p).some(
        (height) =>
          this.collision.ray(at, { x: p.x, y: p.y + height, z: p.z }) >= 0.999,
      );
      if (!visible) continue;
      const damage = Math.ceil(
        profile.damage * (1 - distance / profile.radius),
      );
      hits.push({ target: p.id, damage });
      this.damage(p, damage, actor, team);
    }
    const change = deformExplosion(this.map, at, profile, (a, b) =>
      this.collision.ray(a, b),
    );
    if (change) this.applyDestruction(actor, change);
    return hits;
  }
  private applyDestruction(actor: number, change: DestructionChange) {
    if (change.geometry === false) {
      this.collision.updateWorld?.(change);
      this.emit({ type: "destruction", actor, change });
      return;
    }
    navigation.delete(this.map);
    this.collision.updateWorld?.(change);
    for (const p of this.players) {
      p.path = [];
      p.nextThink = this.tick + (p.id % 30);
      if (p.mantle) {
        const m = p.mantle;
        if (
          Math.abs(groundHeight(m.from.x, m.from.z, this.map) - m.from.y) <
            0.02 &&
          Math.abs(groundHeight(m.to.x, m.to.z, this.map) - m.to.y) < 0.02
        )
          continue;
        p.mantle = null;
        p.landedAt = this.tick;
      }
      const ground = groundHeight(p.x, p.z, this.map);
      if (!p.hop && !p.fall) {
        if (p.hp > 0 && p.y - ground > 0.23) this.startFall(p);
        else p.y = ground;
      }
    }
    this.emit({ type: "destruction", actor, change });
  }
}
// Each map owns a cached height-aware navigation graph.
const navigation = new WeakMap<
  MapDefinition,
  { nodes: Vec[]; edges: number[][] }
>();
function graph(map: MapDefinition) {
  const cached = navigation.get(map);
  if (cached) return cached;
  const step = map.navSpacing,
    nodes: Vec[] = [];
  const unique = new Set<string>();
  const add = (x: number, z: number) => {
    const key = `${x},${z}`;
    if (!unique.has(key) && !blocked(x, z, 0.7, map)) {
      unique.add(key);
      nodes.push({ x, z });
    }
  };
  for (let x = -map.width / 2 + step; x <= map.width / 2 - step; x += step)
    for (let z = -map.depth / 2 + step; z <= map.depth / 2 - step; z += step)
      add(x, z);
  // Include the actual ends/middle of narrow ramps. A regular lattice alone can
  // strand one mirrored firing step when a node falls exactly on a bank edge.
  for (const r of map.terrain?.ramps ?? []) {
    for (const x of [r.x - r.w / 2, r.x, r.x + r.w / 2])
      for (const z of [r.z - r.d / 2 + 0.8, r.z, r.z + r.d / 2 - 0.8])
        add(x, z);
    // Leave a ramp on its low side before going around its longitudinal end.
    // Tight, offset sections may otherwise have no lattice point on that floor.
    const lowX = r.x - r.direction * (r.w / 2 + 0.4);
    for (const z of [r.z - r.d / 2 - 0.8, r.z + r.d / 2 + 0.8]) add(lowX, z);
  }
  // Authored communication bends can fall between the regular nav lattice.
  for (const route of map.terrain?.communicationRoutes ?? [])
    for (let i = 0; i < route.points.length - 1; i++) {
      const a = route.points[i],
        b = route.points[i + 1];
      const steps = Math.ceil(dist(a, b) / (step / 2));
      for (let j = 0; j <= steps; j++)
        add(a.x + ((b.x - a.x) * j) / steps, a.z + ((b.z - a.z) * j) / steps);
    }
  for (const crater of map.destruction?.craters ?? [])
    for (const [dx, dz] of [
      [0, 0],
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ])
      add(crater.x + dx * crater.radius, crater.z + dz * crater.radius);
  const buckets = new Map<string, number[]>();
  nodes.forEach((p, i) => {
    const key = `${Math.floor(p.x / step)},${Math.floor(p.z / step)}`;
    const list = buckets.get(key);
    if (list) list.push(i);
    else buckets.set(key, [i]);
  });
  const edges = nodes.map((a, i) => {
    const result: number[] = [];
    const cx = Math.floor(a.x / step),
      cz = Math.floor(a.z / step);
    for (let x = cx - 1; x <= cx + 1; x++)
      for (let z = cz - 1; z <= cz + 1; z++)
        for (const j of buckets.get(`${x},${z}`) ?? [])
          if (
            j !== i &&
            dist(a, nodes[j]) <= step * 1.45 &&
            walkSegment(a, nodes[j], map)
          )
            result.push(j);
    return result;
  });
  const result = { nodes, edges };
  navigation.set(map, result);
  return result;
}
export function pathfind(
  a: Vec,
  b: Vec,
  map: MapDefinition = industrialMap,
): Vec[] {
  if (walkSegment(a, b, map)) return [{ ...b }];
  const { nodes, edges } = graph(map);
  const closest = (p: Vec) =>
    nodes
      .map((n, i) => ({ i, d: dist(n, p) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 48)
      .find(({ i }) => walkSegment(p, nodes[i], map))?.i;
  const start = closest(a),
    goal = closest(b);
  if (start === undefined || goal === undefined) return [];
  const open = new Set([start]),
    came = new Map<number, number>(),
    cost = new Map([[start, 0]]);
  while (open.size) {
    let u = -1,
      best = Infinity;
    for (const index of open) {
      const score = cost.get(index)! + dist(nodes[index], nodes[goal]);
      if (score < best) {
        best = score;
        u = index;
      }
    }
    if (u === goal) {
      const out = [{ ...b }, nodes[u]];
      while (came.has(u)) {
        u = came.get(u)!;
        out.push(nodes[u]);
      }
      const route = out.reverse();
      // Do not walk back to a nearby lattice anchor when the next one is clear.
      while (route.length > 1 && walkSegment(a, route[1], map)) route.shift();
      return route;
    }
    open.delete(u);
    for (const v of edges[u]) {
      const next = cost.get(u)! + dist(nodes[u], nodes[v]);
      if (next < (cost.get(v) ?? Infinity)) {
        came.set(v, u);
        cost.set(v, next);
        open.add(v);
      }
    }
  }
  return [];
}
export function botAimOffset(p: Soldier, tick: number, baseSpread: number) {
  const sample = (index: number) => {
    let seed =
      (Math.imul(index + 1, 374761393) + Math.imul(p.id + 1, 668265263)) >>> 0;
    seed = Math.imul(seed ^ (seed >>> 13), 1274126177) >>> 0;
    const angle = (seed / 4294967296) * Math.PI * 2;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const radius = Math.sqrt(seed / 4294967296);
    return { yaw: Math.cos(angle) * radius, pitch: Math.sin(angle) * radius };
  };
  const time = (tick + p.id * 7) / 30;
  const index = Math.floor(time);
  const blend = smooth(time - index);
  const a = sample(index),
    b = sample(index + 1);
  const spread = baseSpread * (1 + 0.75 * p.aimBloom);
  return {
    yaw: (a.yaw + (b.yaw - a.yaw) * blend) * spread,
    pitch: (a.pitch + (b.pitch - a.pitch) * blend) * spread,
  };
}
// Per-soldier variation keeps attention breaks/reactions staggered without
// consuming the gameplay RNG or changing projectile randomness.
const botAttentionSample = awarenessSample;
function beginBotFocus(g: Game, p: Soldier) {
  const min = Math.max(1, g.botSettings.focusMinTicks),
    max = Math.max(min, g.botSettings.focusMaxTicks);
  p.focusUntil =
    g.botSettings.focusMaxTicks > 0
      ? g.tick +
        min +
        Math.floor(botAttentionSample(p, g.tick, 17) * (max - min + 1))
      : 0;
  g.emit({
    type: "botAttention",
    actor: p.id,
    target: p.target,
    phase: "acquired",
    until: p.focusUntil,
  });
}
function changeBotTarget(g: Game, p: Soldier, target: number) {
  if (p.target >= 0)
    g.emit({
      type: "botAttention",
      actor: p.id,
      target: p.target,
      phase: "lost",
      until: g.tick,
    });
  if (target >= 0) {
    const nextLook = p.awareness.nextLook;
    p.awareness = freshAwareness();
    p.awareness.nextLook = nextLook;
  } else p.awareness.visible = false;
  p.target = target;
  p.spottedAt = g.tick;
  p.focusUntil = 0;
  if (target >= 0) beginBotFocus(g, p);
}
export function botCommand(g: Game, p: Soldier): Command {
  const evasion = evadeArtillery(g, p);
  if (evasion) return evasion;
  const duck = suppressionCommand(g, p);
  if (duck) return duck;
  const c = idle();
  c.artillery = botArtilleryTarget(g, p) ?? undefined;
  c.reload = p.ammo < 1 || (p.ammo < 15 && p.target < 0);
  c.yaw = p.yaw;
  c.pitch = p.pitch;
  const station = firingPosition(g, p);
  if (g.tick >= p.nextThink && p.assaultId === null) {
    p.nextThink = g.tick + 30;
    if (station) p.path = pathfind(p, station, g.map);
    else {
      const ranks = g.sectors.map((s, i) => ({
        i,
        weight:
          dist(p, s) +
          (s.owner === p.team ? 32 : 0) +
          (s.contested ? -10 : 0) +
          g.players.filter(
            (q) => q !== p && q.team === p.team && q.objective === i,
          ).length *
            14,
      }));
      ranks.sort((a, b) => a.weight - b.weight);
      const current = ranks.find((rank) => rank.i === p.objective)!;
      if (ranks[0].weight + 12 < current.weight) p.objective = ranks[0].i;
      p.path = pathfind(p, g.sectors[p.objective], g.map);
    }
  }
  const range = Math.min(projectileRange - 1, g.botSettings.engagementRange);
  if (
    p.target >= 0 &&
    p.focusUntil > 0 &&
    g.botSettings.focusMaxTicks > 0 &&
    g.tick >= p.focusUntil
  ) {
    const min = g.botSettings.distractionMinTicks,
      max = Math.max(min, g.botSettings.distractionMaxTicks);
    p.distractedUntil =
      g.tick +
      min +
      Math.floor(botAttentionSample(p, g.tick, 53) * (max - min + 1));
    g.emit({
      type: "botAttention",
      actor: p.id,
      target: p.target,
      phase: "distracted",
      until: p.distractedUntil,
    });
    p.target = -1;
    p.spottedAt = g.tick;
    p.focusUntil = 0;
    p.awareness.confidence = 0;
    p.awareness.visible = false;
  }
  if (
    g.tick >= p.distractedUntil &&
    (g.botSettings.awareness
      ? g.tick >= p.awareness.nextLook
      : g.tick % 3 === p.id % 3)
  ) {
    p.awareness.nextLook = g.tick + 5 + (p.id % 5);
    const visible = (q: Soldier) =>
      q.team !== p.team &&
      q.hp > 0 &&
      canNotice(g, p, q) &&
      dist(q, p) < range &&
      !smokeBlocks(
        g,
        { x: p.x, y: p.y + rifleHeight(g.map, p), z: p.z },
        { x: q.x, y: q.y + exposedAimHeight(g.map, q), z: q.z },
      ) &&
      g.collision.ray(
        { x: p.x, y: p.y + rifleHeight(g.map, p), z: p.z },
        { x: q.x, y: q.y + exposedAimHeight(g.map, q), z: q.z },
      ) > 0.99;
    const existing = g.players.find((q) => q.id === p.target);
    const target =
      existing && visible(existing)
        ? existing
        : g.players
            .filter((q) => q.team !== p.team && q.hp > 0 && dist(q, p) < range)
            .sort((a, b) => dist(a, p) - dist(b, p))
            .slice(0, 6)
            .find(visible);
    if ((target?.id ?? -1) !== p.target)
      changeBotTarget(g, p, target?.id ?? -1);
    if (target)
      observeTarget(g, p, target, target.y + exposedAimHeight(g.map, target));
  }
  let target = g.players.find((q) => q.id === p.target && q.hp > 0);
  if (target && p.focusUntil === 0 && g.botSettings.focusMaxTicks > 0)
    beginBotFocus(g, p);
  if (
    target &&
    (smokeBlocks(
      g,
      { x: p.x, y: p.y + rifleHeight(g.map, p), z: p.z },
      {
        x: target.x,
        y: target.y + exposedAimHeight(g.map, target),
        z: target.z,
      },
    ) ||
      ((target.crouched ||
        (g.tick >= p.awareness.nextTrigger && g.tick >= p.nextShot)) &&
        g.collision.ray(
          { x: p.x, y: p.y + rifleHeight(g.map, p), z: p.z },
          {
            x: target.x,
            y: target.y + exposedAimHeight(g.map, target),
            z: target.z,
          },
        ) < 0.99))
  ) {
    changeBotTarget(g, p, -1);
    target = undefined;
  }
  p.awareness.confidence = clamp(
    p.awareness.confidence + (target && p.awareness.visible ? 1 / 30 : -1 / 20),
    0,
    1,
  );
  const objective = station ?? g.sectors[p.objective];
  while (
    p.path.length &&
    dist(p, p.path[0]) < (station ? (p.path.length === 1 ? 0.15 : 0.6) : 1) &&
    (p.path.length === 1 || walkSegment(p, p.path[1], g.map))
  )
    p.path.shift();
  const dest = p.path[0];
  if (dest && dist(p, objective) > (station ? 0.15 : 4)) {
    const d = dist(p, dest);
    c.x = (dest.x - p.x) / Math.max(0.1, d);
    c.z = (dest.z - p.z) / Math.max(0.1, d);
    c.sprint = !target;
    p.mode = "Navigate";
  } else {
    p.mode = station ? "Firing step" : "Capture";
    if (station) c.yaw = p.team === "blue" ? Math.PI / 2 : -Math.PI / 2;
  }
  for (const q of g.players)
    if (q !== p && q.hp > 0 && dist(p, q) < (station ? 0.75 : 1.4)) {
      const d = Math.max(0.1, dist(p, q));
      c.x += ((p.x - q.x) / d) * 0.7;
      c.z += ((p.z - q.z) / d) * 0.7;
    }
  if (target) {
    p.mode = "Engage";
    const d = dist(p, target);
    const error = botAimOffset(
      p,
      g.tick,
      g.botSettings.aimError *
        (p.weapon === "machineGun" ? 1.35 : 1) *
        (1 +
          p.suppression * 1.5 +
          (g.botSettings.awareness
            ? (1 - p.awareness.confidence) * 0.8 + Math.hypot(p.vx, p.vz) * 0.08
            : 0)),
    );
    const seen =
      g.botSettings.awareness && p.awareness.observed
        ? p.awareness.observed
        : {
            x: target.x,
            y: target.y + exposedAimHeight(g.map, target),
            z: target.z,
          };
    const velocity = g.botSettings.awareness
      ? p.awareness.velocity
      : { x: target.vx, z: target.vz };
    // Aim from delayed observations and estimated movement, not live target velocity.
    const rx = seen.x - p.x,
      rz = seen.z - p.z;
    const a = velocity.x ** 2 + velocity.z ** 2 - projectileSpeed ** 2;
    const b = 2 * (rx * velocity.x + rz * velocity.z);
    const lead = clamp(
      (-b - Math.sqrt(Math.max(0, b * b - 4 * a * d * d))) / (2 * a),
      0,
      projectileRange / projectileSpeed,
    );
    const estimate = g.botSettings.awareness
      ? Math.min(0.7, lead) *
        (0.35 + awarenessSample(p, p.spottedAt, 337) * 0.35)
      : lead;
    const aimX = rx + velocity.x * estimate,
      aimZ = rz + velocity.z * estimate;
    const aimDistance = Math.hypot(aimX, aimZ);
    const aimYaw = Math.atan2(aimX, -aimZ);
    let eyeHeight = p.y + eyeHeightOf(p),
      shoulderOffset = 0;
    if (p.id === 0) {
      // The optional player driver aims through the same shoulder camera as a human.
      const pitch = Math.atan2(seen.y - (p.y + cameraHeightOf(p)), aimDistance);
      const f =
        g.collision.ray(
          { x: p.x, y: p.y + eyeHeightOf(p), z: p.z },
          {
            x:
              p.x -
              Math.sin(aimYaw) * Math.cos(pitch) * 2.5 +
              Math.cos(aimYaw) * 0.65,
            y: p.y + cameraHeightOf(p) - Math.sin(pitch) * 2.5,
            z:
              p.z +
              Math.cos(aimYaw) * Math.cos(pitch) * 2.5 +
              Math.sin(aimYaw) * 0.65,
          },
        ) * 0.95;
      eyeHeight += 0.85 * f;
      shoulderOffset = 0.65 * f;
    }
    c.yaw =
      aimYaw -
      Math.asin(clamp(shoulderOffset / Math.max(0.001, aimDistance), 0, 0.99)) +
      error.yaw;
    c.pitch = Math.atan2(seen.y - eyeHeight, aimDistance) + error.pitch;
    if (g.botSettings.awareness) {
      c.yaw = turnToward(p.yaw, c.yaw, 0.075);
      c.pitch = p.pitch + clamp(c.pitch - p.pitch, -0.035, 0.035);
    }
    c.aim = true;
    c.sprint = false;
    c.fire =
      g.tick - p.spottedAt >=
        g.botSettings.reactionTicks +
          Math.floor(
            (g.botSettings.reactionTicks > 0
              ? g.botSettings.reactionJitterTicks + 1
              : 0) * botAttentionSample(p, p.spottedAt, 89),
          ) &&
      (g.botSettings.awareness
        ? g.botSettings.burstFireTicks > 0
        : g.tick % g.botSettings.burstPeriodTicks <
          g.botSettings.burstFireTicks) &&
      (!g.botSettings.awareness ||
        (p.awareness.confidence >= 0.75 &&
          Math.abs(angleDelta(c.yaw, aimYaw)) < 0.12));
    if (c.fire) {
      c.fire = semiAutoIntent(g, p);
      if (c.fire && g.botSettings.awareness) {
        const scatter =
          g.botSettings.aimError *
          (p.weapon === "machineGun" ? 0.9 : 0.65) *
          (1 + p.suppression);
        c.yaw += (awarenessSample(p, g.tick, 401) * 2 - 1) * scatter;
        c.pitch += (awarenessSample(p, g.tick, 409) * 2 - 1) * scatter;
      }
    }
    c.x *= 0.2;
    c.z *= 0.2;
    if (!station && g.tick % 90 < 30) {
      c.x += Math.cos(c.yaw) * 0.5;
      c.z += Math.sin(c.yaw) * 0.5;
      p.mode = "Reposition";
    }
  } else if (Math.hypot(c.x, c.z) > 0.1) c.yaw = Math.atan2(c.x, -c.z);
  if (
    !target &&
    g.botSettings.awareness &&
    p.awareness.observed &&
    g.tick - p.awareness.seenAt < 60
  ) {
    const seen = p.awareness.observed;
    c.yaw = turnToward(
      p.yaw,
      Math.atan2(seen.x - p.x, p.z - seen.z) +
        Math.sin((g.tick + p.id) * 0.08) * 0.25,
      0.04,
    );
    p.mode = "Searching";
  }
  if (g.tick < p.distractedUntil) p.mode = "Scanning";
  if (
    g.map.terrain &&
    !station &&
    !p.mantle &&
    !p.hop &&
    !p.fall &&
    g.tick >= p.nextMantle &&
    Math.abs(p.x) < 34 &&
    g.tick % 6 === p.id % 6
  ) {
    const landing = mantleLanding(p, c, g.map);
    c.mantle = !!landing && dist(landing, objective) + 0.3 < dist(p, objective);
  }
  return assaultCommand(g, p, c);
}
