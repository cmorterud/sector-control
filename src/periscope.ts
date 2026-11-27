import { eyeHeightOf } from "./crouch";
import { raySphere, type Game, type Soldier, type V3 } from "./simulation";

// The periscope rifle (Gallipoli, ANZAC's "periscope" loadout): an SMLE
// clamped in a wooden frame above a box periscope, fired by a wire from a
// lower grip. Aimed, it lifts the sights and the muzzle above the shooter's
// head, so a man on the trench floor fires over the parapet with his head
// below it. Only the top of the frame shows: its mirror. A round through
// the mirror smashes it, and the rifle aims like any other until the next
// life. Human players only; bots do not carry it.
export const periscopeRules = {
  // How far the sights rise above the eye at full lift, in metres: enough
  // to clear a 2.4 m parapet from the trench floor (src/weapon-design.ts
  // draws the frame this deep).
  lift: 0.9,
  // Ticks to raise or lower the frame.
  raiseTicks: 12,
  // The mirror's size as a target, and how far above the sights it sits.
  mirrorRadius: 0.13,
  mirrorAbove: 0.08,
  // A loose aim: the shooter lays the rifle from a mirror image.
  spread: 0.007,
  // The view through the mirror, in degrees (no magnification).
  fov: 55,
};
export const periscopeWeapon = "Periscope rifle";

export interface PeriscopeState {
  // Metres the sights stand above the eye now.
  lift: number;
  broken: boolean;
}

export const carriesPeriscope = (p: Pick<Soldier, "loadout" | "weapon" | "weaponId" | "equippedSlot">) =>
  p.loadout === "periscope" && p.weapon === "serviceRifle" && p.weaponId === periscopeWeapon && p.equippedSlot !== "sidearm";

export const periscopeLift = (p: Pick<Soldier, "periscope">) => p.periscope?.lift ?? 0;
// Raised far enough to see and shoot over a parapet with.
export const periscopeRaised = (p: Pick<Soldier, "periscope">) => periscopeLift(p) > periscopeRules.lift * 0.5;

// The point the sights and muzzle sweep from: the eye, lifted.
export const periscopeEye = (p: Soldier): V3 => ({ x: p.x, y: p.y + eyeHeightOf(p) + periscopeLift(p), z: p.z });
export const mirrorPoint = (p: Soldier): V3 => ({ x: p.x, y: p.y + eyeHeightOf(p) + periscopeLift(p) + periscopeRules.mirrorAbove, z: p.z });

// Once a tick: raise the frame while aiming with it, lower it otherwise. It
// stops under a roof (Lone Pine's head cover) rather than rising through it.
export function advancePeriscope(g: Game, p: Soldier) {
  if (!carriesPeriscope(p)) {
    if (p.periscope) p.periscope.lift = 0;
    return;
  }
  const state = (p.periscope ??= { lift: 0, broken: false });
  const up = p.hp > 0 && !!p.command.aim && !state.broken && !p.reloadAt && !p.mantle && !p.melee && !p.hop && !p.fall && g.tick >= p.throwUntil;
  let target = up ? periscopeRules.lift : 0;
  if (target) {
    const eye = { x: p.x, y: p.y + eyeHeightOf(p), z: p.z };
    const clear = g.collision.ray(eye, { ...eye, y: eye.y + target + periscopeRules.mirrorAbove + 0.05 });
    if (clear < 1) target = Math.max(0, (target + periscopeRules.mirrorAbove + 0.05) * clear - periscopeRules.mirrorAbove - 0.1);
  }
  const step = periscopeRules.lift / periscopeRules.raiseTicks;
  state.lift = state.lift < target ? Math.min(target, state.lift + step) : Math.max(target, state.lift - step);
  if (Math.abs(state.lift - target) < 1e-6) state.lift = target;
}

// The raised mirror a round's path crosses first, if any, as a fraction of
// the path; `nearest` is what it must beat.
export function mirrorOnPath(players: Soldier[], from: V3, to: V3, actor: number, nearest: number) {
  let hit: { t: number; owner: Soldier } | undefined;
  for (const q of players) {
    if (q.id === actor || q.hp <= 0 || !q.periscope || q.periscope.broken || q.periscope.lift <= 0.05) continue;
    const t = raySphere(from, to, mirrorPoint(q), periscopeRules.mirrorRadius);
    if (t < (hit?.t ?? nearest)) hit = { t, owner: q };
  }
  return hit;
}

export function breakMirror(g: Game, owner: Soldier, actor: number) {
  if (!owner.periscope || owner.periscope.broken) return;
  const at = mirrorPoint(owner);
  owner.periscope.broken = true;
  owner.periscope.lift = 0;
  g.emit({ type: "periscope", phase: "broken", owner: owner.id, actor, at });
}
