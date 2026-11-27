// Each side's field battery behind its spawn, laying and firing for every
// shell the simulation is about to drop (src/artillery-battery.ts), and those
// shells' flight up out of the guns and down to where the simulation's own
// falling shell takes over. Presentation only.
//
// A gun is two meshes shared by all eight guns (carriage and barrel), so the
// batteries cost 16 draw calls; shells in flight come from a fixed pool.
import * as pc from "playcanvas";
import { BatteryPlan, batteryGuns, batteryRules, shotPosition, shotVelocity, type BatteryShot } from "./artillery-battery";
import { factionFor } from "./loadouts";
import type { MapDefinition } from "./map";
import type { Game, V3 } from "./simulation";
import type { WeaponFx } from "./weapon-fx";
import { fieldGunMuzzle } from "./muzzle-blast";

// Two missions of eight, two gas strikes of four and a stray, with room over.
const shellPool = 28;

type Geometry = { positions: number[]; normals: number[]; colors: number[]; indices: number[] };
const linear = (hex: string, shade = 1) => {
  const c = new pc.Color().fromString(hex);
  return [c.r * shade, c.g * shade, c.b * shade, 1];
};
// An axis-aligned box, optionally pitched about X by `tilt` radians around its centre.
function box(geo: Geometry, cx: number, cy: number, cz: number, w: number, h: number, d: number, hex: string, tilt = 0) {
  const c = Math.cos(tilt), s = Math.sin(tilt);
  const rot = (x: number, y: number, z: number) => [x, y * c - z * s, y * s + z * c];
  const faces: [number[], number[][]][] = [
    [[1, 0, 0], [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]]],
    [[-1, 0, 0], [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]]],
    [[0, 1, 0], [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]]],
    [[0, -1, 0], [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]]],
    [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
    [[0, 0, -1], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]],
  ];
  for (const [n, corners] of faces) {
    const base = geo.positions.length / 3, rn = rot(n[0], n[1], n[2]);
    // Lighter on top, darker underneath, so the shapes read at a distance.
    const col = linear(hex, n[1] > 0 ? 1.15 : n[1] < 0 ? 0.6 : 0.9);
    for (const k of corners) {
      const p = rot((k[0] * w) / 2, (k[1] * h) / 2, (k[2] * d) / 2);
      geo.positions.push(cx + p[0], cy + p[1], cz + p[2]);
      geo.normals.push(...rn);
      geo.colors.push(...col);
    }
    geo.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}
