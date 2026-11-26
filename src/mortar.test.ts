import { describe, expect, it } from "vitest";
import { controlHints } from "./control-hints";
import { freshControls } from "./controls";
import { mountedGun, placementFor } from "./emplacements";
import { industrialMap, type MapDefinition } from "./map";
import { flightTicks, mortarAim, mortarMap, mortarSpread, splashReport, tubeElevation } from "./mortar";
import { mortarExplosionProfile, mortarFor, mortarRules } from "./mortar-stats";
import { artilleryExplosionProfile, grenadeExplosionProfile } from "./destruction";
import { Game, TestCollision, idle, type Command } from "./simulation";

function field(id: MapDefinition["id"] = "village", yaw = 0) {
  const map: MapDefinition = { ...industrialMap, id, boxes: [], ...(id === "fort-vaux" ? { artillery: false as const } : {}) };
  const game = new Game(new TestCollision(map), true, 3000, 42, undefined, { map, teamSize: 3, ambientArtillery: false });
  game.commandOverride = () => idle();
  const [player, teammate, enemy] = [game.players[0], game.players[1], game.players.find(p => p.team === "red")!];
  game.selectLoadout(player, "mortar");
  Object.assign(player, { x: 0, z: 30, yaw });
  for (const q of game.players) if (q !== player) Object.assign(q, { x: 20, z: 45, protectedUntil: 0 });
  const step = (input: Partial<Command> = {}) => game.step({ ...idle(), yaw, ...input });
  const mount = () => {
    step({ deployGun: true, yaw });
    const gun = game.emplacements.get(player.id)!;
    expect(gun?.mortar).toBeDefined();
    while (game.tick < gun.readyAt) step();
    step({ interact: true });
    expect(mountedGun(game, player)).toBe(gun);
    return gun;
  };
  return { game, player, teammate, enemy, step, mount };
}

