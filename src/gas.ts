// Creeping gas, gas masks and gas shells: an optional match rule for Trench
// front and Verdun sector. After an opening period gas rolls in from the
// sector edges in stages, each announced well ahead, until a final safe area
// around the flags remains. Gas damage over time is credited to no one, like
// the boundary salvo; a mask cuts it to a slow burn. Everything here is plain
// state advanced by the fixed-tick simulation, and does nothing unless the
// match was created with gas on.
import { artillerySector } from "./artillery-sectors";
import { teamHasHuman } from "./artillery";
import { blocked, dist, playArea, walkSegment, type MapDefinition, type Vec } from "./map";
import { idle, pathfind, safeBotDestination, type Command, type Game, type Soldier, type Team } from "./simulation";

// Half extents of a safe area, with its corners rounded so the gas reads as a
// rolling cloud rather than a fence.
export interface SafeArea { halfWidth: number; halfDepth: number; radius: number }
// Each stage's safe ground once its advance has rolled in, last stage final.
// Every final area holds all flags with their capture circles, both trench
// systems on Trench front and both front lines on Verdun, so the match still
// ends by score. The authored spawns end up in gas; see gasDeployment.
export const gasSectors: Record<string, SafeArea[]> = {
  trenches: [
    { halfWidth: 70, halfDepth: 60, radius: 12 },
    { halfWidth: 60, halfDepth: 54, radius: 12 },
    { halfWidth: 50, halfDepth: 48, radius: 12 },
  ],
  verdun: [
    { halfWidth: 94, halfDepth: 56, radius: 12 },
    { halfWidth: 83, halfDepth: 49, radius: 12 },
    { halfWidth: 72, halfDepth: 42, radius: 12 },
  ],
};
export const gasAvailable = (map: Pick<MapDefinition, "id">) => map.id in gasSectors;

export const gasRules = {
  // Timings for the default eight-minute match. Shorter matches scale them
  // down so the final area still arrives before the end.
  matchTicks: 480 * 30,
  firstAdvance: 90 * 30,
  stageInterval: 90 * 30,
  // Each advance is announced this long before the gas moves, and the front
  // then takes this long to roll in: about 0.5 m/s, a slow walk.
  warning: 30 * 30,
  advance: 20 * 30,
  damageInterval: 15,
  // Unmasked, a full-health soldier lasts about 12 seconds in the gas;
  // masked, about a minute: mustard still blisters skin through a mask.
  damagePerSecond: 8,
  maskedPerSecond: 1.5,
  // Pulling the mask on takes both hands for a second; off is quicker.
  donTicks: 30,
  doffTicks: 15,
  // Half-angle in radians a masked bot notices enemies within, against 1.1
  // bare-faced: the eyepieces cut off the edges of sight, as the lens
  // overlay does for the player.
  maskedView: 0.7,
  // Respawns stay this far inside the safe area once the gas reaches a spawn.
  deployMargin: 10,
  bot: {
    // Mask up within this distance of the gas, and take it off once this far
    // clear of all gas for a while.
    maskWithin: 8,
    unmaskBeyond: 18,
    unmaskAfter: 5 * 30,
    // Leave ground the gas is about to reach, judged this many ticks ahead.
    escapeWithin: 3,
    lookahead: 3 * 30,
    escapeDepth: 8,
  },
};

// Gas shells: a cloud called from the tactical map that lingers and drifts.
export const gasStrikeRules = {
  initialDelay: 45 * 30,
  cooldown: 60 * 30,
  // From the call to the shells landing and the cloud starting to spread.
  flightTicks: 3 * 30,
  lifetime: 25 * 30,
  grow: 3 * 30,
  fade: 5 * 30,
  radius: 9,
  height: 2.2,
  // Meters per second along the front, so neither side's cloud drifts home.
  drift: 0.3,
  damagePerSecond: 12,
  maskedPerSecond: 1.5,
  // No gas shells onto either team's deployment.
  deployClearance: 24,
  edgeMargin: 6,
  // Bots call one only onto a knot of at least this many enemies.
  botCluster: 3,
};

