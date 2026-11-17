import { expect, it } from "vitest";
import { industrialMap, type MapDefinition } from "./map";
import { Game, TestCollision, idle, timberPassage, timberPassDamage, type Projectile } from "./simulation";
import { ambientArtilleryExplosionProfile, artilleryExplosionProfile, artillerySplash, damageVegetation, furnitureRoundDamage, splashFloor } from "./destruction";
import { buildKitHouse } from "./house-kit";
import { narrowTownhouse } from "./house-kit-plans";

// One stone wall, one timber roof panel and a sandbag, well apart.
const map = (): MapDefinition => ({ ...industrialMap, width: 60, depth: 60, spawn: { blue: { x: -25, z: 0 }, red: { x: 25, z: 0 } }, sectors: [],
  boxes: [
    { id: "wall", x: 0, z: 0, w: 2.5, d: 0.44, h: 1, kind: "masonry", maxHp: 180, baseY: 0, architecture: { building: "house", part: "wall", level: 0, bearing: true } },
    { id: "roof", x: 10, z: 0, w: 2.5, d: 2.5, h: 0.25, kind: "wood", maxHp: 50, baseY: 0, architecture: { building: "house", part: "roof", level: 1 } },
    { id: "sandbag", x: -10, z: 0, w: 2, d: 0.8, h: 0.9, kind: "sandbag", baseY: 0 },
  ],
  buildings: [{ id: "house", name: "House", x: 0, z: 0, w: 8, d: 8, stories: 1, baseY: 0, posts: [] }] });
const scene = (m = map()) => new Game(new TestCollision(m), false, 6000, 3, undefined, { map: m, ambientArtillery: false });
const shell = { ...artilleryExplosionProfile, damage: 0, craterRadius: 0, craterDepth: 0, terrainReach: 0 };
const hp = (g: Game, id: string) => g.map.destruction!.objects[id].hp;

it("eases artillery damage on buildings smoothly instead of a 20 cm cliff", () => {
  expect(artillerySplash(0.2)).toBe(1);
  expect(artillerySplash(0.21)).toBe(1);
  expect(artillerySplash(1)).toBe(1);
  expect(artillerySplash(2)).toBeCloseTo(0.6);
  expect(artillerySplash(3)).toBeCloseTo(0.2);
  for (let d = 0; d < 6; d += 0.05) expect(artillerySplash(d + 0.05)).toBeLessThanOrEqual(artillerySplash(d));
  // A shell landing half a metre from a wall now holes it.
  const g = scene();
  g.explode({ x: 0, y: 0.5, z: -0.72 }, -1, null, shell);
  expect(g.map.destruction!.objects.wall.stage).toBe(2);
});

it("lets splash crack building masonry but never finish it", () => {
  const g = scene();
  for (let i = 0; i < 12; i++) g.explode({ x: 0, y: 0.5, z: -2.2 }, -1, null, shell);
  expect(hp(g, "wall")).toBe(Math.ceil(180 * splashFloor));
  expect(g.map.destruction!.objects.wall.stage).toBe(1);
  // A direct hit finishes the softened wall.
  g.explode({ x: 0, y: 0.5, z: -0.3 }, -1, null, shell);
  expect(g.map.destruction!.objects.wall.stage).toBe(2);
  // Timber is exempt: splash still strips roofs.
  for (let i = 0; i < 6; i++) g.explode({ x: 10, y: 1.2, z: 0 }, -1, null, shell);
  expect(g.map.destruction!.objects.roof.stage).toBe(2);
});

it("keeps stray shells' wide reach off buildings but not off field cover", () => {
  const g = scene();
  const stray = { ...ambientArtilleryExplosionProfile, damage: 0, craterRadius: 0, craterDepth: 0, terrainReach: 0 };
  g.explode({ x: 0, y: 0.5, z: -9 }, -1, null, stray);
  expect(hp(g, "wall")).toBe(180);
  g.explode({ x: -10, y: 0.5, z: -9 }, -1, null, stray);
  expect(hp(g, "sandbag")).toBeLessThan(160);
});

const townhouse = () => {
  const m: MapDefinition = { ...industrialMap, width: 60, depth: 60, boxes: [], buildings: [], navigationPoints: [], sectors: [],
    spawn: { blue: { x: -25, z: 0 }, red: { x: 25, z: 0 } } };
  buildKitHouse(m, narrowTownhouse, { id: "house", x: 0, z: 0, baseY: 0 });
  return scene(m);
};
const fire = (g: Game, from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }) => {
  const d = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z), speed = 600;
  const shot: Projectile = { id: 9001, actor: 99, team: g.players[0].team === "blue" ? "red" : "blue", ...from, vx: (to.x - from.x) / d * speed,
    vy: (to.y - from.y) / d * speed, vz: (to.z - from.z) / d * speed, remaining: d + 2, bornAt: g.tick - 1, damage: 40 };
  g.projectiles.push(shot);
  for (let i = 0; i < 6; i++) g.step(idle());
};

it("passes rounds through one timber partition at half damage, and stone stops them", () => {
  // The timber partition between the stair (A3) and the kitchen (B3) is at x = -1.25.
  const g = townhouse(), p = g.players[0];
  expect(timberPassage(g.map, { x: -1.33, y: 1.5, z: 0 }, { x: 1, y: 0, z: 0 })).not.toBeNull();
  expect(timberPassage(g.map, { x: 0, y: 1.5, z: -1.47 }, { x: 0, y: 0, z: 1 })).toBeNull();
  // From beside the stair treads, across the partition, clear of furniture.
  Object.assign(p, { x: 0.3, z: 1.5, y: 0, hp: 100, protectedUntil: 0 });
  fire(g, { x: -1.45, y: 1.1, z: 1.5 }, { x: 0.3, y: 1.1, z: 1.5 });
  expect(p.hp).toBe(100 - 40 * timberPassDamage);
  // Through the stone spine wall into the shop: nothing gets through.
  Object.assign(p, { x: 2.5 - 1.6, z: -3.2, y: 0, hp: 100 });
  fire(g, { x: 0.9, y: 1.1, z: 1 }, { x: 0.9, y: 1.1, z: -3.2 });
  expect(p.hp).toBe(100);
});

it("wears kit furniture away under rifle fire", () => {
  const g = townhouse();
  const counter = g.map.boxes.find((b) => b.architecture?.feature === "counter")!;
  const before = hp(g, counter.id!);
  const change = damageVegetation(g.map, { x: counter.x, y: (counter.baseY ?? 0) + counter.h, z: counter.z });
  expect(change).not.toBeNull();
  expect(hp(g, counter.id!)).toBe(before - furnitureRoundDamage);
});