// A cylinder along `axis` ("x" across the gun or "z" along it).
function cylinder(geo: Geometry, cx: number, cy: number, cz: number, radius: number, length: number, axis: "x" | "z", hex: string, sides = 10) {
  const base = geo.positions.length / 3, col = linear(hex);
  const at = (a: number, along: number): [number, number, number] =>
    axis === "x" ? [cx + along, cy + Math.cos(a) * radius, cz + Math.sin(a) * radius] : [cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, cz + along];
  for (let i = 0; i <= sides; i++) {
    const a = (i / sides) * Math.PI * 2, n = axis === "x" ? [0, Math.cos(a), Math.sin(a)] : [Math.cos(a), Math.sin(a), 0];
    const shade = 0.75 + 0.35 * Math.max(0, n[1]);
    for (const along of [-length / 2, length / 2]) {
      geo.positions.push(...at(a, along));
      geo.normals.push(...n);
      geo.colors.push(col[0] * shade, col[1] * shade, col[2] * shade, 1);
    }
  }
  for (let i = 0; i < sides; i++) {
    const a = base + i * 2;
    geo.indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  // End caps.
  for (const end of [0, 1]) {
    const centre = geo.positions.length / 3, along = end ? length / 2 : -length / 2;
    const n = axis === "x" ? [end ? 1 : -1, 0, 0] : [0, 0, end ? 1 : -1];
    geo.positions.push(...(axis === "x" ? [cx + along, cy, cz] : [cx, cy, cz + along]));
    geo.normals.push(...n);
    geo.colors.push(...linear(hex, 0.8));
    for (let i = 0; i <= sides; i++) {
      geo.positions.push(...at((i / sides) * Math.PI * 2, along));
      geo.normals.push(...n);
      geo.colors.push(...linear(hex, 0.8));
    }
    for (let i = 0; i < sides; i++) geo.indices.push(centre, centre + 1 + i, centre + 2 + i, centre, centre + 2 + i, centre + 1 + i);
  }
}

const paint: Record<string, { body: string; dark: string; wood: string }> = {
  british: { body: "#565a3e", dark: "#2b2b24", wood: "#5e4a33" },
  german: { body: "#5a6152", dark: "#2a2c27", wood: "#584631" },
  french: { body: "#66706c", dark: "#2b2e2d", wood: "#5c4832" },
};

// Local space: -Z toward the enemy, the trunnion at (0, trunnion, 0).
function carriageGeometry(hex: { body: string; dark: string; wood: string }): Geometry {
  const geo: Geometry = { positions: [], normals: [], colors: [], indices: [] };
  const wheel = 0.66, track = 0.78;
  for (const side of [-1, 1]) {
    // Wooden spoked wheel: an iron tyre ring, spokes and a hub.
    cylinder(geo, side * track, wheel, 0.2, wheel, 0.09, "x", hex.dark, 14);
    cylinder(geo, side * (track + 0.002), wheel, 0.2, wheel - 0.07, 0.1, "x", hex.wood, 14);
    cylinder(geo, side * track, wheel, 0.2, 0.13, 0.22, "x", hex.dark, 8);
  }
  cylinder(geo, 0, wheel, 0.2, 0.06, track * 2, "x", hex.dark, 6);
  // The box trail running back to the spade on the ground.
  const trail = 3.1, drop = wheel - 0.12;
  box(geo, 0, wheel - drop / 2 + 0.05, 0.2 + trail / 2, 0.34, 0.22, trail + 0.1, hex.body, -Math.atan2(drop, trail));
  box(geo, 0, 0.12, 0.2 + trail, 0.55, 0.3, 0.12, hex.dark);
  // The cradle saddle and the shield, faced a little back.
  box(geo, 0, batteryRules.trunnion - 0.28, 0, 0.5, 0.3, 0.6, hex.body);
  box(geo, 0, 1.25, -0.2, 1.9, 1.25, 0.05, hex.body, 0.12);
  box(geo, 0, 0.62, -0.18, 1.2, 0.4, 0.05, hex.body, 0.12);
  // Ammunition limber boxes stacked beside the gun.
  box(geo, -1.6, 0.2, 1.4, 0.7, 0.4, 0.5, hex.wood);
  box(geo, -1.6, 0.55, 1.4, 0.6, 0.3, 0.45, hex.wood);
  box(geo, 1.55, 0.2, 1.9, 0.7, 0.4, 0.5, hex.wood);
  // A low sandbag wall round the front of the pit.
  for (let i = 0; i < 7; i++) {
    const a = -1.1 + (i / 6) * 2.2, r = 2.6;
    box(geo, Math.sin(a) * r, 0.22, -Math.cos(a) * r + 0.4, 0.8, 0.44, 0.45, "#6b6047");
  }
  return geo;
}
// The barrel about the trunnion: cradle, recuperator, breech and tube.
function barrelGeometry(hex: { body: string; dark: string }): Geometry {
  const geo: Geometry = { positions: [], normals: [], colors: [], indices: [] };
  const length = batteryRules.barrel;
  box(geo, 0, -0.12, -0.2, 0.26, 0.2, 1.9, hex.body);
  cylinder(geo, 0, 0, -length / 2 + 0.35, 0.085, length + 0.7, "z", hex.dark, 10);
  cylinder(geo, 0, 0, -length + 0.08, 0.11, 0.16, "z", hex.dark, 10);
  box(geo, 0, 0, 0.5, 0.3, 0.3, 0.42, hex.dark);
  return geo;
}

function upload(device: pc.GraphicsDevice, geo: Geometry) {
  const mesh = new pc.Mesh(device);
  mesh.setPositions(geo.positions);
  mesh.setNormals(geo.normals);
  mesh.setColors(geo.colors);
  mesh.setIndices(geo.indices);
  mesh.update(pc.PRIMITIVE_TRIANGLES);
  return mesh;
}

interface GunView {
  root: pc.Entity;
  pivot: pc.Entity;
  barrel: pc.Entity;
  yaw: number;
  pitch: number;
  firedAt: number;
}

export class BatteryView {
  private plan = new BatteryPlan();
  private guns: GunView[] = [];
  private shells: pc.Entity[] = [];
  private fired = new Set<string>();
  private map?: MapDefinition;
  private root?: pc.Entity;
  private meshes: pc.Mesh[] = [];
  private material?: pc.StandardMaterial;
  private position: V3 = { x: 0, y: 0, z: 0 };
  private velocity: V3 = { x: 0, y: 0, z: 0 };
  stats = { shots: 0, inFlight: 0 };
  constructor(
    private app: pc.AppBase,
    private shellModel: (parent: pc.Entity) => pc.Entity,
    private fx: () => WeaponFx,
  ) {}

  private build(map: MapDefinition) {
    this.destroy();
    this.map = map;
    this.root = new pc.Entity("field batteries");
    this.app.root.addChild(this.root);
    const material = (this.material = new pc.StandardMaterial());
    material.diffuse = new pc.Color(1, 1, 1);
    material.diffuseVertexColor = true;
    material.gloss = 0.25;
    material.cull = pc.CULLFACE_NONE;
    material.update();
    const models = new Map<string, [pc.Mesh, pc.Mesh]>();
    for (const gun of batteryGuns(map)) {
      const faction = factionFor(map, gun.team);
      let pair = models.get(faction);
      if (!pair) {
        const hex = paint[faction] ?? paint.british;
        pair = [upload(this.app.graphicsDevice, carriageGeometry(hex)), upload(this.app.graphicsDevice, barrelGeometry(hex))];
        this.meshes.push(...pair);
        models.set(faction, pair);
      }
      const root = new pc.Entity(`${gun.team} field gun ${gun.index + 1}`);
      root.setPosition(gun.x, gun.y, gun.z);
      const instance = (mesh: pc.Mesh, entity: pc.Entity) => {
        if (gun.hidden) return;
        const mi = new pc.MeshInstance(mesh, material, entity);
        entity.addComponent("render", { meshInstances: [mi], castShadows: true, receiveShadows: true });
      };
      instance(pair[0], root);
      const pivot = new pc.Entity("gun cradle");
      pivot.setLocalPosition(0, batteryRules.trunnion, 0);
      root.addChild(pivot);
      const barrel = new pc.Entity("gun barrel");
      pivot.addChild(barrel);
      instance(pair[1], barrel);
      this.root.addChild(root);
      this.guns.push({ root, pivot, barrel, yaw: gun.yaw, pitch: 0.3, firedAt: -Infinity });
    }
    for (let i = 0; i < shellPool; i++) {
      const e = new pc.Entity("battery shell");
      this.shellModel(e);
      e.enabled = false;
      this.root.addChild(e);
      this.shells.push(e);
    }
  }

  reset() {
    this.fired.clear();
    for (const gun of this.guns) gun.firedAt = -Infinity;
    for (const e of this.shells) e.enabled = false;
  }

  draw(g: Game, alpha: number, dt: number) {
    if (!g.artillery.enabled || g.map.sky) {
      if (this.root) this.root.enabled = false;
      return;
    }
    if (this.map !== g.map) this.build(g.map);
    this.root!.enabled = true;
    const shots = this.plan.update(g), tick = g.tick - 1 + alpha;
    const layout = batteryGuns(g.map);
    // Each gun lays on its next shell, or holds on the last one it fired.
    const next: (BatteryShot | undefined)[] = [];
    for (const shot of shots) {
      const current = next[shot.gun];
      if (shot.fireTick >= tick - batteryRules.recoilTicks && (!current || shot.fireTick < current.fireTick)) next[shot.gun] = shot;
      if (tick >= shot.fireTick && !this.fired.has(shot.key)) {
        this.fired.add(shot.key);
        // A shot whose fire time passed long ago (a skipped stretch) doesn't flash now.
        if (tick - shot.fireTick < 3) this.fire(shot);
      }
    }
    if (this.fired.size > 64) for (const key of this.fired) if (!shots.some((s) => s.key === key)) this.fired.delete(key);
    const ease = 1 - Math.exp(-dt * 6);
    this.guns.forEach((gun, i) => {
      const shot = next[i];
      let yaw = layout[i].yaw, pitch = 0.3;
      if (shot) {
        yaw = Math.atan2(-shot.v0.x, -shot.v0.z);
        pitch = Math.atan2(shot.v0.y, Math.hypot(shot.v0.x, shot.v0.z));
      }
      // Lay fast; be on the line by the moment the gun fires.
      const k = shot && shot.fireTick - tick < 4 ? 1 : ease;
      let turn = yaw - gun.yaw;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      gun.yaw += turn * k;
      gun.pitch += (pitch - gun.pitch) * k;
      gun.root.setEulerAngles(0, (gun.yaw * 180) / Math.PI, 0);
      gun.pivot.setLocalEulerAngles((gun.pitch * 180) / Math.PI, 0, 0);
      // The barrel runs back on firing and the recuperator returns it.
      const since = tick - gun.firedAt;
      const recoil = since < 0 ? 0 : since < 2 ? (since / 2) * 0.7 : since < batteryRules.recoilTicks ? 0.7 * (1 - (since - 2) / (batteryRules.recoilTicks - 2)) ** 2 : 0;
      gun.barrel.setLocalPosition(0, 0, recoil);
    });
    let used = 0;
    for (const shot of shots) {
      if (tick < shot.fireTick || tick >= shot.handoffTick || used >= this.shells.length) continue;
      const e = this.shells[used++], seconds = (tick - shot.fireTick) / 30;
      const p = shotPosition(shot, seconds, this.position), v = shotVelocity(shot, seconds, this.velocity);
      e.enabled = true;
      e.setPosition(p.x, p.y, p.z);
      e.lookAt(p.x + v.x, p.y + v.y, p.z + v.z);
      // The hot streak stretches with speed, about a frame and a half long.
      const speed = Math.hypot(v.x, v.y, v.z);
      e.setLocalScale(1.4, 1.4, Math.max(1, speed / 55));
    }
    this.stats.inFlight = used;
    for (let i = used; i < this.shells.length; i++) this.shells[i].enabled = false;
  }

  private fire(shot: BatteryShot) {
    const gun = this.guns[shot.gun];
    gun.firedAt = shot.fireTick;
    this.stats.shots++;
    const speed = Math.hypot(shot.v0.x, shot.v0.y, shot.v0.z), flat = Math.hypot(shot.v0.x, shot.v0.z) || 1;
    const dir = { x: shot.v0.x / speed, y: shot.v0.y / speed, z: shot.v0.z / speed };
    this.fx().shot({
      at: shot.muzzle, dir, right: { x: -shot.v0.z / flat, y: 0, z: shot.v0.x / flat },
      weaponId: fieldGunMuzzle, mounted: true, heat: 0, seed: shot.fireTick * 7.31 + shot.gun, near: false,
    });
  }

  destroy() {
    this.root?.destroy();
    this.root = undefined;
    for (const mesh of this.meshes) mesh.destroy();
    this.meshes = [];
    this.material?.destroy();
    this.material = undefined;
    this.guns = [];
    this.shells = [];
    this.fired.clear();
    this.map = undefined;
  }
}
