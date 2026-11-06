import { blastPlume } from "./blast-plume";
import {
  treeFallPose,
  maxFallingTrees,
  maxDebris,
  debrisPiece,
  advanceDebris,
  type Debris,
  type DebrisKind,
} from "./environment-effects";
import { duckboards, intactBoard } from "./battlefield";
import { crouchRules } from "./crouch";
import { weaponAim, recoilPulse } from "./recoil";
import { smokeRules, smokeDensity } from "./smoke";
import { artilleryRules } from "./artillery";
import { dominationRules, flagContains } from "./domination";
import * as pc from "playcanvas";
import { createPhysicsWorld, TerrainPhysics } from "./physics";
import {
  runtimeMap,
  type Destructible,
  type DestructionChange,
} from "./destruction";
import { terrainGeometry, terrainPatchKeys } from "./terrain-geometry";
import {
  industrialMap,
  groundHeight,
  moveOnMap,
  type MapDefinition,
  type Vec,
  type Box,
} from "./map";
import {
  type CollisionWorld,
  type Game,
  type V3,
  type Event,
  type Soldier,
  type Team,
  projectileRange,
  projectileSpeed,
  mantleProgress,
  smooth,
  hopSpeed,
  hopGravity,
  rifleHeight,
} from "./simulation";
const color = (hex: string) => new pc.Color().fromString(hex);
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
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
  crouch: number;
  alive: boolean;
};
type FallingTree = {
  pivot: pc.Entity;
  root: pc.Entity;
  source: Box;
  height: number;
  crown: boolean;
  log?: Box;
  pieces: string[];
  hidden?: { log: pc.RenderComponent[]; stump: pc.RenderComponent[] };
  axis: pc.Vec3;
  age: number;
  landed: boolean;
};

