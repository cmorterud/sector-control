import { terrainNormals } from "./terrain-shading";
import { earthPixels, earthDiffusePS, earthGlossPS, earthNormalPS } from "./environment-surface";
import { meleePose } from "./melee";
import { characterGeometry, type CharacterShape } from "./character-geometry";
import { RagdollPhysics, type Ragdoll, type RagdollPart } from "./ragdoll";
import { detailedRifleParts, detailedBoltParts, boltGrip, rifleGeometry, rifleSurfacePixels, rifleTextureSize, type RifleShape } from "./rifle-geometry";
import { armLengths, weaponMount, boltMotion } from "./weapons";
import {
  groundSurfacePixels,
  groundPuddles,
  groundRubble,
} from "./ground-surface";
import {
  soldierStyle,
  reloadMotion,
  chargePresentation,
  throwPresentation,
  casualtyRules,
} from "./soldier-presentation";
import {
  surfacePixels,
  dustPixels,
  overcastPixels,
  maxBlastClouds,
  type SurfaceKind,
} from "./battlefield-look";
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
import { firstPersonView, sighted, sightHeight, viewWeaponPosition, weaponPullback, barrelEnd } from "./player-view";
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
import { scarRubble } from "./terrain-relief";
import { treeHasCrown } from "./vegetation";
import { battlefieldProps, trenchRoots } from "./battlefield-dressing";
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
  mantleProgress,
  smooth,
  hopSpeed,
  hopGravity,
  rifleHeight,
} from "./simulation";
const color = (hex: string) => new pc.Color().fromString(hex);
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const supportUpperLength = armLengths.upper;
const supportForearmLength = armLengths.forearm;
type SoldierRig = {
  body: pc.Entity;
  hips: pc.Entity;
  upper: pc.Entity;
  legs: { hip: pc.Entity; knee: pc.Entity; ankle: pc.Entity }[];
  arms: { shoulder: pc.Entity; elbow: pc.Entity }[];
  rifle: pc.Entity;
  supportHand: pc.Entity;
  bolt: pc.Entity;
  magazine: pc.Entity;
  reloadMagazine: pc.Entity;
  magazineScale: pc.Vec3;
  reloadMagazineScale: pc.Vec3;
  style: ReturnType<typeof soldierStyle>;
  forward: number;
  sideways: number;
  deathAt: number | null;
  remnantCreated: boolean;
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
type FirstPersonRig = Pick<SoldierRig,
  "arms" | "rifle" | "supportHand" | "bolt" | "magazine" | "reloadMagazine"
> & { root: pc.Entity; grenade: pc.Entity; explosive: pc.Entity; smoke: pc.Entity; pullback: number };

export class Renderer implements CollisionWorld {
  app: pc.Application;
  camera: pc.Entity;
  cameraReaction = { pitch: 0, yaw: 0, roll: 0 };
  private boardBatch = -1;
  private blastFlinches = new Map<number, { tick: number; strength: number }>();
  private boardVisuals: { root: pc.Entity; x: number; z: number }[] = [];
  people: pc.Entity[] = [];
  private soldiers: SoldierRig[] = [];
  private firstPersonRig?: FirstPersonRig;
  private ragdollPhysics?: RagdollPhysics;
  private activeGame?: Game;
  private deathHits = new Map<number, pc.Vec3>();
  rings: pc.Entity[] = [];
  private objectiveTerrainRevision = -1;
  effects: { e: pc.Entity; life: number; velocity?: V3; size?: number }[] = [];
  private fallingTrees: FallingTree[] = [];
  private fragments: { entity: pc.Entity; state: Debris }[] = [];
  materials = new Map<string, pc.StandardMaterial>();
  private textures = new Map<string, pc.Texture>();
  private kitMeshes = new Map<string, pc.Mesh>();
  private overcastSky?: pc.Entity;
  private blastSequence = 0;
  previous: V3[] = [];
  private casualties: {
    entity: pc.Entity;
    mesh: pc.Mesh;
    skin: pc.SkinInstance;
    ragdoll: Ragdoll;
    bones: pc.Entity[];
    x: number;
    z: number;
    age: number;
  }[] = [];
  soldierStats = {
    collapses: 0,
    remnants: 0,
    expired: 0,
    evicted: 0,
    peakRemnants: 0,
  };
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
    seed: number;
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
  private waterMeshes: pc.Mesh[] = [];
  private groundDecor: {
    root: pc.Entity;
    x: number;
    z: number;
    radius: number;
    batched?: boolean;
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
    const trenches = map.id !== "industrial";
    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);
    this.app.scene.ambientLight = color(trenches ? "#98a4af" : "#899294");
    this.app.scene.fog.type = "linear";
    this.app.scene.fog.color = color(trenches ? "#a4b0b7" : "#9ca6a5");
    this.app.scene.fog.start = trenches ? 48 : 35;
    this.app.scene.fog.end = trenches ? 175 : 115;
    this.camera = new pc.Entity("camera");
    this.camera.addComponent("camera", {
      clearColor: color(trenches ? "#a4b0b7" : "#9ca6a5"),
      fov: 70,
      nearClip: 0.08,
      farClip: trenches ? 210 : 180,
    });
    this.app.root.addChild(this.camera);
    const sun = new pc.Entity("sun");
    sun.addComponent("light", {
      type: "directional",
      color: color(trenches ? "#e2e8ed" : "#ffdfa8"),
      intensity: trenches ? 0.85 : 1.5,
      shadowIntensity: trenches ? 0.65 : 1,
      shadowType: trenches ? pc.SHADOW_PCF5 : pc.SHADOW_PCF3,
      castShadows: true,
      shadowDistance: trenches ? 50 : 65,
      shadowResolution: 2048,
      shadowBias: 0.25,
      normalOffsetBias: 0.05,
    });
    sun.setEulerAngles(45, -35, 0);
    this.app.root.addChild(sun);
    if (trenches) this.buildOvercastSky();
    this.buildMap();
    window.addEventListener("resize", () => this.app.resizeCanvas());
    // Simulation calls collision queries synchronously; no automatic physics advancement.
    this.app.systems.rigidbody!.timeScale = 0;
    this.app.start();
  }
  private buildMap() {
    const map = this.map;
    const trenches = map.id !== "industrial";
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
    for (const [index, crater] of terrain.craters.entries()) {
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
      const scar = terrain.shellScars?.[index] ?? {
        ...crater,
        radiusX: crater.radius,
        radiusZ: crater.radius,
        depth: crater.depth ?? 0.6,
      };
      for (const clod of scarRubble(scar)) {
        const part = this.cube(
          "crater rubble",
          clod.x,
          groundHeight(clod.x, clod.z, this.map) + clod.h / 2 - 0.025,
          clod.z,
          clod.w,
          clod.h,
          clod.d,
          "#70624c",
        );
        part.render!.type = "sphere";
        part.setLocalEulerAngles(0, clod.yaw, 0);
      }
    }
    this.worldParent = this.mapRoot;
    this.buildGroundDressing();
    this.batchGroup = this.boardBatch;
    for (const prop of battlefieldProps(this.map)) {
      const root = this.joint(
        "abandoned trench equipment",
        this.mapRoot,
        prop.x,
        prop.y,
        prop.z,
      );
      root.setLocalEulerAngles(0, prop.yaw, 0);
      this.groundDecor.push({
        root,
        x: prop.x,
        z: prop.z,
        radius: 0.7,
        batched: true,
      });
      if (prop.kind === "helmet") {
        const dome = this.cube(
          "discarded helmet",
          0,
          0.09,
          0,
          0.32,
          0.16,
          0.34,
          "#555844",
          false,
          root,
        );
        dome.render!.type = "sphere";
        this.cube(
          "helmet brim",
          0,
          0.025,
          0,
          0.4,
          0.025,
          0.42,
          "#484c3e",
          false,
          root,
        );
      } else if (prop.kind === "pack") {
        this.cube(
          "discarded pack",
          0,
          0.09,
          0,
          0.34,
          0.16,
          0.4,
          "#625b46",
          false,
          root,
        );
        this.cube(
          "pack strap",
          0.07,
          0.174,
          0,
          0.045,
          0.012,
          0.42,
          "#433e30",
          false,
          root,
        );
      } else {
        for (let i = 0; i < 3; i++) {
          const plank = this.cube(
            "wood",
            (i - 1) * 0.12,
            0.025 + i * 0.018,
            0,
            0.13,
            0.04,
            0.7 + i * 0.12,
            "#665943",
            false,
            root,
          );
          plank.setLocalEulerAngles(0, i * 31 - 20, 0);
        }
      }
    }
    for (const root of trenchRoots(this.map)) {
      const group = this.joint("exposed bank roots", this.mapRoot);
      this.groundDecor.push({ root: group, x: root.x, z: root.z, radius: 0.6, batched: true });
      for (let i = 1; i < root.points.length; i++) {
        const a = root.points[i - 1], b = root.points[i];
        const direction = new pc.Vec3(b.x - a.x, b.y - a.y, b.z - a.z);
        const part = this.cube("exposed root", (a.x+b.x)/2, (a.y+b.y)/2, (a.z+b.z)/2,
          0.018 - i * 0.002, direction.length(), 0.018 - i * 0.002, "#4b4031", false, group);
        part.setLocalRotation(new pc.Quat().setFromDirections(pc.Vec3.UP, direction));
        part.render!.castShadows = false;
      }
    }
    for (const b of duckboards(this.map)) {
      const root = this.joint("duckboard walkway", this.mapRoot, b.x, 0, b.z);
      for (let i = 0; i < 9; i++) {
        const wear = Math.sin(b.x * 19 + b.z * 31 + i * 13);
        const plank = this.cube("duckboard", wear * 0.025, 0.025, (i - 4) * 0.2,
          1.22 + wear * 0.06, 0.045, 0.17, i % 3 ? "#74644e" : "#625542", false, root);
        plank.setLocalEulerAngles(0, wear * 1.5, 0);
      }
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
    for (const mesh of this.waterMeshes) mesh.destroy();
    this.waterMeshes = [];
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
    const normals = terrainNormals(this.map, data, pc.calculateNormals(data.positions, data.indices));
    mesh.setNormals(normals);
    mesh.setUvs(0, data.uvs);
    if (this.map.terrain)
      mesh.setVertexStream(
        pc.SEMANTIC_TANGENT,
        pc.calculateTangents(data.positions, normals, data.uvs, data.indices),
        4,
      );
    mesh.setColors(data.colors);
    mesh.setIndices(data.indices);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    const material = this.map.terrain
      ? this.surfaceMaterial("mud", "#ffffff")
      : this.material("#ffffff");
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
      crown: stage === 0 && treeHasCrown(b),
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
      if (kind === "earth" && count >= 12) {
        state.velocity.y *= 1.45;
        state.life = 3;
      }
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
          : kind === "stone"
            ? i % 2
              ? "#9a8e7c"
              : "#756a5e"
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
    const signature = JSON.stringify([
      object.stage,
      b.baseY,
      b.w,
      b.h,
      b.d,
      b.treeStyle,
    ]);
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
        type: "sphere" | "cylinder" | "plane",
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
            object.stage ? "#4c3c2c" : b.treeStyle ? "#4f473d" : "#66503a",
          );
      }
      if (b.kind === "tree") {
        const bare = !treeHasCrown(b);
        for (let i = 0; i < (b.treeStyle === "bare" ? 5 : 2); i++) {
          const side = i % 2 ? 1 : -1;
          const branch = primitive(
            "tree branch",
            "cylinder",
            b.x + side * h * 0.09,
            base + h * (0.43 + (i % 3) * 0.14),
            b.z,
            b.w * 0.35,
            h * (bare ? 0.26 : 0.42),
            b.w * 0.35,
            bare ? "#51473a" : "#5a4833",
          );
          branch.setLocalEulerAngles(
            0,
            (seed + i * 73) % 180,
            side * (38 + (i % 3) * 11),
          );
        }
        if (b.treeStyle) {
          for (let i = 0; i < 4; i++) {
            const angle = ((seed + i * 90) * Math.PI) / 180;
            const rootPart = primitive(
              "exposed root",
              "cylinder",
              b.x + Math.sin(angle) * b.w * 0.6,
              base + 0.07,
              b.z + Math.cos(angle) * b.w * 0.6,
              0.14,
              0.65 + (i % 2) * 0.25,
              0.12,
              "#51483b",
            );
            rootPart.setLocalEulerAngles(83, seed + i * 90, 0);
          }
          for (let i = 0; i < 3; i++) {
            const tip = this.cube(
              "splintered tree tip",
              b.x + (i - 1) * b.w * 0.2,
              base + h - 0.1,
              b.z,
              b.w * 0.16,
              0.25 + (i % 2) * 0.16,
              b.d * 0.32,
              i % 2 ? "#76644a" : "#504334",
              false,
              root,
            );
            tip.setLocalEulerAngles(
              (seed + i * 11) % 20,
              seed % 180,
              i * 9 - 8,
            );
          }
        }
        if (object.stage === 0 && treeHasCrown(b))
          for (let i = 0; i < (b.treeStyle === "sparse" ? 2 : 3); i++) {
            const sparse = b.treeStyle === "sparse";
            primitive(
              "tree crown",
              "sphere",
              b.x + Math.sin(seed + i * 2.4) * b.h * (sparse ? 0.06 : 0.1),
              base + b.h * (sparse ? 0.66 + i * 0.09 : 0.62 + (i % 2) * 0.12),
              b.z + Math.cos(seed + i * 2.4) * b.h * (sparse ? 0.06 : 0.1),
              b.h * (sparse ? 0.3 : 0.5),
              b.h * (sparse ? 0.38 : 0.7),
              b.h * (sparse ? 0.3 : 0.5),
              sparse
                ? i % 2
                  ? "#68674c"
                  : "#555b43"
                : i % 2
                  ? "#666b42"
                  : "#56613d",
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
    if (["masonry", "concrete", "rubble", "gun"].includes(b.kind)) {
      const tint =
        b.kind === "masonry"
          ? object.stage
            ? "#75584a"
            : "#94705a"
          : b.kind === "rubble"
            ? "#82766a"
            : b.kind === "gun"
              ? "#424b43"
              : "#8b8c80";
      const solid = this.cube(
        b.kind,
        b.x,
        base + h / 2,
        b.z,
        b.w,
        h,
        b.d,
        tint,
        true,
        root,
      );
      if (b.kind === "gun") {
        solid.render!.enabled = false;
        const primitive = (
          name: string,
          type: "cylinder" | "box",
          x: number,
          y: number,
          z: number,
          w: number,
          height: number,
          d: number,
          tint: string,
        ) => {
          const e = this.cube(name, x, y, z, w, height, d, tint, false, root);
          e.render!.type = type;
          return e;
        };
        for (const dz of [-0.72, 0.72]) {
          const wheel = primitive(
            "gun wheel",
            "cylinder",
            b.x + 0.4,
            base + 0.52,
            b.z + dz,
            1.05,
            0.16,
            1.05,
            "#554b3c",
          );
          wheel.setLocalEulerAngles(90, 0, 0);
          this.cube(
            "gun trail",
            b.x + 0.65,
            base + 0.2,
            b.z + dz * 0.5,
            1.8,
            0.16,
            0.14,
            "#4b5142",
            false,
            root,
          );
        }
        const barrel = primitive(
          "abandoned gun barrel",
          "cylinder",
          b.x - 0.35,
          base + h * 0.78,
          b.z,
          0.22,
          2.9,
          0.22,
          "#37433d",
        );
        barrel.setLocalEulerAngles(0, 0, 94);
        this.cube(
          "gun shield",
          b.x - 0.3,
          base + h * 0.52,
          b.z,
          0.12,
          h * 0.78,
          1.55,
          "#4a5547",
          false,
          root,
        );
      } else if (b.kind !== "rubble") {
        const alongX = b.w > b.d;
        const rows = Math.min(
          9,
          Math.floor(h / (b.kind === "masonry" ? 0.4 : 0.65)),
        );
        for (let row = 1; row <= rows; row++) {
          const y = base + (row * h) / (rows + 1);
          this.cube(
            "weathered mortar",
            b.x,
            y,
            b.z,
            b.w + 0.012,
            0.018,
            b.d + 0.012,
            b.kind === "masonry" ? "#5c5145" : "#60665e",
            false,
            root,
          );
          if (b.kind === "masonry") {
            const offset = (row % 2 ? 0.22 : -0.22) * Math.max(b.w, b.d);
            this.cube(
              "broken brick joint",
              b.x + (alongX ? offset : 0),
              y - (h / (rows + 1)) * 0.45,
              b.z + (!alongX ? offset : 0),
              alongX ? 0.018 : b.w + 0.015,
              (h / (rows + 1)) * 0.8,
              alongX ? b.d + 0.015 : 0.018,
              "#64584a",
              false,
              root,
            );
          }
        }
      } else {
        this.cube(
          "broken rubble cap",
          b.x - b.w * 0.12,
          base + h + 0.035,
          b.z + b.d * 0.1,
          b.w * 0.48,
          0.07,
          b.d * 0.55,
          "#a09380",
          false,
          root,
        );
      }
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
      const wear = [...object.id].reduce((n, c) => n + c.charCodeAt(0), 0);
      for (const dz of [-b.d / 2 + 0.08, b.d / 2 - 0.08]) {
        const postHeight = object.lining
          ? h * (0.9 + (wear % 7) * 0.01)
          : h + 0.06;
        this.cube(
          "wood post",
          b.x,
          base + postHeight / 2,
          b.z + dz,
          b.w + 0.05,
          postHeight,
          0.12,
          "#493d2f",
          false,
          root,
        );
        if (object.lining)
          this.cube(
            "split post tip",
            b.x,
            base + postHeight - 0.025,
            b.z + dz,
            b.w * 0.4,
            0.12,
            0.06,
            "#8a7553",
            false,
            root,
            wear % 2 ? 12 : -12,
          );
      }
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
    let decorChanged = false;
    if (change.crater)
      for (const decor of this.groundDecor)
        if (
          decor.root.enabled &&
          Math.hypot(decor.x - change.at.x, decor.z - change.at.z) <
            decor.radius + change.crater.radius
        ) {
          decor.root.enabled = false;
          decorChanged ||= !!decor.batched;
        }
    if (decorChanged) this.app.batcher!.generate([this.boardBatch]);
  }
  private texture(
    name: string,
    width: number,
    height: number,
    pixels: () => Uint8Array,
    repeat = true,
  ) {
    if (!this.textures.has(name)) {
      const t = new pc.Texture(this.app.graphicsDevice, {
        name,
        width,
        height,
        format: pc.PIXELFORMAT_RGBA8,
        mipmaps: true,
        minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
        magFilter: pc.FILTER_LINEAR,
        anisotropy: 4,
        addressU: repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE,
        addressV: repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE,
      });
      (t.lock() as Uint8Array).set(pixels());
      t.unlock();
      this.textures.set(name, t);
    }
    return this.textures.get(name)!;
  }
  private surfaceMaterial(kind: SurfaceKind, tint: string) {
    const key = `surface-${kind}-${tint}`;
    if (!this.materials.has(key)) {
      const ground = kind === "mud";
      const size = ground ? 1024 : 512;
      if (!this.textures.has(`${kind}-diffuse`)) {
        const data = ground
          ? groundSurfacePixels(this.map, size)
          : surfacePixels(kind, size);
        for (const channel of ["diffuse", "normal", "gloss"] as const)
          this.texture(
            `${kind}-${channel}`,
            size,
            size,
            () => data[channel],
            !ground,
          );
      }
      const m = new pc.StandardMaterial();
      m.diffuse = color(tint);
      m.diffuseMap = this.textures.get(`${kind}-diffuse`)!;
      // Authored color texels are sRGB; decode both terrain layers in hardware.
      // Normal/roughness textures remain linear data.
      if (ground) m.diffuseMap.srgb = true;
      m.normalMap = this.textures.get(`${kind}-normal`)!;
      m.bumpiness = ground ? 0.4 : 0.7;
      m.glossMap = this.textures.get(`${kind}-gloss`)!;
      m.glossMapChannel = "r";
      // Broad soil highlights must not bleach an entire bank as its normal
      // turns toward the sun. Separate puddles retain their glossy water finish.
      m.gloss = ground ? 0.35 : 0.6;
      m.specular = color(ground ? "#343b30" : "#252728");
      if (ground) {
        for (const channel of ["diffuse", "normal", "gloss"] as const) {
          m[`${channel}MapTiling`].set(3 / this.map.width, 3 / this.map.depth);
          m[`${channel}MapOffset`].set(0.5, 0.5);
        }
        const earth = earthPixels();
        const earthDiffuse = this.texture("earth-diffuse", 512, 512, () => earth.diffuse);
        earthDiffuse.srgb = true;
        m.setParameter("earthDiffuse", earthDiffuse);
        m.setParameter("earthNormal", this.texture("earth-normal", 512, 512, () => earth.normal));
        m.getShaderChunks().set("diffusePS", earthDiffusePS);
        m.getShaderChunks().set("glossPS", earthGlossPS);
        m.getShaderChunks().set("normalMapPS", earthNormalPS);
      }
      m.update();
      this.materials.set(key, m);
    }
    return this.materials.get(key)!;
  }
  private buildGroundDressing() {
    this.batchGroup = this.boardBatch;
    for (const [i, b] of groundRubble(this.map).entries()) {
      const root = this.joint("worn-route rubble", this.mapRoot);
      this.worldParent = root;
      const part = this.cube(
        "earth and stone",
        b.x,
        b.y + b.h / 2,
        b.z,
        b.w,
        b.h,
        b.d,
        i % 3 ? "#6f6551" : "#8a7b61",
      );
      part.render!.type = "sphere";
      part.setLocalEulerAngles(0, b.yaw, 0);
      part.render!.castShadows = false;
      this.groundDecor.push({
        root,
        x: b.x,
        z: b.z,
        radius: 0.35,
        batched: true,
      });
    }
    this.worldParent = this.mapRoot;
    this.batchGroup = -1;
    let material = this.materials.get("shallow muddy water");
    if (!material) {
      material = new pc.StandardMaterial();
      material.diffuse = color("#41483c");
      material.specular = color("#afc1c4");
      material.gloss = 0.92;
      material.emissive = color("#121a1c");
      material.update();
      this.materials.set("shallow muddy water", material);
    }
    for (const p of groundPuddles(this.map)) {
      const root = this.joint("shallow puddle", this.mapRoot);
      const mesh = new pc.Mesh(this.app.graphicsDevice);
      mesh.setPositions(p.positions);
      mesh.setNormals(p.positions.map((_, i) => (i % 3 === 1 ? 1 : 0)));
      mesh.setIndices(p.indices);
      mesh.update(pc.PRIMITIVE_TRIANGLES);
      const instance = new pc.MeshInstance(mesh, material, root);
      instance.castShadow = false;
      root.addComponent("render", { meshInstances: [instance] });
      this.waterMeshes.push(mesh);
      this.groundDecor.push({ root, x: p.x, z: p.z, radius: p.radius });
    }
  }
  private buildOvercastSky() {
    const sky = new pc.Entity("overcast sky");
    const m = new pc.StandardMaterial();
    m.diffuse = color("#000000");
    m.emissive = color("#ffffff");
    m.emissiveMap = this.texture("overcast", 512, 256, () => overcastPixels());
    m.useLighting = false;
    m.useFog = false;
    m.depthWrite = false;
    m.cull = pc.CULLFACE_FRONT;
    m.update();
    this.materials.set("overcast", m);
    sky.addComponent("render", {
      type: "sphere",
      material: m,
      castShadows: false,
      receiveShadows: false,
    });
    sky.setLocalScale(300, 300, 300);
    this.app.root.addChild(sky);
    this.overcastSky = sky;
  }
  private dustMaterial(hex: string) {
    const m = new pc.StandardMaterial();
    m.diffuse = color("#000000");
    m.emissive = color(hex);
    const texture = this.texture("dust", 128, 128, () => dustPixels(), false);
    m.emissiveMap = texture;
    m.opacityMap = texture;
    m.opacityMapChannel = "a";
    m.blendType = pc.BLEND_NORMAL;
    m.depthWrite = false;
    m.cull = pc.CULLFACE_NONE;
    m.useLighting = false;
    m.opacity = 0;
    m.update();
    return m;
  }
  private faceCamera(entity: pc.Entity, roll = 0) {
    entity.setRotation(this.camera.getRotation());
    entity.rotateLocal(90, 0, 0);
    entity.rotateLocal(0, roll, 0);
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
      material:
        this.map.terrain && ["wood", "wood post", "duckboard"].includes(name)
          ? this.surfaceMaterial("wood", c)
          : this.material(c),
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
  private organic(
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    tint: string,
    parent: pc.Entity,
    shape: CharacterShape = "soft",
  ) {
    const entity = this.cube(name, x, y, z, w, h, d, tint, false, parent);
    if (this.app.graphicsDevice && entity.render) {
      this.kitMeshes ??= new Map();
      const key = `organic-${shape}`;
      if (!this.kitMeshes.has(key)) {
        const data = characterGeometry(shape),
          mesh = new pc.Mesh(this.app.graphicsDevice);
        mesh.setPositions(data.positions);
        mesh.setNormals(data.normals);
        mesh.setIndices(data.indices);
        mesh.update(pc.PRIMITIVE_TRIANGLES);
        mesh.incRefCount();
        this.kitMeshes.set(key, mesh);
      }
      entity.render.meshInstances = [
        new pc.MeshInstance(
          this.kitMeshes.get(key)!,
          this.material(tint),
          entity,
        ),
      ];
    }
    return entity;
  }
  private riflePart(
    name: string, x: number, y: number, z: number,
    w: number, h: number, d: number, tint: string,
    parent: pc.Entity, shape: RifleShape,
  ) {
    const base = tint === "walnut" ? "#715037" : tint === "edge" ? "#858d85" : tint === "dark" ? "#151b1c" : "#353c3a";
    const entity = this.cube(name, x, y, z, w, h, d, base, false, parent);
    if (!this.app.graphicsDevice || !entity.render) return entity;
    const key = `rifle-${shape}`;
    if (!this.kitMeshes.has(key)) {
      const data = rifleGeometry(shape), mesh = new pc.Mesh(this.app.graphicsDevice);
      mesh.setPositions(data.positions); mesh.setNormals(data.normals);
      mesh.setUvs(0, data.uvs); mesh.setIndices(data.indices);
      mesh.update(pc.PRIMITIVE_TRIANGLES); mesh.incRefCount();
      this.kitMeshes.set(key, mesh);
    }
    const materialKey = `rifle-material-${tint}`;
    let material = this.materials.get(materialKey);
    if (!material) {
      material = new pc.StandardMaterial();
      material.diffuse = color(base);
      material.gloss = tint === "walnut" ? 0.38 : tint === "dark" ? 0.12 : 0.6;
      material.specular = color(tint === "walnut" ? "#514439" : tint === "dark" ? "#252b2b" : "#8c9897");
      if (tint === "walnut" || tint === "steel") {
        const kind = tint === "walnut" ? "walnut" : "steel";
        const texture = new pc.Texture(this.app.graphicsDevice, {
          name: `rifle ${kind}`, width: rifleTextureSize, height: rifleTextureSize,
          format: pc.PIXELFORMAT_RGBA8, mipmaps: true,
          minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR,
          addressU: pc.ADDRESS_REPEAT, addressV: pc.ADDRESS_REPEAT,
        });
        (texture.lock() as Uint8Array).set(rifleSurfacePixels(kind)); texture.unlock();
        this.textures.set(materialKey, texture);
        material.diffuseMap = texture;
        material.diffuse = new pc.Color(1, 1, 1);
      }
      material.update(); this.materials.set(materialKey, material);
    }
    entity.render.meshInstances = [new pc.MeshInstance(this.kitMeshes.get(key)!, material, entity)];
    return entity;
  }
  private createSoldier(p: Soldier) {
    const root = this.joint(`soldier-${p.id}`, this.app.root);
    root.setPosition(p.x, p.y, p.z);
    root.setEulerAngles(0, (-p.yaw * 180) / Math.PI, 0);
    const body = this.joint("body", root, 0, 0.94);
    const hips = this.joint("hips", body);
    const upper = this.joint("upper body", body, 0, 0.08);
    const shirt = p.team === "blue" ? "#597f91" : "#9f685a";
    const trousers = p.team === "blue" ? "#4d5853" : "#62594b";
    const equipment = "#68634d",
      skin = "#bba185",
      leather = "#403b30";
    const part = (
      name: string,
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      c: string,
      parent: pc.Entity,
      shape: CharacterShape = "soft",
    ) => this.organic(name, x, y, z, w, h, d, c, parent, shape);
    part("pelvis", 0, -0.015, 0, 0.43, 0.24, 0.3, trousers, hips);
    part("torso", 0, 0.25, 0, 0.55, 0.55, 0.34, shirt, upper, "tunic");
    part("vest", 0, 0.27, -0.166, 0.39, 0.34, 0.035, equipment, upper, "tunic");
    part(
      "backpack",
      0,
      0.27,
      0.22,
      0.32,
      0.36,
      0.17,
      equipment,
      upper,
      "tunic",
    );
    part("neck", 0, 0.53, 0, 0.13, 0.17, 0.14, skin, upper, "limb");
    part("head", 0, 0.66, -0.005, 0.255, 0.32, 0.27, skin, upper, "head");
    part("nose", 0, 0.665, -0.145, 0.043, 0.067, 0.075, skin, upper);
    part("chin", 0, 0.55, -0.075, 0.14, 0.075, 0.12, skin, upper);
    for (const side of [-1, 1]) {
      part("ear", side * 0.131, 0.665, 0, 0.045, 0.085, 0.06, skin, upper);
      part(
        "eye",
        side * 0.052,
        0.695,
        -0.132,
        0.025,
        0.012,
        0.012,
        "#444236",
        upper,
      );
    }
    const helmetTint = p.team === "blue" ? "#586c68" : "#796d57";
    part("helmet", 0, 0.83, 0, 0.375, 0.2, 0.395, helmetTint, upper, "helmet");
    part(
      "helmet brim",
      0,
      0.752,
      -0.012,
      0.465,
      0.035,
      0.475,
      helmetTint,
      upper,
      "disc",
    );
    part(
      "helmet band",
      0,
      0.77,
      0,
      0.378,
      0.028,
      0.398,
      leather,
      upper,
      "disc",
    );
    part("web belt", 0, 0.025, 0, 0.56, 0.075, 0.38, equipment, upper, "disc");
    for (const side of [-1, 1]) {
      part(
        "webbing strap",
        side * 0.16,
        0.28,
        -0.169,
        0.038,
        0.41,
        0.027,
        "#8b8061",
        upper,
        "limb",
      );
      part(
        "ammunition pouch",
        side * 0.2,
        0.07,
        -0.205,
        0.12,
        0.16,
        0.1,
        "#817152",
        upper,
        "tunic",
      );
    }
    part("pack flap", 0, 0.405, 0.29, 0.29, 0.1, 0.04, "#8a8166", upper);
    const blanket = part(
      "rolled blanket",
      0,
      0.52,
      0.23,
      0.13,
      0.42,
      0.13,
      "#79745d",
      upper,
      "limb",
    );
    blanket.setLocalEulerAngles(0, 0, 90);
    const legs = [-1, 1].map((side) => {
      const hip = this.joint("hip", hips, side * 0.145);
      part("thigh", 0, -0.21, 0, 0.225, 0.46, 0.25, trousers, hip, "limb");
      const knee = this.joint("knee", hip, 0, -0.42);
      part("knee joint", 0, 0, 0, 0.185, 0.18, 0.2, trousers, knee);
      part("shin", 0, -0.185, 0, 0.17, 0.4, 0.2, trousers, knee, "limb");
      part("puttee", 0, -0.23, 0, 0.19, 0.29, 0.215, "#77715a", knee, "limb");
      const ankle = this.joint("ankle", knee, 0, -0.4);
      part("boot", 0, -0.04, -0.065, 0.205, 0.145, 0.32, leather, ankle);
      return { hip, knee, ankle };
    });
    const arms = [-1, 1].map((side) => {
      const support = side < 0;
      const shoulder = this.joint(
        "shoulder",
        upper,
        support ? -0.27 : 0.29,
        0.41,
        support ? -0.12 : 0,
      );
      part("shoulder cap", 0, 0, 0, 0.195, 0.18, 0.21, shirt, shoulder);
      part(
        "upper arm",
        0,
        -armLengths.upper / 2,
        0,
        0.18,
        armLengths.upper + 0.045,
        0.2,
        shirt,
        shoulder,
        "limb",
      );
      part(
        "team armband",
        0,
        -0.12,
        0,
        0.185,
        0.065,
        0.205,
        p.team === "blue" ? "#428fae" : "#b45e4c",
        shoulder,
        "disc",
      );
      const elbow = this.joint("elbow", shoulder, 0, -armLengths.upper);
      part("elbow joint", 0, 0, 0, 0.15, 0.145, 0.17, shirt, elbow);
      part(
        "forearm",
        0,
        -armLengths.forearm / 2,
        0,
        0.145,
        armLengths.forearm + 0.04,
        0.17,
        shirt,
        elbow,
        "limb",
      );
      if (!support)
        part(
          "hand",
          0,
          -armLengths.forearm,
          0,
          0.115,
          0.15,
          0.145,
          skin,
          elbow,
        );
      return { shoulder, elbow };
    });
    const rifle = this.joint(
      "weapon",
      upper,
      weaponMount.x,
      weaponMount.y,
      weaponMount.z,
    );
    const service = p.weapon === "serviceRifle",
      gunner = p.weapon === "machineGun";
    if (service) {
      for (const spec of detailedRifleParts) {
        const piece = this.riflePart(spec.name, ...spec.at, ...spec.size, spec.tint, rifle, spec.shape);
        if (spec.rotation) piece.setLocalEulerAngles(...spec.rotation);
      }
      this.cube("ejection port", 0.01, 0.063, 0.04, 0.04, 0.005, 0.12, "#151b1c", false, rifle);
      const trigger = this.cube("curved trigger", 0, -0.085, 0.165, 0.008, 0.043, 0.012, "#626961", false, rifle);
      trigger.setLocalEulerAngles(-18, 0, 0);
    } else if (gunner) {
      const stock = part(
        "wooden stock",
        0,
        -0.045,
        0.04,
        0.105,
        0.94,
        0.14,
        "#715037",
        rifle,
        "stock",
      );
      stock.setLocalEulerAngles(90, 0, 0);
      const receiver = part(
        "receiver",
        0,
        0.025,
        0.04,
        0.075,
        0.34,
        0.075,
        "#353c3a",
        rifle,
        "disc",
      );
      receiver.setLocalEulerAngles(90, 0, 0);
      const barrel = part(
        "barrel",
        0,
        0.025,
        gunner ? -0.55 : -0.53,
        gunner ? 0.09 : 0.04,
        gunner ? 0.44 : 0.34,
        gunner ? 0.09 : 0.04,
        "#303735",
        rifle,
        "disc",
      );
      barrel.setLocalEulerAngles(90, 0, 0);
      for (const z of [-0.35, -0.13]) {
        const band = part(
          "barrel band",
          0,
          -0.018,
          z,
          0.105,
          0.035,
          0.13,
          "#414741",
          rifle,
          "disc",
        );
        band.setLocalEulerAngles(90, 0, 0);
      }
      const trigger = part(
        "trigger guard",
        0,
        -0.105,
        0.18,
        0.055,
        0.09,
        0.14,
        "#393d34",
        rifle,
        "disc",
      );
      trigger.setLocalEulerAngles(90, 0, 0);
      if (gunner)
        for (const side of [-1, 1])
          this.cube(
            "folded bipod",
            side * 0.07,
            -0.05,
            -0.4,
            0.025,
            0.035,
            0.4,
            "#424b48",
            false,
            rifle,
          );
    } else {
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
    }
    // A real open notch and front post share a horizontal sight line.
    this.cube("front sight", 0, sightHeight - 0.02,
      service ? -0.65 : gunner ? -0.72 : -0.54,
      0.008, 0.04, 0.018, "#202724", false, rifle);
    for (const side of [-1, 1]) {
      const ear = this.cube("rear sight ear", side * 0.018, sightHeight - 0.0125,
        service ? -0.13 : 0.08, 0.008, 0.025, 0.025, "#202724", false, rifle);
      if (service && ear.render) ear.removeComponent("render");
    }
    const bridge = this.cube("rear sight bridge", 0, sightHeight - 0.0315,
      service ? -0.13 : 0.08, 0.044, 0.014, 0.025, "#202724", false, rifle);
    if (service && bridge.render) bridge.removeComponent("render");
    if (service) {
      const blade = part(
        "bayonet blade",
        0,
        -0.05,
        -0.82,
        0.025,
        0.3,
        0.045,
        "#aeb6ad",
        rifle,
        "stock",
      );
      blade.setLocalEulerAngles(90, 0, 0);
      this.cube(
        "bayonet guard",
        0,
        -0.05,
        -0.68,
        0.07,
        0.025,
        0.025,
        "#565d53",
        false,
        rifle,
      );
    }
    const bolt = this.joint("bolt", rifle, 0.05, 0.045, 0.13);
    if (service) {
      for (const spec of detailedBoltParts) {
        const piece = this.riflePart(spec.name, ...spec.at, ...spec.size, spec.tint, bolt, spec.shape);
        if (spec.rotation) piece.setLocalEulerAngles(...spec.rotation);
      }
      this.cube("safety lever", -0.05, 0.048, 0.06, 0.045, 0.012, 0.012, "#70776d", false, bolt);
      this.cube("bayonet lug", 0, -0.012, -0.65, 0.028, 0.08, 0.04, "#353c3a", false, rifle);
    }
    const magazine = gunner
      ? part(
          "weapon magazine",
          0,
          0.13,
          0,
          0.32,
          0.065,
          0.32,
          "#454d3d",
          rifle,
          "disc",
        )
      : this.cube(
          "weapon magazine",
          0,
          service ? -0.085 : -0.16,
          0.14,
          service ? 0.065 : 0.1,
          service ? 0.025 : 0.23,
          0.16,
          "#343d37",
          false,
          rifle,
        );
    const reloadMagazine = service
      ? this.joint(
          "stripper clip",
          arms[1].elbow,
          0,
          -armLengths.forearm - 0.025,
          0,
        )
      : part(
          "carried magazine",
          0,
          -armLengths.forearm - 0.025,
          0,
          gunner ? 0.32 : 0.1,
          gunner ? 0.065 : 0.23,
          gunner ? 0.32 : 0.16,
          "#4e5442",
          arms[1].elbow,
          gunner ? "disc" : "soft",
        );
    if (service) {
      this.cube(
        "clip bridge",
        0,
        0,
        0,
        0.085,
        0.015,
        0.025,
        "#6f7568",
        false,
        reloadMagazine,
      );
      for (let i = 0; i < 5; i++)
        part(
          "brass cartridge",
          (i - 2) * 0.016,
          0.035,
          0,
          0.013,
          0.07,
          0.013,
          "#b29b58",
          reloadMagazine,
          "limb",
        );
    }
    const supportHand = this.joint(
      "left hand grip",
      rifle,
      -0.035,
      service ? -0.06 : -0.1,
      service ? -0.16 : -0.1,
    );
    part("left hand", 0, 0, 0, 0.115, 0.15, 0.15, skin, supportHand);
    if (this.app.graphicsDevice) this.mergeSoldierKit(upper, p);
    this.people.push(root);
    this.soldiers.push({
      body,
      hips,
      upper,
      legs,
      arms,
      rifle,
      supportHand,
      bolt,
      magazine,
      reloadMagazine,
      magazineScale: magazine.getLocalScale().clone(),
      reloadMagazineScale: reloadMagazine.getLocalScale().clone(),
      style: soldierStyle(p.id),
      forward: 0,
      sideways: 0,
      deathAt: null,
      remnantCreated: false,
      x: p.x,
      z: p.z,
      phase: p.id * 1.7,
      motion: 0,
      sprint: 0,
      crouch: 0,
      alive: p.hp > 0,
    });
  }
  private mergeSoldierKit(upper: pc.Entity, p: Soldier) {
    this.kitMeshes ??= new Map();
    const key = `${p.team}-${p.weapon}`;
    const parts = upper.children.filter(
      (e) => (e as pc.Entity).render,
    ) as pc.Entity[];
    if (!this.kitMeshes.has(key)) {
      const positions: number[] = [],
        normals: number[] = [],
        indices: number[] = [],
        colors: number[] = [];
      const basis = upper.getWorldTransform().clone().invert();
      for (const e of parts) {
        const matrix = new pc.Mat4().mul2(basis, e.getWorldTransform()),
          normalMatrix = matrix.clone().invert().transpose();
        for (const instance of e.render!.meshInstances) {
          if (!instance.mesh) continue;
          const points: number[] = [],
            ns: number[] = [],
            is: number[] = [];
          instance.mesh.getPositions(points);
          instance.mesh.getNormals(ns);
          instance.mesh.getIndices(is);
          const base = positions.length / 3,
            tint = (instance.material as pc.StandardMaterial).diffuse;
          for (let i = 0; i < points.length; i += 3) {
            const v = matrix.transformPoint(
              new pc.Vec3(points[i], points[i + 1], points[i + 2]),
            );
            positions.push(v.x, v.y, v.z);
            const n = normalMatrix
              .transformVector(new pc.Vec3(ns[i], ns[i + 1], ns[i + 2]))
              .normalize();
            normals.push(n.x, n.y, n.z);
            colors.push(tint.r ** 2.2, tint.g ** 2.2, tint.b ** 2.2, 1);
          }
          indices.push(...is.map((i) => i + base));
        }
      }
      const mesh = new pc.Mesh(this.app.graphicsDevice);
      mesh.setPositions(positions);
      mesh.setNormals(normals);
      mesh.setColors(colors);
      mesh.setIndices(indices);
      mesh.update(pc.PRIMITIVE_TRIANGLES);
      mesh.incRefCount(); // The renderer cache owns it across match restarts.
      this.kitMeshes.set(key, mesh);
    }
    for (const part of parts) part.removeComponent("render");
    let material = this.materials.get("soldier-kit");
    if (!material) {
      material = new pc.StandardMaterial();
      material.diffuse = new pc.Color(1, 1, 1);
      material.diffuseVertexColor = true;
      material.gloss = 0.1;
      material.update();
      this.materials.set("soldier-kit", material);
    }
    const instance = new pc.MeshInstance(
      this.kitMeshes.get(key)!,
      material,
      upper,
    );
    upper.addComponent("render", {
      meshInstances: [instance],
      batchGroupId: this.actorBatch,
      castShadows: true,
      receiveShadows: true,
    });
  }
  private poseArm(
    rig: Pick<SoldierRig, "arms">,
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
  private createFirstPersonRig() {
    this.firstPersonRig?.root.destroy();
    const source = this.soldiers[0];
    const root = this.joint("first-person weapon and arms", this.camera);
    const rifle = source.rifle.clone();
    root.addChild(rifle);
    const arms = source.arms.map((arm) => {
      const shoulder = arm.shoulder.clone();
      root.addChild(shoulder);
      return { shoulder, elbow: shoulder.findByName("elbow") as pc.Entity };
    });
    const grenade = this.joint("held throwable", root);
    const explosive = this.joint("held explosive", grenade), smoke = this.joint("held smoke", grenade);
    this.riflePart("held grenade shell", 0, 0.015, 0, 0.11, 0.14, 0.11, "dark", explosive, "knob");
    this.cube("held grenade lever", 0.025, 0.08, 0, 0.018, 0.08, 0.025, "#868c75", false, explosive, 15);
    this.riflePart("held grenade pin", -0.01, 0.09, 0, 0.035, 0.035, 0.012, "edge", explosive, "hood");
    this.riflePart("held smoke canister", 0, 0.025, 0, 0.085, 0.16, 0.085, "edge", smoke, "shroud");
    this.cube("held smoke cap", 0, 0.115, 0, 0.05, 0.025, 0.05, "#414d29", false, smoke);
    grenade.enabled = false;
    // These moving meshes are independent of the world actor batches.
    for (const component of root.findComponents("render") as pc.RenderComponent[]) {
      component.batchGroupId = -1;
      component.enabled = true;
      component.castShadows = false;
      for (const mesh of component.meshInstances) mesh.visible = true;
    }
    this.firstPersonRig = {
      root, rifle, arms, grenade, explosive, smoke, pullback: 0,
      supportHand: rifle.findByName("left hand grip") as pc.Entity,
      bolt: rifle.findByName("bolt") as pc.Entity,
      magazine: rifle.findByName("weapon magazine") as pc.Entity,
      reloadMagazine: arms[1].shoulder.findByName(source.reloadMagazine.name) as pc.Entity,
    };
    root.enabled = false;
  }
  private drawFirstPerson(p: Soldier, tick: number, dt = 1 / 60) {
    const rig = this.firstPersonRig;
    if (!rig) return;
    rig.root.enabled = firstPersonView(p) && !p.mantle;
    if (!rig.root.enabled) { rig.pullback = 0; rig.grenade.enabled = false; return; }
    const source = this.soldiers[0];
    const ads = sighted(p, tick);
    const charge = chargePresentation(p, tick, source.phase, source.motion);
    const throwing = throwPresentation(p, tick);
    const loading = reloadMotion(p, tick);
    const sprint = source.sprint * (1 - charge.ready) * (throwing || loading ? 0 : 1);
    const hip = viewWeaponPosition(false, p.weapon), target = viewWeaponPosition(ads, p.weapon);
    // The existing travel-driven sprint blend also shoulders the rifle smoothly
    // when aim interrupts a run; settled ADS keeps exact camera-ray alignment.
    const position = {
      x: target.x + (hip.x - target.x) * sprint,
      y: target.y + (hip.y - target.y) * sprint,
      z: target.z + (hip.z - target.z) * sprint,
    };
    const lower = loading?.lower ?? 0;
    const melee = p.melee ? meleePose(p.melee, tick) : null;
    const throwLower = throwing?.lower ?? 0;
    const sway = ads ? 0 : Math.sin(source.phase) * source.motion * 0.008;
    rig.rifle.setLocalPosition(
      position.x + sway + lower * 0.06 + sprint * (0.07 + Math.sin(source.phase) * 0.012) - charge.ready * 0.045 + charge.side * 0.016,
      position.y - lower * 0.12 - throwLower * 0.15 - sprint * 0.09 + charge.ready * 0.11 + charge.bob * 0.006,
      position.z + sprint * 0.05 + recoilPulse(p, tick) * 0.045 - (melee?.thrust ?? 0) * 0.18 - charge.ready * 0.04 + charge.bob * 0.008,
    );
    rig.rifle.setLocalEulerAngles(
      -24 * lower - throwLower * 18 - sprint * 22 + charge.ready * 4 + charge.bob * 0.8,
      10 * lower + charge.side,
      -28 * lower - sprint * 18 - charge.ready * 5 + charge.side * 1.2,
    );
    const eye = this.camera.getPosition();
    const muzzle = rig.rifle.getWorldTransform().transformPoint(new pc.Vec3(0, 0.025, barrelEnd(p.weapon)));
    let needed = weaponPullback(eye, muzzle, this.camera.forward, (a, b) => this.ray(a, b));
    if (p.weapon === "serviceRifle") {
      const tip = rig.rifle.getWorldTransform().transformPoint(new pc.Vec3(0, -0.05, -0.98));
      needed = Math.max(needed, weaponPullback(eye, tip, this.camera.forward, (a, b) => this.ray(a, b)));
    }
    // Respond immediately toward cover, settle smoothly away; no clipping lag.
    rig.pullback = Math.max(needed, rig.pullback * Math.exp(-14 * dt));
    const weapon = rig.rifle.getLocalPosition();
    rig.rifle.setLocalPosition(weapon.x, weapon.y, weapon.z + rig.pullback);
    rig.bolt.setLocalPosition(source.bolt.getLocalPosition());
    rig.bolt.setLocalRotation(source.bolt.getLocalRotation());
    rig.magazine.setLocalScale(source.magazine.getLocalScale());
    rig.reloadMagazine.setLocalScale(source.reloadMagazine.getLocalScale());
    rig.arms[0].shoulder.setLocalPosition(-0.22, -0.3, -0.12 + rig.pullback);
    rig.arms[1].shoulder.setLocalPosition(0.24, -0.3, -0.1 + (throwing ? 0 : rig.pullback));
    const left = rig.rifle.getLocalTransform().transformPoint(rig.supportHand.getLocalPosition());
    this.poseArm(rig, 0, left, armLengths.upper, armLengths.forearm);
    let right = rig.rifle.getLocalTransform().transformPoint(new pc.Vec3(0, -0.03, 0.14));
    if (loading || boltMotion(p, tick)) {
      // Reuse the actual clip/bolt hand path in the new weapon's coordinate space.
      const hand = source.arms[1].elbow.getWorldTransform()
        .transformPoint(new pc.Vec3(0, -armLengths.forearm, 0));
      const local = source.rifle.getWorldTransform().clone().invert().transformPoint(hand);
      right = rig.rifle.getLocalTransform().transformPoint(local);
    }
    if (throwing) right.lerp(right, new pc.Vec3(throwing.hand.x, throwing.hand.y, throwing.hand.z), throwing.weight);
    rig.grenade.enabled = !!throwing?.held;
    rig.explosive.enabled = !p.throwAction?.smoke;
    rig.smoke.enabled = !!p.throwAction?.smoke;
    if (throwing?.held) rig.grenade.setLocalPosition(right.x, right.y + 0.035, right.z - 0.025);
    this.poseArm(rig, 1, right, armLengths.upper, armLengths.forearm);
  }
  private animateSoldier(
    p: Soldier,
    x: number,
    z: number,
    dt: number,
    tick: number,
  ) {
    const rig = this.soldiers[p.id];
    rig.arms[0].shoulder.setLocalPosition(-0.27, 0.41, -0.12);
    rig.arms[1].shoulder.setLocalPosition(0.29, 0.41, 0);
    let magazineVisible = true,
      carryingMagazine = false;
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
    const travelForward =
      speed > 0.05
        ? (dx * Math.sin(p.yaw) - dz * Math.cos(p.yaw)) /
          Math.max(distance, 0.001)
        : 0;
    const travelSideways =
      speed > 0.05
        ? (dx * Math.cos(p.yaw) + dz * Math.sin(p.yaw)) /
          Math.max(distance, 0.001)
        : 0;
    rig.forward += (travelForward - rig.forward) * blend;
    rig.sideways += (travelSideways - rig.sideways) * blend;
    const forward = rig.forward,
      sideways = rig.sideways;
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
        moved *
          (2.5 - rig.sprint * 0.35) *
          rig.style.cadence *
          (forward < -0.15 ? -1 : 1)) %
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
    const breath = Math.sin((tick / 30) * 1.7 + rig.style.phase);
    const idleTurn =
      Math.sin((tick / 30) * 0.65 + rig.style.phase) *
      rig.style.sway *
      (ready ? 0.25 : 1.6) *
      (1 - rig.motion);
    rig.upper.setLocalPosition(0, 0.08 + breath * 0.003 * (1 - rig.motion), 0);
    rig.upper.setLocalEulerAngles(
      -kick * 2 + breath * 0.35 * (1 - rig.motion),
      stride * (ready ? 1.5 : 4) * rig.style.sway + idleTurn,
      -stride * 1.5 * rig.style.sway,
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
      weaponMount.x,
      weaponMount.y - rig.sprint * 0.08 + rifleHeight(this.map) - 1.45,
      weaponMount.z + kick * 0.09,
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
        weaponMount.x - 0.12 * effort,
        0.36 - 0.18 * effort,
        weaponMount.z + 0.3 * effort,
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
      this.poseArm(rig, 1, hand, armLengths.upper, armLengths.forearm, contact);
    }
    if (this.map.terrain && !p.mantle) {
      const trigger = rig.rifle
        .getLocalTransform()
        .transformPoint(new pc.Vec3(0, -0.03, 0.14));
      this.poseArm(rig, 1, trigger, armLengths.upper, armLengths.forearm);
    }
    const loading = reloadMotion(p, tick);
    if (loading && !p.mantle && p.throwUntil <= tick) {
      const { progress: t, lower } = loading;
      rig.rifle.setLocalPosition(
        weaponMount.x - 0.05 * lower,
        0.36 - 0.14 * lower + rifleHeight(this.map) - 1.45,
        weaponMount.z + 0.15 * lower,
      );
      rig.rifle.setLocalEulerAngles(-24 * lower, 10 * lower, -28 * lower);
      const trigger = rig.rifle
        .getLocalTransform()
        .transformPoint(new pc.Vec3(0, -0.03, 0.14));
      const service = p.weapon === "serviceRifle";
      const well = rig.rifle
        .getLocalTransform()
        .transformPoint(
          service
            ? new pc.Vec3(0.025, 0.16, 0.06)
            : new pc.Vec3(0.025, -0.23, 0.14),
        );
      const belt = new pc.Vec3(0.23, 0.02, -0.27);
      const bolt = rig.rifle
        .getLocalTransform()
        .transformPoint(new pc.Vec3(0.1, 0.08, 0.22));
      const keys = service
        ? [
            { t: 0, p: trigger },
            { t: 0.14, p: bolt },
            { t: 0.32, p: belt },
            { t: 0.48, p: well },
            { t: 0.65, p: well.clone().add(new pc.Vec3(0, -0.09, 0)) },
            { t: 0.84, p: bolt },
            { t: 1, p: trigger },
          ]
        : [
            { t: 0, p: trigger },
            { t: 0.18, p: well },
            { t: 0.4, p: belt },
            { t: 0.64, p: well },
            { t: 0.79, p: bolt },
            { t: 1, p: trigger },
          ];
      const end = keys.findIndex((k) => k.t >= t),
        b = keys[Math.max(1, end)],
        a = keys[Math.max(0, end - 1)];
      const hand = new pc.Vec3().lerp(
        a.p,
        b.p,
        smooth((t - a.t) / (b.t - a.t)),
      );
      this.poseArm(rig, 1, hand, armLengths.upper, armLengths.forearm);
      magazineVisible = !loading.removed;
      carryingMagazine = loading.carrying;
    }
    const cycling = boltMotion(p, tick);
    const ease = (v: number) => smooth(clamp01(v));
    const boltLift =
      loading && p.weapon === "serviceRifle"
        ? ease(loading.progress / 0.12) *
          (1 - ease((loading.progress - 0.78) / 0.16))
        : (cycling?.lift ?? 0);
    const boltPull =
      loading && p.weapon === "serviceRifle"
        ? ease((loading.progress - 0.1) / 0.12) *
          (1 - ease((loading.progress - 0.73) / 0.15))
        : (cycling?.pull ?? 0);
    rig.bolt.setLocalPosition(0.05, 0.045, 0.13 + boltPull * 0.13);
    rig.bolt.setLocalEulerAngles(0, 0, 65 * boltLift);
    if (cycling && !p.mantle && p.throwUntil <= tick) {
      rig.rifle.rotateLocal(-5 * cycling.reach, 0, -6 * cycling.reach);
      const hand = rig.rifle
        .getLocalTransform()
        .transformPoint(
          rig.bolt.getLocalTransform().transformPoint(new pc.Vec3(boltGrip.x, boltGrip.y, boltGrip.z)),
        );
      this.poseArm(
        rig,
        1,
        hand,
        armLengths.upper,
        armLengths.forearm,
        cycling.reach,
      );
    }
    if (p.throwUntil > tick && !p.mantle) {
      const t = clamp01(1 - (p.throwUntil - tick) / 15);
      rig.rifle.setLocalEulerAngles(-30, 0, 15);
      rig.arms[1].shoulder.setLocalEulerAngles(150 - 110 * smooth(t), 0, -15);
      rig.arms[1].elbow.setLocalEulerAngles(55 * (1 - t), 0, 0);
    }
    if (p.melee && p.hp > 0 && !p.mantle) {
      const pose = meleePose(p.melee, tick);
      const charge = chargePresentation(p, tick, rig.phase, rig.motion);
      const butt = p.melee.kind === "butt";
      rig.body.rotateLocal(pose.lean, 0, 0);
      rig.upper.rotateLocal(0, -8 * pose.ready + 12 * pose.thrust, 0);
      rig.arms[0].shoulder.setLocalPosition(
        -0.27,
        0.41,
        -0.12 - 0.13 * pose.thrust,
      );
      rig.arms[1].shoulder.setLocalPosition(0.29, 0.41, -0.13 * pose.thrust);
      rig.rifle.setLocalPosition(
        weaponMount.x - (butt ? 0.1 : 0.02) * pose.ready + charge.side * 0.012,
        weaponMount.y +
          rifleHeight(this.map) -
          1.45 +
          (p.melee.kind === "charge" ? 0.08 : -0.04) * pose.ready + charge.ready * 0.04 + charge.bob * 0.006,
        weaponMount.z + 0.1 * pose.ready - 0.13 * pose.thrust + charge.bob * 0.008,
      );
      rig.rifle.setLocalEulerAngles(
        (p.melee.kind === "charge" ? 8 * pose.ready : 0) + charge.bob * 0.8,
        (butt ? 60 * pose.ready + 35 * pose.thrust : 0) + charge.side,
        -8 * pose.ready + charge.side * 1.2,
      );
      const hand = rig.rifle
        .getLocalTransform()
        .transformPoint(new pc.Vec3(0, -0.03, 0.14));
      this.poseArm(rig, 1, hand, armLengths.upper, armLengths.forearm);
      carryingMagazine = false;
    }
    if (
      p.hp > 0 &&
      tick - p.staggerAt >= 0 &&
      tick - p.staggerAt < 12 &&
      !p.mantle
    ) {
      const reaction = Math.sin((Math.PI * (tick - p.staggerAt)) / 12);
      rig.body.rotateLocal(-14 * reaction, 0, 4 * reaction);
      rig.upper.rotateLocal(-8 * reaction, 0, 0);
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
    // Keep all actor renderers in their batches. Visibility is an animated
    // transform, using the ordinary bind pose captured before the first draw.
    rig.magazine.setLocalScale(
      magazineVisible ? rig.magazineScale : pc.Vec3.ZERO,
    );
    rig.reloadMagazine.setLocalScale(
      carryingMagazine ? rig.reloadMagazineScale : pc.Vec3.ZERO,
    );
    this.attachSupportArm(rig);
  }
  private ragdollPose(p: Soldier) {
    const rig = this.soldiers[p.id], root = this.people[p.id];
    const parts: RagdollPart[] = [];
    const bindings = new Map<pc.Entity, string>([[rig.body, "pelvis"], [rig.hips, "pelvis"], [rig.upper, "torso"], [rig.rifle, "weapon"], [rig.supportHand, "left forearm"]]);
    const right = rig.upper.getWorldTransform().transformVector(pc.Vec3.RIGHT).normalize();
    const up = rig.upper.getWorldTransform().transformVector(pc.Vec3.UP).normalize();
    const hipCenter = rig.hips.getPosition().clone();
    parts.push({ name: "pelvis", position: hipCenter, rotation: rig.hips.getRotation().clone(), mass: 11, shape: "box", size: new pc.Vec3(0.20, 0.12, 0.14) });
    parts.push({ name: "torso", position: rig.upper.getWorldTransform().transformPoint(new pc.Vec3(0, 0.22, 0.045)), rotation: rig.upper.getRotation().clone(), mass: 24, shape: "box", size: new pc.Vec3(0.24, 0.25, 0.245), parent: "pelvis", anchor: hipCenter.clone().add(up.clone().mulScalar(0.13)), axis: up, swing: 25, twist: 20 });
    const head = root.findByName("head") as pc.Entity;
    parts.push({ name: "head", position: head.getPosition().clone().add(up.clone().mulScalar(0.06)), rotation: head.getRotation().clone(), mass: 5, shape: "capsule", size: new pc.Vec3(0.18, 0.42, 0), parent: "torso", anchor: head.getPosition().clone().sub(up.clone().mulScalar(0.17)), axis: up, swing: 45, twist: 50 });
    const segment = (name: string, a: pc.Vec3, b: pc.Vec3, radius: number, mass: number, parent: string, hinge?: [number, number]) => {
      const direction = b.clone().sub(a), length = direction.length();
      direction.normalize();
      parts.push({ name, position: a.clone().lerp(a, b, 0.5), rotation: new pc.Quat().setFromDirections(pc.Vec3.UP, direction), mass, shape: "capsule", size: new pc.Vec3(radius, length, 0), parent, anchor: a.clone(), axis: hinge ? right : direction, hinge, swing: parent === "torso" ? 80 : 50, twist: 30 });
    };
    for (let i = 0; i < 2; i++) {
      const side = i ? "right" : "left", arm = rig.arms[i], leg = rig.legs[i];
      const shoulder = arm.shoulder.getPosition().clone(), elbow = arm.elbow.getPosition().clone();
      const wrist = arm.elbow.getWorldTransform().transformPoint(new pc.Vec3(0, -armLengths.forearm, 0));
      segment(`${side} upper arm`, shoulder, elbow, 0.075, 2.5, "torso");
      segment(`${side} forearm`, elbow, wrist, 0.065, 1.5, `${side} upper arm`, [-5, 125]);
      bindings.set(arm.shoulder, `${side} upper arm`); bindings.set(arm.elbow, `${side} forearm`);
      const hip = leg.hip.getPosition().clone(), knee = leg.knee.getPosition().clone(), ankle = leg.ankle.getPosition().clone();
      segment(`${side} thigh`, hip, knee, 0.10, 8, "pelvis");
      segment(`${side} calf`, knee, ankle, 0.08, 5, `${side} thigh`, [-125, 5]);
      parts.push({ name: `${side} foot`, position: leg.ankle.getWorldTransform().transformPoint(new pc.Vec3(0, -0.04, -0.065)), rotation: leg.ankle.getRotation().clone(), mass: 1, shape: "box", size: new pc.Vec3(0.09, 0.065, 0.13), parent: `${side} calf`, anchor: ankle, axis: right, swing: 25, twist: 15 });
      bindings.set(leg.hip, `${side} thigh`); bindings.set(leg.knee, `${side} calf`); bindings.set(leg.ankle, `${side} foot`);
    }
    const wrist = rig.arms[1].elbow.getWorldTransform().transformPoint(new pc.Vec3(0, -armLengths.forearm, 0));
    parts.push({ name: "weapon", position: rig.rifle.getWorldTransform().transformPoint(new pc.Vec3(0, -0.03, -0.2)), rotation: rig.rifle.getRotation().clone(), mass: 4, shape: "box", size: new pc.Vec3(0.045, 0.07, 0.7), parent: "right forearm", anchor: wrist, axis: rig.rifle.getWorldTransform().transformVector(pc.Vec3.FORWARD).normalize(), swing: 65, twist: 55 });
    return { parts, bindings, head: head.getPosition().clone(), up };
  }
  private releaseCasualty(c: (typeof this.casualties)[number]) {
    c.ragdoll.destroy(); c.skin.destroy(); c.entity.destroy(); c.mesh.destroy();
  }
  private retainCasualty(p: Soldier, impulse = new pc.Vec3(0.5, 0, 1.5)) {
    if (
      Math.hypot(
        p.x - this.camera.getPosition().x,
        p.z - this.camera.getPosition().z,
      ) > casualtyRules.range
    )
      return;
    if (this.casualties.length >= casualtyRules.max) {
      const old = this.casualties.shift()!;
      this.releaseCasualty(old);
      this.soldierStats.evicted++;
    }
    const positions: number[] = [],
      normals: number[] = [],
      indices: number[] = [],
      colors: number[] = [], weights: number[] = [], blendIndices: number[] = [];
    const pose = this.ragdollPose(p);
    this.ragdollPhysics ??= new RagdollPhysics(this.terrainPhysics.world, this.map);
    const ragdoll = this.ragdollPhysics.create(pose.parts, new pc.Vec3(p.vx, 0, p.vz));
    ragdoll.hit(impulse, pose.parts[1].position.clone().add(new pc.Vec3(0.08, 0.08, 0)));
    for (const component of this.people[p.id].findComponents(
      "render",
    ) as pc.RenderComponent[]) {
      if (
        !component.entity.enabled ||
        component.entity === this.soldiers[p.id].reloadMagazine
      )
        continue;
      let carried: pc.GraphNode | null = component.entity;
      while (carried && carried !== this.soldiers[p.id].reloadMagazine) carried = carried.parent;
      if (carried) continue;
      const world = component.entity.getWorldTransform(),
        normalMatrix = world.clone().invert().transpose();
      let ancestor: pc.GraphNode | null = component.entity, bone = "torso";
      while (ancestor) {
        const mapped = pose.bindings.get(ancestor as pc.Entity);
        if (mapped) { bone = mapped; break; }
        ancestor = ancestor.parent;
      }
      for (const instance of component.meshInstances) {
        if (!instance.mesh) continue;
        const points: number[] = [],
          ns: number[] = [],
          is: number[] = [],
          sourceColors: number[] = [];
        instance.mesh.getColors(sourceColors);
        instance.mesh.getPositions(points);
        instance.mesh.getNormals(ns);
        instance.mesh.getIndices(is);
        const base = positions.length / 3;
        let tint =
          (instance.material as pc.StandardMaterial).diffuse ??
          new pc.Color(0.4, 0.4, 0.35);
        if (instance.material === this.materials.get("rifle-material-walnut")) tint = color("#715037");
        if (instance.material === this.materials.get("rifle-material-steel")) tint = color("#353c3a");
        for (let i = 0; i < points.length; i += 3) {
          const v = world.transformPoint(
            new pc.Vec3(points[i], points[i + 1], points[i + 2]),
          );
          positions.push(v.x, v.y, v.z);
          const vertexBone = component.entity === this.soldiers[p.id].upper && v.clone().sub(pose.head).dot(pose.up) > -0.17 ? "head" : bone;
          blendIndices.push(pose.parts.findIndex(part => part.name === vertexBone), 0, 0, 0);
          weights.push(1, 0, 0, 0);
          const n = normalMatrix
            .transformVector(new pc.Vec3(ns[i], ns[i + 1], ns[i + 2]))
            .normalize();
          normals.push(n.x, n.y, n.z);
          const ci = (i / 3) * 4;
          colors.push(
            tint.r ** 2.2 * (sourceColors[ci] ?? 1),
            tint.g ** 2.2 * (sourceColors[ci + 1] ?? 1),
            tint.b ** 2.2 * (sourceColors[ci + 2] ?? 1),
            1,
          );
        }
        indices.push(...is.map((i) => i + base));
      }
    }
    if (!indices.length) { ragdoll.destroy(); return; }
    const mesh = new pc.Mesh(this.app.graphicsDevice);
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setColors(colors);
    mesh.setIndices(indices);
    mesh.setVertexStream(pc.SEMANTIC_BLENDINDICES, blendIndices, 4, undefined, pc.TYPE_UINT8);
    mesh.setVertexStream(pc.SEMANTIC_BLENDWEIGHT, weights, 4);
    mesh.skin = new pc.Skin(this.app.graphicsDevice, ragdoll.bind.map(m => m.clone().invert()), pose.parts.map(p => p.name));
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    const entity = this.joint("fallen soldier", this.app.root);
    let material = this.materials.get("casualty");
    if (!material) {
      material = new pc.StandardMaterial();
      material.diffuse = new pc.Color(1, 1, 1);
      material.diffuseVertexColor = true;
      material.blendType = pc.BLEND_NORMAL;
      material.depthWrite = false;
      material.update();
      this.materials.set("casualty", material);
    }
    const instance = new pc.MeshInstance(mesh, material, entity);
    const bones = pose.parts.map(part => {
      const bone = this.joint(part.name, entity);
      bone.setPosition(part.position); bone.setRotation(part.rotation);
      return bone;
    });
    const skin = new pc.SkinInstance(mesh.skin);
    skin.bones = bones; skin.rootBone = entity; instance.skinInstance = skin;
    instance.castShadow = false;
    entity.addComponent("render", { meshInstances: [instance] });
    this.casualties.push({ entity, mesh, skin, bones, ragdoll, x: p.x, z: p.z, age: 0 });
    this.soldierStats.remnants++;
    this.soldierStats.peakRemnants = Math.max(
      this.soldierStats.peakRemnants,
      this.casualties.length,
    );
  }
  private drawCasualties(dt: number) {
    this.ragdollPhysics?.step(dt);
    this.casualties = this.casualties.filter((c) => {
      c.age += dt;
      if (c.age >= casualtyRules.lifetime) {
        this.releaseCasualty(c);
        this.soldierStats.expired++;
        return false;
      }
      c.ragdoll.read();
      for (let i = 0; i < c.bones.length; i++) {
        c.bones[i].setPosition(c.ragdoll.positions[i]); c.bones[i].setRotation(c.ragdoll.rotations[i]);
      }
      c.entity.render!.meshInstances[0].setParameter(
        "material_opacity",
        Math.min(1, (casualtyRules.lifetime - c.age) / 2),
      );
      return true;
    });
  }
  reset(g: Game) {
    this.clearEnvironmentEffects();
    for (const c of this.casualties) {
      this.releaseCasualty(c);
    }
    this.casualties = [];
    this.ragdollPhysics?.destroy(); this.ragdollPhysics = undefined;
    this.activeGame = g; this.deathHits.clear();
    for (const key of Object.keys(
      this.soldierStats,
    ) as (keyof typeof this.soldierStats)[])
      this.soldierStats[key] = 0;
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
    this.blastSequence = 0;
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
    this.createFirstPersonRig();
    for (const rig of this.soldiers) rig.reloadMagazine.setLocalScale(0, 0, 0);
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
      const rig = this.soldiers[p.id],
        tick = g.tick - 1 + alpha;
      if (p.hp > 0) {
        e.setLocalScale(1, 1, 1);
        rig.deathAt = null;
        rig.remnantCreated = false;
        this.animateSoldier(p, position.x, position.z, dt, tick);
      } else {
        if (rig.deathAt === null) {
          rig.deathAt = tick;
          this.soldierStats.collapses++;
        }
        rig.alive = false;
        if (!rig.remnantCreated) {
          e.setLocalScale(pc.Vec3.ONE);
          this.retainCasualty(p, this.deathHits.get(p.id));
          rig.remnantCreated = true;
        }
        // Preserve the original actor bind poses and batch membership at death.
        e.setLocalScale(rig.remnantCreated ? pc.Vec3.ZERO : pc.Vec3.ONE);
      }
    }
    this.drawCasualties(dt);
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
      firstPerson = firstPersonView(p) && !overview,
      baseView = weaponAim(p),
      view = {
        yaw: baseView.yaw + (overview || firstPerson ? 0 : this.cameraReaction.yaw),
        pitch: baseView.pitch + (overview || firstPerson ? 0 : this.cameraReaction.pitch),
      },
      d = p.command.aim ? 2.5 : 4,
      dir = {
        x: Math.sin(view.yaw) * Math.cos(view.pitch),
        y: Math.sin(view.pitch),
        z: -Math.cos(view.yaw) * Math.cos(view.pitch),
      };
    const visual = this.people[0].getPosition();
    const cameraDrop = crouchRules.drop * (firstPerson ? Number(p.crouched) : this.soldiers[0].crouch);
    const pivot = { x: visual.x, y: visual.y + 1.65 - cameraDrop, z: visual.z },
      desired = {
        x: visual.x - dir.x * d + Math.cos(view.yaw) * 0.65,
        y: visual.y + 2.5 - cameraDrop - dir.y * d,
        z: visual.z - dir.z * d + Math.sin(view.yaw) * 0.65,
      },
      f = firstPerson ? 0 : this.ray(pivot, desired) * 0.95;
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
    // Recoil is authoritative in weaponAim. Cosmetic blast angles cannot move
    // the first-person sight away from the direction used by the simulation.
    if (!overview && !firstPerson) this.camera.rotateLocal(0, 0, this.cameraReaction.roll);
    this.camera.camera!.projection = pc.PROJECTION_PERSPECTIVE;
    this.camera.camera!.fov += ((sighted(p, g.tick) ? 50 : 70) - this.camera.camera!.fov) * (1 - Math.exp(-16 * dt));
    this.camera.camera!.nearClip = firstPerson ? 0.04 : 0.08;
    if (overview) {
      // Opt-in observer view for reviewing whole-map layouts and bot routes.
      this.camera.camera!.projection = pc.PROJECTION_ORTHOGRAPHIC;
      this.camera.camera!.orthoHeight = this.map.depth / 2 + 5;
      this.camera.setPosition(0, 100, 0);
      this.camera.setEulerAngles(-90, 0, 0);
      this.app.scene.fog.type = "none";
    }
    this.drawFirstPerson(p, g.tick - 1 + alpha, dt);
    if (this.firstPersonRig && overview) this.firstPersonRig.root.enabled = false;
    if (firstPerson) this.people[0].setLocalScale(pc.Vec3.ZERO);
    this.overcastSky?.setPosition(this.camera.getPosition());
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
          material = this.dustMaterial("#c4c8c6");
        for (let i = 0; i < 15; i++) {
          const puff = this.joint("smoke volume", root);
          puff.addComponent("render", {
            type: "plane",
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
      volume.material.opacity = density * 1.3;
      volume.material.update();
      for (let i = 0; i < volume.root.children.length; i++) {
        const puff = volume.root.children[i],
          angle = i * 2.4 + Math.sin(age * 0.25 + i) * 0.06;
        const ring = i < 3 ? 0 : 0.49;
        puff.setLocalPosition(
          Math.cos(angle) * radius * ring,
          Math.sin(i * 1.7) * height * 0.16,
          Math.sin(angle) * radius * ring,
        );
        const swell = 1 + Math.sin(age * 0.8 + i) * 0.06;
        this.faceCamera(puff as pc.Entity, Math.sin(i * 2.4 + age * 0.15) * 9);
        // Keep the visible billows within the existing optical envelope.
        puff.setLocalScale(radius * 1.15 * swell, 1, height * 1.5 * swell);
      }
    }
  }
  private drawArtillery(g: Game, alpha: number) {
    const markers: {
      id: number;
      target: Vec;
      radius: number;
      color: string;
    }[] = [];
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
  private blastEffect(at: V3, radius: number, power = 1, scale = 1) {
    if (this.blasts.length >= maxBlastClouds) {
      const oldest = this.blasts.shift()!;
      oldest.root.destroy();
      for (const m of oldest.materials) m.destroy();
    }
    const root = this.joint("explosion dust", this.app.root);
    root.setPosition(at.x, at.y, at.z);
    root.setLocalScale(scale, scale, scale);
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
      this.dustMaterial("#776d5e"),
      this.dustMaterial("#9a9387"),
    ];
    const particle = (
      name: string,
      type: "sphere" | "cylinder" | "plane",
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
    const smoke = Array.from({ length: 14 }, (_, i) => {
      const e = particle("blast dust", "plane", materials[i < 3 ? 2 : 3]);
      const angle = (i / 9) * Math.PI * 2;
      e.setLocalPosition(Math.sin(angle) * 0.3, 0.1, Math.cos(angle) * 0.3);
      return e;
    });
    this.blasts.push({
      root,
      age: 0,
      radius,
      power,
      seed: ++this.blastSequence,
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
      const life = 4.5 * blast.power;
      if (t >= life) {
        blast.root.destroy();
        for (const material of blast.materials) material.destroy();
        return false;
      }
      blast.flash.enabled = t < 0.13;
      const flashSize = (0.4 + t * 12) * blast.power;
      blast.flash.setLocalScale(flashSize, flashSize, flashSize);
      blast.materials[0].opacity = Math.max(0, 0.95 * (1 - t / 0.13));
      blast.wave.enabled = t < 0.3;
      const diameter = blast.radius * 2 * Math.min(1, t / 0.4);
      blast.wave.setLocalPosition(0, 0.04, 0);
      blast.wave.setLocalScale(diameter, 0.035, diameter);
      blast.materials[1].opacity = Math.max(0, 0.08 * (1 - t / 0.3));
      blast.materials[2].opacity =
        Math.min(1.15, t * 12) * Math.max(0, 1 - t / 2.1);
      blast.materials[3].opacity =
        Math.min(0.95, t * 5) * (1 - t / life) ** 1.3;
      for (let i = 0; i < blast.smoke.length; i++) {
        const plume = blastPlume(t, i, blast.power, blast.seed);
        blast.smoke[i].setLocalPosition(plume.x, plume.y, plume.z);
        this.faceCamera(blast.smoke[i], plume.roll);
        blast.smoke[i].setLocalScale(plume.size, 1, plume.height);
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
          projectileRange -
            p.remaining -
            (Math.hypot(p.vx, p.vy, p.vz) / 30) * (1 - alpha),
        ),
      );
      const tracer = entity.children[0];
      tracer.setLocalScale(0.11, 0.11, trailLength);
      tracer.setLocalPosition(0, 0, trailLength / 2);
    }
  }
  effect(e: Event) {
    if (e.type === "respawn") this.deathHits.delete(e.actor);
    if (e.type === "damage" && this.activeGame) {
      const target = this.people[e.actor]?.getPosition(), source = this.people[e.source]?.getPosition();
      if (target && source) this.deathHits.set(e.actor, target.clone().sub(source).normalize().mulScalar(7));
    }
    if (e.type === "death" && this.activeGame) {
      const p = this.activeGame.players[e.actor], rig = this.soldiers[e.actor], actor = this.people[e.actor];
      if (p && rig && actor && !rig.remnantCreated) {
        actor.setLocalScale(pc.Vec3.ONE);
        this.retainCasualty(p, this.deathHits.get(e.actor));
        rig.deathAt = e.tick; rig.remnantCreated = true; rig.alive = false;
        this.soldierStats.collapses++;
        actor.setLocalScale(pc.Vec3.ZERO);
      }
    }
    if (e.type === "grenadeExplosion" || e.type === "artilleryImpact") {
      const at = new pc.Vec3(e.at.x, e.at.y, e.at.z);
      for (const c of this.casualties) {
        c.ragdoll.read();
        const p = c.ragdoll.positions[0];
        const cover = this.ray(e.at, p) < 0.98 ? 0.25 : 1;
        c.ragdoll.blast(at, e.radius * 1.25, (e.type === "artilleryImpact" ? 140 : 90) * cover);
      }
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
      for (const [i, id] of (e.change.collapses ?? []).slice(0, 4).entries()) {
        const b = this.map.destruction!.objects[id].original;
        this.spawnDebris(
          { x: b.x, y: (b.baseY ?? 0) + b.h * 0.55, z: b.z },
          b.kind === "wood" ? "wood" : "stone",
          8,
          e.id + i * 41,
        );
      }
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
      const scale = e.ambient ? 2 : 1;
      this.blastEffect(e.at, e.radius / scale, 1.7, scale);
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
