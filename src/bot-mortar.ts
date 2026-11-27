// Bots carrying the trench mortar (src/mortar.ts). A mortar bot sets its tube
// down once it holds a place with the enemy one trench line ahead, then lays
// it on enemies its teammates are already fighting, preferring a group or a
// machine gun. Its first bomb lands well off and each one after closes in, so
// it brackets onto a target the way a crew would and gives the target time to
// move. Out of bombs, it stands up and fights on with its pistol. Every bot
// also dives away from a bomb it hears whistling down close by.
import { angleDelta } from "./awareness";
import { gunSite } from "./bot-emplacement";
import { carriedFlag } from "./ctf";
import { emplacementRules, mountedGun } from "./emplacements";
import { dist, type Vec } from "./map";
import { mortarTargetBlocked } from "./mortar";
import { mortarRules } from "./mortar-stats";
import type { Command, Game, Soldier } from "./simulation";

export const botMortarRules = {
  // Seconds between bombs: slower than a person can drop them.
  fireTicks: 90,
  // The first bomb's miss, halved for each bomb after on the same target (m).
  firstError: 5,
  // Only fire once the landing ring has settled below this bloom (m).
  settledBloom: 0.8,
  // Re-pick a target this often.
  retargetTicks: 15,
  // An enemy group is anyone within this of the aim point.
  groupRadius: 5,
  // Set up only with an enemy this far off: nearer, fight with the pistol.
  setUpBetween: [36, 84] as const,
  tooClose: 22,
  // With no target this long and orders elsewhere, pack up and move on.
  idleTicks: 25 * 30,
  reach: 35,
  retryTicks: 20,
  attempts: 6,
  // A whistling bomb landing this close sends a bot diving away.
  dodgeRadius: 6,
};

type Memory = {
  nextTry: number; tries: number; idleSince: number; nextPick: number; nextFire: number;
  spot?: Vec; walkTo?: Vec;
  target?: number; aimAt?: Vec; error: number; offset: number;
};
const memory = new WeakMap<Game, Map<number, Memory>>();
function remember(g: Game, p: Soldier): Memory {
  let list = memory.get(g);
  if (!list) memory.set(g, list = new Map());
  let m = list.get(p.id);
  if (!m) list.set(p.id, m = { nextTry: 0, tries: 0, idleSince: g.tick, nextPick: 0, nextFire: 0, error: botMortarRules.firstError, offset: 0 });
  return m;
}

const bearing = (from: Vec, to: Vec) => Math.atan2(to.x - from.x, -(to.z - from.z));

// What the tube should be laid on: an enemy a teammate is fighting, or an
// enemy machine gun, inside the band and arc, scored by how many enemies
// stand round it. Guns count double.
export function mortarTarget(g: Game, p: Soldier, from: Vec, baseYaw: number): { id: number; at: Vec } | undefined {
  const spotted = new Set<number>();
  for (const q of g.players) if (q.team === p.team && q.hp > 0 && q.target >= 0) spotted.add(q.target);
  const enemies = g.players.filter(q => q.team !== p.team && q.hp > 0 && q.tank === undefined);
  let best: { id: number; at: Vec; score: number } | undefined;
  for (const q of enemies) {
    if (!spotted.has(q.id) && q.mountedGun === undefined) continue;
    const d = dist(from, q);
    if (d < mortarRules.minRange || d > mortarRules.maxRange) continue;
    if (Math.abs(angleDelta(baseYaw, bearing(from, q))) > emplacementRules.traverse) continue;
    if (mortarTargetBlocked(g, q)) continue;
    const group = enemies.filter(r => dist(r, q) < botMortarRules.groupRadius).length;
    const score = group + (q.mountedGun !== undefined ? 2 : 0);
    if (!best || score > best.score) best = { id: q.id, at: { x: q.x, z: q.z }, score };
  }
  return best && { id: best.id, at: best.at };
}

// Any bot that hears a bomb whistling down near it throws itself clear.
export function dodgeMortar(g: Game, p: Soldier, c: Command): Command {
  if (!g.mortars.bombs.length || mountedGun(g, p) || p.tank !== undefined) return c;
  for (const bomb of g.mortars.bombs) {
    if (!bomb.whistled) continue;
    const d = dist(bomb.target, p);
    if (d >= botMortarRules.dodgeRadius) continue;
    const away = d > 0.1 ? { x: (p.x - bomb.target.x) / d, z: (p.z - bomb.target.z) / d } : { x: Math.sin(p.yaw + Math.PI / 2), z: -Math.cos(p.yaw + Math.PI / 2) };
    p.mode = "Diving clear";
    return { ...c, x: away.x, z: away.z, sprint: true, crouch: false, fire: false };
  }
  return c;
}

