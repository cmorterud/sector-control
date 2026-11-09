import { eyeHeightOf } from "./crouch";
import { weaponAim } from "./recoil";
import type { Soldier, V3 } from "./simulation";
import type { WeaponKind } from "./weapons";

export const sightHeight = 0.1125;
export const firstPersonView = (p: Soldier) =>
  p.id === 0 && p.hp > 0 && !!(p.command.firstPerson || p.command.aim);
export const sighted = (p: Soldier, tick: number) =>
  firstPersonView(p) && p.command.aim && !p.reloadAt &&
  !p.mantle && !p.melee && p.throwUntil <= tick;

export function viewDirection(yaw: number, pitch: number): V3 {
  return {
    x: Math.sin(yaw) * Math.cos(pitch),
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * Math.cos(pitch),
  };
}

export function viewWeaponPosition(ads: boolean): V3 {
  return ads
    ? { x: 0, y: -sightHeight, z: -0.32 }
    : { x: 0.18, y: -0.25, z: -0.45 };
}

export const barrelEnd = (weapon: WeaponKind) =>
  weapon === "serviceRifle" ? -0.7 : weapon === "machineGun" ? -0.77 : -0.575;

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
  const position = viewWeaponPosition(sighted(p, tick));
  return viewToWorld(p, {
    x: position.x,
    y: position.y + 0.025,
    z: position.z + barrelEnd(p.weapon),
  });
}
