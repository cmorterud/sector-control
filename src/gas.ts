// Mustard gas shells and gas masks. Gas shells are an alternate artillery
// strike: the tactical map switches a fire mission between high explosive
// and gas, and both share the team's artillery cooldown and targeting rules.
// Gas damage over time is credited to the caller only when it burns the
// enemy; a mask cuts it to a slow burn. Everything here is plain state
// advanced by the fixed-tick simulation.
import { artillerySector } from "./artillery-sectors";
import { artilleryRules, artilleryTargetReason, launchShell, teamHasHuman } from "./artillery";
import { sightLimit } from "./night";
import { blocked, dist, playArea, walkSegment, type Vec } from "./map";
import { idle, pathfind, safeBotDestination, type Command, type Game, type Soldier, type Team } from "./simulation";

export const gasRules = {
  damageInterval: 15,
  // Pulling the mask on takes both hands for a second; off is quicker.
  donTicks: 30,
  doffTicks: 15,
  // Half-angle in radians a masked bot notices enemies within, against 1.1
  // bare-faced: the eyepieces cut off the edges of sight, as the lens
  // overlay does for the player.
  maskedView: 0.7,
  bot: {
    // Mask up within this distance of a cloud, and take it off once this far
    // clear of every cloud for a while.
    maskWithin: 8,
    unmaskBeyond: 18,
    unmaskAfter: 5 * 30,
  },
};

// Gas shells: a cloud that lingers and drifts where the shells land.
export const gasStrikeRules = {
  // From the call to the shells landing and the cloud starting to spread.
  flightTicks: 3 * 30,
  lifetime: 25 * 30,
  grow: 3 * 30,
  fade: 5 * 30,
  radius: 9,
  height: 2.2,
  // Meters per second along the front, so neither side's cloud drifts home.
  drift: 0.3,
  // Unmasked, the heart of a cloud kills from full health in about eight
  // seconds; masked, mustard still blisters skin at a slow burn.
  damagePerSecond: 12,
  maskedPerSecond: 1.5,
  // No gas shells onto either team's deployment.
  deployClearance: 24,
  edgeMargin: 6,
  // Shells per strike, landing over this many ticks from the first, within
  // this distance of the aim point. The cloud starts with the first.
  shells: 4,
  shellSpread: [0, 7, 14, 22],
  shellScatter: 3.5,
  // How long a shell's own jet of gas stays visible as it bursts.
  burstTicks: 3 * 30,
  // A bot caller chooses gas over high explosive only for a knot of at least
  // this many enemies, clear of its own soldiers.
  botCluster: 3,
};

export interface GasCloud {
  id: number;
  team: Team;
  actor: number;
  x: number;
  z: number;
  heading: number;
  landAt: number;
  endsAt: number;
  // Shells fired so far, and where each burst. A cloud made without shells
  // (a test or a review scene) leaves these out.
  launched?: number;
  bursts?: (Vec & { y: number; tick: number })[];
}
export interface GasState {
  clouds: GasCloud[];
  sequence: number;
}
// `from` is how far on the mask was when this change began, so a soldier who
// changes their mind halfway does not start over.
export interface GasMask { worn: boolean; since: number; from: number }
export interface GasEscape { destination: Vec; since: number }
export type GasEvent =
  | { type: "gasMask"; actor: number; worn: boolean }
  | { type: "gasShellImpact"; actor: number; cloud: number; shell: number; at: { x: number; y: number; z: number } }
  | { type: "gasStrike"; phase: "call" | "land" | "end"; cloud: number; actor: number; team: Team; at: Vec; landAt: number; endsAt: number };

