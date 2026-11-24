import { battlePerformance } from "./battle-performance";
import { AmmoPhysicsWorld, Vec2, Vec3, Quat, Mat4, BODYGROUP_STATIC, BODYGROUP_USER_1, BODYGROUP_USER_2 } from "playcanvas";
import { groundHeight, supportHeight, type MapDefinition, type Box } from "./map";

type Body = ReturnType<AmmoPhysicsWorld["createBody"]>;
type Joint = ReturnType<AmmoPhysicsWorld["createJoint"]>;
type Settings = Parameters<AmmoPhysicsWorld["createJoint"]>[0]["settings"];
export type RagdollPart = {
  name: string; position: Vec3; rotation: Quat; mass: number;
  shape: "box" | "capsule" | "sphere"; size: Vec3;
  parent?: string; anchor?: Vec3; axis?: Vec3;
  hinge?: [number, number]; swing?: number; twist?: number;
};

function jointSettings(spec: RagdollPart): Settings {
  const zero = new Vec3(), pair = new Vec2();
  return {
    breakImpulse: Infinity, enableLimits: true,
    limits: new Vec2(...(spec.hinge ?? [-20, 20])), motorSpeed: 0, maxMotorForce: 0,
    swingLimitY: spec.swing ?? 55, swingLimitZ: spec.swing ?? 55, twistLimit: spec.twist ?? 30,
    linearMotionX: "locked", linearMotionY: "locked", linearMotionZ: "locked",
    linearLimitsX: pair, linearLimitsY: pair, linearLimitsZ: pair,
    linearStiffness: zero, linearDamping: zero, linearEquilibrium: zero,
    angularMotionX: "limited", angularMotionY: "limited", angularMotionZ: "limited",
    angularLimitsX: pair, angularLimitsY: pair, angularLimitsZ: pair,
    angularStiffness: zero, angularDamping: zero, angularEquilibrium: zero,
  };
}