export interface GasStage {
  index: number;
  warnAt: number;
  startAt: number;
  endAt: number;
  from: SafeArea;
  to: SafeArea;
}
export interface GasCloud {
  id: number;
  team: Team;
  actor: number;
  x: number;
  z: number;
  heading: number;
  landAt: number;
  endsAt: number;
}
export interface GasState {
  full: SafeArea;
  stages: GasStage[];
  clouds: GasCloud[];
  strikeReadyAt: Record<Team, number>;
  sequence: number;
}
// `from` is how far on the mask was when this change began, so a soldier who
// changes their mind halfway does not start over.
export interface GasMask { worn: boolean; since: number; from: number }
export interface GasEscape { destination: Vec; since: number; checkedAt: number; lastPosition: Vec }
export type GasEvent =
  | { type: "gas"; phase: "warning" | "advance" | "settled"; stage: number; final: boolean; startAt: number; endAt: number; area: SafeArea }
  | { type: "gasMask"; actor: number; worn: boolean }
  | { type: "gasStrike"; phase: "call" | "land" | "end"; cloud: number; actor: number; team: Team; at: Vec; landAt: number; endsAt: number };

export function createGasState(map: MapDefinition, duration: number): GasState | null {
  const areas = gasSectors[map.id];
  if (!areas) return null;
  const play = playArea(map), scale = Math.min(1, Math.max(0.05, duration / gasRules.matchTicks));
  const full = { halfWidth: play.width / 2, halfDepth: play.depth / 2, radius: 0 };
  const stages = areas.map((to, index): GasStage => {
    const startAt = Math.round((gasRules.firstAdvance + index * gasRules.stageInterval) * scale);
    return {
      index,
      warnAt: startAt - Math.round(gasRules.warning * scale),
      startAt,
      endAt: startAt + Math.max(1, Math.round(gasRules.advance * scale)),
      from: index ? areas[index - 1] : full,
      to,
    };
  });
  return {
    full,
    stages,
    clouds: [],
    strikeReadyAt: { blue: gasStrikeRules.initialDelay, red: gasStrikeRules.initialDelay },
    sequence: 0,
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
// Where the gas front stands at `tick`, interpolated through an advance.
export function safeAreaAt(gas: GasState, tick: number): SafeArea {
  let area = gas.full;
  for (const s of gas.stages) {
    if (tick >= s.endAt) { area = s.to; continue; }
    if (tick > s.startAt) {
      const t = (tick - s.startAt) / (s.endAt - s.startAt);
      area = { halfWidth: lerp(s.from.halfWidth, s.to.halfWidth, t), halfDepth: lerp(s.from.halfDepth, s.to.halfDepth, t), radius: lerp(s.from.radius, s.to.radius, t) };
    }
    break;
  }
  return area;
}
// Gas damages only once the first advance has begun; before that it is a
// warning on the horizon.
export const gasActive = (gas: GasState, tick: number) => tick > gas.stages[0].startAt;
// The stage that has been announced and not yet finished rolling in, if any.
export const pendingStage = (gas: GasState, tick: number) =>
  gas.stages.find((s) => tick >= s.warnAt && tick < s.endAt);
// The ground that will be safe once the announced advance is over: what the
// minimap outlines, where respawns go and what bots plan around. Before the
// first announcement there is none.
export function nextSafeArea(gas: GasState, tick: number): SafeArea | null {
  const stage = pendingStage(gas, tick);
  if (stage) return stage.to;
  return tick >= gas.stages[0].warnAt ? safeAreaAt(gas, tick) : null;
}
// Signed distance from the safe edge: positive inside the gas.
export function gasDepth(area: SafeArea, x: number, z: number) {
  const r = Math.min(area.radius, area.halfWidth, area.halfDepth);
  const qx = Math.abs(x) - (area.halfWidth - r), qz = Math.abs(z) - (area.halfDepth - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
}
// How deep in the front's gas a point stands now, or -Infinity with no gas.
export function frontDepth(g: Pick<Game, "gas" | "tick">, v: Vec, tick = g.tick) {
  return g.gas && gasActive(g.gas, tick) ? gasDepth(safeAreaAt(g.gas, tick), v.x, v.z) : -Infinity;
}
// Whether a point is gassed now or will be once the announced advance is over.
export function gasThreatens(g: Pick<Game, "gas" | "tick">, v: Vec, margin = 0) {
  if (!g.gas) return false;
  const next = nextSafeArea(g.gas, g.tick);
  return frontDepth(g, v) > -margin || (!!next && gasDepth(next, v.x, v.z) > -margin);
}

export function cloudDensity(cloud: GasCloud, tick: number) {
  if (tick < cloud.landAt || tick >= cloud.endsAt) return 0;
  return clamp(Math.min((tick - cloud.landAt) / gasStrikeRules.grow, (cloud.endsAt - tick) / gasStrikeRules.fade), 0, 1);
}
export function cloudPosition(cloud: GasCloud, tick: number): Vec {
  const seconds = Math.max(0, tick - cloud.landAt) / 30;
  return {
    x: cloud.x + Math.cos(cloud.heading) * gasStrikeRules.drift * seconds,
    z: cloud.z + Math.sin(cloud.heading) * gasStrikeRules.drift * seconds,
  };
}
export const cloudRadius = (density: number) => gasStrikeRules.radius * (0.45 + 0.55 * density);
// The strongest cloud over a point, 0 to 1 (1 at the heart of a full cloud),
// with the cloud responsible. `pad` widens each cloud for bots keeping clear.
export function cloudExposure(g: Pick<Game, "gas" | "tick">, v: Vec, pad = 0) {
  let best: { cloud: GasCloud; strength: number } | null = null;
  for (const cloud of g.gas?.clouds ?? []) {
    const density = cloudDensity(cloud, g.tick);
    if (density <= 0) continue;
    const r = cloudRadius(density) + pad, d = dist(v, cloudPosition(cloud, g.tick));
    if (d >= r) continue;
    const strength = density * Math.min(1, 1.3 * (1 - d / r) + 0.25);
    if (!best || strength > best.strength) best = { cloud, strength };
  }
  return best;
}

// --- Masks -----------------------------------------------------------------
// How far on the mask is, 0 (off) to 1 (sealed).
export function maskProgress(p: Pick<Soldier, "gasMask">, tick: number) {
  const m = p.gasMask;
  if (!m) return 0;
  const t = Math.max(0, tick - m.since);
  return m.worn ? Math.min(1, m.from + t / gasRules.donTicks) : Math.max(0, m.from - t / gasRules.doffTicks);
}
export const masked = (p: Pick<Soldier, "gasMask">, tick: number) => !!p.gasMask?.worn && maskProgress(p, tick) >= 1;
export function toggleMask(g: Game, p: Soldier) {
  if (p.hp <= 0 || p.mantle || p.melee || p.mountedGun !== undefined) return false;
  const from = maskProgress(p, g.tick), worn = !p.gasMask?.worn;
  const busy = Math.ceil((worn ? 1 - from : from) * (worn ? gasRules.donTicks : gasRules.doffTicks));
  p.gasMask = { worn, since: g.tick, from };
  // Both hands are at the face: no firing, throwing, aiming or climbing, and
  // a reload in progress waits.
  if (p.reloadAt) p.reloadAt += busy;
  p.throwUntil = Math.max(p.throwUntil, g.tick + busy);
  g.emit({ type: "gasMask", actor: p.id, worn });
  return true;
}

// --- Respawns --------------------------------------------------------------
// Once the gas is announced for a team's spawn, its soldiers deploy at the
// rear edge of their own side's safe ground instead, in the same formation.
// Respawning into gas would only feed a slow death or a run through it every
// life; moving the deployment line up keeps the five-second respawn fair and
// the two sides as far apart as the safe area allows.
export function deploymentCenter(g: Pick<Game, "gas" | "tick" | "map">, team: Team): Vec {
  const s = g.map.spawn[team], area = g.gas && nextSafeArea(g.gas, g.tick);
  if (!area) return { x: s.x, z: s.z };
  const m = gasRules.deployMargin;
  return { x: clamp(s.x, -(area.halfWidth - m), area.halfWidth - m), z: clamp(s.z, -(area.halfDepth - m), area.halfDepth - m) };
}
export function gasDeployment(g: Game, p: Soldier): Vec | null {
  if (!g.gas) return null;
  p.gasMask = p.gasEscape = null;
  p.gasClearSince = p.gasNoticed = undefined;
  const area = nextSafeArea(g.gas, g.tick), m = 3;
  if (!area || (gasDepth(area, p.x, p.z) < -m && frontDepth(g, p) < -m)) return null;
  // The whole formation moves up with its centre; anyone still near the gas,
  // such as Verdun's soldiers deploying at their trench entrances, closes in.
  const s = g.map.spawn[p.team], center = deploymentCenter(g, p.team);
  let at = {
    x: clamp(p.x + center.x - s.x, -(area.halfWidth - m), area.halfWidth - m),
    z: clamp(p.z + center.z - s.z, -(area.halfDepth - m), area.halfDepth - m),
  };
  for (let i = 0; i < 20 && gasDepth(area, at.x, at.z) > -m; i++) at = { x: at.x * 0.97, z: at.z * 0.97 };
  if (!blocked(at.x, at.z, 0.5, g.map)) return at;
  for (let r = 0.6; r <= 3; r += 0.6)
    for (let i = 0; i < 8; i++) {
      const v = { x: at.x + Math.cos((i * Math.PI) / 4) * r, z: at.z + Math.sin((i * Math.PI) / 4) * r };
      if (!blocked(v.x, v.z, 0.5, g.map) && gasDepth(area, v.x, v.z) < -2) return v;
    }
  return at;
}

// --- Gas shells ------------------------------------------------------------
export function gasStrikeReason(g: Game, p: Soldier, target: Vec & { area?: boolean }): string | null {
  if (!g.gas || g.phase !== "playing") return "No gas shells on this battlefield";
  if (teamHasHuman(g, p) && !g.humanPlayerIds.includes(p.id)) return "Gas shells are reserved for your team's human player";
  if (p.hp <= 0) return "Redeploy before calling gas shells";
  if (!Number.isFinite(target.x) || !Number.isFinite(target.z)) return "Choose a target";
  const area = playArea(g.map);
  if (Math.abs(target.x) > area.width / 2 || Math.abs(target.z) > area.depth / 2) return "Choose a sector on the map";
  const at = target.area ? artillerySector(g.map, target) : target;
  if ((["blue", "red"] as const).some((team) => dist(at, deploymentCenter(g, team)) < gasStrikeRules.deployClearance))
    return "Too close to a deployment area";
  if (g.tick < g.gas.strikeReadyAt[p.team]) return "Gas shells are reloading";
  return null;
}
export function requestGasStrike(g: Game, p: Soldier, target: Vec & { area?: boolean }) {
  if (gasStrikeReason(g, p, target)) return false;
  const gas = g.gas!, area = playArea(g.map), at = target.area ? artillerySector(g.map, target) : target, m = gasStrikeRules.edgeMargin;
  const cloud: GasCloud = {
    id: ++gas.sequence,
    team: p.team,
    actor: p.id,
    x: clamp(at.x, -area.width / 2 + m, area.width / 2 - m),
    z: clamp(at.z, -area.depth / 2 + m, area.depth / 2 - m),
    // The wind runs along the front, turning a little from shell to shell.
    heading: (gas.sequence % 2 ? 1 : -1) * Math.PI / 2 + 0.3 * Math.sin(gas.sequence * 1.7),
    landAt: g.tick + gasStrikeRules.flightTicks,
    endsAt: g.tick + gasStrikeRules.flightTicks + gasStrikeRules.lifetime,
  };
  gas.clouds.push(cloud);
  gas.strikeReadyAt[p.team] = g.tick + gasStrikeRules.cooldown;
  p.protectedUntil = 0;
  g.emit({ type: "gasStrike", phase: "call", cloud: cloud.id, actor: p.id, team: p.team, at: { x: cloud.x, z: cloud.z }, landAt: cloud.landAt, endsAt: cloud.endsAt });
  return true;
}
// A bot team's caller picks the tightest knot of enemies 30 to 70 m away,
// clear of its own soldiers.
export function botGasTarget(g: Game, p: Soldier): Vec | null {
  if (!g.gas || g.tick < g.gas.strikeReadyAt[p.team] || g.tick % 30 !== p.id % 30 || teamHasHuman(g, p)) return null;
  let best: Vec | null = null, most = gasStrikeRules.botCluster - 1;
  for (const q of g.players) {
    if (q.hp <= 0 || q.team === p.team || g.tick < q.protectedUntil || dist(p, q) < 30 || dist(p, q) > 70) continue;
    let enemies = 0, friends = 0;
    for (const o of g.players) if (o.hp > 0 && dist(o, q) < 8) o.team === p.team ? friends++ : enemies++;
    if (friends || enemies <= most || gasStrikeReason(g, p, q)) continue;
    most = enemies;
    best = { x: q.x, z: q.z };
  }
  return best;
}

// --- The match -------------------------------------------------------------
type Damage = (p: Soldier, amount: number, source: number, team: Team | null, weapon: string) => void;
export function advanceGas(g: Game, damage: Damage) {
  const gas = g.gas;
  if (!gas || g.phase !== "playing") return;
  for (const s of gas.stages) {
    const final = s.index === gas.stages.length - 1;
    const phase = g.tick === s.warnAt ? "warning" : g.tick === s.startAt ? "advance" : g.tick === s.endAt ? "settled" : null;
    if (phase) g.emit({ type: "gas", phase, stage: s.index, final, startAt: s.startAt, endAt: s.endAt, area: { ...s.to } });
  }
  for (const p of g.players) {
    if (p.hp <= 0) continue;
    if (p.command.gasMask) toggleMask(g, p);
    if (p.command.gasStrike) requestGasStrike(g, p, p.command.gasStrike);
    if (!g.humanPlayerIds.includes(p.id)) {
      botMask(g, p);
      const strike = botGasTarget(g, p);
      if (strike) requestGasStrike(g, p, strike);
    }
  }
  for (const cloud of gas.clouds) {
    if (g.tick === cloud.landAt)
      g.emit({ type: "gasStrike", phase: "land", cloud: cloud.id, actor: cloud.actor, team: cloud.team, at: cloudPosition(cloud, g.tick), landAt: cloud.landAt, endsAt: cloud.endsAt });
  }
  gas.clouds = gas.clouds.filter((cloud) => {
    if (g.tick < cloud.endsAt) return true;
    g.emit({ type: "gasStrike", phase: "end", cloud: cloud.id, actor: cloud.actor, team: cloud.team, at: cloudPosition(cloud, g.tick), landAt: cloud.landAt, endsAt: cloud.endsAt });
    return false;
  });
  if (g.tick % gasRules.damageInterval) return;
  const seconds = gasRules.damageInterval / 30;
  for (const p of g.players) {
    if (p.hp <= 0) continue;
    const sealed = masked(p, g.tick), front = frontDepth(g, p) > 0, cloud = cloudExposure(g, p);
    // A mask cuts both kinds to the same slow burn; it does not add up.
    if (sealed && (front || cloud)) {
      const caller = cloud && !front ? g.players.find((q) => q.id === cloud.cloud.actor && q.team !== p.team) : undefined;
      damage(p, gasRules.maskedPerSecond * seconds, caller?.id ?? -1, caller?.team ?? null, caller ? "Gas shell" : "Gas");
      continue;
    }
    if (front) damage(p, gasRules.damagePerSecond * seconds, -1, null, "Gas");
    if (cloud && p.hp > 0) {
      // Only an enemy's shell earns its caller credit; a cloud blown onto your
      // own side is the wind's doing.
      const caller = g.players.find((q) => q.id === cloud.cloud.actor && q.team !== p.team);
      damage(p, gasStrikeRules.damagePerSecond * cloud.strength * seconds, caller?.id ?? -1, caller?.team ?? null, "Gas shell");
    }
  }
}

// Bots mask up when gas is close, after a short reaction that differs from
// soldier to soldier, and unmask once they have been clear of it a while.
function botMask(g: Game, p: Soldier) {
  if ((g.tick + p.id) % 6) return;
  const rules = gasRules.bot, ahead = g.tick + rules.lookahead;
  const edge = -Math.max(frontDepth(g, p), frontDepth(g, p, ahead));
  const near = edge < rules.maskWithin || !!cloudExposure(g, p, rules.maskWithin);
  const clear = edge > rules.unmaskBeyond && !cloudExposure(g, p, rules.unmaskBeyond);
  if (clear) p.gasClearSince ??= g.tick;
  else p.gasClearSince = undefined;
  const worn = !!p.gasMask?.worn;
  if (!worn && near) {
    // About a third of a second to react, staggered so a line does not move as one.
    p.gasNoticed ??= g.tick;
    if (g.tick - p.gasNoticed >= 6 + (p.id % 4) * 3) toggleMask(g, p);
    return;
  }
  p.gasNoticed = undefined;
  if (worn && clear && g.tick - p.gasClearSince! >= rules.unmaskAfter) toggleMask(g, p);
}

// Extra route cost through gas, so bots plan around clouds and the front.
export function gasCost(g: Game): ((a: Vec, b: Vec) => number) | undefined {
  if (!g.gas || (!g.gas.clouds.length && !gasActive(g.gas, g.tick + gasRules.bot.lookahead))) return undefined;
  return (a, b) => {
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    return dist(a, b) * ((gasThreatens(g, mid, 2) ? 3 : 0) + (cloudExposure(g, mid, 3) ? 4 : 0));
  };
}

// The nearest point well inside the ground that will stay safe, clear of clouds.
function safePoint(g: Game, p: Soldier): Vec {
  const gas = g.gas!, area = nextSafeArea(gas, g.tick) ?? safeAreaAt(gas, g.tick), m = gasRules.bot.escapeDepth;
  let v = { x: clamp(p.x, -(area.halfWidth - m), area.halfWidth - m), z: clamp(p.z, -(area.halfDepth - m), area.halfDepth - m) };
  // Out of a rounded corner, toward the middle.
  for (let i = 0; i < 20 && gasDepth(area, v.x, v.z) > -m; i++) v = { x: v.x * 0.95, z: v.z * 0.95 };
  const cloud = cloudExposure(g, v, 4);
  if (cloud) {
    const c = cloudPosition(cloud.cloud, g.tick), d = Math.max(0.5, dist(p, c)), r = cloudRadius(1) + 6;
    v = { x: c.x + ((p.x - c.x) / d) * r, z: c.z + ((p.z - c.z) / d) * r };
    if (gasDepth(area, v.x, v.z) > -m) v = { x: c.x - ((p.x - c.x) / d) * r, z: c.z - ((p.z - c.z) / d) * r };
  }
  return v;
}
// A bot in gas, or on ground the front is about to reach, gets out first.
export function escapeGas(g: Game, p: Soldier): Command | null {
  if (!g.gas) return null;
  const rules = gasRules.bot;
  const danger = Math.max(frontDepth(g, p), frontDepth(g, p, g.tick + rules.lookahead)) > -rules.escapeWithin || !!cloudExposure(g, p, 1);
  let escape = p.gasEscape;
  if (!danger) {
    if (!escape) return null;
    if (dist(p, escape.destination) < 2 || frontDepth(g, p) < -rules.escapeDepth + 2 || g.tick - escape.since > 300) {
      p.gasEscape = null;
      p.path = [];
      p.nextThink = g.tick;
      return null;
    }
  }
  // Replan when the chosen ground turns out to be gassed too, at most once a second.
  const spoiled = !!escape && g.tick - escape.since >= 30 && ((danger && gasThreatens(g, escape.destination, 2)) || !!cloudExposure(g, escape.destination, 1));
  if (!escape || g.tick - escape.since > 300 || spoiled) {
    const destination = safePoint(g, p);
    escape = p.gasEscape = { destination, since: g.tick, checkedAt: g.tick, lastPosition: { x: p.x, z: p.z } };
    p.path = pathfind(p, destination, g.map, true, gasCost(g));
    if (!p.path.length && walkSegment(p, destination, g.map)) p.path = [destination];
    p.nextThink = g.tick + 30;
  }
  if (!p.path.length && g.tick >= p.nextThink && dist(p, escape.destination) > 1) {
    p.path = pathfind(p, escape.destination, g.map, true, gasCost(g));
    p.nextThink = g.tick + 30;
  }
  while (p.path.length && dist(p, p.path[0]) < 0.35 && (p.path.length === 1 || walkSegment(p, p.path[1], g.map))) p.path.shift();
  const c = idle();
  // Without a route yet, head straight for safety rather than stand in it.
  const toward = safeBotDestination(g, p) ?? (p.path.length ? undefined : escape.destination);
  if (toward) {
    const d = Math.max(0.7, dist(p, toward));
    c.x = (toward.x - p.x) / d;
    c.z = (toward.z - p.z) / d;
    c.yaw = Math.atan2(c.x, -c.z);
    c.sprint = true;
  } else c.yaw = p.yaw;
  c.pitch = 0;
  c.reload = p.ammo < (p.weapon === "serviceRifle" ? 5 : 30) && p.reserve > 0;
  p.mode = "Escape gas";
  return c;
}
