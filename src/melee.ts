import type { Command, Game, Soldier } from "./simulation";
import { eyeHeightOf, hitHeights } from "./crouch";
import { angleDelta, turnToward } from "./awareness";

export type MeleeKind = "bayonet" | "charge" | "butt";
export interface MeleeAttack {
  kind: MeleeKind;
  startTick: number;
  strikeTick: number;
  endTick: number;
  yaw: number;
  struck: boolean;
  sweepFrom?: { x: number; y: number; z: number };
}
export const meleeRules = {
  bayonet: { reach: 1.8, damage: 65, windup: 7, duration: 24, rest: 8 },
  charge: { reach: 1.9, damage: 100, windup: 12, duration: 42, rest: 18 },
  butt: { reach: 1.25, damage: 45, windup: 8, duration: 27, rest: 9 },
  halfAngle: 0.48,
  staggerTicks: 9,
};
const location = (p: Soldier) => ({
  x: p.x,
  y: p.y + eyeHeightOf(p) - 0.3,
  z: p.z,
});
export const meleeReady = (g: Game, p: Soldier) =>
  p.hp > 0 &&
  !p.melee &&
  !p.mantle &&
  !p.hop &&
  !p.fall &&
  !p.reloadAt &&
  g.tick >= p.throwUntil &&
  g.tick >= p.nextMelee &&
  g.tick >= p.staggerUntil;

export function startMelee(g: Game, p: Soldier, c: Command) {
  if (!meleeReady(g, p)) return;
  const forward = c.x * Math.sin(c.yaw) - c.z * Math.cos(c.yaw);
  const kind: MeleeKind =
    p.weapon !== "serviceRifle"
      ? "butt"
      : c.sprint &&
          !c.aim &&
          !p.crouched &&
          forward > 0.65 &&
          Math.hypot(p.vx, p.vz) >= 5.5
        ? "charge"
        : "bayonet";
  const rule = meleeRules[kind];
  p.melee = {
    kind,
    startTick: g.tick,
    strikeTick: g.tick + rule.windup,
    endTick:
      kind === "charge" ? Number.MAX_SAFE_INTEGER : g.tick + rule.duration,
    yaw: p.yaw,
    struck: false,
  };
  p.nextMelee = g.tick + rule.duration + rule.rest;
  p.protectedUntil = 0;
  p.mode = kind === "charge" ? "Bayonet charge" : "Melee";
  g.emit({
    type: "melee",
    phase: "start",
    actor: p.id,
    kind,
    target: null,
    at: location(p),
  });
}

export function cancelMelee(g: Game, p: Soldier) {
  if (!p.melee) return;
  g.emit({
    type: "melee",
    phase: "cancel",
    actor: p.id,
    kind: p.melee.kind,
    target: null,
    at: location(p),
  });
  if (p.melee.kind === "charge")
    p.nextMelee = Math.max(
      g.tick + meleeRules.charge.rest,
      p.nextMelee > g.tick ? p.nextMelee : 0,
    );
  p.melee = null;
}

// These limits affect real movement and aim; charge movement still uses world collision.
export function meleeMovement(g: Game, p: Soldier, c: Command) {
  const a = p.melee;
  if (!a) return undefined;
  const forwardIntent = c.x * Math.sin(c.yaw) - c.z * Math.cos(c.yaw);
  a.yaw = turnToward(a.yaw, c.yaw, a.kind === "charge" ? 0.03 : 0.1);
  c.yaw = a.yaw;
  c.pitch = Math.max(-0.3, Math.min(0.3, c.pitch));
  c.fire = c.reload = c.grenade = c.smoke = c.mantle = c.aim = false;
  c.crouch = p.crouched;
  if (a.kind === "charge" && !a.struck) {
    if (!c.sprint || forwardIntent < 0.65) {
      cancelMelee(g, p);
      return 1.4;
    }
    a.sweepFrom = location(p);
    c.x = Math.sin(a.yaw);
    c.z = -Math.cos(a.yaw);
    return 6.8;
  }
  return a.kind === "charge" ? 1.4 : 2.5;
}

function contact(g: Game, p: Soldier, from = location(p)) {
  const a = p.melee!,
    reach = meleeRules[a.kind].reach;
  // Nearest body in the thrust cone wins; allies and protected lives block it too.
  return g.players
    .filter((q) => {
      if (q === p || q.hp <= 0) return false;
      const d = Math.hypot(q.x - from.x, q.z - from.z);
      if (
        d > reach ||
        Math.abs(angleDelta(a.yaw, Math.atan2(q.x - from.x, from.z - q.z))) >
          meleeRules.halfAngle
      )
        return false;
      return hitHeights(q).some((h) => {
        const to = { x: q.x, y: q.y + h, z: q.z };
        return (
          Math.abs(to.y - from.y) < 0.6 &&
          Math.hypot(d, to.y - from.y) <= reach &&
          g.collision.ray(from, to) > 0.99
        );
      });
    })
    .sort(
      (a, b) =>
        Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z),
    )[0];
}

