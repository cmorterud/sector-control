// "Over the top": the whistle, squad and lone bayonet charges, and the shock a
// charge carries when it arrives. By 1915 a charge into alert, unbroken rifles
// and machine guns mostly died in the open, so chargers here are easy to hit
// (no cover, no firing, a straight predictable run) and gain nothing from
// numbers alone at range. A charge that reaches defenders already shaken by
// fire, smoke or shells breaks them for a moment, and that is its reward.
import { angleDelta, awarenessSample, turnToward } from "./awareness";
import { beyondPlayArea, dist, mantleLanding, walkSegment, type Vec } from "./map";
import { chargeStance, meleeReady } from "./melee";
import { reactToThreat } from "./combat-reaction";
import { smokeBlocks } from "./smoke";
import { eyeHeightOf } from "./crouch";
import { squadContact, squadLeader, squadOf } from "./squads";
import { idle, pathfind, type Command, type Event, type Game, type Soldier, type Team, type V3 } from "./simulation";

export const chargeRules = {
  // One whistle per team every 50 s, whoever blows it.
  cooldownTicks: 50 * 30,
  // Bots leave a ready whistle alone this long, so the player usually has it.
  botGraceTicks: 15 * 30,
  // The whistler's own squad follows from further off than other soldiers.
  squadRadius: 30,
  recruitRadius: 18,
  maxRecruits: 10,
  // Long enough to cross Trench front's 45 m of no man's land at a sprint.
  durationTicks: 7 * 30,
  arriveRadius: 2.5,
  // Chargers lower bayonets for the final rush, inside this range of the goal or an enemy.
  lungeRange: 20,
  // Whistles carry: enemies this close hear one and look toward it.
  hearing: 60,
  // A bot out of ammunition, or caught reloading, may rush an enemy this close.
  lone: { min: 3, max: 9, ticks: 60, cooldownTicks: 300, chance: 0.6 },
  // Defenders in the path of a charge this close stay focused on it.
  alertRange: 45,
  // Shock: defenders within this range of an incoming charge, scored below.
  panic: { radius: 12, threshold: 0.75, ticks: 40, cooldownTicks: 180 },
  // Bots aiming at a charger lead it almost fully and aim a little tighter.
  chargerLead: 0.9,
  chargerAim: 0.75,
};

export interface Charge {
  id: number;
  team: Team;
  actor: number;
  target: Vec;
  startedAt: number;
  members: number[];
  landed: number;
  lost: number;
  reached: number;
}
export interface ChargeState {
  readyAt: Record<Team, number>;
  sequence: number;
  active: Charge[];
  // Recent bayonet kills, which shake the victim's neighbours.
  kills: (Vec & { team: Team; tick: number })[];
}
// A soldier's part in a charge. Squad charges follow a whistle; a lone
// charge is one bot rushing a close enemy when it has no round to fire.
export interface SoldierCharge {
  id: number;
  kind: "squad" | "lone";
  target: Vec;
  enemy?: number;
  startAt: number;
  until: number;
  path?: Vec[];
}
export interface Shaken {
  until: number;
  next: number;
  from: Vec;
}
export type ChargeEvent =
  | { type: "whistle"; actor: number; team: Team; charge: number; at: V3; target: Vec; recruits: number[] }
  | { type: "chargeEnd"; charge: number; team: Team; members: number; landed: number; lost: number; reached: number }
  | { type: "chargePanic"; actor: number; source: number; shock: number };

export const createChargeState = (): ChargeState => ({
  readyAt: { blue: 0, red: 0 },
  sequence: 0,
  active: [],
  kills: [],
});

const player = (g: Game, id: number) =>
  g.players[id]?.id === id ? g.players[id] : g.players.find((p) => p.id === id);
const bearing = (from: Vec, to: Vec) => Math.atan2(to.x - from.x, from.z - to.z);
const human = (g: Game, p: Soldier) => g.humanPlayerIds.includes(p.id);

// Running in the open with a levelled bayonet: what makes a charger easy to hit.
export const charging = (p: Soldier) =>
  p.hp > 0 &&
  ((p.melee?.kind === "charge" && !p.melee.struck) || (!!p.charge && Math.hypot(p.vx, p.vz) > 4.5));

// The HUD's "V · BAYONET CHARGE": pressing melee now would start a charge.
export const chargePromptReady = (g: Game, p: Soldier) =>
  p.mountedGun === undefined && meleeReady(g, p) && chargeStance(p, p.command);

export const whistleReadyIn = (g: Game, team: Team) => Math.max(0, g.charges.readyAt[team] - g.tick);