export class Ragdoll {
  readonly bodies: Body[] = [];
  readonly joints: Joint[] = [];
  readonly bind: Mat4[];
  readonly positions: Vec3[];
  readonly rotations: Quat[];
  frozen = false;
  poseVersion = 0;
  private age = 0;
  private restClock = 0;
  private quietTime = 0;
  private velocity = new Vec3();
  constructor(readonly owner: RagdollPhysics, readonly parts: RagdollPart[], velocity: Vec3) {
    this.bind = parts.map(p => new Mat4().setTRS(p.position, p.rotation, Vec3.ONE));
    this.positions = parts.map(p => p.position.clone());
    this.rotations = parts.map(p => p.rotation.clone());
    try {
      for (const p of parts) {
        const body = owner.world.createBody({ type: "dynamic", mass: p.mass,
          shape: owner.shape(p), position: p.position, rotation: p.rotation, entity: null });
        body.setFriction(0.85); body.setRollingFriction(0.05);
        body.setRestitution(0.02); body.setDamping(0.18, 0.4);
        body.setLinearVelocity(velocity);
        // Corpses collide with earth and cover, never living soldiers, shots,
        // other corpses or their own overlapping anatomical capsules.
        owner.world.addBody(body, BODYGROUP_USER_1, BODYGROUP_STATIC | BODYGROUP_USER_2);
        this.bodies.push(body);
      }
      this.connect();
    } catch (error) { this.destroy(); throw error; }
  }
  private connect() {
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      if (!p.parent || !p.anchor) continue;
      const parent = this.parts.findIndex(q => q.name === p.parent);
      const rotation = new Quat().setFromDirections(Vec3.RIGHT, p.axis ?? Vec3.UP);
      const frame = new Mat4().setTRS(p.anchor, rotation, Vec3.ONE);
      this.joints.push(this.owner.world.createJoint({ type: p.hinge ? "hinge" : "ball",
        bodyA: this.bodies[parent], bodyB: this.bodies[i], enableCollision: false,
        frameA: new Mat4().mul2(this.bind[parent].clone().invert(), frame),
        frameB: new Mat4().mul2(this.bind[i].clone().invert(), frame), settings: jointSettings(p) }));
    }
  }
  // Remove constraints and bodies from the solver, retaining their native
  // allocations and final pose for fast reactivation without remeshing.
  freeze() {
    if (this.frozen) return;
    this.read();
    for (const joint of this.joints.splice(0)) this.owner.world.destroyJoint(joint);
    for (const body of this.bodies) this.owner.world.removeBody(body);
    this.frozen = true;
    battlePerformance.count("ragdollsFrozen");
  }
  readyToFreeze(dt: number) {
    if (this.frozen) return false;
    this.age += dt; this.restClock += dt;
    if (this.age < 1.25 || this.restClock < .15) return false;
    const elapsed = this.restClock; this.restClock = 0;
    for (let i = 0; i < this.bodies.length; i++) {
      const body = this.bodies[i], core = this.parts[i].name === "torso" || this.parts[i].name === "pelvis";
      body.getLinearVelocity(this.velocity);
      if (this.velocity.lengthSq() > (core ? .08 : .4) ** 2) { this.quietTime = 0; return false; }
      body.getAngularVelocity(this.velocity);
      // Tiny constrained feet can keep spinning in contact after the trunk
      // rests. Bound limb translation and core rotation without letting that
      // solver jitter keep the entire corpse active for its full lifetime.
      if (!this.parts[i].name.endsWith("foot") && this.velocity.lengthSq() > (core ? .4 : 1.2) ** 2) {
        this.quietTime = 0; return false;
      }
    }
    this.quietTime += Math.min(elapsed, .2);
    return this.quietTime >= .75;
  }
  read() {
    if (this.frozen) return;
    this.poseVersion++;
    for (let i = 0; i < this.bodies.length; i++)
      this.bodies[i].getTransform(this.positions[i], this.rotations[i]);
  }
  hit(impulse: Vec3, at?: Vec3) {
    this.wake(); this.read();
    let nearest = this.parts.findIndex(p => p.name === "torso");
    if (at) nearest = this.positions.reduce((best, p, i) => p.distance(at) < this.positions[best].distance(at) ? i : best, 0);
    const relative = at ? at.clone().sub(this.positions[nearest]) : new Vec3();
    if (relative.length() > 0.35) relative.normalize().mulScalar(0.35);
    this.bodies[nearest].applyImpulse(impulse, relative);
  }
  blast(at: Vec3, radius: number, power: number) {
    this.read();
    const center = this.positions[0], delta = center.clone().sub(at), distance = delta.length();
    if (distance >= radius) return;
    this.wake();
    delta.y = Math.max(0.3, delta.y); delta.normalize();
    const strength = (1 - distance / radius) * power;
    const mass = this.parts.reduce((sum, p) => sum + p.mass, 0);
    for (let i = 0; i < this.bodies.length; i++)
      this.bodies[i].applyImpulse(delta.clone().mulScalar(strength * this.parts[i].mass / mass), Vec3.ZERO);
  }
  wake() {
    if (this.frozen) {
      this.frozen = false;
      for (const body of this.bodies) {
        body.setLinearVelocity(Vec3.ZERO); body.setAngularVelocity(Vec3.ZERO);
        this.owner.world.addBody(body, BODYGROUP_USER_1, BODYGROUP_STATIC | BODYGROUP_USER_2);
      }
      this.connect(); this.owner.reactivated(this);
      battlePerformance.count("ragdollsWoken");
    }
    this.quietTime = this.restClock = 0;
    for (const body of this.bodies) body.activate();
  }
  destroy() {
    for (const joint of this.joints.splice(0)) this.owner.world.destroyJoint(joint);
    for (const body of this.bodies.splice(0)) { if (!this.frozen) this.owner.world.removeBody(body); this.owner.world.destroyBody(body); }
    this.owner.ragdolls.delete(this);
  }
}

