import { describe, it, expect } from "vitest";
import {
  Game,
  TestCollision,
  capture,
  idle,
  pathfind,
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
    const g = new Game(empty, false);
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
      g.tick += 3;
      g.fire(p);
    }
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
  it("blocks friendly fire and damage during protection", () => {
    const { g, p, enemy } = scene();
    enemy.team = "blue";
    g.fire(p);
    expect(enemy.hp).toBe(100);
    enemy.team = "red";
    enemy.protectedUntil = 60;
    g.fire(p);
    expect(enemy.hp).toBe(100);
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
  it("fires at 600 rpm and stops at an empty magazine", () => {
    const g = new Game(empty, false);
    const c = { ...idle(), fire: true };
    for (let i = 0; i < 90; i++) g.step(c);
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
    const s = g.snapshot();
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
