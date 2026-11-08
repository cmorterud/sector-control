import { expect, it } from "vitest";
import { Game, TestCollision } from "./simulation";
import { industrialMap, groundHeight } from "./map";
import { grenadeExplosionProfile } from "./destruction";

it("keeps incrementally patched terrain queries identical to fresh grids across overlapping blasts, separate craters and external revisions", () => {
  const map = { ...industrialMap, boxes: [], sectors: [] };
  const g = new Game(new TestCollision(map), false, 1000, 12345, undefined, {
    map,
  });
  for (const [x, z] of [
    [0, 0],
    [1, 1],
    [0, 0],
    [8, -8],
    [-9, 5],
    [8, -8],
  ]) {
    // Warm the previous revision before applying the next local edit.
    groundHeight(x, z, g.map);
    g.explode({ x, y: 0.1, z }, -1, null, {
      ...grenadeExplosionProfile,
      damage: 0,
    });
    const cold = structuredClone(g.map);
    for (let i = 0; i < 1000; i++) {
      const x = ((i * 17) % 181) / 5 - 18.013,
        z = ((i * 43) % 173) / 5 - 17.027;
      expect(groundHeight(x, z, g.map)).toBe(groundHeight(x, z, cold));
    }
  }
  const state = g.map.destruction!;
  state.cuts["50,50"] = 0.4;
  state.terrainRevision!++;
  expect(groundHeight(12.5, 12.5, g.map)).toBeCloseTo(-0.4);
  expect(groundHeight(12.5, 12.5, map)).toBe(0);
});
