import { armouryFactions, gameMuzzleVelocity, gameRateOfFire, hitZones, reloadDuration, shotsToKill, timeToKill, weaponStats, weaponTicksPerSecond } from '../src/weapon-stats';

// The simulation tests check these profiles against actual shots and reloads.
// The browser review checks that the built Armoury displays the same values.
console.log(JSON.stringify({
  factions: armouryFactions,
  weapons: weaponStats.map(weapon => ({
    name: weapon.name,
    faction: weapon.faction,
    magazine: weapon.magazine,
    reserve: weapon.reserve,
    reload: reloadDuration(weapon) / weaponTicksPerSecond,
    rate: gameRateOfFire(weapon),
    velocity: gameMuzzleVelocity(weapon),
    zones: hitZones.map(zone => ({
      label: zone.label,
      damage: weapon.damage[zone.id],
      shots: shotsToKill(weapon, zone.id),
      seconds: timeToKill(weapon, zone.id),
    })),
  })),
}));
