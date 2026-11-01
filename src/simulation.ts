import { blocked, dist, sectors, spawn, type Vec } from "./map";
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
});
export interface Soldier extends Vec {
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
  | { type: "fire"; actor: number; from: V3; to: V3; hit: boolean }
  | { type: "damage"; actor: number; source: number }
  | { type: "death" | "respawn" | "reload"; actor: number }
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
  move(p: Vec, d: Vec): Vec {
    let x = p.x,
      z = p.z;
    if (!blocked(x + d.x, z)) x += d.x;
    if (!blocked(x, z + d.z)) z += d.z;
    return { x, z };
  }
  ray(a: V3, b: V3): number {
    const n = Math.ceil(dist(a, b) * 5);
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      if (blocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, 0)) return t;
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
  sectors: Sector[] = sectors.map((s) => ({
    ...s,
    control: 0,
    owner: null,
    contested: false,
  }));
  events: Event[] = [];
  sequence = 0;
  seed: number;
  constructor(
    public collision: CollisionWorld,
    public bots = true,
    duration = 14400,
    seed = 12345,
    public botSettings: BotSettings = { ...defaultBotSettings },
  ) {
    this.duration = duration;
    this.seed = seed;
    for (let i = 0; i < (bots ? 10 : 1); i++) {
      const team: Team = i < 5 ? "blue" : "red";
      this.players.push({
        id: i,
        team,
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
      duration: this.duration,
      phase: this.phase,
      winner: this.winner,
      scores: this.scores,
      players: this.players,
      sectors: this.sectors,
      sequence: this.sequence,
      seed: this.seed,
    });
  }
  emit(e: EventInput) {
    this.events.push({ ...e, id: ++this.sequence, tick: this.tick } as Event);
  }
  respawn(p: Soldier) {
    const s = spawn[p.team];
    p.x = s.x + ((p.id % 5) - 2) * 1.8;
    p.z = s.z;
    p.hp = 100;
    p.ammo = 30;
    p.reserve = 120;
    p.reloadAt = 0;
    p.vx = 0;
    p.vz = 0;
    p.nextShot = this.tick;
    p.protectedUntil = this.tick + 60;
    p.path = [];
    p.target = -1;
    p.mode = "Navigate";
    p.nextThink = 0;
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
      const len = Math.max(1, Math.hypot(c.x, c.z)),
        speed = c.sprint && !c.aim ? 7 : 4.5;
      p.vx += ((c.x / len) * speed - p.vx) * 0.24;
      p.vz += ((c.z / len) * speed - p.vz) * 0.24;
      const pos = this.collision.move(p, { x: p.vx / 30, z: p.vz / 30 });
      p.x = pos.x;
      p.z = pos.z;
      if (p.reloadAt && this.tick >= p.reloadAt) {
        const n = Math.min(30 - p.ammo, p.reserve);
        p.ammo += n;
        p.reserve -= n;
        p.reloadAt = 0;
      }
      if (c.reload && !p.reloadAt && p.ammo < 30 && p.reserve > 0) {
        p.reloadAt = this.tick + 60;
        this.emit({ type: "reload", actor: p.id });
      }
    }
    for (const p of this.players)
      if (
        p.hp > 0 &&
        p.command.fire &&
        !p.reloadAt &&
        p.ammo > 0 &&
        this.tick >= p.nextShot
      )
        this.fire(p);
    for (const s of this.sectors) {
      const occupants = this.players.filter((p) => p.hp > 0 && dist(p, s) <= 8),
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
      this.winner =
        this.scores.blue === this.scores.red
          ? "draw"
          : this.scores.blue > this.scores.red
            ? "blue"
            : "red";
      this.emit({ type: "end", winner: this.winner });
    }
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
    const pivot = { x: p.x, y: 1.65, z: p.z },
      distance = p.command.aim ? 2.5 : 4;
    const desired = {
      x: p.x - dir.x * distance + Math.cos(p.yaw) * 0.65,
      y: 2.5 - dir.y * distance,
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
      x: camera.x + dir.x * 60,
      y: camera.y + dir.y * 60,
      z: camera.z + dir.z * 60,
    };
    let first = this.collision.ray(camera, aim);
    for (const q of this.players)
      if (q !== p && q.hp > 0)
        for (const y of [0.6, 1.1, 1.6])
          first = Math.min(
            first,
            raySphere(camera, aim, { x: q.x, y, z: q.z }, 0.38),
          );
    aim = {
      x: camera.x + (aim.x - camera.x) * first,
      y: camera.y + (aim.y - camera.y) * first,
      z: camera.z + (aim.z - camera.z) * first,
    };
    const from = {
      x: p.x + Math.cos(p.yaw) * 0.32 + dir.x * 0.55,
      y: 1.45,
      z: p.z + Math.sin(p.yaw) * 0.32 + dir.z * 0.55,
    };
    const length = Math.hypot(aim.x - from.x, aim.y - from.y, aim.z - from.z),
      scale = Math.min(1, 60 / Math.max(0.001, length));
    aim = {
      x: from.x + (aim.x - from.x) * scale,
      y: from.y + (aim.y - from.y) * scale,
      z: from.z + (aim.z - from.z) * scale,
    };
    const muzzleBlocked = this.collision.ray(pivot, from) < 0.99;
    // Extend slightly to include a camera-selected surface despite floating point rounding.
    const end = {
      x: aim.x + (aim.x - from.x) * 0.002,
      y: aim.y + (aim.y - from.y) * 0.002,
      z: aim.z + (aim.z - from.z) * 0.002,
    };
    let nearest = muzzleBlocked ? 0 : this.collision.ray(from, end),
      victim: Soldier | undefined;
    for (const q of this.players)
      if (q !== p && q.hp > 0)
        for (const y of [0.6, 1.1, 1.6]) {
          const t = raySphere(from, end, { x: q.x, y, z: q.z }, 0.38);
          if (t < nearest) {
            nearest = t;
            victim = q;
          }
        }
    const hit =
      !!victim && victim.team !== p.team && this.tick >= victim.protectedUntil;
    if (hit && victim) {
      victim.hp = Math.max(0, victim.hp - 25);
      this.emit({ type: "damage", actor: victim.id, source: p.id });
      if (!victim.hp) {
        victim.deaths++;
        p.kills++;
        victim.respawnAt = this.tick + 150;
        victim.mode = "Respawn";
        victim.reloadAt = 0;
        this.emit({ type: "death", actor: victim.id });
      }
    }
    this.emit({
      type: "fire",
      actor: p.id,
      from,
      to: {
        x: from.x + (end.x - from.x) * nearest,
        y: from.y + (end.y - from.y) * nearest,
        z: from.z + (end.z - from.z) * nearest,
      },
      hit,
    });
  }
}
// A fixed waypoint lattice forms a graph; edges are checked against expanded obstacles.
const nodes: Vec[] = [];
for (let x = -45; x <= 45; x += 5)
  for (let z = -45; z <= 45; z += 5)
    if (!blocked(x, z, 0.7)) nodes.push({ x, z });
