// Live balance shared by the faction loadouts, simulation and Armory.
import type { FactionId } from "./loadouts";

export type HitZone = "head" | "chest" | "stomach" | "arms" | "legs";
export const hitZones: { id: HitZone; label: string; where: string }[] = [
  { id: "head", label: "Head", where: "above the shoulders" },
  { id: "chest", label: "Chest", where: "shoulders to the lower ribs" },
  { id: "stomach", label: "Stomach", where: "lower ribs to the hips" },
  { id: "arms", label: "Arms", where: "outside the torso, shoulder to hand" },
  { id: "legs", label: "Legs", where: "below the hips" },
];
export const soldierHealth = 100;

// Bullets fly at a quarter of real speed so moving targets need leading. One
// scale for every weapon keeps their real differences: it puts the SMLE at
// the game's current 192 m/s.
export const bulletSpeedScale = 192 / 744;

export type WeaponRole = "rifle" | "carbine" | "scoped" | "pistol" | "machineGun" | "emplaced";
export const roleLabels: Record<WeaponRole, string> = {
  rifle: "Bolt-action rifle",
  carbine: "Bolt-action carbine",
  scoped: "Scoped rifle",
  pistol: "Pistol",
  machineGun: "Light machine gun",
  emplaced: "Emplaced machine gun",
};

export interface WeaponStats {
  id: string;
  name: string;
  faction: FactionId;
  role: WeaponRole;
  round: string;
  historical: {
    // Metres per second.
    muzzleVelocity: number;
    // Rounds per minute, as a range where sources differ.
    rate?: [number, number];
    note: string;
  };
  // Rounds fired per minute in play.
  roundsPerMinute: number;
  // Rounds loaded by one reload, and carried spare.
  magazine: number;
  reserve: number;
  reloadSeconds: number;
  damage: Record<HitZone, number>;
  // Pistols and carbines lose damage past this range (metres).
  falloff?: { start: number; end: number; minimum: number };
  summary: string;
}

// A rifle chest hit leaves a full-health soldier standing; the head still kills (#31).
const rifleDamage = { head: 150, chest: 85, stomach: 65, arms: 35, legs: 40 };
const scopedDamage = { head: 150, chest: 120, stomach: 80, arms: 45, legs: 50 };
const machineGunDamage = { head: 70, chest: 38, stomach: 34, arms: 20, legs: 22 };
const pistolFalloff = { start: 25, end: 50, minimum: 0.6 };
// A short barrel: full damage across any room or corridor, less across open ground.
const carbineFalloff = { start: 25, end: 60, minimum: 0.7 };
// Carbines are issued for close quarters (Fort Vaux): the same round and
// magazine as the rifle, worked faster, from a shorter weapon.
const carbineRoundsPerMinute = 70;

