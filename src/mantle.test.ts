import { describe, expect, it } from "vitest";
import { mantleLanding, groundHeight } from "./map";
import { Game, idle, TestCollision } from "./simulation";
import { trenchMap } from "./trench-map";

function scene() {
  const game = new Game(
    new TestCollision(trenchMap),
    false,
    300,
    12345,
    undefined,
    { map: trenchMap },
  );
  Object.assign(game.players[0], { x: -18.5, y: 0, z: -27, yaw: Math.PI / 2 });
  return { game, p: game.players[0] };
}

describe("terrain mantle", () => {
  it("climbs out, suppresses firing, lands on the bank, and logs both phases", () => {
    const { game, p } = scene();
    const events = [];
    game.step({ ...idle(), yaw: Math.PI / 2, mantle: true, fire: true });
    events.push(...game.events);
    expect(p.mantle).not.toBeNull();
    expect(p.ammo).toBe(30);
    expect(p.y).toBe(0);
    for (let i = 0; i < 30; i++) {
      game.step({ ...idle(), fire: true });
      events.push(...game.events);
      expect(p.y).toBeGreaterThanOrEqual(
        groundHeight(p.x, p.z, trenchMap) - 0.001,
      );
    }
    expect(p.mantle).toBeNull();
    expect(p.x).toBeGreaterThan(-18);
    expect(p.y).toBeCloseTo(2.4);
    expect(
      events.filter((e) => e.type === "mantle").map((e) => e.phase),
    ).toEqual(["start", "end"]);
    expect(events.filter((e) => e.type === "fire" && e.tick < 31)).toHaveLength(
      0,
    );
  });

  it("can climb down after its cooldown and resets climbing state on respawn", () => {
    const { game, p } = scene();
    game.step({ ...idle(), yaw: Math.PI / 2, mantle: true });
    for (let i = 0; i < 44; i++) game.step(idle());
    game.step({ ...idle(), yaw: -Math.PI / 2, mantle: true });
    expect(p.mantle?.to.y).toBe(0);
    for (let i = 0; i < 30; i++) game.step(idle());
    expect(p.mantle).toBeNull();
    expect(p.x).toBeLessThan(-18);
    expect(p.y).toBe(0);
    game.step({ ...idle(), yaw: Math.PI / 2, mantle: true });
    game.respawn(p);
    expect(p.mantle).toBeNull();
    expect(p.y).toBe(0);
  });

  it("rejects distant banks, solid cover, and an obstructed head/torso sweep", () => {
    expect(
      mantleLanding({ x: -21, z: -27 }, { x: 1, z: 0 }, trenchMap),
    ).toBeNull();
    const map = {
      ...trenchMap,
      boxes: [
        ...trenchMap.boxes,
        { x: -17, z: -27, w: 2, d: 2, h: 1, kind: "sandbag" as const },
      ],
    };
    expect(mantleLanding({ x: -18.5, z: -27 }, { x: 1, z: 0 }, map)).toBeNull();
    const { game, p } = scene();
    game.collision.ray = () => 0.5;
    game.step({ ...idle(), yaw: Math.PI / 2, mantle: true });
    expect(p.mantle).toBeNull();
    expect(p.x).toBe(-18.5);
    expect(game.events.some((e) => e.type === "mantle")).toBe(false);
  });
});
