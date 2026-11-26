import { angleDelta } from "./awareness";
import { bodyBlocked, supportHeight } from "./map";
import { viewDirection } from "./player-view";
import type { Command, Game, Soldier, Team, V3 } from "./simulation";
import { weaponStats } from "./weapon-stats";
import { weaponProfile } from "./weapons";
import { coolBarrel, type BarrelHeat } from "./weapon-heat";

export const emplacementRules = {
  setupTicks: 45,
  durability: 130,
  traverse: Math.PI / 4,
  pitchMin: -0.23,
  pitchMax: 0.33,
  pivotHeight: 1.02,
  sightHeight: 0.11,
  barrelLength: 0.88,
  operatorOffset: 0.8,
};

type GunSupply = { ammo: number; reserve: number };
export type EmplacementPose = { at: V3; seat: V3; baseYaw: number };
export interface Emplacement extends EmplacementPose, GunSupply {
  owner: number;
  team: Team;
  weaponId: string;
  hp: number;
  readyAt: number;
  operator?: number;
  yaw: number;
  pitch: number;
  nextShot: number;
  reloadAt: number;
  lastShotAt: number;
  barrel: BarrelHeat;
}
export type Placement = EmplacementPose & { valid: boolean; reason?: string };

const offset = (origin: V3, yaw: number, forward: number, side = 0, up = 0): V3 => ({
  x: origin.x + Math.sin(yaw) * forward + Math.cos(yaw) * side,
  y: origin.y + up,
  z: origin.z - Math.cos(yaw) * forward + Math.sin(yaw) * side,
});

export function emplacementWeapon(p: Pick<Soldier, "faction">) {
  return weaponStats.find(w => w.role === "emplaced" && w.faction === p.faction)?.name ??
    weaponStats.find(w => w.id === "vickers")!.name;
}

export function mountedGun(g: Game, p: Soldier) {
  return p.mountedGun === undefined ? undefined : g.emplacements.get(p.mountedGun);
}

function footprintClear(g: Game, point: V3, radius: number, height: number) {
  if (bodyBlocked(point.x, point.z, point.y, radius, g.map, height)) return false;
  return [[0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius]].every(([dx, dz]) =>
    Math.abs(supportHeight(point.x + dx, point.z + dz, g.map, point.y + 0.18) - point.y) <= 0.16);
}

export function placementFor(g: Game, p: Soldier, yaw: number): Placement {
  const at = offset(p, yaw, 1.25);
  at.y = supportHeight(at.x, at.z, g.map, p.y + 0.18);
  const seat = offset(at, yaw, -emplacementRules.operatorOffset);
  seat.y = supportHeight(seat.x, seat.z, g.map, at.y + 0.18);
  const placement = { at, seat, baseYaw: yaw };
  if (p.loadout !== "emplacement" || p.hp <= 0 || p.emplacementLost ||
      p.mantle || p.hop || p.fall || p.melee || p.mountedGun !== undefined || p.flameKit !== undefined ||
      Math.abs(p.y - at.y) > 0.18 || g.tick < p.staggerUntil || g.tick < p.throwUntil)
    return { ...placement, valid: false, reason: "You need a ready kit and level ground" };
  if (g.emplacements.has(p.id)) return { ...placement, valid: false, reason: "Pack up your existing emplacement first" };
  const breech = offset(at, yaw, 0, 0, emplacementRules.pivotHeight);
  const muzzle = offset(breech, yaw, emplacementRules.barrelLength);
  if (!footprintClear(g, at, 0.52, 1.22) || !footprintClear(g, seat, 0.4, 1.42) ||
      Math.abs(seat.y - at.y) > 0.16 || g.collision.ray(breech, muzzle) < 0.999)
    return { ...placement, valid: false, reason: "Find room for the gun and operator on level ground" };
  for (const gun of g.emplacements.values()) {
    if (Math.abs(gun.at.y - at.y) < 1.3 && Math.hypot(gun.at.x - at.x, gun.at.z - at.z) < 1.8)
      return { ...placement, valid: false, reason: "Too close to another emplacement" };
  }
  if (g.players.some(q => q !== p && q.hp > 0 && Math.abs(q.y - at.y) < 1.3 &&
    (Math.hypot(q.x - at.x, q.z - at.z) < 0.75 || Math.hypot(q.x - seat.x, q.z - seat.z) < 0.65)))
    return { ...placement, valid: false, reason: "Another soldier is in the way" };
  return { ...placement, valid: true };
}

