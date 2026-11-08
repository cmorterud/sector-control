import { describe, it, expect } from "vitest";
import {
  Game,
  TestCollision,
  capture,
  idle,
  pathfind,
  botCommand,
  projectileSpeed,
  type Sector,
  type Soldier,
  type CollisionWorld,
} from "./simulation";
import { sectors, spawn, blocked, dist } from "./map";
const empty: CollisionWorld = {
  move: (p, d) => ({ x: p.x + d.x, z: p.z + d.z }),
  ray: () => 1,
};
const neutral = (): Sector => ({
  id: "A",
  x: 0,
  z: 0,
  control: 0,
  owner: null,
  contested: false,
});
function advance(g: Game, n: number) {
  for (let i = 0; i < n; i++) g.step(idle());
}
describe("capture", () => {
  it("requires ten seconds, preserves empty progress, and pauses contested", () => {
    const s = neutral();
    for (let i = 0; i < 150; i++) capture(s, true, false);
    expect(s.control).toBeCloseTo(0.5);
    capture(s, false, false);
    capture(s, true, true);
    expect(s.control).toBeCloseTo(0.5);
    expect(s.contested).toBe(true);
    for (let i = 0; i < 150; i++) capture(s, true, false);
    expect(s.owner).toBe("blue");
  });
  it("neutralizes before changing ownership and lets defenders restore control", () => {
    const s = neutral();
    s.owner = "blue";
    s.control = 1;
    for (let i = 0; i < 150; i++) capture(s, false, true);
    expect(s.owner).toBe("blue");
    for (let i = 0; i < 150; i++) capture(s, true, false);
    expect(s.control).toBe(1);
    for (let i = 0; i < 300; i++) capture(s, false, true);
    expect(s.owner).toBeNull();
    expect(s.control).toBe(0);
    for (let i = 0; i < 300; i++) capture(s, false, true);
    expect(s.owner).toBe("red");
  });
  it("reverses a partial neutral capture through zero", () => {
    const s = neutral();
    for (let i = 0; i < 150; i++) capture(s, true, false);
    for (let i = 0; i < 150; i++) capture(s, false, true);
    expect(s.control).toBeCloseTo(0);
    expect(s.owner).toBeNull();
  });
});
describe("combat and lifecycle", () => {
  function scene() {
    const g = new Game({ ...empty, move: (p) => ({ x: p.x, z: p.z }) }, false);
    g.botSettings.engagementRange = 0;
    g.players[0].x = 0;
    g.players[0].z = 0;
    const enemy: Soldier = {
      ...g.players[0],
      id: 1,
      team: "red",
      z: -10,
      protectedUntil: 0,
    };
    g.players.push(enemy);
    return { g, p: g.players[0], enemy };
  }
  it("deals 25 damage and kills after four shots; restores on respawn", () => {
    const { g, p, enemy } = scene();
    for (let i = 0; i < 4; i++) {
      // Recenter each deliberate shot; this fixture isolates damage/lifecycle.
      p.pitch = -p.recoilPitch;
      p.yaw = -p.recoilYaw;
      g.fire(p);
      advance(g, 3);
    }
    for (let i = 0; enemy.hp > 0 && i < 30; i++) advance(g, 1);
    expect(enemy.hp).toBe(0);
    expect(p.kills).toBe(1);
    expect(enemy.deaths).toBe(1);
    expect(p.ammo).toBe(26);
    enemy.command = idle();
    advance(g, 149);
    expect(enemy.hp).toBe(0);
    advance(g, 1);
    expect(enemy.hp).toBe(100);
    expect(enemy.ammo).toBe(30);
    expect(enemy.protectedUntil).toBe(g.tick + 60);
  });
  it("counts a single death when several traveling rounds arrive on the same tick", () => {
    const { g, p, enemy } = scene();
    enemy.hp = 25;
    g.fire(p);
    g.fire(p);
    advance(g, 15);
    expect(enemy.hp).toBe(0);
    expect(enemy.deaths).toBe(1);
    expect(p.kills).toBe(1);
  });
  it("blocks friendly fire and damage during protection", () => {
    const { g, p, enemy } = scene();
    enemy.team = "blue";
    g.fire(p);
    advance(g, 15);
    expect(enemy.hp).toBe(100);
    expect(g.projectiles).toHaveLength(0);
    enemy.team = "red";
    enemy.protectedUntil = g.tick + 60;
    g.fire(p);
    advance(g, 15);
    expect(enemy.hp).toBe(100);
    expect(g.projectiles).toHaveLength(0);
    p.protectedUntil = 60;
    g.fire(p);
    expect(p.protectedUntil).toBe(0);
  });
  it("respects world obstructions", () => {
    const { g, p, enemy } = scene();
    g.collision = { ...empty, ray: () => 0.05 };
    g.fire(p);
    expect(enemy.hp).toBe(100);
  });
  it("moves rounds at a visible finite speed and delays damage until impact", () => {
    const { g, p, enemy } = scene();
    g.fire(p);
    expect(enemy.hp).toBe(100);
    expect(g.events.some((e) => e.type === "damage")).toBe(false);
    expect(g.projectiles).toHaveLength(1);
    const initial = { ...g.projectiles[0] };
    expect(Math.hypot(initial.vx, initial.vy, initial.vz)).toBeCloseTo(
      projectileSpeed,
    );
    advance(g, 3);
    expect(
      Math.hypot(
        g.projectiles[0].x - initial.x,
        g.projectiles[0].y - initial.y,
        g.projectiles[0].z - initial.z,
      ),
    ).toBeCloseTo(projectileSpeed / 10);
    expect(enemy.hp).toBe(100);
    advance(g, 12);
    expect(enemy.hp).toBe(75);
    expect(g.projectiles).toHaveLength(0);
  });
  it("starts a new round at the muzzle before it travels on the following tick", () => {
    const g = new Game(empty, false);
    g.step({ ...idle(), fire: true });
    const shot = g.projectiles[0];
    const fire = g.events.find((e) => e.type === "fire");
    expect(fire?.type).toBe("fire");
    if (fire?.type === "fire") {
      expect({ x: shot.x, y: shot.y, z: shot.z }).toEqual(fire.from);
      g.step(idle());
      expect(
        Math.hypot(
          shot.x - fire.from.x,
          shot.y - fire.from.y,
          shot.z - fire.from.z,
        ),
      ).toBeCloseTo(projectileSpeed / 30);
    }
  });
  it("does not spawn beyond a soldier intersecting the barrel", () => {
    const { g, p, enemy } = scene();
    enemy.z = -0.6;
    g.fire(p);
    expect(enemy.hp).toBe(75);
    expect(g.projectiles).toHaveLength(0);
  });
  it("lets targets leave or enter a round's flight path after the shot", () => {
    const first = scene();
    first.g.fire(first.p);
    advance(first.g, 3);
    first.enemy.x = 3;
    advance(first.g, 15);
    expect(first.enemy.hp).toBe(100);
    const second = scene();
    second.enemy.x = 8;
    second.g.fire(second.p);
    advance(second.g, 3);
    second.enemy.x = 0;
    advance(second.g, 15);
    expect(second.enemy.hp).toBe(75);
  });
  it("sweeps each step so a round cannot tunnel through a soldier", () => {
    const { g, p, enemy } = scene();
    enemy.z = -1.7;
    g.fire(p);
    advance(g, 1);
    expect(enemy.hp).toBe(75);
    expect(g.projectiles).toHaveLength(0);
    expect(
      g.events.some(
        (e) => e.type === "impact" && e.target === enemy.id && e.hit,
      ),
    ).toBe(true);
  });
  it("hits thin walls on arrival and never spawns through nearby cover", () => {
    const { g, p, enemy } = scene();
    g.collision.ray = (a, b) =>
      a.z > -5.03 && b.z <= -5.03 ? (a.z + 5.03) / (a.z - b.z) : 1;
    g.fire(p);
    expect(g.events.some((e) => e.type === "impact")).toBe(false);
    let impact;
    for (let i = 0; i < 20 && !impact; i++) {
      advance(g, 1);
      impact = g.events.find((e) => e.type === "impact");
    }
    expect(impact?.type).toBe("impact");
    if (impact?.type === "impact") expect(impact.at.z).toBeCloseTo(-5.03);
    expect(enemy.hp).toBe(100);
    expect(g.projectiles).toHaveLength(0);
    g.collision.ray = () => 0.1;
    g.fire(p);
    expect(g.projectiles).toHaveLength(0);
    expect(g.events.some((e) => e.type === "impact" && !e.hit)).toBe(true);
  });
  it("lets allies block rounds without damage to them or the enemy behind them", () => {
    const { g, p, enemy } = scene();
    const ally = {
      ...enemy,
      id: 2,
      team: "blue" as const,
      z: -5,
      command: idle(),
    };
    g.players.push(ally);
    g.fire(p);
    let blocked = false;
    for (let i = 0; i < 20; i++) {
      advance(g, 1);
      blocked ||= g.events.some(
        (e) => e.type === "impact" && e.target === ally.id && !e.hit,
      );
    }
    expect(blocked).toBe(true);
    expect(ally.hp).toBe(100);
    expect(enemy.hp).toBe(100);
  });
  it("checks spawn protection at impact and preserves rounds after the shooter dies", () => {
    const { g, p, enemy } = scene();
    enemy.protectedUntil = 3;
    enemy.hp = 25;
    g.fire(p);
    p.hp = 0;
    p.respawnAt = 150;
    advance(g, 15);
    expect(enemy.hp).toBe(0);
    expect(p.kills).toBe(1);
    expect(p.hp).toBe(0);
  });
  it("expires rounds at sixty meters and clears them at match end", () => {
    const g = new Game(empty, false);
    g.fire(g.players[0]);
    advance(g, Math.ceil((60 / projectileSpeed) * 30) - 1);
    expect(g.projectiles).toHaveLength(1);
    advance(g, 1);
    expect(g.projectiles).toHaveLength(0);
    const short = new Game(empty, false, 1);
    short.step({ ...idle(), fire: true });
    expect(short.phase).toBe("ended");
    expect(short.projectiles).toHaveLength(0);
  });
  it("gives bots lead on a moving target for the finite projectile speed", () => {
    const { g, p, enemy } = scene();
    g.botSettings.aimError = 0;
    enemy.z = -20;
    enemy.vx = 4.5;
    p.target = enemy.id;
    p.nextThink = 100;
    g.botSettings.awareness = false;
    g.tick = 1;
    const c = botCommand(g, p);
    expect(c.yaw).toBeGreaterThan(0.02);
    expect(c.yaw).toBeLessThan(0.08);
    p.weapon = "machineGun";
    const slower = botCommand(g, p);
    expect(slower.yaw).toBeGreaterThan(c.yaw + 0.04);
    expect(slower.yaw).toBeLessThan(0.3);
  });
  it("aligns the autoplay driver with the elevated shoulder camera", () => {
    const { g, p, enemy } = scene();
    enemy.z = -20;
    p.target = enemy.id;
    p.nextThink = 100;
    g.tick = 1;
    g.botSettings.aimError = 0;
    g.botSettings.awareness = false;
    const command = botCommand(g, p);
    p.command = command;
    p.yaw = command.yaw;
    p.pitch = command.pitch;
    g.fire(p);
    advance(g, 25);
    expect(enemy.hp).toBe(75);
  });
  it("requires a fresh press per round, caps semi-auto at 300 rpm, and stops at empty", () => {
    const g = new Game(empty, false);
    const c = { ...idle(), fire: true };
    for (let i = 0; i < 90; i++) g.step(c);
    expect(g.players[0].ammo).toBe(29);
    g.step(idle());
    for (let i = 0; i < 180; i++) g.step({ ...idle(), fire: i % 6 === 0 });
    expect(g.players[0].ammo).toBe(0);
    g.step(c);
    expect(g.players[0].ammo).toBe(0);
  });
  it("reloads after exactly sixty ticks, conserves reserve, and cannot shoot while reloading", () => {
    const g = new Game(empty, false),
      p = g.players[0];
    p.ammo = 20;
    p.reserve = 7;
    g.step({ ...idle(), reload: true, fire: true });
    expect(p.ammo).toBe(20);
    advance(g, 59);
    expect(p.ammo).toBe(20);
    advance(g, 1);
    expect(p.ammo).toBe(27);
    expect(p.reserve).toBe(0);
  });
});
describe("match", () => {
  it("exports isolated JSON-safe snapshots without renderer or collision objects", () => {
    const g = new Game(empty, false);
    g.fire(g.players[0]);
    const s = g.snapshot();
    expect(s.projectiles).toHaveLength(1);
    s.projectiles[0].x = 1000;
    expect(g.projectiles[0].x).not.toBe(1000);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    s.players[0].hp = 0;
    expect(g.players[0].hp).toBe(100);
    expect(s).not.toHaveProperty("collision");
  });
  it("awards one point per owned sector every five seconds including final tick", () => {
    const g = new Game(empty, false, 300);
    g.sectors[0].owner = "blue";
    g.sectors[0].control = 1;
    g.sectors[1].owner = "blue";
    g.sectors[1].control = 1;
    g.sectors[2].owner = "red";
    g.sectors[2].control = -1;
    advance(g, 149);
    expect(g.scores.blue).toBe(0);
    advance(g, 151);
    expect(g.scores).toEqual({ blue: 4, red: 2 });
    expect(g.winner).toBe("blue");
    expect(g.phase).toBe("ended");
    g.step(idle());
    expect(g.tick).toBe(300);
  });
  it("returns draw for equal scores and red victory for red lead", () => {
    const g = new Game(empty, false, 1);
    g.step(idle());
    expect(g.winner).toBe("draw");
    const h = new Game(empty, false, 1);
    h.scores.red = 1;
    h.step(idle());
    expect(h.winner).toBe("red");
  });
  it("excludes dead soldiers from captures", () => {
    const g = new Game(empty, false);
    Object.assign(g.players[0], {
      x: sectors[0].x,
      z: sectors[0].z,
      hp: 0,
      respawnAt: 1000,
    });
    advance(g, 100);
    expect(g.sectors[0].control).toBe(0);
  });
  it("awards capture credit only to living teammates in the area", () => {
    const g = new Game(empty, false);
    Object.assign(g.players[0], sectors[0]);
    advance(g, 300);
    expect(g.players[0].captures).toBe(1);
  });
});
describe("navigation and headless portability", () => {
  it("connects both spawns to all sectors without crossing map obstacles", () => {
    for (const start of Object.values(spawn))
      for (const goal of sectors) {
        const path = pathfind(start, goal);
        expect(path.length).toBeGreaterThan(0);
        let previous = start;
        for (const node of path) {
          const n = Math.ceil(dist(previous, node) / 0.1);
          for (let i = 0; i <= n; i++)
            expect(
              blocked(
                previous.x + ((node.x - previous.x) * i) / n,
                previous.z + ((node.z - previous.z) * i) / n,
                0.45,
              ),
            ).toBe(false);
          previous = node;
        }
      }
  });
  it("slides along obstacles and prevents boundary tunneling", () => {
    const c = new TestCollision();
    expect(c.move({ x: 48, z: 40 }, { x: 2, z: 0 }).x).toBe(48);
  });
  it("runs a repeatable complete 5v5 match with kills, captures, and valid state", () => {
    const run = () => {
      const g = new Game(new TestCollision(), true);
      advance(g, 14400);
      return g;
    };
    const a = run(),
      b = run();
    expect(a.players.length).toBe(10);
    expect(a.projectiles).toHaveLength(0);
    expect(a.phase).toBe("ended");
    expect(a.scores).toEqual(b.scores);
    expect(a.players.map((p) => [p.x, p.z, p.hp, p.kills])).toEqual(
      b.players.map((p) => [p.x, p.z, p.hp, p.kills]),
    );
    expect(a.players.reduce((s, p) => s + p.kills, 0)).toBeGreaterThan(0);
    expect(a.players.reduce((s, p) => s + p.captures, 0)).toBeGreaterThan(0);
    for (const p of a.players) {
      expect(Number.isFinite(p.x + p.z)).toBe(true);
      expect(p.hp).toBeGreaterThanOrEqual(0);
      expect(p.ammo).toBeGreaterThanOrEqual(0);
      expect(p.ammo).toBeLessThanOrEqual(30);
      expect(p.reserve).toBeGreaterThanOrEqual(0);
    }
  }, 30000);
});

it("requires releasing a press made during cooldown or reload instead of firing it later", () => {
  const g = new Game(empty, false),
    p = g.players[0];
  g.step({ ...idle(), fire: true });
  g.step(idle());
  g.step({ ...idle(), fire: true });
  for (let i = 0; i < 12; i++) g.step({ ...idle(), fire: true });
  expect(p.ammo).toBe(29);
  g.step(idle());
  g.step({ ...idle(), fire: true });
  expect(p.ammo).toBe(28);
  g.step(idle());
  g.step({ ...idle(), reload: true, fire: true });
  for (let i = 0; i < 65; i++) g.step({ ...idle(), fire: true });
  expect(p.ammo).toBe(30);
  g.step(idle());
  g.step({ ...idle(), fire: true });
  expect(p.ammo).toBe(29);
});
it("does not fire a held trigger automatically after respawning", () => {
  const g = new Game(empty, false),
    p = g.players[0];
  p.hp = 0;
  p.respawnAt = 3;
  for (let i = 0; i < 6; i++) g.step({ ...idle(), fire: true });
  expect(p.hp).toBe(100);
  expect(p.ammo).toBe(30);
  g.step(idle());
  g.step({ ...idle(), fire: true });
  expect(p.ammo).toBe(29);
});
