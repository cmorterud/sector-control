import { describe, expect, it } from "vitest";
import { industrialMap } from "./map";
import { Game, TestCollision, idle, type Command, type Event } from "./simulation";
import { addShotHeat, botHoldsFire, coolBarrel, heatRules, ventSeconds, type BarrelHeat } from "./weapon-heat";
import { shotInterval, weaponStats } from "./weapon-stats";

const fresh = (): BarrelHeat => ({ heat: 0, overheated: false });

describe("barrel heat rules", () => {
  it("never seizes a rifle or pistol, however fast it is fired", () => {
    for (const kind of ["serviceRifle", "rifle", "pistol"] as const) {
      const barrel = fresh();
      for (let i = 0; i < 400; i++) expect(addShotHeat(barrel, kind)).toBe(false);
      expect(barrel.heat).toBe(1);
      expect(barrel.overheated).toBe(false);
    }
  });

  it("seizes a machine gun at full heat and frees it once cooled to the resume point", () => {
    const barrel = fresh();
    let shots = 0;
    while (!addShotHeat(barrel, "emplaced")) shots++;
    expect(shots).toBeGreaterThan(40);
    expect(barrel.overheated).toBe(true);
    expect(ventSeconds(barrel)).toBeCloseTo((1 - heatRules.resumeAt) / heatRules.ventCooling);
    let ticks = 0;
    while (barrel.overheated) { coolBarrel(barrel); ticks++; }
    expect(ticks / 30).toBeCloseTo((1 - heatRules.resumeAt) / heatRules.ventCooling, 0);
    expect(barrel.heat).toBeLessThanOrEqual(heatRules.resumeAt);
  });

  it("keeps up short bursts indefinitely", () => {
    const barrel = fresh(), interval = shotInterval(weaponStats.find(w => w.id === "vickers")!);
    // Two-second bursts with two seconds' rest.
    for (let tick = 0; tick < 30 * 120; tick++) {
      if (tick % 120 < 60 && tick % interval === 0) expect(addShotHeat(barrel, "emplaced")).toBe(false);
      coolBarrel(barrel);
    }
    expect(barrel.heat).toBeLessThan(0.9);
  });

  it("tells bots to ease off before the barrel seizes", () => {
    expect(botHoldsFire({ heat: 0.5, overheated: false })).toBe(false);
    expect(botHoldsFire({ heat: 0.9, overheated: false })).toBe(true);
    expect(botHoldsFire({ heat: 0.5, overheated: true })).toBe(true);
  });
});

describe("an emplaced gun under sustained fire", () => {
  function mounted() {
    const map = { ...industrialMap, id: "village" as const, boxes: [] };
    const game = new Game(new TestCollision(map), true, 3000, 42, undefined, { map, teamSize: 2, ambientArtillery: false });
    game.commandOverride = () => idle();
    const player = game.players[0];
    game.selectLoadout(player, "emplacement");
    Object.assign(player, { x: 0, z: 4, yaw: 0 });
    for (const q of game.players.slice(1)) Object.assign(q, { x: 30, z: 30 });
    const step = (input: Partial<Command> = {}) => { game.step({ ...idle(), ...input }); return game.events as Event[]; };
    step({ deployGun: true });
    const gun = game.emplacements.get(player.id)!;
    while (game.tick < gun.readyAt) step();
    step({ interact: true });
    gun.reserve = gun.ammo = 100000;
    return { game, gun, step };
  }

  it("overheats after about nine seconds of unbroken fire, then vents before firing again", () => {
    const { game, gun, step } = mounted();
    const start = game.tick;
    let overheatAt = -1;
    while (overheatAt < 0 && game.tick - start < 30 * 20) {
      const events = step({ fire: true });
      const fired = events.find(e => e.type === "fire");
      if (fired?.type === "fire") expect(fired.emplacement).toBe(gun.owner);
      if (events.some(e => e.type === "overheat")) overheatAt = game.tick;
    }
    const seconds = (overheatAt - start) / 30;
    expect(seconds).toBeGreaterThan(7.5);
    expect(seconds).toBeLessThan(10.5);
    let silent = 0;
    while (!step({ fire: true }).some(e => e.type === "fire")) silent++;
    expect(silent / 30).toBeGreaterThan(3);
    expect(silent / 30).toBeLessThan(4.5);
    expect(gun.barrel.overheated).toBe(false);
  });

  it("reports the barrel heat on each shot", () => {
    const { step } = mounted();
    const heats: number[] = [];
    for (let i = 0; i < 60; i++) for (const e of step({ fire: true })) if (e.type === "fire") heats.push(e.heat!);
    expect(heats.length).toBeGreaterThan(10);
    for (let i = 1; i < heats.length; i++) expect(heats[i]).toBeGreaterThan(heats[i - 1]);
  });
});
