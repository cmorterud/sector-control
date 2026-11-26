// Muzzle blast, barrel smoke, heat haze, steam, dust and spent brass for every
// shot, drawn from fixed pools into two dynamic meshes: one additive (fire)
// and one blended (smoke, steam, dust and brass). Nothing is created or
// destroyed per shot, so sustained fire adds no garbage and no entities.
import * as pc from "playcanvas";
import { FxQuads } from "./fx-quads";
import { drawFlashAtlas, drawSmokeAtlas, flashColor, flashFrames, flashLayers, hash, muzzleProfile, smokeFrames, type FlashLayer, type MuzzleProfile } from "./muzzle-blast";
import type { V3 } from "./simulation";
import type { WeaponKind } from "./weapons";

export const weaponFxLimits = { flashes: 40, flashQuads: 160, particles: 360, brass: 72, lights: 2 };

export interface ShotFx {
  at: V3;
  // Unit vector along the barrel, and to the gun's right (the ejection side).
  dir: V3;
  right: V3;
  weapon?: WeaponKind;
  weaponId?: string;
  mounted: boolean;
  heat: number;
  seed: number;
  // Fired by the player in first person: the flash sits right under the
  // sight, so it is drawn smaller and smoke fades near the eye.
  near: boolean;
}
export interface HeatFx {
  key: string;
  // The muzzle, the barrel direction (forward) and how far back it runs.
  at: V3;
  dir: V3;
  length: number;
  heat: number;
  overheated: boolean;
  // Water jackets steam; air-cooled barrels only shimmer and smoke.
  water: boolean;
  near: boolean;
}

type Flash = { at: V3; dir: V3; layers: FlashLayer[]; age: number; life: number; scale: number; fresh: boolean };
type Particle = {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  age: number; life: number; size: number; grow: number; frame: number; roll: number; spin: number;
  r: number; g: number; b: number; alpha: number; drag: number; lift: number; near: boolean;
};
type Casing = {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  age: number; length: number; angle: number; spin: number; a: V3; b: V3; landed: boolean;
};

const unit = (v: V3) => { const n = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / n, y: v.y / n, z: v.z / n }; };
const cross = (a: V3, b: V3) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

