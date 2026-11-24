import { beginWeaponChange, switchRules } from "./weapon-handling";
import type { Soldier } from "./simulation";
import { weaponProfile, type WeaponKind } from "./weapons";
import { weaponStats, type WeaponRole } from "./weapon-stats";
export type FactionId = "british" | "german" | "french" | "trainingBlue" | "trainingRed";
export type Loadout = "rifleman" | "marksman" | "support" | "emplacement";
export type WeaponSlot = "primary" | "sidearm";
export interface WeaponState { kind: WeaponKind; id: string; ammo: number; reserve: number; nextShot: number; lastShotAt: number }
function factionWeapons(faction: FactionId) {
  const name = (role: WeaponRole) => weaponStats.find(w => w.faction === faction && w.role === role)!.name;
  // Only the armies that fight indoors have a carbine.
  const carbine = weaponStats.find(w => w.faction === faction && w.role === "carbine")?.name;
  return { rifle: name("rifle"), carbine, scoped: name("scoped"), support: name("machineGun"), pistol: name("pistol") };
}
export const factions = {
  british: { name: "Britain", shirt: "#77745a", trousers: "#68644f", helmet: "#62644e", ...factionWeapons("british") },
  german: { name: "Imperial Germany", shirt: "#66776c", trousers: "#58645d", helmet: "#4e5d53", ...factionWeapons("german") },
  french: { name: "France", shirt: "#728d9a", trousers: "#627f8c", helmet: "#526c79", ...factionWeapons("french") },
  trainingBlue: { name: "Blue training", shirt: "#597f91", trousers: "#4d5853", helmet: "#586c68", rifle: "AR-01", carbine: undefined, scoped: "Scoped training rifle", support: "Training LMG", pistol: "Training pistol" },
  trainingRed: { name: "Red training", shirt: "#9f685a", trousers: "#62594b", helmet: "#796d57", rifle: "AR-01", carbine: undefined, scoped: "Scoped training rifle", support: "Training LMG", pistol: "Training pistol" },
};
export function factionFor(map: {id:string}, team: "blue"|"red"): FactionId {
  return map.id === "industrial" ? team === "blue" ? "trainingBlue" : "trainingRed" : team === "red" ? "german" : map.id === "verdun" || map.id === "headland" || map.id === "fort-vaux" || map.id === "zeppelin" ? "french" : "british";
}
export function rosterLoadout(index:number, size:number, kind:WeaponKind): Loadout {
  if (kind === "machineGun") return "support";
  return size >= 25 && [Math.floor(size * .1), Math.floor(size * .6)].includes(index) ? "marksman" : "rifleman";
}
// What a map issues its riflemen: the service rifle, Industrial's semi-automatic
// trainer, or a carbine for fighting inside a fort.
export type Kit = "service" | "industrial" | "carbine";
export const kitFor = (map: { id: string; fort?: unknown; sky?: unknown }): Kit =>
  map.id === "industrial" ? "industrial" : map.fort || map.sky ? "carbine" : "service";
export const riflemanWeapon = (faction: FactionId, kit: Kit) =>
  (kit === "carbine" && factions[faction].carbine) || factions[faction].rifle;
export function equipLoadout(p: Soldier, loadout: Loadout, kit: Kit = "service") {
  const industrial = kit === "industrial";
  p.loadout = loadout; p.pendingLoadout = loadout; p.equippedSlot = "primary";
  const f = factions[p.faction ?? "british"];
  const make = (kind: WeaponKind, id: string): WeaponState => {
    const profile = weaponProfile({ weapon: kind, weaponId: id });
    return { kind, id, ammo: profile.magazine, reserve: profile.reserve, nextShot: 0, lastShotAt: -1000 };
  };
  p.inventory = {
    primary: make(loadout === "support" ? "machineGun" : industrial && loadout === "rifleman" ? "rifle" : "serviceRifle", loadout === "support" ? f.support : loadout === "marksman" ? f.scoped : riflemanWeapon(p.faction ?? "british", kit)),
    sidearm: make("pistol", f.pistol),
  };
  if (loadout === "emplacement") p.equippedSlot = "sidearm";
  const primary = p.inventory[p.equippedSlot];
  p.ammo = primary.ammo; p.reserve = primary.reserve; p.nextShot = primary.nextShot; p.lastShotAt = primary.lastShotAt;
  p.weapon = primary.kind; p.weaponId = primary.id;
  p.reloadAt = 0; p.aimSince = -1; p.weaponChange=undefined; p.aimMotion=undefined;
}
export function switchWeapon(p:Soldier, slot:WeaponSlot, tick:number) {
  if (p.loadout === "emplacement" && slot === "primary" && p.inventory?.primary.kind !== "flamethrower") return false;
  if (!p.inventory || p.equippedSlot === slot || p.hp <= 0 || p.mantle || p.melee || tick < p.throwUntil) return false;
  beginWeaponChange(p,tick);
  const old = p.inventory[p.equippedSlot ?? "primary"];
  Object.assign(old, {ammo:p.ammo,reserve:p.reserve,nextShot:p.nextShot,lastShotAt:p.lastShotAt});
  const next = p.inventory[slot];
  p.equippedSlot = slot; p.weapon = next.kind; p.weaponId = next.id;
  p.ammo = next.ammo; p.reserve = next.reserve; p.lastShotAt = next.lastShotAt;
  p.nextShot = Math.max(next.nextShot, tick + switchRules.readyTicks); p.reloadAt = 0;
  p.triggerHeld = true; p.triggerPressed = false; p.aimSince = -1;
  p.recoilPitch = p.recoilYaw = p.recoilShots = 0;
  return true;
}
export const scoped = (p: Pick<Soldier,"loadout"|"weapon"|"equippedSlot">) => p.loadout === "marksman" && p.weapon === "serviceRifle" && p.equippedSlot !== "sidearm";
