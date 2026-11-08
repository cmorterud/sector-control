import { armLengths, boltMotion } from "./weapons";
import { meleeRules } from "./melee";
import { it, expect, vi } from "vitest";
import { Entity, Vec3 } from "playcanvas";
import { Renderer } from "./rendering";
import {
  soldierStyle,
  reloadMotion,
  casualtyRules,
} from "./soldier-presentation";
import { weaponProfiles } from "./weapons";
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
  body: Entity;
  hips: Entity;
  magazine: Entity;
  reloadMagazine: Entity;
  style: ReturnType<typeof soldierStyle>;
  phase: number;
  upper: Entity;
  rifle: Entity;
  bolt: Entity;
  supportHand: Entity;
  arms: { shoulder: Entity; elbow: Entity }[];
  legs: { hip: Entity; knee: Entity; ankle: Entity }[];
};
type Harness = {
  app: { root: Entity };
  map: typeof trenchMap;
  people: Entity[];
  soldiers: Rig[];
  blastFlinches: Map<number, { tick: number; strength: number }>;
  cube: Renderer["cube"];
  createSoldier(p: Soldier): void;
  collapseSoldier(p: Soldier, age: number): void;
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
  Object.assign(renderer.app.root, { _enabledInHierarchy: true });
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

it("thrusts and butt-strikes with both wrists on the weapon, then restores the pose without changing simulation state", () => {
  for (const kind of ["bayonet", "charge", "butt"] as const) {
    const g = new Game(new TestCollision(trenchMap), false),
      p = g.players[0];
    p.weapon = kind === "butt" ? "machineGun" : "serviceRifle";
    const rule = meleeRules[kind];
    p.melee = {
      kind,
      startTick: 100,
      strikeTick: 100 + rule.windup,
      endTick:
        kind === "charge" ? Number.MAX_SAFE_INTEGER : 100 + rule.duration,
      yaw: 0,
      struck: false,
    };
    const r = rigFor(p),
      rig = r.soldiers[0],
      before = structuredClone(p);
    expect(!!r.people[0].findByName("bayonet blade")).toBe(kind !== "butt");
    for (const age of [
      ...Array.from({ length: rule.duration + 1 }, (_, i) => i),
      ...(kind === "charge" ? [120, 600] : []),
    ]) {
      r.animateSoldier(p, p.x, p.z, 1 / 60, 100 + age);
      const left = rig.arms[0].elbow
        .getWorldTransform()
        .transformPoint(new Vec3(0, -armLengths.forearm, 0));
      expect(
        left.distance(rig.supportHand.getPosition()),
        `${kind} frame${age}`,
      ).toBeLessThan(0.001);
      const right = rig.arms[1].elbow
        .getWorldTransform()
        .transformPoint(new Vec3(0, -armLengths.forearm, 0));
      const trigger = rig.rifle
        .getWorldTransform()
        .transformPoint(new Vec3(0, -0.03, 0.14));
      expect(right.distance(trigger), `${kind} right frame${age}`).toBeLessThan(
        0.001,
      );
    }
    expect(p).toEqual(before);
    p.melee = null;
    r.animateSoldier(p, p.x, p.z, 1 / 60, 200);
    expect(rig.arms[0].shoulder.getLocalPosition().z).toBeCloseTo(-0.12);
  }
});

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
      .transformPoint(new Vec3(0, -armLengths.forearm, 0));
    expect(supportWrist.distance(rig.supportHand.getPosition())).toBeLessThan(
      0.0001,
    );
    if (phase === 0.46) {
      const wrist = rig.arms[1].elbow
        .getWorldTransform()
        .transformPoint(new Vec3(0, -armLengths.forearm, 0));
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
      .transformPoint(new Vec3(0, -armLengths.forearm, 0));
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
  r.animateSoldier(p, p.x, p.z, 1 / 60, 159);
  const futureIdle = rig.rifle.forward.clone();
  r.animateSoldier(p, p.x, p.z, 1 / 60, 99);
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
      .transformPoint(new Vec3(0, -armLengths.forearm, 0));
    expect(wrist.distance(rig.supportHand.getPosition())).toBeLessThan(0.0001);
    if (age === 0) {
      expect(z - rest.z).toBeGreaterThan(0.08);
      expect(rig.rifle.forward.y).toBeGreaterThan(restDirection.y + 0.04);
    }
  }
  for (let i = 0; i < 60; i++) game.step(idle());
  r.animateSoldier(p, p.x, p.z, 1 / 60, game.tick - 1);
  expect(rig.rifle.getLocalPosition().z).toBeCloseTo(rest.z, 4);
  expect(rig.rifle.forward.y).toBeCloseTo(futureIdle.y, 4);
});