// Where a whistle sends the charge: an enemy or neutral flag, or the enemy's
// front trench, roughly where the whistler looks; else the ground they aim at.
export function whistleTarget(g: Game, p: Soldier, yaw: number, pitch: number): Vec {
  const cone = 0.4;
  const ahead = (v: Vec, range: number) =>
    dist(p, v) > 6 && dist(p, v) < range && Math.abs(angleDelta(yaw, bearing(p, v))) < cone;
  const nearest = (vs: Vec[]) => vs.sort((a, b) => dist(p, a) - dist(p, b))[0];
  // In capture the flag the sectors are pickup points; skip your own side's.
  const flag = nearest(g.sectors.filter((s) => s.owner !== p.team && (g.scoring !== "ctf" || s.home !== p.team) && ahead(s, 70)));
  if (flag) return { x: flag.x, z: flag.z };
  const enemy = p.team === "blue" ? "red" : "blue";
  const front = g.map.terrain?.trenchLines?.find((l) => l.team === enemy && l.role === "front");
  const trench = front && nearest(front.sections.map((s) => ({ x: s.x, z: s.stepZ ?? s.z })).filter((v) => ahead(v, 60)));
  if (trench) return trench;
  const eye = { x: p.x, y: p.y + eyeHeightOf(p), z: p.z };
  const reach = 60;
  const end = {
    x: eye.x + Math.sin(yaw) * Math.cos(pitch) * reach,
    y: eye.y + Math.sin(pitch) * reach,
    z: eye.z - Math.cos(yaw) * Math.cos(pitch) * reach,
  };
  let range = Math.max(12, Math.min(45, g.collision.ray(eye, end) * reach * Math.cos(pitch)));
  const at = () => ({ x: p.x + Math.sin(yaw) * range, z: p.z - Math.cos(yaw) * range });
  while (range > 4 && beyondPlayArea(at().x, at().z, g.map) > -2) range -= 2;
  return at();
}

// Riflemen who follow a whistle: the whistler's squad from further off, then
// anyone close. A player has no squad, so the nearest friendly bot's squad
// stands in for theirs. Machine gunners and mounted guns keep covering.
export function whistleRecruits(g: Game, p: Soldier) {
  const able = (q: Soldier) =>
    q !== p &&
    q.team === p.team &&
    q.hp > 0 &&
    !human(g, q) &&
    q.weapon === "serviceRifle" &&
    q.mountedGun === undefined &&
    q.charge?.kind !== "squad";
  const near = g.players.filter((q) => able(q) && dist(p, q) <= chargeRules.squadRadius);
  const own = human(g, p)
    ? near.filter((q) => dist(p, q) <= chargeRules.recruitRadius).sort((a, b) => dist(p, a) - dist(p, b))[0]
    : p;
  const squad = own && squadOf(g, own);
  const inSquad = (q: Soldier) => !!squad && squad.members.includes(q.id);
  return near
    .filter((q) => inSquad(q) || dist(p, q) <= chargeRules.recruitRadius)
    .sort((a, b) => Number(inSquad(b)) - Number(inSquad(a)) || dist(p, a) - dist(p, b))
    .slice(0, chargeRules.maxRecruits);
}

export function blowWhistle(g: Game, p: Soldier, aim: { yaw: number; pitch: number }, goal?: Vec) {
  const state = g.charges;
  if (p.hp <= 0 || g.phase !== "playing" || p.mountedGun !== undefined || g.tick < state.readyAt[p.team]) return null;
  state.readyAt[p.team] = g.tick + chargeRules.cooldownTicks;
  const target = goal ?? whistleTarget(g, p, aim.yaw, aim.pitch);
  const recruits = whistleRecruits(g, p);
  const members = human(g, p) ? recruits : [p, ...recruits];
  const charge: Charge = {
    id: ++state.sequence, team: p.team, actor: p.id, target, startedAt: g.tick,
    members: members.map((q) => q.id), landed: 0, lost: 0, reached: 0,
  };
  state.active.push(charge);
  // A line abreast: each soldier keeps his place across the direction of the
  // charge, at least an arm's reach from the next so comrades don't take the
  // bayonet meant for the enemy.
  const heading = bearing(p, target);
  const across = { x: Math.cos(heading), z: Math.sin(heading) };
  const line = members
    .map((q) => ({ q, offset: Math.max(-6, Math.min(6, (q.x - p.x) * across.x + (q.z - p.z) * across.z)) }))
    .sort((a, b) => a.offset - b.offset);
  const mean = () => line.reduce((n, l) => n + l.offset, 0) / line.length;
  const centre = mean();
  for (let i = 1; i < line.length; i++) line[i].offset = Math.max(line[i].offset, line[i - 1].offset + 2.2);
  const shift = mean() - centre;
  for (const { q, offset: placed } of line) {
    const offset = placed - shift;
    let own = { x: target.x + across.x * offset, z: target.z + across.z * offset };
    if (beyondPlayArea(own.x, own.z, g.map) > -2) own = { ...target };
    q.charge = {
      id: charge.id,
      kind: "squad",
      target: own,
      // A moment to fix bayonets and hear the order, staggered down the line.
      startAt: g.tick + (q === p ? 0 : 4 + (q.id % 4) * 2),
      until: g.tick + chargeRules.durationTicks + (q.id % 5) * 3,
    };
  }
  // The enemy hears it too: a whistle gives the charge away.
  if (g.tactics)
    for (const q of g.players)
      if (q.team !== p.team && q.hp > 0 && dist(p, q) < chargeRules.hearing)
        g.tactics.heard[q.id] = { x: p.x, z: p.z, tick: g.tick };
  g.emit({
    type: "whistle", actor: p.id, team: p.team, charge: charge.id,
    at: { x: p.x, y: p.y + eyeHeightOf(p), z: p.z }, target: { ...target }, recruits: recruits.map((q) => q.id),
  });
  return charge;
}

