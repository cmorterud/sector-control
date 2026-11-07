import { expect, it } from "vitest";
import {
  Entity,
  StandardMaterial,
  calculateNormals,
  calculateTangents,
} from "playcanvas";
import {
  lookNoise,
  surfacePixels,
  dustPixels,
  overcastPixels,
  maxBlastClouds,
} from "./battlefield-look";
import { terrainGeometry } from "./terrain-geometry";
import { runtimeMap } from "./destruction";
import { trenchMap } from "./trench-map";
import { Game, TestCollision } from "./simulation";
import { grenadeExplosionProfile } from "./destruction";
import { Renderer } from "./rendering";

it("keeps procedural surfaces periodic across negative world coordinates with valid normal maps", () => {
  for (const x of [-8, -3.4, -0.001, 0, 1.6, 7.9])
    expect(lookNoise(x, 2.4, 8)).toBeCloseTo(lookNoise(x + 8, 2.4, 8), 10);
  for (const kind of ["mud", "wood"] as const) {
    const a = surfacePixels(kind, 32),
      b = surfacePixels(kind, 32);
    expect(a.diffuse).toEqual(b.diffuse);
    for (let i = 0; i < a.normal.length; i += 4) {
      const n = [a.normal[i], a.normal[i + 1], a.normal[i + 2]].map(
        (v) => (v / 255) * 2 - 1,
      );
      expect(Math.hypot(...n)).toBeCloseTo(1, 1);
      expect(a.diffuse[i + 3]).toBe(255);
    }
  }
  const dust = dustPixels(32);
  for (let i = 0; i < 32; i++)
    for (const at of [i, 31 * 32 + i, i * 32, i * 32 + 31])
      expect(dust[at * 4 + 3]).toBe(0);
  expect(dust[(16 * 32 + 16) * 4 + 3]).toBeGreaterThan(40);
});
it("places cloud variation above the horizon while matching distant fog below it", () => {
  const sky = overcastPixels(64, 32);
  const row = (y: number) =>
    Array.from({ length: 64 }, (_, x) => sky[(y * 64 + x) * 4]);
  expect(Math.max(...row(2)) - Math.min(...row(2))).toBeGreaterThan(10);
  expect(new Set(row(25)).size).toBe(1);
  expect(row(25)[0]).toBe(164);
});

it("gives ground and vertical trench faces finite texture coordinates/tangents after excavation without moving collision vertices", () => {
  const g = new Game(
    new TestCollision(trenchMap),
    false,
    1000,
    12345,
    undefined,
    { map: trenchMap },
  );
  const before = terrainGeometry(g.map, "-3,-1");
  g.explode({ x: -19, y: 0.9, z: -1 }, 0, "blue", {
    ...grenadeExplosionProfile,
    damage: 0,
  });
  for (const key of ["-3,-1", "-2,-1"]) {
    const data = terrainGeometry(g.map, key),
      normals = calculateNormals(data.positions, data.indices);
    const tangents = calculateTangents(
      data.positions,
      normals,
      data.uvs,
      data.indices,
    );
    expect(data.uvs.length).toBe((data.positions.length / 3) * 2);
    expect(
      [...data.uvs, ...tangents, ...data.colors].every(Number.isFinite),
    ).toBe(true);
    for (let i = 0; i < data.uvs.length; i += 8) {
      const u = data.uvs.slice(i, i + 8);
      expect(
        Math.max(...u.filter((_, i) => i % 2 === 0)) -
          Math.min(...u.filter((_, i) => i % 2 === 0)),
      ).toBeGreaterThan(0);
      expect(
        Math.max(...u.filter((_, i) => i % 2 === 1)) -
          Math.min(...u.filter((_, i) => i % 2 === 1)),
      ).toBeGreaterThan(0);
    }
  }
  expect(terrainGeometry(runtimeMap(trenchMap), "-3,-1").positions).toEqual(
    before.positions,
  );
});
it("keeps dust cards facing the camera at any roll, caps overlapping blasts and releases expired effects", () => {
  type Harness = {
    app: { root: Entity };
    camera: Entity;
    blasts: unknown[];
    blastSequence: number;
    joint(name: string, parent: Entity): Entity;
    dustMaterial(): StandardMaterial;
    blastEffect(
      at: { x: number; y: number; z: number },
      radius: number,
      power?: number,
    ): void;
    drawBlasts(dt: number): void;
    faceCamera(e: Entity, roll: number): void;
  };
  const r = Object.create(Renderer.prototype) as Harness;
  r.app = { root: new Entity("test") };
  r.camera = new Entity("camera");
  r.camera.setEulerAngles(-20, 47, 0);
  r.blasts = [];
  r.blastSequence = 0;
  r.dustMaterial = () => new StandardMaterial();
  r.joint = (name, parent) => {
    const e = new Entity(name);
    e.addComponent = () => null as never;
    parent.addChild(e);
    return e;
  };
  const card = new Entity("card");
  for (const roll of [0, 37, 90, 180, 270]) {
    r.faceCamera(card, roll);
    expect(Math.abs(card.up.dot(r.camera.forward))).toBeCloseTo(1, 5);
  }
  for (let i = 0; i < 25; i++) r.blastEffect({ x: 0, y: 0, z: 0 }, 12, 1.7);
  expect(r.blasts).toHaveLength(maxBlastClouds);
  expect(r.app.root.children).toHaveLength(maxBlastClouds);
  r.drawBlasts(0.7);
  expect(
    r.app.root.children.every((e) => Number.isFinite(e.getPosition().length())),
  ).toBe(true);
  r.drawBlasts(10);
  expect(r.blasts).toHaveLength(0);
  expect(r.app.root.children).toHaveLength(0);
});
