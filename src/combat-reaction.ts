import { awarenessSample } from "./awareness";
import { dist, groundHeight, walkSegment, type Vec } from "./map";
import { idle, type Command, type Game, type Soldier, type V3 } from "./simulation";
import { inLockedRing } from "./offensive";

export type ReactionKind = "nearMiss" | "hit" | "blast";
export interface CombatReaction {
  kind: ReactionKind;
  tick: number;
  strength: number;
  from: V3;
  pauseUntil: number;
  braceUntil: number;
}
export interface CombatCover {
  goal: Vec;
  from: V3;
  kind: ReactionKind;
  until: number;
  arrivedAt: number | null;
  revision: number;
}

// Physical cues only: the incoming projectile segment or an actual blast.
// No target acquisition, live enemy position lookup, or game RNG is involved.
export function reactToThreat(g: Game, p: Soldier, from: V3, kind: ReactionKind, strength: number) {
  if (p.hp <= 0 || g.tick < p.protectedUntil || strength < .18) return;
  strength = Math.min(1, strength);
  const old = p.combatReaction;
  // A hit may upgrade the same close pass; repeated bursts cannot restart the
  // animation every tick or hold a soldier in a permanent firing interruption.
  if (g.tick < (p.nextCombatReaction ?? 0) &&
    (!old || g.tick - old.tick > 6 ||
      (strength < old.strength + .25 && !(kind === "hit" && old.kind === "nearMiss")))) return;
  const jitter = Math.floor(awarenessSample(p, g.tick, 613) * 7);
  p.combatReaction = {
    kind, tick: g.tick, from: { ...from }, strength,
    pauseUntil: g.tick + 3 + Math.floor(strength * 5) + jitter % 3,
    braceUntil: g.tick + (kind === "nearMiss" ? 12 : kind === "hit" ? 17 : 22) + jitter,
  };
  p.nextCombatReaction = g.tick + 33 + (p.id % 13);
  if (p.combatCover && dist(from, p.combatCover.from) > 2) {
    p.combatCover.from = {...from};
    p.combatCover.revision = -1;
  }
  g.emit({type: "combatReaction", actor: p.id, kind, strength, from: {...from},
    pauseUntil: p.combatReaction.pauseUntil, braceUntil: p.combatReaction.braceUntil});
}

function shelter(g: Game, at: Vec, from: V3) {
  const y = groundHeight(at.x, at.z, g.map);
  if (dist(at, from) < 1) return 0;
  return ([.65, 1.2] as const).reduce((n, h) =>
    n + (g.collision.ray({...at, y: y + h}, from) < .98 ? .5 : 0), 0);
}
function finishCover(g: Game, p: Soldier) {
  if (!p.combatCover) return;
  g.emit({type: "reactionCover", actor: p.id, phase: "resume", kind: p.combatCover.kind, goal: {...p.combatCover.goal}});
  p.combatCover = null;
  p.path = [];
  p.nextThink = g.tick;
}

