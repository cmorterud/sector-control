// Tank models and their per-frame pose (src/tanks.ts holds the simulation).
// Built from boxes and cylinders like the rest of the battlefield: a British
// Mark IV, a German A7V and a French Saint-Chamond. Local -Z is forward.
import * as pc from "playcanvas";
import { angleDelta } from "./awareness";
import type { Game } from "./simulation";
import { machineGunMounts, mountAt, type Tank, type TankModel } from "./tanks";

type Cube = (name: string, x: number, y: number, z: number, w: number, h: number, d: number, c: string, solid?: boolean, parent?: pc.Entity) => pc.Entity;
type Material = (c: string) => pc.StandardMaterial;
interface TankMesh {
  root: pc.Entity;
  hull: pc.Entity;
  guns: { pivot: pc.Entity; side: number }[];
  // One per entry in machineGunMounts, in the same order.
  mgs: pc.Entity[];
  treads: { e: pc.Entity; z0: number }[];
  wrecked: boolean;
  model: TankModel;
}

const palette: Record<TankModel, { body: string; frame: string; dark: string; trim: string }> = {
  "mark-iv": { body: "#615b43", frame: "#4f4a37", dark: "#272520", trim: "#6c5a3c" },
  a7v: { body: "#57604f", frame: "#454c40", dark: "#25271f", trim: "#6b6f60" },
  "saint-chamond": { body: "#6f6a4c", frame: "#57543d", dark: "#282620", trim: "#625e45" },
};
const treadSpacing = 0.5;
// Pooled effects, kept simple so they can move onto shared gun effects later.
const shellPool = 4, smokePool = 32, puffsPerShot = 8, smokeSeconds = 2.6;
interface Puff { e: pc.Entity; born: number; x: number; y: number; z: number; dx: number; dz: number; size: number }

export class TankView {
  private meshes = new Map<number, TankMesh>();
  private shells: pc.Entity[] = [];
  private puffs: Puff[] = [];
  private smokeLevels: pc.StandardMaterial[] = [];
  private nextPuff = 0;
  private fired = new Map<number, number>();
  constructor(private app: pc.Application, private cube: Cube, private material: Material) {}

  reset() {
    for (const mesh of this.meshes.values()) mesh.root.destroy();
    this.meshes.clear();
    for (const e of this.shells) e.enabled = false;
    for (const puff of this.puffs) puff.e.enabled = false;
    this.fired.clear();
  }

