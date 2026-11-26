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
    (p.weapon === "serviceRifle" ? 1.8 : 1) *
    (heavyRecoil(p) ? 2.4 : 1);
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

// How hard each weapon's kick reads on screen. Cosmetic only: the angles the
// rounds follow are weaponAim's alone. `push` (metres) and `rise` (degrees)
// move the first-person weapon, `roll` (degrees) turns the view about its own
// axis and `jolt` (metres) pushes the camera back, so neither moves the sight
// off the line the shot takes. `shoulder` scales the third-person body kick.
export interface RecoilFeel { push: number; rise: number; roll: number; jolt: number; shoulder: number; buzz: number }
export const recoilFeel: Record<string, RecoilFeel> = {
  serviceRifle: { push: 0.085, rise: 7.5, roll: 2.2, jolt: 0.022, shoulder: 1.7, buzz: 0 },
  rifle: { push: 0.06, rise: 4.5, roll: 1.2, jolt: 0.014, shoulder: 1.2, buzz: 0 },
  pistol: { push: 0.05, rise: 9, roll: 1.5, jolt: 0.008, shoulder: 0.9, buzz: 0 },
  machineGun: { push: 0.04, rise: 2.2, roll: 0.9, jolt: 0.01, shoulder: 0.85, buzz: 1 },
  // A mounted gun's sight picture: the whole gun shudders on its mount.
  emplaced: { push: 0.045, rise: 0, roll: 0.45, jolt: 0.012, shoulder: 0, buzz: 1 },
  flamethrower: { push: 0, rise: 0, roll: 0, jolt: 0, shoulder: 0, buzz: 0 },
  // The Tankgewehr's 13.2 mm round: a shove that rocks the whole body back.
  antiTankRifle: { push: 0.16, rise: 13, roll: 3.6, jolt: 0.05, shoulder: 3.2, buzz: 0 },
};
// Weapons that kick far harder than a service rifle.
export const heavyRecoil = (p: Pick<Soldier, "weapon" | "weaponId">) => p.weapon === "serviceRifle" && p.weaponId === "Tankgewehr M1918";
export const feelFor = (p: Pick<Soldier, "weapon" | "weaponId">): RecoilFeel | undefined =>
  heavyRecoil(p) ? recoilFeel.antiTankRifle : recoilFeel[p.weapon];
// A signed shake that changes every round, for buzzing automatic weapons.
export const recoilBuzz = (shots: number, salt = 0) => Math.sin(shots * 12.9898 + salt * 78.233) >= 0 ? 1 : -1;
