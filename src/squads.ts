// Squad-level bot tactics: squads and a team commander, shared threat memory,
// bounding overwatch, building use, grenades, hearing, threat targeting and a
// fading danger map for routes. See docs/AI_PROPOSAL.md.
//
// Bots only use what their team could know: what a member saw or heard, where
// fire came from, and public flag state. No hidden enemy position is read.
import { dist, walkSegment, type Box, type Vec } from "./map";
import { angleDelta, semiAutoIntent, turnToward } from "./awareness";
import { flagContains } from "./domination";
import { objectiveOpen } from "./offensive";
import { gasCost } from "./gas";
import { maskedBotAim } from "./hip-fire";
import {
  exposedAimHeight,
  grenadeBlastRadius,
  grenadeGravity,
  grenadeSpeed,
  minThrowSpeed,
  idle,
  rifleHeight,
  type Command,
  type Event,
  type Game,
  type Soldier,
  type Team,
  type V3,
} from "./simulation";

export const squadRules = {
  size: 5,
  // The commander reassigns flags every two seconds.
  commandTicks: 60,
  // Bounding halves swap every 2.5 s while a squad is in contact.
  boundTicks: 75,
  // A grenade is planned only against a sighting this recent.
  grenadeContactTicks: 75,
  // Each bot waits at least this long between its own frag throws.
  personalGrenadeTicks: 300,
  // Danger map: 4 m cells, fading with a 10 s time constant (about 5% after 30 s).
  dangerCell: 4,
  dangerFadeTicks: 300,
  dangerCap: 6,
  dangerWeight: 0.6,
  // A squad stacks at the door this long before entering without a grenade.
  stackTicks: 90,
  // Buildings with a failing piece are avoided for this long.
  unsafeTicks: 600,
  // A counterattack forms up until this many soldiers are near the flag,
  // or for at most 15 s.
  formUpSoldiers: 10,
  formUpTicks: 450,
};

// Individual behaviours, for audits that measure what each one contributes.
export const squadFeatures = {
  commander: true, overwatch: true, windows: true, grenades: true, suppression: true,
  hearing: true, attention: true, threat: true, stacking: true, corners: true, danger: true, escape: true, cohesion: true,
};

export type CalloutLine = "moving" | "reloading" | "house";
export const calloutText: Record<CalloutLine, string> = {
  moving: "Moving!",
  reloading: "Reloading!",
  house: "Enemy in the house!",
};

export interface SquadContact extends V3 {
  tick: number;
  enemy: number;
  building: string | null;
}
export interface Squad {
  id: number;
  team: Team;
  members: number[];
  objective: number;
  // Whether the team commander chooses this squad's flag.
  commanded: boolean;
  reserve: boolean;
  contact: SquadContact | null;
  bound: 0 | 1;
  boundUntil: number;
  lastGrenade: number;
  breach: { building: string; until: number } | null;
  called: string[];
  // Part of a massed counterattack on an enemy-held flag since this tick.
  assault: number | null;
}
interface DangerCell {
  v: number;
  t: number;
}
export interface Tactics {
  squads: Squad[];
  squadOf: Record<number, number>;
  nextCommand: number;
  danger: Record<Team, Map<number, DangerCell>>;
  unsafe: Record<string, number>;
  nextFrag: Record<number, number>;
  heard: Record<number, { x: number; z: number; tick: number }>;
  // Each team's counterattack target, while it is behind on flags.
  assault: Record<Team, { flag: number; since: number } | null>;
}

const player = (g: Game, id: number) =>
  g.players[id]?.id === id ? g.players[id] : g.players.find((p) => p.id === id);

