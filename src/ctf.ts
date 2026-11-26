// Capture the flag: an optional mode on the trench maps (?mode=ctf). Each side
// keeps three flags at pickup points spread along its own line, so no single
// spot can be camped; raiders cross no-man's land, take any one of them and
// carry it home to their team's single drop point. A capture scores one.
//
// Plain serializable state on Game.ctf, advanced once a tick after movement
// and damage. Bots get their CTF orders from ctfGoal; see docs/GAME_GUIDE.md.
import { dist, groundHeight, mantleLanding, playArea, type MapDefinition, type Vec } from "./map";
import type { Command, Game, Soldier, Team, V3 } from "./simulation";

export const ctfRules = {
  // Touch distances. A pickup is a small dugout stand, so you must reach it;
  // the drop point is a wider depot that a carrier under fire can dive into.
  pickupRadius: 2.2,
  dropRadius: 3.5,
  returnRadius: 2.2,
  heightTolerance: 1.2,
  // A dropped flag left alone goes home by itself after 20 s.
  returnTicks: 20 * 30,
  // A captured flag's pickup point is bare for 30 s: long enough that raiders
  // rotate to another point, short enough that all three stay in play.
  restockTicks: 30 * 30,
  captureLimit: 5,
  // Tied at full time: sudden death until the next capture, for at most two minutes.
  overtimeTicks: 2 * 60 * 30,
  // Bots: orders are reassigned twice a second.
  orderTicks: 15,
};

export interface CtfPoint extends Vec {
  id: string;
  team: Team;
  name: string;
}
export interface CtfLayout {
  pickups: CtfPoint[];
  drops: Record<Team, Vec & { name: string }>;
}
// Blue (west) and red (east) lines. Trench front's pickups stand on the front
// trench floors at its north end, centre and south end, about 34 m apart; the
// drop point is the rear trench's centre bay behind them.
const trenchLayout: CtfLayout = {
  pickups: [
    { id: "A", team: "blue", name: "North bay", x: -21, z: -33 },
    { id: "B", team: "blue", name: "Centre bay", x: -21, z: -1 },
    { id: "C", team: "blue", name: "South bay", x: -21, z: 35 },
    { id: "D", team: "red", name: "North bay", x: 27, z: -27 },
    { id: "E", team: "red", name: "Centre bay", x: 21, z: -1 },
    { id: "F", team: "red", name: "South bay", x: 23, z: 31 },
  ],
  drops: {
    blue: { name: "Support trench", x: -37, z: -1 },
    red: { name: "Support trench", x: 37, z: -1 },
  },
};
// Verdun: the two forward strongpoints of each side and its front trench's
// centre bay; the drop point is the rear trench's centre.
const verdunLayout: CtfLayout = {
  pickups: [
    { id: "A", team: "blue", name: "Chapitre Wood", x: -42, z: -31 },
    { id: "B", team: "blue", name: "Front trench", x: -63, z: 2 },
    { id: "C", team: "blue", name: "Fleury", x: -45, z: 25 },
    { id: "D", team: "red", name: "Dame Ravine", x: 44, z: -17 },
    { id: "E", team: "red", name: "Front trench", x: 63, z: 2 },
    { id: "F", team: "red", name: "Hardaumont Work", x: 49, z: 29 },
  ],
  drops: {
    blue: { name: "Support trench", x: -75, z: -8 },
    red: { name: "Support trench", x: 75, z: -8 },
  },
};
const layouts: Partial<Record<MapDefinition["id"], CtfLayout>> = {
  trenches: trenchLayout,
  "night-raid": trenchLayout,
  verdun: verdunLayout,
};
// A map can also carry its own layout (MapDefinition.ctfLayout).
export const ctfLayout = (map: Pick<MapDefinition, "id" | "ctfLayout">): CtfLayout | undefined => layouts[map.id] ?? map.ctfLayout;
export const supportsCtf = (map: Pick<MapDefinition, "id" | "ctfLayout">) => !!ctfLayout(map);

// The same battlefield with the pickup points as its objectives. They are the
// map's sectors so everything that reads objectives (labels, the minimap,
// rings and the squad planner) sees them; Game.scoring "ctf" keeps the
// domination capture rule off them.
export function ctfMap(map: MapDefinition): MapDefinition {
  const layout = ctfLayout(map);
  if (!layout) return map;
  return {
    ...map,
    scoring: "ctf",
    sectors: layout.pickups.map(({ id, team, name, x, z }) => ({ id, name, x, z, home: team })),
  };
}

