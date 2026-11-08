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
    at = { x: -18.5, y: 1.2, z: -1 };
  const a = { x: -18.6, y: 1.2, z: -1 },
    b = { x: -17.5, y: 1.2, z: -1 };
  expect(g.collision.ray(a, b)).toBeLessThan(1);
  expect(walkSegment({ x: -21, z: -1 }, { x: -10, z: -1 }, g.map)).toBe(false);
  g.explode(at, 0, "blue", { ...artilleryExplosionProfile, damage: 0 });
  expect(g.collision.ray(a, b)).toBe(1);
  expect(walkSegment({ x: -21, z: -1 }, { x: -10, z: -1 }, g.map)).toBe(true);
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
  const before = groundHeight(-17.5, -1, g.map);
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
  expect(groundHeight(-17.5, -1, g.map)).toBe(before);
  expect(g.map.boxes.some((b) => b.id === "shield")).toBe(true);
});

it("collapses shielded decorative lining when artillery removes its earth backing", () => {
  for (const side of [-1, 1]) {
    const g = scene();
    const panels = Object.values(g.map.destruction!.objects).filter(
      (o) =>
        o.lining &&
        Math.abs(o.original.x - side * 18) < 0.2 &&
        Math.abs(o.original.z + 1) < 1.1,
    );
    expect(panels.length).toBeGreaterThan(0);
    const distant = Object.values(g.map.destruction!.objects).find(
      (o) =>
        o.lining && Math.hypot(o.original.x - side * 18, o.original.z + 1) > 15,
    )!;
    g.explode({ x: side * 18.5, y: 1.2, z: -1 }, 0, "blue", {
      ...artilleryExplosionProfile,
      damage: 0,
      structuralDamage: 0,
    });
    // No direct wood damage: this specifically exercises lost terrain support.
    expect(panels.every((p) => p.stage === 2 && p.hp === 0)).toBe(true);
    expect(distant.stage).toBe(0);
    const change = g.events.find((e) => e.type === "destruction");
    expect(
      change?.type === "destruction" &&
        panels.every((p) =>
          change.change.objects.some((c) => c.id === p.id && c.stage === 2),
        ),
    ).toBe(true);
    expect(
      g.collision.ray(
        { x: side * 18.6, y: 0.5, z: -1 },
        { x: side * 17.5, y: 0.5, z: -1 },
      ),
    ).toBe(1);
  }
});
