import { beginWeaponChange, switchRules } from "./weapon-handling";
import type { Soldier } from "./simulation";
import { weaponProfile, type WeaponKind } from "./weapons";
import { weaponStats, type WeaponRole } from "./weapon-stats";
export type FactionId = "british" | "german" | "french" | "trainingBlue" | "trainingRed";
export type Loadout = "rifleman" | "marksman" | "support" | "emplacement" | "antiTank" | "mortar";
export const loadoutIds: Loadout[] = ["rifleman", "marksman", "support", "emplacement", "antiTank", "mortar"];
export type WeaponSlot = "primary" | "sidearm";
export interface WeaponState { kind: WeaponKind; id: string; ammo: number; reserve: number; nextShot: number; lastShotAt: number }
function factionWeapons(faction: FactionId) {
  const name = (role: WeaponRole) => weaponStats.find(w => w.faction === faction && w.role === role)!.name;
  // Only the armies that fight indoors have a carbine.
  const carbine = weaponStats.find(w => w.faction === faction && w.role === "carbine")?.name;
  return { rifle: name("rifle"), carbine, scoped: name("scoped"), support: name("machineGun"), antiTank: name("antiTank"), pistol: name("pistol") };
}
export const factions = {
  british: { name: "Britain", shirt: "#77745a", trousers: "#68644f", helmet: "#62644e", ...factionWeapons("british") },
  german: { name: "Imperial Germany", shirt: "#66776c", trousers: "#58645d", helmet: "#4e5d53", ...factionWeapons("german") },
  french: { name: "France", shirt: "#728d9a", trousers: "#627f8c", helmet: "#526c79", ...factionWeapons("french") },
  trainingBlue: { name: "Blue training", shirt: "#597f91", trousers: "#4d5853", helmet: "#586c68", rifle: "AR-01", carbine: undefined, scoped: "Scoped training rifle", support: "Training LMG", antiTank: undefined, pistol: "Training pistol" },
  trainingRed: { name: "Red training", shirt: "#9f685a", trousers: "#62594b", helmet: "#796d57", rifle: "AR-01", carbine: undefined, scoped: "Scoped training rifle", support: "Training LMG", antiTank: undefined, pistol: "Training pistol" },
};
export function factionFor(map: {id:string}, team: "blue"|"red"): FactionId {
  return map.id === "industrial" ? team === "blue" ? "trainingBlue" : "trainingRed" : team === "red" ? "german" : map.id === "verdun" || map.id === "headland" || map.id === "fort-vaux" || map.id === "zeppelin" ? "french" : "british";
}
// How a side's bots split across the roles. Most carry the plain service
// rifle; the rest are spread through the roster so every squad has a mix:
// light machine gunners (the roster's machine-gun slots, src/weapons.ts
// rosterWeapon), gunners who set up an emplaced gun, marksmen with scoped
// rifles, and, where tanks fight, the anti-tank kit.
export const rosterShares = { emplacement: 0.06, marksman: 0.06, antiTank: 0.06 };
const rosterCache = new Map<string, Loadout[]>();
export function rosterRoles(size: number, tanks = false): Loadout[] {
  const key = `${size}:${tanks}`;
  const cached = rosterCache.get(key);
  if (cached) return cached;
  const roles: Loadout[] = Array.from({ length: size }, () => "rifleman");
  const gunners = Math.floor(size / 12);
  for (let i = 0; i < gunners; i++) roles[Math.floor(((i + 0.5) * size) / gunners)] = "support";
  const count = (share: number, from: number) => size >= from ? Math.max(1, Math.round(size * share)) : 0;
  const spread: [Loadout, number, number][] = [
    ["marksman", count(rosterShares.marksman, 12), 0.2],
    ["emplacement", count(rosterShares.emplacement, 10), 0.7],
    ["antiTank", tanks ? count(rosterShares.antiTank, 8) : 0, 0.45],
  ];
  for (const [role, n, phase] of spread)
    for (let i = 0; i < n; i++) {
      // Slot 0 is the player's on the blue side; step past taken slots.
      let at = Math.max(1, Math.floor(((i + phase) * size) / n));
      for (let tries = 0; roles[at] !== "rifleman" && tries < size; tries++) at = 1 + (at % (size - 1));
      if (roles[at] === "rifleman") roles[at] = role;
    }
  rosterCache.set(key, roles);
  return roles;
}
export function rosterLoadout(index:number, size:number, kind:WeaponKind, tanks = false): Loadout {
  if (kind === "machineGun") return "support";
  const role = rosterRoles(size, tanks)[index] ?? "rifleman";
  // A machine-gun slot without the gun (a human's, say) carries a rifle.
  return role === "support" ? "rifleman" : role;
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
  const antiTank = loadout === "antiTank" ? f.antiTank : undefined;
  p.inventory = {
    primary: make(loadout === "support" ? "machineGun" : industrial && loadout === "rifleman" ? "rifle" : "serviceRifle", loadout === "support" ? f.support : loadout === "marksman" ? f.scoped : antiTank ?? riflemanWeapon(p.faction ?? "british", kit)),
    sidearm: make("pistol", f.pistol),
  };
  // The set-up kits leave only the pistol in hand.
  if (loadout === "emplacement" || loadout === "mortar") p.equippedSlot = "sidearm";
  const primary = p.inventory[p.equippedSlot];
  p.ammo = primary.ammo; p.reserve = primary.reserve; p.nextShot = primary.nextShot; p.lastShotAt = primary.lastShotAt;
  p.weapon = primary.kind; p.weaponId = primary.id;
  p.reloadAt = 0; p.aimSince = -1; p.weaponChange=undefined; p.aimMotion=undefined;
}
export function switchWeapon(p:Soldier, slot:WeaponSlot, tick:number) {
  if ((p.loadout === "emplacement" || p.loadout === "mortar") && slot === "primary" && p.inventory?.primary.kind !== "flamethrower") return false;
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
