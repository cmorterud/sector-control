import { describe, expect, it } from "vitest";
import { dodgeMortar, mortarBotCommand, mortarTarget } from "./bot-mortar";
import { mountedGun } from "./emplacements";
import { rosterRoles } from "./loadouts";
import { industrialMap, type MapDefinition } from "./map";
import { mortarRules } from "./mortar-stats";
import { Game, TestCollision, idle } from "./simulation";

function field() {
  const map: MapDefinition = { ...industrialMap, id: "village", boxes: [] };
  const game = new Game(new TestCollision(map), true, 3000, 7, undefined, { map, teamSize: 3, ambientArtillery: false });
  const bot = game.players[1], spotter = game.players[2];
  const enemies = game.players.filter(p => p.team === "red");
  game.selectLoadout(bot, "mortar");
  game.respawn(bot);
  Object.assign(bot, { x: 0, z: 30, y: 0, yaw: 0, mode: "Firing step", protectedUntil: 0 });
  Object.assign(spotter, { x: 4, z: 30, y: 0 });
  Object.assign(game.players[0], { x: -6, z: 34, y: 0 });
  enemies.forEach((q, i) => Object.assign(q, { x: i * 1.5, z: -28 - (i % 2), y: 0, hp: 100, protectedUntil: 0 }));
  game.commandOverride = (g, s) => {
    if (s === spotter) s.target = enemies[0].id;
    for (const q of enemies) if (q.hp > 0) Object.assign(q, { vx: 0, vz: 0 });
    return s === bot ? mortarBotCommand(g, s, { ...idle(), yaw: s.yaw }) : idle();
  };
  return { game, bot, spotter, enemies };
}

describe("mortar bots", () => {
  it("are 2 of a 50-man side on mortar maps, keeping riflemen the clear majority", () => {
    for (const tanks of [false, true]) {
      const roles = rosterRoles(50, tanks, true);
      expect(roles.filter(r => r === "mortar")).toHaveLength(2);
      expect(roles.filter(r => r === "rifleman").length / 50).toBeGreaterThanOrEqual(0.7);
      expect(roles[0]).toBe("rifleman");
    }
    expect(rosterRoles(50, false, false)).not.toContain("mortar");
    expect(rosterRoles(12, false, true)).not.toContain("mortar");
  });

  it("set up, lay the tube on a group a teammate is fighting, and bracket onto it", () => {
    const { game, bot, enemies } = field();
    const misses: number[] = [];
    for (let i = 0; i < 30 * 30 && misses.length < 3; i++) {
      game.step(idle());
      for (const e of game.events)
        if (e.type === "mortar" && e.phase === "impact" && e.actor === bot.id) misses.push(Math.hypot(e.at.x - enemies[0].x, e.at.z - enemies[0].z));
      if (enemies[0].hp <= 0) break;
    }
    const gun = game.emplacements.get(bot.id);
    expect(gun?.mortar).toBeDefined();
    expect(mountedGun(game, bot)).toBe(gun);
    expect(misses.length).toBeGreaterThan(0);
    // The bracket closes: the first bomb is the widest, or the target is already down.
    if (misses.length > 1) expect(Math.min(...misses.slice(1))).toBeLessThan(misses[0]);
    expect(enemies.some(q => q.hp < 100)).toBe(true);
  });

  it("only pick targets in the band, inside the arc, that someone sees", () => {
    const { game, bot, spotter, enemies } = field();
    const from = { x: bot.x, z: bot.z };
    spotter.target = -1;
    expect(mortarTarget(game, bot, from, 0)).toBeUndefined();
    spotter.target = enemies[0].id;
    expect(mortarTarget(game, bot, from, 0)?.id).toBe(enemies[0].id);
    expect(mortarTarget(game, bot, from, Math.PI)).toBeUndefined();
    Object.assign(enemies[0], { z: 30 - mortarRules.maxRange - 10 });
    expect(mortarTarget(game, bot, from, 0)?.id).not.toBe(enemies[0].id);
  });

  it("dive away from a bomb whistling down close by", () => {
    const { game, spotter } = field();
    game.mortars.bombs.push({ id: 1, actor: 99, team: "red", owner: 99, from: { x: 0, y: 1, z: -40 }, aim: { x: 4, z: 28 }, target: { x: 4, y: 0, z: 28 },
      weaponId: "Granatenwerfer 16", x: 4, y: 10, z: 28, vx: 0, vy: -5, vz: 0, bornAt: 0, landsAt: 30, whistled: true });
    const c = dodgeMortar(game, spotter, idle());
    expect(c.sprint).toBe(true);
    expect(Math.hypot(c.x, c.z)).toBeCloseTo(1, 5);
    expect(c.z).toBeGreaterThan(0.9);
  });
});
