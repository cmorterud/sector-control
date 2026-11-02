import { it, expect } from "vitest";
import { Entity, Vec3 } from "playcanvas";
import { Renderer } from "./rendering";
import {
  Game,
  idle,
  TestCollision,
  mantlePosition,
  type Soldier,
} from "./simulation";
import { trenchMap } from "./trench-map";

// Exercise the real rig and animation transforms without a WebGL context.
// Mesh creation is replaced by bare transform nodes; joint/IK code is unchanged.
type Rig = {
  upper: Entity;
  rifle: Entity;
  supportHand: Entity;
  arms: { shoulder: Entity; elbow: Entity }[];
  legs: { ankle: Entity }[];
};
type Harness = {
  app: { root: Entity };
  people: Entity[];
  soldiers: Rig[];
  cube: Renderer["cube"];
  createSoldier(p: Soldier): void;
  animateSoldier(
    p: Soldier,
    x: number,
    z: number,
    dt: number,
    tick: number,
  ): void;
};
function rigFor(p: Soldier) {
  const renderer = Object.create(Renderer.prototype) as Harness;
  renderer.app = { root: new Entity("test world") };
  renderer.people = [];
  renderer.soldiers = [];
  renderer.cube = (
    name,
    x,
    y,
    z,
    w,
    h,
    d,
    _color,
    _solid,
    parent,
    rotation = 0,
  ) => {
    const e = new Entity(name);
    (parent ?? renderer.app.root).addChild(e);
    e.setLocalPosition(x, y, z);
    e.setLocalScale(w, h, d);
    e.setLocalEulerAngles(0, 0, rotation);
    return e;
  };
  renderer.createSoldier(p);
  return renderer;
}

it("braces the free hand on the bank, keeps the support hand on the rifle, and clears the bank with tucked feet", () => {
  const game = new Game(
    new TestCollision(trenchMap),
    false,
    600,
    12345,
    undefined,
    { map: trenchMap },
  );
  const p = game.players[0];
  Object.assign(p, { x: -18.5, y: 0, z: -27 });
  game.step({ ...idle(), yaw: Math.PI / 2, mantle: true });
  const m = p.mantle!;
  expect(m).toBeTruthy();
  const r = rigFor(p),
    rig = r.soldiers[0];
  for (const phase of [0.46, 0.7, 0.9]) {
    const tick = m.startTick + (m.endTick - m.startTick) * phase;
    const pos = mantlePosition(m, tick);
    r.people[0].setPosition(pos.x, pos.y, pos.z);
    r.people[0].setEulerAngles(0, (-m.yaw * 180) / Math.PI, 0);
    r.animateSoldier(p, pos.x, pos.z, 1 / 60, tick);
    const supportWrist = rig.arms[0].elbow
      .getWorldTransform()
      .transformPoint(new Vec3(0, -0.46, 0));
    expect(supportWrist.distance(rig.supportHand.getPosition())).toBeLessThan(
      0.0001,
    );
    if (phase === 0.46) {
      const wrist = rig.arms[1].elbow
        .getWorldTransform()
        .transformPoint(new Vec3(0, -0.28, 0));
      const ledge = new Vec3(
        m.edge.x + Math.cos(m.yaw) * 0.32,
        m.edge.y + 0.04,
        m.edge.z + Math.sin(m.yaw) * 0.32,
      );
      expect(wrist.distance(ledge)).toBeLessThan(0.01);
    } else {
      for (const leg of rig.legs)
        expect(leg.ankle.getPosition().y - 0.07).toBeGreaterThan(m.to.y - 0.01);
    }
  }
});
