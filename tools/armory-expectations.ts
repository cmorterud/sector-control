import { armoryFactions, gameMuzzleVelocity, gameRateOfFire, hitZones, reloadDuration, shotsToKill, timeToKill, weaponStats, weaponTicksPerSecond } from '../src/weapon-stats';

// The simulation tests check these profiles against actual shots and reloads.
// The browser review checks that the built Armory displays the same values.
console.log(JSON.stringify({
  factions: armoryFactions,
  weapons: weaponStats.map(weapon => ({
    name: weapon.name,
    faction: weapon.faction,
    // Every army that carries it, and so shows its card.
    factions: [weapon.faction, ...(weapon.alsoIssuedTo ?? [])],
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