export type CtfFlagState = "home" | "carried" | "dropped" | "restocking";
export interface CtfFlag {
  // The pickup point's id; the flag belongs to that point's team.
  id: string;
  team: Team;
  home: V3;
  state: CtfFlagState;
  carrier: number | null;
  at: V3 | null;
  // Tick the flag was dropped (its return timer) or captured (its restock timer).
  since: number;
}
export type CtfRoleKind = "carry" | "escort" | "intercept" | "return" | "recover" | "raid" | "guard";
export interface CtfRole {
  kind: CtfRoleKind;
  flag?: string;
  carrier?: number;
}
export interface CtfState {
  flags: CtfFlag[];
  drops: Record<Team, V3 & { name: string }>;
  overtime: boolean;
  takes: Record<Team, number>;
  // Bot orders, by soldier id.
  roles: Record<number, CtfRole>;
  // Bots that carried a flag draw their primary again once it is gone.
  rearm: number[];
}
export type CtfAction = "take" | "pickup" | "drop" | "return" | "capture" | "restock" | "overtime";
export interface CtfEvent {
  type: "flag";
  action: CtfAction;
  // The flag's own team; a capture scores for the other.
  team: Team;
  flag: string;
  actor?: number;
  at?: Vec;
  // A return by timeout rather than by touch.
  auto?: boolean;
}

const other = (team: Team): Team => (team === "blue" ? "red" : "blue");
const floor = (map: MapDefinition, v: Vec): V3 => ({ x: v.x, y: groundHeight(v.x, v.z, map), z: v.z });

export function createCtf(map: MapDefinition): CtfState | undefined {
  const layout = map.scoring === "ctf" ? ctfLayout(map) : undefined;
  if (!layout) return undefined;
  return {
    flags: layout.pickups.map((p) => ({ id: p.id, team: p.team, home: floor(map, p), state: "home", carrier: null, at: null, since: 0 })),
    drops: {
      blue: { ...floor(map, layout.drops.blue), name: layout.drops.blue.name },
      red: { ...floor(map, layout.drops.red), name: layout.drops.red.name },
    },
    overtime: false,
    takes: { blue: 0, red: 0 },
    roles: {},
    rearm: [],
  };
}

export const carriedFlag = (g: Game, p: Pick<Soldier, "id">) =>
  g.ctf?.flags.find((f) => f.state === "carried" && f.carrier === p.id);
// Where a flag is now: on its stand, on the ground, or on a carrier's back.
export function flagPosition(g: Game, f: CtfFlag): V3 | null {
  if (f.state === "home") return f.home;
  if (f.state === "dropped") return f.at;
  if (f.state === "carried" && f.carrier !== null) {
    const q = g.players[f.carrier];
    return { x: q.x, y: q.y, z: q.z };
  }
  return null;
}

// A soldier on their feet within reach, at about the same level, with nothing
// solid between: a flag on the trench floor is not taken from the bank top.
export function touching(g: Game, p: Soldier, at: V3, radius: number) {
  return (
    p.hp > 0 &&
    !p.mantle &&
    p.mountedGun === undefined &&
    p.tank === undefined &&
    dist(p, at) <= radius &&
    Math.abs(p.y - at.y) <= ctfRules.heightTolerance &&
    g.collision.ray({ x: p.x, y: p.y + 0.9, z: p.z }, { x: at.x, y: at.y + 0.9, z: at.z }) > 0.99
  );
}

function take(g: Game, f: CtfFlag, p: Soldier, action: "take" | "pickup") {
  const from = f.state === "home" ? f.home : f.at!;
  f.state = "carried";
  f.carrier = p.id;
  f.at = null;
  p.protectedUntil = Math.min(p.protectedUntil, g.tick);
  if (action === "take") g.ctf!.takes[p.team]++;
  g.emit({ type: "flag", action, team: f.team, flag: f.id, actor: p.id, at: { x: from.x, z: from.z } });
}

