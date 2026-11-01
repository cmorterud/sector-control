import * as pc from "playcanvas";
import Ammo from "sync-ammo/dist/ammo.module.js";
import { boxes, blocked, type Vec } from "./map";
import {
  type CollisionWorld,
  type Game,
  type V3,
  type Event,
} from "./simulation";
const color = (hex: string) => new pc.Color().fromString(hex);
export class Renderer implements CollisionWorld {
  app: pc.Application;
  camera: pc.Entity;
  people: pc.Entity[] = [];
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
    for (const p of g.players) {
      const e = new pc.Entity(`soldier-${p.id}`);
      this.app.root.addChild(e);
      const c = p.team === "blue" ? "#46a9d8" : "#de6e5f";
      this.cube("torso", 0, 1.1, 0, 0.62, 0.65, 0.38, c, false, e);
      this.cube("vest", 0, 1.15, -0.23, 0.48, 0.45, 0.13, "#343f3c", false, e);
      this.cube("head", 0, 1.68, 0, 0.38, 0.38, 0.38, "#c1af90", false, e);
      this.cube("helmet", 0, 1.85, 0, 0.44, 0.18, 0.45, c, false, e);
      this.cube(
        "left leg",
        -0.18,
        0.4,
        0,
        0.23,
        0.8,
        0.25,
        "#414e48",
        false,
        e,
      );
      this.cube(
        "right leg",
        0.18,
        0.4,
        0,
        0.23,
        0.8,
        0.25,
        "#414e48",
        false,
        e,
      );
      this.cube("arm", -0.4, 1.15, -0.1, 0.2, 0.56, 0.23, c, false, e);
      this.cube("arm", 0.4, 1.25, -0.2, 0.2, 0.4, 0.23, c, false, e);
      this.cube(
        "rifle",
        0.32,
        1.4,
        -0.55,
        0.14,
        0.16,
        0.9,
        "#232d2e",
        false,
        e,
      );
      this.people.push(e);
    }
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
      if (p.hp <= 0) {
        e.setEulerAngles(0, (-p.yaw * 180) / Math.PI, 85);
        e.setPosition(p.x, 0.25, p.z);
      } else {
        const swing =
          Math.sin((g.tick + alpha) * (p.command.sprint ? 0.55 : 0.38)) *
          Math.min(0.35, Math.hypot(p.vx, p.vz) * 0.07);
        e.children[4].setLocalEulerAngles(swing * 60, 0, 0);
        e.children[5].setLocalEulerAngles(-swing * 60, 0, 0);
        e.children[7].setLocalEulerAngles(
          p.reloadAt ? -45 : p.command.aim ? -20 : 0,
          0,
          0,
        );
        e.children[8].setLocalPosition(
          0.32,
          1.4,
          -0.55 + (p.nextShot > g.tick ? 0.08 : 0),
        );
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
