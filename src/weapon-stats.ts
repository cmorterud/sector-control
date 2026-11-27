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
// A tank's hull points (src/tanks.ts), and the share below which it has thrown a track.
export const tankHullPoints = 600;
export const tankImmobilizedBelow = 0.35;

// Bullets fly well below real speed (about two fifths) so moving targets need
// leading. Every weapon an infantryman carries (rifles, carbines, scoped and
// periscope rifles, light machine guns, anti-tank rifles) fires at one speed,
// so leading a target is the same skill whatever kit you picked. Pistols and
// emplaced guns keep their real differences through one scale, which puts the
// SMLE's 744 m/s at the infantry speed.
export const infantryMuzzleVelocity = 288;
export const bulletSpeedScale = infantryMuzzleVelocity / 744;

export type WeaponRole = "rifle" | "carbine" | "scoped" | "periscope" | "pistol" | "machineGun" | "emplaced" | "antiTank";
export const roleLabels: Record<WeaponRole, string> = {
  rifle: "Bolt-action rifle",
  carbine: "Bolt-action carbine",
  scoped: "Scoped rifle",
  periscope: "Periscope rifle",
  pistol: "Pistol",
  machineGun: "Light machine gun",
  emplaced: "Emplaced machine gun",
  antiTank: "Anti-tank",
};

