// Barrel heat. Every shot warms the barrel and it cools all the time; the
// renderer turns heat into glow, haze and steam. Only machine guns can fire
// fast enough to overheat: at full heat the gun stops firing until the
// barrel has cooled to `resumeAt`, venting faster while it does.
import type { WeaponKind } from "./weapons";

export const heatRules = {
  // Heat lost per second, as a fraction of full heat.
  cooling: 0.1,
  // Cooling while an overheated gun vents, so the lockout lasts about 3.7 s.
  ventCooling: 0.15,
  // An overheated gun fires again once it has cooled to this.
  resumeAt: 0.45,
  // Heat at which the renderer starts to show the barrel glowing.
  glowFrom: 0.35,
  // Heat added by one round. A mounted gun (a round every 3 ticks) overheats
  // after about 9 s of unbroken fire, a light machine gun (every 4 ticks)
  // after about 11 s; rifles and pistols warm up for the look of it but never seize.
  perShot: { emplaced: 0.0211, machineGun: 0.0255, serviceRifle: 0.03, rifle: 0.02, pistol: 0.015, flamethrower: 0 },
};
export const ticksPerSecond = 30;

export interface BarrelHeat {
  heat: number;
  // Set while an overheated barrel vents; the gun cannot fire.
  overheated: boolean;
}

export type HeatSource = WeaponKind | "emplaced";

export const canOverheat = (source: HeatSource) => source === "machineGun" || source === "emplaced";

// Warm the barrel by one round; returns true on the round that overheats it.
export function addShotHeat(barrel: BarrelHeat, source: HeatSource) {
  barrel.heat = Math.min(1, barrel.heat + heatRules.perShot[source]);
  if (barrel.heat >= 1 && canOverheat(source) && !barrel.overheated) {
    barrel.overheated = true;
    return true;
  }
  return false;
}

// One simulation tick of cooling.
export function coolBarrel(barrel: BarrelHeat) {
  if (barrel.heat <= 0) return;
  const rate = barrel.overheated ? heatRules.ventCooling : heatRules.cooling;
  barrel.heat = Math.max(0, barrel.heat - rate / ticksPerSecond);
  if (barrel.overheated && barrel.heat <= heatRules.resumeAt) barrel.overheated = false;
}

export const barrelReady = (barrel: BarrelHeat) => !barrel.overheated;

// Seconds left before an overheated barrel fires again.
export function ventSeconds(barrel: BarrelHeat) {
  return barrel.overheated ? Math.max(0, barrel.heat - heatRules.resumeAt) / heatRules.ventCooling : 0;
}

// Bots let off the trigger before the barrel seizes.
export const botHoldsFire = (barrel: BarrelHeat) => barrel.overheated || barrel.heat > 0.86;