export function createTactics(g: Game): Tactics | undefined {
  if (!g.bots || !g.botSettings.squads) return undefined;
  const t: Tactics = {
    squads: [],
    squadOf: {},
    nextCommand: 0,
    danger: { blue: new Map(), red: new Map() },
    unsafe: {},
    nextFrag: {},
    heard: {},
    assault: { blue: null, red: null },
  };
  const stations = !!g.map.terrain?.firingPositions;
  for (const team of ["blue", "red"] as const) {
    const bots = g.players
      .filter((p) => p.team === team && p.id !== 0 && !g.humanPlayerIds.includes(p.id))
      .sort((a, b) => a.teamIndex - b.teamIndex);
    const count = Math.ceil(bots.length / squadRules.size);
    for (let i = 0; i < count; i++) {
      const members = bots.slice(i * squadRules.size, (i + 1) * squadRules.size).map((p) => p.id);
      const squad: Squad = {
        id: t.squads.length,
        team,
        members,
        objective: -1,
        // A commander needs several squads to spread; small teams keep
        // individual flag choice. Trench maps keep their firing stations.
        commanded: count >= 3 && !stations && g.sectors.length > 1,
        reserve: false,
        contact: null,
        bound: 0,
        boundUntil: 0,
        lastGrenade: -1000,
        breach: null,
        called: [],
        assault: null,
      };
      for (const id of members) t.squadOf[id] = squad.id;
      t.squads.push(squad);
    }
  }
  return t;
}

export function squadOf(g: Game, p: Soldier): Squad | undefined {
  const t = g.tactics;
  const i = t?.squadOf[p.id];
  return i === undefined ? undefined : t!.squads[i];
}
const living = (g: Game, s: Squad) =>
  s.members.map((id) => player(g, id)!).filter((q) => q && q.hp > 0);
export function squadLeader(g: Game, s: Squad) {
  return living(g, s)[0];
}

// --- Danger map -----------------------------------------------------------
const cellKey = (x: number, z: number) =>
  (Math.floor(x / squadRules.dangerCell) + 2048) * 4096 +
  (Math.floor(z / squadRules.dangerCell) + 2048);
export function dangerAt(g: Game, team: Team, x: number, z: number) {
  const cell = g.tactics?.danger[team].get(cellKey(x, z));
  return cell ? cell.v * Math.exp(-(g.tick - cell.t) / squadRules.dangerFadeTicks) : 0;
}
export function raiseDanger(g: Game, team: Team, at: Vec, amount: number) {
  const map = g.tactics?.danger[team];
  if (!map) return;
  map.set(cellKey(at.x, at.z), {
    v: Math.min(squadRules.dangerCap, dangerAt(g, team, at.x, at.z) + amount),
    t: g.tick,
  });
}
// Extra A* cost: each metre through a dangerous cell costs more than open
// ground. Distance stays a lower bound, so the search remains exact.
export function dangerCost(g: Game, team: Team) {
  // Gas is a danger every soldier can see, squad or not.
  const gas = gasCost(g);
  if (!squadFeatures.danger || !g.tactics?.danger[team].size) return gas;
  const danger = (a: Vec, b: Vec) =>
    dist(a, b) * squadRules.dangerWeight * dangerAt(g, team, (a.x + b.x) / 2, (a.z + b.z) / 2);
  return gas ? (a: Vec, b: Vec) => danger(a, b) + gas(a, b) : danger;
}

// --- Buildings ------------------------------------------------------------
export function kitBuildingAt(g: Game, at: Vec) {
  return g.map.buildings?.find(
    (b) => b.kit && Math.abs(at.x - b.x) < b.w / 2 && Math.abs(at.z - b.z) < b.d / 2,
  );
}
export const buildingUnsafe = (g: Game, id: string | undefined) =>
  !!id && (g.tactics?.unsafe[id] ?? 0) > g.tick;

const failingCache = new WeakMap<Game, { key: string; boxes: Box[] }>();
function failingBoxes(g: Game): Box[] {
  const failing = g.map.destruction?.failing;
  const ids = failing ? Object.keys(failing) : [];
  if (!ids.length) return [];
  const key = ids.join("|");
  const cached = failingCache.get(g);
  if (cached?.key === key) return cached.boxes;
  const wanted = new Set(ids);
  const boxes = g.map.boxes.filter((b) => b.id && wanted.has(b.id));
  failingCache.set(g, { key, boxes });
  return boxes;
}

