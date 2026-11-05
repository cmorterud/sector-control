import { expect, it } from "vitest";
import {
  Game,
  TestCollision,
  idle,
  botAimOffset,
  type Soldier,
} from "./simulation";
import { trenchMap } from "./trench-map";

function duel(aimError = 0.02) {
  const world = new TestCollision(trenchMap);
  const game = new Game(
    { ray: (a, b) => world.ray(a, b), move: (p) => p },
    true,
    1200,
    12345,
    undefined,
    { map: trenchMap, teamSize: 1 },
  );
  game.botSettings.aimError = aimError;
  game.botSettings.reactionTicks = 0;
  const [target, shooter] = game.players;
  Object.assign(target, {
    x: -19,
    y: 0.85,
    z: -1,
    hp: 1000000,
    protectedUntil: 0,
  });
  Object.assign(shooter, {
    x: 19,
    y: 0.85,
    z: -1,
    target: target.id,
    spottedAt: -100,
    nextThink: 1e9,
    protectedUntil: 0,
  });
  return { game, target, shooter };
}

it("builds bloom on actual burst shots, recovers between bursts, and clears it on respawn", () => {
  const { game, shooter } = duel();
  // Direct rounds isolate the bloom accumulation contract from bot recognition/cadence.
  for (let i = 0; i < 4; i++) game.fire(shooter);
  expect(shooter.ammo).toBe(26);
  expect(shooter.aimBloom).toBe(1);
  game.botSettings.burstFireTicks = 0;
  for (let i = 0; i < 9; i++) game.step(idle());
  expect(shooter.aimBloom).toBeCloseTo(0.5);
  for (let i = 0; i < 9; i++) game.step(idle());
  expect(shooter.aimBloom).toBeCloseTo(0);
  shooter.aimBloom = 1;
  game.respawn(shooter);
  expect(shooter.aimBloom).toBe(0);
  expect(game.snapshot().players[1].aimBloom).toBe(0);
});

it("keeps smoothly drifting aim within the approved first-shot and sustained-fire cones", () => {
  const { shooter } = duel();
  let greatestFresh = 0,
    greatestBloom = 0;
  for (let id = 1; id <= 25; id++) {
    shooter.id = id;
    let previous: { yaw: number; pitch: number } | undefined;
    for (let tick = 0; tick < 300; tick++) {
      shooter.aimBloom = 0;
      const fresh = botAimOffset(shooter, tick, 0.026);
      greatestFresh = Math.max(
        greatestFresh,
        40 * Math.tan(Math.hypot(fresh.yaw, fresh.pitch)),
      );
      shooter.aimBloom = 1;
      const bloom = botAimOffset(shooter, tick, 0.026);
      greatestBloom = Math.max(
        greatestBloom,
        40 * Math.tan(Math.hypot(bloom.yaw, bloom.pitch)),
      );
      if (previous)
        expect(
          Math.hypot(bloom.yaw - previous.yaw, bloom.pitch - previous.pitch),
        ).toBeLessThan(0.006);
      previous = bloom;
    }
  }
  expect(greatestFresh).toBeGreaterThan(1);
  expect(greatestFresh).toBeLessThan(1.041);
  expect(greatestBloom).toBeGreaterThan(1.7);
  expect(greatestBloom).toBeLessThan(1.822);
  const other = { ...shooter, id: 100 } as Soldier;
  expect(botAimOffset(shooter, 50, 0.02)).not.toEqual(
    botAimOffset(other, 50, 0.02),
  );
  const perfect = botAimOffset(shooter, 50, 0);
  expect(perfect.yaw).toBeCloseTo(0);
  expect(perfect.pitch).toBeCloseTo(0);
});

it("reduces actual exposed-head hits while keeping bot fire dangerous and preserving firing cadence", () => {
  const measure = (error: number) => {
    const { game } = duel(error);
    let hits = 0,
      shots = 0;
    for (let i = 0; i < 900; i++) {
      game.step(idle());
      for (const event of game.events) {
        if (event.type === "fire") shots++;
        if (event.type === "impact" && event.hit) hits++;
      }
    }
    return { hits, shots };
  };
  const perfect = measure(0),
    bloom = measure(0.02),
    softer = measure(0.026);
  expect(bloom.shots).toBe(perfect.shots);
  expect(bloom.hits).toBeGreaterThan(5);
  expect(bloom.hits).toBeLessThan(perfect.hits * 0.8);
  expect(softer.shots).toBe(bloom.shots);
  expect(softer.hits).toBeGreaterThan(0);
  expect(softer.hits).toBeLessThan(bloom.hits);
});

it("leaves human rifle trajectories unchanged regardless of bloom state", () => {
  const games = [0, 1].map((aimBloom) => {
    const game = new Game({ ray: () => 1, move: (p) => p }, false);
    Object.assign(game.players[0], { x: 0, y: 0, z: 0, aimBloom });
    for (let i = 0; i < 15; i++)
      game.step({ ...idle(), fire: true, yaw: 0.4, pitch: 0.1 });
    return game;
  });
  expect(games[0].projectiles).toEqual(games[1].projectiles);
  expect(games[0].players[0].ammo).toBe(games[1].players[0].ammo);
});