function release(g: Game, p: Soldier, reached = false) {
  const own = p.charge;
  if (!own) return;
  p.charge = null;
  p.path = [];
  p.nextThink = g.tick;
  if (p.villagePlan) p.villagePlan.until = 0;
  const charge = g.charges.active.find((c) => c.id === own.id);
  if (charge && reached) charge.reached++;
  // Survivors who reach the enemy trench hold it, as trench assaults do.
  const terrain = g.map.terrain;
  if (reached && own.kind === "squad" && terrain?.firingPositions && p.y < terrain.bankHeight - 0.5) p.forwardPost = { x: p.x, z: p.z };
}

// Reads the previous tick's events before they are cleared.
export function observeCharges(g: Game, events: readonly Event[]) {
  const state = g.charges;
  for (const e of events) {
    if (e.type === "melee" && e.phase === "strike" && e.damage) {
      const id = player(g, e.actor)?.charge?.id;
      const charge = id !== undefined ? state.active.find((c) => c.id === id) : undefined;
      if (charge) charge.landed++;
      const victim = e.killed && e.target !== null ? player(g, e.target) : undefined;
      if (victim) state.kills.push({ x: victim.x, z: victim.z, team: victim.team, tick: g.tick });
    }
  }
  state.kills = state.kills.filter((k) => g.tick - k.tick < 60);
}

export function advanceCharges(g: Game) {
  const state = g.charges;
  for (const p of g.players) {
    if (p.hp > 0) continue;
    if (p.charge) {
      const charge = state.active.find((c) => c.id === p.charge!.id);
      if (charge) charge.lost++;
      p.charge = null;
    }
    p.shaken = null;
  }
  state.active = state.active.filter((c) => {
    if (c.members.some((id) => player(g, id)?.charge?.id === c.id)) return true;
    g.emit({ type: "chargeEnd", charge: c.id, team: c.team, members: c.members.length, landed: c.landed, lost: c.lost, reached: c.reached });
    return false;
  });
  if (g.tick % 3 === 0) shock(g);
}

