import { describe, expect, it } from "vitest";
import { Game, idle } from "./simulation";
import { hipSpread } from "./hip-fire";
import { coneRadius, ringMinRadius, spreadRingRadius } from "./spread-reticle";

const game = () => {
  const g = new Game({ ray: () => 1, move: (p) => p }, false);
  const p = g.players[0];
  p.weapon = "serviceRifle"; p.weaponId = undefined;
  p.command = { ...idle(), firstPerson: true };
  return { g, p };
};

describe("hip-fire ring", () => {
  it("maps a cone's half-angle to its radius on screen", () => {
    // Half the vertical field of view reaches the top edge of the view.
    expect(coneRadius(35 * Math.PI / 180, 70, 1000)).toBeCloseTo(500);
    expect(coneRadius(0, 70, 1000)).toBe(0);
  });

  it("matches the hip cone in first person and grows while moving", () => {
    const { g, p } = game();
    const still = spreadRingRadius(p, g.tick, 70, 1000);
    expect(still).toBeCloseTo(coneRadius(hipSpread(p, g.tick), 70, 1000));
    expect(still).toBeGreaterThan(ringMinRadius);
    p.vx = 7;
    expect(spreadRingRadius(p, g.tick, 70, 1000)).toBeGreaterThan(still);
  });

  it("hides in third person and with the sights up", () => {
    const { g, p } = game();
    p.command = { ...idle(), firstPerson: false };
    expect(spreadRingRadius(p, g.tick, 70, 1000)).toBe(0);
    p.command = { ...idle(), firstPerson: true };
    for (let i = 0; i < 12; i++) g.step({ ...idle(), firstPerson: true, aim: true });
    expect(spreadRingRadius(p, g.tick, 50, 1000)).toBe(0);
  });
});
