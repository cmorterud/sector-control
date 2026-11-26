import { weaponDesign } from "./weapon-design";
import { weaponProfile } from "./weapons";
import type { Soldier } from "./simulation";
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => {
  v = clamp(v);
  return v * v * (3 - 2 * v);
};
// Presentation only: the active, unspent charge raises the rifle. Sway follows
// actual travel phase, so pausing or pushing into cover cannot create fake steps.
export function chargePresentation(p: Soldier, tick: number, phase: number, motion: number) {
  const charge = p.hp > 0 && p.melee?.kind === "charge" && !p.melee.struck
    ? p.melee : null;
  const ready = charge ? ease((tick - charge.startTick) / 6) : 0;
  const moving = ready * clamp(motion);
  return {
    ready,
    side: Math.sin(phase) * moving,
    bob: Math.sin(phase * 2) * moving,
  };
}

export const casualtyRules = {
  lifetime: 20,
  max: 24,
  range: 70,
};
export function soldierStyle(id: number) {
  const sample = (salt: number) => {
    const n = Math.sin((id + 1) * 127.1 + salt * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  return {
    cadence: 0.94 + sample(1) * 0.12,
    sway: 0.8 + sample(2) * 0.4,
    phase: sample(3) * Math.PI * 2,
    side: sample(4) > 0.5 ? 1 : -1,
  };
}
export function reloadMotion(
  p: Pick<Soldier, "reloadAt" | "weapon" | "weaponId">,
  tick: number,
) {
  if (!p.reloadAt || tick >= p.reloadAt) return null;
  const progress = clamp(
    1 - (p.reloadAt - tick) / weaponProfile(p).reloadTicks,
  );
  const lower = ease(progress / 0.16) * (1 - ease((progress - 0.78) / 0.22));
  const style=weaponDesign(p)?.reload;
  return {
    progress,
    lower,
    carrying: style === "tube" || style === "revolver" ? progress>=.23 && progress<.76 && ((progress-.23)*8%1)>.25 :
      p.weapon === "serviceRifle"
        ? progress >= 0.28 && progress < 0.68
        : progress >= 0.25 && progress < 0.64,
    removed: style !== "revolver" && p.weapon !== "serviceRifle" && progress >= 0.2 && progress < 0.69,
  };
}

// A human throw has a six-tick wind-up; the world grenade appears at release.
export function throwPresentation(p: Soldier, tick: number) {
  if (p.hp <= 0 || tick >= p.throwUntil) return null;
  const action = p.throwAction;
  if (action && !action.released) {
    const t = clamp((tick - action.startTick) / (action.releaseTick - action.startTick));
    const reach = ease((t - 0.3) / 0.7);
    return {
      held: true, weight: ease(t / 0.25), lower: ease(t / 0.3),
      hand: { x: 0.3 - reach * 0.14, y: -0.14 + reach * 0.22, z: -0.18 - reach * 0.14 },
    };
  }
  const t = clamp(1 - (p.throwUntil - tick) / 15);
  const recovery = ease((t - 0.35) / 0.65);
  return {
    held: false, weight: 1 - recovery, lower: 1 - recovery,
    hand: { x: 0.16, y: -0.14 + (action ? Math.sin((1 - t) * Math.PI / 2) * 0.26 : -ease(t) * 0.28), z: -0.5 + ease(t) * 0.2 },
  };
}

// Third-person throw: the whole upper body winds up and comes through, not
// only the arm. Humans wind up for six ticks before the grenade leaves the
// hand; bots throw at once, so they start from the cocked pose and come
// straight through. Angles in degrees; `held` shows the grenade in the hand.
export function throwBody(p: Soldier, tick: number) {
  if (p.hp <= 0 || tick >= p.throwUntil) return null;
  const action = p.throwAction;
  const cocked = { twist: -35, lean: 6, shoulder: 205, elbow: 100 };
  if (action && !action.released) {
    const w = ease((tick - action.startTick) / Math.max(1, action.releaseTick - action.startTick));
    return {
      held: true, weight: ease(w * 3),
      twist: cocked.twist * w, lean: cocked.lean * w,
      shoulder: 65 + (cocked.shoulder - 65) * w, elbow: cocked.elbow * w,
    };
  }
  const t = clamp(1 - (p.throwUntil - tick) / 15);
  const arc = ease(t / 0.35), settle = ease((t - 0.35) / 0.65);
  return {
    held: false, weight: 1 - settle,
    twist: cocked.twist + (25 - cocked.twist) * arc - 25 * settle,
    lean: cocked.lean + (-12 - cocked.lean) * arc + 12 * settle,
    shoulder: cocked.shoulder + (25 - cocked.shoulder) * arc + 40 * settle,
    elbow: cocked.elbow * (1 - arc) + 25 * settle,
  };
}

// The first moments after death, before the ragdoll takes over: knees give,
// the body drops and twists away from the hit. `hit` is the killing round's
// direction in the soldier's own space (+z is backwards). Past `fallTicks`
// a soldier too far away for a ragdoll keeps going down until it lies flat.
export const deathFallRules = { fallTicks: 16, lieTicks: 14 };
export function deathFall(age: number, hit: { x: number; z: number }) {
  const t = clamp(age / deathFallRules.fallTicks), b = ease(t);
  const lie = ease((age - deathFallRules.fallTicks) / deathFallRules.lieTicks);
  const length = Math.hypot(hit.x, hit.z);
  // No known shooter: slump forward.
  const back = length > .1 ? hit.z / length : -.6, side = length > .1 ? hit.x / length : 0;
  const pitchSign = back >= 0 ? 1 : -1;
  return {
    fallen: t >= 1, lying: lie >= 1,
    drop: .42 * b + .3 * lie,
    pitch: pitchSign * (10 + 25 * Math.abs(back)) * b + pitchSign * 50 * lie,
    roll: -side * 18 * b,
    twist: side * 22 * b,
    slump: -14 * b * (1 - lie),
    hip: 55 * b * (1 - lie) + 15 * lie,
    knee: -100 * b * (1 - lie) - 20 * lie,
    ankle: 45 * b * (1 - lie),
    arm: b,
  };
}
