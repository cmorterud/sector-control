import { beginWeaponChange, switchRules } from "./weapon-handling";
import type { Soldier } from "./simulation";
import { weaponProfiles, type WeaponKind } from "./weapons";
export type FactionId = "british" | "german" | "french" | "trainingBlue" | "trainingRed";
export type Loadout = "rifleman" | "marksman" | "support";
export type WeaponSlot = "primary" | "sidearm";
export interface WeaponState { kind: WeaponKind; id: string; ammo: number; reserve: number; nextShot: number; lastShotAt: number }
export const factions = {
  british: { name: "Britain", shirt: "#77745a", trousers: "#68644f", helmet: "#62644e", rifle: "SMLE Mk III", scoped: "Scoped SMLE", support: "Lewis Mk I", pistol: "Webley Mk VI" },
  german: { name: "Imperial Germany", shirt: "#66776c", trousers: "#58645d", helmet: "#4e5d53", rifle: "Gewehr 98", scoped: "Scoped Gewehr 98", support: "MG 08/15", pistol: "P08" },
  french: { name: "France", shirt: "#728d9a", trousers: "#627f8c", helmet: "#526c79", rifle: "Berthier Mle 1916", scoped: "Scoped Lebel", support: "Chauchat", pistol: "Ruby" },
  trainingBlue: { name: "Blue training", shirt: "#597f91", trousers: "#4d5853", helmet: "#586c68", rifle: "AR-01", scoped: "Scoped training rifle", support: "Training LMG", pistol: "Training pistol" },
  trainingRed: { name: "Red training", shirt: "#9f685a", trousers: "#62594b", helmet: "#796d57", rifle: "AR-01", scoped: "Scoped training rifle", support: "Training LMG", pistol: "Training pistol" },
};
export function factionFor(map: {id:string}, team: "blue"|"red"): FactionId {
  return map.id === "industrial" ? team === "blue" ? "trainingBlue" : "trainingRed" : team === "red" ? "german" : map.id === "verdun" ? "french" : "british";
}
export function rosterLoadout(index:number, size:number, kind:WeaponKind): Loadout {
  if (kind === "machineGun") return "support";
  return size >= 25 && [Math.floor(size * .1), Math.floor(size * .6)].includes(index) ? "marksman" : "rifleman";
}
export function equipLoadout(p: Soldier, loadout: Loadout, industrial = false) {
  p.loadout = loadout; p.pendingLoadout = loadout; p.equippedSlot = "primary";
  const f = factions[p.faction ?? "british"];
  const make = (kind:WeaponKind, id:string): WeaponState => ({kind,id,ammo:weaponProfiles[kind].magazine,reserve:weaponProfiles[kind].reserve,nextShot:0,lastShotAt:-1000});
  p.inventory = {
    primary: make(loadout === "support" ? "machineGun" : industrial && loadout === "rifleman" ? "rifle" : "serviceRifle", loadout === "support" ? f.support : loadout === "marksman" ? f.scoped : f.rifle),
    sidearm: make("pistol", f.pistol),
  };
  const primary = p.inventory.primary;
  p.ammo = primary.ammo; p.reserve = primary.reserve; p.nextShot = primary.nextShot; p.lastShotAt = primary.lastShotAt;
  p.weapon = primary.kind; p.weaponId = primary.id;
  p.reloadAt = 0; p.aimSince = -1; p.weaponChange=undefined; p.aimMotion=undefined;
}
export function switchWeapon(p:Soldier, slot:WeaponSlot, tick:number) {
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
