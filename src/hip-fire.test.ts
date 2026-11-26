import { describe, expect, it } from "vitest";
import { Game, TestCollision, idle } from "./simulation";
import { trenchMap } from "./trench-map";
import { aimBlend } from "./weapon-handling";
import { botSightsReady, hipFireRules, hipSpread, maskBlocksAim, movementSpread } from "./hip-fire";
import { gasRules } from "./gas";

const sealed = (tick: number) => ({ worn: true, since: tick - gasRules.donTicks - 1, from: 1 });

// A bot rifleman 38 m from a target that cannot die, as in bot-bloom.test.ts.
function duel(gap = 38, aimError = 0.02) {
  const world = new TestCollision(trenchMap);
  const game = new Game({ ray: (a, b) => world.ray(a, b), move: (p) => p }, true, 1200, 12345, undefined, { map: trenchMap, teamSize: 1 });
  game.botSettings.aimError = aimError;
  for (const p of game.players) { p.weapon = "rifle"; game.respawn(p); }
  game.artillery.enabled = false;
  game.botSettings.reactionTicks = 0;
  const [target, shooter] = game.players;
  Object.assign(target, { x: -19, y: 0.85, z: -1, hp: 1000000, protectedUntil: 0 });
  Object.assign(shooter, { x: -19 + gap, y: 0.85, z: -1, target: target.id, spottedAt: -100, nextThink: 1e9, protectedUntil: 0 });
  return { game, target, shooter };
}
function measure(masked: boolean, gap = 38, aimError?: number) {
  const { game, shooter } = duel(gap, aimError);
  let hits = 0, shots = 0, aimedShots = 0;
  for (let i = 0; i < 900; i++) {
    // Keep the mask on: there is no cloud, so the bot would otherwise take it off.
    if (masked) { shooter.gasMask = sealed(game.tick); shooter.gasClearSince = game.tick; }
    game.step(idle());
    for (const e of game.events) {
      if (e.type === "fire" && e.actor === shooter.id) { shots++; if (aimBlend(shooter, game.tick) >= 0.99) aimedShots++; }
      if (e.type === "impact" && e.hit && e.actor === shooter.id) hits++;
    }
  }
  return { hits, shots, aimedShots };
}

