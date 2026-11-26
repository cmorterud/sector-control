import * as pc from "playcanvas";
import { FxQuads } from "./fx-quads";
import { groundHeight, type MapDefinition } from "./map";
import {
  floodStrips, pondLevel, puddleMaskPixels, puddleThreshold, rainAtlasPixels, rainDirection, rainDropCount, rainDrops,
  rainPonds, rainRippleNormals, trenchWaterLevel, waterDepth, type RainDrop,
} from "./weather";

type Quality = keyof typeof rainDropCount;
type Splash = { x: number; y: number; z: number; age: number; life: number; size: number; water: boolean };

const splashCount = { low: 60, medium: 140, high: 200 } as const;

// Rain over the viewer and the water it raises (src/weather.ts): drops and
// splashes as quads in one dynamic mesh (one draw), the shell holes' water
// as one mesh whose levels rise, and the trench floors' water as one sheet
// whose pools spread. Nothing here is per drop or per pond on the GPU side.
export class RainView {
  readonly root: pc.Entity;
  private quads: FxQuads;
  private mesh: pc.Mesh;
  private drops: RainDrop[] = [];
  private splashes: Splash[] = [];
  private ponds: { mesh: pc.Mesh; positions: Float32Array; flood: number } | undefined;
  private trench: { entity: pc.Entity; material: pc.StandardMaterial; flood: number } | undefined;
  private water: pc.StandardMaterial;
  private textures: pc.Texture[] = [];
  private rippleTime = 0;
  stats = { drops: 0, splashes: 0 };
  constructor(private app: pc.AppBase, parent: pc.Entity, private map: MapDefinition, private quality: Quality) {
    const device = app.graphicsDevice;
    this.root = new pc.Entity("rain");
    parent.addChild(this.root);
    const texture = (name: string, width: number, height: number, pixels: Uint8Array, repeat: boolean) => {
      const t = new pc.Texture(device, {
        name, width, height, format: pc.PIXELFORMAT_RGBA8, mipmaps: true,
        minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR,
        addressU: repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE, addressV: repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE,
      });
      (t.lock() as Uint8Array).set(pixels);
      t.unlock();
      this.textures.push(t);
      return t;
    };
    // Drops and splashes: unlit, faintly lighter than the sky behind them.
    const atlas = texture("rain atlas", 64, 32, rainAtlasPixels(32), false);
    const streaks = new pc.StandardMaterial();
    streaks.diffuse = new pc.Color(0, 0, 0);
    streaks.emissive = new pc.Color(1, 1, 1);
    streaks.emissiveVertexColor = true;
    streaks.emissiveVertexColorChannel = "rgb";
    streaks.opacityMap = atlas;
    streaks.opacityMapChannel = "a";
    streaks.opacityVertexColor = true;
    streaks.opacityVertexColorChannel = "a";
    streaks.blendType = pc.BLEND_NORMAL;
    streaks.depthWrite = false;
    streaks.cull = pc.CULLFACE_NONE;
    streaks.useLighting = false;
    streaks.update();
    this.quads = new FxQuads(rainDropCount.high + splashCount.high, 2, 1);
    const mesh = (this.mesh = new pc.Mesh(device));
    mesh.setPositions(this.quads.positions);
    const normals = new Float32Array(this.quads.capacity * 12);
    for (let i = 1; i < normals.length; i += 3) normals[i] = 1;
    mesh.setNormals(normals);
    mesh.setUvs(0, this.quads.uvs);
    mesh.setColors32(this.quads.colors);
    mesh.setIndices(this.quads.indices);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    const drops = new pc.Entity("falling rain"), instance = new pc.MeshInstance(mesh, streaks, drops);
    instance.castShadow = false;
    // The box follows the eye; never cull it.
    instance.cull = false;
    drops.addComponent("render", { meshInstances: [instance], castShadows: false, receiveShadows: false });
    this.root.addChild(drops);
    // Standing water, pocked by the rain.
    const ripples = texture("rain ripples", 128, 128, rainRippleNormals(128), true);
    const water = (this.water = new pc.StandardMaterial());
    // Brown with silt: it takes the grey of the sky only at a glance.
    water.diffuse = new pc.Color().fromString("#4a4334");
    water.specular = new pc.Color().fromString("#666c6b");
    water.gloss = 0.84;
    water.emissive = new pc.Color().fromString("#1c1a16");
    water.normalMap = ripples;
    water.normalMapTiling.set(0.9, 0.9);
    water.bumpiness = 0.55;
    water.update();
    this.buildPonds();
    this.buildTrenchWater(texture("trench puddles", 128, 128, puddleMaskPixels(128), true), ripples);
  }
  private buildPonds() {
    const ponds = rainPonds(this.map);
    if (!ponds.length) return;
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
    for (const p of ponds) {
      const centre = positions.length / 3, n = p.edge.length;
      positions.push(p.x, p.high, p.z);
      uvs.push(p.x / 2, p.z / 2);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, x = p.x + Math.cos(a) * p.edge[i], z = p.z + Math.sin(a) * p.edge[i];
        positions.push(x, p.high, z);
        uvs.push(x / 2, z / 2);
        indices.push(centre, centre + 1 + ((i + 1) % n), centre + 1 + i);
      }
      for (let i = 0; i <= n; i++) normals.push(0, 1, 0);
    }
    const mesh = new pc.Mesh(this.app.graphicsDevice);
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setUvs(0, uvs);
    mesh.setIndices(indices);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    const entity = new pc.Entity("flooded shell holes");
    entity.addComponent("render", { meshInstances: [new pc.MeshInstance(mesh, this.water, entity)], castShadows: false });
    this.root.addChild(entity);
    this.ponds = { mesh, positions: new Float32Array(positions), flood: -1 };
  }
  private buildTrenchWater(mask: pc.Texture, ripples: pc.Texture) {
    const strips = floodStrips(this.map);
    if (!strips.length) return;
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
    for (const s of strips) {
      const first = positions.length / 3;
      for (const [x, z] of [[s.x0, s.z0], [s.x0, s.z1], [s.x1, s.z1], [s.x1, s.z0]]) {
        positions.push(x, 0, z);
        normals.push(0, 1, 0);
        uvs.push(x / 5, z / 5);
      }
      indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
    }
    const mesh = new pc.Mesh(this.app.graphicsDevice);
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setUvs(0, uvs);
    mesh.setIndices(indices);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    // The same water, cut by the puddle mask: opaque, so no sorting.
    const material = this.water.clone() as pc.StandardMaterial;
    material.normalMap = ripples;
    material.normalMapTiling.set(2.2, 2.2);
    material.opacityMap = mask;
    material.opacityMapChannel = "a";
    material.alphaTest = puddleThreshold(0);
    material.update();
    const entity = new pc.Entity("flooded trench floors");
    entity.addComponent("render", { meshInstances: [new pc.MeshInstance(mesh, material, entity)], castShadows: false });
    this.root.addChild(entity);
    this.trench = { entity, material, flood: -1 };
  }
  setQuality(quality: Quality) { this.quality = quality; }
  // `intensity` is the shower's strength (src/weather.ts rainIntensity).
  draw(eye: pc.Vec3, right: pc.Vec3, up: pc.Vec3, seconds: number, flood: number, intensity: number, dt: number) {
    this.drawWater(flood, dt);
    const q = this.quads;
    q.begin([eye.x, eye.y, eye.z], [right.x, right.y, right.z], [up.x, up.y, up.z]);
    const count = Math.round(rainDropCount[this.quality] * (0.55 + 0.45 * intensity));
    const drops = rainDrops(eye, seconds, count, this.drops), [dx, dy, dz] = rainDirection;
    for (let i = 0; i < drops; i++) {
      const d = this.drops[i], distance = Math.hypot(d.x - eye.x, d.y - eye.y, d.z - eye.z);
      // About a pixel wide wherever it falls.
      q.axial(d.x, d.y, d.z, dx, dy, dz, d.length, 0.009 + distance * 0.0014, 0, 0.8, 0.84, 0.87, d.alpha * (0.2 + 0.14 * intensity));
    }
    this.stats.drops = drops;
    this.drawSplashes(eye, dt, intensity);
    q.end();
    this.mesh.setPositions(q.positions);
    this.mesh.setUvs(0, q.uvs);
    this.mesh.setColors32(q.colors);
    this.mesh.update(pc.PRIMITIVE_TRIANGLES, false);
  }
  // Drops landing round the viewer: a short-lived fleck on the mud or a
  // brighter one on water, each where the ground (or the water) is.
  private drawSplashes(eye: pc.Vec3, dt: number, intensity: number) {
    const wanted = Math.round(splashCount[this.quality] * intensity), flood = this.flood;
    while (this.splashes.length < wanted) this.splashes.push({ x: 0, y: 0, z: 0, age: 1, life: 0, size: 0, water: false });
    let live = 0;
    for (let i = 0; i < this.splashes.length; i++) {
      const s = this.splashes[i];
      s.age += dt;
      if (s.age >= s.life) {
        if (i >= wanted) continue;
        const a = Math.random() * Math.PI * 2, r = 1 + Math.sqrt(Math.random()) * 10;
        s.x = eye.x + Math.cos(a) * r;
        s.z = eye.z + Math.sin(a) * r;
        const ground = groundHeight(s.x, s.z, this.map), depth = waterDepth(s, this.map, flood);
        s.y = ground + depth + 0.03;
        s.age = 0;
        s.life = 0.12 + Math.random() * 0.12;
        s.size = depth > 0 ? 0.13 : 0.1;
        s.water = depth > 0;
      }
      const t = s.age / s.life, grow = 0.5 + t * 0.8;
      if (this.quads.sprite(s.x, s.y + t * 0.04, s.z, s.size * grow, s.size * 0.6 * grow, 0, 1, 0.82, 0.86, 0.88, (1 - t) * (s.water ? 0.32 : 0.45))) live++;
    }
    this.stats.splashes = live;
  }
  private flood = 0;
  private drawWater(flood: number, dt: number) {
    this.flood = flood;
    // The pocks shift in jumps, about twelve times a second.
    this.rippleTime += dt;
    if (this.rippleTime > 1 / 12) {
      this.rippleTime = 0;
      const u = Math.random(), v = Math.random();
      this.water.normalMapOffset.set(u, v);
      this.water.update();
      if (this.trench) {
        this.trench.material.normalMapOffset.set(v, u);
        this.trench.material.update();
      }
    }
    // Levels move a few millimetres a minute: rewrite them only when they show.
    const ponds = this.ponds;
    if (ponds && Math.abs(flood - ponds.flood) > 0.004) {
      ponds.flood = flood;
      let k = 0;
      for (const p of rainPonds(this.map)) {
        const y = pondLevel(p, flood);
        for (let i = 0; i <= p.edge.length; i++, k++) ponds.positions[k * 3 + 1] = y;
      }
      ponds.mesh.setPositions(ponds.positions);
      ponds.mesh.update(pc.PRIMITIVE_TRIANGLES, false);
    }
    const trench = this.trench;
    if (trench && Math.abs(flood - trench.flood) > 0.004) {
      trench.flood = flood;
      trench.entity.setLocalPosition(0, trenchWaterLevel(flood), 0);
      trench.material.alphaTest = puddleThreshold(flood);
      trench.material.update();
    }
  }
  destroy() {
    this.root.destroy();
    this.mesh.destroy();
    this.ponds?.mesh.destroy();
    for (const t of this.textures) t.destroy();
  }
}