// Nobody's attention wanders with a charge coming at him: defenders in its
// path keep their eyes, and their rifles, on it. Then they add up their
// nerve. A lone or distant charge at alert, unhurt riflemen does nothing; one
// that arrives out of smoke, under fire or shellfire, or after a neighbour has
// been bayoneted, breaks them for about a second and a half.
function shock(g: Game) {
  const chargers = g.players.filter(charging);
  if (!chargers.length) return;
  const rules = chargeRules.panic;
  for (const d of g.players) {
    if (d.hp <= 0 || g.tick < d.protectedUntil) continue;
    const toward = chargers.filter(
      (c) =>
        c.team !== d.team &&
        dist(c, d) < chargeRules.alertRange &&
        Math.abs(angleDelta(c.melee?.kind === "charge" ? c.melee.yaw : c.yaw, bearing(c, d))) < 0.9,
    );
    if (!toward.length) continue;
    if (!human(g, d)) {
      d.distractedUntil = Math.min(d.distractedUntil, g.tick);
      if (d.focusUntil > 0 && toward.some((c) => c.id === d.target)) d.focusUntil = Math.max(d.focusUntil, g.tick + 30);
    }
    // A crew on an emplaced gun stays on it.
    const coming = toward.filter((c) => dist(c, d) < rules.radius);
    if (!coming.length || d.mountedGun !== undefined || (d.shaken && g.tick < d.shaken.next)) continue;
    const first = coming.reduce((a, b) => (dist(b, d) < dist(a, d) ? b : a));
    const eye = { x: d.x, y: d.y + eyeHeightOf(d), z: d.z };
    const recent = d.combatReaction && g.tick - d.combatReaction.tick < 90 ? d.combatReaction.kind : null;
    const friends = g.players.filter((q) => q !== d && q.team === d.team && q.hp > 0 && dist(q, d) < 6).length;
    const score =
      0.15 * coming.length +
      0.8 * d.suppression +
      (recent === "blast" ? 0.35 : 0) +
      (smokeBlocks(g, eye, { x: first.x, y: first.y + 1.4, z: first.z }) ? 0.35 : 0) +
      (d.reloadAt || d.ammo === 0 ? 0.25 : 0) +
      (g.charges.kills.some((k) => k.team === d.team && dist(k, d) < 8) ? 0.3 : 0) -
      (d.weapon === "machineGun" ? 0.3 : 0) -
      0.08 * Math.min(3, friends);
    if (score < rules.threshold) continue;
    d.shaken = { until: g.tick + rules.ticks + (d.id % 10), next: g.tick + rules.cooldownTicks, from: { x: first.x, z: first.z } };
    d.suppression = Math.max(d.suppression, 0.75);
    reactToThreat(g, d, { x: first.x, y: first.y + 1.4, z: first.z }, "nearMiss", 0.6);
    g.emit({ type: "chargePanic", actor: d.id, source: first.id, shock: +score.toFixed(2) });
  }
}

// A shaken bot crouches, holds its fire and gives ground from the charge.
function panicCommand(g: Game, p: Soldier, s: Shaken): Command {
  const c = idle();
  const away = bearing(s.from, p);
  c.x = Math.sin(away) * 0.45;
  c.z = -Math.cos(away) * 0.45;
  c.yaw = turnToward(p.yaw, bearing(p, s.from), 0.1);
  c.pitch = 0;
  c.crouch = true;
  p.mode = "Shaken by charge";
  return c;
}

// A bot squad leader blows its own whistle in the final stretch of an attack
// on a flag: the last leg of a trench assault, or a commanded squad closing
// on an enemy-held flag with the enemy in sight.
function botWhistle(g: Game, p: Soldier) {
  if (g.tick % 15 !== p.id % 15 || p.weapon !== "serviceRifle") return null;
  if (g.tick < g.charges.readyAt[p.team] + chargeRules.botGraceTicks) return null;
  if (awarenessSample(p, Math.floor(g.tick / 90), 811) > 0.35) return null;
  let goal: Vec | undefined;
  const m = p.assaultId !== null ? g.assaults.missions.find((m) => m.id === p.assaultId) : undefined;
  if (m) {
    const leader = player(g, m.leader);
    const lead = leader && leader.hp > 0 && leader.assaultId === m.id ? leader : m.members.map((id) => player(g, id)!).find((q) => q.hp > 0 && q.assaultId === m.id);
    const d = dist(p, m.route[2]);
    if (lead === p && m.progress[p.id] === 2 && p.mode === "Advancing with squad" && d > 10 && d < 40) goal = m.route[2];
  } else {
    const s = squadOf(g, p);
    const flag = s && s.commanded && s.objective >= 0 ? g.sectors[s.objective] : undefined;
    if (s && flag && squadLeader(g, s) === p && flag.owner && flag.owner !== p.team && squadContact(g, p)) {
      const d = dist(p, flag);
      const riflemen = s.members.map((id) => player(g, id)!).filter((q) => q !== p && q.hp > 0 && q.weapon === "serviceRifle" && dist(p, q) < chargeRules.squadRadius).length;
      if (d > 8 && d < 35 && riflemen >= 2) goal = { x: flag.x, z: flag.z };
    }
  }
  // A leader does not charge alone.
  if (!goal || whistleRecruits(g, p).length < 2) return null;
  return blowWhistle(g, p, { yaw: bearing(p, goal), pitch: 0 }, goal);
}

