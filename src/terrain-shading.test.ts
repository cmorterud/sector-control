import { expect, it } from "vitest";
import { calculateNormals } from "playcanvas";
import { terrainGeometry } from "./terrain-geometry";
import { terrainNormals } from "./terrain-shading";
import { trenchMap } from "./trench-map";
import { industrialMap, groundHeight, type MapDefinition } from "./map";
import { Game, TestCollision } from "./simulation";
import { artilleryExplosionProfile } from "./destruction";

function inspect(map: MapDefinition, keys: string[]) {
  const byPoint = new Map<string, number[]>();
  let duplicates = 0, smoothed = 0;
  for (const key of keys) {
    const data = terrainGeometry(map, key);
    const before = structuredClone(data);
    const flat = calculateNormals(data.positions, data.indices);
    const normals = terrainNormals(map, data, flat);
    expect(data).toEqual(before);
    for (let i = 0; i < normals.length; i += 3) {
      const n = normals.slice(i, i + 3);
      expect(n.every(Number.isFinite)).toBe(true);
      expect(Math.hypot(...n)).toBeCloseTo(1, 5);
      if (Math.abs(flat[i + 1]) < 0.01) {
        if (Math.hypot(...flat.slice(i, i + 3)) > 0.5)
          expect(n).toEqual(flat.slice(i, i + 3));
        continue;
      }
      if (Math.hypot(...n.map((v, j) => v - flat[i + j])) > 0.01) smoothed++;
      const [x, y, z] = data.positions.slice(i, i + 3);
      const point = `${x},${Math.round(y * 1000)},${z}`;
      const previous = byPoint.get(point);
      if (previous) {
        for (let j = 0; j < 3; j++) expect(n[j]).toBeCloseTo(previous[j], 4);
        duplicates++;
      }
      byPoint.set(point, n);
    }
  }
  return { duplicates, smoothed };
}
it("uses continuous world-space bank lighting across duplicated vertices and patch borders without altering collision geometry", () => {
  const result = inspect(trenchMap, ["-5,-7", "-4,-7", "-4,-6"]);
  expect(result.duplicates).toBeGreaterThan(100);
  expect(result.smoothed).toBeGreaterThan(100);
});
it("updates normals around an excavated patch boundary while keeping them finite and seam-consistent", () => {
  const g = new Game(new TestCollision(trenchMap), false, 600, 12345, undefined, { map: trenchMap });
  g.explode({ x: -32, z: -48, y: groundHeight(-32, -48, g.map) + 0.02 }, -1, null, { ...artilleryExplosionProfile, damage: 0 });
  const result = inspect(g.map, ["-5,-7", "-4,-7", "-5,-6", "-4,-6"]);
  expect(result.duplicates).toBeGreaterThan(100);
});
it("retains the industrial flat-shaded material and normals", () => {
  const data = terrainGeometry(industrialMap, "0,0");
  const flat = calculateNormals(data.positions, data.indices);
  expect(terrainNormals(industrialMap, data, flat)).toBe(flat);
});