export const createGasState = (): GasState => ({ clouds: [], sequence: 0 });

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

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
  for (const cloud of g.gas.clouds) {
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

// A soldier redeploys bare-faced.
export function resetGas(p: Soldier) {
  p.gasMask = p.gasEscape = null;
  p.gasClearSince = p.gasNoticed = undefined;
}

// --- Gas shells ------------------------------------------------------------
// The same rules as a high-explosive fire mission (range, view, the shared
// cooldown, one mission at a time), plus no gas onto a deployment.
export function gasStrikeReason(g: Game, p: Soldier, target: Vec & { area?: boolean }): string | null {
  const reason = artilleryTargetReason(g, p, target);
  if (reason) return reason;
  const at = target.area ? artillerySector(g.map, target) : target;
  if ((["blue", "red"] as const).some((team) => dist(at, g.map.spawn[team]) < gasStrikeRules.deployClearance))
    return "Too close to a deployment area";
  return null;
}
export function requestGasStrike(g: Game, p: Soldier, target: Vec & { area?: boolean }) {
  if (gasStrikeReason(g, p, target)) return false;
  const gas = g.gas, area = playArea(g.map), at = target.area ? artillerySector(g.map, target) : target, m = gasStrikeRules.edgeMargin;
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
    launched: 0,
    bursts: [],
  };
  gas.clouds.push(cloud);
  // Gas instead of high explosive: the battery reloads either way.
  g.artillery.readyAt[p.team] = g.tick + artilleryRules.cooldown;
  p.protectedUntil = 0;
  g.emit({ type: "gasStrike", phase: "call", cloud: cloud.id, actor: p.id, team: p.team, at: { x: cloud.x, z: cloud.z }, landAt: cloud.landAt, endsAt: cloud.endsAt });
  return true;
}
// Where each shell of a strike falls: scattered about the aim point, the
// same way every time for a given strike so a replay matches.
export function gasShellTarget(cloud: Pick<GasCloud, "id" | "x" | "z">, index: number): Vec {
  const a = (cloud.id * 2.39996 + index * 1.9) % (Math.PI * 2);
  const r = gasStrikeRules.shellScatter * (index ? 0.45 + 0.55 * ((index * 0.618 + cloud.id * 0.37) % 1) : 0.25);
  return { x: cloud.x + Math.cos(a) * r, z: cloud.z + Math.sin(a) * r };
}
// A bot team's caller picks gas over high explosive only for a tight knot of
// enemies 30 to 70 m away, clear of its own soldiers; otherwise it leaves the
// battery to the ordinary fire mission.
export function botGasTarget(g: Game, p: Soldier): Vec | null {
  if (!g.artillery.enabled || g.tick < g.artillery.readyAt[p.team] || g.tick % 30 !== p.id % 30 || teamHasHuman(g, p)) return null;
  let best: Vec | null = null, most = gasStrikeRules.botCluster - 1;
  for (const q of g.players) {
    if (q.hp <= 0 || q.team === p.team || g.tick < q.protectedUntil || dist(p, q) < 30 || dist(p, q) > 70) continue;
    if (dist(p, q) >= sightLimit(g, q)) continue;
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
  if (g.phase !== "playing") return;
  for (const p of g.players) {
    if (p.hp <= 0) continue;
    if (p.command.gasMask) toggleMask(g, p);
    if (!g.humanPlayerIds.includes(p.id)) botMask(g, p);
  }
  for (const cloud of gas.clouds) {
    // The battery fires so the first shell lands as the cloud starts.
    while (cloud.launched !== undefined && cloud.launched < gasStrikeRules.shells &&
      g.tick >= cloud.landAt - artilleryRules.flightTicks + gasStrikeRules.shellSpread[cloud.launched]) {
      launchShell(g, gasShellTarget(cloud, cloud.launched), -cloud.id, cloud.actor, cloud.team, false, false, cloud.id);
      cloud.launched++;
    }
    if (cloud.bursts?.length) cloud.bursts = cloud.bursts.filter((b) => g.tick - b.tick < gasStrikeRules.burstTicks);
    if (g.tick === cloud.landAt)
      g.emit({ type: "gasStrike", phase: "land", cloud: cloud.id, actor: cloud.actor, team: cloud.team, at: cloudPosition(cloud, g.tick), landAt: cloud.landAt, endsAt: cloud.endsAt });
  }
  gas.clouds = gas.clouds.filter((cloud) => {
    if (g.tick < cloud.endsAt) return true;
    g.emit({ type: "gasStrike", phase: "end", cloud: cloud.id, actor: cloud.actor, team: cloud.team, at: cloudPosition(cloud, g.tick), landAt: cloud.landAt, endsAt: cloud.endsAt });
    return false;
  });
  if (!gas.clouds.length || g.tick % gasRules.damageInterval) return;
  const seconds = gasRules.damageInterval / 30;
  for (const p of g.players) {
    if (p.hp <= 0) continue;
    const cloud = cloudExposure(g, p);
    if (!cloud) continue;
    // Only an enemy's shell earns its caller credit; a cloud blown onto your
    // own side is the wind's doing.
    const caller = g.players.find((q) => q.id === cloud.cloud.actor && q.team !== p.team);
    const perSecond = masked(p, g.tick) ? gasStrikeRules.maskedPerSecond : gasStrikeRules.damagePerSecond * cloud.strength;
    damage(p, perSecond * seconds, caller?.id ?? -1, caller?.team ?? null, "Gas shell");
  }
}

// Bots mask up when a cloud is close, after a short reaction that differs
// from soldier to soldier, and unmask once they have been clear of it a while.
function botMask(g: Game, p: Soldier) {
  if ((g.tick + p.id) % 6) return;
  if (!p.gasMask?.worn && !g.gas.clouds.length) return;
  const rules = gasRules.bot;
  const near = !!cloudExposure(g, p, rules.maskWithin);
  const clear = !cloudExposure(g, p, rules.unmaskBeyond);
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

// Extra route cost through gas, so bots plan around clouds.
export function gasCost(g: Game): ((a: Vec, b: Vec) => number) | undefined {
  if (!g.gas.clouds.length) return undefined;
  return (a, b) => {
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
    return cloudExposure(g, mid, 3) ? dist(a, b) * 4 : 0;
  };
}

// Clean air just beyond the cloud: of points around its edge that are open
// ground inside the play area and clear of every cloud, the nearest, with
// ground toward the enemy counted dear so a bot steps back or along its
// line rather than over the parapet.
function safePoint(g: Game, p: Soldier, cloud: GasCloud): Vec {
  const area = playArea(g.map), m = gasStrikeRules.edgeMargin, r = cloudRadius(1) + 6;
  const c = cloudPosition(cloud, g.tick), home = Math.sign(g.map.spawn[p.team].x) || -1;
  let best: Vec | null = null, cost = Infinity;
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6, v = { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r };
    if (Math.abs(v.x) > area.width / 2 - m || Math.abs(v.z) > area.depth / 2 - m) continue;
    if (blocked(v.x, v.z, 0.6, g.map) || cloudExposure(g, v, 2)) continue;
    const forward = Math.max(0, (v.x - p.x) * -home);
    const score = dist(p, v) + forward * 3;
    if (score < cost) { cost = score; best = v; }
  }
  return best ?? { x: clamp(c.x + home * r, -area.width / 2 + m, area.width / 2 - m), z: c.z };
}
// A bot in a cloud, or at its edge, walks out of it first.
export function escapeGas(g: Game, p: Soldier): Command | null {
  if (!g.gas.clouds.length && !p.gasEscape) return null;
  const threat = cloudExposure(g, p, 1);
  let escape = p.gasEscape;
  if (!threat) {
    if (!escape) return null;
    p.gasEscape = null;
    p.path = [];
    p.nextThink = g.tick;
    return null;
  }
  // Replan when the chosen ground turns out to be gassed too, at most once a second.
  const spoiled = !!escape && g.tick - escape.since >= 30 && !!cloudExposure(g, escape.destination, 1);
  if (!escape || g.tick - escape.since > 300 || spoiled) {
    const destination = safePoint(g, p, threat.cloud);
    escape = p.gasEscape = { destination, since: g.tick };
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
  // Without a route yet, head straight for clean air rather than stand in it.
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