  // A glowing streak for each shell in flight, and grey smoke that rolls off
  // the barrel after each shot and drifts and fades over a couple of seconds.
  private effects(g: Game, alpha: number) {
    if (!this.shells.length) {
      const glow = new pc.StandardMaterial();
      glow.diffuse = new pc.Color(0.2, 0.15, 0.08);
      glow.emissive = new pc.Color(1, 0.8, 0.45);
      glow.emissiveIntensity = 2;
      glow.useLighting = false;
      glow.useFog = false;
      glow.update();
      for (let i = 0; i < shellPool; i++) {
        const e = new pc.Entity("tank shell");
        e.addComponent("render", { type: "cylinder", material: glow, castShadows: false, receiveShadows: false });
        e.enabled = false;
        this.app.root.addChild(e);
        this.shells.push(e);
      }
      for (let level = 0; level < 4; level++) {
        const m = new pc.StandardMaterial();
        m.diffuse = new pc.Color(0.5, 0.5, 0.48);
        m.emissive = new pc.Color(0.18, 0.18, 0.17);
        m.opacity = 0.7 * (1 - level / 4);
        m.blendType = pc.BLEND_NORMAL;
        m.depthWrite = false;
        m.update();
        this.smokeLevels.push(m);
      }
      for (let i = 0; i < smokePool; i++) {
        const e = new pc.Entity("barrel smoke");
        e.addComponent("render", { type: "sphere", material: this.smokeLevels[0], castShadows: false, receiveShadows: false });
        e.enabled = false;
        this.app.root.addChild(e);
        this.puffs.push({ e, born: -1e9, x: 0, y: 0, z: 0, dx: 0, dz: 0, size: 1 });
      }
    }
    const shells = g.tanks?.shells ?? [];
    this.shells.forEach((e, i) => {
      const s = shells[i];
      e.enabled = !!s;
      if (!s) return;
      const speed = Math.hypot(s.vx, s.vy, s.vz), length = 6;
      // Interpolate, and trail the streak behind the shell's nose.
      const x = s.previous.x + (s.x - s.previous.x) * alpha, y = s.previous.y + (s.y - s.previous.y) * alpha, z = s.previous.z + (s.z - s.previous.z) * alpha;
      const back = length / 2 / speed;
      e.setPosition(x - s.vx * back, y - s.vy * back, z - s.vz * back);
      e.lookAt(x, y, z);
      e.rotateLocal(90, 0, 0);
      e.setLocalScale(0.2, length, 0.2);
    });
    const now = g.tick + alpha;
    for (const t of g.tanks?.list ?? []) {
      if (t.cannon.firedAt < 0 || this.fired.get(t.id) === t.cannon.firedAt) continue;
      const fresh = this.fired.has(t.id) || g.tick - t.cannon.firedAt < 3;
      this.fired.set(t.id, t.cannon.firedAt);
      if (!fresh) continue;
      for (let k = 0; k < puffsPerShot; k++) {
        const puff = this.puffs[this.nextPuff++ % smokePool];
        const spread = (k / puffsPerShot) * 1.6;
        const dx = t.cannon.muzzle.x - t.x, dz = t.cannon.muzzle.z - t.z, n = Math.hypot(dx, dz) || 1;
        Object.assign(puff, {
          born: t.cannon.firedAt + k * 0.5,
          x: t.cannon.muzzle.x + (dx / n) * spread, y: t.cannon.muzzle.y, z: t.cannon.muzzle.z + (dz / n) * spread,
          dx: (dx / n) * 0.6 + Math.sin(k * 2.3) * 0.3, dz: (dz / n) * 0.6 + Math.cos(k * 1.7) * 0.3, size: 0.7 + (k % 3) * 0.25,
        });
      }
    }
    for (const puff of this.puffs) {
      const age = (now - puff.born) / 30;
      puff.e.enabled = age >= 0 && age < smokeSeconds;
      if (!puff.e.enabled) continue;
      const f = age / smokeSeconds;
      puff.e.render!.material = this.smokeLevels[Math.min(3, Math.floor(f * 4))];
      const size = puff.size * (1 + age * 0.9);
      puff.e.setPosition(puff.x + puff.dx * age, puff.y + age * 0.7, puff.z + puff.dz * age);
      puff.e.setLocalScale(size, size, size);
    }
  }

  private joint(name: string, parent: pc.Entity, x = 0, y = 0, z = 0) {
    const e = new pc.Entity(name);
    parent.addChild(e);
    e.setLocalPosition(x, y, z);
    return e;
  }
  // A plate between two points in the side (z, y) plane.
  private beam(name: string, parent: pc.Entity, x: number, a: [number, number], b: [number, number], width: number, thickness: number, c: string) {
    const holder = this.joint(name, parent, x, (a[1] + b[1]) / 2, (a[0] + b[0]) / 2);
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    holder.setLocalEulerAngles((Math.atan2(b[1] - a[1], -(b[0] - a[0])) * 180) / Math.PI, 0, 0);
    this.cube(name, 0, 0, 0, width, thickness, length, c, false, holder);
    return holder;
  }
  private barrel(name: string, parent: pc.Entity, length: number, radius: number, c: string) {
    const tube = this.joint(name, parent, 0, 0, -length / 2);
    tube.addComponent("render", { type: "cylinder", material: this.material(c), castShadows: true, receiveShadows: true });
    tube.setLocalEulerAngles(90, 0, 0);
    tube.setLocalScale(radius * 2, length, radius * 2);
    return tube;
  }
  private treads(hull: pc.Entity, x: number, from: number, to: number, y: number, c: string, list: TankMesh["treads"]) {
    for (let z = from; z <= to; z += treadSpacing) list.push({ e: this.cube("track shoe", x, y, z, 0.56, 0.06, 0.14, c, false, hull), z0: z });
  }

