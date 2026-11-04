import { describe, expect, it } from "vitest";
import { mantleLanding, groundHeight } from "./map";
import { Game, idle, TestCollision, mantleFootLift } from "./simulation";
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
    const endTick = p.mantle!.endTick;
    while (game.tick < endTick) {
      game.step({ ...idle(), fire: true });
      events.push(...game.events);
      expect(
        p.y + (p.mantle ? mantleFootLift(p.mantle, game.tick) : 0),
      ).toBeGreaterThanOrEqual(groundHeight(p.x, p.z, trenchMap) - 0.001);
    }
    expect(p.mantle).toBeNull();
    expect(p.x).toBeGreaterThan(-18);
    expect(p.y).toBeCloseTo(2.4);
    expect(
      events.filter((e) => e.type === "mantle").map((e) => e.phase),
    ).toEqual(["start", "end"]);
    expect(
      events.filter((e) => e.type === "fire" && e.tick < endTick),
    ).toHaveLength(0);
  });

  it("walks back off the bank during mantle cooldown and resets falling on respawn", () => {
    const { game, p } = scene();
    game.step({ ...idle(), yaw: Math.PI / 2, mantle: true });
    while (p.mantle) game.step(idle());
    const cooldown = p.nextMantle,
      events = [];
    for (let i = 0; i < 35; i++) {
      game.step({ ...idle(), x: -1, yaw: -Math.PI / 2 });
      events.push(...game.events);
    }
    const start = events.find((e) => e.type === "fall" && e.phase === "start");
    expect(start?.tick).toBeLessThan(cooldown);
    expect(events.some((e) => e.type === "fall" && e.phase === "land")).toBe(
      true,
    );
    expect(events.some((e) => e.type === "mantle")).toBe(false);
    expect(p.mantle).toBeNull();
    expect(p.fall).toBeNull();
    expect(p.x).toBeLessThan(-18);
    expect(p.y).toBe(0);
    Object.assign(p, { x: -17.9, y: 2.4, vx: 0, vz: 0 });
    for (let i = 0; i < 8; i++) game.step({ ...idle(), x: -1 });
    expect(p.fall).not.toBeNull();
    game.respawn(p);
    expect(p.fall).toBeNull();
    expect(p.mantle).toBeNull();
    expect(p.y).toBe(groundHeight(p.x, p.z, trenchMap));
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