// The flag comes to rest on the ground, even if its carrier fell mid-climb,
// and one that falls in the dead zone or the boundary wire lands just inside the line.
function landing(g: Game, p: Soldier): V3 {
  const area = playArea(g.map);
  return floor(g.map, {
    x: Math.max(-area.width / 2 + 2, Math.min(area.width / 2 - 2, p.x)),
    z: Math.max(-area.depth / 2 + 2, Math.min(area.depth / 2 - 2, p.z)),
  });
}

export function advanceCtf(g: Game) {
  const ctf = g.ctf;
  if (!ctf || g.phase !== "playing") return;
  for (const f of ctf.flags) {
    if (f.state === "carried") {
      const p = g.players[f.carrier!];
      if (p.hp <= 0) {
        f.state = "dropped";
        f.carrier = null;
        f.at = landing(g, p);
        f.since = g.tick;
        g.emit({ type: "flag", action: "drop", team: f.team, flag: f.id, actor: p.id, at: { x: f.at.x, z: f.at.z } });
      } else if (touching(g, p, ctf.drops[p.team], ctfRules.dropRadius)) {
        f.state = "restocking";
        f.carrier = null;
        f.since = g.tick;
        p.captures++;
        g.scores[p.team] = Math.min(g.scoreLimit ?? Infinity, g.scores[p.team] + 1);
        g.emit({ type: "flag", action: "capture", team: f.team, flag: f.id, actor: p.id, at: { x: p.x, z: p.z } });
        g.emit({ type: "score", points: { ...g.scores } });
        // Sudden death ends on the first capture.
        if (ctf.overtime) g.duration = g.tick;
      }
    }
    if (f.state === "dropped") {
      const at = f.at!;
      const near = g.players.filter((q) => touching(g, q, at, ctfRules.returnRadius)).sort((a, b) => dist(a, at) - dist(b, at));
      const owner = near.find((q) => q.team === f.team);
      const enemy = near.find((q) => q.team !== f.team && !carriedFlag(g, q));
      if (owner || g.tick - f.since >= ctfRules.returnTicks) {
        f.state = "home";
        f.at = null;
        g.emit({ type: "flag", action: "return", team: f.team, flag: f.id, actor: owner?.id, at: { x: at.x, z: at.z }, auto: !owner });
      } else if (enemy) take(g, f, enemy, "pickup");
    } else if (f.state === "restocking" && g.tick - f.since >= ctfRules.restockTicks) {
      f.state = "home";
      g.emit({ type: "flag", action: "restock", team: f.team, flag: f.id, at: { x: f.home.x, z: f.home.z } });
    }
    if (f.state === "home") {
      const raider = g.players
        .filter((q) => q.team !== f.team && !carriedFlag(g, q) && touching(g, q, f.home, ctfRules.pickupRadius))
        .sort((a, b) => dist(a, f.home) - dist(b, f.home))[0];
      if (raider) take(g, f, raider, "take");
    }
  }
  // Tied at full time: play on until someone captures.
  if (!ctf.overtime && g.tick >= g.duration && g.scores.blue === g.scores.red) {
    ctf.overtime = true;
    g.duration = g.tick + ctfRules.overtimeTicks;
    g.emit({ type: "flag", action: "overtime", team: "blue", flag: "" });
  }
  for (let i = ctf.rearm.length - 1; i >= 0; i--) {
    const p = g.players[ctf.rearm[i]];
    if (!carriedFlag(g, p) && (p.hp <= 0 || p.equippedSlot === "primary")) ctf.rearm.splice(i, 1);
  }
  if (g.tick % ctfRules.orderTicks === 0) for (const team of ["blue", "red"] as const) orderTeam(g, team);
}

// The carrier's restrictions, applied to whatever the player or bot asked for:
// a flag in one hand leaves the pistol, no sprint, no frags, no mounting a gun
// or shouldering a flame kit. Mantling and hopping stay, since the trenches
// cannot be crossed without them. Bots that carried draw their rifle again.
export function ctfCommand(g: Game, p: Soldier, c: Command) {
  if (!g.ctf) return;
  if (carriedFlag(g, p)) {
    c.sprint = false;
    c.grenade = false;
    c.interact = false;
    c.deployGun = false;
    if (c.equip === "primary") c.equip = undefined;
    if (p.equippedSlot !== "sidearm" && p.inventory) c.equip = "sidearm";
    if (!g.humanPlayerIds.includes(p.id) && !g.ctf.rearm.includes(p.id)) g.ctf.rearm.push(p.id);
  } else if (g.ctf.rearm.includes(p.id) && p.equippedSlot === "sidearm" && p.loadout !== "emplacement") c.equip = "primary";
}

