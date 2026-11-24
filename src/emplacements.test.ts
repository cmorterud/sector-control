import { expect, it } from "vitest";
import { emplacementRules, emplacementView, mountedGun, placementFor } from "./emplacements";
import { grenadeExplosionProfile } from "./destruction";
import { industrialMap, type MapDefinition } from "./map";
import { Game, TestCollision, idle, type Command } from "./simulation";
import { gameMuzzleVelocity, reloadDuration, shotInterval, weaponStats } from "./weapon-stats";

function field(blocked = false, id: MapDefinition["id"] = "village") {
  const map = { ...industrialMap, id, boxes: blocked ? [
    { x: 0, z: 2.65, w: 2, d: 0.35, h: 1.8, kind: "wood" as const },
  ] : [] };
  const game = new Game(new TestCollision(map), true, 3000, 42, undefined, { map, teamSize: 2, ambientArtillery: false });
  game.commandOverride = () => idle();
  const [player, teammate, target] = game.players;
  game.selectLoadout(player, "emplacement");
  Object.assign(player, { x: 0, z: 4, yaw: 0 });
  Object.assign(teammate, { x: 7, z: 5 });
  Object.assign(target, { x: 0, z: -8, protectedUntil: 0 });
  const step = (input: Partial<Command> = {}) => game.step({ ...idle(), ...input });
  const setup = () => {
    step({ deployGun: true });
    const gun = game.emplacements.get(player.id)!;
    expect(gun).toBeDefined();
    while (game.tick < gun.readyAt) step();
    return gun;
  };
  return { game, player, teammate, target, step, setup };
}

it.each(["industrial", "trenches", "verdun", "village", "headland", "training", "fort-vaux"] as const)(
  "offers the kit and accepts a clear placement on %s",
  id => {
    const { game, player, step } = field(false, id);
    expect(player.loadout).toBe("emplacement");
    expect(placementFor(game, player, 0).valid).toBe(true);
    step({ deployGun: true });
    expect(game.emplacements.has(player.id)).toBe(true);
  },
);

it("rejects a blocked placement and leaves the player carrying the kit", () => {
  const { game, player, step } = field(true);
  expect(placementFor(game, player, 0).valid).toBe(false);
  step({ deployGun: true });
  expect(game.emplacements.size).toBe(0);
  expect(player.weapon).toBe("pistol");
  step({ equip: "primary" });
  expect(player.weapon).toBe("pistol");
});

it("gates setup time, limits traverse, ignores movement, and fires from the emplacement with its Armory stats", () => {
  const { game, player, target, step } = field();
  const pistolAmmo = player.ammo;
  step({ deployGun: true });
  const gun = game.emplacements.get(player.id)!;
  step({ interact: true });
  expect(mountedGun(game, player)).toBeUndefined();
  while (game.tick < gun.readyAt) step();
  step({ interact: true, yaw: 3, x: 1, sprint: true, pitch: 1 });
  expect(mountedGun(game, player)).toBe(gun);
  expect(gun.yaw).toBeCloseTo(emplacementRules.traverse);
  expect(gun.pitch).toBe(emplacementRules.pitchMax);
  expect(player.x).toBe(gun.seat.x);
  const stats = weaponStats.find(w => w.name === gun.weaponId)!;
  step({ aim: true, fire: true });
  const shot = game.projectiles[0];
  expect(shot.origin).toEqual(emplacementView(gun).muzzle);
  expect(shot.weaponId).toBe(stats.name);
  expect(Math.hypot(shot.vx, shot.vy, shot.vz)).toBeCloseTo(gameMuzzleVelocity(stats));
  expect(gun.ammo).toBe(stats.magazine - 1);
  expect(gun.nextShot - game.tick).toBe(shotInterval(stats));
  expect(player.ammo).toBe(pistolAmmo);
  for (let i = 0; i < 8 && target.hp === 100; i++) step();
  expect(target.hp).toBe(100 - stats.damage.stomach);
});

it("preserves a reload across operators and retains ammo and damage on packing", () => {
  const { game, player, teammate, step, setup } = field();
  const gun = setup();
  step({ interact: true, fire: true }); // Mount and spend a round.
  step({ reload: true });
  const stats = weaponStats.find(w => w.name === gun.weaponId)!;
  const due = gun.reloadAt;
  expect(due - game.tick).toBe(reloadDuration(stats));
  step({ interact: true });
  expect(gun.operator).toBeUndefined();

  // Move the first operator clear of the seat before the second approaches.
  Object.assign(player, { x: gun.seat.x + 1.6, z: gun.seat.z });
  Object.assign(teammate, { x: gun.seat.x + 1, y: gun.seat.y, z: gun.seat.z });
  let use = true;
  game.commandOverride = (_g, soldier) => ({ ...idle(), interact: soldier === teammate && use });
  step();
  expect(gun.operator).toBe(teammate.id);
  expect(gun.reloadAt).toBe(due);
  use = false;
  while (game.tick < due) step();
  expect(gun.ammo).toBe(stats.magazine);
  expect(gun.reserve).toBe(stats.reserve - 1);
  use = true;
  step();
  expect(gun.operator).toBeUndefined();
  gun.hp = 45;
  step({ packGun: true });
  expect(game.emplacements.size).toBe(0);
  Object.assign(teammate, { x: 7, z: 5 });
  Object.assign(player, { x: 0, z: 4 });
  const redeployed = setup();
  expect(redeployed.reserve).toBe(stats.reserve - 1);
  expect(redeployed.hp).toBe(45);
});

it("unseats a dead operator and destroys the emplacement in a nearby blast", () => {
  const { game, player, step, setup } = field();
  const gun = setup();
  step({ interact: true });
  step({ redeploy: true });
  expect(player.hp).toBe(0);
  expect(gun.operator).toBeUndefined();
  expect(game.emplacements.has(player.id)).toBe(true);
  game.explode({ ...gun.at, y: gun.at.y + 0.52 }, -1, null, {
    ...grenadeExplosionProfile, damage: emplacementRules.durability + 1, terrainReach: 0, structuralRadius: 0,
  });
  expect(game.emplacements.size).toBe(0);
  expect(player.emplacementLost).toBe(true);
  game.respawn(player);
  expect(player.emplacementLost).toBe(false);
});

it("keeps one active gun per owner, including after respawn, and prevents enemy use", () => {
  const { game, player, target, step, setup } = field();
  const gun = setup();
  game.respawn(player);
  Object.assign(player, { x: 4, y: 0, z: 3 });
  expect(placementFor(game, player, 0).valid).toBe(false);
  step({ deployGun: true });
  expect(game.emplacements.get(player.id)).toBe(gun);
  Object.assign(target, gun.seat);
  game.commandOverride = (_g, soldier) => ({ ...idle(), interact: soldier === target });
  step();
  expect(gun.operator).toBeUndefined();
});