export function mortarBotCommand(g: Game, p: Soldier, c: Command): Command {
  if (p.hp <= 0 || g.humanPlayerIds.includes(p.id)) return c;
  c = dodgeMortar(g, p, c);
  if (p.loadout !== "mortar" || p.tank !== undefined || p.mode === "Diving clear") return c;
  if (carriedFlag(g, p) && !mountedGun(g, p)) return c;
  const m = remember(g, p);
  const own = g.emplacements.get(p.id);
  const mounted = mountedGun(g, p);
  const objective: Vec | undefined = g.sectors[p.objective];

  if (mounted?.mortar) {
    p.mode = "Laying mortar";
    if (mounted.ammo === 0) {
      // Spent: stand up and fight on with the pistol.
      return { ...c, fire: false, interact: !p.commandInteractHeld };
    }
    if (g.tick >= m.nextPick) {
      m.nextPick = g.tick + botMortarRules.retargetTicks;
      const pick = mortarTarget(g, p, mounted.at, mounted.baseYaw);
      if (pick?.id !== m.target) {
        m.target = pick?.id;
        m.error = botMortarRules.firstError;
        m.offset = g.random() * Math.PI * 2;
      }
      if (pick) m.aimAt = pick.at;
    }
    const target = g.players.find(q => q.id === m.target && q.hp > 0);
    if (!target || !m.aimAt) {
      m.target = undefined;
      const idle = g.tick - m.idleSince > botMortarRules.idleTicks;
      if (idle && mounted.owner === p.id && (!objective || dist(mounted.at, objective) > botMortarRules.reach))
        return { ...c, fire: false, interact: !p.commandInteractHeld };
      return { ...c, fire: false, yaw: mounted.yaw };
    }
    m.idleSince = g.tick;
    // Follow the target, missing by the bracket's current error.
    m.aimAt = { x: target.x, z: target.z };
    const aim = { x: m.aimAt.x + Math.cos(m.offset) * m.error, z: m.aimAt.z + Math.sin(m.offset) * m.error };
    const turn = Math.max(-emplacementRules.traverse, Math.min(emplacementRules.traverse, angleDelta(mounted.baseYaw, bearing(mounted.at, aim))));
    const yaw = mounted.baseYaw + turn;
    const range = Math.max(mortarRules.minRange, Math.min(mortarRules.maxRange, dist(mounted.at, aim)));
    const laid = Math.abs(angleDelta(mounted.yaw, yaw)) < 0.02 && Math.abs(mounted.mortar.range - range) < 0.6;
    const fire = laid && mounted.mortar.bloom < botMortarRules.settledBloom && g.tick >= m.nextFire && g.tick >= mounted.nextShot;
    if (fire) {
      m.nextFire = g.tick + botMortarRules.fireTicks;
      m.error /= 2;
      m.offset += Math.PI * (0.6 + g.random() * 0.8);
    }
    return { ...c, x: 0, z: 0, yaw, mortarRange: range, fire };
  }

  if (own?.mortar) {
    const d = Math.hypot(own.seat.x - p.x, own.seat.z - p.z);
    // A tube with no bombs left is no use: leave it.
    if (own.ammo === 0) return c;
    if (own.operator === undefined && d > 40) {
      g.emplacements.delete(p.id);
      g.emit({ type: "emplacement", actor: p.id, phase: "pack", owner: p.id });
      return c;
    }
    const idle = g.tick - m.idleSince > botMortarRules.idleTicks;
    const moveOn = idle && objective && dist(own.at, objective) > botMortarRules.reach;
    if (d < 1.6 && g.tick >= own.readyAt && own.operator === undefined) {
      Object.assign(c, { x: 0, z: 0, sprint: false });
      if (moveOn) c.packGun = true;
      else { c.interact = !p.commandInteractHeld; m.idleSince = g.tick; }
      return c;
    }
    if (!moveOn && d < 8 && own.operator === undefined) {
      c.x = (own.seat.x - p.x) / Math.max(0.1, d);
      c.z = (own.seat.z - p.z) / Math.max(0.1, d);
      c.sprint = false;
      p.mode = "To the mortar";
    }
    return c;
  }

  if (m.walkTo) {
    const d = dist(m.walkTo, p);
    if (d > 3 || p.emplacementLost) m.walkTo = undefined;
    else if (d > 0.25) {
      p.mode = "Siting mortar";
      return { ...c, x: (m.walkTo.x - p.x) / d, z: (m.walkTo.z - p.z) / d, sprint: false };
    } else m.nextTry = g.tick;
  }
  // Set the tube down once the bot holds its place with an enemy a trench
  // line ahead and none on top of it.
  const settled = !!m.walkTo || p.mode === "Firing step" || p.mode.endsWith("flag");
  let ahead: Soldier | undefined, close = false;
  for (const q of g.players) {
    if (q.team === p.team || q.hp <= 0) continue;
    const d = dist(p, q);
    if (d < botMortarRules.tooClose) close = true;
    else if (d >= botMortarRules.setUpBetween[0] && d <= botMortarRules.setUpBetween[1] && (!ahead || d < dist(p, ahead))) ahead = q;
  }
  if (!settled || !ahead || close || p.emplacementLost || g.tick < m.nextTry || p.mantle || p.hop || p.fall) return c;
  if (!m.spot || dist(m.spot, p) > 3) { m.spot = { x: p.x, z: p.z }; m.tries = 0; }
  if (m.tries >= botMortarRules.attempts) return c;
  m.nextTry = g.tick + botMortarRules.retryTicks;
  m.tries++;
  const site = gunSite(g, p, bearing(p, ahead));
  if (!site) return c;
  const d = Math.hypot(site.x - p.x, site.z - p.z);
  if (d > 0.25) {
    m.walkTo = site;
    m.nextTry = g.tick;
    m.tries--;
    p.mode = "Siting mortar";
    return { ...c, x: (site.x - p.x) / d, z: (site.z - p.z) / d, sprint: false };
  }
  m.walkTo = undefined;
  m.idleSince = g.tick;
  m.target = undefined;
  p.mode = "Setting up mortar";
  return { ...c, x: 0, z: 0, sprint: false, yaw: site.yaw, deployGun: true, fire: false };
}
