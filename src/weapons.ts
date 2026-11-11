export type WeaponKind = "rifle" | "serviceRifle" | "machineGun" | "pistol" | "flamethrower";
export const weaponProfiles = {
  pistol: { magazine: 8, reserve: 40, shotTicks: 6, reloadTicks: 36, damage: 25, projectileSpeed: 128, muzzle: 0.7, label: "PISTOL" },
  flamethrower: { magazine: 240, reserve: 0, shotTicks: 1, reloadTicks: 30, damage: 1, projectileSpeed: 20, muzzle: 1, label: "FLAMETHROWER" },
  rifle: {
    magazine: 30,
    reserve: 120,
    shotTicks: 6,
    reloadTicks: 30,
    damage: 25,
    projectileSpeed: 128,
    muzzle: 1.08,
    label: "AR-01 / SEMI-AUTO RIFLE",
  },
  serviceRifle: {
    magazine: 5,
    reserve: 60,
    shotTicks: 18,
    reloadTicks: 48,
    damage: 50,
    projectileSpeed: 128,
    muzzle: 1.2,
    label: "SERVICE RIFLE / BOLT ACTION",
  },
  machineGun: {
    magazine: 60,
    reserve: 240,
    shotTicks: 3,
    reloadTicks: 45,
    damage: 25,
    projectileSpeed: 32,
    muzzle: 1.27,
    label: "LIGHT MACHINE GUN",
  },
};

export function rosterWeapon(
  index: number,
  teamSize: number,
  human: boolean,
  trenches = false,
): WeaponKind {
  if (human) return trenches ? "serviceRifle" : "rifle";
  const count = Math.floor(teamSize / 12);
  for (let i = 0; i < count; i++)
    if (index === Math.floor(((i + 0.5) * teamSize) / count))
      return "machineGun";
  return trenches ? "serviceRifle" : "rifle";
}

export const weaponMount = { x: 0.18, y: 0.36, z: -0.5 };
export const armLengths = { upper: 0.34, forearm: 0.36 };
export function boltMotion(
  p: { weapon: WeaponKind; lastShotAt: number; reloadAt: number; hp: number },
  tick: number,
) {
  if (p.weapon !== "serviceRifle" || p.reloadAt || p.hp <= 0) return null;
  // Keep the original pose curve, scaled to the current mechanical cycle.
  const age =
    ((tick - p.lastShotAt) / weaponProfiles.serviceRifle.shotTicks) * 36;
  if (age < 5 || age >= 33) return null;
  const ease = (a: number, b: number) => {
    const t = Math.max(0, Math.min(1, (age - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  return {
    lift: ease(5, 9) * (1 - ease(27, 32)),
    pull: ease(9, 17) * (1 - ease(20, 27)),
    reach: ease(5, 9) * (1 - ease(28, 33)),
  };
}

// Mechanical sounds/events follow the same normalized phases as the animations.
export function serviceRifleAction(
  p: { weapon: WeaponKind; lastShotAt: number; reloadAt: number; hp: number },
  tick: number,
) {
  if (p.weapon !== "serviceRifle" || p.hp <= 0) return null;
  const profile = weaponProfiles.serviceRifle;
  if (p.reloadAt) {
    const remaining = p.reloadAt - tick;
    return remaining === Math.round((profile.reloadTicks * 90) / 96)
      ? "boltOpen"
      : remaining === Math.round(profile.reloadTicks / 2)
        ? "clip"
        : remaining === Math.round((profile.reloadTicks * 12) / 96)
          ? "boltClose"
          : null;
  }
  const age = tick - p.lastShotAt;
  return age === Math.round((profile.shotTicks * 9) / 36)
    ? "boltOpen"
    : age === Math.round((profile.shotTicks * 28) / 36)
      ? "boltClose"
      : null;
}