export class WeaponFx {
  private flashQuads = new FxQuads(weaponFxLimits.flashQuads);
  private smokeQuads = new FxQuads(weaponFxLimits.particles + weaponFxLimits.brass);
  private flashMesh: pc.Mesh;
  private smokeMesh: pc.Mesh;
  private flashMaterial: pc.StandardMaterial;
  private smokeMaterial: pc.StandardMaterial;
  private flashes: Flash[] = [];
  private particles: Particle[] = [];
  private nextParticle = 0;
  private casings: Casing[] = [];
  private nextCasing = 0;
  private lights: { entity: pc.Entity; age: number; life: number; power: number }[] = [];
  private heatCarry = new Map<string, number>();
  private wasDrawing = true;
  private random = Math.random;
  private textures: pc.Texture[] = [];
  readonly root: pc.Entity;
  stats = { shots: 0, peakParticles: 0, peakFlashQuads: 0 };
  constructor(
    private app: pc.AppBase,
    private ground: (x: number, z: number) => number,
    private options: { night: boolean; quality: "low" | "medium" | "high" | string },
  ) {
    this.root = new pc.Entity("weapon effects");
    app.root.addChild(this.root);
    const device = app.graphicsDevice;
    const atlas = (draw: (ctx: CanvasRenderingContext2D, size: number) => void) => {
      const size = 512;
      const texture = new pc.Texture(device, { name: "weapon effects atlas", width: size, height: size, format: pc.PIXELFORMAT_RGBA8, mipmaps: true,
        minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR, addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE });
      const ctx = typeof document === "undefined" ? null : Object.assign(document.createElement("canvas"), { width: size, height: size }).getContext("2d");
      if (ctx) {
        draw(ctx, size);
        (texture.lock() as Uint8Array).set(ctx.getImageData(0, 0, size, size).data);
        texture.unlock();
      }
      this.textures.push(texture);
      return texture;
    };
    const flashTexture = atlas(drawFlashAtlas), smokeTexture = atlas(drawSmokeAtlas);
    const flash = (this.flashMaterial = new pc.StandardMaterial());
    flash.diffuse = new pc.Color(0, 0, 0);
    flash.emissive = new pc.Color(1, 1, 1);
    flash.emissiveMap = flashTexture;
    flash.emissiveVertexColor = true;
    flash.emissiveVertexColorChannel = "rgb";
    flash.emissiveIntensity = 3;
    flash.blendType = pc.BLEND_ADDITIVE;
    flash.depthWrite = false;
    flash.cull = pc.CULLFACE_NONE;
    flash.useLighting = false;
    flash.useFog = false;
    flash.update();
    const smoke = (this.smokeMaterial = new pc.StandardMaterial());
    smoke.diffuse = new pc.Color(0, 0, 0);
    smoke.emissive = new pc.Color(1, 1, 1);
    smoke.emissiveMap = smokeTexture;
    smoke.emissiveVertexColor = true;
    smoke.emissiveVertexColorChannel = "rgb";
    // Unlit like the rest of the battle's smoke, and dimmed after dark.
    smoke.emissiveIntensity = options.night ? 0.22 : 1;
    smoke.opacityMap = smokeTexture;
    smoke.opacityMapChannel = "a";
    smoke.opacityVertexColor = true;
    smoke.opacityVertexColorChannel = "a";
    smoke.blendType = pc.BLEND_NORMAL;
    smoke.depthWrite = false;
    smoke.cull = pc.CULLFACE_NONE;
    smoke.useLighting = false;
    smoke.update();
    this.flashMesh = this.mesh("muzzle flashes", this.flashQuads, flash);
    this.smokeMesh = this.mesh("gun smoke and brass", this.smokeQuads, smoke);
    if (options.night && options.quality !== "low")
      this.lights = Array.from({ length: weaponFxLimits.lights }, () => {
        const entity = new pc.Entity("muzzle light");
        entity.addComponent("light", { type: "omni", color: new pc.Color(1, 0.78, 0.5), intensity: 0, range: 10, castShadows: false });
        entity.enabled = false;
        this.root.addChild(entity);
        return { entity, age: 1, life: 0, power: 0 };
      });
  }
  private mesh(name: string, quads: FxQuads, material: pc.StandardMaterial) {
    const mesh = new pc.Mesh(this.app.graphicsDevice);
    mesh.setPositions(quads.positions);
    // Unlit, but the shader still reads a normal.
    const normals = new Float32Array(quads.capacity * 12);
    for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
    mesh.setNormals(normals);
    mesh.setUvs(0, quads.uvs);
    mesh.setColors32(quads.colors);
    mesh.setIndices(quads.indices);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    const entity = new pc.Entity(name), instance = new pc.MeshInstance(mesh, material, entity);
    instance.castShadow = false;
    // Spread over the whole battle and rewritten every frame; never cull.
    instance.cull = false;
    entity.addComponent("render", { meshInstances: [instance], castShadows: false, receiveShadows: false });
    this.root.addChild(entity);
    return mesh;
  }
  private get sparse() { return this.options.quality === "low"; }
  private particle(p: Omit<Particle, "age" | "near"> & { near?: boolean }) {
    if (this.particles.length < weaponFxLimits.particles) this.particles.push({ ...p, age: 0, near: !!p.near });
    else {
      Object.assign(this.particles[this.nextParticle], p, { age: 0, near: !!p.near });
      this.nextParticle = (this.nextParticle + 1) % weaponFxLimits.particles;
    }
  }
  shot(s: ShotFx) {
    const profile = muzzleProfile(s.weapon, s.weaponId, s.mounted);
    if (!profile.flash) return;
    this.stats.shots++;
    const dir = unit(s.dir), r = (salt: number) => hash(s.seed, salt);
    const scale = s.near ? (s.mounted ? 1 : 0.5) : 1;
    // From the gunner's seat the muzzle sits just under the receiver; lift the
    // flash so its tongues show round the front sight.
    const at = s.near && s.mounted ? { x: s.at.x, y: s.at.y + 0.07, z: s.at.z } : { ...s.at };
    if (this.flashes.length >= weaponFxLimits.flashes) this.flashes.shift();
    this.flashes.push({ at, dir, layers: flashLayers(profile, s.seed), age: 0, life: profile.flashLife * (0.8 + r(40) * 0.5), scale, fresh: true });
    this.smoke(s, profile, dir);
    if (profile.dust) this.dust(s, profile, dir);
    if (profile.brass) this.eject(s, profile, dir);
    this.light(s.at, profile);
  }
  private smoke(s: ShotFx, profile: MuzzleProfile, dir: V3) {
    // Hotter barrels and longer strings of fire leave more smoke hanging.
    const count = Math.round(profile.smoke * (this.sparse ? 0.5 : 1) * (1 + s.heat * 0.8) + this.random() * 0.6);
    for (let i = 0; i < count; i++) {
      const push = 1.4 + this.random() * 2.6, grey = 0.62 + this.random() * 0.14;
      this.particle({
        x: s.at.x + dir.x * 0.05, y: s.at.y + dir.y * 0.05, z: s.at.z + dir.z * 0.05,
        vx: dir.x * push + (this.random() - 0.5) * 0.4, vy: dir.y * push + 0.15 + this.random() * 0.3, vz: dir.z * push + (this.random() - 0.5) * 0.4,
        life: 1.3 + this.random() * 1.6 + s.heat, size: profile.smokeSize * 0.3, grow: profile.smokeSize * (0.7 + this.random() * 0.6),
        frame: smokeFrames.puff[Math.floor(this.random() * smokeFrames.puff.length)], roll: this.random() * Math.PI * 2, spin: (this.random() - 0.5) * 0.8,
        r: grey, g: grey * 0.98, b: grey * 0.95, alpha: 0.42 + s.heat * 0.15, drag: 3.2, lift: 0.35, near: s.near,
      });
    }
  }
  private dust(s: ShotFx, profile: MuzzleProfile, dir: V3) {
    // The blast scours the ground or parapet just in front of a low muzzle.
    const ahead = 0.5 + this.random() * 0.6, x = s.at.x + dir.x * ahead, z = s.at.z + dir.z * ahead, floor = this.ground(x, z);
    const clearance = s.at.y - floor;
    if (!(clearance > -0.2 && clearance < 1.6)) return;
    const strength = 1 - Math.max(0, clearance) / 1.6;
    const count = Math.round(profile.dust * strength * (this.sparse ? 0.5 : 1) + this.random() * 0.5);
    for (let i = 0; i < count; i++) {
      const spread = (this.random() - 0.5) * 2.2;
      this.particle({
        x: x + (this.random() - 0.5) * 0.4, y: floor + 0.08, z: z + (this.random() - 0.5) * 0.4,
        vx: dir.x * 1.5 + dir.z * spread, vy: 0.5 + this.random() * 1.1, vz: dir.z * 1.5 - dir.x * spread,
        life: 0.9 + this.random() * 0.9, size: 0.15, grow: 0.55 + this.random() * 0.5,
        frame: smokeFrames.puff[Math.floor(this.random() * smokeFrames.puff.length)], roll: this.random() * Math.PI * 2, spin: (this.random() - 0.5),
        r: 0.6, g: 0.52, b: 0.4, alpha: 0.5 * strength, drag: 2.5, lift: -0.4, near: s.near,
      });
    }
  }
  private eject(s: ShotFx, profile: MuzzleProfile, dir: V3) {
    // Thrown out of the action to the right and up, well back from the muzzle.
    const back = s.mounted ? 0.85 : s.weapon === "pistol" ? 0.3 : s.weapon === "machineGun" ? 0.62 : 0.68;
    const up = { x: 0, y: 1, z: 0 }, side = unit(s.right);
    const throwSide = 1.3 + this.random() * 1.2, throwUp = 1.1 + this.random() * 1.1;
    // Belt-fed mounted guns drop their empties straight down under the breech.
    const down = s.mounted;
    const a = unit(cross(dir, up)), b = unit(cross(dir, a));
    const casing: Casing = {
      x: s.at.x - dir.x * back, y: s.at.y - dir.y * back - (down ? 0.08 : 0), z: s.at.z - dir.z * back,
      vx: down ? side.x * 0.3 : side.x * throwSide - dir.x * 0.4, vy: down ? -0.6 : throwUp, vz: down ? side.z * 0.3 : side.z * throwSide - dir.z * 0.4,
      age: 0, length: profile.brass, angle: this.random() * Math.PI, spin: 18 + this.random() * 16, a, b: dir.y > 0.99 ? b : unit({ x: dir.x, y: 0, z: dir.z }), landed: false,
    };
    const cap = this.sparse ? weaponFxLimits.brass / 2 : weaponFxLimits.brass;
    if (this.casings.length < cap) this.casings.push(casing);
    else { this.casings[this.nextCasing % cap] = casing; this.nextCasing = (this.nextCasing + 1) % cap; }
  }
  private light(at: V3, profile: MuzzleProfile) {
    if (!this.lights.length) return;
    const slot = this.lights.reduce((a, b) => (a.age / Math.max(a.life, 1e-3) >= b.age / Math.max(b.life, 1e-3) ? a : b));
    slot.entity.setPosition(at.x, at.y + 0.1, at.z);
    slot.entity.light!.range = profile.lightRange;
    slot.age = 0;
    slot.life = profile.flashLife * 1.6;
    slot.power = profile.light;
  }
  // A barrel that has just seized: a gout of steam or smoke all along it.
  overheat(h: Omit<HeatFx, "key" | "heat" | "overheated">) {
    const dir = unit(h.dir);
    for (let i = 0; i < (this.sparse ? 10 : 20); i++) {
      const t = this.random() * h.length, white = h.water ? 0.92 : 0.55;
      this.particle({
        x: h.at.x - dir.x * t, y: h.at.y - dir.y * t + 0.05, z: h.at.z - dir.z * t,
        vx: (this.random() - 0.5) * 0.8, vy: 1 + this.random() * 1.6, vz: (this.random() - 0.5) * 0.8,
        life: 1.4 + this.random() * 1.4, size: 0.15, grow: 0.9 + this.random() * 0.8,
        frame: (h.water ? smokeFrames.steam : smokeFrames.puff)[Math.floor(this.random() * 3)], roll: this.random() * Math.PI * 2, spin: (this.random() - 0.5),
        r: white, g: white, b: white * 1.02, alpha: h.water ? 0.55 : 0.5, drag: 1.5, lift: 0.6, near: false,
      });
    }
  }
  // Continuous effects of a hot barrel, called each frame for every gun in view.
  heat(h: HeatFx, dt: number) {
    if (h.heat < 0.18) { this.heatCarry.delete(h.key); return; }
    const dir = unit(h.dir), sparse = this.sparse ? 0.5 : 1;
    // Shimmer: faint wisps rising along the barrel; steam from water jackets;
    // and a trickle of smoke from the muzzle of a very hot gun.
    const haze = (h.heat - 0.18) * 16 * sparse;
    const steam = h.water ? Math.max(0, h.heat - 0.5) * 30 * sparse + (h.overheated ? 14 : 0) : 0;
    const smoke = Math.max(0, h.heat - 0.55) * 10 * sparse + (h.overheated && !h.water ? 10 : 0);
    let carry = (this.heatCarry.get(h.key) ?? 0) + (haze + steam + smoke) * dt;
    const total = haze + steam + smoke;
    while (carry >= 1) {
      carry--;
      const pick = this.random() * total, t = 0.05 + this.random() * h.length * 0.85;
      const x = h.at.x - dir.x * t, y = h.at.y - dir.y * t, z = h.at.z - dir.z * t;
      if (pick < haze)
        this.particle({
          x, y: y + 0.04, z, vx: (this.random() - 0.5) * 0.08, vy: 0.35 + this.random() * 0.35, vz: (this.random() - 0.5) * 0.08,
          life: 0.7 + this.random() * 0.6, size: 0.06, grow: 0.14 + h.heat * 0.12,
          frame: smokeFrames.wisp[Math.floor(this.random() * 2)], roll: (this.random() - 0.5) * 0.4, spin: (this.random() - 0.5) * 0.6,
          r: 0.9, g: 0.88, b: 0.85, alpha: 0.1 + h.heat * 0.14, drag: 0.5, lift: 0.3, near: false,
        });
      else if (pick < haze + steam)
        this.particle({
          x, y: y + 0.08, z, vx: (this.random() - 0.5) * 0.3, vy: 0.9 + this.random() * 0.9, vz: (this.random() - 0.5) * 0.3,
          life: 1 + this.random() * 1.2, size: 0.1, grow: 0.6 + this.random() * 0.6,
          frame: smokeFrames.steam[Math.floor(this.random() * 3)], roll: this.random() * Math.PI * 2, spin: (this.random() - 0.5),
          r: 0.95, g: 0.96, b: 0.98, alpha: 0.4 + h.heat * 0.3, drag: 1.2, lift: 0.5, near: false,
        });
      else
        this.particle({
          x: h.at.x, y: h.at.y + 0.02, z: h.at.z, vx: dir.x * 0.3 + (this.random() - 0.5) * 0.15, vy: 0.4 + this.random() * 0.4, vz: dir.z * 0.3 + (this.random() - 0.5) * 0.15,
          life: 1.2 + this.random(), size: 0.06, grow: 0.3 + this.random() * 0.25,
          frame: smokeFrames.wisp[Math.floor(this.random() * 2)], roll: this.random() * 0.6 - 0.3, spin: (this.random() - 0.5) * 0.5,
          r: 0.55, g: 0.54, b: 0.52, alpha: 0.3, drag: 0.8, lift: 0.25, near: h.near,
        });
    }
    this.heatCarry.set(h.key, carry);
  }
  forget(key: string) { this.heatCarry.delete(key); }
  clear() {
    this.flashes = [];
    this.particles = [];
    this.casings = [];
    this.nextParticle = this.nextCasing = 0;
    this.heatCarry.clear();
    for (const light of this.lights) { light.entity.enabled = false; light.age = light.life = 1; }
  }
  draw(dt: number, eye: pc.Vec3, right: pc.Vec3, up: pc.Vec3) {
    const e = [eye.x, eye.y, eye.z], R = [right.x, right.y, right.z], U = [up.x, up.y, up.z];
    const flashes = this.flashQuads, smoke = this.smokeQuads;
    flashes.begin(e, R, U);
    smoke.begin(e, R, U);
    // Every flash shows for at least one frame, however slow the frame.
    this.flashes = this.flashes.filter(f => (f.age += f.fresh ? 0 : dt) < f.life);
    for (const f of this.flashes) {
      f.fresh = false;
      // Full strength for most of its life, then gone: a flash, not a fade.
      const t = f.age / f.life, fade = 1 - t * t * t, grow = 0.85 + t * 0.4;
      for (const layer of f.layers) {
        const [r, g, b] = flashColor(Math.min(1, layer.warmth + t * 0.5), layer.intensity * fade);
        const x = f.at.x + f.dir.x * layer.offset, y = f.at.y + f.dir.y * layer.offset, z = f.at.z + f.dir.z * layer.offset;
        if (layer.kind === "jet") flashes.axial(x, y, z, f.dir.x, f.dir.y, f.dir.z, layer.width * f.scale * grow, layer.height * f.scale, layer.frame, r, g, b);
        else flashes.sprite(x, y, z, layer.width * f.scale * grow, layer.height * f.scale * grow, layer.roll, layer.frame, r, g, b);
      }
    }
    for (const p of this.particles) {
      if (p.age >= p.life) continue;
      p.age += dt;
      const slow = Math.exp(-p.drag * dt);
      p.vx = p.vx * slow + 0.25 * dt;
      p.vz *= slow;
      p.vy = p.vy * slow + p.lift * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.roll += p.spin * dt;
      if (p.age >= p.life) continue;
      const t = p.age / p.life, size = p.size + p.grow * Math.sqrt(t);
      let alpha = p.alpha * Math.min(1, t * 8) * (1 - t) * (1 - t * 0.4);
      // Keep smoke from filling the screen of the player who made it.
      const distance = Math.hypot(p.x - e[0], p.y - e[1], p.z - e[2]);
      alpha *= Math.min(1, Math.max(0, (distance - (p.near ? 1.6 : 0.4)) / (p.near ? 3.5 : 1.2)));
      smoke.sprite(p.x, p.y, p.z, size, size, p.roll, p.frame, p.r, p.g, p.b, alpha);
    }
    this.casings = this.casings.filter(c => (c.age += dt) < 6);
    for (const c of this.casings) {
      if (!c.landed) {
        c.vy -= 9.8 * dt;
        c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
        c.angle += c.spin * dt;
        const floor = this.ground(c.x, c.z) + c.length * 0.18;
        if (c.y <= floor) {
          c.y = floor;
          // One bounce, then it lies on its side.
          if (Math.abs(c.vy) > 1.6) { c.vy = -c.vy * 0.3; c.vx *= 0.4; c.vz *= 0.4; c.spin *= 0.5; }
          else { c.landed = true; c.b = unit({ x: c.b.x, y: 0, z: c.b.z }); c.a = unit({ x: -c.b.z, y: 0, z: c.b.x }); }
        }
      }
      const cos = Math.cos(c.angle), sin = Math.sin(c.angle);
      const axis = c.landed ? c.a : { x: c.a.x * cos + c.b.x * sin, y: c.a.y * cos + c.b.y * sin, z: c.a.z * cos + c.b.z * sin };
      const glint = c.landed ? 0.8 : 0.7 + 0.5 * Math.abs(sin);
      const fade = Math.min(1, (6 - c.age) / 1.5);
      smoke.axial(c.x - axis.x * c.length / 2, c.y - axis.y * c.length / 2, c.z - axis.z * c.length / 2, axis.x, axis.y, axis.z, c.length, c.length * 0.32, smokeFrames.brass, 0.86 * glint, 0.66 * glint, 0.3 * glint, fade);
    }
    for (const light of this.lights) {
      light.age += dt;
      const on = light.age < light.life;
      light.entity.enabled = on;
      if (on) light.entity.light!.intensity = light.power * (1 - light.age / light.life) * (0.8 + this.random() * 0.4);
    }
    const flashCount = flashes.end(), smokeCount = smoke.end();
    this.stats.peakParticles = Math.max(this.stats.peakParticles, smokeCount);
    this.stats.peakFlashQuads = Math.max(this.stats.peakFlashQuads, flashCount);
    // Skip the upload while nothing is drawn, after one frame clears the last quads.
    const drawing = flashCount + smokeCount > 0;
    if (drawing || this.wasDrawing) {
      for (const [mesh, quads] of [[this.flashMesh, flashes], [this.smokeMesh, smoke]] as const) {
        mesh.setPositions(quads.positions);
        mesh.setUvs(0, quads.uvs);
        mesh.setColors32(quads.colors);
        mesh.update(pc.PRIMITIVE_TRIANGLES, false);
      }
    }
    this.wasDrawing = drawing;
  }
  destroy() {
    this.root.destroy();
    this.flashMaterial.destroy();
    this.smokeMaterial.destroy();
    for (const t of this.textures) t.destroy();
  }
}