// Bots with an order to move keep moving in a fight. An ordinary bot that
// sees an enemy slows to a creep and sidesteps, which in open ground between
// the lines only gets a raiding party shot down. Parties also screen their
// crossing with smoke as they leave their own front trench.
const moving = new Set<CtfRoleKind>(["carry", "escort", "intercept", "return", "recover", "raid"]);
export function ctfBotCommand(g: Game, p: Soldier, c: Command): Command {
  if (g.ctf) pressOn(g, p, c);
  return c;
}
function pressOn(g: Game, p: Soldier, c: Command) {
  const role = g.ctf!.roles[p.id];
  const goal = role && moving.has(role.kind) ? ctfGoal(g, p) : undefined;
  if (!goal || p.mantle || p.melee || p.hop || p.fall || g.tick < p.staggerUntil || p.mode === "Evade artillery") return;
  // The route planner walks only within one side's trench system: banks
  // can be dropped down but not walked up. With no route, cross the way an
  // assault does, straight for the goal, climbing every bank on the way.
  const direct = !p.path.length;
  const next = p.path[0] ?? goal;
  if (direct && dist(p, goal) < 1) return;
  if (direct || p.mode === "Engage" || p.mode === "Reposition") {
    const d = Math.max(0.1, dist(p, next));
    c.x = (next.x - p.x) / d;
    c.z = (next.z - p.z) / d;
    if (!c.aim) c.yaw = Math.atan2(c.x, -c.z);
    p.mode = c.aim ? "Engage" : "Crossing";
  }
  if (direct && g.tick >= p.nextMantle && g.tick % 6 === p.id % 6 && !p.crouched) {
    const landing = mantleLanding(p, c, g.map);
    c.mantle = !!landing && dist(landing, goal) + 0.3 < dist(p, goal);
  }
  const front = frontLine(g, p.team);
  if (front === undefined || (role.kind !== "raid" && role.kind !== "carry")) return;
  const side = p.team === "blue" ? -1 : 1;
  // At the jump-off: in or just in front of our own front trench, heading across.
  const jumpOff = side * (p.x - front) < 3 && side * (p.x - front) > -9 && side * (goal.x - p.x) < -12;
  if (!jumpOff || p.smokes <= 0 || g.tick < p.botSmokeReadyAt || g.tick < p.nextGrenade || p.reloadAt || p.hop || p.fall) return;
  const d = Math.max(1, dist(p, goal));
  const aim = { x: p.x + ((goal.x - p.x) / d) * 14, z: p.z + ((goal.z - p.z) / d) * 14 };
  const screened = g.smokeClouds.some((s) => s.expiresAt - g.tick > 150 && dist(s, aim) < 10) ||
    g.grenades.some((s) => s.kind === "smoke" && dist(s, aim) < 10);
  if (screened) return;
  c.smoke = true;
  c.grenade = c.fire = c.aim = false;
  c.yaw = Math.atan2(aim.x - p.x, -(aim.z - p.z));
  c.pitch = 0.38;
  p.mode = "Screening the raid";
}
const fronts = new WeakMap<MapDefinition, Partial<Record<Team, number>>>();
function frontLine(g: Game, team: Team) {
  let known = fronts.get(g.map);
  if (!known) fronts.set(g.map, (known = {}));
  if (!(team in known)) {
    const line = g.map.terrain?.trenchLines?.find((l) => l.team === team && l.role === "front");
    known[team] = line ? line.sections.reduce((s, v) => s + v.x, 0) / line.sections.length : undefined;
  }
  return known[team];
}

