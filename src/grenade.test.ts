import { describe, expect, it } from "vitest";
import {
  Game,
  TestCollision,
  idle,
  grenadeFuseTicks,
  grenadeBlastRadius,
  type Event,
  type Grenade,
} from "./simulation";
import { industrialMap, type MapDefinition } from "./map";
import { trenchMap } from "./trench-map";
import { PlaytestLog, eventTimeline } from "./playtest";

const map: MapDefinition = {
  ...industrialMap,
  scoring: "eliminations",
  boxes: [],
  spawn: { blue: { x: 0, z: 0 }, red: { x: 20, z: 0 } },
};
function scene(selected = map) {
  const world = new TestCollision(selected);
  const game = new Game(
    { ray: (a, b) => world.ray(a, b), move: (p) => p },
    false,
    600,
    12345,
    undefined,
    { map: selected },
  );
  game.botSettings.engagementRange = 0;
  Object.assign(game.players[0], { x: 0, y: 0, z: 0, protectedUntil: 0 });
  return game;
}
function advance(game: Game, ticks: number) {
  const events: Event[] = [];
  for (let i = 0; i < ticks; i++) {
    game.step(idle());
    events.push(...game.events);
  }
  return events;
}
function soldier(game: Game, x: number, team: "blue" | "red" = "red") {
  const p = {
    ...game.players[0],
    id: game.players.length,
    team,
    x,
    y: 0,
    z: 0,
    nextThink: 1e9,
    protectedUntil: 0,
  };
  game.players.push(p);
  return p;
}
function bomb(game: Game, at = { x: 0, y: 0.15, z: 0 }) {
  const grenade: Grenade = {
    ...at,
    id: ++game.grenadeSequence,
    actor: 0,
    team: "blue",
    vx: 0,
    vy: 0,
    vz: 0,
    bornAt: game.tick,
    explodeAt: game.tick + 1,
  };
  game.grenades.push(grenade);
  return grenade;
}