export interface WeaponStats {
  id: string;
  name: string;
  faction: FactionId;
  // Other armies that carry the same weapon, with the same stats: the
  // Australians and New Zealanders at Gallipoli fought with British rifles.
  alsoIssuedTo?: FactionId[];
  // Shown in the Armory when the game's pick for an army is a best guess.
  approximate?: string;
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
  // Anti-tank weapons: what a round that strikes a tank's plates does. Hull
  // points come off the tank's 600; a round through the vision slits counts
  // `slit` times over. `crew` is the chance a round wounds the crewman inside
  // by `crewDamage` (splinters off the inside of the plate).
  armour?: { hull: number; slit: number; crew: number; crewDamage: number };
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
    id: "smle", name: "SMLE Mk III", faction: "british", alsoIssuedTo: ["anzac"], role: "rifle", round: ".303 British",
    historical: { muzzleVelocity: 744, rate: [15, 30], note: "Two 5-round chargers; trained riflemen fired 15+ aimed rounds a minute." },
    roundsPerMinute: 55, magazine: 10, reserve: 60, reloadSeconds: 2.2, damage: rifleDamage,
    summary: "Twice the magazine of its rivals, at the cost of a longer reload.",
  },
  {
    id: "smle-scoped", name: "Scoped SMLE", faction: "british", alsoIssuedTo: ["anzac"], role: "scoped", round: ".303 British",
    historical: { muzzleVelocity: 744, rate: [10, 15], note: "Sniper conversions with a side-mounted telescopic sight." },
    roundsPerMinute: 40, magazine: 10, reserve: 40, reloadSeconds: 2.4, damage: scopedDamage,
    summary: "Slow to cycle; any hit to the chest or head kills.",
  },
  // Gallipoli, May 1915: Lance Corporal William Beech of the 2nd Battalion
  // built the first at Anzac, an SMLE clamped in a wooden frame with a box
  // periscope, fired by a wire from a lower grip, so the shooter stayed
  // below the parapet. Hundreds were made on the beach.
  {
    id: "smle-periscope", name: "Periscope rifle", faction: "anzac", role: "periscope", round: ".303 British",
    historical: { muzzleVelocity: 744, rate: [6, 10], note: "An SMLE in a wooden frame with two mirrors, fired by a wire from a lower grip. Accurate enough to snipe from below the parapet at the Nek and Quinn's Post, where the trenches were metres apart." },
    roundsPerMinute: 30, magazine: 10, reserve: 40, reloadSeconds: 3.2, damage: rifleDamage,
    summary: "Fires over the parapet with your head below it. A slow, loose aim, and the top mirror can be shot away.",
  },
  {
    id: "webley", name: "Webley Mk VI", faction: "british", alsoIssuedTo: ["anzac"], role: "pistol", round: ".455 Webley",
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
    summary: "High ammunition capacity and a steady rate of fire.",
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
  // Gallipoli, 1915. ANZAC carries the British rifle, scoped rifle and pistol
  // (above); its machine gun was the older Maxim. The Ottoman army fought with
  // German-pattern Mausers in its own 7.65 mm calibre. Stats follow the roles,
  // so neither side is favoured: the Mauser is worked like the other
  // five-round rifles.
  {
    id: "maxim-303", name: "Maxim .303", faction: "anzac", role: "emplaced", round: ".303 British",
    historical: { muzzleVelocity: 744, note: "The AIF and NZEF landed with Maxim guns converted to .303, two to a battalion; Vickers guns replaced them from 1916. Drawn on the Vickers tripod." },
    roundsPerMinute: 600, magazine: 250, reserve: 500, reloadSeconds: 6, damage: machineGunDamage,
    summary: "Long bursts from a fixed mount. The gun keeps its ammunition when you dismount.",
  },
  {
    id: "mauser1903", name: "Mauser 1903", faction: "ottoman", role: "rifle", round: "7.65×53 mm",
    historical: { muzzleVelocity: 820, rate: [12, 15], note: "The Ottoman Model 1903, a Mauser built at Oberndorf with a five-round stripper clip; most Ottoman infantry at Gallipoli carried it." },
    roundsPerMinute: 55, magazine: 5, reserve: 60, reloadSeconds: 1.6, damage: rifleDamage,
    summary: "A quick five-round clip and a quick reload.",
  },
  {
    id: "mauser1903-scoped", name: "Scoped Mauser 1903", faction: "ottoman", role: "scoped", round: "7.65×53 mm",
    historical: { muzzleVelocity: 820, rate: [10, 12], note: "Ottoman snipers worked from the scrub above the gullies; some had telescopic sights." },
    roundsPerMinute: 40, magazine: 5, reserve: 40, reloadSeconds: 1.8, damage: scopedDamage,
    summary: "Five rounds a clip and a flat shot down the gullies.",
  },
  {
    id: "c96", name: "Mauser C96", faction: "ottoman", role: "pistol", round: "7.63×25 mm Mauser",
    approximate: "Ottoman officers carried a mix of pistols; the C96 stands in for them.",
    historical: { muzzleVelocity: 430, rate: [30, 40], note: "The \"broomhandle\" Mauser, loaded from a ten-round charger into a fixed magazine ahead of the trigger." },
    roundsPerMinute: 150, magazine: 10, reserve: 30, reloadSeconds: 1.8, damage: { head: 65, chest: 34, stomach: 30, arms: 18, legs: 20 }, falloff: pistolFalloff,
    summary: "Ten rounds and a fast bullet, but a slow charger reload.",
  },
  {
    id: "maxim-m1909", name: "Maxim M1909", faction: "ottoman", role: "emplaced", round: "7.65×53 mm",
    historical: { muzzleVelocity: 820, note: "The Ottoman export Maxim, the German MG 08 in Ottoman calibre on the same sled mount." },
    roundsPerMinute: 600, magazine: 250, reserve: 500, reloadSeconds: 6, damage: machineGunDamage,
    summary: "Long bursts from a sled mount. The gun keeps its ammunition when you dismount.",
  },
  // Support's anti-tank kit (src/anti-tank.ts), offered where tanks fight.
  {
    id: "smle-ap", name: "SMLE Mk III · AP", faction: "british", role: "antiTank", round: ".303 Mk VII.W armour-piercing",
    historical: { muzzleVelocity: 762, rate: [15, 30], note: "Steel-cored .303, approved in November 1917; proofed to put 70% of rounds through 10 mm of plate at 100 yards." },
    roundsPerMinute: 55, magazine: 10, reserve: 50, reloadSeconds: 2.2, damage: rifleDamage,
    armour: { hull: 16, slit: 1.6, crew: 0.08, crewDamage: 25 },
    summary: "A service rifle loaded with steel-cored rounds: many hits wear a tank down, and the vision slits are its weak spot.",
  },
  {
    id: "tankgewehr", name: "Tankgewehr M1918", faction: "german", role: "antiTank", round: "13.2 mm TuF",
    historical: { muzzleVelocity: 780, rate: [10, 10], note: "Single-shot Mauser anti-tank rifle, 18.5 kg on its bipod; it went through 15 mm of plate at 300 m. Gunners were taught to aim for drivers and machine gunners." },
    roundsPerMinute: 10, magazine: 1, reserve: 20, reloadSeconds: 3.2, damage: { head: 250, chest: 200, stomach: 180, arms: 110, legs: 110 },
    armour: { hull: 55, slit: 1.5, crew: 0.35, crewDamage: 40 },
    summary: "One heavy round at a time. It punches through tank plate and often wounds the crew inside.",
  },
  {
    id: "berthier-ap", name: "Berthier Mle 1916 · AP", faction: "french", role: "antiTank", round: "8 mm Lebel armour-piercing",
    historical: { muzzleVelocity: 700, rate: [12, 15], note: "French steel-cored 8 mm; the British copied its design for their .303 Mk VII.F in 1916." },
    roundsPerMinute: 55, magazine: 5, reserve: 50, reloadSeconds: 1.6, damage: rifleDamage,
    armour: { hull: 16, slit: 1.6, crew: 0.08, crewDamage: 25 },
    summary: "The service rifle with steel-cored rounds: many hits wear a tank down, and the vision slits are its weak spot.",
  },
];

export const armoryFactions: FactionId[] = ["british", "german", "french", "anzac", "ottoman"];
// Whether an army carries this weapon.
export const issuedTo = (w: Pick<WeaponStats, "faction" | "alsoIssuedTo">, faction: FactionId | undefined) =>
  w.faction === faction || (!!faction && !!w.alsoIssuedTo?.includes(faction));

export function gameMuzzleVelocity(w: WeaponStats) {
  if (w.role !== "pistol" && w.role !== "emplaced") return infantryMuzzleVelocity;
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

// Anti-tank rounds against a tank's side plates, and through its vision slits.
export function tankHits(w: WeaponStats, slit = false) {
  if (!w.armour) return undefined;
  const hull = w.armour.hull * (slit ? w.armour.slit : 1);
  return {
    immobilize: Math.ceil(tankHullPoints * (1 - tankImmobilizedBelow) / hull),
    knockOut: Math.ceil(tankHullPoints / hull),
  };
}