// --- Per-tick bookkeeping -------------------------------------------------
// Reads the previous tick's public events: fire from a direction, wounds
// and deaths. Called before the events are cleared.
export function observeTactics(g: Game, events: readonly Event[]) {
  if (!g.tactics) return;
  for (const e of events) {
    if (e.type === "damage") {
      const victim = player(g, e.actor);
      if (!victim) continue;
      raiseDanger(g, victim.team, victim, 0.6);
      const source = player(g, e.source);
      const squad = squadOf(g, victim);
      if (squad && source && source.team !== victim.team && e.from)
        setContact(g, squad, { x: e.from.x, y: e.from.y, z: e.from.z }, source.id);
    } else if (e.type === "death") {
      const victim = player(g, e.actor);
      if (victim) raiseDanger(g, victim.team, victim, 2.5);
    } else if (e.type === "grenadeExplosion") {
      // A squad grenade into a stacked building sends the squad in.
      const thrower = player(g, e.actor);
      const squad = thrower && squadOf(g, thrower);
      if (squad?.breach) squad.breach.until = Math.min(squad.breach.until, g.tick + 6);
    }
  }
}

export function advanceTactics(g: Game) {
  const t = g.tactics;
  if (!t) return;
  for (const box of failingBoxes(g)) {
    const building = box.architecture?.building;
    if (building) t.unsafe[building] = g.tick + squadRules.unsafeTicks;
  }
  for (const s of t.squads) {
    if (s.contact && !fresh(g, s.contact, g.botSettings.squadMemoryTicks)) {
      s.contact = null;
      s.called = [];
    }
    if (s.contact && g.tick >= s.boundUntil) {
      s.bound = s.bound ? 0 : 1;
      s.boundUntil = g.tick + squadRules.boundTicks;
      const movers = living(g, s).filter((q, i) => i % 2 === s.bound && q.villagePlan && dist(q, q.villagePlan.goal) > 3);
      if (g.botSettings.overwatch && movers.length) callout(g, movers[0], "moving");
    }
  }
  if (g.tick >= t.nextCommand) {
    t.nextCommand = g.tick + squadRules.commandTicks;
    for (const team of ["blue", "red"] as const) commandTeam(g, team);
    for (const team of ["blue", "red"] as const)
      for (const [key, cell] of t.danger[team])
        if (cell.v * Math.exp(-(g.tick - cell.t) / squadRules.dangerFadeTicks) < 0.05) t.danger[team].delete(key);
  }
}

const fresh = (g: Game, c: { tick: number } | null | undefined, ticks: number) =>
  !!c && g.tick - c.tick < ticks;

function setContact(g: Game, s: Squad, at: V3, enemy: number) {
  const building = kitBuildingAt(g, at)?.id ?? null;
  const known = s.contact && s.contact.enemy === enemy && g.tick - s.contact.tick < 30;
  s.contact = { ...at, tick: g.tick, enemy, building };
  if (!known) {
    const q = player(g, enemy);
    if (q) raiseDanger(g, s.team, q, 0.4);
  }
  return building;
}

// A member who sees an enemy tells the squad.
export function reportContact(g: Game, p: Soldier, q: Soldier) {
  const s = squadOf(g, p);
  if (!s) return;
  const building = setContact(g, s, { x: q.x, y: q.y + exposedAimHeight(g.map, q), z: q.z }, q.id);
  if (building && !s.called.includes(building)) {
    s.called.push(building);
    callout(g, p, "house");
  }
}

export function squadContact(g: Game, p: Soldier) {
  const s = squadOf(g, p);
  const c = s?.contact;
  if (!c || !fresh(g, c, g.botSettings.squadMemoryTicks)) return null;
  const enemy = player(g, c.enemy);
  return enemy && enemy.hp > 0 ? c : null;
}

