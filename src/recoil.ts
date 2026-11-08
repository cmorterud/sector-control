import type { Soldier } from "./simulation";

export const recoilRules = {
  pitchKick: 0.012,
  yawKick: 0.003,
  maxPitch: 0.06,
  maxYaw: 0.018,
  recovery: 5,
};

export function weaponAim(p: Soldier) {
  return {
    yaw: p.yaw + p.recoilYaw,
    pitch: Math.max(-1.1, Math.min(1.1, p.pitch + p.recoilPitch)),
  };
}

export function recoverRecoil(p: Soldier) {
  const decay = Math.exp(-recoilRules.recovery / 30);
  p.recoilPitch *= decay;
  p.recoilYaw *= decay;
  if (p.recoilPitch < 0.0001 && Math.abs(p.recoilYaw) < 0.0001) {
    p.recoilPitch = p.recoilYaw = 0;
    p.recoilShots = 0;
  }
}

export function kickRecoil(p: Soldier, tick: number) {
  const brace =
    (p.command.aim ? 0.8 : 1) *
    (p.crouched ? 0.85 : 1) *
    (p.weapon === "serviceRifle" ? 1.8 : 1);
  p.recoilPitch = Math.min(
    recoilRules.maxPitch,
    p.recoilPitch + recoilRules.pitchKick * brace,
  );
  const sideways = Math.sin(++p.recoilShots * 2.4 + p.id * 0.7);
  p.recoilYaw = Math.max(
    -recoilRules.maxYaw,
    Math.min(
      recoilRules.maxYaw,
      p.recoilYaw + sideways * recoilRules.yawKick * brace,
    ),
  );
  p.lastShotAt = tick;
}

// Short mechanical kick, separate from the persistent angular climb above.
export function recoilPulse(p: Soldier, tick: number) {
  const age = (tick - p.lastShotAt) / 30;
  return p.hp > 0 && age >= 0 ? Math.exp(-20 * age) : 0;
}