describe("grenades", () => {
  it("gives every soldier three per spawn and replenishes inventory and throw state on respawn", () => {
    const game = new Game(new TestCollision(map), true, 600, 12345, undefined, {
      map,
      teamSize: 25,
    });
    expect(game.players).toHaveLength(50);
    expect(game.players.every((p) => p.grenades === 3)).toBe(true);
    const p = game.players[0];
    p.grenades = 0;
    p.throwUntil = 400;
    p.nextGrenade = 400;
    game.respawn(p);
    expect(p.grenades).toBe(3);
    expect(p.throwUntil).toBe(0);
    expect(p.nextGrenade).toBe(game.tick);
  });

  it("throws along the aimed yaw in a perceptible arc, bounces, and explodes exactly three seconds after release", () => {
    const game = scene();
    game.step({ ...idle(), grenade: true, yaw: Math.PI / 2, fire: true });
    const grenade = game.grenades[0];
    const start = { ...grenade };
    expect(game.players[0].grenades).toBe(2);
    expect(game.players[0].ammo).toBe(30);
    expect(grenade.vx).toBeGreaterThan(10);
    expect(grenade.vy).toBeGreaterThan(10);
    expect(Math.abs(grenade.vz)).toBeLessThan(1e-6);
    expect(game.players[0].protectedUntil).toBe(0);
    advance(game, 30);
    expect(grenade.y).toBeGreaterThan(start.y + 5);
    advance(game, 15);
    expect(grenade.vy).toBeLessThan(0);
    const events = advance(game, grenadeFuseTicks - 46);
    expect(game.grenades).toHaveLength(1);
    expect(events.some((e) => e.type === "grenadeBounce")).toBe(true);
    expect(events.some((e) => e.type === "grenadeExplosion")).toBe(false);
    game.step(idle());
    expect(game.grenades).toHaveLength(0);
    const explosion = game.events.find((e) => e.type === "grenadeExplosion");
    expect(explosion?.tick).toBe(start.bornAt + grenadeFuseTicks);
    expect(explosion?.type === "grenadeExplosion" && explosion.radius).toBe(
      grenadeBlastRadius,
    );
  });

  it("limits throws to inventory/cooldown and ignores throws while dead or mantling", () => {
    const game = scene();
    game.step({ ...idle(), grenade: true });
    game.step({ ...idle(), grenade: true });
    expect(game.players[0].grenades).toBe(2);
    for (let i = 0; i < 3; i++) {
      advance(game, 24);
      game.step({ ...idle(), grenade: true });
    }
    expect(game.players[0].grenades).toBe(0);
    expect(game.grenadeSequence).toBe(3);
    const p = game.players[0];
    p.grenades = 3;
    p.hp = 0;
    p.respawnAt = 1000;
    game.step({ ...idle(), grenade: true });
    expect(p.grenades).toBe(3);
    p.hp = 100;
    p.mantle = {
      from: { x: 0, y: 0, z: 0 },
      to: { x: 0, y: 1, z: 1 },
      edge: { x: 0, y: 1, z: 0.5 },
      yaw: 0,
      startTick: game.tick,
      endTick: game.tick + 36,
    };
    game.step({ ...idle(), grenade: true });
    expect(p.grenades).toBe(3);
  });

  it("sweeps against a thin wall rather than passing through it", () => {
    const selected: MapDefinition = {
      ...map,
      boxes: [{ x: 2, z: 0, w: 0.05, d: 10, h: 12, kind: "barrier" }],
    };
    const game = scene(selected);
    game.step({ ...idle(), grenade: true, yaw: Math.PI / 2 });
    const grenade = game.grenades[0];
    const events = advance(game, 10);
    expect(grenade.x).toBeLessThan(1.86);
    expect(grenade.vx).toBeLessThan(0);
    expect(events.some((e) => e.type === "grenadeBounce")).toBe(true);
  });

  it("releases outside a close timber panel and rebounds rather than getting stuck inside it", () => {
    const selected: MapDefinition = {
      ...map,
      boxes: [{ x: 0, z: 0, w: 0.16, d: 10, h: 4, kind: "barrier" }],
    };
    const game = scene(selected);
    game.players[0].x = -0.08;
    game.step({ ...idle(), grenade: true, yaw: Math.PI / 2 });
    const grenade = game.grenades[0];
    expect(grenade.x).toBeLessThan(-0.2);
    advance(game, 10);
    expect(grenade.x).toBeLessThan(-0.5);
    expect(grenade.vx).toBeLessThan(0);
  });

  it("applies radial falloff, kills once, credits enemy eliminations, protects allies and spawn protection", () => {
    const game = scene();
    game.players[0].x = -20;
    const near = soldier(game, 1),
      far = soldier(game, 5),
      outside = soldier(game, 8);
    const ally = soldier(game, 1, "blue"),
      protectedEnemy = soldier(game, 1);
    protectedEnemy.protectedUntil = 60;
    bomb(game);
    bomb(game);
    game.step(idle());
    expect(near.hp).toBe(0);
    expect(near.deaths).toBe(1);
    expect(far.hp).toBeGreaterThan(0);
    expect(far.hp).toBeLessThan(100);
    expect(outside.hp).toBe(100);
    expect(ally.hp).toBe(100);
    expect(protectedEnemy.hp).toBe(100);
    expect(game.players[0].kills).toBe(1);
    expect(game.scores.blue).toBe(1);
  });

  it("allows self damage without awarding a kill or elimination point", () => {
    const game = scene();
    bomb(game);
    game.step(idle());
    expect(game.players[0].hp).toBe(0);
    expect(game.players[0].kills).toBe(0);
    expect(game.players[0].deaths).toBe(1);
    expect(game.scores).toEqual({ blue: 0, red: 0 });
  });

  it("can lob from a front firing step into the opposing trench and damage a soldier below the parapet", () => {
    const game = scene(trenchMap);
    Object.assign(game.players[0], { x: -19, y: 0.85, z: -1 });
    const enemy = soldier(game, 23);
    enemy.z = -1;
    game.step({ ...idle(), yaw: Math.PI / 2, grenade: true });
    const events = advance(game, grenadeFuseTicks);
    const explosion = events.find((e) => e.type === "grenadeExplosion");
    expect(enemy.hp, JSON.stringify(explosion)).toBeLessThan(100);
    expect(game.players[0].hp).toBe(100);
  });

  it("blocks blast damage through solid cover and trench banks but reaches occupants of the same trench", () => {
    const selected: MapDefinition = {
      ...map,
      boxes: [{ x: 2, z: 0, w: 0.4, d: 10, h: 4, kind: "barrier" }],
    };
    const game = scene(selected);
    game.players[0].x = -20;
    const enemy = soldier(game, 4);
    bomb(game);
    game.step(idle());
    expect(enemy.hp).toBe(100);
    const trench = scene(trenchMap);
    trench.players[0].x = -67;
    const behindBank = soldier(trench, 21);
    behindBank.z = -1;
    bomb(trench, { x: 17, y: 2.55, z: -1 });
    trench.step(idle());
    expect(behindBank.hp).toBe(100);
    bomb(trench, { x: 22, y: 0.15, z: -1 });
    trench.step(idle());
    expect(behindBank.hp).toBe(0);
  });

  it("keeps a released grenade alive after its thrower dies, logs it, and clears active ordnance at match end", () => {
    const game = scene();
    game.step({ ...idle(), grenade: true });
    const log = new PlaytestLog();
    log.recordTick(game, { ...idle(), grenade: true }, 0);
    const snapshot = game.snapshot();
    expect(snapshot.grenades).toHaveLength(1);
    snapshot.grenades[0].x = 999;
    expect(game.grenades[0].x).not.toBe(999);
    game.players[0].hp = 0;
    game.players[0].respawnAt = 1000;
    for (let i = 0; i < grenadeFuseTicks; i++) {
      game.step(idle());
      log.recordTick(game, idle(), (i + 1) / 30);
    }
    expect(log.summary().grenadesThrown).toBe(1);
    expect(log.summary().grenadeExplosions).toBe(1);
    expect(eventTimeline(log.events)).toContain("grenadeExplosion");
    const short = scene();
    short.duration = 5;
    short.step({ ...idle(), grenade: true });
    advance(short, 4);
    expect(short.phase).toBe("ended");
    expect(short.grenades).toHaveLength(0);
    expect(new Game(new TestCollision(), false).grenades).toHaveLength(0);
  });
});

