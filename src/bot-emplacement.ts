// Bots carrying Support's emplacement kit (src/emplacements.ts): once a bot
// reaches its firing step or flag it sets the gun down facing the enemy, sits
// behind it and fires in bursts, sparing the barrel. When nothing has come
// into its arc for a while and its orders lie elsewhere, it packs the gun up
// and moves on.
import { angleDelta } from "./awareness";
import { carriedFlag } from "./ctf";
import { emplacementRules, mountedGun, placementFor } from "./emplacements";
import { dist, supportHeight, type Vec } from "./map";
import type { Command, Game, Soldier } from "./simulation";
import { botHoldsFire } from "./weapon-heat";

export const botEmplacementRules = {
  // Ticks between attempts to find level ground for the gun.
  retryTicks: 20,
  // Attempts at one spot before the bot gives up on it and carries on.
  attempts: 6,
  // With no target this long, a gunner whose objective is far off packs up.
  idleTicks: 25 * 30,
  // How far the objective may be from the gun before the gunner moves on.
  reach: 30,
  // A bot that finds its own gun left this far behind (after it died, say)
  // writes it off so it can set up another.
  abandoned: 40,
  // Only set up with an enemy this close: rounds carry 60 m.
  enemyWithin: 55,
  // Bursts: fire for the first part of each cycle.
  burstCycle: 42,
  burstOn: 24,
};

type Memory = { nextTry: number; tries: number; idleSince: number; spot?: Vec; walkTo?: Vec };
const memory = new WeakMap<Game, Map<number, Memory>>();
function remember(g: Game, p: Soldier): Memory {
  let list = memory.get(g);
  if (!list) memory.set(g, list = new Map());
  let m = list.get(p.id);
  if (!m) list.set(p.id, m = { nextTry: 0, tries: 0, idleSince: g.tick });
  return m;
}

// Which way the gun should face: at the bot's target, else toward the enemy's side.
function facing(g: Game, p: Soldier) {
  const target = g.players.find(q => q.id === p.target && q.hp > 0);
  const to = target ?? g.map.spawn[p.team === "blue" ? "red" : "blue"];
  return Math.atan2(to.x - p.x, -(to.z - p.z));
}