const lastCallout = new WeakMap<Soldier, number>();
export function callout(g: Game, p: Soldier, line: CalloutLine) {
  if (g.tick - (lastCallout.get(p) ?? -1000) < 150) return;
  lastCallout.set(p, g.tick);
  g.emit({ type: "callout", actor: p.id, line, at: { x: p.x, z: p.z } });
}

// --- Commander ------------------------------------------------------------
// Spreads squads across flags by value: defend owned flags under threat,
// contest flags being captured, take the nearest neutral or enemy flag,
// and keep one squad back on an owned flag. A team holding fewer flags
// counterattacks: enemy-held flags weigh more the further behind it is.
function commandTeam(g: Game, team: Team) {
  const t = g.tactics!;
  const squads = t.squads.filter((s) => s.team === team && s.commanded);
  if (!squads.length) return;
  const contacts = t.squads
    .filter((s) => s.team === team && s.contact && fresh(g, s.contact, g.botSettings.squadMemoryTicks))
    .map((s) => s.contact!);
  // Attack and defend: only the open phase's flags are worth sending anyone to.
  const flags = g.sectors.map((s, i) => {
    const owned = s.owner === team;
    const threatened =
      owned && (s.contested || Math.abs(s.control) < 0.97 || contacts.some((c) => dist(c, s) < 25));
    return { s, i, owned, threatened };
  }).filter((f) => objectiveOpen(g, f.i));
  if (!flags.length) return;
  const assigned = g.sectors.map(() => 0);
  const centre = (s: Squad) => {
    const alive = living(g, s);
    if (!alive.length) return g.map.spawn[team];
    return {
      x: alive.reduce((n, q) => n + q.x, 0) / alive.length,
      z: alive.reduce((n, q) => n + q.z, 0) / alive.length,
    };
  };
  for (const s of squads) s.reserve = false;
  const attacking = g.offensive?.attacker === team;
  const owned = flags.filter((f) => f.owned);
  const enemyHeld = flags.filter((f) => f.s.owner && !f.owned).length;
  const behind = Math.max(0, enemyHeld - owned.length);
  const reserve = squads.length >= 4 && owned.length ? squads[squads.length - 1] : undefined;
  if (reserve) {
    const at = centre(reserve);
    const hold = owned.sort(
      (a, b) => Number(b.threatened) - Number(a.threatened) || dist(at, a.s) - dist(at, b.s),
    )[0];
    reserve.reserve = true;
    reserve.objective = hold.i;
    assigned[hold.i]++;
  }
  for (const s of squads) {
    if (s === reserve) continue;
    const at = centre(s);
    const cost = (f: (typeof flags)[number]) =>
      dist(at, f.s) +
      (f.owned && !f.threatened ? 45 : 0) -
      (f.threatened ? 25 : 0) -
      (f.s.contested ? 15 : 0) -
      (f.s.owner && !f.owned ? 10 + 15 * behind : 0) +
      assigned[f.i] * 45 +
      // An attacker in an offensive goes for the flag it has seen fewer defenders on.
      (attacking ? contacts.filter((c) => dist(c, f.s) < 25).length * 12 : 0);
    const best = flags.reduce((a, b) => (cost(b) < cost(a) ? b : a));
    const current = flags.find((f) => f.i === s.objective);
    if (!current || cost(best) + 12 < cost(current)) s.objective = best.i;
    assigned[s.objective]++;
  }
  // Behind on flags: mass half the squads on one enemy-held flag, so they
  // arrive together instead of one squad at a time.
  const target = t.assault[team];
  if (!behind || (target && g.sectors[target.flag].owner === team) || (target && !g.sectors[target.flag].owner)) t.assault[team] = null;
  if (behind && !t.assault[team]) {
    const held = flags.filter((f) => f.s.owner && !f.owned);
    const mid = squads.map(centre).reduce((a, b) => ({ x: a.x + b.x / squads.length, z: a.z + b.z / squads.length }), { x: 0, z: 0 });
    const pick = held.reduce((a, b) => (dist(mid, b.s) < dist(mid, a.s) ? b : a));
    t.assault[team] = { flag: pick.i, since: g.tick };
  }
  const assault = t.assault[team];
  for (const s of squads) if (!assault || s.objective !== assault.flag) s.assault = null;
  if (assault) {
    const flag = g.sectors[assault.flag];
    const ready = squads
      .filter((s) => s !== reserve)
      .sort((a, b) => dist(centre(a), flag) - dist(centre(b), flag))
      .slice(0, Math.ceil(squads.length / 2));
    for (const s of ready) {
      s.objective = assault.flag;
      s.assault ??= g.tick;
    }
  }
}

