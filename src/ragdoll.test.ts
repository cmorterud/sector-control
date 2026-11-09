import { expect, it } from "vitest";
import { Vec3, Quat, Mat4, BODYGROUP_STATIC, BODYGROUP_USER_1 } from "playcanvas";
import { createPhysicsWorld } from "./physics";
import { industrialMap } from "./map";
import { RagdollPhysics, type RagdollPart } from "./ragdoll";

function parts(): RagdollPart[] {
  const body: RagdollPart[] = [
    { name: "pelvis", position: new Vec3(0, 0.94, 0), rotation: new Quat(), mass: 11, shape: "box", size: new Vec3(0.2, 0.12, 0.14) },
    { name: "torso", position: new Vec3(0, 1.25, 0), rotation: new Quat(), mass: 24, shape: "box", size: new Vec3(0.24, 0.23, 0.16), parent: "pelvis", anchor: new Vec3(0, 1.07, 0), swing: 25 },
    { name: "head", position: new Vec3(0, 1.74, 0), rotation: new Quat(), mass: 5, shape: "sphere", size: new Vec3(0.14, 0, 0), parent: "torso", anchor: new Vec3(0, 1.55, 0) },
  ];
  for (const sign of [-1, 1]) {
    const side = sign < 0 ? "left" : "right";
    const capsule = (name: string, x: number, y: number, length: number, parent: string, radius: number, mass: number, hinge?: [number, number]) =>
      body.push({ name, position: new Vec3(x, y, 0), rotation: new Quat(), mass, shape: "capsule", size: new Vec3(radius, length, 0), parent, anchor: new Vec3(x, y + length / 2, 0), axis: Vec3.RIGHT, hinge });
    capsule(`${side} arm`, sign * 0.3, 1.25, 0.34, "torso", 0.075, 2.5);
    capsule(`${side} forearm`, sign * 0.3, 0.9, 0.36, `${side} arm`, 0.065, 1.5, [-5, 125]);
    capsule(`${side} thigh`, sign * 0.14, 0.73, 0.42, "pelvis", 0.10, 8);
    capsule(`${side} calf`, sign * 0.14, 0.32, 0.4, `${side} thigh`, 0.08, 5, [-125, 5]);
    body.push({ name: `${side} foot`, position: new Vec3(sign * 0.14, 0.07, -0.06), rotation: new Quat(), mass: 1, shape: "box", size: new Vec3(0.09, 0.065, 0.13), parent: `${side} calf`, anchor: new Vec3(sign * 0.14, 0.12, 0), swing: 25 });
  }
  return body;
}
function scene(wall = false) {
  const world = createPhysicsWorld();
  const floor = world.createShape({ type: "box", halfExtents: new Vec3(10, 0.1, 10) });
  const body = world.createBody({ type: "static", mass: 0, shape: floor, position: new Vec3(0, -0.1, 0), rotation: new Quat(), entity: null });
  world.addBody(body, BODYGROUP_STATIC, BODYGROUP_USER_1);
  const physics = new RagdollPhysics(world, { ...industrialMap, boxes: wall ? [{ x: 0.8, z: 0, w: 0.1, d: 5, h: 3, kind: "barrier" }] : [] });
  return { physics, world, dispose() { physics.destroy(); world.removeBody(body); world.destroyBody(body); world.destroyShape(floor); world.destroy(); } };
}
function checkJoints(doll: ReturnType<RagdollPhysics["create"]>) {
  doll.read();
  for (let i = 0; i < doll.parts.length; i++) {
    const p = doll.parts[i];
    if (!p.parent || !p.anchor) continue;
    const parent = doll.parts.findIndex(q => q.name === p.parent);
    const a = new Mat4().setTRS(doll.positions[parent], doll.rotations[parent], Vec3.ONE)
      .transformPoint(doll.bind[parent].clone().invert().transformPoint(p.anchor));
    const b = new Mat4().setTRS(doll.positions[i], doll.rotations[i], Vec3.ONE)
      .transformPoint(doll.bind[i].clone().invert().transformPoint(p.anchor));
    expect(a.distance(b), p.name).toBeLessThan(0.07);
  }
}

it("drops a real 13-body/12-joint Ammo ragdoll onto earth while keeping the limbs connected", () => {
  const s = scene();
  try {
    const doll = s.physics.create(parts(), new Vec3(1, 0, 0));
    doll.hit(new Vec3(9, 0, -4), new Vec3(0.1, 1.4, 0));
    expect(doll.bodies).toHaveLength(13); expect(doll.joints).toHaveLength(12);
    for (let i = 0; i < 300; i++) s.physics.step(1 / 60);
    checkJoints(doll);
    expect(doll.positions[1].y).toBeLessThan(0.7);
    expect(doll.positions.every(p => Number.isFinite(p.x + p.y + p.z) && p.y > -0.03)).toBe(true);
    const before = doll.positions.map(p => p.clone());
    s.physics.step(0); doll.read();
    expect(doll.positions.every((p, i) => p.equals(before[i]))).toBe(true);
  } finally { s.dispose(); }
});

it("uses local solid cover proxies, reacts to blasts and releases all native joints/bodies", () => {
  const s = scene(true);
  try {
    const doll = s.physics.create(parts(), new Vec3(4, 0, 0));
    for (let i = 0; i < 120; i++) s.physics.step(1 / 60);
    checkJoints(doll);
    expect(doll.positions[1].x).toBeLessThan(0.7);
    const before = doll.positions[0].clone();
    doll.blast(new Vec3(1, 0.1, 0), 7, 160);
    for (let i = 0; i < 90; i++) s.physics.step(1 / 60);
    checkJoints(doll);
    expect(doll.positions[0].distance(before)).toBeGreaterThan(0.15);
    doll.destroy();
    expect(doll.bodies).toHaveLength(0); expect(doll.joints).toHaveLength(0);
    expect(s.physics.ragdolls.size).toBe(0);
  } finally { s.dispose(); }
});

it("keeps the fall consistent at 30, 60 and 120 presentation frames per second", () => {
  const results = [30, 60, 120].map(fps => {
    const s = scene();
    try {
      const doll = s.physics.create(parts(), new Vec3(0.8, 0, 0));
      doll.hit(new Vec3(7, 0, -2), new Vec3(0.1, 1.4, 0));
      for (let i = 0; i < fps * 3; i++) s.physics.step(1 / fps);
      doll.read(); return doll.positions.map(p => p.clone());
    } finally { s.dispose(); }
  });
  for (const positions of results)
    for (let i = 0; i < positions.length; i++) expect(positions[i].distance(results[1][i])).toBeLessThan(0.04);
});