export function emplacementBotCommand(g: Game, p: Soldier, c: Command): Command {
  if (p.loadout !== "emplacement" || p.hp <= 0 || p.tank !== undefined || g.humanPlayerIds.includes(p.id)) return c;
  // A flag carrier runs it home rather than setting up a gun.
  if (carriedFlag(g, p) && !mountedGun(g, p)) return c;
  const m = remember(g, p);
  const own = g.emplacements.get(p.id);
  const mounted = mountedGun(g, p);
  const objective: Vec | undefined = g.sectors[p.objective];
  const target = g.players.find(q => q.id === p.target && q.hp > 0);
  if (target) m.idleSince = g.tick;

  if (mounted) {
    p.mode = "Manning gun";
    const bearing = target ? angleDelta(mounted.baseYaw, Math.atan2(target.x - p.x, -(target.z - p.z))) : 0;
    const inArc = !!target && Math.abs(bearing) <= emplacementRules.traverse;
    // The pistol's trigger discipline does not apply: hold the gun's trigger
    // in bursts while the sights are near the target.
    const onTarget = !!target && Math.abs(angleDelta(c.yaw, Math.atan2(target.x - p.x, -(target.z - p.z)))) < 0.08;
    c.fire = onTarget && inArc && !botHoldsFire(mounted.barrel) &&
      (g.tick + p.id * 7) % botEmplacementRules.burstCycle < botEmplacementRules.burstOn;
    c.reload = mounted.ammo === 0;
    const idle = g.tick - m.idleSince > botEmplacementRules.idleTicks;
    // An enemy out of the arc for long, or orders elsewhere: climb off.
    if (idle && mounted.owner === p.id && (!objective || dist(mounted.at, objective) > botEmplacementRules.reach)) {
      c.interact = !p.commandInteractHeld;
      c.fire = false;
    }
    return c;
  }

  if (own) {
    const d = Math.hypot(own.seat.x - p.x, own.seat.z - p.z);
    if (own.operator === undefined && d > botEmplacementRules.abandoned) {
      g.emplacements.delete(p.id);
      g.emit({ type: "emplacement", actor: p.id, phase: "pack", owner: p.id });
      return c;
    }
    const idle = g.tick - m.idleSince > botEmplacementRules.idleTicks;
    const moveOn = idle && objective && dist(own.at, objective) > botEmplacementRules.reach;
    if (d < 1.6 && g.tick >= own.readyAt && own.operator === undefined) {
      Object.assign(c, { x: 0, z: 0, sprint: false });
      if (moveOn) c.packGun = true;
      else c.interact = !p.commandInteractHeld;
      if (!moveOn) m.idleSince = g.tick;
      return c;
    }
    if (!moveOn && d < 8 && own.operator === undefined) {
      c.x = (own.seat.x - p.x) / Math.max(0.1, d);
      c.z = (own.seat.z - p.z) / Math.max(0.1, d);
      c.sprint = false;
      p.mode = "To the gun";
    }
    return c;
  }

  if (m.walkTo) {
    const d = dist(m.walkTo, p);
    if (d > 3 || p.emplacementLost) m.walkTo = undefined;
    else if (d > 0.25) {
      c.x = (m.walkTo.x - p.x) / d;
      c.z = (m.walkTo.z - p.z) / d;
      c.sprint = false;
      p.mode = "Siting gun";
      return c;
    } else m.nextTry = g.tick;
  }
  // Set the gun down once the bot holds its place (a firing step, a flag, or
  // a halt in a fight) with the enemy inside a bullet's reach.
  const settled = !!m.walkTo || p.mode === "Firing step" || p.mode.endsWith("flag") || (!!target && Math.hypot(p.vx, p.vz) < 1.5);
  const enemyNear = g.players.some(q => q.team !== p.team && q.hp > 0 && dist(p, q) < botEmplacementRules.enemyWithin);
  if (!settled || !enemyNear || p.emplacementLost || g.tick < m.nextTry || p.mantle || p.hop || p.fall) return c;
  if (!m.spot || dist(m.spot, p) > 3) { m.spot = { x: p.x, z: p.z }; m.tries = 0; }
  if (m.tries >= botEmplacementRules.attempts) return c;
  m.nextTry = g.tick + botEmplacementRules.retryTicks;
  m.tries++;
  const yaw = facing(g, p);
  const site = gunSite(g, p, yaw);
  if (!site) return c;
  const d = Math.hypot(site.x - p.x, site.z - p.z);
  if (d > 0.25) {
    // Step to level ground first (off a firing step the bank is in the way).
    m.walkTo = site;
    m.nextTry = g.tick;
    m.tries--;
    c.x = (site.x - p.x) / d;
    c.z = (site.z - p.z) / d;
    c.sprint = false;
    p.mode = "Siting gun";
    return c;
  }
  Object.assign(c, { x: 0, z: 0, sprint: false, yaw: site.yaw, deployGun: true, fire: false });
  m.walkTo = undefined;
  m.idleSince = g.tick;
  p.mode = "Setting up gun";
  return c;
}

// Where the gun can go down facing about `yaw`: here, turned a little, or a
// short step away.
export function gunSite(g: Game, p: Soldier, yaw: number): (Vec & { yaw: number }) | undefined {
  const turns = [0, 0.35, -0.35, 0.7, -0.7];
  for (const turn of turns) if (placementFor(g, p, yaw + turn).valid) return { x: p.x, z: p.z, yaw: yaw + turn };
  for (const r of [1.2, 2.4]) for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
    const y = supportHeight(x, z, g.map, p.y + 0.5);
    if (Math.abs(y - p.y) > 0.6 || g.collision.ray({ x: p.x, y: p.y + 1, z: p.z }, { x, y: y + 1, z }) < 0.99) continue;
    const at = { ...p, x, y, z } as Soldier;
    for (const turn of turns) if (placementFor(g, at, yaw + turn).valid) return { x, z, yaw: yaw + turn };
  }
  return undefined;
}