// Squads in a counterattack wait short of the flag until enough of the team
// has arrived, then go in together.
export function formUp(g: Game, p: Soldier, c: Command) {
  const s = squadOf(g, p);
  if (!s || s.assault === null || !squadFeatures.commander) return false;
  const flag = g.sectors[s.objective];
  if (!flag || !flag.owner || flag.owner === p.team || g.tick - s.assault > squadRules.formUpTicks) return false;
  const d = dist(p, flag);
  if (d > 32 || d < 18) return false;
  const massed = g.players.filter((q) => q.team === p.team && q.hp > 0 && q.objective === s.objective && dist(q, flag) < 34).length;
  if (massed >= squadRules.formUpSoldiers) return false;
  c.x = c.z = 0;
  c.sprint = false;
  c.crouch = true;
  p.mode = "Forming up";
  return true;
}

// The squad's flag, when the commander chose it.
export function squadObjective(g: Game, p: Soldier) {
  const s = squadOf(g, p);
  return squadFeatures.commander && s?.commanded && s.objective >= 0 && objectiveOpen(g, s.objective) ? s.objective : undefined;
}

// Members take posts near their leader's post rather than anywhere round the flag.
export function squadAnchor(g: Game, p: Soldier): Vec | undefined {
  const s = squadOf(g, p);
  if (!s || !squadFeatures.cohesion) return undefined;
  const leader = squadLeader(g, s);
  if (!leader || leader === p || leader.villagePlan?.objective !== p.objective) return undefined;
  return leader.villagePlan.goal;
}

// --- Perception ---------------------------------------------------------
const moving = (q: Soldier) => Math.hypot(q.vx, q.vz) > 5.5;
// Sprinting footsteps and reloads are audible within the hearing range,
// gunshots much farther.
export function audible(g: Game, p: Soldier, q: Soldier) {
  if (!squadFeatures.hearing) return false;
  const d = Math.hypot(q.x - p.x, q.z - p.z);
  const lastShot = q.mountedGun === undefined ? q.lastShotAt : g.emplacements.get(q.mountedGun)?.lastShotAt ?? q.lastShotAt;
  return (
    (d < g.botSettings.hearingRange && (moving(q) || q.reloadAt > 0)) ||
    (g.tick - lastShot < 20 && d < 40)
  );
}
export function listen(g: Game, p: Soldier) {
  const t = g.tactics;
  if (!t) return;
  let best: Soldier | undefined, nearest = Infinity;
  for (const q of g.players) {
    if (q.team === p.team || q.hp <= 0) continue;
    const d = dist(p, q);
    if (d < nearest && audible(g, p, q)) {
      best = q;
      nearest = d;
    }
  }
  if (best) t.heard[p.id] = { x: best.x, z: best.z, tick: g.tick };
}
export function heard(g: Game, p: Soldier) {
  const h = g.tactics?.heard[p.id];
  return h && g.tick - h.tick < 45 ? h : null;
}

// Lower is more urgent: someone aiming at me, a machine gunner, an enemy on
// one of our flags, then the nearest.
export function threatScore(g: Game, p: Soldier, q: Soldier) {
  const d = dist(p, q);
  if (!squadFeatures.threat) return d;
  const aiming =
    q.command.aim &&
    Math.abs(angleDelta(q.yaw, Math.atan2(p.x - q.x, q.z - p.z))) < 0.12;
  const onFlag = g.sectors.some((s) => s.owner === p.team && flagContains(g, q, s));
  return d - (aiming ? 15 : 0) - (q.weapon === "machineGun" || q.mountedGun !== undefined ? 8 : 0) - (onFlag ? 10 : 0);
}