it("detonates a real thrown grenade inside either enemy trench and records damage even after its thrower dies", () => {
  for (const side of [-1, 1]) {
    const world = new TestCollision(trenchMap);
    const g = new Game(
      { ray: (a, b) => world.ray(a, b), move: (p) => ({ x: p.x, z: p.z }) },
      false,
      600,
      12345,
      { engagementRange: 0 },
      { map: trenchMap },
    );
    const p = g.players[0];
    Object.assign(p, {
      x: side * 18,
      z: -1,
      y: 0.85,
      team: side < 0 ? "blue" : "red",
      protectedUntil: 0,
    });
    const q = {
      ...structuredClone(p),
      id: 1,
      team: (side < 0 ? "red" : "blue") as "blue" | "red",
      x: -side * 23,
      y: 0,
      nextThink: 1e9,
    };
    g.players.push(q);
    g.step({ ...idle(), yaw: (-side * Math.PI) / 2, grenade: true });
    const thrown = { ...g.grenades[0] };
    expect(thrown).toBeDefined();
    p.hp = 0;
    p.respawnAt = 1000;
    const events: Event[] = [];
    for (let i = 0; i < 90; i++) {
      g.step(idle());
      events.push(...g.events);
    }
    const burst = events.find((e) => e.type === "grenadeExplosion");
    expect(burst?.tick).toBe(thrown.explodeAt);
    expect(
      burst?.type === "grenadeExplosion" &&
        burst.hits.some((h) => h.target === q.id),
    ).toBe(true);
    expect(q.hp).toBeLessThan(100);
    expect(g.grenades).toHaveLength(0);
  }
});