it("tucks falling legs and keeps the rifle grip attached while the root drops", () => {
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
    x: -18.8,
    z: -27,
    y: 1.3,
    fall: { startTick: 100, velocity: -6 },
  });
  const r = rigFor(p),
    rig = r.soldiers[0];
  r.animateSoldier(p, p.x, p.z, 1 / 60, 110);
  for (const leg of rig.legs)
    expect(leg.ankle.getPosition().y).toBeGreaterThan(p.y + 0.07);
  const wrist = rig.arms[0].elbow
    .getWorldTransform()
    .transformPoint(new Vec3(0, -armLengths.forearm, 0));
  expect(wrist.distance(rig.supportHand.getPosition())).toBeLessThan(0.0001);
});

it("braces after a nearby blast without detaching the support hand, then settles", () => {
  const game = new Game(
    new TestCollision(trenchMap),
    false,
    600,
    12345,
    undefined,
    { map: trenchMap },
  );
  const p = game.players[0],
    r = rigFor(p),
    rig = r.soldiers[0];
  r.blastFlinches = new Map([[p.id, { tick: 100, strength: 1 }]]);
  r.animateSoldier(p, p.x, p.z, 1 / 60, 99);
  const rest = rig.upper.forward.clone();
  const control = rigFor(p);
  control.animateSoldier(p, p.x, p.z, 1 / 60, 130);
  const futureIdle = control.soldiers[0].upper.forward.clone();
  r.animateSoldier(p, p.x, p.z, 1 / 60, 103);
  expect(rig.upper.forward.distance(rest)).toBeGreaterThan(0.02);
  const wrist = rig.arms[0].elbow
    .getWorldTransform()
    .transformPoint(new Vec3(0, -armLengths.forearm, 0));
  expect(wrist.distance(rig.supportHand.getPosition())).toBeLessThan(0.0001);
  r.animateSoldier(p, p.x, p.z, 1 / 60, 130);
  expect(rig.upper.forward.distance(futureIdle)).toBeLessThan(0.0001);
  expect(r.blastFlinches.size).toBe(0);
});