// --- Bot orders -------------------------------------------------------------
// Bots know only public flag state: which flags are home, dropped where, or
// on whose back (the carried flag stands out above the trench line).
function nearestFree(free: Soldier[], at: Vec, n: number, range = Infinity) {
  const picked = free
    .filter((q) => dist(q, at) < range)
    .sort((a, b) => dist(a, at) - dist(b, at) || a.id - b.id)
    .slice(0, n);
  for (const q of picked) free.splice(free.indexOf(q), 1);
  return picked;
}
// Raiding parties: three squads in five. A flag is easier to hold than to
// carry home, so the defence needs fewer soldiers than the attack: the rest
// man the firing steps, or guard their own points where there are none.
const raidGroup = (g: Game, p: Soldier) => {
  const group = Math.floor(p.teamIndex / 5),
    groups = Math.ceil(g.teamSize / 5);
  if (groups < 2) return p.teamIndex % 2 ? group : -1;
  return group % 5 !== 0 && group % 5 !== 2 ? group : -1;
};

function orderTeam(g: Game, team: Team) {
  const ctf = g.ctf!,
    enemy = other(team);
  const free = g.players.filter((q) => q.team === team && q.hp > 0 && !g.humanPlayerIds.includes(q.id));
  for (const q of free) delete ctf.roles[q.id];
  const give = (qs: Soldier[], role: CtfRole) => { for (const q of qs) ctf.roles[q.id] = role; };
  for (const f of ctf.flags.filter((f) => f.state === "carried")) {
    const carrier = g.players[f.carrier!];
    if (carrier.team === team && free.includes(carrier)) {
      free.splice(free.indexOf(carrier), 1);
      ctf.roles[carrier.id] = { kind: "carry", flag: f.id };
    }
  }
  // Our flag on an enemy's back: the nearest run it down.
  for (const f of ctf.flags.filter((f) => f.team === team && f.state === "carried"))
    give(nearestFree(free, g.players[f.carrier!], 4), { kind: "intercept", flag: f.id, carrier: f.carrier! });
  for (const f of ctf.flags.filter((f) => f.state === "dropped"))
    give(nearestFree(free, f.at!, 3), { kind: f.team === team ? "return" : "recover", flag: f.id });
  for (const f of ctf.flags.filter((f) => f.state === "carried" && f.team === enemy))
    give(nearestFree(free, g.players[f.carrier!], 4, 30), { kind: "escort", flag: f.id, carrier: f.carrier! });
  const stocked = ctf.flags.filter((f) => f.team === enemy && f.state === "home");
  // Parties trickling at three points one by one are shot down in the open:
  // they all hit one point together, and every 40 s move on to the next, so
  // the defence cannot settle on one.
  const target = stocked[Math.floor(g.tick / (40 * 30)) % Math.max(1, stocked.length)];
  const stations = !!g.map.terrain?.firingPositions;
  const own = ctf.flags.filter((f) => f.team === team && f.state === "home");
  for (const q of free) {
    if (raidGroup(g, q) >= 0 && target) ctf.roles[q.id] = { kind: "raid", flag: target.id };
    // Without firing steps to man, the rest guard a stocked point of their own.
    else if (!stations && own.length) ctf.roles[q.id] = { kind: "guard", flag: own[q.teamIndex % own.length].id };
  }
}

// Where a bot's CTF order sends it; undefined leaves it to its usual post.
export function ctfGoal(g: Game, p: Soldier): Vec | undefined {
  const ctf = g.ctf;
  const role = ctf?.roles[p.id];
  if (!ctf || !role) return undefined;
  const f = ctf.flags.find((f) => f.id === role.flag);
  if (role.kind === "carry") return carriedFlag(g, p) ? ctf.drops[p.team] : undefined;
  if (!f) return undefined;
  if (role.kind === "intercept" || role.kind === "escort") {
    if (f.state !== "carried") return undefined;
    const q = g.players[f.carrier!];
    // Escorts walk a little ahead of the carrier, toward home.
    if (role.kind === "escort") {
      const home = ctf.drops[q.team], d = Math.max(1, dist(q, home));
      return { x: q.x + ((home.x - q.x) / d) * 4, z: q.z + ((home.z - q.z) / d) * 4 };
    }
    return { x: q.x, z: q.z };
  }
  if (role.kind === "return" || role.kind === "recover") return f.state === "dropped" ? f.at! : undefined;
  if (role.kind === "raid") return f.state === "home" ? f.home : undefined;
  // Guards spread on a ring around their point.
  const a = (p.teamIndex * 2.39996) % (Math.PI * 2), r = 6 + (p.teamIndex % 3) * 4;
  return { x: f.home.x + Math.cos(a) * r, z: f.home.z + Math.sin(a) * r };
}