describe("trench mortar", () => {
  it("is issued as a pistol-only Support kit with one grenade, on maps with artillery", () => {
    const { player } = field();
    expect(player.loadout).toBe("mortar");
    expect(player.weapon).toBe("pistol");
    expect(mortarMap({ id: "trenches" })).toBe(true);
    expect(mortarMap({ id: "fort-vaux", artillery: false })).toBe(false);
    expect(mortarMap({ id: "industrial" })).toBe(false);
    const indoors = field("fort-vaux");
    expect(indoors.player.loadout).not.toBe("mortar");
  });

  it("names each army's tube", () => {
    expect(mortarFor("british").name).toBe("Stokes 3-inch mortar");
    expect(mortarFor("german").name).toBe("Granatenwerfer 16");
    expect(mortarFor("french").name).toMatch(/58 mm/);
  });

  it("blasts between a grenade and an artillery shell, and hurts its own side", () => {
    expect(mortarExplosionProfile.radius).toBeGreaterThan(grenadeExplosionProfile.radius);
    expect(mortarExplosionProfile.radius).toBeLessThan(artilleryExplosionProfile.radius);
    expect(mortarExplosionProfile.damage).toBeGreaterThan(grenadeExplosionProfile.damage);
    expect(mortarExplosionProfile.damage).toBeLessThan(artilleryExplosionProfile.damage);
    expect(mortarExplosionProfile.friendlyFire).toBe(true);
  });

  it("sets up like the machine gun, winds range with forward/back and keeps the traverse", () => {
    const { game, player, step, mount } = field();
    expect(placementFor(game, player, 0)).toMatchObject({ valid: true, mortar: true });
    const gun = mount();
    expect(gun.ammo).toBe(mortarRules.bombs);
    expect(gun.mortar!.range).toBe(mortarRules.startRange);
    for (let i = 0; i < 30; i++) step({ drive: { throttle: 1, turn: 0 }, x: 1 });
    expect(gun.mortar!.range).toBeCloseTo(mortarRules.startRange + mortarRules.rangeRate, 5);
    expect(player.x).toBeCloseTo(gun.seat.x, 5);
    for (let i = 0; i < 300; i++) step({ drive: { throttle: 1, turn: 0 } });
    expect(gun.mortar!.range).toBe(mortarRules.maxRange);
    for (let i = 0; i < 300; i++) step({ drive: { throttle: -1, turn: 0 } });
    expect(gun.mortar!.range).toBe(mortarRules.minRange);
    step({ yaw: 2 });
    expect(Math.abs(gun.yaw - gun.baseYaw)).toBeLessThanOrEqual(Math.PI / 4 + 1e-9);
    expect(tubeElevation(mortarRules.minRange)).toBeGreaterThan(tubeElevation(mortarRules.maxRange));
  });

  it("blooms the landing ring when the tube moves and settles it when still", () => {
    const { game, step, mount } = field();
    const gun = mount();
    for (let i = 0; i < 120; i++) step();
    expect(mortarSpread(gun)).toBeCloseTo(mortarRules.spread, 5);
    step({ yaw: 0.5 });
    const bloomed = mortarSpread(gun);
    expect(bloomed).toBeGreaterThan(mortarRules.spread + 2);
    for (let i = 0; i < 30; i++) step({ yaw: 0.5 });
    expect(mortarSpread(gun)).toBeLessThan(bloomed);
    expect(game.tick).toBeGreaterThan(0);
  });

  it("lobs a bomb that lands inside the ring after its flight time and hurts both sides near it", () => {
    const { game, player, teammate, enemy, step, mount } = field();
    const gun = mount();
    for (let i = 0; i < 120; i++) step();
    const aim = mortarAim(game, gun);
    Object.assign(enemy, { x: aim.x + 1, z: aim.z, y: 0, hp: 100 });
    Object.assign(teammate, { x: aim.x - 1, z: aim.z + 1, y: 0, hp: 100 });
    const spread = mortarSpread(gun);
    step({ fire: true });
    expect(gun.ammo).toBe(mortarRules.bombs - 1);
    const launch = game.events.find(e => e.type === "mortar" && e.phase === "launch");
    expect(launch).toBeDefined();
    let impact: Extract<(typeof game.events)[number], { type: "mortar" }> | undefined;
    let ticks = 0;
    while (!impact && ticks++ < 200) {
      step();
      impact = game.events.find((e): e is Extract<typeof e, { type: "mortar" }> => e.type === "mortar" && e.phase === "impact");
    }
    expect(impact).toBeDefined();
    expect(Math.abs(ticks - flightTicks(gun.mortar!.range))).toBeLessThanOrEqual(2);
    expect(Math.hypot(impact!.at.x - aim.x, impact!.at.z - aim.z)).toBeLessThanOrEqual(spread + 0.3);
    expect(enemy.hp).toBeLessThan(100);
    expect(teammate.hp).toBeLessThan(100);
    expect(player.hp).toBe(100);
  });

  it("drops one bomb every two seconds, stops at seven, and refills on respawn", () => {
    const { game, player, step, mount } = field();
    const gun = mount();
    let shots = 0;
    for (let i = 0; i < 30 * 20; i++) {
      step({ fire: true });
      shots += game.events.filter(e => e.type === "mortar" && e.phase === "launch").length;
    }
    expect(shots).toBe(mortarRules.bombs);
    expect(gun.ammo).toBe(0);
    game.respawn(player);
    expect(game.emplacements.has(player.id)).toBe(false);
    expect(player.grenades).toBe(1);
    Object.assign(player, { x: 0, z: 30 });
    const fresh = mount();
    expect(fresh.ammo).toBe(mortarRules.bombs);
  });

  it("refuses to fire at a deployment line", () => {
    const { game, step, mount } = field("village", Math.PI / 2);
    const gun = mount();
    step({ fire: true, yaw: Math.PI / 2 });
    expect(game.events.some(e => e.type === "mortar" && e.phase === "refused")).toBe(true);
    expect(gun.ammo).toBe(mortarRules.bombs);
  });

  it("reads the splash along and across the line of fire", () => {
    const from = { x: 0, z: 0 }, aim = { x: 0, z: -60 };
    expect(splashReport(from, aim, { x: 0, z: -56 })).toBe("SHORT 4 m");
    expect(splashReport(from, aim, { x: 3, z: -65 })).toBe("LONG 5 m · RIGHT 3 m");
    expect(splashReport(from, aim, { x: -3, z: -60 })).toBe("LEFT 3 m");
    expect(splashReport(from, aim, { x: 0.5, z: -60.5 })).toBe("ON TARGET");
  });

  it("bolds the mortar's own controls", () => {
    const settings = freshControls();
    const bold = (s: Parameters<typeof controlHints>[1]) => controlHints(settings, s).filter(h => h.context).map(h => h.text);
    expect(bold({ kind: "mortar" })).toEqual(["MOUSE TRAVERSE", "W/S RANGE", "LMB DROP BOMB", "E STAND UP"]);
    expect(bold({ kind: "foot", emplacement: "carry", mortar: true })).toEqual(["B SET UP MORTAR"]);
    expect(bold({ kind: "foot", emplacement: "placed", mortar: true })).toEqual(["B PACK UP MORTAR"]);
  });
});
