export type WeaponKind = "rifle" | "machineGun";
export const weaponProfiles = {
  rifle: { magazine: 30, reserve: 120, shotTicks: 6, reloadTicks: 60 },
  machineGun: { magazine: 60, reserve: 240, shotTicks: 3, reloadTicks: 90 },
};

export function rosterWeapon(
  index: number,
  teamSize: number,
  human: boolean,
): WeaponKind {
  if (human) return "rifle";
  const count = Math.floor(teamSize / 12);
  for (let i = 0; i < count; i++)
    if (index === Math.floor(((i + 0.5) * teamSize) / count))
      return "machineGun";
  return "rifle";
}
