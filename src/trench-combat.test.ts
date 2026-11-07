import { describe, expect, it } from "vitest";
import {
  Game,
  TestCollision,
  idle,
  defaultBotSettings,
  botCommand,
} from "./simulation";
import { trenchMap } from "./trench-map";

function scene(range = 0) {
  const world = new TestCollision(trenchMap);
  const game = new Game(
    { ray: (a, b) => world.ray(a, b), move: (p) => ({ x: p.x, z: p.z }) },
    false,
    600,
    12345,
    {
      ...defaultBotSettings,
      awareness: false,
      engagementRange: range,
      reactionTicks: 0,
      aimError: 0,
    },
    { map: { ...trenchMap, scoring: "eliminations" } },
  );
  const template = game.players[0];
  template.hp = 0;
  template.respawnAt = 1e9;
  const blue = {
    ...template,
    id: 1,
    teamIndex: 1,
    team: "blue" as const,
    hp: 100,
    x: -19,
    y: 0.85,
    z: -1,
    yaw: Math.PI / 2,
    protectedUntil: 0,
    nextThink: 1e9,
  };
  const red = {
    ...blue,
    id: 2,
    team: "red" as const,
    x: 23,
    y: 0,
    yaw: -Math.PI / 2,
  };
  game.players.push(blue, red);
  return { game, blue, red };
}
const advance = (g: Game, n: number) => {
  for (let i = 0; i < n; i++) g.step(idle());
};

describe("firing-step trench combat", () => {
  it("hides a soldier on the floor, but lets arriving rounds hit an exposed head on the step", () => {
    const { game, blue, red } = scene();
    const aimedShot = () => {
      // Isolate cover and head damage with deliberately recentered shots.
      blue.pitch = -blue.recoilPitch;
      blue.yaw = Math.PI / 2 - blue.recoilYaw;
      game.fire(blue);
    };
    for (let i = 0; i < 4; i++) aimedShot();
    advance(game, 75);
    expect(red.hp).toBe(100);
    expect(game.scores.blue).toBe(0);
    Object.assign(red, { x: 19, y: 0.85 });
    for (let i = 0; i < 4; i++) aimedShot();
    advance(game, 50);
    expect(red.hp).toBe(0);
    expect(red.deaths).toBe(1);
    expect(blue.kills).toBe(1);
    expect(game.scores).toEqual({ blue: 1, red: 0 });
  });

  it("acquires an exposed head only when its own rifle is clear of the bank", () => {
    const { game, blue, red } = scene(59);
    Object.assign(red, { x: 19, y: 0.85 });
    Object.assign(blue, { x: -23, y: 0 });
    game.tick = 1;
    expect(botCommand(game, blue).fire).toBe(false);
    expect(blue.target).toBe(-1);
    Object.assign(blue, { x: -19, y: 0.85 });
    game.tick = 4;
    const command = botCommand(game, blue);
    expect(blue.target).toBe(red.id);
    expect(command.fire).toBe(true);
    expect(Math.abs(command.pitch)).toBeLessThan(0.01);
  });

  it("does not award domination points for standing in no man’s land", () => {
    const game = new Game(
      new TestCollision(trenchMap),
      false,
      330,
      12345,
      undefined,
      { map: trenchMap },
    );
    Object.assign(game.players[0], { x: 0, y: 2.4, z: 0 });
    const events = [];
    for (let i = 0; i < 330; i++) {
      game.step(idle());
      events.push(...game.events);
    }
    expect(game.snapshot().scoring).toBe("domination");
    expect(game.scores).toEqual({ blue: 0, red: 0 });
    expect(events.some((e) => e.type === "capture")).toBe(false);
    expect(game.phase).toBe("ended");
  });
});

it("keeps the firing-step battle active through a full eight-minute match", () => {
  const game = new Game(
    new TestCollision(trenchMap),
    true,
    480 * 30,
    12345,
    undefined,
    { map: { ...trenchMap, scoring: "eliminations" }, teamSize: 25 },
  );
  let shots = 0,
    lateShots = 0,
    deaths = 0,
    creditedDeaths = 0,
    environmentalDeaths = 0,
    lateDeaths = 0;
  const damageSources = new Map<number, number>();
  for (let i = 0; i < 480 * 30; i++) {
    game.step(botCommand(game, game.players[0]));
    for (const e of game.events) {
      if (e.type === "fire") {
        shots++;
        if (i >= 420 * 30) lateShots++;
      }
      if (e.type === "damage") damageSources.set(e.actor, e.source);
      if (e.type === "death") {
        const source = damageSources.get(e.actor);
        if (source === -1) environmentalDeaths++;
        else if (source !== undefined && source !== e.actor) creditedDeaths++;
        deaths++;
        if (i >= 420 * 30) lateDeaths++;
      }
    }
  }
  expect(game.phase).toBe("ended");
  expect(game.scores.blue + game.scores.red).toBe(creditedDeaths);
  expect(environmentalDeaths).toBeGreaterThan(0);
  expect(creditedDeaths + environmentalDeaths).toBeLessThanOrEqual(deaths);
  expect(
    lateShots,
    JSON.stringify({
      shots,
      lateShots,
      deaths,
      lateDeaths,
      empty: game.players.filter((p) => p.ammo === 0 && p.reserve === 0).length,
    }),
  ).toBeGreaterThan(100);
  expect(lateDeaths).toBeGreaterThan(0);
}, 60000);
