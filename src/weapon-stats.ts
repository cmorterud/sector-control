// Weapon statistics by faction: the single source of truth for the Armoury
// page and, as the body-part damage and machine-gun placement work lands, for
// the game itself. Historical figures are approximate real-world values; the
// game figures are what play uses.
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

export type WeaponRole = "rifle" | "scoped" | "pistol" | "machineGun";
export const roleLabels: Record<WeaponRole, string> = {
  rifle: "Bolt-action rifle",
  scoped: "Scoped rifle",
  pistol: "Pistol",
  machineGun: "Machine gun (placed)",
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
    rate: [number, number];
    note: string;
  };
  // Rounds fired per minute in play.
  roundsPerMinute: number;
  // Rounds loaded by one reload, and carried spare.
  magazine: number;
  reserve: number;
  reloadSeconds: number;
  damage: Record<HitZone, number>;
  // Pistols lose damage past this range (metres).
  falloff?: { start: number; end: number; minimum: number };
  summary: string;
}

const rifleDamage = { head: 150, chest: 100, stomach: 65, arms: 35, legs: 40 };
const scopedDamage = { head: 150, chest: 120, stomach: 80, arms: 45, legs: 50 };
const machineGunDamage = { head: 70, chest: 38, stomach: 34, arms: 20, legs: 22 };
const pistolFalloff = { start: 25, end: 50, minimum: 0.6 };

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
    id: "vickers", name: "Vickers", faction: "british", role: "machineGun", round: ".303 British",
    historical: { muzzleVelocity: 744, rate: [450, 500], note: "Water-cooled, fed from 250-round fabric belts." },
    roundsPerMinute: 450, magazine: 250, reserve: 500, reloadSeconds: 5, damage: machineGunDamage,
    summary: "Fired only from a placement; a long belt and a slow change.",
  },
  {
    id: "gewehr98", name: "Gewehr 98", faction: "german", role: "rifle", round: "7.92×57 mm",
    historical: { muzzleVelocity: 878, rate: [12, 15], note: "Five-round stripper clip into an internal magazine." },
    roundsPerMinute: 55, magazine: 5, reserve: 60, reloadSeconds: 1.6, damage: { ...rifleDamage, stomach: 70 },
    summary: "Fastest bullet and the hardest stomach hit; five rounds a clip.",
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
    id: "mg08", name: "MG 08", faction: "german", role: "machineGun", round: "7.92×57 mm",
    historical: { muzzleVelocity: 878, rate: [450, 500], note: "Water-cooled Maxim on a sled mount, 250-round belts." },
    roundsPerMinute: 450, magazine: 250, reserve: 500, reloadSeconds: 5, damage: machineGunDamage,
    summary: "Fired only from a placement; the fastest machine-gun bullet.",
  },
  {
    id: "berthier", name: "Berthier Mle 1916", faction: "french", role: "rifle", round: "8 mm Lebel",
    historical: { muzzleVelocity: 700, rate: [12, 15], note: "Five-round en-bloc clip." },
    roundsPerMinute: 55, magazine: 5, reserve: 60, reloadSeconds: 1.6, damage: rifleDamage,
    summary: "Standard French rifle; the slowest rifle bullet.",
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
    id: "hotchkiss", name: "Hotchkiss M1914", faction: "french", role: "machineGun", round: "8 mm Lebel",
    historical: { muzzleVelocity: 725, rate: [400, 450], note: "Air-cooled, fed from 24- or 30-round rigid strips." },
    roundsPerMinute: 450, magazine: 30, reserve: 300, reloadSeconds: 2.5, damage: machineGunDamage,
    summary: "Fired only from a placement; short strips with quick changes.",
  },
];

export const armouryFactions: FactionId[] = ["british", "german", "french"];

export function gameMuzzleVelocity(w: WeaponStats) {
  return Math.round(w.historical.muzzleVelocity * bulletSpeedScale);
}
// Hits needed to kill from full health, and the time they take at full rate.
export function shotsToKill(w: WeaponStats, zone: HitZone) {
  return Math.ceil(soldierHealth / w.damage[zone]);
}
export function timeToKill(w: WeaponStats, zone: HitZone) {
  return (shotsToKill(w, zone) - 1) * 60 / w.roundsPerMinute;
}