// Before close combat: a bot with an empty or half-loaded rifle and an enemy a
// few metres off may drop the clip and rush him rather than finish loading.
export function startLoneCharge(g: Game, p: Soldier, target: Soldier | undefined) {
  const rules = chargeRules.lone;
  if (!target || p.charge || human(g, p) || p.weapon !== "serviceRifle") return false;
  if (!(p.ammo === 0 || (p.reloadAt && p.reloadAt - g.tick > 15))) return false;
  if (g.tick < (p.nextLoneCharge ?? 0) || !p.awareness.visible || g.tick - p.awareness.seenAt > 10) return false;
  const d = dist(p, target);
  if (d < rules.min || d > rules.max || Math.abs(target.y - p.y) > 0.7) return false;
  if (p.melee || p.mantle || p.hop || p.fall || g.tick < p.nextMelee || g.tick < p.staggerUntil || g.tick < p.throwUntil) return false;
  p.nextLoneCharge = g.tick + 30;
  if (awarenessSample(p, Math.floor(g.tick / 30), 733) > rules.chance || !walkSegment(p, target, g.map)) return false;
  p.nextLoneCharge = g.tick + rules.cooldownTicks;
  p.reloadAt = 0;
  p.charge = { id: -1, kind: "lone", target: { x: target.x, z: target.z }, enemy: target.id, startAt: g.tick, until: g.tick + rules.ticks };
  return true;
}

// Bots in a charge, shaken defenders, and squad leaders deciding to whistle.
// Runs ahead of cover-seeking and suppression: going over the top means
// running through fire, not ducking from it.
export function chargeCommand(g: Game, p: Soldier): Command | null {
  if (human(g, p)) return null;
  if (p.shaken && g.tick < p.shaken.until) return panicCommand(g, p, p.shaken);
  if (!p.charge) botWhistle(g, p);
  const own = p.charge;
  if (!own) return null;
  const enemy = own.enemy !== undefined ? player(g, own.enemy) : undefined;
  const struck = p.melee?.kind === "charge" && p.melee.struck;
  if (own.kind === "lone" && (!enemy || enemy.hp <= 0 || dist(p, enemy) > chargeRules.lone.max + 4)) {
    release(g, p);
    return null;
  }
  if (g.tick >= own.until || struck || (own.kind === "squad" && dist(p, own.target) < chargeRules.arriveRadius)) {
    release(g, p, !struck && g.tick < own.until);
    return null;
  }
  const c = idle();
  c.yaw = p.yaw;
  if (g.tick < own.startAt) {
    p.mode = "Fixing bayonets";
    return c;
  }
  // Among buildings, run the route; across open ground, run straight and climb.
  if (own.kind === "squad" && g.map.buildings && !own.path) own.path = walkSegment(p, own.target, g.map) ? [] : pathfind(p, own.target, g.map, true).slice(0, -1);
  while (own.path?.length && dist(p, own.path[0]) < 1.2) own.path.shift();
  let goal: Vec = own.path?.[0] ?? own.target;
  const close = enemy ?? (p.target >= 0 ? player(g, p.target) : undefined);
  if (close && close.hp > 0 && dist(p, close) < chargeRules.lungeRange &&
    Math.abs(angleDelta(bearing(p, goal), bearing(p, close))) < 0.7) goal = close;
  const want = bearing(p, goal);
  c.yaw = p.melee ? want : turnToward(p.yaw, want, 0.15);
  c.x = Math.sin(c.yaw);
  c.z = -Math.cos(c.yaw);
  c.pitch = 0;
  c.sprint = true;
  if (g.map.terrain && !p.melee && !p.mantle && !p.hop && !p.fall && g.tick >= p.nextMantle) {
    const landing = mantleLanding(p, c, g.map);
    c.mantle = !!landing && dist(landing, goal) + 0.3 < dist(p, goal);
  }
  // Lower bayonets for the final rush, unless a comrade is right in front.
  const near = dist(p, goal) < chargeRules.lungeRange;
  const blocked = g.players.some(
    (q) => q !== p && q.team === p.team && q.hp > 0 && dist(p, q) < 2.6 && Math.abs(angleDelta(c.yaw, bearing(p, q))) < 0.6,
  );
  c.melee = near && !blocked && !c.mantle && !p.melee && !p.meleeHeld && meleeReady(g, p) && chargeStance(p, c);
  p.mode = p.melee?.kind === "charge" ? "Bayonet charge" : own.kind === "lone" ? "Rushing with bayonet" : "Over the top";
  return c;
}

// What the player hears of a whistle: their own charge, a friendly one or the enemy's.
export function whistleNotice(g: Game, e: Event, listener: Soldier) {
  if (e.type !== "whistle" || listener.hp <= 0) return undefined;
  if (e.actor === listener.id)
    return e.recruits.length ? `OVER THE TOP! · ${e.recruits.length} FOLLOWING` : "WHISTLE · NO RIFLEMEN IN EARSHOT";
  const d = dist(listener, e.at);
  if (e.team === listener.team) return d < 40 ? "OVER THE TOP! · CHARGE!" : undefined;
  return d < chargeRules.hearing ? "ENEMY WHISTLE · CHARGE INCOMING" : undefined;
}
