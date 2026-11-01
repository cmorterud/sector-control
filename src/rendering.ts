import * as pc from "playcanvas";
import Ammo from "sync-ammo/dist/ammo.module.js";
import { boxes, blocked, type Vec } from "./map";
import {
  type CollisionWorld,
  type Game,
  type V3,
  type Event,
  type Soldier,
} from "./simulation";
const color = (hex: string) => new pc.Color().fromString(hex);
const supportUpperLength = 0.42;
const supportForearmLength = 0.46;
type SoldierRig = {
  body: pc.Entity;
  hips: pc.Entity;
  upper: pc.Entity;
  legs: { hip: pc.Entity; knee: pc.Entity; ankle: pc.Entity }[];
  arms: { shoulder: pc.Entity; elbow: pc.Entity }[];
  rifle: pc.Entity;
  supportHand: pc.Entity;
  x: number;
  z: number;
  phase: number;
  motion: number;
  sprint: number;
  alive: boolean;
};

export class Renderer implements CollisionWorld {
  app: pc.Application;
  camera: pc.Entity;
  people: pc.Entity[] = [];
  private soldiers: SoldierRig[] = [];
  rings: pc.Entity[] = [];
  effects: { e: pc.Entity; life: number }[] = [];
  materials = new Map<string, pc.StandardMaterial>();
  previous: Vec[] = [];
  constructor(public canvas: HTMLCanvasElement) {
    (globalThis as unknown as { Ammo: unknown }).Ammo = Ammo;
    this.app = new pc.Application(canvas, {
      graphicsDeviceOptions: {
        deviceTypes: [pc.DEVICETYPE_WEBGL2],
        antialias: true,
      },
    });
    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);
    this.app.scene.ambientLight = color("#899294");
    this.app.scene.fog.type = "linear";
    this.app.scene.fog.color = color("#9ca6a5");
    this.app.scene.fog.start = 35;
    this.app.scene.fog.end = 115;
    this.camera = new pc.Entity("camera");
    this.camera.addComponent("camera", {
      clearColor: color("#9ca6a5"),
      fov: 70,
      nearClip: 0.08,
      farClip: 180,
    });
    this.app.root.addChild(this.camera);
    const sun = new pc.Entity("sun");
    sun.addComponent("light", {
      type: "directional",
      color: color("#ffdfa8"),
      intensity: 1.5,
      castShadows: true,
      shadowDistance: 65,
      shadowResolution: 2048,
      shadowBias: 0.25,
      normalOffsetBias: 0.05,
    });
    sun.setEulerAngles(45, -35, 0);
    this.app.root.addChild(sun);
    this.cube("ground", 0, -0.3, 0, 100, 0.6, 100, "#777d73", true);
    for (const b of boxes) {
      const c =
        b.kind === "building"
          ? "#707a79"
          : b.kind === "container"
            ? "#657b7b"
            : "#aaa58d";
      this.cube(b.kind, b.x, b.h / 2, b.z, b.w, b.h, b.d, c, true);
      if (b.kind === "building") {
        this.cube(
          "roof",
          b.x,
          b.h + 0.15,
          b.z,
          b.w + 0.3,
          0.3,
          b.d + 0.3,
          "#454f50",
        );
        for (let y = 2; y < b.h; y += 3)
          this.cube(
            "band",
            b.x,
            y,
            b.z,
            b.w + 0.05,
            0.12,
            b.d + 0.05,
            "#b4b2a0",
          );
      }
      if (b.kind === "container")
        for (let i = -b.d / 2 + 0.4; i < b.d / 2; i += 0.7)
          this.cube(
            "rib",
            b.x,
            b.h / 2,
            b.z + i,
            b.w + 0.08,
            b.h,
            0.07,
            "#465f61",
          );
    }
    for (const [x, z, w, d] of [
      [0, -50, 101, 1],
      [0, 50, 101, 1],
      [-50, 0, 1, 100],
      [50, 0, 1, 100],
    ])
      this.cube("perimeter", x, 2, z, w, 4, d, "#666e69", true);
    for (let i = -45; i < 50; i += 10) {
      this.cube("road marking", i, 0.015, -1, 3, 0.02, 0.12, "#b8b29b");
      this.cube("road marking", 1, 0.015, i, 0.12, 0.02, 3, "#b8b29b");
    }
    window.addEventListener("resize", () => this.app.resizeCanvas());
    // Simulation calls collision queries synchronously; no automatic physics advancement.
    this.app.systems.rigidbody!.timeScale = 0;
    this.app.start();
  }
  material(c: string) {
    if (!this.materials.has(c)) {
      const m = new pc.StandardMaterial();
      m.diffuse = color(c);
      m.gloss = 0.1;
      m.update();
      this.materials.set(c, m);
    }
    return this.materials.get(c)!;
  }
  cube(
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    c: string,
    solid = false,
    parent?: pc.Entity,
  ) {
    const e = new pc.Entity(name);
    e.addComponent("render", {
      type: "box",
      material: this.material(c),
      castShadows: true,
      receiveShadows: true,
    });
    e.setLocalPosition(x, y, z);
    e.setLocalScale(w, h, d);
    (parent ?? this.app.root).addChild(e);
    if (solid) {
      e.addComponent("collision", {
        type: "box",
        halfExtents: new pc.Vec3(w / 2, h / 2, d / 2),
      });
      e.addComponent("rigidbody", { type: "static", friction: 0 });
    }
    return e;
  }
  ray(a: V3, b: V3) {
    const hit = this.app.systems.rigidbody!.raycastFirst(
      new pc.Vec3(a.x, a.y, a.z),
      new pc.Vec3(b.x, b.y, b.z),
    );
    return hit
      ? hit.point.distance(new pc.Vec3(a.x, a.y, a.z)) /
          Math.max(0.001, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z))
      : 1;
  }
  move(p: Vec, d: Vec) {
    // Flat, axis-aligned map: conservative capsule footprint swept in short substeps.
    // The same map colliders are registered with PlayCanvas/Ammo for rays and camera queries.
    const n = Math.max(1, Math.ceil(Math.hypot(d.x, d.z) / 0.15));
    let x = p.x,
      z = p.z;
    for (let i = 0; i < n; i++) {
      if (!blocked(x + d.x / n, z, 0.45)) x += d.x / n;
      if (!blocked(x, z + d.z / n, 0.45)) z += d.z / n;
    }
    return { x, z };
  }
  private joint(name: string, parent: pc.Entity, x = 0, y = 0, z = 0) {
    const joint = new pc.Entity(name);
    parent.addChild(joint);
    joint.setLocalPosition(x, y, z);
    return joint;
  }
  private createSoldier(p: Soldier) {
    const root = this.joint(`soldier-${p.id}`, this.app.root);
    const body = this.joint("body", root, 0, 0.94);
    const hips = this.joint("hips", body);
    const upper = this.joint("upper body", body, 0, 0.08);
    const shirt = p.team === "blue" ? "#46a9d8" : "#de6e5f";
    const trousers = "#414e48";
    const equipment = "#343f3c";
    this.cube("pelvis", 0, -0.015, 0, 0.49, 0.2, 0.33, trousers, false, hips);
    this.cube("torso", 0, 0.26, 0, 0.59, 0.5, 0.35, shirt, false, upper);
    this.cube("vest", 0, 0.27, -0.2, 0.48, 0.4, 0.13, equipment, false, upper);
    this.cube(
      "backpack",
      0,
      0.28,
      0.22,
      0.4,
      0.38,
      0.19,
      equipment,
      false,
      upper,
    );
    this.cube("neck", 0, 0.55, 0, 0.18, 0.16, 0.18, "#c1af90", false, upper);
    this.cube("head", 0, 0.66, 0, 0.35, 0.35, 0.35, "#c1af90", false, upper);
    this.cube("helmet", 0, 0.83, 0, 0.42, 0.18, 0.43, shirt, false, upper);
    const legs = [-1, 1].map((side) => {
      const hip = this.joint("hip", hips, side * 0.17);
      this.cube("thigh", 0, -0.21, 0, 0.25, 0.42, 0.28, trousers, false, hip);
      const knee = this.joint("knee", hip, 0, -0.42);
      this.cube("shin", 0, -0.185, 0, 0.21, 0.37, 0.24, trousers, false, knee);
      const ankle = this.joint("ankle", knee, 0, -0.4);
      this.cube("boot", 0, 0, -0.075, 0.25, 0.14, 0.4, "#27312e", false, ankle);
      return { hip, knee, ankle };
    });
    const arms = [-1, 1].map((side) => {
      const support = side < 0;
      const upperLength = support ? supportUpperLength : 0.3;
      const forearmLength = support ? supportForearmLength : 0.28;
      const shoulder = this.joint(
        "shoulder",
        upper,
        support ? -0.3 : 0.39,
        0.41,
        support ? -0.12 : 0,
      );
      this.cube(
        "upper arm",
        0,
        -upperLength / 2,
        0,
        0.22,
        upperLength,
        0.24,
        shirt,
        false,
        shoulder,
      );
      const elbow = this.joint("elbow", shoulder, 0, -upperLength);
      this.cube(
        "forearm",
        0,
        -forearmLength / 2,
        0,
        0.19,
        forearmLength,
        0.21,
        shirt,
        false,
        elbow,
      );
      if (!support)
        this.cube(
          "hand",
          0,
          -0.28,
          0,
          0.18,
          0.15,
          0.19,
          "#c1af90",
          false,
          elbow,
        );
      return { shoulder, elbow };
    });
    const rifle = this.joint("weapon", upper, 0.32, 0.36, -0.55);
    this.cube("rifle", 0, 0, 0, 0.14, 0.16, 0.76, "#232d2e", false, rifle);
    this.cube(
      "barrel",
      0,
      0.025,
      -0.45,
      0.07,
      0.08,
      0.25,
      "#232d2e",
      false,
      rifle,
    );
    this.cube(
      "foregrip",
      0,
      -0.11,
      -0.1,
      0.08,
      0.2,
      0.11,
      "#232d2e",
      false,
      rifle,
    );
    // The hand belongs to the weapon, so gait, recoil and reload cannot detach it.
    const supportHand = this.joint(
      "left hand grip",
      rifle,
      -0.035,
      -0.14,
      -0.1,
    );
    this.cube(
      "left hand",
      0,
      0,
      0,
      0.18,
      0.16,
      0.2,
      "#c1af90",
      false,
      supportHand,
    );
    this.people.push(root);
    this.soldiers.push({
      body,
      hips,
      upper,
      legs,
      arms,
      rifle,
      supportHand,
      x: p.x,
      z: p.z,
      phase: p.id * 1.7,
      motion: 0,
      sprint: 0,
      alive: p.hp > 0,
    });
  }
  private attachSupportArm(rig: SoldierRig) {
    const arm = rig.arms[0];
    const shoulder = arm.shoulder.getLocalPosition();
    const hand = rig.rifle
      .getLocalTransform()
      .transformPoint(rig.supportHand.getLocalPosition());
    const direction = new pc.Vec3().sub2(hand, shoulder);
    const distance = Math.max(
      0.001,
      Math.min(
        direction.length(),
        supportUpperLength + supportForearmLength - 0.001,
      ),
    );
    direction.normalize();
    // Bend the elbow down and out while keeping the wrist on the moving grip.
    const bend = new pc.Vec3(-0.7, -1, 0.1);
    bend.sub(direction.clone().mulScalar(bend.dot(direction))).normalize();
    const along =
      (supportUpperLength ** 2 - supportForearmLength ** 2 + distance ** 2) /
      (2 * distance);
    const height = Math.sqrt(Math.max(0, supportUpperLength ** 2 - along ** 2));
    const elbow = shoulder
      .clone()
      .add(direction.mulScalar(along))
      .add(bend.mulScalar(height));
    const upperRotation = new pc.Quat().setFromDirections(
      pc.Vec3.DOWN,
      elbow.clone().sub(shoulder).normalize(),
    );
    const forearmRotation = new pc.Quat().setFromDirections(
      pc.Vec3.DOWN,
      hand.sub(elbow).normalize(),
    );
    arm.shoulder.setLocalRotation(upperRotation);
    arm.elbow.setLocalRotation(
      upperRotation.clone().invert().mul(forearmRotation),
    );
  }
  private animateSoldier(
    p: Soldier,
    x: number,
    z: number,
    dt: number,
    tick: number,
  ) {
    const rig = this.soldiers[p.id];
    const dx = x - rig.x,
      dz = z - rig.z;
    const distance = Math.hypot(dx, dz);
    // Animate actual travel, not requested velocity against a wall or a respawn jump.
    const moved = p.hp > 0 && rig.alive && distance < 2 ? distance : 0;
    const speed = moved / Math.max(dt, 0.001);
    const blend = 1 - Math.exp(-12 * dt);
    const forward =
      speed > 0.05
        ? (dx * Math.sin(p.yaw) - dz * Math.cos(p.yaw)) /
          Math.max(distance, 0.001)
        : 0;
    const sideways =
      speed > 0.05
        ? (dx * Math.cos(p.yaw) + dz * Math.sin(p.yaw)) /
          Math.max(distance, 0.001)
        : 0;
    rig.x = x;
    rig.z = z;
    rig.alive = p.hp > 0;
    rig.motion = rig.alive
      ? rig.motion + (Math.min(1, speed / 4.5) - rig.motion) * blend
      : 0;
    const sprint =
      p.command.sprint && !p.command.aim
        ? Math.max(0, Math.min(1, (speed - 4) / 3))
        : 0;
    rig.sprint = rig.alive ? rig.sprint + (sprint - rig.sprint) * blend : 0;
    rig.phase =
      (rig.phase +
        moved * (2.5 - rig.sprint * 0.35) * (forward < -0.15 ? -1 : 1)) %
      (Math.PI * 2);
    const stride = Math.sin(rig.phase) * rig.motion;
    const ready = p.command.aim || p.command.fire || p.reloadAt > 0;
    rig.body.setLocalPosition(
      0,
      0.94 + (Math.cos(rig.phase * 2) - 1) * 0.022 * rig.motion,
      0,
    );
    rig.body.setLocalEulerAngles(
      -forward * rig.motion * (2 + 8 * rig.sprint),
      0,
      -sideways * rig.motion * 4,
    );
    rig.hips.setLocalEulerAngles(
      0,
      -Math.atan2(sideways, Math.abs(forward) + 0.001) * 40 * rig.motion,
      0,
    );
    rig.upper.setLocalEulerAngles(0, stride * (ready ? 1.5 : 4), -stride * 1.5);
    for (let i = 0; i < rig.legs.length; i++) {
      const phase = rig.phase + i * Math.PI;
      const swing = Math.sin(phase) * (30 + 18 * rig.sprint) * rig.motion;
      const bend =
        -Math.max(0, -Math.sin(phase)) * (38 + 24 * rig.sprint) * rig.motion;
      rig.legs[i].hip.setLocalEulerAngles(swing, 0, 0);
      rig.legs[i].knee.setLocalEulerAngles(bend, 0, 0);
      rig.legs[i].ankle.setLocalEulerAngles(-swing * 0.25 - bend * 0.35, 0, 0);
    }
    const armSwing = stride * (ready ? 3 : 16 + 12 * rig.sprint);
    rig.arms[1].shoulder.setLocalEulerAngles(
      65 - rig.sprint * 12 - armSwing * 0.35,
      0,
      -8,
    );
    rig.arms[1].elbow.setLocalEulerAngles(25 + rig.sprint * 10, 0, 0);
    rig.rifle.setLocalPosition(
      0.32,
      0.36 - rig.sprint * 0.08,
      -0.55 + (p.nextShot > tick ? 0.08 : 0),
    );
    rig.rifle.setLocalEulerAngles(
      -rig.sprint * 20 + stride * 2,
      0,
      p.reloadAt ? 12 : 0,
    );
    this.attachSupportArm(rig);
  }
  reset(g: Game) {
    for (const e of [
      ...this.people,
      ...this.rings,
      ...this.effects.map((v) => v.e),
    ])
      e.destroy();
    this.people = [];
    this.rings = [];
    this.effects = [];
    this.remember(g);
    this.soldiers = [];
    for (const p of g.players) this.createSoldier(p);
    for (const s of g.sectors) {
      const ring = new pc.Entity(s.id);
      this.app.root.addChild(ring);
      ring.setPosition(s.x, 0.04, s.z);
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        const e = this.cube(
          "boundary",
          Math.sin(a) * 8,
          0,
          Math.cos(a) * 8,
          0.16,
          0.05,
          0.65,
          "#d4c699",
          false,
          ring,
        );
        e.setLocalEulerAngles(0, (a * 180) / Math.PI, 0);
      }
      this.cube("beacon", 0, 1, 0, 0.25, 2, 0.25, "#d4c699", false, ring);
      this.rings.push(ring);
    }
  }
  remember(g: Game) {
    this.previous = g.players.map((p) => ({ x: p.x, z: p.z }));
  }
  draw(g: Game, alpha: number, dt: number) {
    for (const p of g.players) {
      const e = this.people[p.id],
        previous = this.previous[p.id] ?? p,
        teleported = Math.hypot(previous.x - p.x, previous.z - p.z) > 2;
      e.setPosition(
        teleported ? p.x : previous.x + (p.x - previous.x) * alpha,
        0,
        teleported ? p.z : previous.z + (p.z - previous.z) * alpha,
      );
      e.setEulerAngles(0, (-p.yaw * 180) / Math.PI, 0);
      const position = e.getPosition();
      this.animateSoldier(p, position.x, position.z, dt, g.tick);
      if (p.hp <= 0) {
        e.setEulerAngles(0, (-p.yaw * 180) / Math.PI, 85);
        e.setPosition(p.x, 0.25, p.z);
      }
    }
    for (let i = 0; i < g.sectors.length; i++) {
      const s = g.sectors[i],
        c = s.contested
          ? "#edc76d"
          : s.owner === "blue"
            ? "#46a9d8"
            : s.owner === "red"
              ? "#de6e5f"
              : "#d4c699";
      for (const child of this.rings[i].children)
        (child as pc.Entity).render!.material = this.material(c);
    }
    const p = g.players[0],
      d = p.command.aim ? 2.5 : 4,
      dir = {
        x: Math.sin(p.yaw) * Math.cos(p.pitch),
        y: Math.sin(p.pitch),
        z: -Math.cos(p.yaw) * Math.cos(p.pitch),
      };
    const visual = this.people[0].getPosition();
    const pivot = { x: visual.x, y: 1.65, z: visual.z },
      desired = {
        x: visual.x - dir.x * d + Math.cos(p.yaw) * 0.65,
        y: 2.5 - dir.y * d,
        z: visual.z - dir.z * d + Math.sin(p.yaw) * 0.65,
      },
      f = this.ray(pivot, desired) * 0.95;
    const pos = new pc.Vec3(
      pivot.x + (desired.x - pivot.x) * f,
      pivot.y + (desired.y - pivot.y) * f,
      pivot.z + (desired.z - pivot.z) * f,
    );
    this.camera.setPosition(pos);
    this.camera.lookAt(
      pos.x + dir.x * 20,
      pos.y + dir.y * 20,
      pos.z + dir.z * 20,
    );
    for (const fx of this.effects) {
      fx.life -= dt;
      fx.e.setLocalScale(fx.life * 0.7, fx.life * 0.7, fx.life * 0.7);
    }
    this.effects = this.effects.filter((fx) => {
      if (fx.life > 0) return true;
      fx.e.destroy();
      return false;
    });
  }
  effect(e: Event) {
    if (e.type !== "fire") return;
    for (const p of [e.from, e.to]) {
      const v = this.cube(
        "spark",
        p.x,
        p.y,
        p.z,
        0.15,
        0.15,
        0.15,
        e.hit ? "#ef8060" : "#ffe4a0",
      );
      this.effects.push({ e: v, life: 0.15 });
    }
  }
  project(p: V3) {
    return this.camera.camera!.worldToScreen(new pc.Vec3(p.x, p.y, p.z));
  }
}
