import { it, expect } from "vitest";
import { blastPlume } from "./blast-plume";
it("makes a floor-level grenade's dirt visible above a deep trench lip within one second, including excavated floors", () => {
  for (const floor of [0, -0.9]) {
    const p = blastPlume(0.7, 0);
    expect(floor + p.y + p.height / 2).toBeGreaterThan(2.4 + 0.5);
    expect(p.x).toBe(0);
    expect(p.z).toBe(0);
  }
  const core = blastPlume(0.7, 0),
    ground = blastPlume(0.7, 3);
  expect(ground.y).toBeLessThan(core.y);
  expect(blastPlume(2, 0, 1.7).height).toBeGreaterThan(blastPlume(2, 0).height);
});