export const weaponStats: WeaponStats[] = [
  {
    id: "smle", name: "SMLE Mk III", faction: "british", role: "rifle", round: ".303 British",
    historical: { muzzleVelocity: 744, rate: [15, 30], note: "Two 5-round chargers; trained riflemen fired 15+ aimed rounds a minute." },
    roundsPerMinute: 55, magazine: 10, reserve: 60, reloadSeconds: 2.2, damage: rifleDamage,
    summary: "Twice the magazine of its rivals, at the cost of a longer reload.",
  },
  {
    id: "smle-scoped", name: "Scoped SMLE", faction: "british", role: "scoped", round: ".303 British",
    historical: { muzzleVelocity: 744, rate: [10, 15], note: "Sniper conversions with a side-mounted telescopic sight." },
    roundsPerMinute: 40, magazine: 10, reserve: 40, reloadSeconds: 2.4, damage: scopedDamage,
    summary: "Slow to cycle; any hit to the chest or head kills.",
  },
  {
    id: "webley", name: "Webley Mk VI", faction: "british", role: "pistol", round: ".455 Webley",
    historical: { muzzleVelocity: 190, rate: [20, 30], note: "Six-round top-break revolver." },
    roundsPerMinute: 120, magazine: 6, reserve: 24, reloadSeconds: 2.5, damage: { head: 80, chest: 45, stomach: 40, arms: 25, legs: 25 }, falloff: pistolFalloff,
    summary: "Heaviest-hitting sidearm, but slow bullets and a slow reload.",
  },
  {
    id: "lewis", name: "Lewis Mk I", faction: "british", role: "machineGun", round: ".303 British",
    historical: { muzzleVelocity: 744, note: "The game uses the .303 service rifle velocity as its reference and gives Support a 250-round supply before reloading." },
    roundsPerMinute: 450, magazine: 250, reserve: 500, reloadSeconds: 5, damage: machineGunDamage,
    summary: "High ammunition capacity with a long reload.",
  },
  {
    id: "gewehr98", name: "Gewehr 98", faction: "german", role: "rifle", round: "7.92×57 mm",
    historical: { muzzleVelocity: 878, rate: [12, 15], note: "Five-round stripper clip into an internal magazine." },
    roundsPerMinute: 55, magazine: 5, reserve: 60, reloadSeconds: 1.6, damage: { ...rifleDamage, stomach: 70 },
    summary: "Fastest bullet and the hardest stomach hit; five rounds a clip.",
  },
  {
    id: "kar98az", name: "Karabiner 98AZ", faction: "german", role: "carbine", round: "7.92×57 mm",
    historical: { muzzleVelocity: 870, rate: [12, 15], note: "Short carbine carried by pioneers and assault troops." },
    roundsPerMinute: carbineRoundsPerMinute, magazine: 5, reserve: 60, reloadSeconds: 1.6, damage: { ...rifleDamage, stomach: 70 }, falloff: carbineFalloff,
    summary: "Short and quick to work in corridors; loses damage across open ground.",
  },
  {
    id: "gewehr98-scoped", name: "Scoped Gewehr 98", faction: "german", role: "scoped", round: "7.92×57 mm",
    historical: { muzzleVelocity: 878, rate: [10, 12], note: "Selected rifles fitted with commercial telescopic sights." },
    roundsPerMinute: 40, magazine: 5, reserve: 40, reloadSeconds: 1.8, damage: scopedDamage,
    summary: "Flattest shot of the marksman rifles.",
  },
  {
    id: "p08", name: "P08 Luger", faction: "german", role: "pistol", round: "9×19 mm",
    historical: { muzzleVelocity: 350, rate: [30, 40], note: "Toggle-locked semi-automatic, eight-round magazine." },
    roundsPerMinute: 150, magazine: 8, reserve: 32, reloadSeconds: 1.5, damage: { head: 70, chest: 38, stomach: 34, arms: 20, legs: 22 }, falloff: pistolFalloff,
    summary: "Quick to fire and reload.",
  },
  {
    id: "mg08-15", name: "MG 08/15", faction: "german", role: "machineGun", round: "7.92×57 mm",
    historical: { muzzleVelocity: 878, note: "The game uses the 7.92 mm service rifle velocity as its reference." },
    roundsPerMinute: 450, magazine: 250, reserve: 500, reloadSeconds: 5, damage: machineGunDamage,
    summary: "High ammunition capacity and the fastest machine-gun projectile.",
  },
  {
    id: "berthier", name: "Berthier Mle 1916", faction: "french", role: "rifle", round: "8 mm Lebel",
    historical: { muzzleVelocity: 700, rate: [12, 15], note: "Five-round en-bloc clip." },
    roundsPerMinute: 55, magazine: 5, reserve: 60, reloadSeconds: 1.6, damage: rifleDamage,
    summary: "Standard French rifle; the slowest rifle bullet.",
  },
  {
    id: "berthier-carbine", name: "Berthier Mle 1892 M16", faction: "french", role: "carbine", round: "8 mm Lebel",
    historical: { muzzleVelocity: 637, rate: [12, 15], note: "Short carbine of the cavalry and artillery; five-round clip from 1916." },
    roundsPerMinute: carbineRoundsPerMinute, magazine: 5, reserve: 60, reloadSeconds: 1.6, damage: rifleDamage, falloff: carbineFalloff,
    summary: "Short and quick to work in corridors; loses damage across open ground.",
  },
  {
    id: "lebel-scoped", name: "Scoped Lebel", faction: "french", role: "scoped", round: "8 mm Lebel",
    historical: { muzzleVelocity: 700, rate: [8, 10], note: "Tube magazine loaded one round at a time." },
    roundsPerMinute: 40, magazine: 8, reserve: 40, reloadSeconds: 3, damage: scopedDamage,
    summary: "Eight rounds, but a slow round-by-round reload.",
  },
  {
    id: "ruby", name: "Ruby", faction: "french", role: "pistol", round: ".32 ACP",
    historical: { muzzleVelocity: 280, rate: [30, 40], note: "Compact semi-automatic, nine-round magazine." },
    roundsPerMinute: 150, magazine: 9, reserve: 36, reloadSeconds: 1.5, damage: { head: 60, chest: 32, stomach: 28, arms: 18, legs: 18 }, falloff: pistolFalloff,
    summary: "The most rounds of the sidearms, and the lightest hit.",
  },
  {
    id: "chauchat", name: "Chauchat", faction: "french", role: "machineGun", round: "8 mm Lebel",
    historical: { muzzleVelocity: 725, note: "Gameplay velocity uses the 8 mm Hotchkiss reference from the balance design." },
    roundsPerMinute: 450, magazine: 30, reserve: 300, reloadSeconds: 2.5, damage: machineGunDamage,
    summary: "Lower ammunition capacity with a quicker reload.",
  },
  {
    id: "vickers", name: "Vickers", faction: "british", role: "emplaced", round: ".303 British",
    historical: { muzzleVelocity: 744, note: "Emplacement kit for British Support." },
    roundsPerMinute: 600, magazine: 250, reserve: 500, reloadSeconds: 6, damage: machineGunDamage,
    summary: "Long bursts from a fixed mount. The gun keeps its ammunition when you dismount.",
  },
  {
    id: "mg08", name: "MG 08", faction: "german", role: "emplaced", round: "7.92×57 mm",
    historical: { muzzleVelocity: 878, note: "Emplacement kit for Imperial German Support." },
    roundsPerMinute: 600, magazine: 250, reserve: 500, reloadSeconds: 6, damage: machineGunDamage,
    summary: "High ammunition capacity with the fastest emplaced projectile.",
  },
  {
    id: "hotchkiss", name: "Hotchkiss M1914", faction: "french", role: "emplaced", round: "8 mm Lebel",
    historical: { muzzleVelocity: 725, note: "Emplacement kit for French Support." },
    roundsPerMinute: 600, magazine: 30, reserve: 300, reloadSeconds: 3.5, damage: machineGunDamage,
    summary: "Shorter bursts and a quicker reload than the other emplacements.",
  },
];

