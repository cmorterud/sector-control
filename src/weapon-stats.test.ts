import { expect, it } from "vitest";
import { equipLoadout, factions, kitFor, riflemanWeapon, switchWeapon } from "./loadouts";
import { fortVauxMap } from "./fort-vaux-map";
import { trenchMap } from "./trench-map";
import { armoryFactions, damageAt, gameMuzzleVelocity, hitZones, reloadDuration, shotInterval, shotsToKill, soldierHealth, timeToKill, weaponStats, weaponTicksPerSecond } from "./weapon-stats";

import { Game, TestCollision, idle } from "./simulation";
import { industrialMap } from "./map";

it("gives every Armory faction a rifle, scoped rifle, pistol, both machine-gun variants and an anti-tank kit", () => {
  for (const f of armoryFactions) {
    expect(factions[f].name).toBeTruthy();
    // The two armies that fight inside Fort Vaux also have a carbine.
    const carbine = f === "french" || f === "german" ? ["carbine"] : [];
    expect(weaponStats.filter(w => w.faction === f).map(w => w.role).sort()).toEqual(["antiTank", ...carbine, "emplaced", "machineGun", "pistol", "rifle", "scoped"]);
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
    if (w.role === "rifle" || w.role === "carbine") {
      // A rifle or carbine kills with one hit to the head and two to the chest or stomach.
      expect(shotsToKill(w, "head")).toBe(1);
      expect(shotsToKill(w, "chest")).toBe(2);
      expect(shotsToKill(w, "stomach")).toBe(2);
    } else if (w.role === "antiTank") {
      // Every anti-tank weapon goes through tank plate. Armour-piercing
      // rounds in a service rifle hit soldiers like ball; the Tankgewehr's
      // 13.2 mm round kills with any hit to the body.
      expect(w.armour!.hull).toBeGreaterThan(0);
      if (w.magazine === 1) for (const z of ["head", "chest", "stomach"] as const) expect(shotsToKill(w, z)).toBe(1);
      else {
        expect(shotsToKill(w, "head")).toBe(1);
        expect(shotsToKill(w, "chest")).toBe(2);
      }
    } else if (w.role === "scoped") {
      // A scoped rifle still kills with any hit to the head or chest.
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
  const smle = weaponStats.find(w => w.id === "smle")!;
  expect(timeToKill(smle, "head")).toBe(0);
  expect(timeToKill(smle, "chest")).toBe(shotInterval(smle) / weaponTicksPerSecond);
  expect(gameMuzzleVelocity(weaponStats.find(w => w.id === "smle")!)).toBe(288);
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

it.each(weaponStats.filter(w => w.role !== "emplaced"))("uses the $name Armory profile when equipping, firing and reloading", w => {
  const { g, shooter } = weaponRange();
  shooter.faction = w.faction;
  equipLoadout(shooter, w.role === "scoped" ? "marksman" : w.role === "machineGun" ? "support" : w.role === "antiTank" ? "antiTank" : "rifleman", w.role === "carbine" ? "carbine" : "service");
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

it.each(weaponStats.filter(w => w.role === "rifle" || w.role === "carbine"))("takes two $name chest rounds or one head round to kill a full-health soldier", w => {
  const hit = (g: Game, shooterId: number, team: typeof g.players[0]["team"], y: number) => {
    g.projectiles.push({
      actor: shooterId, team, id: g.projectiles.length + 1, weapon: "serviceRifle", weaponId: w.name,
      x: 0, y, z: 1, vx: 0, vy: 0, vz: -192, remaining: 60, bornAt: 0, origin: { x: 0, y, z: 12 },
    });
    g.step(idle());
  };
  const chest = weaponRange();
  Object.assign(chest.target, { x: 0, z: 0, yaw: 0 });
  hit(chest.g, chest.shooter.id, chest.shooter.team, 1.3);
  expect(chest.target.hp).toBeGreaterThan(0);
  expect(chest.target.hp).toBe(soldierHealth - w.damage.chest);
  hit(chest.g, chest.shooter.id, chest.shooter.team, 1.3);
  expect(chest.target.hp).toBe(0);
  const head = weaponRange();
  Object.assign(head.target, { x: 0, z: 0, yaw: 0 });
  hit(head.g, head.shooter.id, head.shooter.team, 1.7);
  expect(head.target.hp).toBe(0);
});

it("applies pistol falloff on a projectile beyond the old 25 metre limit", () => {
  const { g, shooter, target } = weaponRange();
  Object.assign(shooter, { x: 0, z: 22 });
  Object.assign(target, { x: 0, z: -20 });
  shooter.faction = "british";
  equipLoadout(shooter, "rifleman");
  switchWeapon(shooter, "sidearm", 0);
  // Sights up before the shot, so the round is not spread from the hip.
  for (let i = 0; i < 10; i++) g.step({ ...idle(), firstPerson: true, aim: true, pitch: -0.009 });
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

it("makes each carbine its rifle worked faster, with the same hit up close and less at range", () => {
  const carbines = weaponStats.filter(w => w.role === "carbine");
  expect(carbines.map(w => w.faction).sort()).toEqual(["french", "german"]);
  for (const carbine of carbines) {
    const rifle = weaponStats.find(w => w.faction === carbine.faction && w.role === "rifle")!;
    expect(carbine.round).toBe(rifle.round);
    expect(carbine.magazine).toBe(rifle.magazine);
    expect(carbine.damage).toEqual(rifle.damage);
    // Quicker between shots, so two chest hits land sooner in a corridor.
    expect(shotInterval(carbine)).toBeLessThan(shotInterval(rifle));
    expect(timeToKill(carbine, "chest", 5)).toBeLessThan(timeToKill(rifle, "chest", 5) - .15);
    expect(timeToKill(carbine, "chest", 5)).toBeLessThan(.9);
    // The short barrel gives up velocity and, past a room's length, damage.
    expect(gameMuzzleVelocity(carbine)).toBeLessThan(gameMuzzleVelocity(rifle));
    for (const zone of hitZones) {
      expect(damageAt(carbine, zone.id, 20)).toBe(rifle.damage[zone.id]);
      expect(damageAt(carbine, zone.id, 70)).toBeLessThan(damageAt(rifle, zone.id, 70));
    }
    // It still takes two chest hits at any range, never three.
    expect(shotsToKill(carbine, "chest", 200)).toBe(2);
    expect(shotsToKill(carbine, "head", 200)).toBe(1);
  }
});

it("issues carbines to riflemen in Fort Vaux and rifles everywhere else", () => {
  expect(kitFor(fortVauxMap)).toBe("carbine");
  expect(kitFor(trenchMap)).toBe("service");
  expect(kitFor(industrialMap)).toBe("industrial");
  expect(riflemanWeapon("french", "carbine")).toBe("Berthier Mle 1892 M16");
  expect(riflemanWeapon("german", "carbine")).toBe("Karabiner 98AZ");
  // An army without a carbine keeps its rifle.
  expect(riflemanWeapon("british", "carbine")).toBe("SMLE Mk III");
  expect(riflemanWeapon("french", "service")).toBe("Berthier Mle 1916");
  const fort = new Game(new TestCollision(fortVauxMap), true, 600, 12345, undefined, { map: fortVauxMap, humanPlayerIds: [] });
  for (const p of fort.players) {
    expect(p.weapon).toBe("serviceRifle");
    expect(p.weaponId, `${p.team} ${p.loadout}`).toBe(p.team === "blue" ? "Berthier Mle 1892 M16" : "Karabiner 98AZ");
    // Marksmen and machine gunners are unchanged where the roster has them.
    expect(p.inventory!.sidearm.id).toBe(p.team === "blue" ? "Ruby" : "P08 Luger");
  }
  const trench = new Game(new TestCollision(trenchMap), true, 600, 12345, undefined, { map: trenchMap, teamSize: 6, humanPlayerIds: [] });
  expect(trench.players.some(p => /Mle 1892|98AZ/.test(p.weaponId ?? ""))).toBe(false);
  // A respawn in the fort reissues the carbine.
  const p = fort.players[0];
  fort.respawn(p);
  expect(p.weaponId).toBe("Berthier Mle 1892 M16");
});