function clear(a: Vec, b: Vec) {
  const n = Math.ceil(dist(a, b) / 0.4);
  for (let i = 0; i <= n; i++)
    if (blocked(a.x + ((b.x - a.x) * i) / n, a.z + ((b.z - a.z) * i) / n, 0.6))
      return false;
  return true;
}
const edges = nodes.map((a) =>
  nodes
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => dist(a, b) > 0 && dist(a, b) < 7.2 && clear(a, b))
    .map(({ i }) => i),
);
export function pathfind(a: Vec, b: Vec): Vec[] {
  if (clear(a, b)) return [{ ...b }];
  const closest = (p: Vec) =>
    nodes
      .map((n, i) => ({ i, d: dist(n, p) }))
      .filter(({ i }) => clear(p, nodes[i]))
      .sort((x, y) => x.d - y.d)[0]?.i;
  const start = closest(a),
    goal = closest(b);
  if (start === undefined || goal === undefined) return [];
  const open = new Set([start]),
    came = new Map<number, number>(),
    cost = new Map([[start, 0]]);
  while (open.size) {
    const u = [...open].sort(
      (x, y) =>
        cost.get(x)! +
        dist(nodes[x], nodes[goal]) -
        (cost.get(y)! + dist(nodes[y], nodes[goal])),
    )[0];
    if (u === goal) {
      const out = [{ ...b }, nodes[u]];
      let k = u;
      while (came.has(k)) {
        k = came.get(k)!;
        out.push(nodes[k]);
      }
      return out.reverse();
    }
    open.delete(u);
    for (const v of edges[u]) {
      const g = cost.get(u)! + dist(nodes[u], nodes[v]);
      if (g < (cost.get(v) ?? Infinity)) {
        came.set(v, u);
        cost.set(v, g);
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
    p.objective = ranks[0].i;
    p.path = pathfind(p, g.sectors[p.objective]);
  }
  if (g.tick % 3 === p.id % 3) {
    const target = g.players
      .filter(
        (q) =>
          q.team !== p.team &&
          q.hp > 0 &&
          dist(q, p) < g.botSettings.engagementRange &&
          g.collision.ray(
            { x: p.x, y: 1.6, z: p.z },
            { x: q.x, y: 1.2, z: q.z },
          ) > 0.99,
      )
      .sort((a, b) => dist(a, p) - dist(b, p))[0];
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
    c.yaw = Math.atan2(target.x - p.x, -(target.z - p.z)) + jitter;
    c.pitch = Math.atan2(-0.4, d) + jitter * 0.6;
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
  return c;
}
