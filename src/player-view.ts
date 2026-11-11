import { scoped } from "./loadouts";
import { eyeHeightOf } from "./crouch";
import { weaponAim } from "./recoil";
import type { Soldier, V3 } from "./simulation";
import type { WeaponKind } from "./weapons";

export const scopeFov = 2 * Math.atan(Math.tan(70 * Math.PI / 360) / 4) * 180 / Math.PI;
export const sightHeight = 0.1125;
export const firstPersonView = (p: Soldier) =>
  p.id === 0 && p.hp > 0 && !!(p.command.firstPerson || p.command.aim);
export const sighted = (p: Soldier, tick: number) =>
  firstPersonView(p) && p.command.aim && !p.reloadAt &&
  !p.mantle && !p.melee && p.throwUntil <= tick && (!scoped(p) || tick - (p.aimSince ?? tick) >= 15);

export function viewDirection(yaw: number, pitch: number): V3 {
  return {
    x: Math.sin(yaw) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * Math.cos(pitch),
  };
}

export function viewWeaponPosition(ads: boolean, weapon?: WeaponKind): V3 {
  return ads
    ? { x: 0, y: -sightHeight, z: weapon === "serviceRifle" ? -0.4 : -0.32 }
    : { x: 0.18, y: -0.25, z: -0.45 };
}

export const barrelEnd = (weapon: WeaponKind) =>
  weapon === "serviceRifle" ? -0.7 : weapon === "machineGun" ? -0.77 : weapon === "pistol" ? -0.38 : -0.575;

// Camera-local offsets use the same basis as PlayCanvas's lookAt camera.
export function viewToWorld(p: Soldier, local: V3): V3 {
  const { yaw, pitch } = weaponAim(p);
  const forward = viewDirection(yaw, pitch);
  const up = {
    x: -Math.sin(yaw) * Math.sin(pitch),
    y: Math.cos(pitch),
    z: Math.cos(yaw) * Math.sin(pitch),
  };
  return {
    x: p.x + Math.cos(yaw) * local.x + up.x * local.y - forward.x * local.z,
    y: p.y + eyeHeightOf(p) + up.y * local.y - forward.y * local.z,
    z: p.z + Math.sin(yaw) * local.x + up.z * local.y - forward.z * local.z,
  };
}

export function viewMuzzle(p: Soldier, tick: number): V3 {
  const position = viewWeaponPosition(sighted(p, tick), p.weapon);
  return viewToWorld(p, {
    x: position.x,
    y: position.y + 0.025,
    z: position.z + barrelEnd(p.weapon),
  });
}

// Probe the visible barrel, including its thickness. Pullback is cosmetic;
// authoritative rounds still sweep from the unchanged muzzle and hit cover.
export function weaponPullback(eye: V3, muzzle: V3, forward: V3,
  ray: (from: V3, to: V3) => number) {
  let fraction = 1;
  for (const offset of [{ x: 0, y: 0, z: 0 },
    { x: 0.045, y: 0, z: 0 }, { x: -0.045, y: 0, z: 0 },
    { x: 0, y: 0.045, z: 0 }, { x: 0, y: -0.045, z: 0 }]) {
    fraction = Math.min(fraction, ray(
      { x: eye.x + offset.x, y: eye.y + offset.y, z: eye.z + offset.z },
      { x: muzzle.x + offset.x, y: muzzle.y + offset.y, z: muzzle.z + offset.z },
    ));
  }
  if (fraction >= 1) return 0;
  const depth = (muzzle.x - eye.x) * forward.x + (muzzle.y - eye.y) * forward.y + (muzzle.z - eye.z) * forward.z;
  return Math.max(0, depth * (1 - Math.max(0, fraction)) + 0.06);
}
