import { it, expect } from "vitest";
import { Entity, Vec3 } from "playcanvas";
import {
  treeFallPose,
  treeFallTime,
  treeSettleTime,
  debrisPiece,
  advanceDebris,
  maxDebris,
  maxFallingTrees,
} from "./environment-effects";
import { Renderer } from "./rendering";
import { runtimeMap, type Destructible } from "./destruction";
import { industrialMap } from "./map";

it("accelerates into the fall, rebounds above the floor once, and ends at the log orientation", () => {
  expect(treeFallPose(0).angle).toBe(0);
  expect(treeFallPose(treeFallTime / 2).angle).toBeLessThan(25);
  expect(treeFallPose(treeFallTime).angle).toBe(90);
  const rebound = treeFallPose(treeFallTime + treeSettleTime / 2);
  expect(rebound.angle).toBeLessThan(90);
  expect(rebound.angle).toBeGreaterThan(87);
  expect(treeFallPose(treeFallTime + treeSettleTime).finished).toBe(true);
  expect(treeFallPose(5).angle).toBe(90);
});

it("keeps debris frame-rate independent and lets wood settle flat rather than sliding forever", () => {
  const run = (fps: number) => {
    const piece = debrisPiece({ x: 0, y: 1, z: 0 }, "wood", 123);
    for (let i = 0; i < fps * 3; i++) advanceDebris(piece, 1 / fps, () => 0);
    return piece;
  };
  const a = run(30),
    b = run(120);
  expect(a.at.x).toBeCloseTo(b.at.x, 5);
  expect(a.at.z).toBeCloseTo(b.at.z, 5);
  expect(a.resting).toBe(true);
  expect(a.velocity).toEqual({ x: 0, y: 0, z: 0 });
  expect(a.at.y).toBeCloseTo(Math.max(a.size.x, a.size.z) / 2);
  expect(a.rotation.x).toBe(90);
});

it("bounces fragments off a trench face, freezes on pause and falls again if support is excavated", () => {
  const piece = debrisPiece({ x: -0.5, y: 0.3, z: 0 }, "earth", 5);
  piece.velocity = { x: 12, y: 0, z: 0 };
  for (let i = 0; i < 120; i++)
    advanceDebris(piece, 1 / 120, (x) => (x >= 0 ? 2.4 : 0));
  expect(piece.at.x).toBeLessThan(0);
  expect(piece.resting).toBe(true);
  const before = structuredClone(piece);
  advanceDebris(piece, 0, () => -1);
  expect(piece).toEqual(before);
  advanceDebris(piece, 1 / 30, () => -1);
  expect(piece.resting).toBe(false);
  expect(piece.at.y).toBeLessThan(before.at.y);
});

type Harness = {
  app: { root: Entity };
  map: ReturnType<typeof runtimeMap>;
  objectVisuals: Map<string, Entity>;
  objectStates: Map<string, string>;
  fallingTrees: { root: Entity; pivot: Entity; age: number; landed: boolean }[];
  fragments: { entity: Entity; state: ReturnType<typeof debrisPiece> }[];
  cube: Renderer["cube"];
  startTreeFall(o: Destructible): void;
  drawEnvironmentEffects(dt: number): void;
  clearEnvironmentEffects(): void;
  spawnDebris(
    at: { x: number; y: number; z: number },
    kind: "wood",
    count: number,
    seed: number,
  ): void;
};
function harness() {
  const r = Object.create(Renderer.prototype) as Harness;
  r.app = { root: new Entity("world") };
  r.map = runtimeMap({ ...industrialMap, boxes: [] });
  r.objectVisuals = new Map();
  r.objectStates = new Map();
  r.fallingTrees = [];
  r.fragments = [];
  r.cube = (name, x, y, z, w, h, d, _color, _solid, parent) => {
    const e = new Entity(name);
    (parent ?? r.app.root).addChild(e);
    e.setLocalPosition(x, y, z);
    e.setLocalScale(w, h, d);
    return e;
  };
  return r;
}
it("rotates real scene transforms toward the final log and retires old standing collision immediately", () => {
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const r = harness(),
      root = new Entity("tree"),
      trunk = new Entity("trunk"),
      collider = new Entity("standing collider");
    r.app.root.addChild(root);
    root.addChild(trunk);
    root.addChild(collider);
    trunk.setLocalPosition(10, 4, 12);
    trunk.setLocalScale(1, 4, 1);
    const originalFind = root.findComponents.bind(root);
    root.findComponents = ((type: string) =>
      type === "rigidbody"
        ? [{ entity: collider }]
        : originalFind(type)) as typeof root.findComponents;
    r.objectVisuals.set("tree-test", root);
    r.objectStates.set("tree-test", JSON.stringify([1]));
    const source = {
      id: "tree-test",
      kind: "tree" as const,
      x: 10,
      z: 12,
      w: 1,
      h: 4 / 0.6,
      d: 1,
      baseY: 2,
    };
    const log = {
      id: "log-tree-test",
      kind: "log" as const,
      x: 10 + dx * 2,
      z: 12 + dz * 2,
      w: dx ? 4 : 1,
      d: dz ? 4 : 1,
      h: 1,
      baseY: 2,
    };
    const object = {
      id: "tree-test",
      original: source,
      hp: 0,
      maxHp: 180,
      stage: 2 as const,
      lining: false,
    };
    r.map.destruction!.objects[log.id] = {
      id: log.id,
      original: log,
      hp: 90,
      maxHp: 90,
      stage: 0,
      lining: false,
    };
    r.startTreeFall(object);
    expect(collider.parent).toBeNull();
    expect(trunk.getPosition().distance(new Vec3(10, 4, 12))).toBeLessThan(
      0.0001,
    );
    r.drawEnvironmentEffects(treeFallTime);
    expect(
      trunk.getPosition().distance(new Vec3(log.x, 2.5, log.z)),
    ).toBeLessThan(0.0001);
    const top = trunk.getWorldTransform().transformPoint(new Vec3(0, 0.5, 0));
    expect(top.y).toBeCloseTo(2.5);
    r.drawEnvironmentEffects(treeSettleTime + 0.001);
    expect(r.fallingTrees).toHaveLength(0);
    expect(r.fragments.length).toBeGreaterThan(0);
    r.clearEnvironmentEffects();
    expect(r.fragments).toHaveLength(0);
    r.app.root.destroy();
  }
});

it("caps transient tree and fragment entities and clears them on restart", () => {
  const r = harness();
  for (let i = 0; i < maxFallingTrees + 4; i++) {
    const id = `tree-${i}`,
      root = new Entity(id);
    r.app.root.addChild(root);
    r.objectVisuals.set(id, root);
    r.startTreeFall({
      id,
      original: { id, kind: "tree", x: i, z: 0, w: 1, d: 1, h: 6 },
      hp: 0,
      maxHp: 180,
      stage: 2,
      lining: false,
    });
  }
  expect(r.fallingTrees).toHaveLength(maxFallingTrees);
  r.spawnDebris({ x: 0, y: 1, z: 0 }, "wood", maxDebris + 20, 1);
  expect(r.fragments).toHaveLength(maxDebris);
  r.clearEnvironmentEffects();
  expect(r.fallingTrees).toHaveLength(0);
  expect(r.app.root.children).toHaveLength(0);
});