describe("hip fire", () => {
  it("keeps the sights down while a mask is on or going on", () => {
    const g = new Game({ ray: () => 1, move: (p) => p }, false);
    const p = g.players[0];
    for (let i = 0; i < 10; i++) g.step({ ...idle(), aim: true });
    expect(aimBlend(p, g.tick)).toBe(1);
    p.gasMask = { worn: true, since: g.tick, from: 0 };
    expect(maskBlocksAim(p)).toBe(true);
    for (let i = 0; i < 10; i++) g.step({ ...idle(), aim: true });
    expect(p.command.aim).toBe(false);
    expect(aimBlend(p, g.tick)).toBe(0);
    p.gasMask = sealed(g.tick);
    for (let i = 0; i < 10; i++) g.step({ ...idle(), aim: true });
    expect(aimBlend(p, g.tick)).toBe(0);
    // Off again, the sights come back up.
    p.gasMask = null;
    for (let i = 0; i < 10; i++) g.step({ ...idle(), aim: true });
    expect(aimBlend(p, g.tick)).toBe(1);
  });

  it("spreads hip shots and leaves aimed shots on the sights", () => {
    const g = new Game({ ray: () => 1, move: (p) => p }, false);
    const p = g.players[0];
    p.weapon = "serviceRifle";
    p.weaponId = undefined;
    expect(hipSpread(p, g.tick)).toBeCloseTo(hipFireRules.generic.serviceRifle * hipFireRules.still);
    for (let i = 0; i < 10; i++) g.step({ ...idle(), aim: true });
    expect(hipSpread(p, g.tick)).toBe(0);
    p.crouched = true;
    p.aimMotion = undefined; p.command = idle();
    expect(hipSpread(p, g.tick)).toBeCloseTo(hipFireRules.generic.serviceRifle * hipFireRules.still * hipFireRules.crouched);
  });

  it("tightens the hip cone standing still and opens it in proportion to speed", () => {
    const g = new Game({ ray: () => 1, move: (p) => p }, false);
    const p = g.players[0];
    p.weapon = "serviceRifle";
    p.weaponId = undefined;
    const at = (vx: number) => { p.vx = vx; p.vz = 0; return hipSpread(p, g.tick); };
    const base = hipFireRules.generic.serviceRifle;
    expect(at(0)).toBeLessThan(base);
    expect(at(4.5)).toBeCloseTo(base * 1.5);
    expect(at(7)).toBeGreaterThan(at(4.5));
    // Proportional: each extra metre per second adds the same width.
    expect(at(3) - at(2)).toBeCloseTo(at(2) - at(1));
    expect(movementSpread(100)).toBe(hipFireRules.maxMoving);
  });

  it("sends a player's hip shots off the crosshair but not their aimed ones", () => {
    const directions = (aim: boolean) => {
      const g = new Game({ ray: () => 1, move: (p) => p }, false);
      g.commandOverride = () => idle();
      const p = g.players[0];
      Object.assign(p, { x: 0, y: 0, z: 0 });
      const out: number[] = [];
      for (let i = 0; i < 12; i++) g.step({ ...idle(), aim, yaw: 0.4, pitch: 0.1 });
      for (let i = 0; i < 90; i++) {
        g.step({ ...idle(), aim, fire: i % 2 === 0, yaw: 0.4, pitch: 0.1 });
        for (const e of g.events) if (e.type === "fire" && e.actor === 0) out.push(Math.atan2(e.to.x - e.from.x, -(e.to.z - e.from.z)));
      }
      return out;
    };
    const spread = (yaws: number[]) => Math.max(...yaws) - Math.min(...yaws);
    const aimed = directions(true), hip = directions(false);
    expect(aimed.length).toBeGreaterThan(2);
    expect(hip.length).toBe(aimed.length);
    expect(spread(hip)).toBeGreaterThan(spread(aimed) + 0.02);
  });

  it("makes bots raise their sights before firing, and miss more in a mask", () => {
    const aimed = measure(false), masked = measure(true);
    expect(aimed.shots).toBeGreaterThan(10);
    // Every unmasked bot round leaves with the sights up.
    expect(aimed.aimedShots).toBe(aimed.shots);
    expect(masked.aimedShots).toBe(0);
    expect(masked.shots).toBeGreaterThan(10);
    expect(masked.hits / masked.shots).toBeLessThan((aimed.hits / aimed.shots) * 0.6);
  });

  it("costs a masked bot accuracy up close too, where the hip cone is small", () => {
    // At 8 m, with the trench's own bot aim, the cone alone barely matters;
    // the masked bot's worse aim does.
    const aimError = new Game({ ray: () => 1, move: (p) => p }, false, 1200, 1, undefined, { map: trenchMap }).botSettings.aimError;
    const aimed = measure(false, 8, aimError), masked = measure(true, 8, aimError);
    expect(masked.shots).toBeGreaterThan(10);
    expect(masked.hits / masked.shots).toBeLessThan((aimed.hits / aimed.shots) * 0.6);
  });

  it("lets a masked bot fire from the hip, and holds an unmasked one until the sights are up", () => {
    const { game, shooter } = duel();
    shooter.aimMotion = { tick: game.tick, from: 0, to: 1, duration: 6 };
    expect(botSightsReady(shooter, game.tick + 2)).toBe(false);
    expect(botSightsReady(shooter, game.tick + 6)).toBe(true);
    shooter.aimMotion = { tick: game.tick, from: 1, to: 0, duration: 6 };
    shooter.gasMask = sealed(game.tick);
    expect(botSightsReady(shooter, game.tick + 6)).toBe(true);
  });
});
