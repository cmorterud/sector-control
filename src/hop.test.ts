import { describe, expect, it } from "vitest";
import { Game, idle, TestCollision } from "./simulation";
import { groundHeight, mantleLanding } from "./map";
import { trenchMap } from "./trench-map";

const scene = () =>
  new Game(new TestCollision(trenchMap), false, 600, 12345, undefined, {
    map: trenchMap,
  });

describe("Space hop fallback", () => {
  it("takes a short ballistic hop, keeps moving, lands, and logs both phases", () => {
    const game = scene(),
      p = game.players[0];
    const x = p.x;
    const events = [];
    game.step({ ...idle(), x: 1, mantle: true });
    events.push(...game.events);
    expect(p.hop).not.toBeNull();
    expect(p.mantle).toBeNull();
    let peak = p.y;
    for (let i = 0; i < 25; i++) {
      game.step({ ...idle(), x: 1 });
      peak = Math.max(peak, p.y);
      events.push(...game.events);
    }
    expect(peak).toBeGreaterThan(0.4);
    expect(peak).toBeLessThan(0.5);
    expect(p.x).toBeGreaterThan(x + 2);
    expect(p.hop).toBeNull();
    expect(p.y).toBe(groundHeight(p.x, p.z, trenchMap));
    expect(events.filter((e) => e.type === "hop").map((e) => e.phase)).toEqual([
      "start",
      "land",
    ]);
  });

  it("does not restart in midair or bypass a trench bank", () => {
    const game = scene(),
      p = game.players[0];
    Object.assign(p, { x: -18.5, y: 0, z: -27 });
    // Face away from the ledge so the initial press hops instead of mantling.
    game.step({ ...idle(), yaw: -Math.PI / 2, mantle: true });
    let starts = 1;
    for (let i = 0; i < 10; i++) {
      game.step({ ...idle(), x: 1, mantle: true });
      starts += game.events.filter(
        (e) => e.type === "hop" && e.phase === "start",
      ).length;
      expect(p.mantle).toBeNull();
      expect(p.x).toBeLessThanOrEqual(-18);
    }
    expect(starts).toBe(1);
    expect(p.hop).not.toBeNull();
    game.respawn(p);
    expect(p.hop).toBeNull();
    expect(p.y).toBe(0);
  });

  it("stops upward movement at a low ceiling and lands cleanly", () => {
    const game = scene(),
      p = game.players[0];
    game.collision.ray = (a, b) =>
      b.y > 2.15 && b.y > a.y ? Math.max(0, (2.15 - a.y) / (b.y - a.y)) : 1;
    game.step({ ...idle(), mantle: true });
    let peak = p.y;
    for (let i = 0; i < 25; i++) {
      game.step(idle());
      peak = Math.max(peak, p.y);
    }
    expect(peak).toBeGreaterThan(0.1);
    expect(peak).toBeLessThanOrEqual(0.25);
    expect(p.hop).toBeNull();
    expect(p.y).toBe(0);
  });

  it("prefers a valid mantle but hops on walkable ramps", () => {
    const game = scene(),
      p = game.players[0];
    Object.assign(p, { x: -18.5, y: 0, z: -27 });
    game.step({ ...idle(), yaw: Math.PI / 2, mantle: true });
    expect(p.mantle).not.toBeNull();
    expect(p.hop).toBeNull();
    game.respawn(p);
    Object.assign(p, { x: -14, y: 1.2, z: -1 });
    expect(mantleLanding(p, { x: 1, z: 0 }, trenchMap)).toBeNull();
    game.step({ ...idle(), yaw: Math.PI / 2, mantle: true });
    expect(p.hop).not.toBeNull();
    expect(p.mantle).toBeNull();
  });
});
