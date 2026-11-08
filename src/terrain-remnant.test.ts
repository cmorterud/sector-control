import { expect, it } from "vitest";
import { Entity } from "playcanvas";
import { Game, TestCollision } from "./simulation";
import { trenchMap } from "./trench-map";
import { baseGroundHeight, groundHeight } from "./map";
import { artilleryExplosionProfile } from "./destruction";
import { TerrainPhysics } from "./physics";
import { terrainGeometry } from "./terrain-geometry";

function scene() {
  // Reproduce the original wide corridors and their two-meter earth traverse
  // independently of the live map's now-narrower trench layout.
  const t = trenchMap.terrain!,
    heights = t.heights.slice();
  for (let row = 0; row < t.rows; row++)
    for (let col = 0; col < t.columns; col++) {
      const x = -trenchMap.width / 2 + (col + 0.5) * t.cellSize;
      const z = -trenchMap.depth / 2 + (row + 0.5) * t.cellSize;
      if (x >= -32 && x < -18 && z >= -8 && z < 8)
        heights[row * t.columns + col] =
          x < -26 || x >= -24 || z < -4 ? 0 : 2.4;
    }
  const map = {
    ...trenchMap,
    boxes: [],
    vegetation: [],
    terrain: {
      ...t,
      heights,
      banks: undefined, // This fixture authors a different, deliberately square traverse.
      lining: [],
      ramps: t.ramps.filter(
        (r) => Math.abs(r.z + 1) > 0.1 || Math.abs(r.x) > 25,
      ),
    },
  };
  return new Game(new TestCollision(map), false, 3000, 12345, undefined, {
    map,
  });
}
const at = { x: -23, z: 3.75, y: 0.025 };
const blast = (g: Game) =>
  // Preserve the original large, deep grazing-strike reproduction even when
  // the live artillery tuning changes to preserve more trench earth.
  g.explode(at, 0, "blue", {
    ...artilleryExplosionProfile,
    damage: 0,
    craterRadius: 3.5,
    terrainReach: 5,
    bankDepth: 3.2,
  });

it("slumps damaged narrow earth traverses instead of retaining tall jutting sheets", () => {
  const g = scene();
  expect(groundHeight(-25.25, -2.5, g.map)).toBeGreaterThan(2.3);
  const remote = groundHeight(-25, -13, g.map);
  blast(g);
  // This grazing strike previously left a 2.14 m crest with floor on both sides.
  expect(groundHeight(-25.25, -2.5, g.map)).toBeLessThan(0.6);
  for (let x = -26; x <= -24; x += 0.25)
    for (let z = -3.5; z <= -1; z += 0.25) {
      const height = groundHeight(x, z, g.map);
      const shoulders = Math.max(
        groundHeight(x, z - 1.25, g.map),
        groundHeight(x, z + 1.25, g.map),
      );
      expect(height - shoulders).toBeLessThanOrEqual(0.751);
      expect(height).toBeGreaterThanOrEqual(-0.9);
      expect(height).toBeLessThanOrEqual(baseGroundHeight(x, z, g.map));
    }
  expect(groundHeight(-25, -13, g.map)).toBe(remote);
  expect(groundHeight(-17, -1, g.map)).toBeGreaterThan(2.3);
});

it("blends partially eroded cliff cells without a thin upright lip beside a low sample", () => {
  const g = scene();
  blast(g);
  for (let z = -3.5; z <= -1; z += 0.25) {
    const edge = groundHeight(-24, z, g.map);
    // Previously the exact point was y0, but ten microns to its bank side
    // returned y2.4, producing the paper-thin upright face in the mesh.
    expect(groundHeight(-24 - 0.00001, z, g.map) - edge).toBeLessThan(0.01);
  }
  expect(groundHeight(-18 + 0.00001, -1, g.map)).toBeGreaterThan(2.3);
});

it("removes the remnant from actual Ammo collision as well as simulation terrain", () => {
  const g = scene();
  const from = { x: -25.25, y: 0.7, z: -3.75 },
    to = { x: -25.25, y: 0.7, z: -1.25 };
  expect(g.collision.ray(from, to)).toBeLessThan(1);
  blast(g);
  expect(g.collision.ray(from, to)).toBe(1);
  const change = g.events.find((e) => e.type === "destruction");
  expect(change?.type).toBe("destruction");
  const physics = new TerrainPhysics(),
    root = new Entity("collapsed remnant");
  try {
    if (change?.type === "destruction")
      for (const key of change.change.patches)
        physics.setPatch(key, terrainGeometry(g.map, key), root);
    expect(physics.ray(from, to)).toBe(1);
    const y = groundHeight(-25.25, -2.5, g.map);
    const fraction = physics.ray(
      { x: -25.25, y: 5, z: -2.5 },
      { x: -25.25, y: -2, z: -2.5 },
    );
    expect(5 - fraction * 7).toBeCloseTo(y, 2);
  } finally {
    physics.destroy();
    root.destroy();
  }
});

it("keeps protected foundations and distant intact traverses during repeated blasts", () => {
  const g = scene();
  g.map.boxes.push({
    id: "protected footing",
    kind: "barrier",
    x: -25.25,
    z: -2.5,
    w: 1,
    d: 1,
    h: 2,
    baseY: 2.4,
  });
  const base = groundHeight(-25.25, -2.5, g.map),
    distant = groundHeight(-25, -13, g.map);
  for (let i = 0; i < 3; i++) blast(g);
  expect(groundHeight(-25.25, -2.5, g.map)).toBe(base);
  expect(groundHeight(-25, -13, g.map)).toBe(distant);
  expect(g.map.boxes.some((b) => b.id === "protected footing")).toBe(true);
  expect(Object.values(g.map.destruction!.cuts).every(Number.isFinite)).toBe(
    true,
  );
});
