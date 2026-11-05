import { it, expect } from "vitest";
import { Entity } from "playcanvas";
import { Game, TestCollision } from "./simulation";
import { trenchMap } from "./trench-map";
import { groundHeight, walkSegment } from "./map";
import {
  grenadeExplosionProfile,
  artilleryExplosionProfile,
} from "./destruction";
import { TerrainPhysics } from "./physics";
import { terrainGeometry } from "./terrain-geometry";
const scene = () =>
  new Game(new TestCollision(trenchMap), false, 3000, 12345, undefined, {
    map: trenchMap,
  });
it("takes a rounded side chunk out of either bank, keeps distant walls, and opens a breach with concentrated hits", () => {
  for (const side of [-1, 1]) {
    const g = scene(),
      at = { x: side * 18.5, y: 1.2, z: -1 };
    const before = groundHeight(side * 17.5, -1, g.map);
    g.explode(at, 0, "blue", { ...grenadeExplosionProfile, damage: 0 });
    const chipped = groundHeight(side * 17.5, -1, g.map);
    expect(chipped).toBeLessThan(before - 0.5);
    expect(chipped).toBeGreaterThan(0.5);
    expect(
      g.events.some(
        (e) => e.type === "destruction" && (e.change.wallSamples ?? 0) > 0,
      ),
    ).toBe(true);
    for (let i = 0; i < 3; i++)
      g.explode(at, 0, "blue", { ...grenadeExplosionProfile, damage: 0 });
    expect(groundHeight(side * 17.5, -1, g.map)).toBeLessThan(0.5);
    expect(groundHeight(side * 17.5, 10, g.map)).toBeGreaterThan(2);
  }
});
it("an artillery side strike makes a real walkable opening with matching Ammo terrain collision", () => {
  const g = scene(),
    at = { x: -18.5, y: 0.6, z: -27 };
  const a = { x: -18.6, y: 0.5, z: -27 },
    b = { x: -17.5, y: 0.5, z: -27 };
  expect(g.collision.ray(a, b)).toBeLessThan(1);
  expect(walkSegment({ x: -20, z: -27 }, { x: -10, z: -27 }, g.map)).toBe(
    false,
  );
  g.explode(at, 0, "blue", { ...artilleryExplosionProfile, damage: 0 });
  expect(g.collision.ray(a, b)).toBe(1);
  expect(walkSegment({ x: -20, z: -27 }, { x: -10, z: -27 }, g.map)).toBe(true);
  const change = g.events.find((e) => e.type === "destruction");
  expect(change?.type).toBe("destruction");
  const physics = new TerrainPhysics(),
    entity = new Entity("breached bank");
  try {
    if (change?.type === "destruction")
      for (const key of change.change.patches)
        physics.setPatch(key, terrainGeometry(g.map, key), entity);
    expect(physics.ray(a, b)).toBe(1);
  } finally {
    physics.destroy();
    entity.destroy();
  }
});
it("does not excavate sideways through an intact concrete screen or change protected foundations", () => {
  const g = scene();
  g.map.boxes.push({
    id: "shield",
    kind: "barrier",
    x: -18.07,
    z: -1,
    w: 0.1,
    d: 8,
    h: 4,
    baseY: 0,
  });
  g.explode({ x: -18.5, y: 1.2, z: -1 }, 0, "blue", {
    ...grenadeExplosionProfile,
    damage: 0,
  });
  expect(groundHeight(-17.5, -1, g.map)).toBeCloseTo(2.4);
  expect(g.map.boxes.some((b) => b.id === "shield")).toBe(true);
});