  private build(t: Tank): TankMesh {
    const root = this.joint(`${t.name} tank`, this.app.root);
    const hull = this.joint("hull", root);
    const colors = palette[t.model];
    const mesh: TankMesh = { root, hull, guns: [], mgs: [], treads: [], wrecked: false, model: t.model };
    if (t.model === "mark-iv") this.markIV(mesh, colors);
    else if (t.model === "a7v") this.a7v(mesh, colors);
    else this.saintChamond(mesh, colors);
    // The machine guns, where the simulation fires them from.
    for (const m of machineGunMounts[t.model]) {
      this.cube("gun mount", m.s, m.y, -m.f, 0.26, 0.26, 0.26, colors.frame, false, hull);
      const pivot = this.joint(m.name, hull, m.s, m.y, -m.f);
      this.barrel("machine gun", pivot, 0.6, 0.05, colors.dark);
      mesh.mgs.push(pivot);
    }
    return mesh;
  }

  // The rhomboid British tank: tracks run right round each side frame, the
  // 6-pounders sit in side sponsons and an unditching beam rides on top.
  private markIV(m: TankMesh, c: (typeof palette)["mark-iv"]) {
    const h = m.hull;
    for (const side of [-1, 1]) {
      const x = side * 1.42;
      // The rhomboid outline of the track frame.
      const outline: [number, number][] = [[-2.5, 0.25], [-4, 1.35], [-3, 2.35], [3.3, 2.35], [3.95, 1.5], [2.9, 0.25]];
      for (let i = 0; i < outline.length; i++) this.beam("track frame", h, x, outline[i], outline[(i + 1) % outline.length], 0.56, 0.5, c.dark);
      this.cube("side plate", x, 1.3, 0.25, 0.5, 1.7, 5.8, c.frame, false, h);
      this.beam("side plate nose", h, x, [-2.6, 0.9], [-3.6, 1.45], 0.5, 1.0, c.frame);
      this.beam("side plate nose", h, x, [-3.6, 1.45], [-2.8, 2.05], 0.5, 0.8, c.frame);
      // A sponson with its 6-pounder, laid by the commander within its arc.
      this.cube("sponson", side * 1.95, 1.2, -0.6, 0.7, 0.95, 1.7, c.body, false, h);
      this.cube("sponson face", side * 2.12, 1.25, -1.5, 0.36, 0.7, 0.2, c.frame, false, h);
      const pivot = this.joint("sponson gun", h, side * 2.15, 1.25, -1.25);
      this.barrel("6-pounder", pivot, 1.25, 0.065, c.dark);
      m.guns.push({ pivot, side });
      // Recognition stripes, red-white-red, on the front horns.
      for (const [i, stripe] of ["#8f2f26", "#d7d2c4", "#8f2f26"].entries())
        this.cube("recognition stripe", x + side * 0.29, 1.62 - i * 0.18, -3.35, 0.02, 0.16, 0.9, stripe, false, h);
      this.treads(h, x, -2.3, 2.7, 0.03, c.dark, m.treads);
    }
    this.cube("hull", 0, 1.45, 0.3, 2.4, 1.75, 6.2, c.body, false, h);
    this.cube("cab", 0, 2.6, -2.45, 1.4, 0.5, 1.1, c.body, false, h);
    this.cube("vision slits", 0, 2.65, -3.01, 1.1, 0.06, 0.02, "#111", false, h);
    this.cube("cab front", 0, 2.3, -3.02, 1.4, 0.4, 0.06, c.frame, false, h);
    for (const x of [-0.95, 0.95]) this.cube("beam rail", x, 2.62, 0.6, 0.1, 0.1, 6.0, c.dark, false, h);
    this.cube("unditching beam", 0, 2.83, 2.6, 3.0, 0.3, 0.3, "#5a4630", false, h);
    this.cube("exhaust", 0.55, 2.64, 0.9, 0.14, 0.14, 2.2, "#3a2e25", false, h);
  }

