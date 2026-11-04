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
  map: typeof trenchMap;
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
  renderer.map = trenchMap;
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

it("exposes the helmet and rifle while keeping the torso below the firing-step parapet", () => {
  const game = new Game(
    new TestCollision(trenchMap),
    false,
    600,
    12345,
    undefined,
    { map: trenchMap },
  );
  const p = game.players[0];
  Object.assign(p, {
    x: -19,
    y: 0.85,
    z: -1,
    yaw: Math.PI / 2,
    command: { ...idle(), aim: true },
  });
  const r = rigFor(p);
  r.animateSoldier(p, p.x, p.z, 1 / 60, 10);
  const nodes = new Map<string, Entity>();
  const visit = (e: Entity) => {
    nodes.set(e.name, e);
    for (const child of e.children) visit(child as Entity);
  };
  visit(r.people[0]);
  const bounds = (name: string) => {
    const e = nodes.get(name)!;
    const ys = [];
    for (const x of [-0.5, 0.5])
      for (const y of [-0.5, 0.5])
        for (const z of [-0.5, 0.5])
          ys.push(e.getWorldTransform().transformPoint(new Vec3(x, y, z)).y);
    return { min: Math.min(...ys), max: Math.max(...ys) };
  };
  for (const name of ["torso", "vest", "backpack", "pelvis"])
    expect(bounds(name).max).toBeLessThan(2.4);
  expect(bounds("helmet").max).toBeGreaterThan(2.65);
  expect(bounds("barrel").min).toBeGreaterThan(2.4);
});

it("crouches with bent knees and planted boots, keeps the support hand attached, and hides below the parapet", () => {
  const game = new Game(
    new TestCollision(trenchMap),
    false,
    600,
    12345,
    undefined,
    { map: trenchMap },
  );
  const p = game.players[0];
  Object.assign(p, { x: -19, y: 0.85, z: -1, crouched: true, landedAt: -1000 });
  const r = rigFor(p),
    rig = r.soldiers[0];
  const nodes = new Map<string, Entity>();
  const visit = (e: Entity) => {
    nodes.set(e.name, e);
    for (const child of e.children) visit(child as Entity);
  };
  visit(r.people[0]);
  for (let i = 0; i < 75; i++) {
    r.animateSoldier(p, p.x, p.z, 1 / 60, 100 + i / 2);
    for (const leg of rig.legs)
      expect(leg.ankle.getPosition().y - p.y).toBeGreaterThan(0.07);
    const wrist = rig.arms[0].elbow
      .getWorldTransform()
      .transformPoint(new Vec3(0, -0.46, 0));
    expect(wrist.distance(rig.supportHand.getPosition())).toBeLessThan(0.0001);
  }
  const helmet = nodes.get("helmet")!;
  expect(helmet.getPosition().y + 0.09).toBeLessThan(2.4);
  expect(nodes.get("knee")!.getLocalEulerAngles().x).toBeLessThan(-120);
  p.crouched = false;
  for (let i = 0; i < 75; i++)
    r.animateSoldier(p, p.x, p.z, 1 / 60, 140 + i / 2);
  expect(helmet.getPosition().y).toBeGreaterThan(2.65);
});

it("kicks the barrel and shoulder back while keeping the support wrist on the grip throughout recovery", () => {
  const game = new Game(
    new TestCollision(trenchMap),
    false,
    3000,
    12345,
    undefined,
    { map: trenchMap },
  );
  const p = game.players[0];
  game.tick = 100;
  const r = rigFor(p),
    rig = r.soldiers[0];
  r.animateSoldier(p, p.x, p.z, 1 / 60, 99);
  const rest = rig.rifle.getLocalPosition().clone();
  const restDirection = rig.rifle.forward.clone();
  game.fire(p);
  let previousZ = Infinity;
  for (const age of [0, 0.5, 1, 2, 4, 8]) {
    r.animateSoldier(p, p.x, p.z, 1 / 60, 99 + age);
    const z = rig.rifle.getLocalPosition().z;
    expect(z).toBeLessThanOrEqual(previousZ);
    expect(z).toBeGreaterThan(rest.z);
    previousZ = z;
    const wrist = rig.arms[0].elbow
      .getWorldTransform()
      .transformPoint(new Vec3(0, -0.46, 0));
    expect(wrist.distance(rig.supportHand.getPosition())).toBeLessThan(0.0001);
    if (age === 0) {
      expect(z - rest.z).toBeGreaterThan(0.08);
      expect(rig.rifle.forward.y).toBeGreaterThan(restDirection.y + 0.04);
    }
  }
  for (let i = 0; i < 60; i++) game.step(idle());
  r.animateSoldier(p, p.x, p.z, 1 / 60, game.tick - 1);
  expect(rig.rifle.getLocalPosition().z).toBeCloseTo(rest.z, 4);
  expect(rig.rifle.forward.y).toBeCloseTo(restDirection.y, 4);
});
