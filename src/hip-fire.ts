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
    // The frame is long and the shooter holds it from below.
    periscope: 0.08,
    pistol: 0.03,
    machineGun: 0.05,
    // A long, heavy rifle (or a service rifle loaded for tanks) from the hip.
    antiTank: 0.07,
  } satisfies Partial<Record<WeaponRole, number>>,
  // The generic weapons outside the faction armory.
  generic: { rifle: 0.045, serviceRifle: 0.06, pistol: 0.03, machineGun: 0.05 },
  // A light machine gun walks off target while its gunner moves, raised or not.
  movingMachineGun: 0.0225,
  // Movement scales the hip cone in proportion to ground speed: standing still
  // steadies it below its listed size, a walk (4.5 m/s) opens it half again,
  // and a sprint (7 m/s) nearly doubles it. Crouching steadies it further.
  still: 0.7,
  perSpeed: 0.8 / 4.5,
  maxMoving: 2,
  // A light machine gun counts as moving above this speed (m/s).
  movingSpeed: 1,
  crouched: 0.8,
  // How far up the sights must be before a bot will squeeze the trigger.
  botReady: 0.95,
  // A masked bot also aims worse, not just from the hip: misted glass and
  // narrow eyepieces, as the player sees them. Multiplies the scatter a bot
  // puts on each shot as it fires (not the wobble it waits out before
  // firing), so the mask costs accuracy up close, where the hip cone is
  // small, without making masked bots hold their fire.
  maskedBotAim: 3.5,
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

// How much ground speed (m/s) widens the hip cone.
export const movementSpread = (speed: number) =>
  Math.min(hipFireRules.maxMoving, hipFireRules.still + hipFireRules.perSpeed * speed);

// Half-angle of the cone a shot fired now lands inside.
export function hipSpread(p: Shooter, tick: number) {
  const hip = 1 - Math.max(0, Math.min(1, aimBlend(p, tick)));
  const speed = Math.hypot(p.vx, p.vz), moving = speed > hipFireRules.movingSpeed;
  const cone = hipCone(p) * hip * movementSpread(speed) * (p.crouched ? hipFireRules.crouched : 1);
  return p.weapon === "machineGun" && moving ? Math.max(cone, hipFireRules.movingMachineGun) : cone;
}

// A uniform point in the cone, from two draws of the match's random stream.
export function hipFireOffset(p: Shooter, tick: number, random: () => number) {
  const spread = hipSpread(p, tick);
  if (spread <= 0) return { yaw: 0, pitch: 0 };
  const angle = random() * Math.PI * 2, radius = Math.sqrt(random()) * spread;
  return { yaw: Math.cos(angle) * radius, pitch: Math.sin(angle) * radius };
}

export const maskedBotAim = (p: Pick<Soldier, "gasMask">) => maskBlocksAim(p) ? hipFireRules.maskedBotAim : 1;

// Bots fire only once the sights are up, unless a mask means they never will be.
export const botSightsReady = (p: Pick<Soldier, "gasMask" | "aimMotion" | "command">, tick: number) =>
  maskBlocksAim(p) || aimBlend(p, tick) >= hipFireRules.botReady;