export function advanceMelee(
  g: Game,
  damage: (
    target: Soldier,
    amount: number,
    source: number,
    team: Soldier["team"],
    kind?: MeleeAttack["kind"],
  ) => void,
) {
  const strikes: { p: Soldier; a: MeleeAttack; target?: Soldier }[] = [];
  for (const p of g.players) {
    const a = p.melee;
    if (!a) continue;
    if (p.hp <= 0 || p.mantle || p.hop || p.fall) {
      cancelMelee(g, p);
      continue;
    }
    if (!a.struck && g.tick >= a.strikeTick) {
      const target =
        contact(g, p) ??
        (a.kind === "charge" && a.sweepFrom
          ? contact(g, p, a.sweepFrom)
          : undefined);
      if (a.kind !== "charge" || target) {
        a.struck = true;
        if (a.kind === "charge") {
          a.strikeTick = g.tick;
          a.endTick =
            g.tick + meleeRules.charge.duration - meleeRules.charge.windup;
          p.nextMelee = a.endTick + meleeRules.charge.rest;
        }
        strikes.push({ p, a, target });
      }
    }
    if (
      a.kind === "charge" &&
      !a.struck &&
      a.sweepFrom &&
      g.tick > a.startTick &&
      (p.x - a.sweepFrom.x) * Math.sin(a.yaw) -
        (p.z - a.sweepFrom.z) * Math.cos(a.yaw) <
        0.01
    ) {
      cancelMelee(g, p);
      continue;
    }
    if (g.tick >= a.endTick) {
      g.emit({
        type: "melee",
        phase: "end",
        actor: p.id,
        kind: a.kind,
        target: null,
        at: location(p),
      });
      p.melee = null;
    }
  }
  // Resolve contacts together so simultaneous, already-landed blows can trade.
  for (const { p, a, target } of strikes) {
    const amount =
      target &&
      target.hp > 0 &&
      target.team !== p.team &&
      g.tick >= target.protectedUntil
        ? meleeRules[a.kind].damage
        : 0;
    if (amount && target) {
      cancelMelee(g, target);
      target.staggerAt = g.tick;
      target.staggerUntil = g.tick + meleeRules.staggerTicks;
      damage(target, amount, p.id, p.team, a.kind);
    }
    g.emit({
      type: "melee",
      phase: "strike",
      actor: p.id,
      kind: a.kind,
      target: target?.id ?? null,
      damage: amount,
      killed: !!amount && target!.hp <= 0,
      at: target ? location(target) : location(p),
    });
  }
}

export function botMeleeIntent(
  g: Game,
  p: Soldier,
  target: Soldier | undefined,
  c: Command,
) {
  const d = target ? Math.hypot(target.x - p.x, target.z - p.z) : Infinity;
  if (
    !target ||
    d > 2.5 ||
    !p.awareness.visible ||
    g.tick - p.awareness.seenAt > 10 ||
    Math.abs(target.y - p.y) > 0.7
  ) {
    p.meleeThreat = null;
    return false;
  }
  if (
    !p.meleeThreat ||
    p.meleeThreat.target !== target.id ||
    g.tick - p.meleeThreat.lastTick > 2
  )
    p.meleeThreat = { target: target.id, since: g.tick, lastTick: g.tick };
  p.meleeThreat.lastTick = g.tick;
  const yaw = Math.atan2(target.x - p.x, p.z - target.z);
  c.yaw = turnToward(p.yaw, yaw, 0.075);
  c.pitch = 0;
  c.fire = c.reload = c.grenade = c.smoke = c.mantle = c.aim = c.sprint = false;
  const reach =
    meleeRules[p.weapon === "serviceRifle" ? "bayonet" : "butt"].reach;
  c.x = d > reach - 0.15 ? Math.sin(c.yaw) * 0.65 : 0;
  c.z = d > reach - 0.15 ? -Math.cos(c.yaw) * 0.65 : 0;
  c.melee =
    g.tick - p.meleeThreat.since >= 18 + (p.id % 13) &&
    g.tick - p.spottedAt >= Math.max(18, g.botSettings.reactionTicks) &&
    Math.abs(angleDelta(c.yaw, yaw)) < 0.25 &&
    d <= reach &&
    meleeReady(g, p);
  p.mode = "Close combat";
  return true;
}

// A shared pose curve drives the rifle thrust and the real-rig regression checks.
export function meleePose(a: MeleeAttack, tick: number) {
  const age = tick - a.startTick,
    hit = a.strikeTick - a.startTick,
    end = a.endTick - a.startTick;
  const ease = (v: number) => {
    v = Math.max(0, Math.min(1, v));
    return v * v * (3 - 2 * v);
  };
  if (a.kind === "charge" && !a.struck) {
    const ready = ease(age / 6);
    return { ready, thrust: ready * 0.2, lean: ready * 10 };
  }
  const thrust = ease((age - (hit - 4)) / 4) * (1 - ease((age - hit) / 7));
  const ready =
    ease(age / 3) * (1 - ease((age - hit) / Math.max(1, end - hit)));
  return {
    thrust,
    ready,
    lean: a.kind === "charge" ? ready * 10 + thrust * 7 : thrust * 9,
  };
}
