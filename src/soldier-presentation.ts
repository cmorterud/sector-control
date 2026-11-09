import { weaponProfiles } from "./weapons";
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
  p: Pick<Soldier, "reloadAt" | "weapon">,
  tick: number,
) {
  if (!p.reloadAt || tick >= p.reloadAt) return null;
  const progress = clamp(
    1 - (p.reloadAt - tick) / weaponProfiles[p.weapon].reloadTicks,
  );
  const lower = ease(progress / 0.16) * (1 - ease((progress - 0.78) / 0.22));
  return {
    progress,
    lower,
    carrying:
      p.weapon === "serviceRifle"
        ? progress >= 0.28 && progress < 0.68
        : progress >= 0.25 && progress < 0.64,
    removed: p.weapon !== "serviceRifle" && progress >= 0.2 && progress < 0.69,
  };
}
