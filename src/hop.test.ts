import { describe, expect, it } from "vitest";
import { Game, hopHeight, idle, TestCollision } from "./simulation";
import { eyeHeightOf } from "./crouch";
import { groundHeight, mantleLanding } from "./map";
import { trenchMap } from "./trench-map";

const scene = () => {
  const game = new Game(
    new TestCollision(trenchMap),
    false,
    600,
    12345,
    undefined,
    { map: trenchMap },
  );
  Object.assign(game.players[0], { x: -21, y: 0, z: -27 });
  return game;
};

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
    expect(hopHeight / 0.45).toBeCloseTo(1.5, 1);
    expect(peak).toBeGreaterThan(hopHeight - 0.03);
    expect(peak).toBeLessThanOrEqual(hopHeight + 1e-9);
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
      expect(p.x).toBeLessThanOrEqual(-17.8);
    }
    expect(starts).toBe(1);
    // A steep rounded toe may catch the hop before its free-flight duration,
    // but never above the hop's own apex.
    expect(p.y).toBeLessThanOrEqual(hopHeight + 0.001);
    game.respawn(p);
    expect(p.hop).toBeNull();
    expect(p.y).toBe(groundHeight(p.x, p.z, trenchMap));
  });

  it("never lands higher up a trench wall than the hop's apex", () => {
    // Hop facing away, so Space hops instead of mantling, then back into the
    // bank from each distance: the hop stops at the face, not partway up it.
    for (let x = -19.6; x <= -18.2; x += 0.1) {
      const game = scene(),
        p = game.players[0];
      Object.assign(p, { x, y: 0, z: -27 });
      game.step({ ...idle(), yaw: -Math.PI / 2, mantle: true });
      expect(p.hop).not.toBeNull();
      for (let i = 0; i < 30; i++) game.step({ ...idle(), yaw: -Math.PI / 2, x: 1 });
      expect(p.hop).toBeNull();
      expect(p.y).toBeLessThanOrEqual(hopHeight + 0.001);
      expect(p.y + eyeHeightOf(p)).toBeLessThan(2.4);
    }
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
    expect(p.y).toBe(groundHeight(p.x, p.z, trenchMap));
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