export const armoryFactions: FactionId[] = ["british", "german", "french"];

export function gameMuzzleVelocity(w: WeaponStats) {
  return Math.round(w.historical.muzzleVelocity * bulletSpeedScale);
}
export const weaponTicksPerSecond = 30;
export const shotInterval = (w: WeaponStats) => Math.round(60 * weaponTicksPerSecond / w.roundsPerMinute);
export const reloadDuration = (w: WeaponStats) => Math.round(w.reloadSeconds * weaponTicksPerSecond);
export const gameRateOfFire = (w: WeaponStats) => 60 * weaponTicksPerSecond / shotInterval(w);

export function damageAt(w: WeaponStats, zone: HitZone, distance = 0) {
  const falloff = w.falloff;
  if (!falloff || distance <= falloff.start) return w.damage[zone];
  const progress = Math.min(1, (distance - falloff.start) / (falloff.end - falloff.start));
  return w.damage[zone] * (1 - progress * (1 - falloff.minimum));
}

// Times begin with the first hit; reloads are included if the magazine runs dry.
export function shotsToKill(w: WeaponStats, zone: HitZone, distance = 0) {
  return Math.ceil(soldierHealth / damageAt(w, zone, distance));
}
export function timeToKill(w: WeaponStats, zone: HitZone, distance = 0) {
  const intervals = shotsToKill(w, zone, distance) - 1;
  const reloads = Math.floor(intervals / w.magazine);
  const ticks = intervals * shotInterval(w) + reloads * Math.max(0, 1 + reloadDuration(w) - shotInterval(w));
  return ticks / weaponTicksPerSecond;
}