// --- Commands ---------------------------------------------------------------
const yawTo = (from: Vec, to: Vec) => Math.atan2(to.x - from.x, from.z - to.z);

// A bot on, under or beside a piece that is about to fall leaves at once.
export function collapseEscape(g: Game, p: Soldier): Command | null {
  if (!g.tactics || !squadFeatures.escape || p.mantle || p.fall) return null;
  for (const b of failingBoxes(g)) {
    const base = b.baseY ?? 0;
    const near =
      Math.abs(p.x - b.x) < b.w / 2 + 0.6 &&
      Math.abs(p.z - b.z) < b.d / 2 + 0.6 &&
      base + b.h > p.y - 0.3 &&
      base < p.y + 6;
    if (!near) continue;
    // Off the nearest edge of the piece, or straight away from a wall.
    const ox = (p.x - b.x) / Math.max(0.1, b.w / 2),
      oz = (p.z - b.z) / Math.max(0.1, b.d / 2);
    const primary = Math.abs(ox) > Math.abs(oz) ? { x: Math.sign(ox) || 1, z: 0 } : { x: 0, z: Math.sign(oz) || 1 };
    const options = [primary, { x: primary.z, z: primary.x }, { x: -primary.z, z: -primary.x }, { x: -primary.x, z: -primary.z }];
    const way = options.find((d) => walkSegment(p, { x: p.x + d.x * 1.5, z: p.z + d.z * 1.5, ...(p.y > 0.5 ? { y: p.y } : {}) }, g.map)) ?? primary;
    const c = idle();
    c.x = way.x;
    c.z = way.z;
    c.sprint = true;
    c.yaw = Math.atan2(way.x, -way.z);
    c.pitch = 0;
    if (p.villagePlan) p.villagePlan.until = 0;
    p.path = [];
    p.nextThink = Math.min(p.nextThink, g.tick + 1);
    p.mode = "Escaping collapse";
    return c;
  }
  return null;
}

// Half the squad holds and covers while the other half moves.
const coverCheck = new WeakMap<Soldier, { tick: number; cover: number }>();
export function overwatchHold(g: Game, p: Soldier, c: Command, engaged: boolean, cover: (at: Vec) => number) {
  if (!g.botSettings.overwatch || !squadFeatures.overwatch) return false;
  const s = squadOf(g, p);
  const plan = p.villagePlan;
  if (!s || !s.contact || !plan || dist(p, plan.goal) < 1.4) return false;
  const alive = living(g, s);
  if (alive.length < 3 || alive.indexOf(p) % 2 === s.bound) return false;
  if (!engaged) {
    let known = coverCheck.get(p);
    if (!known || g.tick - known.tick > 9) coverCheck.set(p, (known = { tick: g.tick, cover: cover(p) }));
    if (known.cover <= 0) return false;
  }
  c.x = c.z = 0;
  c.sprint = false;
  p.mode = "Overwatch";
  return true;
}

// Attackers wait at the door of a building with a known enemy inside, for
// a squad grenade or a short count, then go in.
export function stackAtDoor(g: Game, p: Soldier, c: Command) {
  const s = squadOf(g, p);
  const plan = p.villagePlan;
  const contact = squadContact(g, p);
  if (!s || !plan || !contact?.building || !squadFeatures.stacking) return false;
  const building = kitBuildingAt(g, plan.goal);
  if (!building || building.id !== contact.building || kitBuildingAt(g, p)?.id === building.id) return false;
  const door = building.kit!.entrances.reduce<Vec | undefined>(
    (a, b) => (!a || dist(p, b) < dist(p, a) ? b : a),
    undefined,
  );
  if (!door || dist(p, door) > 3.5) return false;
  if (!s.breach || s.breach.building !== building.id || g.tick - s.breach.until > 300)
    s.breach = { building: building.id, until: g.tick + squadRules.stackTicks };
  if (g.tick >= s.breach.until) return false;
  c.x = c.z = 0;
  c.sprint = false;
  c.crouch = true;
  c.yaw = turnToward(p.yaw, yawTo(p, door), 0.08);
  p.mode = "Stacking";
  return true;
}

