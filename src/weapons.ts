export type WeaponKind = "rifle" | "serviceRifle" | "machineGun";
export const weaponProfiles = {
  rifle: {
    magazine: 30,
    reserve: 120,
    shotTicks: 6,
    reloadTicks: 60,
    damage: 25,
    projectileSpeed: 64,
    muzzle: 1.08,
    label: "AR-01 / SEMI-AUTO RIFLE",
  },
  serviceRifle: {
    magazine: 5,
    reserve: 60,
    shotTicks: 36,
    reloadTicks: 96,
    damage: 50,
    projectileSpeed: 64,
    muzzle: 1.2,
    label: "SERVICE RIFLE / BOLT ACTION",
  },
  machineGun: {
    magazine: 60,
    reserve: 240,
    shotTicks: 3,
    reloadTicks: 90,
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
  const age = tick - p.lastShotAt;
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
