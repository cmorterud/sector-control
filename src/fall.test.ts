import { describe, it, expect } from "vitest";
import { Game, TestCollision, idle, type Event } from "./simulation";
import { trenchMap } from "./trench-map";
import { groundHeight, industrialMap } from "./map";
import { artilleryTargetReason } from "./artillery";
import { grenadeExplosionProfile } from "./destruction";
import { PlaytestLog } from "./playtest";
function scene(x = -17.6, z = -27) {
  const g = new Game(
    new TestCollision(trenchMap),
    false,
    1800,
    12345,
    undefined,
    { map: trenchMap },
  );
  Object.assign(g.players[0], {
    x,
    z,
    y: groundHeight(x, z, g.map),
    vx: 0,
    vz: 0,
    protectedUntil: 0,
  });
  return { g, p: g.players[0] };
}

describe("walking off terrain edges", () => {
  it("falls onto trench floors and firing steps without Space, including through real runtime lining", () => {
    for (const [x, z, dx, landing] of [
      [-17.6, -27, -1, 0],
      [-17.6, -1, -1, 0.85],
      [17.6, -1, 1, 0.85],
    ]) {
      const { g, p } = scene(x, z),
        log = new PlaytestLog();
      let airborne = false,
        previous = p.y;
      for (let i = 0; i < 50; i++) {
        const c = { ...idle(), x: i < (landing ? 8 : 12) ? dx : 0 };
        g.step(c);
        log.recordTick(g, c, i / 30);
        airborne ||= !!p.fall;
        expect(p.y).toBeGreaterThanOrEqual(groundHeight(p.x, p.z, g.map));
        expect(previous - p.y).toBeLessThan(0.4);
        previous = p.y;
        expect(p.mantle).toBeNull();
        expect(p.hop).toBeNull();
      }
      expect(airborne).toBe(true);
      expect(p.fall).toBeNull();
      expect(p.y).toBeCloseTo(landing);
      expect(p.hp).toBe(100);
      expect(log.summary().falls).toBe(1);
      expect(log.summary().fallLandings).toBe(1);
      expect(
        log.events.some((e) => e.type === "mantle" || e.type === "hop"),
      ).toBe(false);
      const xAfter = p.x;
      g.step({ ...idle(), x: dx });
      expect(dx * (p.x - xAfter)).toBeGreaterThan(0);
    }
  });
  it("drops from a firing step while crouched and settles on the floor", () => {
    const { g, p } = scene(-19, -1);
    p.y = 0.85;
    const events: Event[] = [];
    for (let i = 0; i < 120; i++) {
      g.step({ ...idle(), z: i < 90 ? 1 : 0, crouch: true });
      events.push(...g.events);
    }
    expect(events.some((e) => e.type === "fall" && e.phase === "start")).toBe(
      true,
    );
    expect(p.fall).toBeNull();
    expect(p.y).toBe(0);
    expect(p.crouched).toBe(true);
  });
  it("continues an actual hop over an edge without snapping its root down to the new floor", () => {
    const { g, p } = scene(-17.6, -27);
    let peak = p.y;
    g.step({ ...idle(), x: -1, yaw: -Math.PI / 2, mantle: true });
    expect(p.hop).not.toBeNull();
    for (let i = 0; i < 50; i++) {
      const before = p.y;
      g.step({ ...idle(), x: i < 12 ? -1 : 0 });
      peak = Math.max(peak, p.y);
      expect(before - p.y).toBeLessThan(0.45);
    }
    expect(peak).toBeGreaterThan(2.8);
    expect(p.hop).toBeNull();
    expect(p.fall).toBeNull();
    expect(p.y).toBe(0);
  });
  it("still blocks walking uphill through the bank and through the rear wooden screen", () => {
    const { g, p } = scene(-18.6, -27);
    for (let i = 0; i < 30; i++) g.step({ ...idle(), x: 1 });
    expect(p.x).toBeLessThan(-18);
    expect(p.y).toBe(0);
    Object.assign(p, { x: -53, z: -9, y: 2.4, vx: 0, vz: 0 });
    for (let i = 0; i < 30; i++) g.step({ ...idle(), x: 1 });
    expect(p.x).toBeLessThan(-51.5);
  });
  it("prevents turning into an earth wall below its crest while falling", () => {
    const { g, p } = scene();
    for (let i = 0; i < 12; i++) g.step({ ...idle(), x: -1 });
    for (let i = 0; i < 60 && p.y > 1.4; i++) g.step(idle());
    expect(p.y).toBeLessThanOrEqual(1.4);
    expect(p.fall).not.toBeNull();
    for (let i = 0; i < 20; i++) g.step({ ...idle(), x: 1 });
    expect(p.x).toBeLessThan(-18);
    expect(p.y).toBe(0);
  });
  it("follows walkable slopes normally and falls when an explosion removes supporting ground", () => {
    const { g, p } = scene(-43, -1);
    for (let i = 0; i < 20; i++) {
      g.step({ ...idle(), x: 1 });
      expect(p.fall).toBeNull();
      expect(p.y).toBeCloseTo(groundHeight(p.x, p.z, g.map));
    }
    const crater = new Game(
      new TestCollision({ ...industrialMap, boxes: [] }),
      false,
    );
    const q = crater.players[0];
    Object.assign(q, { x: 0, z: 0, y: 0, protectedUntil: 0 });
    crater.explode({ x: 0, y: 0.1, z: 0 }, 0, "blue", {
      ...grenadeExplosionProfile,
      damage: 0,
      structuralDamage: 0,
    });
    expect(q.fall).not.toBeNull();
    expect(q.y).toBe(0);
    for (let i = 0; i < 30; i++) crater.step(idle());
    expect(q.fall).toBeNull();
    expect(q.y).toBeLessThan(-0.4);
    expect(q.y).toBe(groundHeight(q.x, q.z, crater.map));
  });
  it("cannot hop or spot artillery in freefall and resets serialized state on death and respawn", () => {
    const { g, p } = scene();
    g.tick = 900;
    for (let i = 0; i < 10; i++) g.step({ ...idle(), x: -1 });
    expect(p.fall).not.toBeNull();
    const snapshot = g.snapshot(),
      velocity = snapshot.players[0].fall!.velocity;
    expect(artilleryTargetReason(g, p, { x: 19, z: -27 })).toContain(
      "solid ground",
    );
    g.step({ ...idle(), mantle: true });
    expect(p.hop).toBeNull();
    expect(p.mantle).toBeNull();
    expect(snapshot.players[0].fall!.velocity).toBe(velocity);
    g.explode({ x: p.x, y: p.y + 1.2, z: p.z }, 0, "blue", {
      ...grenadeExplosionProfile,
      damage: 500,
      craterRadius: 0,
      structuralDamage: 0,
    });
    expect(p.hp).toBe(0);
    expect(p.fall).toBeNull();
    g.respawn(p);
    expect(p.fall).toBeNull();
    expect(p.hop).toBeNull();
    expect(p.y).toBe(groundHeight(p.x, p.z, g.map));
  });
});