// Entering a room, look both ways along the wall.
export function checkCorners(g: Game, p: Soldier, c: Command) {
  const building = squadFeatures.corners ? kitBuildingAt(g, p) : undefined;
  if (!building || Math.hypot(c.x, c.z) < 0.1) return false;
  const doorway = building.kit!.doorways.some(
    (d) => Math.abs((d.y ?? 0) - p.y) < 1 && Math.hypot(d.x - p.x, d.z - p.z) < 1.4,
  );
  if (!doorway) return false;
  c.yaw = turnToward(p.yaw, Math.atan2(c.x, -c.z) + Math.sin((g.tick + p.id * 13) * 0.22) * 0.9, 0.12);
  p.mode = "Clearing";
  return true;
}

// Fire at a remembered position: machine gunners cover their squad's
// latest sighting; some riflemen fire after a target they just lost.
export function suppressiveFire(g: Game, p: Soldier, c: Command) {
  if (!squadFeatures.suppression || p.target >= 0 || p.reloadAt || p.mantle) return false;
  const gunner = p.weapon === "machineGun";
  if (p.ammo < (gunner ? 10 : 2)) return false;
  const own = p.awareness.observed && g.tick - p.awareness.seenAt;
  let point: V3 | null = null;
  if (gunner) {
    const contact = squadContact(g, p);
    if (contact && g.tick - contact.tick < 90) point = contact;
    else if (p.awareness.observed && own !== null && own < 90) point = p.awareness.observed;
  } else if (p.id % 3 === 0 && p.awareness.observed && own !== null && own >= 10 && own < 60)
    point = p.awareness.observed;
  if (!point) return false;
  const d = dist(p, point);
  if (d < 6 || d > 45) return false;
  const eye = { x: p.x, y: p.y + rifleHeight(g.map, p), z: p.z };
  const fraction = g.collision.ray(eye, point);
  // Rounds should reach the enemy's cover, not the wall in front of me.
  if (fraction < 0.999 && fraction * d < d - 4) return false;
  for (const q of g.players) {
    if (q === p || q.team !== p.team || q.hp <= 0) continue;
    const along = ((q.x - p.x) * (point.x - p.x) + (q.z - p.z) * (point.z - p.z)) / (d * d);
    if (along <= 0 || along >= 1) continue;
    const off = Math.hypot(p.x + (point.x - p.x) * along - q.x, p.z + (point.z - p.z) * along - q.z);
    if (off < 1) return false;
  }
  const yaw = yawTo(p, point);
  const pitch = Math.atan2(point.y - eye.y, d);
  c.yaw = turnToward(p.yaw, yaw, 0.075);
  c.pitch = p.pitch + Math.max(-0.035, Math.min(0.035, pitch - p.pitch));
  c.aim = true;
  c.sprint = false;
  c.fire = Math.abs(angleDelta(c.yaw, yaw)) < 0.1 && semiAutoIntent(g, p);
  if (c.fire) {
    const scatter = g.botSettings.aimError * 1.4 * maskedBotAim(p);
    c.yaw += Math.sin(g.tick * 1.7 + p.id) * scatter;
    c.pitch += Math.cos(g.tick * 2.3 + p.id) * scatter * 0.5;
  }
  p.mode = "Suppressing";
  return true;
}