export function reactionCoverCommand(g: Game, p: Soldier): Command | null {
  if (g.humanPlayerIds.includes(p.id) || p.hp <= 0) return null;
  if (p.mantle || p.hop || p.fall || p.melee || g.tick < p.throwUntil) {
    finishCover(g, p);
    return null;
  }
  let cover = p.combatCover;
  const revision = g.map.destruction?.revision ?? 0;
  if (cover && (g.tick >= cover.until ||
    (cover.revision !== revision && (!walkSegment(p, cover.goal, g.map) || shelter(g, cover.goal, cover.from) < .5)))) {
    finishCover(g, p);
    cover = null;
  }
  if (cover) cover.revision = revision;
  const reaction = p.combatReaction;
  // In a locked flag's ring a soldier keeps going rather than going to ground
  // there: the flag can't change hands, and lingering in its pit reads as a
  // try for it.
  if (!cover && reaction && reaction.strength >= .35 && !inLockedRing(g, p) &&
    g.tick - reaction.tick < 30 && g.tick >= reaction.tick + 2 + p.id % 6 &&
    g.tick >= (p.nextCombatCover ?? 0)) {
    p.nextCombatCover = g.tick + 75 + p.id % 30;
    const current = shelter(g, p, reaction.from);
    if (current < 1) {
      const away = Math.atan2(p.x - reaction.from.x, p.z - reaction.from.z);
      const offsets = [0, -.8, .8, -1.6, 1.6, -2.4, 2.4, Math.PI];
      const candidates = offsets.map((angle, i) => {
        const r = i % 2 ? 1.6 : 3;
        const at = {x: p.x + Math.sin(away + angle) * r, z: p.z + Math.cos(away + angle) * r};
        const protection = shelter(g, at, reaction.from);
        const crowd = g.players.reduce((n, q) => n + (q !== p && q.hp > 0 && q.team === p.team
          ? Math.max(0, 1.4 - dist(at, q.combatCover?.goal ?? q)) : 0), 0);
        const flag = g.sectors[p.objective];
        return {at, protection, score: protection * 5 - r * .3 - crowd * 2 - (flag ? dist(at, flag) * .04 : 0)};
      }).filter(c => c.protection > current && c.protection >= .5 && !inLockedRing(g, c.at))
        .sort((a,b) => b.score - a.score);
      // Bounded local probes; no extra A* rebuild or battlefield-wide search.
      const chosen = candidates.slice(0,3).find(c => walkSegment(p, c.at, g.map));
      if (chosen) {
        cover = p.combatCover = {goal: chosen.at, from: {...reaction.from}, kind: reaction.kind,
          until: g.tick + 54, arrivedAt: null, revision};
        p.path = [];
        g.emit({type: "reactionCover", actor: p.id, phase: "move", kind: reaction.kind, goal: {...chosen.at}});
      }
    }
  }
  if (!cover) return null;
  if (dist(p, cover.goal) < .55) {
    if (cover.arrivedAt === null) {
      cover.arrivedAt = g.tick;
      cover.until = Math.min(cover.until, g.tick + 12);
      g.emit({type: "reactionCover", actor: p.id, phase: "arrived", kind: cover.kind, goal: {...cover.goal}});
    }
    return null;
  }
  const c = idle(), distance = Math.max(.6, dist(p, cover.goal));
  c.x = (cover.goal.x - p.x) / distance;
  c.z = (cover.goal.z - p.z) / distance;
  c.yaw = Math.atan2(c.x, -c.z);
  c.crouch = true;
  c.reload = p.ammo === 0 && p.reserve > 0;
  p.mode = "Moving to cover";
  return c;
}

export function braceCommand(g: Game, p: Soldier, c: Command) {
  if (g.humanPlayerIds.includes(p.id) || p.mantle || p.hop || p.fall || p.melee) return c;
  if (p.combatReaction && g.tick < p.combatReaction.braceUntil) {
    c.crouch = true;
    c.sprint = false;
    if (g.tick < p.combatReaction.pauseUntil) c.fire = false;
  }
  if (p.combatCover && p.combatCover.arrivedAt !== null) {
    c.x = c.z = 0;
    c.crouch = true;
    c.sprint = false;
    p.mode = "Braced behind cover";
  }
  return c;
}

// Cosmetic upper-body tuck/shoulder twist; collider, camera and sight ray stay
// authoritative. Both hands remain attached through the ordinary rig/IK pass.
export function combatReactionPose(p: Soldier, tick: number) {
  const r = p.combatReaction;
  if (!r) return {brace: 0, side: 0};
  const age = tick - r.tick, duration = r.kind === "blast" ? 18 : 12;
  if (age < 0 || age >= duration) return {brace: 0, side: 0};
  const brace = r.strength * Math.sin(Math.min(1, age / 3) * Math.PI / 2) * (1 - age / duration) ** 2;
  const side = Math.sin(Math.atan2(r.from.x - p.x, p.z - r.from.z) - p.yaw) >= 0 ? 1 : -1;
  return {brace, side};
}
