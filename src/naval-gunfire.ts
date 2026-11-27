import { hillHeight, type MapDefinition, type Vec } from "./map";
import { backdropHeight } from "./backdrop";
import { artilleryExplosionProfile, type ExplosionProfile } from "./destruction";

// Naval gunfire (MapDefinition.navalGunfire): one side's artillery is its
// warships offshore. A ship's gun fires flat, so its shell comes down at a
// shallow angle and cannot drop onto ground hidden from the sea behind a
// steeper crest or down a gully: dead ground. At Anzac the ships could shell
// the forward slopes, but little behind the ridges.
export const navalRules = {
  // The angle the shell falls at, in degrees: a high velocity gun firing at
  // a few miles, which is steeper than the line from a ship this close.
  descent: 8,
  // The point the shell must reach, above the ground (a man's chest).
  aim: 1,
  step: 1,
  // A warship's shell is heavier than a field gun's: this much more blast
  // radius and damage than artillery on other maps (Cody's ask, 2026-11-27).
  power: 1.25,
};

// The blast of a fleet's fire-mission shell. Strays keep the usual profile.
export const navalExplosionProfile: ExplosionProfile = {
  ...artilleryExplosionProfile,
  kind: "artillery-naval",
  radius: artilleryExplosionProfile.radius * navalRules.power,
  damage: Math.round(artilleryExplosionProfile.damage * navalRules.power),
  structuralRadius: artilleryExplosionProfile.structuralRadius * navalRules.power,
  craterRadius: artilleryExplosionProfile.craterRadius * navalRules.power,
  label: "Naval gunfire",
};
export const shellProfileFor = (map: MapDefinition, team: "blue" | "red") =>
  map.navalGunfire?.team === team ? navalExplosionProfile : artilleryExplosionProfile;

// The turret nearest the mark along the coast fires.
export function navalGun(map: MapDefinition, target: Vec) {
  return map.navalGunfire!.guns.reduce((a, b) => (Math.abs(b.z - target.z) < Math.abs(a.z - target.z) ? b : a));
}

// The lie of the land, without the trenches cut into it: a shell that clears
// a crest bursts on the parapet whether or not men crouch in the trench below.
const land = (map: MapDefinition, x: number, z: number) =>
  Math.abs(x) > map.width / 2 || Math.abs(z) > map.depth / 2 ? backdropHeight(map, x, z) : hillHeight(x, z, map) + (map.terrain?.bankHeight ?? 0);

// Whether a team's guns cannot reach this ground: true only for a naval side,
// when the land toward the ship rises above the shell's line of descent.
export function deadGround(map: MapDefinition, team: "blue" | "red", target: Vec): boolean {
  if (map.navalGunfire?.team !== team) return false;
  const gun = navalGun(map, target);
  const length = Math.hypot(gun.x - target.x, gun.z - target.z);
  const ux = (gun.x - target.x) / length, uz = (gun.z - target.z) / length;
  const slope = Math.tan((navalRules.descent * Math.PI) / 180), y0 = land(map, target.x, target.z) + navalRules.aim;
  for (let d = navalRules.step; d < length; d += navalRules.step) {
    const line = y0 + d * slope;
    if (line > gun.y + 60) return false;
    if (land(map, target.x + ux * d, target.z + uz * d) > line) return true;
  }
  return false;
}