export class Renderer implements CollisionWorld {
  app: pc.Application;
  camera: pc.Entity;
  cameraReaction = { pitch: 0, yaw: 0, roll: 0 };
  private boardBatch = -1;
  private blastFlinches = new Map<number, { tick: number; strength: number }>();
  private boardVisuals: { root: pc.Entity; x: number; z: number }[] = [];
  people: pc.Entity[] = [];
  private soldiers: SoldierRig[] = [];
  rings: pc.Entity[] = [];
  private objectiveTerrainRevision = -1;
  effects: { e: pc.Entity; life: number; velocity?: V3; size?: number }[] = [];
  private fallingTrees: FallingTree[] = [];
  private fragments: { entity: pc.Entity; state: Debris }[] = [];
  materials = new Map<string, pc.StandardMaterial>();
  previous: V3[] = [];
  private mapBatch = -1;
  private actorBatch = -1;
  private coverBatch = -1;
  private batchGroup = -1;
  private projectiles = new Map<number, pc.Entity>();
  private previousProjectiles = new Map<number, V3>();
  private grenades = new Map<number, pc.Entity>();
  private previousGrenades = new Map<number, V3>();
  artilleryPreview: { target: Vec; valid: boolean } | null = null;
  private artilleryMarkers = new Map<number, pc.Entity>();
  private shells = new Map<number, pc.Entity>();
  private smokeVolumes = new Map<
    number,
    { root: pc.Entity; material: pc.StandardMaterial }
  >();
  private previousShells = new Map<number, V3>();
  private blasts: {
    root: pc.Entity;
    age: number;
    radius: number;
    power: number;
    flash: pc.Entity;
    wave: pc.Entity;
    smoke: pc.Entity[];
    materials: pc.StandardMaterial[];
  }[] = [];
  private mapRoot!: pc.Entity;
  private worldParent?: pc.Entity;
  private terrainPhysics = new TerrainPhysics();
  private terrainPatches = new Map<
    string,
    { entity: pc.Entity; mesh: pc.Mesh }
  >();
  private objectVisuals = new Map<string, pc.Entity>();
  private objectStates = new Map<string, string>();
  private groundDecor: {
    root: pc.Entity;
    x: number;
    z: number;
    radius: number;
  }[] = [];
  constructor(
    public canvas: HTMLCanvasElement,
    public map: MapDefinition = industrialMap,
  ) {
    map = this.map = runtimeMap(map);
    this.app = new pc.Application(canvas, {
      physicsWorld: createPhysicsWorld(),
      graphicsDeviceOptions: {
        deviceTypes: [pc.DEVICETYPE_WEBGL2],
        antialias: true,
      },
    });
    this.boardBatch = this.app.batcher!.addGroup(
      "trench duckboards",
      false,
      200,
    ).id;
    this.mapBatch = this.app.batcher!.addGroup("static map", false, 200).id;
    this.coverBatch = this.app.batcher!.addGroup(
      "destructible cover",
      false,
      200,
    ).id;
    this.actorBatch = this.app.batcher!.addGroup(
      "articulated soldiers",
      true,
      200,
    ).id;
    this.batchGroup = this.mapBatch;
    const trenches = map.id === "trenches";
    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);
    this.app.scene.ambientLight = color(trenches ? "#8b8c7e" : "#899294");
    this.app.scene.fog.type = "linear";
    this.app.scene.fog.color = color(trenches ? "#a2a18c" : "#9ca6a5");
    this.app.scene.fog.start = 35;
    this.app.scene.fog.end = trenches ? 140 : 115;
    this.camera = new pc.Entity("camera");
    this.camera.addComponent("camera", {
      clearColor: color(trenches ? "#a2a18c" : "#9ca6a5"),
      fov: 70,
      nearClip: 0.08,
      farClip: trenches ? 210 : 180,
    });
    this.app.root.addChild(this.camera);
    const sun = new pc.Entity("sun");
    sun.addComponent("light", {
      type: "directional",
      color: color("#ffdfa8"),
      intensity: trenches ? 1.2 : 1.5,
      castShadows: true,
      shadowDistance: trenches ? 50 : 65,
      shadowResolution: 2048,
      shadowBias: 0.25,
      normalOffsetBias: 0.05,
    });
    sun.setEulerAngles(45, -35, 0);
    this.app.root.addChild(sun);
    this.buildMap();
    window.addEventListener("resize", () => this.app.resizeCanvas());
    // Simulation calls collision queries synchronously; no automatic physics advancement.
    this.app.systems.rigidbody!.timeScale = 0;
    this.app.start();
  }
  private buildMap() {
    const map = this.map;
    const trenches = map.id === "trenches";
    this.mapRoot = this.joint("battlefield", this.app.root);
    this.worldParent = this.mapRoot;
    this.batchGroup = this.mapBatch;
    for (const key of terrainPatchKeys(map)) this.rebuildTerrainPatch(key);
    if (map.terrain) this.buildTrenchTerrain();
    for (const b of map.boxes) {
      if (map.destruction?.objects[b.id!]) continue;
      const c =
        b.kind === "building"
          ? "#707a79"
          : b.kind === "container"
            ? "#657b7b"
            : b.kind === "bunker"
              ? "#5c5040"
              : trenches
                ? "#9a8c6a"
                : "#aaa58d";
      const base = b.baseY ?? 0;
      const obstacle = this.cube(
        b.kind,
        b.x,
        base + b.h / 2,
        b.z,
        b.w,
        b.h,
        b.d,
        c,
        true,
      );
      if (b.kind === "wire") {
        obstacle.render!.enabled = false;
        for (let x = -b.w / 2; x <= b.w / 2; x += 2)
          this.cube(
            "wire stake",
            b.x + x,
            base + 0.45,
            b.z,
            0.12,
            0.9,
            0.12,
            "#3e3930",
          );
        for (const y of [0.3, 0.65])
          this.cube(
            "wire strand",
            b.x,
            base + y,
            b.z,
            b.w,
            0.04,
            0.04,
            "#474138",
          );
        for (let x = -b.w / 2 + 1; x < b.w / 2; x += 2) {
          const barb = this.cube(
            "barbed wire",
            b.x + x,
            base + 0.45,
            b.z,
            1.6,
            0.04,
            0.04,
            "#474138",
          );
          barb.setEulerAngles(0, 0, x % 4 ? 24 : -24);
        }
      }
      if (b.kind === "sandbag")
        for (let x = -b.w / 2 + 1; x < b.w / 2; x += 1.2)
          this.cube(
            "bag seam",
            b.x + x,
            base + b.h / 2,
            b.z - 0.01,
            0.05,
            b.h + 0.02,
            b.d + 0.03,
            "#807252",
          );
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
    for (const object of Object.values(map.destruction!.objects))
      this.buildDestructible(object);
    for (const [x, z, w, d] of [
      [0, -map.depth / 2, map.width + 1, 1],
      [0, map.depth / 2, map.width + 1, 1],
      [-map.width / 2, 0, 1, map.depth],
      [map.width / 2, 0, 1, map.depth],
    ])
      this.cube(
        "perimeter",
        x,
        2,
        z,
        w,
        4,
        d,
        trenches ? "#716650" : "#666e69",
        true,
      );
    if (!trenches)
      for (let i = -45; i < 50; i += 10) {
        this.cube("road marking", i, 0.015, -1, 3, 0.02, 0.12, "#b8b29b");
        this.cube("road marking", 1, 0.015, i, 0.12, 0.02, 3, "#b8b29b");
      }
    this.batchGroup = -1;
    this.app.batcher!.generate([
      this.mapBatch,
      this.coverBatch,
      this.boardBatch,
    ]);
    this.worldParent = undefined;
  }
  private buildTrenchTerrain() {
    const terrain = this.map.terrain!;
    const previousBatch = this.batchGroup;
    this.batchGroup = -1;
    for (const crater of terrain.craters) {
      const root = this.joint("old shell scar", this.mapRoot);
      this.groundDecor.push({ root, ...crater });
      this.worldParent = root;
      if (!terrain.relief) {
        const disk = new pc.Entity("shell scar");
        disk.addComponent("render", {
          type: "cylinder",
          material: this.material("#44392b"),
          castShadows: false,
          batchGroupId: -1,
        });
        disk.setLocalScale(crater.radius * 2, 0.025, crater.radius * 2);
        disk.setLocalPosition(crater.x, terrain.bankHeight + 0.015, crater.z);
        root.addChild(disk);
      }
      for (let i = 0; i < 5; i++) {
        const angle = (i * Math.PI * 2) / 5;
        const x = crater.x + Math.sin(angle) * crater.radius;
        const z = crater.z + Math.cos(angle) * crater.radius;
        this.cube(
          "crater rubble",
          x,
          groundHeight(x, z, this.map) + 0.16,
          z,
          0.7,
          0.32,
          0.65,
          "#807052",
        );
      }
    }
    this.worldParent = this.mapRoot;
    this.batchGroup = this.boardBatch;
    for (const b of duckboards(this.map)) {
      const root = this.cube(
        "duckboard",
        b.x,
        0.025,
        b.z,
        1.3,
        0.045,
        1.8,
        "#756044",
      );
      root.enabled = intactBoard(b, this.map);
      this.boardVisuals.push({ root, ...b });
    }
    this.batchGroup = previousBatch;
  }
  setMap(map: MapDefinition) {
    const restore = !!this.map.destruction?.revision || this.map.id !== map.id;
    this.map = map;
    if (!restore) return;
    this.clearEnvironmentEffects();
    this.terrainPhysics.destroy();
    for (const patch of this.terrainPatches.values()) {
      patch.entity.destroy();
      patch.mesh.destroy();
    }
    this.terrainPatches.clear();
    this.objectVisuals.clear();
    this.objectStates.clear();
    this.groundDecor = [];
    this.boardVisuals = [];
    this.mapRoot.destroy();
    this.terrainPhysics = new TerrainPhysics();
    this.buildMap();
  }
  private rebuildTerrainPatch(key: string) {
    const data = terrainGeometry(this.map, key);
    if (!data.indices.length) return;
    const old = this.terrainPatches.get(key);
    const entity = this.joint(`terrain ${key}`, this.mapRoot);
    const mesh = new pc.Mesh(this.app.graphicsDevice);
    mesh.setPositions(data.positions);
    mesh.setNormals(pc.calculateNormals(data.positions, data.indices));
    mesh.setColors(data.colors);
    mesh.setIndices(data.indices);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    const material = this.material("#ffffff");
    material.diffuseVertexColor = true;
    material.update();
    const instance = new pc.MeshInstance(mesh, material, entity);
    instance.castShadow = true;
    entity.addComponent("render", { meshInstances: [instance] });
    this.terrainPhysics.setPatch(key, data, entity);
    if (old) {
      old.entity.destroy();
      old.mesh.destroy();
    }
    this.terrainPatches.set(key, { entity, mesh });
  }
  private clearEnvironmentEffects() {
    for (const fall of this.fallingTrees) fall.pivot.destroy();
    for (const fragment of this.fragments) fragment.entity.destroy();
    this.fallingTrees = [];
    this.fragments = [];
  }
  private finishTreeFall(fall: FallingTree) {
    for (const render of [
      ...(fall.hidden?.log ?? []),
      ...(fall.hidden?.stump ?? []),
    ])
      render.enabled = true;
    fall.pivot.destroy();
    this.fallingTrees = this.fallingTrees.filter((f) => f !== fall);
  }
  private startTreeFall(object: Destructible) {
    const root = this.objectVisuals.get(object.id);
    if (!root) return;
    if (this.fallingTrees.length >= maxFallingTrees)
      this.finishTreeFall(this.fallingTrees[0]);
    const stage = JSON.parse(this.objectStates.get(object.id) ?? "[0]")[0];
    const b = object.original,
      base = b.baseY ?? 0;
    // The falling tree is presentation only. Its old standing collider must
    // disappear immediately; the simulation already installed the final pieces.
    for (const body of root.findComponents("rigidbody")) body.entity.destroy();
    for (const render of root.findComponents("render") as pc.RenderComponent[])
      render.batchGroupId = -1;
    for (const child of root.children) {
      const p = child.getLocalPosition();
      child.setLocalPosition(p.x - b.x, p.y - base, p.z - b.z);
    }
    const pivot = this.joint("falling tree", this.app.root);
    pivot.setPosition(b.x, base, b.z);
    root.reparent(pivot);
    root.setLocalPosition(0, 0, 0);
    this.objectVisuals.delete(object.id);
    const log = this.map.destruction!.objects[`log-${b.id}`]?.original;
    const dx = log ? log.x - b.x : 0,
      dz = log ? log.z - b.z : 0;
    this.fallingTrees.push({
      pivot,
      root,
      source: { ...b },
      height: b.h * (stage === 1 ? 0.6 : 1),
      crown: stage === 0,
      log,
      pieces: [`log-${b.id}`, `stump-${b.id}`],
      axis: log ? new pc.Vec3(dz, 0, -dx).normalize() : new pc.Vec3(0, 0, 1),
      age: 0,
      landed: false,
    });
  }
  private spawnDebris(
    at: V3,
    kind: DebrisKind,
    count: number,
    seed: number,
    smallChips = false,
  ) {
    const previousBatch = this.batchGroup;
    this.batchGroup = -1;
    for (let i = 0; i < count; i++) {
      if (this.fragments.length >= maxDebris)
        this.fragments.shift()!.entity.destroy();
      const state = debrisPiece(at, kind, seed * 31 + i);
      if (smallChips) {
        for (const axis of ["x", "y", "z"] as const) {
          state.size[axis] *= 0.3;
          state.velocity[axis] *= 0.6;
        }
        state.life = 1.4;
      }
      const entity = this.cube(
        `${kind} fragment`,
        at.x,
        at.y,
        at.z,
        state.size.x,
        state.size.y,
        state.size.z,
        kind === "leaf"
          ? i % 2
            ? "#687447"
            : "#82814d"
          : kind === "wood"
            ? i % 2
              ? "#9b8054"
              : "#685039"
            : "#67513a",
        false,
        this.app.root,
      );
      if (smallChips || kind === "leaf") entity.render!.castShadows = false;
      this.fragments.push({ entity, state });
    }
    this.batchGroup = previousBatch;
  }
  private drawEnvironmentEffects(dt: number) {
    for (const fall of [...this.fallingTrees]) {
      fall.age += dt;
      const pose = treeFallPose(fall.age),
        b = fall.source,
        log = fall.log;
      const length = log ? Math.max(log.w, log.d) : 1.15;
      fall.root.setLocalScale(
        1,
        1 + (length / fall.height - 1) * pose.blend,
        1,
      );
      fall.pivot.setRotation(
        new pc.Quat().setFromAxisAngle(fall.axis, log ? pose.angle : 0),
      );
      const base = b.baseY ?? 0;
      fall.pivot.setPosition(
        b.x,
        base + (log ? (log.baseY ?? 0) + log.h / 2 - base : 0) * pose.blend,
        b.z,
      );
      if (pose.angle > 20 || !log)
        for (const render of fall.hidden?.stump ?? []) render.enabled = true;
      if (pose.landed && !fall.landed) {
        fall.landed = true;
        const at = {
          x: log?.x ?? b.x,
          z: log?.z ?? b.z,
          y: groundHeight(log?.x ?? b.x, log?.z ?? b.z, this.map) + 0.15,
        };
        this.spawnDebris(at, "earth", 8, b.x * 7 + b.z);
        this.spawnDebris(at, "wood", 6, b.z * 9);
        if (fall.crown)
          this.spawnDebris({ ...at, y: at.y + 0.8 }, "leaf", 10, b.x);
      }
      if (pose.finished) this.finishTreeFall(fall);
    }
    this.fragments = this.fragments.filter(({ entity, state }) => {
      const fade = advanceDebris(state, dt, (x, z) =>
        groundHeight(x, z, this.map),
      );
      if (fade <= 0) {
        entity.destroy();
        return false;
      }
      entity.setPosition(state.at.x, state.at.y, state.at.z);
      entity.setEulerAngles(
        state.rotation.x,
        state.rotation.y,
        state.rotation.z,
      );
      entity.setLocalScale(
        state.size.x * fade,
        state.size.y * fade,
        state.size.z * fade,
      );
      return true;
    });
  }
  private buildDestructible(object: Destructible) {
    const b = object.original;
    const signature = JSON.stringify([object.stage, b.baseY, b.w, b.h, b.d]);
    if (this.objectStates.get(object.id) === signature) return false;
    this.objectStates.set(object.id, signature);
    this.objectVisuals.get(object.id)?.destroy();
    this.objectVisuals.delete(object.id);
    if (object.stage === 2) return true;
    const previousBatch = this.batchGroup;
    this.batchGroup = this.coverBatch;
    const root = this.joint(object.id, this.mapRoot);
    const h = b.h * (object.stage === 1 ? 0.6 : 1),
      base = b.baseY ?? 0;
    if (["tree", "brush", "log", "stump"].includes(b.kind)) {
      const primitive = (
        name: string,
        type: "sphere" | "cylinder",
        x: number,
        y: number,
        z: number,
        w: number,
        h: number,
        d: number,
        tint: string,
      ) => {
        const e = new pc.Entity(name);
        e.addComponent("render", {
          type,
          material: this.material(tint),
          castShadows: true,
          receiveShadows: true,
          batchGroupId: this.coverBatch,
        });
        e.setLocalPosition(x, y, z);
        e.setLocalScale(w, h, d);
        root.addChild(e);
        return e;
      };
      const seed = [...object.id].reduce((n, c) => n + c.charCodeAt(0), 0);
      if (b.kind !== "brush") {
        const solid = this.cube(
          b.kind,
          b.x,
          base + h / 2,
          b.z,
          b.w,
          h,
          b.d,
          "#5e4934",
          true,
          root,
        );
        solid.render!.enabled = false;
        if (b.kind === "log") {
          const alongX = b.w > b.d;
          const log = primitive(
            "fallen timber",
            "cylinder",
            b.x,
            base + h / 2,
            b.z,
            alongX ? b.d : b.w,
            Math.max(b.w, b.d),
            h,
            "#65503a",
          );
          log.setLocalEulerAngles(alongX ? 0 : 90, 0, alongX ? 90 : 0);
        } else
          primitive(
            b.kind,
            "cylinder",
            b.x,
            base + h / 2,
            b.z,
            b.w,
            h,
            b.d,
            object.stage ? "#4c3c2c" : "#66503a",
          );
      }
      if (b.kind === "tree") {
        for (const side of [-1, 1]) {
          const branch = primitive(
            "tree branch",
            "cylinder",
            b.x + side * h * 0.09,
            base + h * 0.55,
            b.z,
            b.w * 0.35,
            h * 0.42,
            b.w * 0.35,
            "#5a4833",
          );
          branch.setLocalEulerAngles(0, seed % 120, side * 48);
        }
        if (object.stage === 0)
          for (let i = 0; i < 3; i++) {
            primitive(
              "tree crown",
              "sphere",
              b.x + Math.sin(seed + i * 2.4) * b.h * 0.1,
              base + b.h * (0.62 + (i % 2) * 0.12),
              b.z + Math.cos(seed + i * 2.4) * b.h * 0.1,
              b.h * 0.5,
              b.h * 0.7,
              b.h * 0.5,
              i % 2 ? "#666b42" : "#56613d",
            );
          }
      } else if (b.kind === "brush") {
        if (b.h < 0.6)
          for (let i = 0; i < 4; i++) {
            const blade = this.cube(
              "grass",
              b.x + (i - 1.5) * 0.2,
              base + h * 0.5,
              b.z + Math.sin(seed + i) * 0.3,
              0.06,
              h,
              0.12,
              i % 2 ? "#727448" : "#5d683e",
              false,
              root,
            );
            blade.setLocalEulerAngles(i * 9, seed % 180, (i - 1.5) * 12);
          }
        else
          for (let i = 0; i < 3; i++)
            primitive(
              "low foliage",
              "sphere",
              b.x + Math.sin(seed + i * 2.4) * b.w * 0.15,
              base + h * 0.52,
              b.z + Math.cos(seed + i * 2.4) * b.d * 0.15,
              b.w * 0.8,
              h,
              b.d * 0.8,
              object.stage ? "#777046" : i % 2 ? "#707446" : "#58633c",
            );
      } else if (b.kind === "stump")
        primitive(
          "splintered stump cap",
          "cylinder",
          b.x,
          base + h + 0.015,
          b.z,
          b.w * 0.94,
          0.04,
          b.d * 0.94,
          "#b59d6b",
        );
      this.objectVisuals.set(object.id, root);
      this.batchGroup = previousBatch;
      return true;
    }
    const tint =
      b.kind === "wood"
        ? object.stage === 1
          ? "#493624"
          : "#756044"
        : object.stage === 1
          ? "#756951"
          : "#9a8c6a";
    this.cube(
      b.kind,
      b.x,
      base + h / 2,
      b.z,
      b.w,
      h,
      b.d,
      tint,
      !object.lining,
      root,
    );
    if (b.kind === "wood") {
      for (const dz of [-b.d / 2 + 0.08, b.d / 2 - 0.08])
        this.cube(
          "wood post",
          b.x,
          base + (h + 0.06) / 2,
          b.z + dz,
          b.w + 0.05,
          h + 0.06,
          0.12,
          "#493d2f",
          false,
          root,
        );
    } else {
      for (let x = b.x - b.w / 2 + 0.4; x < b.x + b.w / 2; x += 0.8)
        this.cube(
          "sandbag seam",
          x,
          base + h * 0.55,
          b.z,
          0.025,
          0.025,
          b.d + 0.01,
          "#655c46",
          false,
          root,
        );
    }
    this.objectVisuals.set(object.id, root);
    this.batchGroup = previousBatch;
    return true;
  }
  updateWorld(change: DestructionChange) {
    for (const fall of [...this.fallingTrees])
      if (change.objects.some((o) => fall.pieces.includes(o.id)))
        this.finishTreeFall(fall);
    for (const changed of change.objects) {
      const object = this.map.destruction!.objects[changed.id];
      if (object.original.kind === "tree" && changed.stage === 2)
        this.startTreeFall(object);
    }
    for (const key of change.patches) this.rebuildTerrainPatch(key);
    let coverChanged = false;
    for (const changed of change.objects)
      coverChanged =
        this.buildDestructible(this.map.destruction!.objects[changed.id]) ||
        coverChanged;
    for (const fall of this.fallingTrees) {
      if (fall.hidden) continue;
      const hide = (id: string) => {
        const renders = (this.objectVisuals.get(id)?.findComponents("render") ??
          []) as pc.RenderComponent[];
        return renders.filter((r) => {
          if (!r.enabled) return false;
          r.batchGroupId = -1;
          r.enabled = false;
          return true;
        });
      };
      fall.hidden = {
        log: hide(`log-${fall.source.id}`),
        stump: hide(`stump-${fall.source.id}`),
      };
    }
    if (coverChanged) this.app.batcher!.generate([this.coverBatch]);
    if (change.crater) {
      let changed = false;
      for (const board of this.boardVisuals) {
        const enabled = intactBoard(board, this.map);
        if (board.root.enabled !== enabled) {
          board.root.enabled = enabled;
          changed = true;
        }
      }
      if (changed) this.app.batcher!.generate([this.boardBatch]);
    }
    if (change.crater)
      for (const decor of this.groundDecor)
        if (
          Math.hypot(decor.x - change.at.x, decor.z - change.at.z) <
          decor.radius + change.crater.radius
        )
          decor.root.enabled = false;
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
    rotationZ = 0,
  ) {
    const e = new pc.Entity(name);
    e.addComponent("render", {
      type: "box",
      material: this.material(c),
      castShadows: true,
      receiveShadows: true,
      batchGroupId: this.batchGroup,
    });
    e.setLocalPosition(x, y, z);
    e.setLocalScale(w, h, d);
    e.setLocalEulerAngles(0, 0, rotationZ);
    (parent ?? this.worldParent ?? this.app.root).addChild(e);
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
    return Math.min(hit?.hitFraction ?? 1, this.terrainPhysics.ray(a, b));
  }
  move(p: Vec, d: Vec) {
    return moveOnMap(p, d, this.map);
  }
  private joint(name: string, parent: pc.Entity, x = 0, y = 0, z = 0) {
    const joint = new pc.Entity(name);
    parent.addChild(joint);
    joint.setLocalPosition(x, y, z);
    return joint;
  }
  private createSoldier(p: Soldier) {
    const root = this.joint(`soldier-${p.id}`, this.app.root);
    root.setPosition(p.x, p.y, p.z);
    root.setEulerAngles(0, (-p.yaw * 180) / Math.PI, 0);
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
    if (p.weapon === "machineGun") {
      this.cube(
        "machine gun barrel shroud",
        0,
        0.025,
        -0.53,
        0.11,
        0.11,
        0.48,
        "#293133",
        false,
        rifle,
      );
      this.cube(
        "machine gun ammo box",
        -0.15,
        -0.11,
        0.06,
        0.25,
        0.25,
        0.23,
        "#555d3d",
        false,
        rifle,
      );
      for (const side of [-1, 1])
        this.cube(
          "folded bipod",
          side * 0.07,
          -0.06,
          -0.36,
          0.035,
          0.035,
          0.4,
          "#424b48",
          false,
          rifle,
        );
    }
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
      crouch: 0,
      alive: p.hp > 0,
    });
  }
  private poseArm(
    rig: SoldierRig,
    index: number,
    target: pc.Vec3,
    upperLength: number,
    forearmLength: number,
    weight = 1,
  ) {
    const arm = rig.arms[index];
    const shoulder = arm.shoulder.getLocalPosition();
    const direction = new pc.Vec3().sub2(target, shoulder);
    const distance = Math.max(
      0.001,
      Math.min(direction.length(), upperLength + forearmLength - 0.001),
    );
    direction.normalize();
    const hand = shoulder.clone().add(direction.clone().mulScalar(distance));
    const bend = new pc.Vec3(index === 0 ? -0.7 : 0.7, -1, 0.1);
    bend.sub(direction.clone().mulScalar(bend.dot(direction))).normalize();
    const along =
      (upperLength ** 2 - forearmLength ** 2 + distance ** 2) / (2 * distance);
    const height = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
    const elbow = shoulder
      .clone()
      .add(direction.mulScalar(along))
      .add(bend.mulScalar(height));
    const upper = new pc.Quat().setFromDirections(
      pc.Vec3.DOWN,
      elbow.clone().sub(shoulder).normalize(),
    );
    const forearm = new pc.Quat().setFromDirections(
      pc.Vec3.DOWN,
      hand.sub(elbow).normalize(),
    );
    arm.shoulder.setLocalRotation(
      new pc.Quat().slerp(arm.shoulder.getLocalRotation(), upper, weight),
    );
    arm.elbow.setLocalRotation(
      new pc.Quat().slerp(
        arm.elbow.getLocalRotation(),
        upper.clone().invert().mul(forearm),
        weight,
      ),
    );
  }
  private attachSupportArm(rig: SoldierRig) {
    const hand = rig.rifle
      .getLocalTransform()
      .transformPoint(rig.supportHand.getLocalPosition());
    this.poseArm(rig, 0, hand, supportUpperLength, supportForearmLength);
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
    const moved =
      p.hp > 0 && rig.alive && !p.mantle && !p.hop && !p.fall && distance < 2
        ? distance
        : 0;
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
      p.command.sprint && !p.command.aim && !p.crouched
        ? Math.max(0, Math.min(1, (speed - 4) / 3))
        : 0;
    rig.sprint = rig.alive ? rig.sprint + (sprint - rig.sprint) * blend : 0;
    rig.phase =
      (rig.phase +
        moved * (2.5 - rig.sprint * 0.35) * (forward < -0.15 ? -1 : 1)) %
      (Math.PI * 2);
    const crouchTarget = p.crouched && !p.mantle && !p.hop && p.hp > 0 ? 1 : 0;
    rig.crouch += (crouchTarget - rig.crouch) * blend;
    if (Math.abs(rig.crouch - crouchTarget) < 0.001) rig.crouch = crouchTarget;
    const crouchDrop = crouchRules.drop * rig.crouch;
    const squatAngle =
      (Math.acos(clamp01((0.82 - crouchDrop) / 0.82)) * 180) / Math.PI;
    const stride = Math.sin(rig.phase) * rig.motion;
    const kick = recoilPulse(p, tick + 1);
    const ready = p.command.aim || p.command.fire || p.reloadAt > 0;
    rig.body.setLocalPosition(
      0,
      0.94 -
        crouchDrop -
        (p.duckUntil > tick && !p.crouched ? 0.09 : 0) +
        (Math.cos(rig.phase * 2) - 1) * 0.022 * rig.motion,
      0,
    );
    rig.body.setLocalEulerAngles(
      -forward * rig.motion * (2 + 8 * rig.sprint) - 8 * rig.crouch,
      0,
      -sideways * rig.motion * 4,
    );
    rig.hips.setLocalEulerAngles(
      0,
      -Math.atan2(sideways, Math.abs(forward) + 0.001) * 40 * rig.motion,
      0,
    );
    rig.upper.setLocalEulerAngles(
      -kick * 2,
      stride * (ready ? 1.5 : 4),
      -stride * 1.5,
    );
    for (let i = 0; i < rig.legs.length; i++) {
      const phase = rig.phase + i * Math.PI;
      const swing =
        Math.sin(phase) *
        (30 + 18 * rig.sprint) *
        rig.motion *
        (1 - 0.7 * rig.crouch);
      const bend =
        -Math.max(0, -Math.sin(phase)) *
        (38 + 24 * rig.sprint) *
        rig.motion *
        (1 - 0.65 * rig.crouch);
      const hip = squatAngle + swing,
        knee = -2 * squatAngle + bend;
      rig.legs[i].hip.setLocalEulerAngles(hip, 0, 0);
      rig.legs[i].knee.setLocalEulerAngles(knee, 0, 0);
      rig.legs[i].ankle.setLocalEulerAngles(
        rig.crouch > 0
          ? -hip - knee + 8 * rig.crouch
          : -swing * 0.25 - bend * 0.35,
        0,
        0,
      );
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
      0.36 - rig.sprint * 0.08 + rifleHeight(this.map) - 1.45,
      -0.55 + kick * 0.09,
    );
    rig.rifle.setLocalEulerAngles(
      -rig.sprint * 20 +
        stride * 2 +
        (weaponAim(p).pitch * 180) / Math.PI +
        kick * 5,
      (p.recoilYaw * 180) / Math.PI,
      p.reloadAt ? 12 : 0,
    );
    const landing = Math.max(0, Math.min(1, 1 - (tick - p.landedAt) / 7));
    if (p.hop || p.fall || landing > 0) {
      const flight = p.hop
        ? Math.max(
            0,
            Math.min(
              1,
              (tick - p.hop.startTick) / ((30 * 2 * hopSpeed) / hopGravity),
            ),
          )
        : 0;
      const tuck = p.hop
        ? Math.sin(flight * Math.PI)
        : p.fall
          ? Math.min(0.45, -p.fall.velocity / 16)
          : Math.sin(landing * Math.PI) * 0.55;
      rig.body.setLocalPosition(
        0,
        0.94 - crouchDrop - (p.hop || p.fall ? 0.025 : 0.1) * tuck,
        0,
      );
      rig.body.setLocalEulerAngles(-8 * rig.crouch - 7 * tuck, 0, 0);
      rig.hips.setLocalEulerAngles(0, 0, 0);
      for (let i = 0; i < 2; i++) {
        rig.legs[i].hip.setLocalEulerAngles(
          squatAngle + (i === 0 ? 38 : 28) * tuck,
          0,
          0,
        );
        rig.legs[i].knee.setLocalEulerAngles(
          -2 * squatAngle + (i === 0 ? -70 : -55) * tuck,
          0,
          0,
        );
        rig.legs[i].ankle.setLocalEulerAngles(squatAngle + 30 * tuck, 0, 0);
      }
    }
    if (p.mantle) {
      const m = p.mantle,
        t = mantleProgress(m, tick),
        up = m.to.y > m.from.y;
      const effort = smooth(t / 0.2) * (1 - smooth((t - 0.82) / 0.18));
      const tuck = up
        ? smooth((t - 0.3) / 0.32) * (1 - smooth((t - 0.82) / 0.18))
        : smooth(t / 0.2) * (1 - smooth((t - 0.45) / 0.4));
      rig.body.setLocalPosition(0, 0.94 - 0.12 * effort, 0);
      rig.body.setLocalEulerAngles(-(up ? 35 : 20) * effort, 0, 0);
      rig.upper.setLocalEulerAngles(10 * effort, 0, -5 * effort);
      rig.hips.setLocalEulerAngles(0, 0, 0);
      for (let i = 0; i < 2; i++) {
        const hip = (i === 0 ? 90 : 100) * tuck + 25 * effort * (1 - tuck);
        const knee = (i === 0 ? -130 : -140) * tuck - 50 * effort * (1 - tuck);
        rig.legs[i].hip.setLocalEulerAngles(hip, 0, 0);
        rig.legs[i].knee.setLocalEulerAngles(knee, 0, 0);
        rig.legs[i].ankle.setLocalEulerAngles(35 * effort - hip - knee, 0, 0);
      }
      // Keep the rifle in the left hand; the free right hand braces against the ledge.
      rig.rifle.setLocalPosition(
        0.32 - 0.16 * effort,
        0.36 - 0.18 * effort,
        -0.55 + 0.3 * effort,
      );
      rig.rifle.setLocalEulerAngles(-40 * effort, 0, 25 * effort);
      const contact = up
        ? smooth((t - 0.16) / 0.18) * (1 - smooth((t - 0.5) / 0.14))
        : smooth((t - 0.42) / 0.16) * (1 - smooth((t - 0.75) / 0.12));
      const worldHand = new pc.Vec3(
        m.edge.x + Math.cos(m.yaw) * 0.32,
        m.edge.y + 0.04,
        m.edge.z + Math.sin(m.yaw) * 0.32,
      );
      const hand = rig.upper
        .getWorldTransform()
        .clone()
        .invert()
        .transformPoint(worldHand);
      this.poseArm(rig, 1, hand, 0.3, 0.28, contact);
    }
    if (this.map.terrain && !p.mantle) {
      const trigger = rig.rifle
        .getLocalTransform()
        .transformPoint(new pc.Vec3(0, -0.03, 0.14));
      this.poseArm(rig, 1, trigger, 0.3, 0.28);
    }
    if (p.throwUntil > tick && !p.mantle) {
      const t = clamp01(1 - (p.throwUntil - tick) / 15);
      rig.rifle.setLocalEulerAngles(-30, 0, 15);
      rig.arms[1].shoulder.setLocalEulerAngles(150 - 110 * smooth(t), 0, -15);
      rig.arms[1].elbow.setLocalEulerAngles(55 * (1 - t), 0, 0);
    }
    const flinch = this.blastFlinches?.get(p.id);
    if (flinch && p.hp > 0 && !p.mantle) {
      const age = Math.max(0, (tick - flinch.tick) / 30);
      const brace =
        flinch.strength *
        Math.sin(Math.min(1, age / 0.4) * Math.PI) *
        Math.exp(-age * 2);
      rig.upper.rotateLocal(12 * brace, 0, -5 * brace);
      if (age > 0.6) this.blastFlinches.delete(p.id);
    }
    this.attachSupportArm(rig);
  }
  reset(g: Game) {
    this.clearEnvironmentEffects();
    for (const e of [
      ...this.people,
      ...this.rings,
      ...this.projectiles.values(),
      ...this.grenades.values(),
      ...this.shells.values(),
      ...this.artilleryMarkers.values(),
      ...this.effects.map((v) => v.e),
    ])
      e.destroy();
    this.projectiles.clear();
    this.previousProjectiles.clear();
    this.grenades.clear();
    this.shells.clear();
    this.previousShells.clear();
    this.artilleryMarkers.clear();
    this.artilleryPreview = null;
    this.blastFlinches.clear();
    this.cameraReaction = { pitch: 0, yaw: 0, roll: 0 };
    this.previousGrenades.clear();
    for (const blast of this.blasts) {
      blast.root.destroy();
      for (const material of blast.materials) material.destroy();
    }
    this.blasts = [];
    for (const smoke of this.smokeVolumes.values()) {
      smoke.root.destroy();
      smoke.material.destroy();
    }
    this.smokeVolumes.clear();
    this.people = [];
    this.rings = [];
    this.objectiveTerrainRevision = -1;
    this.effects = [];
    this.remember(g);
    this.soldiers = [];
    this.batchGroup = this.actorBatch;
    for (const p of g.players) this.createSoldier(p);
    this.batchGroup = -1;
    this.app.batcher!.generate([this.actorBatch]);
    for (const s of g.scoring !== "eliminations" ? g.sectors : []) {
      const ring = new pc.Entity(s.id);
      this.app.root.addChild(ring);
      ring.setPosition(s.x, groundHeight(s.x, s.z, this.map) + 0.04, s.z);
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        const e = this.cube(
          "boundary",
          Math.sin(a) *
            (g.scoring === "domination" ? dominationRules.radius : 8),
          0,
          Math.cos(a) *
            (g.scoring === "domination" ? dominationRules.radius : 8),
          0.16,
          0.05,
          0.65,
          "#d4c699",
          false,
          ring,
        );
        e.setLocalEulerAngles(0, (a * 180) / Math.PI, 0);
      }
      if (g.scoring === "domination") {
        this.cube(
          "flagpole",
          0,
          1.9,
          0,
          0.07,
          3.8,
          0.07,
          "#a5a697",
          false,
          ring,
        );
        this.cube(
          "flag cloth",
          0.7,
          3.1,
          0,
          1.3,
          0.75,
          0.045,
          "#d4c699",
          false,
          ring,
        );
      } else
        this.cube("beacon", 0, 1, 0, 0.25, 2, 0.25, "#d4c699", false, ring);
      this.rings.push(ring);
    }
  }
  remember(g: Game) {
    this.previousShells = new Map(
      g.artillery.shells.map((s) => [s.id, { x: s.x, y: s.y, z: s.z }]),
    );
    this.previous = g.players.map((p) => ({ x: p.x, y: p.y, z: p.z }));
    this.previousProjectiles = new Map(
      g.projectiles.map((p) => [p.id, { x: p.x, y: p.y, z: p.z }]),
    );
    this.previousGrenades = new Map(
      g.grenades.map((p) => [p.id, { x: p.x, y: p.y, z: p.z }]),
    );
  }
  draw(g: Game, alpha: number, dt: number, overview = false) {
    for (const p of g.players) {
      const e = this.people[p.id],
        previous = this.previous[p.id] ?? p,
        teleported = Math.hypot(previous.x - p.x, previous.z - p.z) > 2;
      e.setPosition(
        teleported ? p.x : previous.x + (p.x - previous.x) * alpha,
        teleported ? p.y : previous.y + (p.y - previous.y) * alpha,
        teleported ? p.z : previous.z + (p.z - previous.z) * alpha,
      );
      e.setEulerAngles(0, (-p.yaw * 180) / Math.PI, 0);
      const position = e.getPosition();
      this.animateSoldier(p, position.x, position.z, dt, g.tick - 1 + alpha);
      if (p.hp <= 0) {
        e.setEulerAngles(0, (-p.yaw * 180) / Math.PI, 85);
        e.setPosition(p.x, p.y + 0.25, p.z);
      }
    }
    const objectiveRevision = g.map.destruction?.terrainRevision ?? 0;
    const positionObjectives =
      this.objectiveTerrainRevision !== objectiveRevision;
    for (let i = 0; i < this.rings.length; i++) {
      const s = g.sectors[i],
        c = s.contested
          ? "#edc76d"
          : s.owner === "blue"
            ? "#46a9d8"
            : s.owner === "red"
              ? "#de6e5f"
              : "#d4c699";
      const root = this.rings[i];
      if (g.scoring === "domination" && positionObjectives)
        root.setPosition(s.x, groundHeight(s.x, s.z, this.map) + 0.04, s.z);
      for (const child of root.children) {
        const e = child as pc.Entity;
        if (e.name !== "flagpole") e.render!.material = this.material(c);
        if (
          g.scoring === "domination" &&
          positionObjectives &&
          e.name === "boundary"
        ) {
          const local = e.getLocalPosition();
          const point = {
            x: s.x + local.x,
            z: s.z + local.z,
            y: groundHeight(s.x + local.x, s.z + local.z, g.map),
          };
          e.setLocalPosition(
            local.x,
            point.y - root.getPosition().y + 0.04,
            local.z,
          );
          e.render!.enabled = flagContains(g, point, s);
        }
      }
    }
    this.objectiveTerrainRevision = objectiveRevision;
    const p = g.players[0],
      baseView = weaponAim(p),
      view = {
        yaw: baseView.yaw + (overview ? 0 : this.cameraReaction.yaw),
        pitch: baseView.pitch + (overview ? 0 : this.cameraReaction.pitch),
      },
      d = p.command.aim ? 2.5 : 4,
      dir = {
        x: Math.sin(view.yaw) * Math.cos(view.pitch),
        y: Math.sin(view.pitch),
        z: -Math.cos(view.yaw) * Math.cos(view.pitch),
      };
    const visual = this.people[0].getPosition();
    const cameraDrop = crouchRules.drop * this.soldiers[0].crouch;
    const pivot = { x: visual.x, y: visual.y + 1.65 - cameraDrop, z: visual.z },
      desired = {
        x: visual.x - dir.x * d + Math.cos(view.yaw) * 0.65,
        y: visual.y + 2.5 - cameraDrop - dir.y * d,
        z: visual.z - dir.z * d + Math.sin(view.yaw) * 0.65,
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
    if (!overview) this.camera.rotateLocal(0, 0, this.cameraReaction.roll);
    if (overview) {
      // Opt-in observer view for reviewing whole-map layouts and bot routes.
      this.camera.camera!.projection = pc.PROJECTION_ORTHOGRAPHIC;
      this.camera.camera!.orthoHeight = this.map.depth / 2 + 5;
      this.camera.setPosition(0, 100, 0);
      this.camera.setEulerAngles(-90, 0, 0);
      this.app.scene.fog.type = "none";
    }
    this.drawProjectiles(g, alpha);
    this.drawGrenades(g, alpha);
    this.drawArtillery(g, alpha);
    this.drawSmoke(g, alpha);
    this.drawBlasts(dt);
    this.drawEnvironmentEffects(dt);
    for (const fx of this.effects) {
      fx.life -= dt;
      const size = fx.life * (fx.size ?? 0.7);
      fx.e.setLocalScale(size, size, size);
      if (fx.velocity) {
        const position = fx.e.getPosition();
        fx.velocity.y -= 10 * dt;
        fx.e.setPosition(
          position.x + fx.velocity.x * dt,
          Math.max(
            groundHeight(position.x, position.z, this.map) + 0.05,
            position.y + fx.velocity.y * dt,
          ),
          position.z + fx.velocity.z * dt,
        );
      }
    }
    this.effects = this.effects.filter((fx) => {
      if (fx.life > 0) return true;
      fx.e.destroy();
      return false;
    });
  }
  private drawGrenades(g: Game, alpha: number) {
    const active = new Set(g.grenades.map((p) => p.id));
    for (const [id, entity] of this.grenades)
      if (!active.has(id)) {
        entity.destroy();
        this.grenades.delete(id);
      }
    for (const grenade of g.grenades) {
      let entity = this.grenades.get(grenade.id);
      if (!entity) {
        entity = this.joint("grenade", this.app.root);
        const shell = new pc.Entity("grenade shell");
        shell.addComponent("render", {
          type: "sphere",
          material: this.material(
            grenade.kind === "smoke" ? "#b8b49e" : "#414d29",
          ),
        });
        shell.setLocalScale(0.24, 0.28, 0.24);
        entity.addChild(shell);
        this.cube(
          "grenade fuse",
          0,
          0.15,
          0,
          0.07,
          0.06,
          0.07,
          "#ebc77a",
          false,
          entity,
        );
        this.grenades.set(grenade.id, entity);
      }
      const previous = this.previousGrenades.get(grenade.id) ?? grenade;
      entity.setPosition(
        previous.x + (grenade.x - previous.x) * alpha,
        previous.y + (grenade.y - previous.y) * alpha,
        previous.z + (grenade.z - previous.z) * alpha,
      );
      const spin = (g.tick - grenade.bornAt + alpha) * 14;
      entity.setEulerAngles(spin, spin * 0.6, 0);
    }
  }
  private drawSmoke(g: Game, alpha: number) {
    const active = new Set(g.smokeClouds.map((s) => s.id));
    for (const [id, volume] of this.smokeVolumes)
      if (!active.has(id)) {
        volume.root.destroy();
        volume.material.destroy();
        this.smokeVolumes.delete(id);
      }
    for (const cloud of g.smokeClouds) {
      let volume = this.smokeVolumes.get(cloud.id);
      if (!volume) {
        const root = this.joint("concealing smoke cloud", this.app.root),
          material = new pc.StandardMaterial();
        material.diffuse = color("#b6b8ac");
        material.blendType = pc.BLEND_NORMAL;
        material.depthWrite = false;
        material.opacity = 0;
        material.update();
        for (let i = 0; i < 15; i++) {
          const puff = this.joint("smoke volume", root);
          puff.addComponent("render", {
            type: "sphere",
            material,
            castShadows: false,
            receiveShadows: false,
          });
        }
        volume = { root, material };
        this.smokeVolumes.set(cloud.id, volume);
      }
      const age = (g.tick - cloud.bornAt + alpha) / 30,
        density = smokeDensity(cloud, g.tick + alpha);
      const radius = smokeRules.radius * (0.3 + 0.7 * density),
        height = smokeRules.height * (0.5 + 0.5 * density);
      volume.root.setPosition(cloud.x, cloud.y, cloud.z);
      volume.material.opacity = density * 0.84;
      volume.material.update();
      for (let i = 0; i < volume.root.children.length; i++) {
        const puff = volume.root.children[i],
          angle = i * 2.4 + Math.sin(age * 0.25 + i) * 0.06;
        const ring = i < 3 ? 0 : 0.45;
        puff.setLocalPosition(
          Math.cos(angle) * radius * ring,
          Math.sin(i * 1.7) * height * 0.2,
          Math.sin(angle) * radius * ring,
        );
        const swell = 1 + Math.sin(age * 0.8 + i) * 0.06;
        puff.setLocalScale(
          radius * 1.05 * swell,
          height * 1.5 * swell,
          radius * 1.05 * swell,
        );
      }
    }
  }
  private drawArtillery(g: Game, alpha: number) {
    const markers = g.artillery.missions.map((m) => ({
      id: m.id,
      target: m.target,
      radius: m.dangerRadius ?? artilleryRules.dangerRadius,
      color: m.team === "blue" ? "#e9bb69" : "#ee795c",
    }));
    if (this.artilleryPreview)
      markers.push({
        id: -1,
        target: this.artilleryPreview.target,
        radius: artilleryRules.scatterRadius,
        color: this.artilleryPreview.valid ? "#8cdaa4" : "#db875d",
      });
    const active = new Set(markers.map((m) => m.id));
    for (const [id, entity] of this.artilleryMarkers)
      if (!active.has(id)) {
        entity.destroy();
        this.artilleryMarkers.delete(id);
      }
    for (const marker of markers) {
      let root = this.artilleryMarkers.get(marker.id);
      if (!root) {
        root = this.joint("artillery ground marker", this.app.root);
        for (let i = 0; i < 40; i++)
          this.cube(
            "warning dash",
            0,
            0,
            0,
            0.2,
            0.06,
            1.2,
            marker.color,
            false,
            root,
          );
        this.cube(
          "target beacon",
          0,
          0,
          0,
          0.16,
          4,
          0.16,
          marker.color,
          false,
          root,
        );
        this.artilleryMarkers.set(marker.id, root);
      }
      root.enabled = marker.id === -1 || Math.sin(g.tick * 0.12) > -0.5;
      for (let i = 0; i < 40; i++) {
        const angle = (i / 40) * Math.PI * 2,
          x = marker.target.x + Math.sin(angle) * marker.radius,
          z = marker.target.z + Math.cos(angle) * marker.radius;
        const dash = root.children[i] as pc.Entity;
        dash.setPosition(x, groundHeight(x, z, this.map) + 0.1, z);
        dash.setEulerAngles(0, (angle * 180) / Math.PI, 0);
        dash.render!.material = this.material(marker.color);
      }
      const beacon = root.children[40] as pc.Entity;
      beacon.setPosition(
        marker.target.x,
        groundHeight(marker.target.x, marker.target.z, this.map) + 2,
        marker.target.z,
      );
      beacon.render!.material = this.material(marker.color);
    }
    const shells = new Set(g.artillery.shells.map((s) => s.id));
    for (const [id, entity] of this.shells)
      if (!shells.has(id)) {
        entity.destroy();
        this.shells.delete(id);
      }
    for (const shell of g.artillery.shells) {
      let root = this.shells.get(shell.id);
      if (!root) {
        root = this.joint("incoming artillery shell", this.app.root);
        this.cube(
          "shell body",
          0,
          0,
          0,
          0.28,
          0.28,
          0.8,
          "#443d2a",
          false,
          root,
        );
        const trail = this.cube(
          "shell hot trail",
          0,
          0,
          1.5,
          0.16,
          0.16,
          2.4,
          "#ffc874",
          false,
          root,
        );
        trail.render!.material = this.tracerMaterial("red");
        this.shells.set(shell.id, root);
      }
      const previous = this.previousShells.get(shell.id) ?? shell;
      const x = previous.x + (shell.x - previous.x) * alpha,
        y = previous.y + (shell.y - previous.y) * alpha,
        z = previous.z + (shell.z - previous.z) * alpha;
      root.setPosition(x, y, z);
      root.lookAt(x + shell.vx, y + shell.vy, z + shell.vz);
    }
  }
  private blastEffect(at: V3, radius: number, power = 1) {
    const root = this.joint("grenade blast", this.app.root);
    root.setPosition(at.x, at.y, at.z);
    const material = (hex: string, emissive = false) => {
      const m = new pc.StandardMaterial();
      m.diffuse = color(hex);
      m.opacity = 0.7;
      m.blendType = pc.BLEND_NORMAL;
      m.depthWrite = false;
      if (emissive) {
        m.emissive = color(hex);
        m.useLighting = false;
      }
      m.update();
      return m;
    };
    const materials = [
      material("#ffc46a", true),
      material("#c9ad79", true),
      material("#756957"),
    ];
    const particle = (
      name: string,
      type: "sphere" | "cylinder",
      m: pc.StandardMaterial,
    ) => {
      const e = this.joint(name, root);
      e.addComponent("render", {
        type,
        material: m,
        castShadows: false,
        receiveShadows: false,
      });
      return e;
    };
    const flash = particle("blast flash", "sphere", materials[0]);
    const wave = particle("blast radius", "cylinder", materials[1]);
    const smoke = Array.from({ length: 9 }, (_, i) => {
      const e = particle("blast smoke", "sphere", materials[2]);
      const angle = (i / 9) * Math.PI * 2;
      e.setLocalPosition(Math.sin(angle) * 0.3, 0.1, Math.cos(angle) * 0.3);
      return e;
    });
    this.blasts.push({
      root,
      age: 0,
      radius,
      power,
      flash,
      wave,
      smoke,
      materials,
    });
    this.drawBlasts(0);
  }
  private drawBlasts(dt: number) {
    this.blasts = this.blasts.filter((blast) => {
      blast.age += dt;
      const t = blast.age;
      const life = 5 * blast.power;
      if (t >= life) {
        blast.root.destroy();
        for (const material of blast.materials) material.destroy();
        return false;
      }
      blast.flash.enabled = t < 0.25;
      const flashSize = (0.4 + t * 12) * blast.power;
      blast.flash.setLocalScale(flashSize, flashSize, flashSize);
      blast.materials[0].opacity = Math.max(0, 0.9 * (1 - t / 0.25));
      blast.wave.enabled = t < 0.6;
      const diameter = blast.radius * 2 * Math.min(1, t / 0.4);
      blast.wave.setLocalPosition(0, 0.04, 0);
      blast.wave.setLocalScale(diameter, 0.035, diameter);
      blast.materials[1].opacity = Math.max(0, 0.2 * (1 - t / 0.6));
      blast.materials[2].opacity = Math.min(0.6, t * 4) * (1 - t / life);
      for (let i = 0; i < blast.smoke.length; i++) {
        const plume = blastPlume(t, i, blast.power);
        blast.smoke[i].setLocalPosition(plume.x, plume.y, plume.z);
        blast.smoke[i].setLocalScale(plume.size, plume.height, plume.size);
      }
      for (const material of blast.materials) material.update();
      return true;
    });
  }
  private tracerMaterial(team: Team) {
    const key = `projectile-${team}`;
    if (!this.materials.has(key)) {
      const material = new pc.StandardMaterial();
      material.diffuse = color(team === "blue" ? "#8defff" : "#ffb96d");
      material.emissive = material.diffuse.clone();
      material.emissiveIntensity = 2;
      material.useLighting = false;
      material.useFog = false;
      material.update();
      this.materials.set(key, material);
    }
    return this.materials.get(key)!;
  }
  private drawProjectiles(g: Game, alpha: number) {
    const active = new Set(g.projectiles.map((p) => p.id));
    for (const [id, entity] of this.projectiles)
      if (!active.has(id)) {
        entity.destroy();
        this.projectiles.delete(id);
      }
    for (const p of g.projectiles) {
      let entity = this.projectiles.get(p.id);
      if (!entity) {
        entity = this.joint("projectile", this.app.root);
        const tracer = this.cube(
          "tracer",
          0,
          0,
          0.6,
          0.11,
          0.11,
          1.2,
          "#ffffff",
          false,
          entity,
        );
        tracer.render!.material = this.tracerMaterial(p.team);
        tracer.render!.castShadows = false;
        tracer.render!.receiveShadows = false;
        this.projectiles.set(p.id, entity);
      }
      const previous = this.previousProjectiles.get(p.id) ?? p;
      const x = previous.x + (p.x - previous.x) * alpha;
      const y = previous.y + (p.y - previous.y) * alpha;
      const z = previous.z + (p.z - previous.z) * alpha;
      entity.setPosition(x, y, z);
      entity.lookAt(x + p.vx, y + p.vy, z + p.vz);
      const trailLength = Math.min(
        1.2,
        Math.max(
          0.12,
          projectileRange - p.remaining - (projectileSpeed / 30) * (1 - alpha),
        ),
      );
      const tracer = entity.children[0];
      tracer.setLocalScale(0.11, 0.11, trailLength);
      tracer.setLocalPosition(0, 0, trailLength / 2);
    }
  }
  effect(e: Event) {
    if (e.type === "grenadeExplosion" || e.type === "artilleryImpact") {
      this.people.forEach((person, id) => {
        const p = person.getPosition();
        const distance = Math.hypot(
          p.x - e.at.x,
          p.y + 1 - e.at.y,
          p.z - e.at.z,
        );
        if (distance < e.radius * 1.8)
          this.blastFlinches.set(id, {
            tick: e.tick,
            strength:
              (1 - distance / (e.radius * 1.8)) *
              (this.ray({ x: p.x, y: p.y + 1, z: p.z }, e.at) < 0.98
                ? 0.45
                : 1),
          });
      });
    }
    if (e.type === "destruction") {
      if (e.change.kind === "rifle") {
        this.spawnDebris(e.change.at, "wood", 2, e.id, true);
      } else {
        this.spawnDebris(e.change.at, "earth", e.change.crater ? 18 : 6, e.id);
        const changed = e.change.objects.map(
          (o) => this.map.destruction!.objects[o.id],
        );
        for (const [i, object] of changed
          .filter((o) =>
            ["wood", "tree", "log", "stump"].includes(o.original.kind),
          )
          .slice(0, 4)
          .entries()) {
          const b = object.original;
          this.spawnDebris(
            {
              x: b.x,
              y:
                Math.max(
                  b.baseY ?? 0,
                  Math.min((b.baseY ?? 0) + b.h, e.change.at.y),
                ) + 0.1,
              z: b.z,
            },
            "wood",
            3,
            e.id + i,
          );
        }
        for (const [i, object] of changed
          .filter((o) => o.original.kind === "brush")
          .slice(0, 4)
          .entries()) {
          const b = object.original;
          this.spawnDebris(
            { x: b.x, y: (b.baseY ?? 0) + 0.4, z: b.z },
            "leaf",
            3,
            e.id + i,
          );
        }
      }
      return;
    }
    if (e.type === "artilleryImpact") {
      this.blastEffect(e.at, e.radius, 1.7);
      return;
    }
    if (e.type === "grenadeExplosion") {
      this.blastEffect(e.at, e.radius);
      return;
    }
    if (e.type !== "fire" && e.type !== "impact") return;
    const p = e.type === "fire" ? e.from : e.at;
    const v = this.cube(
      "spark",
      p.x,
      p.y,
      p.z,
      0.15,
      0.15,
      0.15,
      e.type === "impact" && e.hit ? "#ef8060" : "#ffe4a0",
    );
    this.effects.push({ e: v, life: 0.15 });
  }
  project(p: V3) {
    return this.camera.camera!.worldToScreen(new pc.Vec3(p.x, p.y, p.z));
  }
}
