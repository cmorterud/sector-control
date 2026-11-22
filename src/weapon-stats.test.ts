import { expect, it } from "vitest";
import { equipLoadout, factions, switchWeapon } from "./loadouts";
import { armouryFactions, damageAt, gameMuzzleVelocity, hitZones, reloadDuration, shotInterval, shotsToKill, soldierHealth, timeToKill, weaponStats } from "./weapon-stats";

import { Game, TestCollision, idle } from "./simulation";
import { industrialMap } from "./map";

it("gives every Armoury faction a rifle, scoped rifle, pistol and both machine-gun variants", () => {
  for (const f of armouryFactions) {
    expect(factions[f].name).toBeTruthy();
    expect(weaponStats.filter(w => w.faction === f).map(w => w.role).sort()).toEqual(["emplaced", "machineGun", "pistol", "rifle", "scoped"]);
  }
  expect(new Set(weaponStats.map(w => w.id)).size).toBe(weaponStats.length);
});

it("follows the damage design rules", () => {
  for (const w of weaponStats) {
    for (const z of hitZones) expect(w.damage[z.id]).toBeGreaterThan(0);
    // Limbs always take less than the stomach, and the stomach less than the chest.
    expect(w.damage.arms).toBeLessThan(w.damage.stomach);
    expect(w.damage.legs).toBeLessThan(w.damage.stomach);
    expect(w.damage.stomach).toBeLessThanOrEqual(w.damage.chest);
    if (w.role === "rifle" || w.role === "scoped") {
      // A rifle to the head or chest always kills; anywhere else takes two or more.
      expect(shotsToKill(w, "head")).toBe(1);
      expect(shotsToKill(w, "chest")).toBe(1);
      expect(shotsToKill(w, "stomach")).toBe(2);
    } else {
      expect(shotsToKill(w, "chest")).toBeGreaterThanOrEqual(3);
      expect(shotsToKill(w, "chest")).toBeLessThanOrEqual(4);
    }
  }
});

it("derives hits and time to kill, and game velocity, from the stats", () => {
  const lewis = weaponStats.find(w => w.id === "lewis")!;
  expect(shotsToKill(lewis, "chest")).toBe(Math.ceil(soldierHealth / 38));
  expect(timeToKill(lewis, "chest")).toBeCloseTo((3 - 1) * 60 / 450, 6);
  expect(timeToKill(weaponStats.find(w => w.id === "smle")!, "chest")).toBe(0);
  expect(gameMuzzleVelocity(weaponStats.find(w => w.id === "smle")!)).toBe(192);
  const fastest = [...weaponStats].sort((a, b) => gameMuzzleVelocity(b) - gameMuzzleVelocity(a))[0];
  expect(fastest.faction).toBe("german");
});

function weaponRange() {
  const map = { ...industrialMap, boxes: [] };
  const g = new Game(new TestCollision(map), true, 3000, 42, undefined, { map, ambientArtillery: false, teamSize: 1 });
  g.commandOverride = () => idle();
  const [shooter, target] = g.players;
  Object.assign(shooter, { x: 0, y: 0, z: 24, protectedUntil: 0 });
  Object.assign(target, { x: 6, y: 0, z: -24, protectedUntil: 0 });
  return { g, shooter, target };
}

it.each(weaponStats.filter(w => w.role !== "emplaced"))("uses the $name Armoury profile when equipping, firing and reloading", w => {
  const { g, shooter } = weaponRange();
  shooter.faction = w.faction;
  equipLoadout(shooter, w.role === "scoped" ? "marksman" : w.role === "machineGun" ? "support" : "rifleman");
  if (w.role === "pistol") {
    expect(switchWeapon(shooter, "sidearm", g.tick)).toBe(true);
    for (let i = 0; i < 10; i++) g.step(idle());
  }
  expect(shooter.weaponId).toBe(w.name);
  expect(shooter.ammo).toBe(w.magazine);
  expect(shooter.reserve).toBe(w.reserve);
  g.step({ ...idle(), fire: true, firstPerson: true });
  expect(shooter.ammo).toBe(w.magazine - 1);
  expect(shooter.nextShot - g.tick).toBe(shotInterval(w));
  const shot = g.projectiles[0];
  expect(Math.hypot(shot.vx, shot.vy, shot.vz)).toBeCloseTo(gameMuzzleVelocity(w));
  g.step({ ...idle(), reload: true });
  const ticks = reloadDuration(w);
  expect(shooter.reloadAt - g.tick).toBe(ticks);
  for (let i = 1; i < ticks; i++) g.step(idle());
  expect(shooter.ammo).toBe(w.magazine - 1);
  g.step(idle());
  expect(shooter.ammo).toBe(w.magazine);
  expect(shooter.reserve).toBe(w.reserve - 1);
});

it.each([
  ["head", 0, 1.70], ["chest", 0, 1.30], ["stomach", 0, 1.08],
  ["arms", 0.31, 1.24], ["legs", 0, 0.59],
] as const)("uses %s damage at the projectile impact, even after the shooter switches", (zone, x, y) => {
  const { g, shooter, target } = weaponRange();
  const w = weaponStats.find(w => w.id === "smle")!;
  Object.assign(target, { x: 0, z: 0, yaw: 0 });
  // A horizontal round through the hit volume isolates zone selection from recoil.
  g.projectiles.push({
    actor: shooter.id, team: shooter.team, id: 1, weapon: "serviceRifle", weaponId: w.name,
    x, y, z: 1, vx: 0, vy: 0, vz: -192, remaining: 60, bornAt: 0,
    origin: { x, y, z: 12 },
  });
  expect(switchWeapon(shooter, "sidearm", 0)).toBe(true);
  g.step(idle());
  expect(target.hp).toBe(Math.max(0, soldierHealth - w.damage[zone]));
});

it("applies pistol falloff on a projectile beyond the old 25 metre limit", () => {
  const { g, shooter, target } = weaponRange();
  Object.assign(shooter, { x: 0, z: 22 });
  Object.assign(target, { x: 0, z: -20 });
  shooter.faction = "british";
  equipLoadout(shooter, "rifleman");
  switchWeapon(shooter, "sidearm", 0);
  for (let i = 0; i < 10; i++) g.step(idle());
  g.step({ ...idle(), fire: true, firstPerson: true, aim: true, pitch: -0.009 });
  const origin = g.projectiles[0].origin!;
  expect(g.projectiles[0].remaining).toBeGreaterThan(50);
  for (let i = 0; i < 30 && target.hp === soldierHealth; i++) g.step(idle());
  const weapon = weaponStats.find(w => w.id === "webley")!;
  const impact = g.events.find(e => e.type === "impact" && e.hit);
  expect(impact).toBeDefined();
  if (impact?.type !== "impact") throw Error("Expected a pistol impact");
  const travel = Math.hypot(impact.at.x - origin.x, impact.at.y - origin.y, impact.at.z - origin.z);
  expect(travel).toBeGreaterThan(25);
  expect(target.hp).toBeCloseTo(soldierHealth - damageAt(weapon, "chest", travel));
});