it("varies cadence and idle upper-body motion without moving planted boots or simulation state", () => {
  const g = new Game(
      new TestCollision(trenchMap),
      false,
      3000,
      12345,
      undefined,
      { map: trenchMap },
    ),
    p = g.players[0];
  p.landedAt = -1000;
  const a = rigFor(p),
    b = rigFor(p);
  b.soldiers[0].style = soldierStyle(17);
  const before = structuredClone(p);
  a.animateSoldier(p, p.x, p.z, 1 / 60, 100);
  const ankle = a.soldiers[0].legs[0].ankle.getPosition().clone(),
    facing = a.soldiers[0].upper.forward.clone();
  a.animateSoldier(p, p.x, p.z, 1 / 60, 160);
  expect(
    a.soldiers[0].legs[0].ankle.getPosition().distance(ankle),
  ).toBeLessThan(0.0001);
  expect(a.soldiers[0].upper.forward.distance(facing)).toBeGreaterThan(0.001);
  for (let i = 1; i <= 20; i++) {
    a.animateSoldier(p, p.x + i * 0.08, p.z, 1 / 60, 160 + i);
    b.animateSoldier(p, p.x + i * 0.08, p.z, 1 / 60, 160 + i);
  }
  expect(Math.abs(a.soldiers[0].phase - b.soldiers[0].phase)).toBeGreaterThan(
    0.01,
  );
  expect(p).toEqual(before);
  for (const name of [
    "helmet brim",
    "web belt",
    "ammunition pouch",
    "webbing strap",
    "pack flap",
    "rolled blanket",
  ])
    expect(a.people[0].findByName(name)).toBeTruthy();
});
it("animates magazine exchanges and service-rifle clips with the support wrist attached, then restores the firing pose", () => {
  for (const weapon of ["rifle", "serviceRifle", "machineGun"] as const) {
    const g = new Game(new TestCollision(trenchMap), false),
      p = g.players[0];
    p.weapon = weapon;
    p.reloadAt = 100 + weaponProfiles[weapon].reloadTicks;
    p.landedAt = -1000;
    const r = rigFor(p),
      rig = r.soldiers[0],
      hands = [];
    const magazineChanges = vi.spyOn(rig.magazine, "enabled", "set"),
      carriedChanges = vi.spyOn(rig.reloadMagazine, "enabled", "set");
    for (let i = 0; i < 100; i++) {
      const tick = 100 + (i / 100) * weaponProfiles[weapon].reloadTicks;
      r.animateSoldier(p, p.x, p.z, 1 / 60, tick);
      const wrist = rig.arms[0].elbow
        .getWorldTransform()
        .transformPoint(new Vec3(0, -armLengths.forearm, 0));
      expect(wrist.distance(rig.supportHand.getPosition())).toBeLessThan(
        0.0001,
      );
      const motion = reloadMotion(p, tick)!;
      expect(rig.magazine.getLocalScale().length() > 0).toBe(!motion.removed);
      expect(rig.reloadMagazine.getLocalScale().length() > 0).toBe(
        motion.carrying,
      );
      if (i === 40 || i === 79)
        hands.push(rig.arms[1].elbow.getPosition().clone());
    }
    expect(hands[0].distance(hands[1])).toBeGreaterThan(0.1);
    p.reloadAt = 0;
    r.animateSoldier(p, p.x, p.z, 1 / 60, 200);
    expect(rig.magazine.enabled).toBe(true);
    expect(rig.reloadMagazine.getLocalScale().length()).toBe(0);
    expect(magazineChanges).not.toHaveBeenCalled();
    expect(carriedChanges).not.toHaveBeenCalled();
  }
});
it("opens, retracts and closes the service bolt with the right wrist on its knob and the left wrist on the stock", () => {
  const g = new Game(
      new TestCollision(trenchMap),
      false,
      3000,
      12345,
      undefined,
      { map: trenchMap },
    ),
    p = g.players[0];
  p.lastShotAt = 100;
  const r = rigFor(p),
    rig = r.soldiers[0];
  const before = structuredClone(p);
  for (const age of [9, 17, 20, 27, 28]) {
    r.animateSoldier(p, p.x, p.z, 1 / 60, 100 + age);
    const motion = boltMotion(p, 100 + age)!;
    expect(rig.bolt.getLocalPosition().z).toBeCloseTo(
      0.13 + 0.13 * motion.pull,
    );
    const knob = rig.bolt
      .getWorldTransform()
      .transformPoint(new Vec3(0.105, 0, 0));
    const right = rig.arms[1].elbow
      .getWorldTransform()
      .transformPoint(new Vec3(0, -armLengths.forearm, 0));
    expect(right.distance(knob)).toBeLessThan(0.001);
    const left = rig.arms[0].elbow
      .getWorldTransform()
      .transformPoint(new Vec3(0, -armLengths.forearm, 0));
    expect(left.distance(rig.supportHand.getPosition())).toBeLessThan(0.001);
  }
  r.animateSoldier(p, p.x, p.z, 1 / 60, 136);
  expect(rig.bolt.getLocalPosition().z).toBeCloseTo(0.13);
  expect(rig.bolt.getLocalEulerAngles().z).toBeCloseTo(0);
  expect(p).toEqual(before);
});
it("buckles and topples progressively while retaining equipment and the support grip", () => {
  const g = new Game(new TestCollision(trenchMap), false),
    p = g.players[0],
    r = rigFor(p),
    rig = r.soldiers[0];
  const snapshot = structuredClone(p);
  r.collapseSoldier(p, 0);
  const upright = rig.body.getLocalRotation().clone();
  r.collapseSoldier(p, 0.2);
  expect(Math.abs(rig.legs[0].knee.getLocalEulerAngles().x)).toBeGreaterThan(
    50,
  );
  expect(Math.abs(rig.body.getLocalEulerAngles().z)).toBeLessThan(10);
  r.collapseSoldier(p, casualtyRules.fallSeconds);
  expect(Math.abs(rig.body.getLocalEulerAngles().z)).toBeGreaterThan(60);
  expect(rig.body.getLocalRotation().equals(upright)).toBe(false);
  const wrist = rig.arms[0].elbow
    .getWorldTransform()
    .transformPoint(new Vec3(0, -armLengths.forearm, 0));
  expect(wrist.distance(rig.supportHand.getPosition())).toBeLessThan(0.0001);
  expect(p).toEqual(snapshot);
});