export function nearbyGun(g: Game, p: Soldier) {
  let result: Emplacement | undefined;
  let distance = 1.85;
  for (const gun of g.emplacements.values()) {
    if (gun.team !== p.team || Math.abs(gun.seat.y - p.y) > 0.32) continue;
    const d = Math.hypot(gun.seat.x - p.x, gun.seat.z - p.z);
    if (d >= distance || g.collision.ray(offset(p, 0, 0, 0, 1), offset(gun.seat, 0, 0, 0, 1)) < 0.999) continue;
    result = gun;
    distance = d;
  }
  return result;
}

function profileFor(gun: Pick<Emplacement, "weaponId">) {
  return weaponProfile({ weapon: "machineGun", weaponId: gun.weaponId });
}

function supply(weaponId: string): GunSupply {
  const { magazine, reserve } = profileFor({ weaponId });
  return { ammo: magazine, reserve };
}

export function dismount(g: Game, p: Soldier, announce = true) {
  const gun = mountedGun(g, p);
  p.mountedGun = undefined;
  if (!gun || gun.operator !== p.id) return;
  gun.operator = undefined;
  p.triggerPressed = false;
  if (announce) g.emit({ type: "emplacement", actor: p.id, phase: "dismount", owner: gun.owner });
}

export function emplacementCommand(g: Game, p: Soldier, c: Command, interactPressed: boolean) {
  const mounted = mountedGun(g, p);
  if (mounted && interactPressed) {
    dismount(g, p);
    return true;
  }
  if (mounted) return true;
  if (!c.deployGun && !c.packGun && !interactPressed) return false;
  if (c.deployGun) {
    const placement = placementFor(g, p, c.yaw);
    if (placement.valid) {
      const weaponId = emplacementWeapon(p);
      const { at, seat, baseYaw } = placement;
      g.emplacements.set(p.id, {
        at, seat, baseYaw, owner: p.id, team: p.team, weaponId, hp: emplacementRules.durability,
        readyAt: g.tick + emplacementRules.setupTicks, yaw: baseYaw, pitch: 0,
        ...(p.packedEmplacement ?? supply(weaponId)), reloadAt: 0, nextShot: g.tick, lastShotAt: -1000,
        barrel: { heat: 0, overheated: false },
      });
      p.packedEmplacement = undefined;
      p.protectedUntil = 0;
      g.emit({ type: "emplacement", actor: p.id, phase: "deploy", owner: p.id });
    }
    return true;
  }
  const gun = nearbyGun(g, p);
  if (!gun) return false;
  if (p.mantle || p.hop || p.fall || p.melee || g.tick < p.staggerUntil || g.tick < p.throwUntil ||
      gun.operator !== undefined || g.tick < gun.readyAt) return true;
  if (c.packGun) {
    if (gun.owner === p.id && p.loadout === "emplacement") {
      p.packedEmplacement = { ammo: gun.ammo, reserve: gun.reserve, hp: gun.hp };
      g.emplacements.delete(gun.owner);
      g.emit({ type: "emplacement", actor: p.id, phase: "pack", owner: gun.owner });
    }
    return true;
  }
  if (!footprintClear(g, gun.seat, 0.4, 1.42) || g.players.some(q => q !== p && q.hp > 0 &&
    Math.abs(q.y - gun.seat.y) < 1.3 && Math.hypot(q.x - gun.seat.x, q.z - gun.seat.z) < 0.6)) return true;
  gun.operator = p.id;
  p.mountedGun = gun.owner;
  p.reloadAt = 0;
  p.weaponChange = undefined;
  p.protectedUntil = 0;
  g.emit({ type: "emplacement", actor: p.id, phase: "mount", owner: gun.owner });
  return true;
}