// Plan a frag at a known enemy behind cover or inside a room.
export function grenadeCommand(g: Game, p: Soldier, c: Command) {
  const t = g.tactics;
  const s = squadOf(g, p);
  if (!t || !s || !squadFeatures.grenades || p.grenades <= 0 || p.reloadAt || p.mantle || p.melee) return false;
  if (g.tick < p.nextGrenade || g.tick < p.throwUntil || g.tick < (t.nextFrag[p.id] ?? 0)) return false;
  if (g.tick - s.lastGrenade < g.botSettings.grenadeGapTicks || g.tick % 3 !== p.id % 3) return false;
  const contact = squadContact(g, p);
  const own =
    p.awareness.observed && g.tick - p.awareness.seenAt < squadRules.grenadeContactTicks
      ? { ...p.awareness.observed, building: kitBuildingAt(g, p.awareness.observed)?.id ?? null }
      : null;
  const known = own ?? (contact && g.tick - contact.tick < squadRules.grenadeContactTicks ? contact : null);
  if (!known) return false;
  const target = { x: known.x, y: known.y - 1.2, z: known.z };
  const range = Math.hypot(target.x - p.x, target.z - p.z);
  if (range > 25 || range < 3) return false;
  const mine = kitBuildingAt(g, p)?.id ?? null;
  // Closer than the blast reaches only through a wall or doorway.
  if (range < grenadeBlastRadius * 0.85 && (!known.building || known.building === mine)) return false;
  const eye = { x: p.x, y: p.y + rifleHeight(g.map, p), z: p.z };
  const hidden = !!known.building || g.collision.ray(eye, { ...target, y: known.y }) < 0.97;
  if (!hidden) return false;
  if (g.players.some((q) => q.team === p.team && q.hp > 0 && dist(q, target) < grenadeBlastRadius * 0.9)) return false;
  const yaw = yawTo(p, target);
  const release = { x: p.x + Math.sin(yaw) * 0.55, y: p.y + 1.95, z: p.z - Math.cos(yaw) * 0.55 };
  const arc = throwArc(g, release, target, yaw);
  if (!arc) return false;
  c.grenade = true;
  c.smoke = false;
  c.fire = c.reload = false;
  c.yaw = yaw;
  // Bot throws leave at pitch + 0.65 (see throwGrenade).
  c.pitch = arc.elevation - 0.65;
  c.throwSpeed = arc.speed;
  s.lastGrenade = g.tick;
  t.nextFrag[p.id] = g.tick + squadRules.personalGrenadeTicks;
  if (s.breach) s.breach.until = Math.max(s.breach.until, g.tick + 75);
  p.mode = "Grenade";
  return true;
}

// A throw that reaches the target at one of four elevations, lowest first,
// checked against walls along the way.
function throwArc(g: Game, from: V3, to: V3, yaw: number) {
  const range = Math.hypot(to.x - from.x, to.z - from.z);
  const rise = to.y - from.y;
  for (const elevation of [0.1, 0.3, 0.6, 0.85]) {
    const cos = Math.cos(elevation),
      reach = range * Math.tan(elevation) - rise;
    if (reach <= 0.05) continue;
    const speed = Math.sqrt((grenadeGravity * range * range) / (2 * cos * cos * reach));
    if (speed > grenadeSpeed || speed < minThrowSpeed) continue;
    const flight = range / (speed * cos);
    let last: V3 = from,
      clear = true;
    for (let i = 1; i <= 12 && clear; i++) {
      const time = (flight * i) / 12,
        across = speed * cos * time;
      const next = {
        x: from.x + Math.sin(yaw) * across,
        y: from.y + speed * Math.sin(elevation) * time - (grenadeGravity * time * time) / 2,
        z: from.z - Math.cos(yaw) * across,
      };
      const f = g.collision.ray(last, next);
      if (f < 1) {
        const hit = { x: last.x + (next.x - last.x) * f, z: last.z + (next.z - last.z) * f };
        // Glancing off something next to the target still lands it there.
        clear = Math.hypot(hit.x - to.x, hit.z - to.z) < 2.5;
        if (clear) break;
      }
      last = next;
    }
    if (clear) return { elevation, speed };
  }
  return null;
}

// Reloading in contact is worth telling the squad.
export function reloadCallout(g: Game, p: Soldier, c: Command) {
  if (c.reload && !p.reloadAt && squadContact(g, p)) callout(g, p, "reloading");
}
