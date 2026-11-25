// Hip-fire spread. A shot from the shoulder goes where the sights point; a
// shot from the hip wanders inside a cone that narrows as the weapon comes up
// to the eye. Players and bots fire through the same rule, and a gas mask
// keeps the sights away from the eye, so a masked soldier always fires from
// the hip.
import type { Soldier } from "./simulation";
import { equippedStats } from "./weapons";
import { aimBlend } from "./weapon-handling";
import type { WeaponRole } from "./weapon-stats";

export const hipFireRules = {
  // Half-angle of the hip-fire cone in radians, by weapon role. A bolt-action
  // rifle from the hip lands anywhere within about 1.8 m of the aim point at
  // 30 m; the short carbine and the pistols are handier.
  spread: {
    rifle: 0.06,
    carbine: 0.045,
    scoped: 0.075,
    pistol: 0.03,
    machineGun: 0.05,
  } satisfies Partial<Record<WeaponRole, number>>,
  // The generic weapons outside the faction armory.
  generic: { rifle: 0.045, serviceRifle: 0.06, pistol: 0.03, machineGun: 0.05 },
  // A light machine gun walks off target while its gunner moves, raised or not.
  movingMachineGun: 0.0225,
  // Moving faster than a slow walk widens the hip cone; crouching steadies it.
  moving: 1.5,
  movingSpeed: 1,
  crouched: 0.8,
  // How far up the sights must be before a bot will squeeze the trigger.
  botReady: 0.95,
};

// A gas mask's eyepieces sit where the sights would: no aiming while one is on
// or going on.
export const maskBlocksAim = (p: Pick<Soldier, "gasMask">) => !!p.gasMask?.worn;

type Shooter = Pick<Soldier, "weapon" | "weaponId" | "aimMotion" | "command" | "vx" | "vz" | "crouched">;
function hipCone(p: Shooter) {
  const role = equippedStats(p)?.role;
  if (role && role in hipFireRules.spread) return hipFireRules.spread[role as keyof typeof hipFireRules.spread];
  return p.weapon === "flamethrower" ? 0 : hipFireRules.generic[p.weapon];
}

// Half-angle of the cone a shot fired now lands inside.
export function hipSpread(p: Shooter, tick: number) {
  const hip = 1 - Math.max(0, Math.min(1, aimBlend(p, tick)));
  const moving = Math.hypot(p.vx, p.vz) > hipFireRules.movingSpeed;
  const cone = hipCone(p) * hip * (moving ? hipFireRules.moving : 1) * (p.crouched ? hipFireRules.crouched : 1);
  return p.weapon === "machineGun" && moving ? Math.max(cone, hipFireRules.movingMachineGun) : cone;
}

// A uniform point in the cone, from two draws of the match's random stream.
export function hipFireOffset(p: Shooter, tick: number, random: () => number) {
  const spread = hipSpread(p, tick);
  if (spread <= 0) return { yaw: 0, pitch: 0 };
  const angle = random() * Math.PI * 2, radius = Math.sqrt(random()) * spread;
  return { yaw: Math.cos(angle) * radius, pitch: Math.sin(angle) * radius };
}

// Bots fire only once the sights are up, unless a mask means they never will be.
export const botSightsReady = (p: Pick<Soldier, "gasMask" | "aimMotion" | "command">, tick: number) =>
  maskBlocksAim(p) || aimBlend(p, tick) >= hipFireRules.botReady;
