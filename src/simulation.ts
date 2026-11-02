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
export type Team = "blue" | "red";
export type V3 = Vec & { y: number };
export interface CollisionWorld {
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
});
export const projectileSpeed = 32;
export const projectileRange = 60;
export interface Projectile extends V3 {
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
  y: number;
  teamIndex: number;
  mantle: Mantle | null;
  hop: Hop | null;
  nextHop: number;
  landedAt: number;
  nextMantle: number;
  id: number;
  team: Team;
  hp: number;
  ammo: number;
  reserve: number;
  yaw: number;
  pitch: number;
  vx: number;
  vz: number;
  reloadAt: number;
  nextShot: number;
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
  mode: string;
}
export interface Sector extends Vec {
  id: string;
  control: number;
  owner: Team | null;
  contested: boolean;
}
export interface BotSettings {
  reactionTicks: number;
  aimError: number;
  engagementRange: number;
  burstPeriodTicks: number;
  burstFireTicks: number;
}
export const defaultBotSettings: BotSettings = {
  reactionTicks: 11,
  aimError: 0.035,
  engagementRange: 40,
  burstPeriodTicks: 24,
  burstFireTicks: 15,
};
export type Event = { id: number; tick: number } & (
  | { type: "fire"; actor: number; projectile: number; from: V3; to: V3 }
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
  move(p: Vec, d: Vec): Vec {
    if (this.map.terrain) return moveOnMap(p, d, this.map);
    let x = p.x,
      z = p.z;
    if (!blocked(x + d.x, z, 0.5, this.map)) x += d.x;
    if (!blocked(x, z + d.z, 0.5, this.map)) z += d.z;
    return { x, z };
  }
  ray(a: V3, b: V3): number {
    const n = Math.max(
      1,
      Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) * 5),
    );
    for (let i = 1; i <= n; i++) {
      const t = i / n,
        x = a.x + (b.x - a.x) * t,
        y = a.y + (b.y - a.y) * t,
        z = a.z + (b.z - a.z) * t;
      if (
        y < groundHeight(x, z, this.map) ||
        (y < 4 &&
          (Math.abs(x) > this.map.width / 2 - 0.5 ||
            Math.abs(z) > this.map.depth / 2 - 0.5)) ||
        this.map.boxes.some(
          (box) =>
            y >= (box.baseY ?? 0) &&
            y <= (box.baseY ?? 0) + box.h &&
            Math.abs(x - box.x) < box.w / 2 &&
            Math.abs(z - box.z) < box.d / 2,
        )
      )
        return t;
    }
    return 1;
  }
}
export const clamp = (v: number, a: number, b: number) =>
  Math.max(a, Math.min(b, v));
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
  projectileSequence = 0;
  sectors: Sector[];
  readonly map: MapDefinition;
  readonly teamSize: number;
  events: Event[] = [];
  sequence = 0;
  seed: number;
  constructor(
    public collision: CollisionWorld,
    public bots = true,
    duration = 14400,
    seed = 12345,
    public botSettings: BotSettings = { ...defaultBotSettings },
    options: { map?: MapDefinition; teamSize?: number } = {},
  ) {
    this.map = options.map ?? industrialMap;
    const requested = options.teamSize ?? 5;
    this.teamSize = bots
      ? clamp(Number.isFinite(requested) ? Math.round(requested) : 5, 1, 25)
      : 1;
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
        team,
        teamIndex: i % this.teamSize,
        mantle: null,
        hop: null,
        nextHop: 0,
        landedAt: -1000,
        nextMantle: 0,
        y: 0,
        x: 0,
        z: 0,
        hp: 100,
        ammo: 30,
        reserve: 120,
        yaw: 0,
        pitch: 0,
        vx: 0,
        vz: 0,
        reloadAt: 0,
        nextShot: 0,
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
        mode: "Navigate",
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
      teamSize: this.teamSize,
      duration: this.duration,
      phase: this.phase,
      winner: this.winner,
      scores: this.scores,
      players: this.players,
      projectiles: this.projectiles,
      projectileSequence: this.projectileSequence,
      sectors: this.sectors,
      sequence: this.sequence,
      seed: this.seed,
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
    p.ammo = 30;
    p.reserve = 120;
    p.reloadAt = 0;
    p.mantle = null;
    p.hop = null;
    p.nextHop = this.tick;
    p.landedAt = -1000;
    p.nextMantle = this.tick;
    p.vx = 0;
    p.vz = 0;
    p.nextShot = this.tick;
    p.protectedUntil = this.tick + 60;
    p.path = [];
    p.target = -1;
    p.mode = "Navigate";
    p.nextThink = this.tick + (p.teamIndex % 30);
    p.command = idle();
    this.emit({ type: "respawn", actor: p.id });
  }
  step(human: Command) {
    this.events = [];
    if (this.phase !== "playing") return;
    this.tick++;
    for (const p of this.players) {
      if (p.hp <= 0) {
        if (this.tick >= p.respawnAt) this.respawn(p);
        else continue;
      }
      p.command = p.id === 0 ? human : botCommand(this, p);
      const c = p.command;
      p.yaw = c.yaw;
      p.pitch = clamp(c.pitch, -1.1, 1.1);
      if (
        c.mantle &&
        !p.mantle &&
        !p.hop &&
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
          speed = c.sprint && !c.aim ? 7 : 4.5;
        p.vx += ((c.x / len) * speed - p.vx) * 0.24;
        p.vz += ((c.z / len) * speed - p.vz) * 0.24;
        const pos = this.collision.move(p, { x: p.vx / 30, z: p.vz / 30 });
        p.x = pos.x;
        p.z = pos.z;
        p.y = groundHeight(p.x, p.z, this.map);
        if (p.hop) this.advanceHop(p);
      }
      if (p.reloadAt && this.tick >= p.reloadAt) {
        const n = Math.min(30 - p.ammo, p.reserve);
        p.ammo += n;
        p.reserve -= n;
        p.reloadAt = 0;
      }
      if (
        c.reload &&
        !p.mantle &&
        !p.reloadAt &&
        p.ammo < 30 &&
        p.reserve > 0
      ) {
        p.reloadAt = this.tick + 60;
        this.emit({ type: "reload", actor: p.id });
      }
    }
    for (const p of this.players)
      if (
        p.hp > 0 &&
        !p.mantle &&
        p.command.fire &&
        !p.reloadAt &&
        p.ammo > 0 &&
        this.tick >= p.nextShot
      )
        this.fire(p);
    this.advanceProjectiles();
    for (const s of this.sectors) {
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
    if (this.tick % 150 === 0) {
      for (const s of this.sectors) if (s.owner) this.scores[s.owner]++;
      this.emit({ type: "score" });
    }
    if (this.tick >= this.duration) {
      this.phase = "ended";
      this.projectiles = [];
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
    p.hop = { startTick: this.tick, height: 0, velocity: hopSpeed };
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
    const next = h.height + h.velocity / 30 - hopGravity / (2 * 30 * 30);
    h.velocity -= hopGravity / 30;
    let height = Math.max(0, next);
    if (height > h.height) {
      const from = { x: p.x, y: p.y + h.height + 1.9, z: p.z };
      const to = { ...from, y: p.y + height + 1.9 };
      const fraction = this.collision.ray(from, to);
      if (fraction < 1) {
        height = Math.max(
          h.height,
          h.height + (height - h.height) * fraction - 0.01,
        );
        h.velocity = Math.min(0, h.velocity);
      }
    }
    h.height = height;
    p.y += height;
    p.mode = "Hop";
    if (next <= 0 && h.velocity < 0) {
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
    p.ammo--;
    p.nextShot = this.tick + 3;
    p.protectedUntil = 0;
    const dir = {
      x: Math.sin(p.yaw) * Math.cos(p.pitch),
      y: Math.sin(p.pitch),
      z: -Math.cos(p.yaw) * Math.cos(p.pitch),
    };
    const pivot = { x: p.x, y: p.y + 1.65, z: p.z },
      distance = p.command.aim ? 2.5 : 4;
    const desired = {
      x: p.x - dir.x * distance + Math.cos(p.yaw) * 0.65,
      y: p.y + 2.5 - dir.y * distance,
      z: p.z - dir.z * distance + Math.sin(p.yaw) * 0.65,
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
        for (const y of [0.6, 1.1, 1.6])
          first = Math.min(
            first,
            raySphere(camera, aim, { x: q.x, y: q.y + y, z: q.z }, 0.38),
          );
    aim = {
      x: camera.x + (aim.x - camera.x) * first,
      y: camera.y + (aim.y - camera.y) * first,
      z: camera.z + (aim.z - camera.z) * first,
    };
    const from = {
      x: p.x + Math.cos(p.yaw) * 0.32 + dir.x * 1.08,
      y: p.y + 1.45,
      z: p.z + Math.sin(p.yaw) * 0.32 + dir.z * 1.08,
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
      actor: p.id,
      projectile: shot.id,
      from,
      to: {
        x: from.x + (shot.vx / projectileSpeed) * projectileRange,
        y: from.y + (shot.vy / projectileSpeed) * projectileRange,
        z: from.z + (shot.vz / projectileSpeed) * projectileRange,
      },
    });
    let obstruction = this.collision.ray(pivot, from);
    let muzzleVictim: Soldier | undefined;
    for (const q of this.players)
      if (q !== p && q.hp > 0)
        for (const y of [0.6, 1.1, 1.6]) {
          const t = raySphere(
            pivot,
            from,
            { x: q.x, y: q.y + y, z: q.z },
            0.38,
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
              for (const y of [0.6, 1.1, 1.6]) {
                const t = raySphere(
                  from,
                  to,
                  { x: q.x, y: q.y + y, z: q.z },
                  0.38,
                );
                if (t < nearest) {
                  nearest = t;
                  victim = q;
                }
              }
      shot.x = from.x + (to.x - from.x) * nearest;
      shot.y = from.y + (to.y - from.y) * nearest;
      shot.z = from.z + (to.z - from.z) * nearest;
      shot.remaining = Math.max(0, shot.remaining - travel);
      if (nearest < 1)
        this.impact(shot, { x: shot.x, y: shot.y, z: shot.z }, victim);
      else if (shot.remaining > 0) active.push(shot);
    }
    this.projectiles = active;
  }
  private impact(shot: Projectile, at: V3, victim?: Soldier) {
    const hit =
      !!victim &&
      victim.team !== shot.team &&
      this.tick >= victim.protectedUntil;
    if (hit && victim) {
      victim.hp = Math.max(0, victim.hp - 25);
      this.emit({ type: "damage", actor: victim.id, source: shot.actor });
      if (!victim.hp) {
        victim.deaths++;
        const shooter = this.players.find((p) => p.id === shot.actor);
        if (shooter) shooter.kills++;
        victim.respawnAt = this.tick + 150;
        victim.mode = "Respawn";
        victim.reloadAt = 0;
        victim.mantle = null;
        victim.hop = null;
        victim.y = groundHeight(victim.x, victim.z, this.map);
        this.emit({ type: "death", actor: victim.id });
      }
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
    nodes: Vec[] = [],
    lookup = new Map<string, number>();
  for (let x = -map.width / 2 + step; x <= map.width / 2 - step; x += step)
    for (let z = -map.depth / 2 + step; z <= map.depth / 2 - step; z += step)
      if (!blocked(x, z, 0.7, map)) {
        lookup.set(`${x},${z}`, nodes.length);
        nodes.push({ x, z });
      }
  const edges = nodes.map((a) => {
    const result: number[] = [];
    for (const dx of [-step, 0, step])
      for (const dz of [-step, 0, step]) {
        if (!dx && !dz) continue;
        const index = lookup.get(`${a.x + dx},${a.z + dz}`);
        if (index !== undefined && walkSegment(a, nodes[index], map))
          result.push(index);
      }
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
      return out.reverse();
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
export function botCommand(g: Game, p: Soldier): Command {
  const c = idle();
  c.reload = p.ammo < 1 || (p.ammo < 15 && p.target < 0);
  c.yaw = p.yaw;
  if (g.tick >= p.nextThink) {
    p.nextThink = g.tick + 30;
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
  if (g.tick % 3 === p.id % 3) {
    const visible = (q: Soldier) =>
      q.team !== p.team &&
      q.hp > 0 &&
      dist(q, p) < g.botSettings.engagementRange &&
      g.collision.ray(
        { x: p.x, y: p.y + 1.45, z: p.z },
        { x: q.x, y: q.y + 1.25, z: q.z },
      ) > 0.99;
    const existing = g.players.find((q) => q.id === p.target);
    const target =
      existing && visible(existing)
        ? existing
        : g.players
            .filter(
              (q) =>
                q.team !== p.team &&
                q.hp > 0 &&
                dist(q, p) < g.botSettings.engagementRange,
            )
            .sort((a, b) => dist(a, p) - dist(b, p))
            .slice(0, 6)
            .find(visible);
    if ((target?.id ?? -1) !== p.target) {
      p.target = target?.id ?? -1;
      p.spottedAt = g.tick;
    }
  }
  const target = g.players.find((q) => q.id === p.target && q.hp > 0);
  const objective = g.sectors[p.objective];
  while (p.path.length && dist(p, p.path[0]) < 1) p.path.shift();
  const dest = p.path[0];
  if (dest && dist(p, objective) > 4) {
    const d = dist(p, dest);
    c.x = (dest.x - p.x) / Math.max(0.1, d);
    c.z = (dest.z - p.z) / Math.max(0.1, d);
    c.sprint = !target;
    p.mode = "Navigate";
  } else p.mode = "Capture";
  for (const q of g.players)
    if (q !== p && q.hp > 0 && dist(p, q) < 1.4) {
      const d = Math.max(0.1, dist(p, q));
      c.x += ((p.x - q.x) / d) * 0.7;
      c.z += ((p.z - q.z) / d) * 0.7;
    }
  if (target) {
    p.mode = "Engage";
    const d = dist(p, target);
    const jitter = Math.sin(g.tick * 0.29 + p.id * 7) * g.botSettings.aimError;
    // Lead a visible moving target by the projectile's intercept time.
    const rx = target.x - p.x,
      rz = target.z - p.z;
    const a = target.vx ** 2 + target.vz ** 2 - projectileSpeed ** 2;
    const b = 2 * (rx * target.vx + rz * target.vz);
    const lead = clamp(
      (-b - Math.sqrt(Math.max(0, b * b - 4 * a * d * d))) / (2 * a),
      0,
      projectileRange / projectileSpeed,
    );
    const aimX = rx + target.vx * lead,
      aimZ = rz + target.vz * lead;
    const aimDistance = Math.hypot(aimX, aimZ);
    const aimYaw = Math.atan2(aimX, -aimZ);
    let eyeHeight = p.y + 1.65,
      shoulderOffset = 0;
    if (p.id === 0) {
      // The optional player driver aims through the same shoulder camera as a human.
      const pitch = Math.atan2(target.y + 1.25 - (p.y + 2.5), aimDistance);
      const f =
        g.collision.ray(
          { x: p.x, y: p.y + 1.65, z: p.z },
          {
            x:
              p.x -
              Math.sin(aimYaw) * Math.cos(pitch) * 2.5 +
              Math.cos(aimYaw) * 0.65,
            y: p.y + 2.5 - Math.sin(pitch) * 2.5,
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
      jitter;
    c.pitch =
      Math.atan2(target.y + 1.25 - eyeHeight, aimDistance) + jitter * 0.6;
    c.aim = true;
    c.sprint = false;
    c.fire =
      g.tick - p.spottedAt >= g.botSettings.reactionTicks &&
      g.tick % g.botSettings.burstPeriodTicks < g.botSettings.burstFireTicks;
    c.x *= 0.2;
    c.z *= 0.2;
    if (g.tick % 90 < 30) {
      c.x += Math.cos(c.yaw) * 0.5;
      c.z += Math.sin(c.yaw) * 0.5;
      p.mode = "Reposition";
    }
  } else if (Math.hypot(c.x, c.z) > 0.1) c.yaw = Math.atan2(c.x, -c.z);
  if (
    g.map.terrain &&
    !p.mantle &&
    g.tick >= p.nextMantle &&
    Math.abs(p.x) < 34 &&
    g.tick % 6 === p.id % 6
  ) {
    const landing = mantleLanding(p, c, g.map);
    c.mantle = !!landing && dist(landing, objective) + 0.3 < dist(p, objective);
  }
  return c;
}
