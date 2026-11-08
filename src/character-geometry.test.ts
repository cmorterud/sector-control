import { expect, it } from "vitest";
import { characterGeometry, type CharacterShape } from "./character-geometry";
it("builds bounded curved silhouettes with finite unit normals and a small shared mesh budget", () => {
  for (const shape of [
    "soft",
    "limb",
    "tunic",
    "head",
    "helmet",
    "disc",
    "stock",
  ] as CharacterShape[]) {
    const g = characterGeometry(shape);
    expect(g.positions.length / 3).toBeLessThan(128);
    expect(g.normals.length).toBe(g.positions.length);
    expect(
      g.positions.every((v) => Number.isFinite(v) && Math.abs(v) <= 0.501),
    ).toBe(true);
    for (let i = 0; i < g.normals.length; i += 3)
      expect(Math.hypot(...g.normals.slice(i, i + 3))).toBeCloseTo(1);
    expect(g.indices.every((i) => i >= 0 && i < g.positions.length / 3)).toBe(
      true,
    );
    expect(
      new Set(g.normals.map((n) => Math.round(n * 10))).size,
    ).toBeGreaterThan(6);
  }
});