// Shares the existing native terrain world, whose triangle patches already
// follow excavation. Local cover proxies use a separate collision group and
// are excluded from authoritative gameplay rays.
export const ragdollMaxSubsteps = 2;
export class RagdollPhysics {
  readonly ragdolls = new Set<Ragdoll>();
  private shapes = new Map<string, object>();
  private cover = new Map<string, { body: Body; shape: object; signature: string; box: Box }>();
  private supports = new WeakMap<Ragdoll, number[]>();
  private coverAge = Infinity;
  private revision = -1;
  private terrainRevision = -1;
  constructor(readonly world: AmmoPhysicsWorld, readonly map: MapDefinition) {
    world.setGravity(new Vec3(0, -9.81, 0));
  }
  shape(p: RagdollPart) {
    const s = p.size.clone();
    s.set(Math.round(s.x * 1000) / 1000, Math.round(s.y * 1000) / 1000, Math.round(s.z * 1000) / 1000);
    const key = `${p.shape}:${s.x}:${s.y}:${s.z}`;
    let shape = this.shapes.get(key);
    if (!shape) {
      shape = this.world.createShape(p.shape === "box"
        ? { type: "box", halfExtents: s }
        : p.shape === "sphere" ? { type: "sphere", radius: s.x }
        : { type: "capsule", radius: s.x, height: Math.max(s.y, s.x * 2), axis: 1 });
      this.shapes.set(key, shape);
    }
    return shape;
  }
  create(parts: RagdollPart[], velocity: Vec3) {
    const doll = new Ragdoll(this, parts, velocity);
    this.ragdolls.add(doll); this.coverAge = Infinity;
    return doll;
  }
  reactivated(doll: Ragdoll) { this.coverAge = Infinity; this.supports.delete(doll); }
  private syncCover() {
    const terrainRevision = this.map.destruction?.terrainRevision ?? this.map.destruction?.revision ?? 0;
    const centers = [...this.ragdolls].map(d => {
      d.read();
      const old = this.supports.get(d);
      if (!d.frozen || !old || terrainRevision !== this.terrainRevision) {
        const heights = d.positions.map(p => supportHeight(p.x, p.z, this.map, p.y));
        if (old && heights.some((h, i) => Math.abs(h - old[i]) > 0.025)) d.wake();
        this.supports.set(d, heights);
      }
      return d.positions[0];
    });
    this.terrainRevision = terrainRevision;
    const desired = new Map<string, Box>();
    for (let i = 0; i < this.map.boxes.length; i++) {
      const b = this.map.boxes[i];
      if (centers.some(p => Math.abs(p.x - b.x) < 7 + b.w / 2 && Math.abs(p.z - b.z) < 7 + b.d / 2))
        desired.set(b.id ?? `box-${i}`, b);
    }
    for (const [id, entry] of this.cover) {
      const b = desired.get(id);
      if (b && `${b.x}:${b.z}:${b.w}:${b.h}:${b.d}:${b.baseY ?? 0}` === entry.signature) continue;
      for (const doll of this.ragdolls) {
        const p = doll.positions[0], old = entry.box;
        if (Math.abs(p.x - old.x) < old.w / 2 + 2 && Math.abs(p.z - old.z) < old.d / 2 + 2) doll.wake();
      }
      this.world.removeBody(entry.body); this.world.destroyBody(entry.body); this.world.destroyShape(entry.shape);
      this.cover.delete(id);
    }
    for (const [id, box] of desired) if (!this.cover.has(id)) {
      const shape = this.world.createShape({ type: "box", halfExtents: new Vec3(box.w / 2, box.h / 2, box.d / 2) });
      const body = this.world.createBody({ type: "static", mass: 0, shape,
        position: new Vec3(box.x, (box.baseY ?? 0) + box.h / 2, box.z), rotation: new Quat().setFromEulerAngles(0,0,(box.architecture?.roofPitch??0)*180/Math.PI), entity: null });
      this.world.addBody(body, BODYGROUP_USER_2, BODYGROUP_USER_1);
      this.cover.set(id, { body, shape, box: { ...box }, signature: `${box.x}:${box.z}:${box.w}:${box.h}:${box.d}:${box.baseY ?? 0}` });
    }
  }
  step(dt: number) {
    if (dt <= 0) return;
    const updateStart = battlePerformance.begin();
    const revision = this.map.destruction?.revision ?? 0;
    this.coverAge += dt;
    if (this.coverAge >= 0.25 || revision !== this.revision) {
      this.syncCover(); this.coverAge = 0;
      this.revision = revision;
    }
    const start = battlePerformance.begin();
    // At most two physics steps a frame. After a slow frame the bodies fall a
    // little behind real time instead of running six steps at once, which
    // would make the next frame slow too.
    if ([...this.ragdolls].some(d => !d.frozen)) this.world.step(Math.min(dt, 0.1), ragdollMaxSubsteps, 1 / 60);
    battlePerformance.end("ragdollPhysics",start);
    let frozen = 0;
    for (const doll of this.ragdolls) if (doll.readyToFreeze(Math.min(dt, .1)) && frozen < 2) {
      doll.freeze(); frozen++;
      this.supports.set(doll, doll.positions.map(p => supportHeight(p.x, p.z, this.map, p.y)));
    }
    battlePerformance.end("ragdollUpdate", updateStart);
  }
  destroy() {
    for (const doll of [...this.ragdolls]) doll.destroy();
    for (const { body, shape } of this.cover.values()) { this.world.removeBody(body); this.world.destroyBody(body); this.world.destroyShape(shape); }
    this.cover.clear();
    for (const shape of this.shapes.values()) this.world.destroyShape(shape);
    this.shapes.clear();
  }
}