  // The German box on a tractor chassis: a 57 mm gun in the nose and
  // machine guns all round, a cupola for the commander and driver.
  private a7v(m: TankMesh, c: (typeof palette)["a7v"]) {
    const h = m.hull;
    for (const side of [-1, 1]) {
      this.cube("track unit", side * 1.18, 0.38, 0, 0.62, 0.7, 6.0, c.dark, false, h);
      this.treads(h, side * 1.18, -2.8, 2.8, 0.03, c.dark, m.treads);
      // Balkenkreuz-style recognition cross on each side.
      this.cube("cross ground", side * 1.56, 1.9, 0.8, 0.02, 0.62, 0.62, "#d8d4c6", false, h);
      this.cube("cross bar", side * 1.57, 1.9, 0.8, 0.02, 0.44, 0.12, "#1c1c1a", false, h);
      this.cube("cross bar", side * 1.57, 1.9, 0.8, 0.02, 0.12, 0.44, "#1c1c1a", false, h);
    }
    this.cube("skirt", 0, 0.95, 0, 3.05, 0.75, 7.0, c.frame, false, h);
    this.cube("upper hull", 0, 1.85, 0.15, 3.1, 1.05, 6.4, c.body, false, h);
    this.beam("glacis", h, 0, [-3.5, 1.35], [-3.0, 2.35], 3.1, 0.25, c.body);
    this.beam("rear plate", h, 0, [3.5, 1.35], [3.25, 2.35], 3.1, 0.25, c.body);
    this.cube("cupola", 0, 2.65, -0.7, 1.7, 0.55, 1.7, c.body, false, h);
    this.cube("cupola slits", 0, 2.7, -1.56, 1.4, 0.06, 0.02, "#111", false, h);
    this.cube("roof edge", 0, 2.39, 0.15, 3.12, 0.06, 6.42, c.trim, false, h);
    const pivot = this.joint("57 mm gun", h, 0, 1.45, -3.55);
    this.barrel("57 mm gun", pivot, 1.0, 0.07, c.dark);
    m.guns.push({ pivot, side: 0 });
  }

  // The French Saint-Chamond: a long armoured body overhanging its short
  // tracks, the 75 mm field gun in the nose and a cupola at each end.
  private saintChamond(m: TankMesh, c: (typeof palette)["saint-chamond"]) {
    const h = m.hull;
    for (const side of [-1, 1]) {
      this.cube("track unit", side * 1.1, 0.38, 0.3, 0.55, 0.7, 5.2, c.dark, false, h);
      this.treads(h, side * 1.1, -2.2, 2.8, 0.03, c.dark, m.treads);
      // Painted camouflage patches.
      for (const [z, y, w, tint] of [[-2.2, 1.5, 1.6, "#7c5d3a"], [0.2, 1.9, 1.3, "#4e5a3a"], [2.3, 1.3, 1.5, "#a08850"]] as const)
        this.cube("camouflage", side * 1.36, y, z, 0.02, 0.6, w, tint, false, h);
    }
    this.cube("body", 0, 1.55, 0.2, 2.7, 1.45, 7.4, c.body, false, h);
    this.beam("nose", h, 0, [-3.5, 0.9], [-4.0, 1.9], 2.6, 0.3, c.body);
    this.cube("nose plate", 0, 2.1, -3.65, 2.6, 0.45, 0.6, c.frame, false, h);
    this.cube("front cupola", -0.55, 2.5, -2.7, 0.85, 0.45, 0.85, c.body, false, h);
    this.cube("rear cupola", 0.55, 2.5, 3.0, 0.85, 0.45, 0.85, c.body, false, h);
    this.cube("roof", 0, 2.3, 0.2, 2.5, 0.08, 7.0, c.trim, false, h);
    const pivot = this.joint("75 mm gun", h, 0, 1.25, -3.95);
    this.barrel("75 mm gun", pivot, 1.5, 0.085, c.dark);
    m.guns.push({ pivot, side: 0 });
  }