export function operateGun(g: Game, p: Soldier, gun: Emplacement, c: Command) {
  Object.assign(c, { x: 0, z: 0, sprint: false, crouch: true });
  const arc = angleDelta(gun.baseYaw, c.yaw);
  gun.yaw = gun.baseYaw + Math.max(-emplacementRules.traverse, Math.min(emplacementRules.traverse, arc));
  gun.pitch = Math.max(emplacementRules.pitchMin, Math.min(emplacementRules.pitchMax, c.pitch));
  Object.assign(p, gun.seat, { yaw: gun.yaw, pitch: gun.pitch, crouched: true, vx: 0, vz: 0, triggerPressed: false, triggerHeld: c.fire });
  const profile = profileFor(gun);
  if ((c.reload || (c.fire && gun.ammo === 0)) && gun.ammo < profile.magazine && gun.reserve > 0 && !gun.reloadAt) {
    gun.reloadAt = g.tick + profile.reloadTicks;
    g.emit({ type: "reload", actor: p.id });
    g.emit({ type: "emplacement", actor: p.id, phase: "reload", owner: gun.owner });
  }
}

export function advanceEmplacements(g: Game) {
  for (const gun of g.emplacements.values()) {
    coolBarrel(gun.barrel);
    if (!gun.reloadAt || g.tick < gun.reloadAt) continue;
    const added = Math.min(gun.reserve, profileFor(gun).magazine - gun.ammo);
    gun.ammo += added;
    gun.reserve -= added;
    gun.reloadAt = 0;
  }
}

function destroyGun(g: Game, gun: Emplacement) {
  const operator = gun.operator === undefined ? undefined : g.players[gun.operator];
  if (operator) dismount(g, operator);
  g.players[gun.owner].emplacementLost = true;
  g.emplacements.delete(gun.owner);
  g.emit({ type: "emplacement", actor: gun.owner, phase: "destroy", owner: gun.owner });
}

export function damageEmplacements(g: Game, at: V3, radius: number, damage: number) {
  for (const gun of g.emplacements.values()) {
    const center = { ...gun.at, y: gun.at.y + 0.52 };
    const distance = Math.hypot(center.x - at.x, center.y - at.y, center.z - at.z);
    if (distance >= radius || g.collision.ray(at, center) < 0.995) continue;
    gun.hp -= damage * (1 - distance / radius);
    if (gun.hp <= 0) destroyGun(g, gun);
  }
}

export function checkEmplacementSupport(g: Game) {
  for (const gun of g.emplacements.values())
    if (!footprintClear(g, gun.at, 0.52, 1.22) || !footprintClear(g, gun.seat, 0.4, 1.42)) destroyGun(g, gun);
}

export function resupplyEmplacement(g: Game, p: Soldier) {
  p.emplacementLost = false;
  p.packedEmplacement = undefined;
  const gun = g.emplacements.get(p.id);
  if (gun) Object.assign(gun, supply(gun.weaponId), { hp: emplacementRules.durability, reloadAt: 0, barrel: { heat: 0, overheated: false } });
}

export function emplacementView(gun: Emplacement) {
  const dir = viewDirection(gun.yaw, gun.pitch);
  const pivot = { ...gun.at, y: gun.at.y + emplacementRules.pivotHeight };
  // Both sights sit above the barrel on the rotating assembly.
  const back = emplacementRules.operatorOffset, up = emplacementRules.sightHeight;
  const eye = {
    x: pivot.x - dir.x * back - Math.sin(gun.yaw) * Math.sin(gun.pitch) * up,
    y: pivot.y - dir.y * back + Math.cos(gun.pitch) * up,
    z: pivot.z - dir.z * back + Math.cos(gun.yaw) * Math.sin(gun.pitch) * up,
  };
  const muzzle = {
    x: pivot.x + dir.x * emplacementRules.barrelLength,
    y: pivot.y + dir.y * emplacementRules.barrelLength,
    z: pivot.z + dir.z * emplacementRules.barrelLength,
  };
  return { eye, pivot, muzzle };
}