  draw(g: Game, alpha: number) {
    this.effects(g, alpha);
    const list = g.tanks?.list ?? [];
    for (const [id, mesh] of this.meshes)
      if (!list.some(t => t.id === id)) {
        mesh.root.destroy();
        this.meshes.delete(id);
      }
    for (const t of list) {
      let mesh = this.meshes.get(t.id);
      if (!mesh) this.meshes.set(t.id, (mesh = this.build(t)));
      const p = t.previous, lerp = (a: number, b: number) => a + (b - a) * alpha;
      const yaw = p.yaw + angleDelta(p.yaw, t.yaw) * alpha;
      // A ditched tank noses down into the gap.
      const dip = t.state === "ditched" ? 0.22 : 0;
      mesh.root.setPosition(lerp(p.x, t.x), lerp(p.y, t.y) - dip * 2.5, lerp(p.z, t.z));
      mesh.root.setEulerAngles(0, (-yaw * 180) / Math.PI, 0);
      mesh.hull.setLocalEulerAngles(((lerp(p.pitch, t.pitch) - dip) * 180) / Math.PI, 0, (-lerp(p.roll, t.roll) * 180) / Math.PI);
      // Guns follow the commander's aim within their arcs.
      for (const gun of mesh.guns) {
        const rel = angleDelta(t.yaw, t.aimYaw);
        let local = gun.side === 0
          ? Math.max(-0.8, Math.min(0.8, rel))
          : Math.sign(rel) === gun.side ? Math.max(-1.2, Math.min(1.2, rel - gun.side * Math.PI / 2)) : 0;
        if (t.state === "wreck") local = 0;
        gun.pivot.setLocalEulerAngles((t.aimPitch * 180) / Math.PI, (-(local + (gun.side ? gun.side * Math.PI / 2 : 0)) * 180) / Math.PI, 0);
      }
      // The machine gun that bears follows the crosshair; the rest sit square.
      machineGunMounts[t.model].forEach((m, i) => {
        let yaw = m.bearing, pitch = 0;
        if (i === t.mg.mount && t.driver !== undefined && t.state !== "wreck") {
          const at = mountAt(t, m), dx = t.aim.x - at.x, dz = t.aim.z - at.z;
          const rel = angleDelta(t.yaw + m.bearing, Math.atan2(dx, -dz));
          yaw = m.bearing + Math.max(-m.arc, Math.min(m.arc, rel));
          pitch = Math.max(-0.4, Math.min(0.4, Math.atan2(t.aim.y - at.y, Math.hypot(dx, dz))));
        }
        mesh.mgs[i].setLocalEulerAngles((pitch * 180) / Math.PI, (-yaw * 180) / Math.PI, 0);
      });
      // Shoes slide back along the track as it moves.
      const shift = ((t.travel % treadSpacing) + treadSpacing) % treadSpacing;
      for (const tread of mesh.treads) {
        const local = tread.e.getLocalPosition();
        tread.e.setLocalPosition(local.x, local.y, tread.z0 + shift);
      }
      if (t.state === "wreck" && !mesh.wrecked) {
        mesh.wrecked = true;
        const char = this.material("#2b2723");
        for (const render of mesh.root.findComponents("render") as pc.RenderComponent[]) render.material = char;
      }
    }
  }
}

