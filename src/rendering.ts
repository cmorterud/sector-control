import { emplacementRules, emplacementView, mountedGun, type Placement } from "./emplacements";
import { mortarAim, mortarSpread, mortarTargetBlocked, tubeElevation } from "./mortar";
import { isMortarWeapon } from "./mortar-stats";
import { TankView } from "./tank-render";
import { crewTank, tankCamera } from "./tanks";
import {handlingPath,handlingWrist} from "./handling-pose";
import { publicAsset } from "./public-assets";
import { architectureGeometry, architectureKey, type ArchitectureSurface } from "./architecture-geometry";
import { hullSkin, ringBands } from "./zeppelin-geometry";
import { hullRadius } from "./zeppelin-map";
import { qualityProfiles, type Quality } from "./graphics-quality";
import { lookFor, type MapLook } from "./map-look";
import { fortVault, fortVaultHeight, inFortRect, type FortRect } from "./fort-vaux-map";
import { skyCubemapFaces } from "./sky";
import { shadeArchitecture } from "./room-light";
import type {DeathView} from "./combat-feedback";
import { architecturePixels, architecturalTextures, cisternWaterNormals, type ArchitecturalTexture } from "./architecture-surfaces";
import { coastalGeometry, coastalGrass, coastalWaterNormals, coastalRules } from "./coastal-scenery";
import { boundaryWireGeometry } from "./boundary-wire";
import { brazierSites, clothGeometry, clothScraps, mistBanks, type MistBank } from "./atmosphere";
import { burstRadius, nightLamps, nightRules, tapeBoxes } from "./night";
import { flareBrightness, flarePosition as starShellPosition, flareRules } from "./flares";

// How bright a fresh flare's light is; tuned on a real GPU.
const flareLightIntensity = 9;
const burstLightIntensity = 16;
import { BillboardBuffer } from "./billboards";
import { GasView } from "./gas-view";
import { maskProgress } from "./gas";
import { craterPonds, noMansLandDebris, wireBeltGeometry, type WireCache } from "./no-mans-land";
import { dugoutBoxes, dugouts, paradosBags, revetmentPixels, revetmentStyle, signboards, trenchProps, type RevetmentStyle } from "./trench-dressing";
import { backdropBoxMesh, backdropGround, backdropHeight, backdropLife, backdropScenery, distantFlares, distantFlashes, flarePosition, flareTicks } from "./backdrop";
import { verdunBackdropScenery, verdunDeadZoneTrees } from "./verdun-backdrop";
import { villageGardenProps } from "./village-outdoors";
import {movementWeight,advanceMovementWeight,type MovementWeight} from "./movement-weight";
import {footRules,footCycle,gaitFrequency,updateFootContact,type FootContact} from "./foot-placement";
import {gripHandGeometry, type HandPose} from "./hand-geometry";
import {viewCuffParts} from "./soldier-kit";
import {modelSurfaceAtlas,modelAtlasSize,modelUV,modelSurfaceFor,type ModelSurface} from "./model-surfaces";
import {farmPropParts} from "./farm-props";
import { battlePerformance } from "./battle-performance";
import { VisualWorkQueue } from "./visual-work";
import { SceneryBatches } from "./scenery-batches";
import { combatReactionPose } from "./combat-reaction";
import { switchPose, visualWeapon, aimBlend } from "./weapon-handling";
import { bayonetMount, weaponDesign } from "./weapon-design";
import { flagCloth, flagColor, flagRingColor, lockedRingColor, type FlagState } from "./flag";
import { CtfMarkers } from "./ctf-render";
import { factionFor, factions, scoped, type FactionId } from "./loadouts";
import { factionGrenade, grenadeLook } from "./grenade-look";
import { periscopeLift, periscopeRaised, periscopeRules } from "./periscope";
import { terrainNormals, invalidateTerrainNormals } from "./terrain-shading";
import { earthPixels, earthDiffusePS, earthGlossPS, earthNormalPS } from "./environment-surface";
import { meleePose } from "./melee";
import { characterGeometry, type CharacterShape } from "./character-geometry";
import { RagdollPhysics, type Ragdoll, type RagdollPart } from "./ragdoll";
import { anzacDress, factionKit, faceParts, isKitFaction, looksFor, soldierLookFor, wearsHat, type KitFaction } from "./soldier-kit";
import { detailedRifleParts, detailedBoltParts, boltGrip, rifleGeometry, rifleSurfaceMaps, rifleTextureSize, type RifleShape } from "./rifle-geometry";
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
  throwBody,
  deathFall,
  deathFallRules,
  throwPresentation,
  casualtyRules,
} from "./soldier-presentation";
import {
  lookNoise,
  surfacePixels,
  dustPixels,
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
import { RainView } from "./rain-view";
import { SoldierStandIns, standInDue, standInRules, advanceGait, type StandInGait, type BakePart } from "./soldier-standins";
import { floodAt, rainIntensity } from "./weather";
import { duckboards, intactBoard } from "./battlefield";
import { crouchRules } from "./crouch";
import { weaponAim, recoilPulse, recoilFeel, feelFor, recoilBuzz } from "./recoil";
import { WeaponFx } from "./weapon-fx";
import { BatteryView } from "./battery-render";
import { tankGunMuzzle, tracerRound } from "./muzzle-blast";
import { heatRules } from "./weapon-heat";
import { firstPersonView, sighted, sightHeight, scopeFov, viewWeaponPosition, weaponPullback, barrelEnd, viewDirection } from "./player-view";
import { smokeRules, smokeDensity } from "./smoke";
import { artilleryRules } from "./artillery";
import { flagStatus } from "./offensive";
import { dominationRules, flagContains } from "./domination";
import * as pc from "playcanvas";
import { createPhysicsWorld, TerrainPhysics } from "./physics";
import {
  runtimeMap,
  type Destructible,
  type DestructionChange,
  artilleryExplosionProfile,
  grenadeExplosionProfile,
} from "./destruction";
import { TerrainGeometryCache, terrainPatchKeys, type TerrainGeometry } from "./terrain-geometry";
import { scarRubble } from "./terrain-relief";
import { treeHasCrown } from "./vegetation";
import { battlefieldProps, trenchRoots } from "./battlefield-dressing";
import { forestFloorProps } from "./forest-floor";
import { forestGeometry, forestVariant, type ForestShape } from "./forest-geometry";
import { hillHeight,
  playArea,
  trenchGround,
  industrialMap,
  invalidateCoverLookup,
  groundHeight,
  supportHeight,
  moveOnMap,
  terrainPatchSize,
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
// Whether a shadow cascade is redrawn on a given frame: the first always, the
// second on odd frames, the third on every fourth, later ones every eighth.
export const shadowCascadeDue = (cascade: number, frame: number) =>
  cascade === 0 || (cascade === 1 ? frame % 2 === 1 : cascade === 2 ? frame % 4 === 0 : frame % 8 === 2);
// How often a soldier's limbs are posed, in frames, and whether it is in view.
// Near soldiers are posed every frame. In view, one beyond 30 m is posed every
// other frame and one beyond 75 m every third: at those ranges a limb moves
// less than a pixel between frames. A soldier the camera cannot see is posed
// one frame in four. Through a scope everything in view is posed every frame.
// (dx, dy, dz) is the soldier relative to the eye; `look` is the view direction.
export function soldierCadence(always: boolean, dx: number, dy: number, dz: number, look: { x: number; y: number; z: number }, zoomed = false) {
  if (always) return { every: 1, inView: true };
  const distance = Math.hypot(dx, dy, dz);
  if (distance < 12) return { every: 1, inView: true };
  // Within about 72 degrees of the view direction: wider than the screen, so
  // nothing at its edge is ever caught mid-skip.
  if (dx * look.x + dy * look.y + dz * look.z < distance * 0.3) return { every: 4, inView: false };
  return { every: zoomed ? 1 : distance > 75 ? 3 : distance > 30 ? 2 : 1, inView: true };
}
// Objective beacons outside Domination keep their bright signal colours.
const beaconColors: Record<FlagState, string> = { neutral: "#d4c699", blue: "#46a9d8", red: "#de6e5f", contested: "#edc76d" };
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const supportUpperLength = armLengths.upper;
const supportForearmLength = armLengths.forearm;
// What a soldier's built model depends on, to match warm-up soldiers to a match's.
// ANZAC soldiers differ by hat and by shorts, which follow their face.
export const standInKit = (p: Soldier) => `${p.team}|${p.faction}|${p.weapon}|${p.weaponId}${p.faction === "anzac" ? `|${soldierLookFor(p.id)}` : ""}`;
type SoldierRig = {
  // One world-space box for all of this soldier's batched parts (boundSoldiers).
  bounds?: pc.BoundingBox;
  // Where the model was last placed, and animation time owed from skipped frames.
  placed?: { x: number; y: number; z: number; yaw: number };
  owedSeconds?: number;
  farDetail?: boolean;
  // Drawn as a distant stand-in (src/soldier-standins.ts) with its own gait.
  standIn?: boolean;
  gait?: StandInGait;
  shoulderReady?: number;
  feetActive?: boolean;
  weight?: MovementWeight;
  feet?: (FootContact|undefined)[];
  design?: ReturnType<typeof weaponDesign>;
  // Shown, and pulled up over the face, while a gas mask goes on (src/gas.ts).
  gasMask?: pc.Entity;
  maskShown?: number;
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
  // A grenade in the right hand while winding up a throw; scaled away otherwise.
  heldGrenade?: pc.Entity;
  // Degrees the torso leans with the aim, eased (the rifle takes the rest).
  aimLean?: number;
  // Death: false while the fall plays, true once the ragdoll may take over.
  fallReady?: boolean;
  // Died beyond ragdoll range: the rig itself falls and lies there.
  downAtRange?: boolean;
  settled?: boolean;
  // Which of the army's faces (soldier-kit.ts) is merged into this rig's torso.
  look?: number;
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
> & { root: pc.Entity; grenade: pc.Entity; explosive: pc.Entity; smoke: pc.Entity; pullback: number; ads?: number; heatGlow: pc.Entity; rightHand?: pc.Entity; handPose?: HandPose };

type EmplacementMesh = { root: pc.Entity; yaw: pc.Entity; barrel: pc.Entity; slide: pc.Entity; glow?: pc.Entity; name: string };
export class Renderer implements CollisionWorld {
  app: pc.Application;
  camera: pc.Entity;
  cameraReaction = { pitch: 0, yaw: 0, roll: 0 };
  // Muzzle blast, smoke, heat and brass (src/weapon-fx.ts), rebuilt with the map's look.
  private weaponFx?: WeaponFx;
  private weaponFxKey = "";
  private frameDt = 1 / 60;
  private fpMuzzle?: { at: V3; dir: V3 };
  private heatGlowMaterial?: pc.StandardMaterial;
  deathView:DeathView|null=null;
  // A living teammate the camera follows once the player is out of reinforcements.
  spectating:number|null=null;
  private boardBatch = -1;
  private boardVisuals: { root: pc.Entity; x: number; z: number }[] = [];
  people: pc.Entity[] = [];
  private soldiers: SoldierRig[] = [];
  // The shader warm-up's deployment, hidden but kept: Begin reuses each
  // soldier whose kit matches instead of building it again.
  private standIns?: { game: Game; map: string; kits: string[]; hidden: pc.MeshInstance[] };
  private firstPersonRig?: FirstPersonRig;
  private ragdollPhysics?: RagdollPhysics;
  private casualtyTemplates = new Map<string, pc.Mesh>();
  private pendingCasualties = new Map<number, {
    rig: SoldierRig;
    blasts: { at: pc.Vec3; radius: number; power: number }[];
  }>();
  private activeGame?: Game;
  private deathHits = new Map<number, pc.Vec3>();
  rings: pc.Entity[] = [];
  // Capture the flag's stands, drop points and flags, in their own module.
  private ctfMarkers = new CtfMarkers(this);
  private objectiveTerrainRevision = -1;
  effects: { e: pc.Entity; life: number }[] = [];
  private fallingTrees: FallingTree[] = [];
  private fragments: { entity: pc.Entity; state: Debris }[] = [];
  materials = new Map<string, pc.StandardMaterial>();
  private architecturalModels?: Map<string,{surface:ArchitectureSurface;meshKey:string}[]>;
  private coastalSea?: {water:pc.StandardMaterial;foam:pc.StandardMaterial;time:number;pending:number};
  // Intact and cut no-man's-land wire, rebuilt when a blast cuts a segment.
  private wireBelts?: pc.Entity;
  private wireCache: WireCache = new Map();
  // Ground mist, brazier and crater smoke, and cloth on the wire.
  private atmosphere?: {
    root: pc.Entity;
    banks: MistBank[];
    sites: Vec[];
    fieldMist: { buffer: BillboardBuffer; mesh: pc.Mesh };
    trenchMist: { buffer: BillboardBuffer; mesh: pc.Mesh };
    brazierSmoke: { buffer: BillboardBuffer; mesh: pc.Mesh };
    craterSmoke: { buffer: BillboardBuffer; mesh: pc.Mesh };
    smoulders: { at: V3 | null; bornAt: number }[];
    cloth: ReturnType<typeof clothGeometry>;
    clothMesh: pc.Mesh;
  };
  // Balloons, smoke columns, distant bursts and flares beyond the terrain edge.
  private backdrop?: {
    life: pc.Entity;
    balloons: pc.Entity[];
    smoke: { buffer: BillboardBuffer; mesh: pc.Mesh };
    flashes: { glow: pc.Entity; plume: pc.Entity; glowMaterial: pc.StandardMaterial; plumeMaterial: pc.StandardMaterial }[];
    flares: { glow: pc.Entity; material: pc.StandardMaterial }[];
  };
  private textures = new Map<string, pc.Texture>();
  private kitMeshes = new Map<string, pc.Mesh>();
  private look!: MapLook;
  private sun!: pc.Entity;
  private frame?: pc.CameraFrame;
  quality: Quality = "medium";
  private blastSequence = 0;
  previous: V3[] = [];
  private casualties: {
    entity: pc.Entity;
    mesh: pc.Mesh;
    skin: pc.SkinInstance;
    ragdoll: Ragdoll;
    poseVersion?: number;
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
  private drawCount = 0;
  // Set when the simulation changed the world since the last frame was drawn,
  // and whether the last frame rebuilt terrain (so this one owes visual work).
  private worldChanged = false;
  private visualTurn = false;
  private coverBatch = -1;
  private batchGroup = -1;
  private sceneryBatches?: SceneryBatches;
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
  // Built the first time a gas shell cloud is drawn.
  private gasView?: GasView;
  private fortRoof?: pc.Entity;
  private worldParent?: pc.Entity;
  private terrainPhysics = new TerrainPhysics();
  private terrainGeometryCache?: TerrainGeometryCache;
  private visualWork = new VisualWorkQueue();
  // Terrain patches reshaped by explosions, rebuilt a few per frame.
  private terrainWork = new Set<string>();
  private terrainPatches = new Map<
    string,
    { entity: pc.Entity; mesh: pc.Mesh }
  >();
  private objectVisuals = new Map<string, pc.Entity>();
  private objectStates = new Map<string, string>();
  private waterMeshes: pc.Mesh[] = [];
  // Rain over the maps that have weather, when the match turns it on (src/weather.ts).
  private rainView?: RainView;
  // Distant soldiers drawn as instanced stand-ins.
  private distantSoldiers?: SoldierStandIns;
  private raining = false;
  private dryPonds?: pc.MeshInstance;
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
    quality: Quality = "medium",
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
    if (map.terrain) this.sceneryBatches = new SceneryBatches(this.app.batcher!);
    this.batchGroup = this.mapBatch;
    const trenches = map.id !== "industrial";
    this.app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    this.app.setCanvasResolution(pc.RESOLUTION_AUTO);
    // Each map's mood (src/map-look.ts): sun, generated sky, fog and grade.
    this.look = lookFor(map);
    this.camera = new pc.Entity("camera");
    this.camera.addComponent("camera", { fov: 70, nearClip: 0.08 });
    this.app.root.addChild(this.camera);
    const sun = this.sun = new pc.Entity("sun");
    sun.addComponent("light", {
      type: "directional",
      shadowType: pc.SHADOW_PCF3,
      shadowBias: 0.25,
      normalOffsetBias: 0.05,
    });
    this.app.root.addChild(sun);
    this.applyLook();
    this.setQuality(quality);
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
    this.fortRoof = undefined;
    if (map.fort) this.buildFort();
    if (map.zeppelin) this.buildZeppelin();
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
      if (map.fort) {
        if (b.id?.startsWith("fort-roof-") || b.id?.startsWith("fort-vault-")) obstacle.render!.enabled = false;
        else this.fortStone(obstacle, b.w, b.h, b.d, b.walkable ? "#939081" : "#858073");
      } else if (map.zeppelin) this.zeppelinSurface(obstacle, b);
      const modelled = this.map.boxes.some((q) => q.model) && b.kind === "building";
      if (modelled) {
        // The box stays as the collider; the loaded model replaces its look.
        obstacle.render!.enabled = false;
        if (b.model) this.placeLandmark(b, obstacle);
      }
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
      if (b.kind === "building" && !modelled) {
        this.cube(
          "roof",
          b.x,
          base + b.h + 0.15,
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
            base + y,
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
    if (map.coast) this.buildCoast();
    if (map.boundary) this.buildBoundaryWire();
    if (map.backdrop) {
      this.buildBackdrop();
      if (map.woodland) this.buildDeadZoneForest();
      if (map.terrain?.trenchLines?.length) this.buildTrenchDressing();
      if (trenchGround(map) || map.noMansLand) this.buildNoMansLand();
    }
    if (this.look.atmosphere) this.buildAtmosphere();
    if (map.night) this.buildNight();
    for (const [x, z, w, d] of map.coast || map.backdrop || map.sky ? [] : [
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
      ...(this.sceneryBatches?.ids() ?? []),
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
        disk.setLocalPosition(crater.x, terrain.bankHeight + hillHeight(crater.x, crater.z, this.map) + 0.015, crater.z);
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
    for (const prop of [...forestFloorProps(this.map),...villageGardenProps(this.map)]) {
      const root = this.joint("forest floor detail", this.mapRoot, prop.x, prop.y, prop.z);
      root.setLocalEulerAngles(0, prop.yaw, 0);
      const piece = this.forestPart(prop.shape, prop.shape, forestVariant(`${prop.x}:${prop.z}`), 0, 0, 0, ...prop.scale, prop.tint, root);
      piece.render!.castShadows = false;
      this.groundDecor.push({ root, x: prop.x, z: prop.z, radius: prop.radius, batched: true });
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
    for (const prop of [...this.boardVisuals, ...this.groundDecor.filter(p => p.batched)]) {
      const group = this.worldBatch(this.boardBatch, prop.x, prop.z);
      for (const render of prop.root.findComponents("render") as pc.RenderComponent[])
        if (render.batchGroupId === this.boardBatch) render.batchGroupId = group;
    }
    this.batchGroup = previousBatch;
  }
  setMap(map: MapDefinition) {
    const restore = !!this.map.destruction?.revision || this.map.id !== map.id;
    if (map !== this.map) this.terrainGeometryCache = undefined;
    this.map = map;
    if (!restore) return;
    this.clearEnvironmentEffects();
    this.visualWork.clear();
    // buildMap below rebuilds every patch.
    this.terrainWork.clear();
    this.pendingCasualties.clear();
    // Dynamic bodies belong to this terrain world; release them before it.
    for (const c of this.casualties) this.releaseCasualty(c);
    this.casualties = [];
    this.ragdollPhysics?.destroy(); this.ragdollPhysics = undefined;
    for (const mesh of this.casualtyTemplates.values()) { mesh.decRefCount(); mesh.destroy(); }
    this.casualtyTemplates.clear();
    this.terrainGeometryCache = undefined;
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
    this.rainView?.destroy();
    this.rainView = undefined;
    this.mapRoot.destroy();
    this.dirtyWorldBatches?.clear();
    this.sceneryBatches?.clear();
    this.sceneryBatches = map.terrain ? new SceneryBatches(this.app.batcher!) : undefined;
    this.terrainPhysics = new TerrainPhysics();
    this.buildMap();
  }
  private rebuildTerrainPatch(key: string, deferVisual = false) {
    const geometryStart = battlePerformance.begin();
    this.terrainGeometryCache ??= new TerrainGeometryCache(this.map);
    const data = this.terrainGeometryCache.build(key);
    battlePerformance.end("terrainGeometry", geometryStart);
    if (!data.indices.length) return;
    // Reuse the entity and mesh. Native collision still changes synchronously.
    let patch = this.terrainPatches.get(key);
    if (!patch) {
      patch = { entity: this.joint(`terrain ${key}`, this.mapRoot), mesh: new pc.Mesh(this.app.graphicsDevice) };
      this.terrainPatches.set(key, patch);
    }
    const physicsStart = battlePerformance.begin();
    this.terrainPhysics.setPatch(key, data, patch.entity);
    battlePerformance.end("terrainCollision", physicsStart);
    battlePerformance.count("terrainPatches");
    if (deferVisual) {
      this.visualWork.set(`terrain:${key}`, { kind: "terrain", run: () => this.uploadTerrainPatch(key, data) });
    } else this.uploadTerrainPatch(key, data);
  }
  // Rebuilds queued terrain patches, nearest the camera first: always one,
  // then more while the frame's budget lasts. A patch's geometry and collider
  // change here; its mesh is uploaded as visual work on a following frame, so
  // no single frame carries both halves. Bullets and sight lines meet the old
  // ground for the frame or two before a distant patch is rebuilt.
  private flushTerrainWork(budgetMs = 4, now = () => performance.now()) {
    if (!this.terrainWork.size) return 0;
    const start = now(), eye = this.camera?.getPosition();
    const keys = [...this.terrainWork];
    if (eye) {
      const away = (key: string) => {
        const [x, z] = key.split(",").map(Number);
        return Math.hypot((x + .5) * terrainPatchSize - eye.x, (z + .5) * terrainPatchSize - eye.z);
      };
      const distance = new Map(keys.map(k => [k, away(k)]));
      keys.sort((a, b) => distance.get(a)! - distance.get(b)!);
    }
    let done = 0;
    for (const key of keys) {
      if (done && now() - start >= budgetMs) break;
      this.terrainWork.delete(key);
      this.rebuildTerrainPatch(key, true);
      done++;
    }
    return done;
  }
  private uploadTerrainPatch(key: string, data: TerrainGeometry) {
    const start = battlePerformance.begin();
    const { entity, mesh } = this.terrainPatches.get(key)!;
    mesh.setPositions(data.positions);
    const normals = terrainNormals(this.map, data, pc.calculateNormals(data.positions, data.indices));
    mesh.setNormals(normals);
    mesh.setUvs(0, data.uvs);
    if (this.map.terrain)
      mesh.setVertexStream(pc.SEMANTIC_TANGENT,
        pc.calculateTangents(data.positions, normals, data.uvs, data.indices), 4);
    mesh.setColors(data.colors);
    mesh.setIndices(data.indices);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    if (!entity.render) {
      const material = this.map.terrain ? this.surfaceMaterial("mud", "#ffffff") : this.material("#ffffff");
      material.diffuseVertexColor = true;
      material.update();
      const instance = new pc.MeshInstance(mesh, material, entity);
      instance.castShadow = true;
      entity.addComponent("render", { meshInstances: [instance] });
    }
    battlePerformance.end("terrainMesh", start);
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
    const sea=this.coastalSea;
    if(sea&&this.map.coast) {
      sea.time+=Math.min(dt,.1);sea.pending+=dt;
      if(sea.pending>=.1) {
        sea.water.normalMapOffset.set((sea.time*.006)%1,(sea.time*.002)%1);sea.water.update();
        sea.foam.opacity=.25+Math.sin(sea.time*.8)*.05;sea.foam.update();sea.pending=0;
      }
    }
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
    this.batchGroup = this.worldBatch(this.coverBatch, b.x, b.z);
    const root = this.joint(object.id, this.mapRoot);
    const h = b.h * (object.stage === 1 && !b.architecture ? 0.6 : 1),
      base = b.baseY ?? 0;
    if(b.architecture || (b.kind==="rubble" && b.id?.startsWith("village-rubble-"))) {
      const pitch=(b.architecture?.roofPitch??0)*180/Math.PI;
      const solid=this.cube("architectural collision",b.x,base+h/2,b.z,b.w,h,b.d,"#aa9680",true,root,pitch);
      solid.render!.enabled=false;
      // Kit-building pieces carry their own baked room light, so they don't share meshes.
      const building=b.architecture&&!b.architecture.roofPitch?this.map.buildings?.find(x=>x.kit&&x.id===b.architecture!.building):undefined;
      const shape={...b,h},key=architectureKey(shape,object.stage)+(building?"@"+b.id:"");
      const models=this.architecturalModels??=new Map();
      if(!models.has(key))models.set(key,(building?shadeArchitecture(architectureGeometry(shape,object.stage),b,h,building):architectureGeometry(shape,object.stage)).map(data=>{
        const meshKey="architecture-"+key+"-"+data.surface;
        this.modelMesh(meshKey,()=>data);return {surface:data.surface,meshKey};
      }));
      for(const model of models.get(key)!) {
        const e=this.cube("architectural "+model.surface,b.x,base+h/2,b.z,1,1,1,"#ffffff",false,root,pitch);
        const materialKey="architecture-"+model.surface;
        if(!this.materials.has(materialKey)) {
          const material=this.surfaceMaterial(model.surface,"#ffffff").clone();
          material.diffuseVertexColor=true;material.update();this.materials.set(materialKey,material);
        }
        e.render!.meshInstances=[new pc.MeshInstance(this.kitMeshes.get(model.meshKey)!,this.materials.get(materialKey)!,e)];
      }
      this.objectVisuals.set(object.id,root);this.batchGroup=previousBatch;return true;
    }
    if (["tree", "brush", "log", "stump"].includes(b.kind)) {
      const primitive = (
        name: string,
        type: "sphere" | "cylinder" | "plane" | "cone",
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
          material: this.map.woodland && type === "cylinder"
            ? this.surfaceMaterial("wood", tint) : this.material(tint),
          castShadows: true,
          receiveShadows: true,
          batchGroupId: this.batchGroup,
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
        if (this.map.woodland && b.kind === "tree") {
          const variant = forestVariant(object.id);
          this.forestPart("tapered bark trunk", "trunk", variant, b.x, base, b.z, b.w, h, b.d, object.stage ? "#494136" : "#665746", root);
          this.forestPart("fine branching limbs", treeHasCrown(b) ? "limbs" : "deadLimbs", variant, b.x, base, b.z, h, h, h, "#62513f", root);
          if (object.stage === 0 && treeHasCrown(b))
            this.forestPart("ragged woodland crown", b.treeStyle === "pine" ? "pine" : "crown", variant, b.x, base, b.z, h, h, h, b.treeStyle === "pine" ? "#536047" : "#626d4f", root);
          this.objectVisuals.set(object.id, root);
          this.batchGroup = previousBatch;
          return true;
        }
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
        const woodland = !!this.map.woodland;
        for (let i = 0; i < (b.treeStyle === "bare" ? 5 : woodland ? 4 : 2); i++) {
          const side = i % 2 ? 1 : -1;
          const angle = ((seed + i * 137) * Math.PI) / 180;
          const branch = primitive(
            "tree branch",
            "cylinder",
            b.x + (woodland ? Math.sin(angle) : side) * h * (woodland ? .07 : .09),
            base + h * (0.43 + (i % 3) * 0.14),
            b.z + (woodland ? Math.cos(angle) * h * .07 : 0),
            b.w * (woodland ? .22 : .35),
            h * (woodland ? bare ? .24 : .20 : bare ? .26 : .42),
            b.w * (woodland ? .22 : .35),
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
        if (object.stage === 0 && b.treeStyle === "pine") {
          for (let i = 0; i < 4; i++) {
            const crown = primitive(
              "broken pine crown", "cone",
              b.x + Math.sin(seed + i * 2.4) * b.h * .025,
              base + b.h * (i === 3 ? .94 : .58 + i * .105),
              b.z + Math.cos(seed + i * 2.4) * b.h * .025,
              b.h * (.43 - i * .078), b.h * (i === 3 ? .24 : .3 - i * .045),
              b.h * (.38 - i * .065),
              i % 2 ? "#49523e" : "#555d45",
            );
            crown.setLocalEulerAngles(0, seed + i * 53, i % 2 ? 4 : -3);
          }
        } else if (object.stage === 0 && this.map.woodland && b.treeStyle === "sparse") {
          for (let i = 0; i < 5; i++)
            primitive(
              "torn woodland crown", "sphere",
              b.x + Math.sin(seed + i * 2.4) * b.h * .10,
              base + b.h * [ .63, .73, .84, .69, .92 ][i],
              b.z + Math.cos(seed + i * 2.4) * b.h * .10,
              b.h * .22, b.h * (.21 + (i % 2) * .05), b.h * .22,
              i % 2 ? "#62674b" : "#4f5b42",
            );
        } else if (object.stage === 0 && treeHasCrown(b))
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
    const detail = b.farmProp ? farmPropParts(b,h) : [];
    if (detail.length) {
      const solid = this.cube(b.kind,b.x,base+h/2,b.z,b.w,h,b.d,"#756044",!object.lining,root);
      solid.render!.enabled = false;
      for (const part of detail) {
        const piece=this.cube(part.name,b.x+part.at[0],base+part.at[1],b.z+part.at[2],...part.size,part.tint,false,root);
        piece.render!.type=part.shape;
        if(part.rotation)piece.setLocalEulerAngles(...part.rotation);
        if(part.wood)piece.render!.material=this.surfaceMaterial("wood",part.tint);
        if(part.stone)piece.render!.material=this.surfaceMaterial("stone",part.tint);
      }
      this.objectVisuals.set(object.id,root);
      this.batchGroup=previousBatch;
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
    const panel = this.cube(
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
    // Intact trench revetments on refreshed maps show their faction finish.
    const style = object.lining && this.map.backdrop && object.stage === 0 ? revetmentStyle(Number(object.id.split("-")[1]), b.x, factionFor(this.map, "blue")) : "timber";
    if (style !== "timber") panel.render!.material = this.revetmentMaterial(style);
    if (b.kind === "wood" && style !== "sandbag") {
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
    this.worldChanged = true;
    if (change.geometry !== false) invalidateCoverLookup(this.map);
    const start = battlePerformance.begin();
    try { this.applyWorldChange(change); } finally { battlePerformance.end("worldRebuild",start); }
  }
  private applyWorldChange(change: DestructionChange) {
    for (const fall of [...this.fallingTrees])
      if (change.objects.some((o) => fall.pieces.includes(o.id)))
        this.finishTreeFall(fall);
    for (const changed of change.objects) {
      const object = this.map.destruction!.objects[changed.id];
      if (object.original.kind === "tree" && changed.stage === 2)
        this.startTreeFall(object);
    }
    invalidateTerrainNormals(this.map,change);
    this.terrainGeometryCache?.invalidate(change);
    if (change.wire?.length) this.buildWireBelts(change.at);
    // Overlapping blasts share one rebuild per patch; see flushTerrainWork.
    for (const key of change.patches) this.terrainWork.add(key);
    for (const changed of change.objects) {
      const object = this.map.destruction!.objects[changed.id];
      if (this.buildDestructible(object))
        this.queueWorldBatch(this.worldBatch(this.coverBatch, object.original.x, object.original.z));
    }
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
    if (change.crater) {
      for (const board of this.boardVisuals) {
        const enabled = intactBoard(board, this.map);
        if (board.root.enabled !== enabled) {
          board.root.enabled = enabled;
          this.queueWorldBatch(this.worldBatch(this.boardBatch, board.x, board.z));
        }
      }
    }
    if (change.crater)
      for (const decor of this.groundDecor)
        if (
          decor.root.enabled &&
          Math.hypot(decor.x - change.at.x, decor.z - change.at.z) <
            decor.radius + change.crater.radius
        ) {
          decor.root.enabled = false;
          if (decor.batched)
            this.queueWorldBatch(this.worldBatch(this.boardBatch, decor.x, decor.z));
        }
  }
  private worldBatch(base: number, x: number, z: number) {
    return this.sceneryBatches?.group(base, x, z) ?? base;
  }
  private fortStone(entity: pc.Entity, w: number, h: number, d: number, tint: string, surface: ArchitectureSurface = "fort-stone") {
    const mesh = this.modelMesh(`fort-block:${w}:${h}:${d}`, () => {
      const box = new pc.BoxGeometry();
      const uvs = box.uvs!.map((uv, i) => {
        const normal = Math.floor(i / 2) * 3;
        const x = Math.abs(box.normals![normal]) > .5;
        const y = Math.abs(box.normals![normal + 1]) > .5;
        return uv * (i % 2 ? y ? d : h : x ? d : w) / 2.6;
      });
      return { positions: box.positions!, indices: box.indices!, normals: box.normals!, uvs };
    });
    entity.render!.meshInstances = [new pc.MeshInstance(mesh, this.surfaceMaterial(surface, tint), entity)];
  }
  // Zeppelin: each box keeps its collider and takes the look of what it is.
  // The hull's fill shows only from inside, as girder sides along the keel
  // and gas-cell linen above it.
  private zeppelinSurface(e: pc.Entity, b: Box) {
    const id = b.id!.replace(/^zep-(bow-)?/, "");
    const [surface, tint]: [ArchitectureSurface, string] = id.startsWith("hull-")
      ? (b.baseY ?? 0) >= 2.7 ? ["fabric", "#e0d5bb"] : (b.baseY ?? 0) >= -0.5 ? ["fabric", "#bfb59c"] : ["iron", "#6f746d"]
      : b.walkable ? ["floorboards", "#a58d6c"]
      : id.startsWith("rail-") || id.startsWith("car-") ? ["iron", "#454a47"]
      : /tank|valve|vent/.test(id) ? ["plaster", "#aeb3ab"]
      : ["plaster", "#aaa595"];
    this.fortStone(e, b.w, b.h, b.d, tint, surface);
    // Fuel tanks are aluminium drums standing in the keel.
    if (id.startsWith("tank-")) {
      const drum = this.modelMesh("zeppelin:tank", () => {
        const g = new pc.CylinderGeometry({ radius: 0.5, height: 1, heightSegments: 1, capSegments: 20 });
        return { positions: g.positions!, normals: g.normals!, uvs: g.uvs!, indices: g.indices! };
      });
      e.render!.meshInstances = [new pc.MeshInstance(drum, this.surfaceMaterial(surface, tint), e)];
    }
  }
  // The airship outside its walkways: doped-linen skin over the main rings,
  // tail fins, the gondolas under bow and stern and an engine and propeller
  // behind each engine car. Presentation only; nothing here collides.
  private buildZeppelin() {
    const layout = this.map.zeppelin!, { axis } = layout.hull, previous = this.batchGroup, parent = this.mapRoot;
    this.batchGroup = this.mapBatch;
    const shell = (name: string, key: string, build: () => ReturnType<typeof hullSkin>, surface: ArchitectureSurface, tint: string) => {
      const e = this.cube(name, 0, 0, 0, 1, 1, 1, tint, false, parent);
      e.render!.meshInstances = [new pc.MeshInstance(this.modelMesh(key, build), this.surfaceMaterial(surface, tint), e)];
    };
    shell("airship skin", "zeppelin:skin", () => hullSkin(layout), "fabric", "#b9bab1");
    shell("airship ring bands", "zeppelin:rings", () => ringBands(layout), "iron", "#8c8e86");
    const part = (name: string, x: number, y: number, z: number, w: number, h: number, d: number, tint: string) =>
      this.cube(name, x, y, z, w, h, d, tint, false, parent);
    // Cruciform tail: fixed fins with darker rudders and elevators behind.
    const finX = -67.5, finR = hullRadius(finX);
    part("upper fin", finX, axis + finR + 2, 0, 12, 5, 0.3, "#a9aaa2");
    part("lower fin", finX, axis - finR - 2, 0, 12, 5, 0.3, "#a9aaa2");
    for (const s of [-1, 1]) part("tail plane", finX, axis, s * (finR + 2), 12, 0.3, 5, "#a9aaa2");
    part("upper rudder", -74.4, axis + finR + 2.2, 0, 2.2, 4.4, 0.24, "#8f9089");
    part("lower rudder", -74.4, axis - finR - 2.2, 0, 2.2, 4.4, 0.24, "#8f9089");
    for (const s of [-1, 1]) part("elevator", -74.4, axis, s * (finR + 2.2), 2.2, 0.24, 4.4, "#8f9089");
    // Gondolas on struts under the hull: the control car forward, an engine car aft.
    const bottom = (x: number) => axis - hullRadius(x);
    const gondola = (x: number, length: number, name: string) => {
      const top = bottom(x) - 0.75;
      part(name, x, top - 1.1, 0, length, 2.2, 2.8, "#5d6059");
      part(`${name} windows`, x, top - 0.8, 0, length - 0.6, 0.5, 2.84, "#27343b");
      for (const dx of [-length / 2 + 0.8, length / 2 - 0.8]) for (const z of [-1, 1])
        part(`${name} strut`, x + dx, (top + bottom(x + dx)) / 2, z, 0.12, bottom(x + dx) - top + 0.1, 0.12, "#3d413e");
      return top - 1.1;
    };
    gondola(51, 9, "control car");
    part("control car nose", 56.2, bottom(51) - 1.85, 0, 1.4, 1.7, 2.2, "#5d6059");
    const aft = gondola(-51, 7, "aft engine car");
    const propeller = (x: number, y: number, z: number) => {
      part("propeller hub", x, y, z, 0.3, 0.3, 0.3, "#2f3230");
      part("propeller blade", x - 0.05, y, z, 0.07, 3.4, 0.24, "#5a4632");
      part("propeller blade", x - 0.05, y, z, 0.07, 0.24, 3.4, "#5a4632");
    };
    propeller(-55, aft, 0);
    // Rails are bars on posts.
    for (const b of this.map.boxes) {
      if (!/^zep-(bow-)?rail-/.test(b.id ?? "")) continue;
      const long = b.w >= b.d, length = long ? b.w : b.d, floor = (b.baseY ?? 0) - 0.95;
      for (let s = -length / 2; s <= length / 2 + 1e-6; s += Math.max(0.6, length / Math.ceil(length / 1.6)))
        part("rail post", long ? b.x + s : b.x, floor + 0.5, long ? b.z : b.z + s, 0.06, 1.0, 0.06, "#454a47");
    }
    // Duralumin frames: a post up each keel wall and a beam across every 2.5 m;
    // in the gallery, a post up each gas-cell wall every 5 m, with stringers
    // along them. Warm lamps hang between.
    const duralumin = "#9aa098", { gallery, keel } = layout.levels;
    const open = (x: number) => Math.abs(x) < 10.5 || Math.abs(Math.abs(x) - 30) < 6.5 || Math.abs(x) > 48.8;
    for (let x = -48.75; x <= 48.75; x += 2.5) {
      if (open(x)) continue;
      for (const z of [-1.95, 1.95]) part("keel post", x, keel + 1.4, z, 0.1, 2.8, 0.1, duralumin);
      part("keel beam", x, keel + 2.74, 0, 0.1, 0.1, 4, duralumin);
    }
    for (let x = -50; x <= 50; x += 5) {
      if (open(x) && Math.abs(x) <= 48.8) continue;
      for (const z of [-1.45, 1.45]) part("gallery post", x, (gallery + 12.5) / 2, z, 0.1, 12.5 - gallery, 0.1, duralumin);
      part("gallery beam", x, 9.3, 0, 0.1, 0.1, 3, duralumin);
    }
    for (const [x0, x1] of [[-51, -36], [-24, -10], [10, 24], [36, 51]])
      for (const y of [7.2, 9.6, 11.6]) for (const z of [-1.47, 1.47])
        part("gallery stringer", (x0 + x1) / 2, y, z, x1 - x0, 0.08, 0.06, duralumin);
    const lamp = (x: number, y: number, z: number) => {
      const glass = part("airship lamp", x, y, z, 0.2, 0.14, 0.2, "#ffd9a0");
      let glow = this.materials.get("zeppelin lamp");
      if (!glow) { glow = new pc.StandardMaterial(); glow.useLighting = false; glow.emissive = color("#ffd9a0"); glow.update(); this.materials.set("zeppelin lamp", glow); }
      glass.render!.material = glow;
      glass.render!.castShadows = false;
    };
    for (const x of [-46.25, -38.75, -21.25, -13.75, 13.75, 21.25, 38.75, 46.25]) { lamp(x, keel + 2.6, 0); lamp(x + 1.25, gallery + 2.4, x > 0 ? -1.4 : 1.4); }
    for (const x of [-30, 0, 30]) for (const z of [-3.5, 3.5]) lamp(x + z, 9.4, z);
    // Each walkable engine car carries its engine and propeller at its after end.
    for (const c of layout.engineCars) {
      const z = (c.z0 + c.z1) / 2, side = Math.sign(z), inner = side > 0 ? c.z0 : c.z1;
      part("engine", c.x0 - 0.75, 1.1, z, 1.5, 1.6, 1.9, "#4c504b");
      propeller(c.x0 - 1.65, 1.1, z);
      for (const x of [c.x0 + 0.5, c.x1 - 0.5]) part("engine car strut", x, 3.6, inner + side * 0.15, 0.12, 2.1, 0.12, "#3d413e");
    }
    this.batchGroup = previous;
  }
  private buildFort() {
    const fort = this.map.fort!;
    const previous = this.batchGroup;
    this.fortRoof = this.joint("fort roof", this.mapRoot);
    const roof = this.fortRoof;
    const slab = (name: string, r: FortRect, top: number, h: number, tint: string,
      parent: pc.Entity, surface: ArchitectureSurface = "fort-stone") => {
      const w = r.x1 - r.x0, d = r.z1 - r.z0;
      const e = this.cube(name, (r.x0 + r.x1) / 2, top - h / 2, (r.z0 + r.z1) / 2, w, h, d, tint, false, parent);
      this.fortStone(e, w, h, d, tint, surface);
      return e;
    };
    for (const b of fort.ceilings) {
      const rect = { x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2 };
      this.batchGroup = this.mapBatch;
      slab("passage floor", rect, .022, .035, "#736d60", this.mapRoot, "slate");
      this.batchGroup = -1;
      slab("concrete overhead", rect, b.baseY! + b.h, b.h, "#777a71", roof, "fort-concrete");
    }
    this.batchGroup = this.mapBatch;
    const { yard, yardPassage } = fort;
    const mouthStart = yardPassage.z - yardPassage.width / 2;
    const mouthEnd = yardPassage.z + yardPassage.width / 2;
    const drainX = (yard.x0 + yard.x1) / 2;
    const drainWidth = .44;
    slab("west yard paving", { ...yard, x1: drainX - drainWidth / 2 }, .045, .06, "#a29988", this.mapRoot);
    slab("east yard paving", { ...yard, x0: drainX + drainWidth / 2 }, .045, .06, "#a29988", this.mapRoot);
    slab("yard drainage channel", { ...yard, x0: drainX - drainWidth / 2, x1: drainX + drainWidth / 2 },
      .01, .025, "#42483e", this.mapRoot, "slate");
    for (const side of [-1, 1]) {
      const edge = drainX + side * drainWidth / 2;
      slab("stone drain edging", { ...yard, x0: edge - .055, x1: edge + .055 },
        .05, .046, "#a6a399", this.mapRoot);
    }
    for (const end of [yard.z0 + .45, yard.z1 - .45]) {
      for (let bar = -3; bar <= 3; bar++) {
        this.cube("iron drain grate", drainX, .026, end + bar * .09, drainWidth, .032, .043, "#434640", false, this.mapRoot);
      }
    }
    const overhang = .28;
    const coping = (rect: FortRect) =>
      slab("yard wall coping", rect, 4.46, .21, "#a8a699", this.mapRoot);
    for (const z of [yard.z0, yard.z1]) {
      coping({ x0: yard.x0 - overhang, x1: yard.x1 + overhang, z0: z - overhang, z1: z + overhang });
    }
    for (const x of [yard.x0, yard.x1]) {
      coping({ x0: x - overhang, x1: x + overhang, z0: yard.z0 + overhang, z1: mouthStart });
      coping({ x0: x - overhang, x1: x + overhang, z0: mouthEnd, z1: yard.z1 - overhang });
      // The stone frame sits outside the clear passage and carries the visible end of its roof.
      const portal = { x0: x - .45, x1: x + .45, z0: mouthStart - .37, z1: mouthEnd + .37 };
      slab("yard portal lintel", portal, 3.42, .585, "#b0a18c", this.mapRoot);
      slab("yard portal cornice", { ...portal, x0: x - .52, x1: x + .52 },
        4.50, .27, "#a8a699", this.mapRoot);
      for (const jamb of [{ ...portal, z1: mouthStart + .22 }, { ...portal, z0: mouthEnd - .22 }]) {
        slab("yard portal jamb", jamb, 2.85, 2.85, "#b0a18c", this.mapRoot);
      }
      slab("yard threshold", { x0: x - .46, x1: x + .46, z0: mouthStart, z1: mouthEnd },
        .054, .065, "#a9a79a", this.mapRoot);
    }
    this.fortYardBanks(yard, mouthStart, mouthEnd);
    for (const room of fort.rooms.filter(r => r.vault)) {
      this.batchGroup = this.mapBatch;
      slab(`${room.name} floor`, room, .023, .035, room.id === "barracks" ? "#9a8061" : "#78827b",
        this.mapRoot, room.id === "barracks" ? "floorboards" : "slate");
      this.batchGroup = -1;
      const ceiling = this.joint(`${room.name} barrel vault`, roof);
      const mesh = this.modelMesh(`vault:${room.id}`, () => {
        const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
        for (let i = 0; i <= fortVault.segments; i++) {
          const f = i / fortVault.segments, z = room.z0 + (room.z1 - room.z0) * f;
          positions.push(room.x0, fortVaultHeight(f), z, room.x1, fortVaultHeight(f), z);
          uvs.push(room.x0 / 3.8, z / 3.8, room.x1 / 3.8, z / 3.8);
          if (i < fortVault.segments) indices.push(i * 2, i * 2 + 1, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 2);
        }
        return { positions, uvs, indices, normals: pc.calculateNormals(positions, indices) };
      });
      const material = this.surfaceMaterial("fort-concrete", "#8d918a");
      ceiling.addComponent("render", { meshInstances: [new pc.MeshInstance(mesh, material, ceiling)], castShadows: true, receiveShadows: true });
    }
    this.batchGroup = -1;
    const { water } = fort;
    const surface = this.cube("cistern water", (water.x0 + water.x1) / 2, fort.waterHeight - .015, (water.z0 + water.z1) / 2,
      water.x1 - water.x0, .03, water.z1 - water.z0, "#485954", false, this.mapRoot);
    let waterMaterial = this.materials.get("cistern water");
    if (!waterMaterial) {
      waterMaterial = new pc.StandardMaterial();
      waterMaterial.diffuse = color("#292d25");
      waterMaterial.emissive = color("#0a1210");
      waterMaterial.specular = color("#929b8e");
      waterMaterial.gloss = .79;
      waterMaterial.opacity = .87;
      waterMaterial.blendType = pc.BLEND_NORMAL;
      waterMaterial.depthWrite = false;
      waterMaterial.normalMap = this.texture("cistern ripples", 128, 128, () => cisternWaterNormals());
      waterMaterial.normalMapTiling.set(2, 2);
      waterMaterial.bumpiness = .8;
      waterMaterial.update();
      this.materials.set("cistern water", waterMaterial);
    }
    surface.render!.material = waterMaterial;
    surface.render!.castShadows = false;

    const fortLight = (name: string, x: number, y: number, z: number, tint: string, intensity: number, range: number) => {
      const light = this.joint(name, this.mapRoot, x, y, z);
      light.addComponent("light", { type: "omni", color: color(tint), intensity, range, castShadows: false });
      return light;
    };
    const lamp = (x: number, z: number, tint: string, intensity: number, range: number, fixture = true) => {
      const light = fortLight("fort light", x, 2.47, z, tint, intensity, range);
      if (!fixture) return;
      const metal = "#3c3530";
      this.cube("lantern base", 0, -.22, 0, .20, .075, .20, metal, false, light);
      this.cube("lantern roof", 0, .14, 0, .22, .10, .22, metal, false, light);
      this.cube("lantern hook", 0, .28, 0, .046, .22, .05, metal, false, light);
      const glass = this.cube("lantern glass", 0, -.04, 0, .14, .31, .14, tint, false, light);
      let glow = this.materials.get(`fort lantern ${tint}`);
      if (!glow) {
        glow = new pc.StandardMaterial(); glow.useLighting = false; glow.emissive = color(tint); glow.update();
        this.materials.set(`fort lantern ${tint}`, glow);
      }
      glass.render!.material = glow;
      glass.render!.castShadows = false;
      for (const dx of [-.08, .08]) for (const dz of [-.08, .08])
        this.cube("lantern frame", dx, -.04, dz, .018, .36, .018, metal, false, light);
    };
    for (const [x, z] of [[-49, -.9], [-32, -3.7], [-25, 4.2], [-17, 1.3], [-5.7, 4.8], [-2.8, -5.7], [4.3, 5.6],
      [-30, -18], [-12, -16], [2.6, -14.5], [14, -16], [30, -19], [-29, 16.5], [29, 15], [46, 0]])
      lamp(x, z, "#ffbd77", 1.6, 7.2);
    lamp(6.4, -3.9, "#a6c5d6", 1.4, 9, false);
    lamp(16, -3, "#a2bdcc", 1.15, 8, false);
    lamp(30, -2.3, "#c4d7df", 1.8, 10, false);
    lamp(53, -2, "#b4ccda", 1.5, 8, false);

    fortLight("sunken yard daylight", (yard.x0 + yard.x1) / 2, 4.6, yardPassage.z, "#cee0ed", 2.35, 13);
    for (const [facing, edge] of [[-1, yard.x0], [1, yard.x1]]) {
      fortLight("yard doorway daylight", edge - facing * .85, 2.5, yardPassage.z, "#d8e7ef", 1.35, 5.4);
      const x = edge + facing * .72, y = 2.53, z = yardPassage.z;
      this.cube("yard sign backing", x, y, z, .075, .39, 1.55, "#393228", false, this.mapRoot);
      for (const offset of [-.59, .59]) {
        this.cube("yard sign bracket", x, 2.79, z + offset, .037, .15, .037, "#64594a", false, this.mapRoot);
      }
      this.fortSign("COUR", x + facing * .041, y, z, facing * 90, "SUNKEN YARD");
    }

    this.fortPortal(-7.86, 3, 90, 1.86);
    this.fortPortal(7.86, -3, -90, 1.86);
    this.fortPortal(0, -6.88, 0, 1.65);
    this.fortSign("CASEMATE", 7.85, 3.22, -3, -90);
    this.fortSign("STORES", 0, 2.98, -6.25, 0);
    this.fortSign("BARRACKS", -7.85, 3.25, 3, 90);
    this.fortSign("CISTERNE", -22.05, 3.23, 0, -90);
    this.fortSign("CISTERNE", 22.05, 3.23, 0, 90);
    this.batchGroup = previous;
  }
  private fortYardBanks(yard: FortRect, mouthStart: number, mouthEnd: number) {
    const sides = [
      { x: yard.x0, z: yard.z0, dx: yard.x1 - yard.x0, dz: 0, nx: 0, nz: -1 },
      { x: yard.x1, z: yard.z1, dx: yard.x0 - yard.x1, dz: 0, nx: 0, nz: 1 },
      { x: yard.x0, z: mouthStart, dx: 0, dz: yard.z0 - mouthStart, nx: -1, nz: 0 },
      { x: yard.x0, z: yard.z1, dx: 0, dz: mouthEnd - yard.z1, nx: -1, nz: 0 },
      { x: yard.x1, z: yard.z0, dx: 0, dz: mouthStart - yard.z0, nx: 1, nz: 0 },
      { x: yard.x1, z: mouthEnd, dx: 0, dz: yard.z1 - mouthEnd, nx: 1, nz: 0 },
    ];
    const profile = [
      { inset: .23, y: 4.29, turf: 0 },
      { inset: .62, y: 4.86, turf: .15 },
      { inset: 1.23, y: 5.36, turf: 1 },
      { inset: 2.14, y: 5.27, turf: 1 },
      { inset: 3, y: 4.24, turf: .55 },
    ];
    const crest = (x: number, z: number) => (lookNoise(x * .6, z * .6, 29) - .5) * .42;
    const bankHeight = (y: number, turf: number, x: number, z: number, along: number, length: number) => {
      const taper = Math.min(1, .2 + Math.min(along, length - along) / 1.3);
      return 4.29 + (y - 4.29 + crest(x, z) * (.35 + .65 * turf)) * taper;
    };
    const bank = this.modelMesh("fort sunken yard earth", () => {
      const positions: number[] = [], uvs: number[] = [], indices: number[] = [], colors: number[] = [];
      for (const { x, z, dx, dz, nx, nz } of sides) {
        const length = Math.hypot(dx, dz);
        const steps = Math.ceil(length * 1.35);
        const start = positions.length / 3, rows = profile.length;
        for (let i = 0; i <= steps; i++) {
          for (const { inset, y, turf } of profile) {
            const px = x + dx * i / steps + nx * inset, pz = z + dz * i / steps + nz * inset;
            positions.push(px, bankHeight(y, turf, px, pz, length * i / steps, length), pz);
            uvs.push(px * .4, pz * .4);
            const tone = lookNoise(px * 1.8, pz * 1.8, 19) * .15;
            colors.push(.44 - .04 * turf + tone, .31 + .16 * turf + tone, .22 + .025 * turf + tone, 1);
          }
          if (i === steps) continue;
          for (let j = 0; j < rows - 1; j++) {
            const a = start + i * rows + j, b = a + rows;
            indices.push(a, b, a + 1, a + 1, b, b + 1);
          }
        }
      }
      return { positions, uvs, indices, colors, normals: pc.calculateNormals(positions, indices) };
    });
    const materialKey = "fort yard earth";
    let material = this.materials.get(materialKey);
    if (!material) {
      material = this.surfaceMaterial("fort-concrete", "#ffffff").clone();
      material.diffuseVertexColor = true;
      material.gloss = .24;
      material.update();
      this.materials.set(materialKey, material);
    }
    const root = this.joint("earth banks beyond the yard walls", this.mapRoot);
    root.addComponent("render", {
      meshInstances: [new pc.MeshInstance(bank, material, root)],
      batchGroupId: this.mapBatch,
    });
    const { inset, y } = profile[2];
    for (const { x, z, dx, dz, nx, nz } of sides) {
      const length = Math.hypot(dx, dz);
      const tufts = Math.ceil(length * .92);
      for (let i = 0; i < tufts; i++) {
        const offset = (i + .5) / tufts;
        const px = x + dx * offset + nx * inset, pz = z + dz * offset + nz * inset;
        const height = bankHeight(y, 1, px, pz, length * offset, length) - .055;
        const patch = this.forestPart("yard crest grass", "grass", i % 4, px, height, pz,
          .8, .31 + lookNoise(px, pz, 31) * .33, .82, i % 3 === 0 ? "#797a4d" : "#667347", root);
        patch.render!.castShadows = false;
      }
    }
  }
  private fortPortal(x: number, z: number, yaw: number, halfWidth: number) {
    const portal = this.joint("stone portal", this.mapRoot, x, 0, z);
    portal.setEulerAngles(0, yaw, 0);
    const tint = "#a19885";
    for (const side of [-1, 1]) {
      const jamb = this.cube("portal jamb", side * (halfWidth + .09), 1.025, 0, .18, 2.05, .23, tint, false, portal);
      this.fortStone(jamb, .18, 2.05, .23, tint);
    }
    const mesh = this.modelMesh(`fort-arch:${halfWidth}`, () => {
      const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
      for (let i = 0; i <= 12; i++) {
        const angle = Math.PI * i / 12, c = Math.cos(angle), s = Math.sin(angle);
        for (const trim of [0, .20]) {
          const px = (halfWidth + trim) * c, py = 2.05 + (.72 + trim) * s;
          positions.push(px, py, .115);
          uvs.push(px * .8, py * .8);
        }
        if (i < 12) indices.push(i * 2, i * 2 + 1, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 2);
      }
      return { positions, uvs, indices, normals: pc.calculateNormals(positions, indices) };
    });
    portal.addComponent("render", { meshInstances: [new pc.MeshInstance(mesh, this.surfaceMaterial("fort-stone", tint), portal)] });
  }
  private fortSign(label: string, x: number, y: number, z: number, yaw: number, subtitle?: string) {
    const key = `fort sign:${label}${subtitle ? `/${subtitle}` : ""}`;
    let material = this.materials.get(key);
    if (!material) {
      const texture = this.texture(key, 256, 64, () => {
        const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 64;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#30291f"; ctx.fillRect(0, 0, 256, 64);
        ctx.strokeStyle = "#746347"; ctx.strokeRect(3, 3, 250, 58);
        ctx.font = subtitle ? "bold 25px serif" : "bold 34px sans-serif";
        ctx.fillStyle = "#e0cba1"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(label, 128, subtitle ? 23 : 33);
        if (subtitle) {
          ctx.font = "bold 17px sans-serif";
          ctx.fillText(subtitle, 128, 45);
        }
        return new Uint8Array(ctx.getImageData(0, 0, 256, 64).data);
      }, false);
      material = new pc.StandardMaterial();
      material.useLighting = false; material.emissive = color("#ffffff"); material.emissiveMap = texture; material.update();
      this.materials.set(key, material);
    }
    const sign = this.joint(label, this.mapRoot, x, y, z);
    sign.addComponent("render", { type: "plane", material, castShadows: false });
    sign.setEulerAngles(90, yaw, 0);
    sign.setLocalScale(1.55, 1, .39);
  }
  // Distant land, the continuing front and its silhouettes as three static
  // meshes, plus a few animated entities that Low quality leaves out.
  private buildBackdrop() {
    const device = this.app.graphicsDevice, root = this.joint("backdrop", this.mapRoot);
    const ground = backdropGround(this.map), land = new pc.Mesh(device);
    land.setPositions(ground.positions);
    land.setNormals(ground.normals);
    land.setUvs(0, ground.uvs!);
    land.setVertexStream(pc.SEMANTIC_TANGENT, pc.calculateTangents(ground.positions, ground.normals, ground.tangentUvs!, ground.indices), 4);
    land.setColors(ground.colors);
    land.setIndices(ground.indices);
    land.update(pc.PRIMITIVE_TRIANGLES);
    const soil = this.surfaceMaterial("mud", "#ffffff");
    soil.diffuseVertexColor = true;
    soil.update();
    const scenery = this.map.id === "verdun" ? verdunBackdropScenery(this.map) : backdropScenery(this.map);
    const solids = backdropBoxMesh(scenery.boxes), shapes = new pc.Mesh(device);
    if (solids.indices.length) {
      shapes.setPositions(solids.positions);
      shapes.setNormals(solids.normals);
      shapes.setColors(solids.colors);
      shapes.setIndices(solids.indices);
      shapes.update(pc.PRIMITIVE_TRIANGLES);
    }
    const painted = this.paintedMaterial();
    const wires = new pc.Mesh(device), wireLines = new Float32Array(scenery.lines);
    if (wireLines.length) {
      wires.setPositions(wireLines);
      wires.setNormals(new Float32Array(wireLines.length).map((_, i) => (i % 3 === 1 ? 1 : 0)));
      wires.update(pc.PRIMITIVE_LINES);
    }
    // A backdrop may have no silhouettes or wires (Gallipoli): an empty mesh cannot be drawn.
    const instances = [new pc.MeshInstance(land, soil, root), ...(solids.indices.length ? [new pc.MeshInstance(shapes, painted, root)] : []), ...(wireLines.length ? [new pc.MeshInstance(wires, this.material("#2b2824"), root)] : [])];
    for (const instance of instances) instance.castShadow = false;
    root.addComponent("render", { meshInstances: instances });
    const life = this.joint("backdrop life", root);
    const shape = (name: string, parent: pc.Entity, type: "box" | "sphere" | "plane", material: pc.Material, scale: [number, number, number], at: [number, number, number] = [0, 0, 0]) => {
      const e = this.joint(name, parent, ...at);
      e.addComponent("render", { type, material, castShadows: false, receiveShadows: false });
      e.setLocalScale(...scale);
      return e;
    };
    const { balloons: balloonSpecs, smoke: smokeColumns } = backdropLife(this.map);
    const balloons = balloonSpecs.map((b) => {
      const balloon = this.joint("observation balloon", life, b.x, b.y, b.z);
      const canvas = this.material("#9d9784");
      shape("balloon envelope", balloon, "sphere", canvas, [6.5, 6.5, 17]);
      for (const [x, y, w, h] of [[0, 3.6, 0.3, 4.5], [3.4, -1.2, 4.2, 0.3], [-3.4, -1.2, 4.2, 0.3]])
        shape("balloon fin", balloon, "box", canvas, [w, h, 3.8], [x, y, -8.4]);
      shape("balloon basket", balloon, "box", this.material("#4a3f31"), [1.2, 1, 1.2], [0, -5.5, 1]);
      shape("balloon tether", balloon, "box", this.material("#2b2824"), [0.05, b.y, 0.05], [0, -b.y / 2 - 5, 1]);
      return balloon;
    });
    const smoke = this.billboards("distant smoke", life, smokeColumns.length * 12, "#86888a", 0.42);
    const flashes = Array.from({ length: 3 }, () => {
      const glowMaterial = this.dustMaterial("#ffd08a", true), plumeMaterial = this.dustMaterial("#4d4740");
      return { glow: shape("distant burst", life, "plane", glowMaterial, [1, 1, 1]), plume: shape("distant burst plume", life, "plane", plumeMaterial, [1, 1, 1]), glowMaterial, plumeMaterial };
    });
    const flares = Array.from({ length: 2 }, () => {
      const material = this.dustMaterial("#f2ffe6", true);
      return { glow: shape("distant flare", life, "plane", material, [1, 1, 1]), material };
    });
    this.backdrop = { life, balloons, smoke, flashes, flares };
    life.enabled = this.quality !== "low";
  }
  // Woods carried on past Verdun's boundary wire, from the field's own tree
  // models. Presentation only: no collision, no shadows, batched by 32 m cell.
  private buildDeadZoneForest() {
    const root = this.joint("dead zone forest", this.mapRoot), previous = this.batchGroup;
    for (const tree of verdunDeadZoneTrees(this.map)) {
      this.batchGroup = this.worldBatch(this.mapBatch, tree.x, tree.z);
      const holder = this.joint(tree.id, root, tree.x, groundHeight(tree.x, tree.z, this.map) - 0.05, tree.z);
      holder.setLocalEulerAngles(0, tree.yaw, 0);
      const crowned = tree.treeStyle !== "bare" && tree.treeStyle !== "snapped", variant = forestVariant(tree.id);
      const parts = [
        this.forestPart("tapered bark trunk", "trunk", variant, 0, 0, 0, tree.w, tree.h, tree.w, tree.treeStyle === "snapped" ? "#4f463a" : "#665746", holder),
        this.forestPart("fine branching limbs", crowned ? "limbs" : "deadLimbs", variant, 0, 0, 0, tree.h, tree.h, tree.h, "#62513f", holder),
      ];
      if (crowned)
        parts.push(this.forestPart("ragged woodland crown", tree.treeStyle === "pine" ? "pine" : "crown", variant, 0, 0, 0, tree.h, tree.h, tree.h, tree.treeStyle === "pine" ? "#536047" : "#626d4f", holder));
      for (const part of parts) part.render!.castShadows = false;
    }
    this.batchGroup = previous;
  }
  // Mesh instances the scene would submit before culling: the total, and the
  // share under each named presentation root. Renderer-independent, so it can be
  // compared across machines where frame times cannot.
  drawables() {
    const all = new Set<pc.MeshInstance>();
    for (const layer of this.app.scene.layers.layerList) for (const instance of layer.meshInstances) all.add(instance);
    const roots: Record<string, number> = {};
    for (const child of this.mapRoot?.children ?? []) {
      let n = 0;
      for (const render of (child as pc.Entity).findComponents("render") as pc.RenderComponent[])
        if (render.enabled && render.entity.enabled) n += render.meshInstances.filter((m) => all.has(m)).length;
      if (n > 8) roots[child.name] = (roots[child.name] ?? 0) + n;
    }
    return { total: all.size, roots };
  }
  // Vertex-coloured, lightly lit boxes shared by the backdrop and trench dressing.
  private paintedMaterial() {
    let painted = this.materials.get("backdrop scenery");
    if (!painted) {
      painted = new pc.StandardMaterial();
      painted.diffuseVertexColor = true;
      painted.gloss = 0.08;
      painted.update();
      this.materials.set("backdrop scenery", painted);
    }
    return painted;
  }
  private glowMaterial(hex: string) {
    const key = `glow ${hex}`;
    let m = this.materials.get(key);
    if (!m) {
      m = new pc.StandardMaterial();
      m.diffuse = color("#000000");
      m.emissive = color(hex);
      m.useLighting = false;
      m.update();
      this.materials.set(key, m);
    }
    return m;
  }
  private revetmentMaterial(style: Exclude<RevetmentStyle, "timber">) {
    const key = `revetment ${style}`;
    let m = this.materials.get(key);
    if (!m) {
      m = new pc.StandardMaterial();
      m.diffuseMap = this.texture(key, 128, 64, () => revetmentPixels(style));
      m.diffuseMap.srgb = true;
      m.gloss = style === "corrugated" ? 0.32 : 0.1;
      m.update();
      this.materials.set(key, m);
    }
    return m;
  }
  // Standing water in old craters and flat debris, then the wire belts.
  private buildNoMansLand() {
    this.dryPonds = undefined;
    const device = this.app.graphicsDevice, root = this.joint("no-man's land", this.mapRoot);
    const pond = new pc.Mesh(device), positions: number[] = [], normals: number[] = [], indices: number[] = [];
    for (const p of craterPonds(this.map)) {
      const centre = positions.length / 3;
      positions.push(p.x, p.y, p.z);
      normals.push(0, 1, 0);
      // The outline runs just under the bank all round, so the ground clips it.
      const n = p.edge.length;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        positions.push(p.x + Math.cos(a) * p.edge[i], p.y, p.z + Math.sin(a) * p.edge[i]);
        normals.push(0, 1, 0);
        indices.push(centre, centre + 1 + ((i + 1) % n), centre + 1 + i);
      }
    }
    const debris = backdropBoxMesh(noMansLandDebris(this.map)), litter = new pc.Mesh(device);
    litter.setPositions(debris.positions);
    litter.setNormals(debris.normals);
    litter.setColors(debris.colors);
    litter.setIndices(debris.indices);
    litter.update(pc.PRIMITIVE_TRIANGLES);
    const instances: pc.MeshInstance[] = [new pc.MeshInstance(litter, this.paintedMaterial(), root)];
    if (indices.length) {
      pond.setPositions(positions);
      pond.setNormals(normals);
      pond.setIndices(indices);
      pond.update(pc.PRIMITIVE_TRIANGLES);
      instances.push((this.dryPonds = new pc.MeshInstance(pond, this.sumpWater(), root)));
      // Under rain the flooded shell holes take their place.
      this.dryPonds.visible = !this.raining;
    }
    root.addComponent("render", { meshInstances: instances, castShadows: false });
    this.buildWireBelts();
  }
  // `near` is where a blast landed: segments within 10 m are resampled against
  // the cratered ground; the rest keep their cached geometry.
  private buildWireBelts(near?: { x: number; z: number }) {
    if (!this.map.wireBelts?.length) return;
    this.wireBelts?.destroy();
    const device = this.app.graphicsDevice, root = (this.wireBelts = this.joint("wire belts", this.mapRoot));
    const wire = wireBeltGeometry(this.map, this.wireCache, near && ((s) => Math.hypot(s.x - near.x, s.z - near.z) < 10));
    const solids = backdropBoxMesh(wire.boxes), posts = new pc.Mesh(device);
    posts.setPositions(solids.positions);
    posts.setNormals(solids.normals);
    posts.setColors(solids.colors);
    posts.setIndices(solids.indices);
    posts.update(pc.PRIMITIVE_TRIANGLES);
    const strands = new pc.Mesh(device), lines = new Float32Array(wire.lines);
    strands.setPositions(lines);
    strands.setNormals(new Float32Array(lines.length).map((_, i) => (i % 3 === 1 ? 1 : 0)));
    strands.update(pc.PRIMITIVE_LINES);
    const instances = [new pc.MeshInstance(posts, this.paintedMaterial(), root), new pc.MeshInstance(strands, this.material("#2b2824"), root)];
    instances[0].castShadow = true;
    instances[1].castShadow = false;
    root.addComponent("render", { meshInstances: instances });
  }
  // Crater ponds and trench sumps use the same muted water as the old puddles.
  private sumpWater() {
    let material = this.materials.get("shallow muddy water");
    if (!material) {
      material = new pc.StandardMaterial();
      material.diffuse = color("#41483c");
      // Sky reflections stay muted so shallow water doesn't read as ice.
      material.specular = color("#5f6c6f");
      material.gloss = 0.92;
      material.emissive = color("#121a1c");
      material.update();
      this.materials.set("shallow muddy water", material);
    }
    return material;
  }
  // Parados sandbags, props, dugouts, signs and sump water along the lines.
  // What burns after dark: a light at every lamp the darkness rule knows about
  // (src/night.ts), a shaded lamp on each flagpole, and tape through the wire lanes.
  private nightVision?: pc.Entity;
  private flareRigs: { light: pc.Entity; core: pc.Entity; halo: pc.Entity }[] = [];
  // The flash of the last few bursts, and the embers they leave in their craters.
  private burstLights: { light: pc.Entity; bornAt: number; radius: number }[] = [];
  private craterGlows: pc.Entity[] = [];
  private buildNight() {
    const root = this.joint("night lamps", this.mapRoot);
    const vision = this.look.nightVision;
    if (vision) {
      this.nightVision = this.joint("night vision", this.app.root);
      this.nightVision.addComponent("light", { type: "omni", color: color(vision.color), intensity: vision.intensity, range: vision.range, castShadows: false });
    }
    // Up to three flares burn as lights at once; any more are left dark.
    this.flareRigs = Array.from({ length: 3 }, () => {
      const light = this.joint("flare light", root);
      light.addComponent("light", { type: "omni", color: color("#eaf4d6"), intensity: 0, range: 70, castShadows: false });
      const quad = (name: string, hex: string) => {
        const e = this.joint(name, root);
        e.addComponent("render", { type: "plane", material: this.dustMaterial(hex, true), castShadows: false, receiveShadows: false });
        return e;
      };
      const rig = { light, core: quad("flare", "#ffffff"), halo: quad("flare halo", "#dcefc6") };
      rig.light.enabled = rig.core.enabled = rig.halo.enabled = false;
      return rig;
    });
    this.burstLights = Array.from({ length: 3 }, () => {
      const light = this.joint("burst light", root);
      light.addComponent("light", { type: "omni", color: color("#ffd9a0"), intensity: 0, range: 40, castShadows: false });
      light.enabled = false;
      return { light, bornAt: -1e9, radius: 0 };
    });
    this.craterGlows = Array.from({ length: 6 }, () => {
      const glow = this.joint("crater embers", root);
      glow.addComponent("render", { type: "plane", material: this.dustMaterial("#ff6a20", true), castShadows: false, receiveShadows: false });
      glow.enabled = false;
      return glow;
    });
    const glow = { brazier: ["#ff8a3a", 2.0], lantern: ["#ffc878", 0.9], flag: ["#ffdca8", 0.8] } as const;
    for (const lamp of nightLamps(this.map)) {
      const [tint, intensity] = glow[lamp.kind];
      // Useful light reaches the lamp's radius; the falloff runs on a little past it.
      this.joint(`${lamp.kind} light`, root, lamp.x, lamp.y + 0.25, lamp.z)
        .addComponent("light", { type: "omni", color: color(tint), intensity, range: lamp.radius * 1.35, castShadows: false });
      if (lamp.kind === "flag") {
        this.cube("flag lamp", lamp.x + 0.09, lamp.y, lamp.z, 0.1, 0.15, 0.1, "#000000", false, root).render!.material = this.glowMaterial("#ffd9a0");
        this.cube("flag lamp cap", lamp.x + 0.09, lamp.y + 0.1, lamp.z, 0.13, 0.04, 0.13, "#2a2621", false, root);
      }
    }
    const tape = backdropBoxMesh(tapeBoxes(this.map)), mesh = new pc.Mesh(this.app.graphicsDevice);
    mesh.setPositions(tape.positions);
    mesh.setNormals(tape.normals);
    mesh.setColors(tape.colors);
    mesh.setIndices(tape.indices);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    const lanes = this.joint("lane tape", root), instance = new pc.MeshInstance(mesh, this.paintedMaterial(), lanes);
    instance.castShadow = false;
    lanes.addComponent("render", { meshInstances: [instance], castShadows: false });
  }
  private buildTrenchDressing() {
    const device = this.app.graphicsDevice, root = this.joint("trench dressing", this.mapRoot);
    const props = trenchProps(this.map, brazierSites(this.map));
    const solids = backdropBoxMesh([...paradosBags(this.map), ...props.boxes, ...dugouts(this.map).flatMap(dugoutBoxes)]);
    const shapes = new pc.Mesh(device);
    if (solids.indices.length) {
      shapes.setPositions(solids.positions);
      shapes.setNormals(solids.normals);
      shapes.setColors(solids.colors);
      shapes.setIndices(solids.indices);
      shapes.update(pc.PRIMITIVE_TRIANGLES);
    }
    const cable = new pc.Mesh(device), cableLines = new Float32Array(props.cable);
    if (cableLines.length) {
      cable.setPositions(cableLines);
      cable.setNormals(new Float32Array(cableLines.length).map((_, i) => (i % 3 === 1 ? 1 : 0)));
      cable.update(pc.PRIMITIVE_LINES);
    }
    const water = new pc.Mesh(device), wp: number[] = [], wn: number[] = [], wi: number[] = [];
    for (const p of props.water) {
      const y = groundHeight(p.x, p.z, this.map) + 0.012, first = wp.length / 3;
      for (const [dx, dz] of [[-0.62, -0.42], [-0.62, 0.42], [0.62, 0.42], [0.62, -0.42]]) { wp.push(p.x + dx, y, p.z + dz); wn.push(0, 1, 0); }
      wi.push(first, first + 1, first + 2, first, first + 2, first + 3);
    }
    if (wi.length) {
      water.setPositions(wp);
      water.setNormals(wn);
      water.setIndices(wi);
      water.update(pc.PRIMITIVE_TRIANGLES);
    }
    const solidsInstance = new pc.MeshInstance(shapes, this.paintedMaterial(), root), cableInstance = new pc.MeshInstance(cable, this.material("#1f1c18"), root), waterInstance = new pc.MeshInstance(water, this.sumpWater(), root);
    solidsInstance.castShadow = true;
    cableInstance.castShadow = waterInstance.castShadow = false;
    // Short lines (Gallipoli's) may have no cable or sump water: leave empty meshes out.
    const instances = [[solidsInstance, solids.indices.length], [cableInstance, cableLines.length], [waterInstance, wi.length]].filter(([, n]) => n).map(([m]) => m as pc.MeshInstance);
    root.addComponent("render", { meshInstances: instances });
    for (const e of props.embers) this.cube("brazier embers", e.x, (e.y ?? 0) + 0.02, e.z, 0.36, 0.04, 0.36, "#000000", false, root).render!.material = this.glowMaterial("#ff7a2a");
    for (const l of props.lanterns) {
      this.cube("lantern", l.x, l.y, l.z, 0.12, 0.18, 0.12, "#000000", false, root).render!.material = this.glowMaterial("#ffcf7a");
      this.cube("lantern cap", l.x, l.y + 0.12, l.z, 0.14, 0.05, 0.14, "#2a2621", false, root);
    }
    for (const d of dugouts(this.map))
      this.cube("dugout lantern", d.x - d.rear * 0.16, d.floor + 1.55, d.z + 0.8, 0.11, 0.16, 0.11, "#000000", false, root).render!.material = this.glowMaterial("#ffcf7a");
    if (typeof document === "undefined") return;
    for (const sign of signboards(this.map)) {
      this.cube("signboard post", sign.x + sign.facing * 0.02, sign.y - 0.9, sign.z - 0.55, 0.08, 1.9, 0.08, "#4a3c2b", false, root);
      const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
      if (!ctx) continue;
      canvas.width = 256;
      canvas.height = 96;
      ctx.fillStyle = "#6f5c40";
      ctx.fillRect(0, 0, 256, 96);
      for (let y = 6; y < 96; y += 11) { ctx.fillStyle = y % 2 ? "#64533a" : "#7a6747"; ctx.fillRect(0, y, 256, 2); }
      ctx.fillStyle = "#1c1915";
      ctx.textAlign = "center";
      const [name, direction] = sign.text.split("\n");
      ctx.font = "bold 30px Georgia, serif";
      ctx.fillText(name, 128, 40, 236);
      ctx.font = "bold 34px Georgia, serif";
      ctx.fillText(direction, 128, 82);
      const texture = new pc.Texture(device, { width: 256, height: 96, format: pc.PIXELFORMAT_RGBA8, mipmaps: true, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR, addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE });
      texture.setSource(canvas);
      texture.srgb = true;
      const material = new pc.StandardMaterial();
      material.diffuseMap = texture;
      material.gloss = 0.1;
      material.update();
      // A quad facing into the trench, wound counter-clockwise for its reader,
      // whose right hand points along (0, 0, -facing).
      const right = -sign.facing, quad = new pc.Mesh(device), corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      quad.setPositions(corners.flatMap(([u, v]) => [sign.x + sign.facing * 0.01, sign.y + v * 0.19, sign.z + u * right * 0.5]));
      quad.setNormals(corners.flatMap(() => [sign.facing, 0, 0]));
      // The canvas uploads with its top row at v = 0.
      quad.setUvs(0, corners.flatMap(([u, v]) => [(u + 1) / 2, (1 - v) / 2]));
      quad.setIndices([0, 1, 2, 0, 2, 3]);
      quad.update(pc.PRIMITIVE_TRIANGLES);
      const board = this.joint("signboard", root);
      board.addComponent("render", { meshInstances: [new pc.MeshInstance(quad, material, board)], castShadows: true });
      this.cube("signboard backing", sign.x - sign.facing * 0.02, sign.y, sign.z, 0.04, 0.42, 1.06, "#4a3c2b", false, root);
    }
  }
  // A dynamic mesh of camera-facing quads sharing one smoke material.
  private billboards(name: string, parent: pc.Entity, capacity: number, hex: string, opacity: number) {
    const buffer = new BillboardBuffer(capacity), mesh = new pc.Mesh(this.app.graphicsDevice), material = this.dustMaterial(hex);
    material.opacity = opacity;
    material.opacityVertexColor = true;
    material.opacityVertexColorChannel = "a";
    material.update();
    mesh.setPositions(buffer.positions);
    mesh.setUvs(0, buffer.uvs);
    mesh.setColors32(buffer.colors);
    mesh.setIndices(buffer.indices);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    const entity = this.joint(name, parent), instance = new pc.MeshInstance(mesh, material, entity);
    instance.castShadow = false;
    // The quads move every frame and span the map; never cull the batch.
    instance.cull = false;
    entity.addComponent("render", { meshInstances: [instance], castShadows: false, receiveShadows: false });
    return { buffer, mesh };
  }
  private beginBillboards(batch: { buffer: BillboardBuffer }) {
    const r = this.camera.right, u = this.camera.up;
    batch.buffer.begin([r.x, r.y, r.z], [u.x, u.y, u.z]);
    return batch.buffer;
  }
  private endBillboards(batch: { buffer: BillboardBuffer; mesh: pc.Mesh }) {
    batch.buffer.end();
    batch.mesh.setPositions(batch.buffer.positions);
    batch.mesh.setColors32(batch.buffer.colors);
    batch.mesh.update(pc.PRIMITIVE_TRIANGLES, false);
  }
  private buildAtmosphere() {
    const atmosphere = this.look.atmosphere!, root = this.joint("atmosphere", this.mapRoot);
    const banks = mistBanks(this.map, atmosphere.fieldWidth), sites = brazierSites(this.map);
    const cloth = clothGeometry(clothScraps(this.map)), clothMesh = new pc.Mesh(this.app.graphicsDevice);
    clothMesh.setPositions(cloth.positions);
    clothMesh.setNormals(cloth.normals);
    clothMesh.setColors(cloth.colors);
    clothMesh.setIndices(cloth.indices);
    clothMesh.update(pc.PRIMITIVE_TRIANGLES);
    const scraps = this.joint("cloth on wire", root), clothInstance = new pc.MeshInstance(clothMesh, this.paintedMaterial(), scraps);
    clothInstance.castShadow = false;
    scraps.addComponent("render", { meshInstances: [clothInstance], castShadows: false });
    this.atmosphere = {
      root, banks, sites,
      fieldMist: this.billboards("field mist", root, banks.filter((b) => !b.trench).length || 1, "#bcc1c3", atmosphere.fieldMist),
      trenchMist: this.billboards("trench mist", root, banks.filter((b) => b.trench).length || 1, "#b4b9bb", atmosphere.trenchMist),
      brazierSmoke: this.billboards("brazier smoke", root, Math.max(1, sites.length * 6), "#9c9d99", 0.22),
      craterSmoke: this.billboards("smouldering craters", root, 30, "#5e5a55", 0.34),
      smoulders: Array.from({ length: 6 }, () => ({ at: null, bornAt: -1e9 })),
      cloth, clothMesh,
    };
    root.enabled = this.quality !== "low";
  }
  private drawAtmosphere(g: Game, alpha: number) {
    const a = this.atmosphere;
    if (!a?.root.enabled) return;
    const tick = g.tick + alpha, t = tick / 30;
    // Field banks drift along the front and wrap; trench banks only sway.
    // A bank closer than 7 m is left out rather than filling the screen.
    const eye = this.camera.getPosition(), span = playArea(this.map).depth + 30;
    const field = this.beginBillboards(a.fieldMist), trench = this.beginBillboards(a.trenchMist);
    a.banks.forEach((bank, i) => {
      const z = bank.trench
        ? bank.z + Math.sin(t * 0.2 + i) * 1.2
        : ((((bank.z + span / 2 + t * bank.drift) % span) + span) % span) - span / 2;
      if (Math.hypot(bank.x - eye.x, bank.y - eye.y, z - eye.z) > 7)
        (bank.trench ? trench : field).add(bank.x, bank.y, z, bank.w, bank.h, (i * 23) % 9 - 4);
    });
    this.endBillboards(a.fieldMist);
    this.endBillboards(a.trenchMist);
    const braziers = this.beginBillboards(a.brazierSmoke);
    a.sites.forEach((site, n) => {
      const y = groundHeight(site.x, site.z, this.map) + 0.6;
      for (let i = 0; i < 6; i++) {
        const rise = (t * 0.09 + i / 6 + n * 0.37) % 1, size = 0.5 + rise * 1.9;
        braziers.add(site.x + rise * 1.6 + Math.sin(t * 0.7 + i) * 0.15, y + rise * 6.5, site.z + Math.sin(i * 2.3 + n) * 0.2, size, size * 1.2, i * 41 + n * 17);
      }
    });
    this.endBillboards(a.brazierSmoke);
    const craters = this.beginBillboards(a.craterSmoke);
    for (const slot of a.smoulders) {
      const life = Math.max(0, 1 - (tick - slot.bornAt) / 30 / 25);
      if (!slot.at || life <= 0) continue;
      for (let i = 0; i < 5; i++) {
        const rise = (t * 0.07 + i / 5) % 1, size = 0.9 + rise * 3.4;
        craters.add(slot.at.x + rise * 2.4, slot.at.y + 0.3 + rise * 7, slot.at.z + Math.sin(i * 1.9) * 0.4, size, size * 1.15, i * 53, life);
      }
    }
    this.endBillboards(a.craterSmoke);
    a.cloth.update(t);
    a.clothMesh.setPositions(a.cloth.positions);
    a.clothMesh.setNormals(a.cloth.normals);
    a.clothMesh.update(pc.PRIMITIVE_TRIANGLES, false);
  }
  // The viewer's own night sight follows the camera, and each burning flare
  // carries a light down with it (src/flares.ts gives its place and strength).
  private drawNight(g: Game, alpha: number) {
    const eye = this.camera.getPosition(), tick = g.tick + alpha;
    this.nightVision?.setPosition(eye.x, eye.y + 1.4, eye.z);
    const burning = g.flares.flares
      .map((flare) => ({ at: starShellPosition(flare, tick), strength: flareBrightness(flare, tick) }))
      .filter((f): f is { at: NonNullable<ReturnType<typeof starShellPosition>>; strength: number } => !!f.at)
      .sort((a, b) => Math.hypot(a.at.x - eye.x, a.at.z - eye.z) - Math.hypot(b.at.x - eye.x, b.at.z - eye.z));
    this.flareRigs.forEach((rig, i) => {
      const flare = burning[i];
      rig.light.enabled = rig.core.enabled = rig.halo.enabled = !!flare;
      if (!flare) return;
      const { at, strength } = flare;
      rig.light.setPosition(at.x, at.y, at.z);
      rig.light.light!.intensity = flareLightIntensity * strength;
      // Reach the edge of the lit circle from wherever it hangs, and no farther,
      // so the ground a player sees lit is the ground the rule calls lit.
      rig.light.light!.range = Math.hypot(at.y, flareRules.radius) + 6;
      for (const [quad, size, opacity] of [[rig.core, 2.2, 1], [rig.halo, 15, 0.3]] as const) {
        quad.setPosition(at.x, at.y, at.z);
        this.faceCamera(quad);
        quad.setLocalScale(size, 1, size);
        quad.render!.meshInstances[0].setParameter("material_opacity", opacity * strength);
      }
    });
    // A burst's flash lasts as long as the rule says it shows the ground.
    for (const burst of this.burstLights) {
      const age = tick - burst.bornAt;
      burst.light.enabled = age >= 0 && age < nightRules.burstTicks;
      if (burst.light.enabled) burst.light.light!.intensity = burstLightIntensity * (1 - age / nightRules.burstTicks) ** 2;
    }
    // Fresh craters glow for twenty seconds, sharing the slots of their smoke.
    this.craterGlows.forEach((glow, i) => {
      const slot = this.atmosphere?.smoulders[i], age = slot?.at ? (tick - slot.bornAt) / 30 : Infinity;
      glow.enabled = age < 20;
      if (!slot?.at || age >= 20) return;
      glow.setPosition(slot.at.x, slot.at.y + 0.25, slot.at.z);
      this.faceCamera(glow);
      glow.setLocalScale(2.4, 1, 1.2);
      glow.render!.meshInstances[0].setParameter("material_opacity", 0.55 * (1 - age / 20) * (0.85 + 0.15 * Math.sin(tick * 0.4 + i)));
    });
  }
  private drawBackdrop(g: Game, alpha: number) {
    const b = this.backdrop;
    if (!b?.life.enabled) return;
    const tick = g.tick + alpha, t = tick / 30;
    const { balloons, smoke: columns } = backdropLife(this.map);
    b.balloons.forEach((balloon, i) => {
      const spec = balloons[i];
      balloon.setPosition(spec.x, spec.y + Math.sin(t * 0.31 + i * 2) * 1.4, spec.z);
      balloon.setEulerAngles(Math.sin(t * 0.23 + i) * 2, (spec.yaw * 180) / Math.PI + Math.sin(t * 0.07 + i) * 6, 0);
    });
    const smoke = this.beginBillboards(b.smoke);
    for (const column of columns) {
      // Rise from the land the fire is on, which climbs toward the horizon.
      const base = backdropHeight(this.map, column.x, column.z);
      for (let i = 0; i < 12; i++) {
        const rise = (t * 0.035 + i / 12) % 1, size = (4 + rise * 16) * column.scale;
        smoke.add(column.x + rise ** 1.4 * 16 * column.scale, base + rise * 40 * column.scale, column.z + Math.sin(i * 2.1) * 2, size, size * 1.1, i * 37);
      }
    }
    this.endBillboards(b.smoke);
    const bursts = distantFlashes(this.map, g.tick - 45, g.tick + 1);
    b.flashes.forEach((slot, i) => {
      const flash = bursts[bursts.length - 1 - i], age = flash ? (tick - flash.tick) / 30 : Infinity;
      slot.glow.enabled = age < 0.35;
      slot.plume.enabled = age < 1.5;
      if (!flash) return;
      const glow = Math.max(0, 1 - age / 0.35);
      slot.glow.setPosition(flash.x, flash.y + 2, flash.z);
      this.faceCamera(slot.glow);
      slot.glow.setLocalScale(6 + age * 20, 1, 6 + age * 20);
      // Per-instance opacity: updating the material would rebuild its shader every frame.
      slot.glow.render!.meshInstances[0].setParameter("material_opacity", glow);
      slot.plume.setPosition(flash.x, flash.y + 3 + age * 5, flash.z);
      this.faceCamera(slot.plume, i * 50);
      slot.plume.setLocalScale(5 + age * 9, 1, 6 + age * 10);
      slot.plume.render!.meshInstances[0].setParameter("material_opacity", 0.55 * Math.max(0, 1 - age / 1.5));
    });
    const burning = distantFlares(g.tick - flareTicks, g.tick + 1);
    b.flares.forEach((slot, i) => {
      const flare = burning[burning.length - 1 - i], at = flare && flarePosition(flare, tick);
      slot.glow.enabled = !!at?.burning;
      if (!at?.burning) return;
      slot.glow.setPosition(at.x, at.y, at.z);
      this.faceCamera(slot.glow);
      const flicker = 0.8 + 0.2 * Math.sin(tick * 1.7 + i);
      slot.glow.setLocalScale(2.6 * flicker, 1, 2.6 * flicker);
      slot.glow.render!.meshInstances[0].setParameter("material_opacity", flicker);
    });
  }
  // One mesh of pickets and one of line wires for the whole boundary belt.
  private buildBoundaryWire() {
    const wire = boundaryWireGeometry(this.map);
    if (!wire.lines.length) return;
    const device = this.app.graphicsDevice, root = this.joint("boundary wire", this.mapRoot);
    const pickets = new pc.Mesh(device);
    pickets.setPositions(wire.pickets.positions);
    pickets.setNormals(wire.pickets.normals);
    pickets.setIndices(wire.pickets.indices);
    pickets.update(pc.PRIMITIVE_TRIANGLES);
    const strands = new pc.Mesh(device);
    strands.setPositions(wire.lines);
    strands.setNormals(new Float32Array(wire.lines.length).map((_, i) => (i % 3 === 1 ? 1 : 0)));
    strands.update(pc.PRIMITIVE_LINES);
    const posts = new pc.MeshInstance(pickets, this.material("#3a332a"), root);
    posts.castShadow = true;
    const wires = new pc.MeshInstance(strands, this.material("#2b2824"), root);
    wires.castShadow = false;
    root.addComponent("render", { meshInstances: [posts, wires] });
  }
  private buildCoast() {
    const map=this.map,previous=this.batchGroup,meshes=coastalGeometry(map);
    if(!this.materials.has("coastal rock")) {
      const material=this.surfaceMaterial("stone","#ffffff").clone();
      material.diffuseVertexColor=true;material.gloss=.12;material.update();this.materials.set("coastal rock",material);
    }
    if(!this.materials.has("coastal water")) {
      const water=new pc.StandardMaterial();water.diffuse=color("#3d626c");water.specular=color("#bbc9c4");water.gloss=.58;
      water.normalMap=this.texture("coastal ripples",256,256,()=>coastalWaterNormals());water.normalMapTiling.set(38,32);water.bumpiness=.3;
      water.update();this.materials.set("coastal water",water);
      const foam=new pc.StandardMaterial();foam.useLighting=false;foam.emissive=color("#ffffff");foam.emissiveVertexColor=true;
      foam.opacity=.25;foam.opacityVertexColor=true;foam.opacityVertexColorChannel="a";foam.blendType=pc.BLEND_NORMAL;foam.depthWrite=false;foam.cull=pc.CULLFACE_NONE;
      foam.update();this.materials.set("coastal foam",foam);
    }
    const water=this.materials.get("coastal water")!,foam=this.materials.get("coastal foam")!;
    this.coastalSea={water,foam,time:0,pending:0};
    const ocean=this.cube("sea",0,coastalRules.seaLevel-.05,0,map.width+600,.1,map.depth+600,"#33586a");
    ocean.render!.material=water;ocean.render!.castShadows=false;
    for(const [name,data,material] of [["rock",meshes.rock,this.materials.get("coastal rock")!],["foam",meshes.foam,foam]] as const) {
      // A coast that is all beach (Gallipoli) has no rock to draw.
      if(!data.indices.length)continue;
      const e=this.cube("coastal "+name,0,0,0,1,1,1,"#ffffff",false,this.mapRoot);
      e.render!.meshInstances=[new pc.MeshInstance(this.modelMesh("coast-"+map.id+"-"+name,()=>data),material,e)];
      e.render!.castShadows=false;
    }
    for(const [i,prop] of coastalGrass(map).entries()) {
      this.batchGroup=this.worldBatch(this.boardBatch,prop.x,prop.z);
      const root=this.joint("wind-shaped coastal grass",this.mapRoot,prop.x,prop.y,prop.z);root.setLocalEulerAngles(0,prop.yaw,0);
      const e=this.forestPart("coastal grass","grass",i%4,0,0,0,...prop.scale,prop.tint,root);e.render!.castShadows=false;
      this.groundDecor.push({root,x:prop.x,z:prop.z,radius:.6,batched:true});
    }
    this.batchGroup=previous;
  }
  private dirtyWorldBatches?: Set<number>;
  private queueWorldBatch(id:number) { (this.dirtyWorldBatches ??= new Set()).add(id); }
  private flushWorldBatches() {
    if (!this.dirtyWorldBatches?.size) return;
    const start = battlePerformance.begin();
    this.app.batcher!.generate([...this.dirtyWorldBatches]);
    battlePerformance.count("sceneryBatches",this.dirtyWorldBatches.size);
    battlePerformance.end("sceneryBatch",start);
    this.dirtyWorldBatches.clear();
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
  private surfaceMaterial(kind: SurfaceKind | ArchitecturalTexture, tint: string) {
    const key = `surface-${kind}-${tint}`;
    if (!this.materials.has(key)) {
      const ground = kind === "mud";
      const architectural=architecturalTextures.includes(kind as ArchitecturalTexture);
      // Shared 1.6 m architectural tiles need no per-house large textures.
      const size = ground ? 1024 : architectural ? 256 : 512;
      if (!this.textures.has(`${kind}-diffuse`)) {
        const data = ground
          ? groundSurfacePixels(this.map, size)
          : architectural ? architecturePixels(kind as ArchitecturalTexture,size) : surfacePixels(kind as SurfaceKind, size);
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
      if (ground || kind === "plaster" || kind === "wood" || kind === "floorboards" || architectural) m.diffuseMap.srgb = true;
      m.normalMap = this.textures.get(`${kind}-normal`)!;
      m.bumpiness = ground ? 0.4 : kind === "wood" || kind === "floorboards" ? .35 : 0.7;
      m.glossMap = this.textures.get(`${kind}-gloss`)!;
      m.glossMapChannel = "r";
      // Broad soil highlights must not bleach an entire bank as its normal
      // turns toward the sun. Separate puddles retain their glossy water finish.
      m.gloss = ground ? 0.35 : kind === "bark" ? .18 : kind === "floorboards" ? .25 : 0.6;
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
    const material = this.sumpWater();
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
  private landmarkAssets = new Map<string, Promise<pc.Asset>>();
  // Landmark exteriors load once per model and are instanced per placement.
  // If a model cannot be loaded, the plain collision box is shown instead.
  private placeLandmark(b: Box, fallback: pc.Entity) {
    const model = b.model!, parent = this.mapRoot, group = fallback.parent as pc.Entity | null;
    let asset = this.landmarkAssets.get(model.name);
    if (!asset) {
      asset = new Promise<pc.Asset>((resolve, reject) =>
        this.app.assets.loadFromUrl(publicAsset(`models/${model.name}.glb`), "container", (error, loaded) =>
          error || !loaded ? reject(error) : resolve(loaded)));
      this.landmarkAssets.set(model.name, asset);
    }
    asset.then((loaded) => {
      if (this.mapRoot !== parent) return;
      const entity = (loaded.resource as pc.ContainerResource).instantiateRenderEntity({ castShadows: true, receiveShadows: true });
      entity.setLocalPosition(model.x ?? b.x, b.baseY ?? 0, model.z ?? b.z);
      entity.setLocalEulerAngles(0, model.yaw ?? 0, 0);
      parent.addChild(entity);
    }, () => {
      if (this.mapRoot !== parent) return;
      for (const child of group?.children ?? [])
        if (child instanceof pc.Entity && child.name === "building" && child.render) child.render.enabled = true;
    });
  }
  // The visible sky and the ambient light come from one generated cubemap,
  // so shade facing the sky is bluer and surfaces facing the ground warmer.
  // The scene's light, fog and sky from this.look; again when the weather changes.
  private applyLook() {
    const look = this.look, trenches = this.map.id !== "industrial";
    this.app.scene.ambientLight = color(look.sky.horizon);
    this.app.scene.exposure = look.exposure;
    this.app.scene.fog.type = "linear";
    this.app.scene.fog.color = color(look.sky.horizon);
    this.app.scene.fog.start = look.fog.start;
    this.app.scene.fog.end = look.fog.end;
    const camera = this.camera.camera!;
    camera.clearColor = color(look.sky.horizon);
    camera.farClip = look.farClip ?? (trenches ? 210 : 180);
    const light = this.sun.light!;
    light.color = color(look.sun.color);
    light.intensity = look.sun.intensity;
    light.shadowIntensity = look.sun.shadowStrength;
    // A night sky casts no shadows, which also spares the shadow pass.
    light.castShadows = look.sun.shadowStrength > 0;
    this.sun.setEulerAngles(90 - look.sun.elevation, look.sun.azimuth, 0);
    const skybox = this.app.scene.skybox, atlas = this.app.scene.envAtlas;
    this.buildSky();
    if (skybox && skybox !== this.app.scene.skybox) skybox.destroy();
    if (atlas && atlas !== this.app.scene.envAtlas) atlas.destroy();
  }
  private buildSky() {
    const up = this.sun.up, sun: [number, number, number] = [up.x, up.y, up.z], device = this.app.graphicsDevice;
    // Both cubemaps are stored dimmer by skyIntensity, which the scene restores.
    // The lighting copy is brighter by look.ambient, so shade isn't near black
    // while the visible sky keeps its colour.
    const skyIntensity = 1.6;
    const cubemap = (name: string, size: number, scale: number) => new pc.Texture(device, {
      name, cubemap: true, width: size, height: size, format: pc.PIXELFORMAT_SRGBA8, mipmaps: true,
      addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE,
      levels: [skyCubemapFaces(this.look, sun, size, scale)],
    });
    this.app.scene.skybox = cubemap("generated sky", 256, 1 / skyIntensity);
    this.app.scene.skyboxIntensity = skyIntensity;
    const lighting = cubemap("generated sky lighting", 64, this.look.ambient / skyIntensity);
    const source = pc.EnvLighting.generateLightingSource(lighting);
    this.app.scene.envAtlas = pc.EnvLighting.generateAtlas(source);
    source.destroy();
    lighting.destroy();
  }
  // Applies a graphics quality level: shadow cascades, and on Medium and High
  // post-processing (tone mapping, grade, vignette and ambient occlusion).
  setQuality(quality: Quality) {
    this.quality = quality;
    if (this.backdrop) this.backdrop.life.enabled = quality !== "low";
    if (this.atmosphere) this.atmosphere.root.enabled = quality !== "low";
    this.rainView?.setQuality(quality);
    const profile = qualityProfiles[quality], light = this.sun.light!, look = this.look;
    light.numCascades = profile.cascades;
    light.cascadeDistribution = 0.6;
    light.shadowDistance = profile.shadowDistance;
    light.shadowResolution = profile.shadowResolution;
    light.shadowType = quality === "high" ? pc.SHADOW_PCF5 : pc.SHADOW_PCF3;
    if (!profile.postProcessing) {
      this.frame?.destroy();
      this.frame = undefined;
      this.camera.camera!.toneMapping = pc.TONEMAP_NEUTRAL;
      return;
    }
    const frame = this.frame ??= new pc.CameraFrame(this.app, this.camera.camera!);
    frame.rendering.toneMapping = pc.TONEMAP_NEUTRAL;
    frame.rendering.samples = profile.samples;
    frame.grading.enabled = true;
    frame.grading.brightness = 1 + look.grade.brightness;
    frame.grading.contrast = look.grade.contrast;
    frame.grading.saturation = look.grade.saturation;
    frame.grading.tint = color(look.grade.tint);
    frame.vignette.intensity = look.vignette;
    frame.vignette.inner = 0.55;
    frame.vignette.outer = 1.35;
    frame.vignette.curvature = 0.6;
    frame.ssao.type = profile.ssao ? pc.SSAOTYPE_COMBINE : pc.SSAOTYPE_NONE;
    if (profile.ssao) {
      frame.ssao.intensity = 0.45;
      frame.ssao.radius = 1.4;
      frame.ssao.power = 4;
      frame.ssao.samples = profile.ssao.samples;
      frame.ssao.scale = profile.ssao.scale;
      frame.ssao.blurEnabled = true;
    }
    frame.update();
  }
  // Smoke and dust are drawn unlit. At night that would make them glow, so
  // unless a cloud is itself a light (`glow`), it is dimmed to the dark.
  private dustMaterial(hex: string, glow = false) {
    const m = new pc.StandardMaterial();
    m.diffuse = color("#000000");
    m.emissive = color(hex);
    if (this.map.night && !glow) m.emissiveIntensity = 0.14;
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
  private forestPart(
    name: string, shape: ForestShape, variant: number,
    x: number, y: number, z: number, w: number, h: number, d: number,
    tint: string, parent: pc.Entity,
  ) {
    const entity = this.cube(name, x, y, z, w, h, d, tint, false, parent);
    const key = `forest-${shape}-${variant % 4}`;
    if (!this.kitMeshes.has(key)) {
      const data = forestGeometry(shape, variant), mesh = new pc.Mesh(this.app.graphicsDevice);
      mesh.setPositions(data.positions); mesh.setNormals(data.normals); mesh.setUvs(0, data.uvs);
      mesh.setIndices(data.indices);
      mesh.setVertexStream(pc.SEMANTIC_TANGENT, pc.calculateTangents(data.positions, data.normals, data.uvs, data.indices), 4);
      mesh.update(pc.PRIMITIVE_TRIANGLES); mesh.incRefCount(); this.kitMeshes.set(key, mesh);
    }
    const bark = ["trunk", "limbs", "deadLimbs", "branch", "root"].includes(shape);
    entity.render!.meshInstances = [new pc.MeshInstance(this.kitMeshes.get(key)!, bark ? this.surfaceMaterial("bark", tint) : this.material(tint), entity)];
    return entity;
  }
  private modelMesh(key:string,build:()=>{positions:number[];normals:number[];indices:number[];uvs:number[];colors?:number[]}) {
    this.kitMeshes ??= new Map();
    if(!this.kitMeshes.has(key)){
      const data=build(),mesh=new pc.Mesh(this.app.graphicsDevice);
      mesh.setPositions(data.positions);mesh.setNormals(data.normals);mesh.setUvs(0,data.uvs);mesh.setIndices(data.indices);
      if(data.colors)mesh.setColors(data.colors);
      mesh.setVertexStream(pc.SEMANTIC_TANGENT,pc.calculateTangents(data.positions,data.normals,data.uvs,data.indices).map(v=>Number.isFinite(v)?v:0),4);
      mesh.update(pc.PRIMITIVE_TRIANGLES);mesh.incRefCount();this.kitMeshes.set(key,mesh);
    }
    return this.kitMeshes.get(key)!;
  }
  private modelMaterial(tint:string,merged=false) {
    this.textures ??= new Map();
    if(!this.textures.has("model-atlas-diffuse")){
      const maps=modelSurfaceAtlas();
      for(const channel of ["diffuse","normal","gloss"] as const){
        const texture=new pc.Texture(this.app.graphicsDevice,{name:`soldier ${channel}`,width:modelAtlasSize.width,height:modelAtlasSize.height,
          format:pc.PIXELFORMAT_RGBA8,mipmaps:true,minFilter:pc.FILTER_LINEAR_MIPMAP_LINEAR,magFilter:pc.FILTER_LINEAR,addressU:pc.ADDRESS_CLAMP_TO_EDGE,addressV:pc.ADDRESS_CLAMP_TO_EDGE});
        (texture.lock() as Uint8Array).set(maps[channel]);texture.unlock();this.textures.set(`model-atlas-${channel}`,texture);
      }
    }
    const key=merged?"soldier-kit-textured":`model-material-${tint}`;
    if(!this.materials.has(key)){
      const material=new pc.StandardMaterial();material.diffuse=color(tint);material.diffuseVertexColor=merged;
      material.diffuseMap=this.textures.get("model-atlas-diffuse")!;material.normalMap=this.textures.get("model-atlas-normal")!;
      material.bumpiness=.45;material.glossMap=this.textures.get("model-atlas-gloss")!;material.glossMapChannel="r";material.gloss=.7;
      material.specular=color("#45473e");material.update();this.materials.set(key,material);
    }
    return this.materials.get(key)!;
  }
  private gripHand(name:string,parent:pc.Entity,side:"left"|"right") {
    const e=this.cube(name,0,0,0,1,1,1,"#bba185",false,parent);
    if(!this.app.graphicsDevice || !e.render)return e;
    for(const detail of ["world","far"] as const)this.modelMesh(`hand-${side}-${detail}`,()=>gripHandGeometry(side,detail));
    e.render.meshInstances=[new pc.MeshInstance(this.kitMeshes.get(`hand-${side}-world`)!,this.modelMaterial("#bba185"),e)];
    e.tags.add(`model-near:hand-${side}-world`,`model-far:hand-${side}-far`,`hand-side:${side}`);
    return e;
  }
  // Up from the chest over the face as it goes on; gone while it is off.
  private poseGasMask(rig: SoldierRig, on: number) {
    if (!rig.gasMask || rig.maskShown === on) return;
    rig.maskShown = on;
    const scale = on > 0 ? 0.75 + 0.25 * on : 0;
    rig.gasMask.setLocalScale(scale, scale, scale);
    rig.gasMask.setLocalPosition(0, -0.4 * (1 - on), -0.1 * (1 - on));
  }
  private createGasView() {
    const root = this.joint("gas", this.mapRoot);
    return new GasView({
      map: this.map,
      billboards: (name, capacity, hex, opacity) => this.billboards(name, root, capacity, hex, opacity),
      begin: (batch) => this.beginBillboards(batch),
      end: (batch) => this.endBillboards(batch as { buffer: BillboardBuffer; mesh: pc.Mesh }),
      enable: (on) => { if (root.enabled !== on) root.enabled = on; },
    });
  }
  private applyModelDetail(p:Soldier,rig:SoldierRig) {
    const distance=this.people[p.id].getPosition().distance(this.camera.getPosition());
    const far=p.id!==0 && distance>(rig.farDetail?32:42);
    if(rig.farDetail===far)return;
    rig.farDetail=far;
    // This single torso/head/equipment mesh is deliberately outside actor
    // batches: swapping a batched source would leave the copied batch stale,
    // or force a whole-roster rebuild on every distance transition.
    const prefix=far?"model-far:":"model-near:";
    const tag=rig.upper.tags.list().find(t=>t.startsWith(prefix));
    if(rig.upper.render?.batchGroupId===-1&&tag)rig.upper.render.meshInstances[0].mesh=this.kitMeshes.get(tag.slice(prefix.length))!;
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
    surface?: ModelSurface,
    coarse = false,
  ) {
    const entity = this.cube(name, x, y, z, w, h, d, tint, false, parent);
    if (this.app.graphicsDevice && entity.render) {
      this.kitMeshes ??= new Map();
      // Small kit (pouches, buttons, brows) reads as round with half the sides.
      const key = `organic-${shape}${surface?`-${surface}`:""}${coarse?"-coarse":""}`;
      for(const detail of ["near","far"] as const){
        const meshKey=`${key}-${detail}`;
        this.modelMesh(meshKey,()=>{
          const data=characterGeometry(shape,surface?(detail==="near"?(coarse?8:16):6):10);
          if(surface)data.uvs=data.uvs.flatMap((_,i,a)=>i%2?[]:modelUV(a[i],a[i+1],surface));
          return data;
        });
      }
      entity.render.meshInstances=[new pc.MeshInstance(this.kitMeshes.get(`${key}-near`)!,surface?this.modelMaterial(tint):this.material(tint),entity)];
      entity.tags.add(`model-near:${key}-near`,`model-far:${key}-far`);
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
    this.modelMesh(`rifle-${shape}-world`,()=>rifleGeometry(shape,"world"));
    entity.tags.add(`rifle-shape:${shape}`,`rifle-tint:${tint}`);
    const materialKey = `rifle-material-${tint}`;
    let material = this.materials.get(materialKey);
    if (!material) {
      material = new pc.StandardMaterial();
      material.diffuse = color(base);
      material.gloss = tint === "walnut" ? 0.38 : tint === "dark" ? 0.12 : 0.6;
      // Moderate steel specular: the sky's reflection reads as blued metal, not chrome.
      material.specular = color(tint === "walnut" ? "#514439" : tint === "dark" ? "#1e2323" : "#56605e");
      if (tint === "walnut" || tint === "steel") {
        const kind = tint === "walnut" ? "walnut" : "steel";
        const maps=rifleSurfaceMaps(kind);
        for(const channel of ["diffuse","normal","gloss"] as const){
          const texture = new pc.Texture(this.app.graphicsDevice, {
            name: `rifle ${kind} ${channel}`, width: rifleTextureSize, height: rifleTextureSize,
            format: pc.PIXELFORMAT_RGBA8, mipmaps: true,
            minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR,
            addressU: pc.ADDRESS_REPEAT, addressV: pc.ADDRESS_REPEAT,
          });
          (texture.lock() as Uint8Array).set(maps[channel]);texture.unlock();
          this.textures.set(`${materialKey}-${channel}`,texture);
          if(channel==="diffuse")material.diffuseMap=texture;
          else if(channel==="normal")material.normalMap=texture;
          else material.glossMap=texture;
        }
        material.bumpiness=.4;material.glossMapChannel="r";
        material.diffuse = new pc.Color(1, 1, 1);
      }
      material.update(); this.materials.set(materialKey, material);
    }
    entity.render.meshInstances = [new pc.MeshInstance(this.kitMeshes.get(`rifle-${shape}-world`)!, material, entity)];
    return entity;
  }
  private createSoldier(p: Soldier) {
    const root = this.joint(`soldier-${p.id}`, this.app.root);
    root.setPosition(p.x, p.y, p.z);
    root.setEulerAngles(0, (-p.yaw * 180) / Math.PI, 0);
    const body = this.joint("body", root, 0, 0.94);
    const hips = this.joint("hips", body);
    const upper = this.joint("upper body", body, 0, 0.08);
    const faction = factions[p.faction ?? (p.team === "blue" ? "trainingBlue" : "trainingRed")];
    const refined=isKitFaction(p.faction), look=soldierLookFor(p.id);
    const shirt = faction.shirt, trousers = faction.trousers;
    const equipment = "#68634d",
      skin = refined ? looksFor(p.faction)[look].skin : "#bba185",
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
      coarse = false,
    ) => {
      const shaped:Record<string,CharacterShape>={torso:"coat","upper arm":"sleeve",forearm:"sleeve",thigh:"trouser",shin:"trouser",boot:"boot",head:"face",backpack:"pouch","ammunition pouch":"pouch",helmet:p.faction==="french"?"adrian":p.faction==="british"?"brodie":"stahlhelm"};
      return this.organic(name,x,y,z,w,h,d,c,parent,refined?(shaped[name]??shape):shape,refined?modelSurfaceFor(name):undefined,coarse);
    };
    part("pelvis", 0, -0.015, 0, 0.43, 0.24, 0.3, trousers, hips);
    part("torso", 0, 0.25, 0, 0.55, 0.55, 0.34, shirt, upper, "tunic");
    if(!refined)part("vest", 0, 0.27, -0.166, 0.39, 0.34, 0.035, equipment, upper, "tunic");
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
    if(!refined)part("nose", 0, 0.665, -0.145, 0.043, 0.067, 0.075, skin, upper);
    if(!refined)part("chin", 0, 0.55, -0.075, 0.14, 0.075, 0.12, skin, upper);
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
    const helmetTint = faction.helmet;
    const brodie = p.faction === "british" && refined;
    // Hats and the kabalak are kit parts (src/soldier-kit.ts), not a shaped helmet.
    const hat = wearsHat(p.faction);
    if (hat) { /* drawn with the faction kit below */ }
    else if (brodie) part("helmet", 0, .815, -.008, .34, .155, .36, helmetTint, upper, "helmet");
    else part("helmet", 0, refined?.86:.83, 0, refined?.4:.375, refined?.265:.2, refined?.46:.395, helmetTint, upper, "helmet");
    if(!refined)part(
      "helmet brim",
      0,
      0.752,
      -0.012,
      p.faction === "german" ? 0.39 : p.faction === "french" ? 0.41 : 0.465,
      p.faction === "german" ? 0.12 : 0.035,
      0.475,
      helmetTint,
      upper,
      "disc",
    );
    if(!refined)part(
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
    if (p.faction === "french") part("Adrian helmet crest", 0, .91, 0, .04, .08, .33, helmetTint, upper);
    if(refined){
      for(const side of [-1,1]){
        if (p.faction !== "ottoman") part("chin strap",side*.12,.635,-.018,.016,.21,.017,leather,upper,"limb").setLocalEulerAngles(0,0,side*13);
        part("turned coat collar",side*.075,.47,-.12,.095,.13,.045,shirt,upper,"pouch").setLocalEulerAngles(0,0,side*24);
      }
      // A single short hem overlaps the waist. Separate thigh-shaped panels
      // stayed vertical during the gait and looked like extra dangling legs.
      part("coat hem",0,.015,0,.51,p.faction==="french"?.18:p.faction==="british"?.12:.14,.34,shirt,hips,"coatHem");
      for(let i=0;i<5;i++)part("coat button",p.faction==="french"?.045:0,.09+i*.073,-.185,.017,.017,.009,"#515345",upper,"disc");
      part("belt buckle",0,.025,-.201,.085,.057,.022,"#767867",upper,"pouch");
      for (const kit of [...factionKit(p.faction as KitFaction, shirt, helmetTint, look), ...faceParts(look, p.faction)]) {
        const e = part(kit.name, ...kit.at, ...kit.size, kit.tint, kit.parent === "hips" ? hips : upper, kit.shape, Math.max(...kit.size) < .13);
        if (kit.rotation) e.setLocalEulerAngles(...kit.rotation);
        if (kit.small) e.tags.add("far-omit");
      }
    }
    part("team recognition band", .278, .25, 0, .018, .09, .29, p.team === "blue" ? "#5c9bb5" : "#b47c6c", upper);
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
      if (!refined) part(
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
    // ANZAC shirt sleeves are rolled above the elbow, and some men wear shorts.
    const anzac = p.faction === "anzac" && refined, shorts = anzac && anzacDress(look).shorts;
    const legs = [-1, 1].map((side) => {
      const hip = this.joint("hip", hips, side * 0.145);
      part("thigh", 0, shorts ? -0.15 : -0.21, 0, 0.225, shorts ? 0.32 : 0.46, 0.25, trousers, hip, "limb");
      if (shorts) part("bare knee", 0, -0.35, 0, 0.17, 0.16, 0.19, skin, hip, "limb");
      const knee = this.joint("knee", hip, 0, -0.42);
      part("knee joint", 0, 0, 0, 0.185, 0.18, 0.2, shorts ? skin : trousers, knee);
      part("shin", 0, -0.185, 0, 0.17, 0.4, 0.2, shorts ? skin : trousers, knee, "limb");
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
      if (anzac) part("rolled sleeve", 0, -armLengths.upper + 0.035, 0, 0.2, 0.075, 0.22, shirt, shoulder, "pouch");
      part("elbow joint", 0, 0, 0, 0.15, 0.145, 0.17, anzac ? skin : shirt, elbow);
      part(
        "forearm",
        0,
        -armLengths.forearm / 2,
        0,
        anzac ? 0.13 : 0.145,
        armLengths.forearm + 0.04,
        anzac ? 0.15 : 0.17,
        anzac ? skin : shirt,
        elbow,
        "limb",
      );
      if (!support && !refined)
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
      if(!support && refined)this.gripHand("hand",elbow,"right").setLocalPosition(0,-armLengths.forearm,0);
      if(refined && !anzac)part("sleeve cuff",0,-armLengths.forearm+.024,0,.15,.07,.17,shirt,elbow,"pouch");
      return { shoulder, elbow };
    });
    const heldGrenade = this.joint("held grenade", arms[1].elbow, 0, -armLengths.forearm - .055, -.025);
    part("held grenade body", 0, 0, 0, .07, .11, .07, "#3e4236", heldGrenade, "limb");
    heldGrenade.setLocalScale(0, 0, 0);
    const rifle = this.joint(
      "weapon",
      upper,
      weaponMount.x,
      weaponMount.y,
      weaponMount.z,
    );
    const design = weaponDesign(p);
    const service = p.weapon === "serviceRifle",
      gunner = p.weapon === "machineGun";
    if (design) {
      for (const spec of design.parts) {
        const piece=this.riflePart(spec.name,...spec.at,...spec.size,spec.tint,rifle,spec.shape);
        if(spec.rotation)piece.setLocalEulerAngles(...spec.rotation);
      }
    } else if (p.weapon === "flamethrower") {
      part("flame lance",0,.025,-.22,.045,.66,.045,"#5d665d",rifle,"limb").setLocalEulerAngles(90,0,0);
      part("flame nozzle",0,.025,-.55,.085,.12,.085,"#454a41",rifle,"limb").setLocalEulerAngles(90,0,0);
      part("flame grip",0,-.08,.05,.07,.19,.08,"#4e4030",rifle);
      for(const side of [-1,1]) part("fuel cylinder",side*.12,.25,.29,.18,.52,.18,"#535d42",upper,"limb");
      part("fuel hose",.21,.05,.14,.035,.3,.035,"#3b3930",upper,"limb");
    } else if (p.weapon === "pistol") {
      part("pistol grip", 0, -.08, .07, .075, .19, .09, "#544333", rifle);
      part("pistol receiver", 0, .025, -.06, .075, .07, .26, "#434b49", rifle);
      part("pistol barrel", 0, .025, -.25, .04, .28, .04, "#555f5b", rifle, "limb").setLocalEulerAngles(90,0,0);
      if (p.faction === "british") part("revolver cylinder",0,.02,.005,.09,.09,.13,"#515b55",rifle,"limb").setLocalEulerAngles(90,0,0);
      part("pistol front sight", 0, .1, -.35, .012, .035, .02, "#9da59a", rifle);
    } else if (service) {
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
    if(design)this.riflePart("front sight base",0,.055,design.front,.03,.06,.045,"steel",rifle,"buttplate");
    // A real open notch and front post share a horizontal sight line.
    this.cube("front sight", 0, sightHeight - 0.02,
      design?.front ?? (service ? -0.65 : gunner ? -0.72 : p.weapon === "pistol" ? -0.35 : -0.54),
      0.008, 0.04, 0.018, "#202724", false, rifle);
    for (const side of [-1, 1]) {
      const ear = this.cube("rear sight ear", side * 0.018, sightHeight - 0.0125,
        design?.rear ?? (service ? -0.13 : 0.08), 0.008, 0.025, 0.025, "#202724", false, rifle);
      if (service && ear.render) ear.removeComponent("render");
    }
    const bridge = this.cube("rear sight bridge", 0, sightHeight - 0.0315,
      design?.rear ?? (service ? -0.13 : 0.08), 0.044, 0.014, 0.025, "#202724", false, rifle);
    if (service && bridge.render) bridge.removeComponent("render");
    if(design && service) {
      this.riflePart("V-notch rear sight",0,.1005,design.rear,.075,.035,.04,"steel",rifle,"notch");
      this.riflePart("rear sight base",0,.064,design.rear,.055,.045,.085,"steel",rifle,"buttplate");
    }
    if (service) {
      // Mounted at this rifle's own muzzle, wherever that is.
      const mount = bayonetMount(design?.muzzle ?? -0.7);
      part("bayonet blade", ...mount.blade.at, ...mount.blade.size, "#aeb6ad", rifle, "stock")
        .setLocalEulerAngles(90, 0, 0);
      this.cube("bayonet guard", ...mount.guard.at, ...mount.guard.size, "#565d53", false, rifle);
    }
    if (!design && service && p.faction === "british") part("SMLE box magazine", 0, -.11, .03, .09, .12, .16, "#414945", rifle);
    if (!design && service && p.faction === "french") part("Berthier extended magazine", 0, -.12, .04, .075, .15, .13, "#424a46", rifle);
    if (scoped(p)) {
      for(const z of [-.14,.09]) {
        this.riflePart("scope mounting foot",-.035,.103,z,.035,.075,.04,"steel",rifle,"buttplate");
        this.riflePart("scope mounting ring",-.035,.16,z,.085,.035,.085,"steel",rifle,"band").setLocalEulerAngles(90,0,0);
      }
      part("four power scope tube", -.035, .18, -.03, .065, .4, .065, "#343e3d", rifle, "limb").setLocalEulerAngles(90,0,0);
      part("scope lens", -.035, .18, .18, .06, .02, .06, "#45646a", rifle, "disc").setLocalEulerAngles(90,0,0);
    }
    const bolt = this.joint("bolt", rifle, ...(design?.actionOrigin ?? [.05,.045,.13] as [number,number,number]));
    if(design) {
      for(const spec of design.actionParts){
        const piece=this.riflePart(spec.name,...spec.at,...spec.size,spec.tint,bolt,spec.shape);
        if(spec.rotation)piece.setLocalEulerAngles(...spec.rotation);
      }
    } else if (service) {
      for (const spec of detailedBoltParts) {
        const piece = this.riflePart(spec.name, ...spec.at, ...spec.size, spec.tint, bolt, spec.shape);
        if (spec.rotation) piece.setLocalEulerAngles(...spec.rotation);
      }
      this.cube("safety lever", -0.05, 0.048, 0.06, 0.045, 0.012, 0.012, "#70776d", false, bolt);
      this.cube("bayonet lug", 0, -0.012, -0.65, 0.028, 0.08, 0.04, "#353c3a", false, rifle);
    }
    if(design?.family === "webley")for(const name of ["front sight","front sight base"]){
      const sight=rifle.findByName(name) as pc.Entity;
      const position=sight.getLocalPosition().clone();sight.reparent(bolt);
      sight.setLocalPosition(position.x-design.actionOrigin[0],position.y-design.actionOrigin[1],position.z-design.actionOrigin[2]);
    }
    const magazine = design
      ? this.riflePart("weapon magazine",...design.magazine.at,...design.magazine.size,design.magazine.tint,rifle,design.magazine.shape)
      : gunner
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
    if(design?.magazine.rotation)magazine.setLocalEulerAngles(...design.magazine.rotation);
    if (!design && gunner && p.faction !== "british" && p.faction !== undefined) {
      magazine.setLocalScale(p.faction === "french" ? .16 : .45, 1.7, .7);
      magazine.setLocalPosition(0,-.14,.05);
      if (p.faction === "german") part("MG water jacket", 0,.02,-.47,.13,.48,.13,"#3d4a44",rifle,"limb").setLocalEulerAngles(90,0,0);
    }
    const reloadMagazine = design && !["clip","tube","revolver"].includes(design.reload)
      ? this.riflePart("carried magazine",0,-armLengths.forearm-.025,0,...design.magazine.size,design.magazine.tint,arms[1].elbow,design.magazine.shape)
      : service
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
    if (service && design?.reload !== "tube") {
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
    if(design?.reload === "tube" || design?.reload === "revolver") {
      for(const render of reloadMagazine.findComponents("render") as pc.RenderComponent[])render.entity.removeComponent("render");
      for(let i=0;i<3;i++)this.riflePart("loose cartridge",(i-1)*.017,.015,0,.013,.065,.013,"edge",reloadMagazine,"pin");
    }
    if(design?.family === "webley") {
      magazine.reparent(bolt);magazine.setLocalPosition(...design.magazine.at.map((v,i)=>v-design.actionOrigin[i]) as [number,number,number]);
      for(let i=0;i<6;i++)this.riflePart("cylinder flute",Math.sin(i*Math.PI/3)*.46,0,Math.cos(i*Math.PI/3)*.46,.12,.8,.12,"dark",magazine,"pin");
    }
    if(design?.family === "lewis")for(let i=0;i<20;i++){
      const rib=this.cube("pan radial rib",Math.cos(i*Math.PI/10)*.1,.175,-.055+Math.sin(i*Math.PI/10)*.1,.12,.005,.006,"#686f65",false,magazine);
      rib.setLocalPosition(Math.cos(i*Math.PI/10)*.28,.52,Math.sin(i*Math.PI/10)*.28);rib.setLocalEulerAngles(0,-i*18,0);rib.setLocalScale(.3,.06,.02);
    }
    if(design?.family === "mg08")for(let i=0;i<8;i++)this.riflePart("belt cartridge",(i-3.5)*.1,0,0,.025,.7,.025,"edge",magazine,"pin").setLocalEulerAngles(90,0,0);
    const carryHand=arms[1].elbow.findByName("hand") as pc.Entity;
    if(carryHand?.tags.has("hand-side:right")){reloadMagazine.reparent(carryHand);reloadMagazine.setLocalPosition(0,.012,-.01);}
    const supportHand = this.joint(
      "left hand grip",
      rifle,
      design?.grip[0] ?? -0.035,
      design?.grip[1] ?? (service ? -0.06 : -0.1),
      design?.grip[2] ?? (service ? -0.16 : -0.1),
    );
    if(refined)this.gripHand("left hand",supportHand,"left");
    else part("left hand", 0, 0, 0, 0.115, 0.15, 0.15, skin, supportHand);
    if (this.app.graphicsDevice) this.mergeSoldierKit(upper, p, refined ? look : undefined);
    // The gas mask: rubberised facepiece, two eyepieces and a filter tin under
    // the chin. A joint of its own, scaled away while it is not worn, so
    // masking never rebuilds the soldier's batched kit.
    const gasMask = this.joint("gas mask", upper);
    part("mask facepiece", 0, .635, -.07, .25, .275, .2, "#5c624b", gasMask, "head");
    for (const side of [-1, 1])
      part("mask eyepiece", side * .056, .69, -.168, .072, .026, .072, "#aab6ae", gasMask, "disc").setLocalEulerAngles(90, 0, 0);
    part("mask filter tin", 0, .535, -.2, .088, .12, .088, "#474c3c", gasMask, "limb").setLocalEulerAngles(32, 0, 0);
    gasMask.setLocalScale(0, 0, 0);
    this.people.push(root);
    this.soldiers.push({
      gasMask,
      maskShown: 0,
      body,
      design,
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
      look: refined ? look : undefined,
      heldGrenade,
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
    // The human's own soldier keeps its separate parts: they are the pattern
    // the first-person rifle is cloned from.
    if (p.id !== 0) {
      const legJoints = legs.flatMap((leg) => [leg.hip, leg.knee, leg.ankle]), armJoints = arms.flatMap((arm) => [arm.shoulder, arm.elbow]);
      this.mergeRigidParts(root, new Set<pc.GraphNode>([body, hips, upper, rifle, supportHand, bolt, magazine, reloadMagazine, heldGrenade, ...legJoints, ...armJoints]));
    }
  }
  // A warm-up soldier put back as it would be built: at the player's spawn,
  // unmasked, with none of the warm-up's animation state.
  private reuseSoldier(p: Soldier, root: pc.Entity, rig: SoldierRig) {
    root.setPosition(p.x, p.y, p.z);
    root.setEulerAngles(0, (-p.yaw * 180) / Math.PI, 0);
    root.setLocalScale(1, 1, 1);
    rig.gasMask?.setLocalScale(0, 0, 0);
    rig.heldGrenade?.setLocalScale(0, 0, 0);
    rig.magazine.setLocalScale(rig.magazineScale);
    rig.rifle.enabled = true;
    this.people.push(root);
    this.soldiers.push({
      bounds: rig.bounds,
      gasMask: rig.gasMask, maskShown: 0, body: rig.body, design: rig.design, hips: rig.hips, upper: rig.upper,
      legs: rig.legs, arms: rig.arms, rifle: rig.rifle, supportHand: rig.supportHand, bolt: rig.bolt,
      magazine: rig.magazine, reloadMagazine: rig.reloadMagazine, magazineScale: rig.magazineScale,
      reloadMagazineScale: rig.reloadMagazineScale, style: soldierStyle(p.id), look: rig.look, heldGrenade: rig.heldGrenade,
      forward: 0, sideways: 0, deathAt: null, remnantCreated: false, x: p.x, z: p.z,
      phase: p.id * 1.7, motion: 0, sprint: 0, crouch: 0, alive: p.hp > 0,
    });
  }
  // Parts that never move against their joint are drawn as one mesh per
  // material. A rifle is some 25 pieces and a soldier 59; each separate piece is
  // a bone the batch must carry, a transform to refresh every frame and a box
  // to bound. Identical sets of parts share one mesh. `keep` lists the entities
  // the animation moves on their own.
  private mergeRigidParts(root: pc.Entity, keep: Set<pc.GraphNode>) {
    if (!this.app.graphicsDevice) return;
    const joints: pc.Entity[] = [];
    root.forEach((node) => { joints.push(node as pc.Entity); });
    for (const joint of joints) {
      const groups = new Map<pc.Material, pc.Entity[]>();
      for (const child of joint.children as pc.Entity[]) {
        const render = child.render;
        if (!render || !child.enabled || child.children.length || keep.has(child) || child.name === "Luger toggle front link" || child.name === "head"
          || render.batchGroupId !== this.actorBatch || render.meshInstances.length !== 1 || !render.meshInstances[0].mesh) continue;
        const material = render.meshInstances[0].material;
        if (!material) continue;
        groups.set(material, [...(groups.get(material) ?? []), child]);
      }
      for (const [material, parts] of groups) {
        if (parts.length < 2) continue;
        const signature = parts.map((part) => {
          const at = part.getLocalPosition(), turn = part.getLocalRotation(), size = part.getLocalScale();
          return [part.render!.meshInstances[0].mesh!.id, ...[at.x, at.y, at.z, turn.x, turn.y, turn.z, turn.w, size.x, size.y, size.z].map((v) => Math.round(v * 1e4))].join(",");
        }).join("|");
        const mesh = this.modelMesh(`rigid:${signature}`, () => {
          const positions: number[] = [], normals: number[] = [], indices: number[] = [], uvs: number[] = [];
          const v = new pc.Vec3();
          for (const part of parts) {
            const source = part.render!.meshInstances[0].mesh!, matrix = part.getLocalTransform(), normalMatrix = matrix.clone().invert().transpose();
            const points: number[] = [], ns: number[] = [], is: number[] = [], sourceUV: number[] = [];
            source.getPositions(points); source.getNormals(ns); source.getIndices(is); source.getUvs(0, sourceUV);
            const base = positions.length / 3;
            for (let i = 0; i < points.length; i += 3) {
              matrix.transformPoint(v.set(points[i], points[i + 1], points[i + 2]), v); positions.push(v.x, v.y, v.z);
              normalMatrix.transformVector(v.set(ns[i], ns[i + 1], ns[i + 2]), v).normalize(); normals.push(v.x, v.y, v.z);
              uvs.push(sourceUV[(i / 3) * 2] ?? 0, sourceUV[(i / 3) * 2 + 1] ?? 0);
            }
            for (const index of is) indices.push(index + base);
          }
          return { positions, normals, indices, uvs };
        });
        const first = parts[0].render!, merged = new pc.Entity(`${parts[0].name} and ${parts.length - 1} more`);
        joint.addChild(merged);
        merged.addComponent("render", { meshInstances: [new pc.MeshInstance(mesh, material, merged)], batchGroupId: this.actorBatch,
          castShadows: first.castShadows, receiveShadows: first.receiveShadows });
        for (const part of parts) part.destroy();
      }
    }
  }
  // Each shadow cascade is a full extra pass over the scene. The nearest is
  // redrawn every frame; the second every other frame and the third one frame
  // in four, on different frames, so no frame draws all three. Their shadows
  // lie 30 m and more away, where a frame or three of lag cannot be seen.
  private scheduleShadowCascades() {
    const light = this.sun?.light;
    if (!light?.castShadows || light.numCascades < 2) { if (light?.shadowUpdateOverrides) light.shadowUpdateOverrides = null; return; }
    const overrides = light.shadowUpdateOverrides ??= [];
    for (let cascade = 0; cascade < light.numCascades; cascade++)
      overrides[cascade] = shadowCascadeDue(cascade, this.drawCount) ? pc.SHADOWUPDATE_THISFRAME : pc.SHADOWUPDATE_NONE;
  }
  // Soldiers are drawn as dynamic batches. Every frame the engine merges the
  // world bounds of each batched part into the batch's box, which means
  // transforming some 3,000 boxes to learn that soldiers are spread over the
  // field. Each soldier's parts share one box instead, moved with the soldier.
  private boundSoldiers() {
    this.people.forEach((root, i) => {
      const rig = this.soldiers[i];
      if (!rig) return;
      rig.bounds ??= new pc.BoundingBox(root.getPosition().clone().add(pc.Vec3.UP), new pc.Vec3(1.7, 1.5, 1.7));
      for (const render of root.findComponents("render") as pc.RenderComponent[]) {
        if (render.batchGroupId !== this.actorBatch) continue;
        for (const instance of render.meshInstances) {
          // The engine keeps this flag private; with it off, `aabb` is used as given.
          (instance as unknown as { _updateAabb: boolean })._updateAabb = false;
          instance.aabb = rig.bounds;
        }
      }
    });
  }
  private mergeSoldierKit(upper: pc.Entity, p: Soldier, look?: number) {
    this.kitMeshes ??= new Map();
    const key = `${p.team}-${p.faction}-${p.weapon}-${p.weaponId}${look === undefined ? "" : `-look${look}`}`;
    const textured=isKitFaction(p.faction);
    const parts=upper.children.filter(e=>(e as pc.Entity).render) as pc.Entity[];
    for(const detail of (textured?["near","far"]:["near"]) as ("near"|"far")[]){
      const meshKey=`${key}-${detail}`;
      if(this.kitMeshes.has(meshKey))continue;
      const positions:number[]=[],normals:number[]=[],indices:number[]=[],colors:number[]=[],uvs:number[]=[];
      const basis=upper.getWorldTransform().clone().invert();
      for(const e of parts){
        if(detail==="far"&&e.tags.has("far-omit"))continue;
        const matrix=new pc.Mat4().mul2(basis,e.getWorldTransform()),normalMatrix=matrix.clone().invert().transpose();
        const tag=e.tags.list().find(t=>t.startsWith(`model-${detail}:`));
        for(const instance of e.render!.meshInstances){
          const mesh=tag?this.kitMeshes.get(tag.slice(`model-${detail}:`.length)):instance.mesh;
          if(!mesh)continue;
          const points:number[]=[],ns:number[]=[],is:number[]=[],sourceUV:number[]=[];
          mesh.getPositions(points);mesh.getNormals(ns);mesh.getIndices(is);mesh.getUvs(0,sourceUV);
          const base=positions.length/3,tint=(instance.material as pc.StandardMaterial).diffuse;
          for(let i=0;i<points.length;i+=3){
            const v=matrix.transformPoint(new pc.Vec3(points[i],points[i+1],points[i+2]));positions.push(v.x,v.y,v.z);
            const n=normalMatrix.transformVector(new pc.Vec3(ns[i],ns[i+1],ns[i+2])).normalize();normals.push(n.x,n.y,n.z);
            colors.push(tint.r**2.2,tint.g**2.2,tint.b**2.2,1);
            uvs.push(sourceUV[i/3*2]??modelUV(.5,.5,"solid")[0],sourceUV[i/3*2+1]??modelUV(.5,.5,"solid")[1]);
          }
          indices.push(...is.map(i=>i+base));
        }
      }
      this.modelMesh(meshKey,()=>({positions,normals,indices,uvs,colors}));
    }
    // Merged parts stay as named markers, but disabled ones skip the
    // per-frame transform sync; the head is still read when a soldier falls.
    for(const part of parts){part.removeComponent("render");if(part.name!=="head"&&!part.children.length)part.enabled=false;}
    let material=textured?this.modelMaterial("#ffffff",true):this.materials.get("soldier-kit");
    if(!material){material=new pc.StandardMaterial();material.diffuse=new pc.Color(1,1,1);material.diffuseVertexColor=true;material.gloss=.1;material.update();this.materials.set("soldier-kit",material);}
    upper.addComponent("render",{meshInstances:[new pc.MeshInstance(this.kitMeshes.get(`${key}-near`)!,material,upper)],batchGroupId:textured?-1:this.actorBatch,castShadows:true,receiveShadows:true});
    upper.tags.add(`model-near:${key}-near`,`model-far:${key}-${textured?"far":"near"}`);
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
  private alignGripHand(rig:Pick<SoldierRig,"arms"|"rifle"|"bolt">,p:Soldier,tick:number) {
    const hand=rig.arms[1].elbow.findByName("hand") as pc.Entity;
    if(!hand?.tags.has("hand-side:right"))return;
    const pose=handlingWrist(p,tick),rotation=new pc.Quat().slerp(rig.rifle.getRotation(),rig.bolt.getRotation(),pose.bolt);
    rotation.mul(new pc.Quat().setFromEulerAngles(pose.pitch,0,pose.roll));
    hand.setLocalRotation(rig.arms[1].elbow.getRotation().clone().invert().mul(rotation));
  }
  private attachSupportArm(rig: SoldierRig) {
    const hand = rig.rifle
      .getLocalTransform()
      .transformPoint(rig.supportHand.getLocalPosition());
    this.poseArm(rig, 0, hand, supportUpperLength, supportForearmLength);
  }
  private createFirstPersonRig(faction?: FactionId) {
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
    const bomb = factionGrenade(faction);
    if (bomb.shape === "tin") {
      // A jam tin bound with wire, its fuse standing out of the lid.
      this.cube("held jam tin", 0, 0.015, 0, 0.09, 0.12, 0.09, bomb.body, false, explosive);
      for (const y of [-0.02, 0.05]) this.cube("held jam tin wire", 0, y, 0, 0.096, 0.012, 0.096, "#6d5f47", false, explosive);
      this.cube("held jam tin fuse", 0.015, 0.11, 0, 0.012, 0.07, 0.012, bomb.fuse, false, explosive, 12);
    } else if (bomb.shape === "ball") {
      const ball = new pc.Entity("held cricket-ball bomb");
      ball.addComponent("render", { type: "sphere", material: this.material(bomb.body) });
      ball.setLocalPosition(0, 0.015, 0);
      ball.setLocalScale(0.11, 0.11, 0.11);
      explosive.addChild(ball);
      this.cube("held bomb fuse", 0, 0.075, 0, 0.025, 0.03, 0.025, bomb.fuse, false, explosive);
    } else {
      this.riflePart("held grenade shell", 0, 0.015, 0, 0.11, 0.14, 0.11, "dark", explosive, "knob");
      this.cube("held grenade lever", 0.025, 0.08, 0, 0.018, 0.08, 0.025, "#868c75", false, explosive, 15);
      this.riflePart("held grenade pin", -0.01, 0.09, 0, 0.035, 0.035, 0.012, "edge", explosive, "hood");
    }
    this.riflePart("held smoke canister", 0, 0.025, 0, 0.085, 0.16, 0.085, "edge", smoke, "shroud");
    this.cube("held smoke cap", 0, 0.115, 0, 0.05, 0.025, 0.05, "#414d29", false, smoke);
    grenade.enabled = false;
    // Your own sleeves fill the bottom of the screen: faction cuffs and a
    // wrist, which the world model is too small to need.
    const player = this.activeGame?.players[0];
    if (isKitFaction(player?.faction))
      for (const arm of arms) for (const cuff of viewCuffParts(player.faction, factions[player.faction].shirt, looksFor(player.faction)[source.look ?? 0].skin)) {
        const e = this.organic(cuff.name, cuff.at[0], -armLengths.forearm + cuff.at[1], cuff.at[2], ...cuff.size, cuff.tint, arm.elbow, cuff.shape, modelSurfaceFor(cuff.name));
        if (cuff.rotation) e.setLocalEulerAngles(...cuff.rotation);
      }
    // These moving meshes are independent of the world actor batches.
    for (const component of root.findComponents("render") as pc.RenderComponent[]) {
      component.batchGroupId = -1;
      component.enabled = true;
      component.castShadows = false;
      for (const mesh of component.meshInstances) mesh.visible = true;
    }
    for(const component of root.findComponents("render") as pc.RenderComponent[]){
      const tags=component.entity.tags.list(),shape=tags.find(t=>t.startsWith("rifle-shape:"))?.slice(12) as RifleShape|undefined;
      const side=tags.find(t=>t.startsWith("hand-side:"))?.slice(10) as "left"|"right"|undefined;
      if(shape)component.meshInstances[0].mesh=this.modelMesh(`rifle-${shape}-view`,()=>rifleGeometry(shape,"view"));
      if(side)component.meshInstances[0].mesh=this.modelMesh(`hand-${side}-view`,()=>gripHandGeometry(side,"view"));
      // Sleeves and cloth at close range: the same profiles with many more sides.
      const organic=tags.find(t=>t.startsWith("model-near:organic-"))?.slice(11,-5);
      if(organic&&!side){
        const [,shape,surface]=organic.split("-") as [string,CharacterShape,ModelSurface|"coarse"|undefined];
        component.meshInstances[0].mesh=this.modelMesh(`${organic}-view`,()=>{
          const data=characterGeometry(shape,28);
          if(surface&&surface!=="coarse")data.uvs=data.uvs.flatMap((_,i,a)=>i%2?[]:modelUV(a[i],a[i+1],surface));
          return data;
        });
      }
    }
    for(const spec of source.design?.viewParts??[]){
      const e=this.riflePart(spec.name,...spec.at,...spec.size,spec.tint,rifle,spec.shape);
      if(spec.rotation)e.setLocalEulerAngles(...spec.rotation);
      if(e.render){e.render.meshInstances[0].mesh=this.modelMesh(`rifle-${spec.shape}-view`,()=>rifleGeometry(spec.shape,"view"));
        e.render.batchGroupId=-1;e.render.castShadows=false;}
    }
    // The last hand's breadth of barrel, which glows when it gets hot.
    const heatGlow = this.heatGlow(rifle, (source.design?.muzzle ?? -0.7) + 0.07, 0.042, 0.14);
    this.firstPersonRig = {
      root, rifle, arms, grenade, explosive, smoke, pullback: 0, heatGlow,
      supportHand: rifle.findByName("left hand grip") as pc.Entity,
      bolt: rifle.findByName("bolt") as pc.Entity,
      magazine: rifle.findByName("weapon magazine") as pc.Entity,
      reloadMagazine: arms[1].shoulder.findByName(source.reloadMagazine.name) as pc.Entity,
      rightHand: arms[1].elbow.findByName("hand") as pc.Entity, handPose: "grip",
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
    rig.ads=aimBlend(p,tick);
    const change=switchPose(p,tick);
    const charge = chargePresentation(p, tick, source.phase, source.motion);
    const throwing = throwPresentation(p, tick);
    const loading = reloadMotion(p, tick);
    const sprint = source.sprint * (1 - charge.ready) * (throwing || loading ? 0 : 1);
    const hip = viewWeaponPosition(false, p.weapon), aimed=viewWeaponPosition(true,p.weapon);
    const target={x:hip.x+(aimed.x-hip.x)*rig.ads,y:hip.y+(aimed.y-hip.y)*rig.ads,z:hip.z+(aimed.z-hip.z)*rig.ads};
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
    const sway = (1-rig.ads)*Math.sin(source.phase)*source.motion*.008;
    // The weapon's own kick: driven back, muzzle up, rolled, and for automatic
    // weapons a buzz that jumps side to side with each round.
    const feel = feelFor(p) ?? recoilFeel.rifle, kick = recoilPulse(p, tick);
    const buzz = feel.buzz ? recoilBuzz(p.recoilShots, p.id) : 1;
    const hipBob=!p.command.sprint&&!p.melee&&!loading&&!throwing?(1-rig.ads)*(Math.cos(source.phase*2)-1)*source.motion*.004:0;
    rig.rifle.setLocalPosition(
      position.x + sway + lower * 0.06 + sprint * (0.07 + Math.sin(source.phase) * 0.012) - charge.ready * 0.045 + charge.side * 0.016,
      position.y + hipBob - change.lower*.55 - lower * 0.12 - throwLower * 0.15 - sprint * 0.09 + charge.ready * 0.11 + charge.bob * 0.006 + kick * feel.push * 0.12,
      position.z + change.lower*.22 + sprint * 0.05 + kick * feel.push - (melee?.thrust ?? 0) * 0.18 - charge.ready * 0.04 + charge.bob * 0.008,
    );
    rig.rifle.setLocalEulerAngles(
      -30*change.lower -24 * lower - throwLower * 18 - sprint * 22 + charge.ready * 4 + charge.bob * 0.8 + kick * feel.rise,
      10 * lower + charge.side + kick * feel.buzz * buzz * 0.9,
      20*change.lower -28 * lower - sprint * 18 - charge.ready * 5 + charge.side * 1.2 + kick * feel.roll * buzz,
    );
    const eye = this.camera.getPosition();
    const muzzle = rig.rifle.getWorldTransform().transformPoint(new pc.Vec3(0, 0.025, barrelEnd(p.weapon,p.weaponId)));
    const along = rig.rifle.forward;
    this.fpMuzzle = { at: { x: muzzle.x, y: muzzle.y, z: muzzle.z }, dir: { x: along.x, y: along.y, z: along.z } };
    const hot = p.weapon === "pistol" ? 0 : p.barrel.heat;
    this.showHeat(rig.heatGlow, hot, tick);
    if (hot > 0.18)
      this.fx().heat({ key: "first-person", at: this.fpMuzzle.at, dir: this.fpMuzzle.dir, length: 0.45, heat: hot, overheated: p.barrel.overheated, water: this.waterCooled(p.weaponId, false), near: true }, dt);
    let needed = weaponPullback(eye, muzzle, this.camera.forward, (a, b) => this.ray(a, b));
    if (p.weapon === "serviceRifle") {
      // The real point of this rifle's bayonet, wherever its muzzle puts it.
      const { blade } = bayonetMount(weaponDesign(p)?.muzzle ?? -0.7);
      const tip = rig.rifle.getWorldTransform().transformPoint(new pc.Vec3(0, blade.at[1], blade.at[2] - blade.size[1] / 2));
      needed = Math.max(needed, weaponPullback(eye, tip, this.camera.forward, (a, b) => this.ray(a, b)));
    }
    // Respond immediately toward cover, settle smoothly away; no clipping lag.
    rig.pullback = Math.max(needed, rig.pullback * Math.exp(-14 * dt));
    const weapon = rig.rifle.getLocalPosition();
    rig.rifle.setLocalPosition(weapon.x, weapon.y, weapon.z + rig.pullback);
    rig.bolt.setLocalPosition(source.bolt.getLocalPosition());
    rig.bolt.setLocalRotation(source.bolt.getLocalRotation());
    rig.magazine.setLocalScale(source.magazine.getLocalScale());
    rig.magazine.setLocalRotation(source.magazine.getLocalRotation());
    const toggle=rig.bolt.findByName("Luger toggle front link") as pc.Entity;
    if(toggle)toggle.setLocalRotation((source.bolt.findByName("Luger toggle front link") as pc.Entity).getLocalRotation());
    rig.reloadMagazine.setLocalScale(source.reloadMagazine.getLocalScale());
    rig.arms[0].shoulder.setLocalPosition(-0.22, -0.3, -0.12 + rig.pullback);
    rig.arms[1].shoulder.setLocalPosition(0.24, -0.3, -0.1 + (throwing ? 0 : rig.pullback));
    const left = rig.rifle.getLocalTransform().transformPoint(rig.supportHand.getLocalPosition());
    this.poseArm(rig, 0, left, armLengths.upper, armLengths.forearm);
    let right = rig.rifle.getLocalTransform().transformPoint(new pc.Vec3(...(weaponDesign(p)?.trigger ?? [0,-.03,.14]) as [number,number,number]));
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
    // The right hand's fingers follow the action: index on the trigger,
    // thumb and finger on the bolt knob, thumb down on a clip, round a grenade.
    if (rig.rightHand?.tags.has("hand-side:right")) {
      const cycling = boltMotion(p, tick), service = p.weapon === "serviceRifle";
      const wanted: HandPose = throwing?.held ? "grenade"
        : loading ? (service && loading.progress > .46 && loading.progress < .68 ? "press" : service ? "pinch" : "grip")
        : cycling ? "pinch" : sprint > .5 || change.active || p.melee ? "grip" : "trigger";
      if (wanted !== rig.handPose) {
        rig.handPose = wanted;
        rig.rightHand.render!.meshInstances[0].mesh = this.modelMesh(`hand-right-view-${wanted}`, () => gripHandGeometry("right", "view", wanted));
      }
    }
    this.alignGripHand(rig,p,tick);
  }
  private plantFeet(p:Soldier,rig:SoldierRig,dt:number,tick:number,teleported:boolean) {
    const root=this.people[p.id],distance=root.getPosition().distance(this.camera.getPosition());
    const active=p.id===0||distance<(rig.feetActive?footRules.far:footRules.near);
    if(!active||p.hp<=0||p.mantle||p.hop||p.fall||teleported||Math.abs(supportHeight(root.getPosition().x,root.getPosition().z,this.map,root.getPosition().y+.23)-root.getPosition().y)>.34){
      rig.feetActive=false;rig.feet=undefined;return;
    }
    rig.feetActive=true;rig.feet??=[];
    const rootY=root.getPosition().y,revision=this.map.destruction?.revision??0;
    const contacts=rig.legs.map((leg,i)=>updateFootContact(rig.feet![i],{
      x:root.getPosition().x,z:root.getPosition().z,rootY,yaw:p.yaw,phase:rig.phase+i*Math.PI,
      motion:rig.motion,sprint:rig.sprint,crouch:rig.crouch,forward:rig.forward,sideways:rig.sideways,side:i?1:-1,revision,dt,
    },this.map));
    const low=Math.min(0,...contacts.map(c=>c?c.contact.y-footRules.sole-rootY:0));
    const position=rig.body.getLocalPosition();
    rig.body.setLocalPosition(position.x,position.y-rig.motion*(.08+.025*rig.sprint)+Math.max(-.08,low*.35),position.z);
    const inverse=rig.hips.getWorldTransform().clone().invert();
    for(let i=0;i<2;i++){
      const result=contacts[i];if(!result){rig.feet[i]=undefined;continue;}
      rig.feet[i]=result.contact;
      const leg=rig.legs[i],hip=leg.hip.getLocalPosition(),target=inverse.transformPoint(new pc.Vec3(result.contact.x,result.contact.y,result.contact.z));
      const direction=target.clone().sub(hip),distance=Math.max(.06,Math.min(direction.length(),footRules.thigh+footRules.calf-.0005));direction.normalize();
      const bend=new pc.Vec3(0,0,-1);bend.sub(direction.clone().mulScalar(bend.dot(direction))).normalize();
      const along=(footRules.thigh**2-footRules.calf**2+distance**2)/(2*distance),height=Math.sqrt(Math.max(0,footRules.thigh**2-along**2));
      const knee=hip.clone().add(direction.clone().mulScalar(along)).add(bend.mulScalar(height));
      const upper=new pc.Quat().setFromDirections(pc.Vec3.DOWN,knee.clone().sub(hip).normalize());
      const end=hip.clone().add(direction.clone().mulScalar(distance));
      const lower=new pc.Quat().setFromDirections(pc.Vec3.DOWN,end.sub(knee).normalize());
      leg.hip.setLocalRotation(upper);leg.knee.setLocalRotation(upper.clone().invert().mul(lower));
      const foot=new pc.Quat().setFromEulerAngles(result.pitch*180/Math.PI,-result.contact.yaw*180/Math.PI,result.roll*180/Math.PI);
      leg.ankle.setLocalRotation(leg.knee.getRotation().clone().invert().mul(foot));
    }
  }
  private animateSoldier(
    p: Soldier,
    x: number,
    z: number,
    dt: number,
    tick: number,
  ) {
    const rig = this.soldiers[p.id], design=weaponDesign(p);
    rig.arms[0].shoulder.setLocalPosition(-0.27, 0.41, -0.12);
    const shoulderTarget=(p.weapon==="serviceRifle"||p.weapon==="machineGun")&&!p.reloadAt&&!p.mantle&&!p.melee&&p.throwUntil<=tick&&(p.command.aim||p.command.fire||tick-p.lastShotAt<18)?1:0;
    rig.shoulderReady=(rig.shoulderReady??0)+(shoulderTarget-(rig.shoulderReady??0))*(1-Math.exp(-14*dt));
    rig.arms[1].shoulder.setLocalPosition(.29-.04*rig.shoulderReady,.41+.03*rig.shoulderReady,.02*rig.shoulderReady);
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
    const wasStill=rig.motion<.04;
    rig.motion = rig.alive
      ? rig.motion + (Math.min(1, speed / 4.5) - rig.motion) * blend
      : 0;
    const sprint =
      p.command.sprint && !p.command.aim && !p.crouched
        ? Math.max(0, Math.min(1, (speed - 4) / 3))
        : 0;
    rig.sprint = rig.alive ? rig.sprint + (sprint - rig.sprint) * blend : 0;
    if(wasStill && speed>.2 && distance<2)rig.phase=Math.PI*footCycle(0,rig.motion,rig.sprint,rig.crouch).duty+(rig.style.side<0?Math.PI:0);
    rig.phase =
      (rig.phase +
        moved *
          gaitFrequency(rig.motion,rig.sprint,rig.crouch) *
          rig.style.cadence) %
      (Math.PI * 2);
    const crouchTarget = p.crouched && !p.mantle && !p.hop && p.hp > 0 ? 1 : 0;
    rig.weight??=movementWeight(p.yaw,rig.crouch);
    advanceMovementWeight(rig.weight,travelForward*speed,travelSideways*speed,p.yaw,crouchTarget,dt,
      distance>=2||!rig.alive||!!p.mantle||!!p.hop||!!p.fall);
    const weight=rig.weight;
    rig.crouch = weight.crouch.value;
    const crouchDrop = crouchRules.drop * rig.crouch;
    const squatAngle =
      (Math.acos(clamp01((0.82 - crouchDrop) / 0.82)) * 180) / Math.PI;
    const stride = Math.sin(rig.phase) * rig.motion;
    const kick = recoilPulse(p, tick + 1);
    const ready = p.command.aim || p.command.fire || p.reloadAt > 0;
    rig.body.setLocalPosition(
      -weight.side.value*.003,
      0.94 -
        crouchDrop -
        (p.duckUntil > tick && !p.crouched ? 0.09 : 0) +
        (Math.cos(rig.phase * 2) - 1) * 0.022 * rig.motion,
      weight.forward.value*.003,
    );
    rig.body.setLocalEulerAngles(
      -forward * rig.motion * (2 + 8 * rig.sprint) - 8 * rig.crouch + weight.forward.value,
      0,
      -sideways * rig.motion * 4 + weight.side.value + weight.turn.value*.15,
    );
    rig.hips.setLocalEulerAngles(
      0,
      -Math.atan2(sideways, Math.abs(forward) + 0.001) * 40 * rig.motion + weight.turn.value*1.5,
      0,
    );
    // The torso takes part of the aim pitch, so a soldier firing uphill leans
    // back and one firing down into a trench bends over it. The rifle keeps the
    // exact aim; the lean eases out for reloads, throws, melee and climbing.
    const reloading = reloadMotion(p, tick);
    const leanTarget = p.mantle || p.hop || p.melee || p.throwUntil > tick ? 0
      : Math.max(-16, Math.min(18, weaponAim(p).pitch * 180 / Math.PI * .4)) * (ready ? 1 : .5) * (1 - (reloading?.lower ?? 0));
    rig.aimLean = rig.alive ? (rig.aimLean ?? leanTarget) + (leanTarget - (rig.aimLean ?? leanTarget)) * (1 - Math.exp(-10 * dt)) : 0;
    const lean = rig.aimLean;
    const breath = Math.sin((tick / 30) * 1.7 + rig.style.phase);
    const idleTurn =
      Math.sin((tick / 30) * 0.65 + rig.style.phase) *
      rig.style.sway *
      (ready ? 0.25 : 1.6) *
      (1 - rig.motion);
    rig.upper.setLocalPosition(0, 0.08 + breath * 0.003 * (1 - rig.motion), 0);
    rig.upper.setLocalEulerAngles(
      lean - kick * 2 * (feelFor(p)?.shoulder ?? 1) + breath * 0.35 * (1 - rig.motion),
      stride * (ready ? 1.5 : 4) * rig.style.sway + idleTurn + weight.turn.value*.3,
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
      weaponMount.z + kick * 0.09 * (feelFor(p)?.shoulder ?? 1),
    );
    rig.rifle.setLocalEulerAngles(
      -rig.sprint * 20 +
        stride * 2 +
        (weaponAim(p).pitch * 180) / Math.PI - lean +
        kick * 5 * (feelFor(p)?.shoulder ?? 1),
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
      const mantleBlend=smooth(t/.16),fromPosition=rig.body.getLocalPosition().clone(),fromRotation=rig.body.getLocalRotation().clone();
      rig.body.setLocalPosition(fromPosition.lerp(fromPosition,new pc.Vec3(0,0.94-0.12*effort,-.025*Math.sin(t*Math.PI)),mantleBlend));
      rig.body.setLocalRotation(fromRotation.slerp(fromRotation,new pc.Quat().setFromEulerAngles(-(up?35:20)*effort,0,0),mantleBlend));
      rig.upper.setLocalEulerAngles(10 * effort, 0, -5 * effort);
      rig.hips.setLocalEulerAngles(0, 0, 0);
      for (let i = 0; i < 2; i++) {
        const hip = (i === 0 ? 90 : 100) * tuck + 25 * effort * (1 - tuck);
        const knee = (i === 0 ? -130 : -140) * tuck - 50 * effort * (1 - tuck);
        for(const [joint,angle] of [[rig.legs[i].hip,hip],[rig.legs[i].knee,knee],[rig.legs[i].ankle,35*effort-hip-knee]] as const)
          joint.setLocalRotation(new pc.Quat().slerp(joint.getLocalRotation(),new pc.Quat().setFromEulerAngles(angle,0,0),mantleBlend));
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
        .transformPoint(new pc.Vec3(...(weaponDesign(p)?.trigger ?? [0,-.03,.14]) as [number,number,number]));
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
      rig.rifle.setLocalEulerAngles(-24 * lower - lean, 10 * lower, -28 * lower);
      const trigger = rig.rifle
        .getLocalTransform()
        .transformPoint(new pc.Vec3(...(weaponDesign(p)?.trigger ?? [0,-.03,.14]) as [number,number,number]));
      const service = p.weapon === "serviceRifle";
      const feed=design?.feed ? new pc.Vec3(...design.feed) : null;
      if(feed && design?.reload === "revolver"){const pivot=new pc.Vec3(...design.actionOrigin);feed.sub(pivot);new pc.Quat().setFromEulerAngles(55*loading.lower,0,0).transformVector(feed,feed);feed.add(pivot);}
      const well = rig.rifle
        .getLocalTransform()
        .transformPoint(
          feed ?? (service
            ? new pc.Vec3(0.025, 0.16, 0.06)
            : new pc.Vec3(0.025, -0.23, 0.14)),
        );
      const belt = new pc.Vec3(0.23, 0.02, -0.27);
      const bolt = rig.rifle
        .getLocalTransform()
        .transformPoint(new pc.Vec3(0.1, 0.08, 0.22));
      const keys = service
        ? [
            { t: 0, p: trigger },
            { t: 0.14, p: bolt, contact:true },
            { t: 0.32, p: belt },
            { t: 0.48, p: well, contact:true },
            { t: 0.65, p: well.clone().add(new pc.Vec3(0, -0.09, 0)), contact:true },
            { t: 0.84, p: bolt, contact:true },
            { t: 1, p: trigger },
          ]
        : [
            { t: 0, p: trigger },
            { t: 0.18, p: well },
            { t: 0.4, p: belt },
            { t: 0.64, p: well, contact:true },
            { t: 0.79, p: bolt },
            { t: 1, p: trigger },
          ];
      const sampled=handlingPath(keys,t),hand=new pc.Vec3(sampled.x,sampled.y,sampled.z);
      if((design?.reload === "tube" || design?.reload === "revolver") && t>.2 && t<.78){
        const stroke=(t-.2)/.58*(design.reload === "tube"?5:6)%1;
        hand.lerp(belt,well,smooth(Math.min(1,stroke*2))*(1-smooth(Math.max(0,(stroke-.8)*5))));
      }
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
    const origin=design?.actionOrigin ?? [.05,.045,.13];
    rig.bolt.setLocalPosition(origin[0],origin[1],origin[2]+boltPull*(design?.travel ?? .13));
    rig.bolt.setLocalEulerAngles(0,0,(design?.lift ?? 65)*boltLift);
    if(design?.kind === "pistol") {
      const kick=recoilPulse(p,tick),rack=loading?Math.sin(Math.PI*clamp01((loading.progress-.73)/.2)):0;
      if(design.family === "webley") {
        rig.bolt.setLocalEulerAngles(55*(loading?.lower??0),0,0);
        rig.magazine.setLocalEulerAngles(90,0,0);rig.magazine.rotateLocal(0,(8-p.ammo)*60,0);
      } else {
        rig.bolt.setLocalPosition(origin[0],origin[1],origin[2]+design.travel*Math.max(kick,rack));
        rig.bolt.setLocalEulerAngles(design.family === "luger"?40*Math.max(kick,rack):0,0,0);
        if(design.family === "luger")(rig.bolt.findByName("Luger toggle front link") as pc.Entity).setLocalEulerAngles(-80*Math.max(kick,rack),0,0);
      }
    } else if(design?.kind === "machineGun" && loading) {
      const rack=Math.sin(Math.PI*clamp01((loading.progress-.74)/.2));
      rig.bolt.setLocalPosition(origin[0],origin[1],origin[2]+rack*design.travel);
      if(design.reload === "belt")rig.bolt.setLocalEulerAngles(-60*loading.lower,0,0);
    }
    if (cycling && !p.mantle && p.throwUntil <= tick) {
      rig.rifle.rotateLocal(-5 * cycling.reach, 0, -6 * cycling.reach);
      const hand = rig.rifle
        .getLocalTransform()
        .transformPoint(
          rig.bolt.getLocalTransform().transformPoint(new pc.Vec3(...(design?.boltGrip ?? [boltGrip.x,boltGrip.y,boltGrip.z]) as [number,number,number])),
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
    const throwing = !p.mantle ? throwBody(p, tick) : null;
    if (throwing) {
      // Rifle down in the left hand; the body winds up and comes through.
      rig.body.rotateLocal(throwing.lean * throwing.weight, 0, 0);
      rig.upper.rotateLocal(0, throwing.twist * throwing.weight, 0);
      rig.rifle.setLocalEulerAngles(-30, 0, 15);
      rig.arms[1].shoulder.setLocalEulerAngles(throwing.shoulder, 0, -15);
      rig.arms[1].elbow.setLocalEulerAngles(throwing.elbow, 0, 0);
    }
    rig.heldGrenade?.setLocalScale(throwing?.held ? pc.Vec3.ONE : pc.Vec3.ZERO);
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
        .transformPoint(new pc.Vec3(...(weaponDesign(p)?.trigger ?? [0,-.03,.14]) as [number,number,number]));
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
    if (p.hp > 0 && !p.mantle && !p.hop) {
      const {brace, side} = combatReactionPose(p, tick);
      rig.upper.rotateLocal(12 * brace, 0, side * 5 * brace);
    }
    // Keep all actor renderers in their batches. Visibility is an animated
    // transform, using the ordinary bind pose captured before the first draw.
    rig.magazine.setLocalScale(
      magazineVisible ? rig.magazineScale : pc.Vec3.ZERO,
    );
    rig.reloadMagazine.setLocalScale(
      carryingMagazine ? rig.reloadMagazineScale : pc.Vec3.ZERO,
    );
    const change=switchPose(p,tick);
    if(change.active && !p.mantle){
      const position=rig.rifle.getLocalPosition();
      rig.rifle.setLocalPosition(position.x,position.y-change.lower*.25,position.z+change.lower*.1);
      rig.rifle.rotateLocal(-25*change.lower,0,15*change.lower);
      const hand=rig.rifle.getLocalTransform().transformPoint(new pc.Vec3(...(design?.trigger??[0,-.03,.14]) as [number,number,number]));
      this.poseArm(rig,1,hand,armLengths.upper,armLengths.forearm);
    }
    if(rig.shoulderReady && this.map.terrain && !loading && !cycling && !p.mantle && !p.melee && p.throwUntil<=tick){
      const position=rig.rifle.getLocalPosition().clone(),shift=.018*rig.shoulderReady;
      const grip=rig.rifle.getLocalTransform().transformPoint(rig.supportHand.getLocalPosition());grip.x+=shift;
      if(grip.distance(rig.arms[0].shoulder.getLocalPosition())<supportUpperLength+supportForearmLength-.005){
        rig.rifle.setLocalPosition(position.x+shift,position.y,position.z);
        this.poseArm(rig,1,rig.rifle.getLocalTransform().transformPoint(new pc.Vec3(...(design?.trigger??[0,-.03,.14]) as [number,number,number])),armLengths.upper,armLengths.forearm);
      }
    }
    // A raised periscope rifle rides above the head: the hands hold the frame
    // below it, the right on the lower grip and the left on the upright.
    const raisedBy = !p.mantle && !p.melee ? periscopeLift(p) : 0;
    if (raisedBy > 0.01) {
      const position = rig.rifle.getLocalPosition();
      rig.rifle.setLocalPosition(position.x, position.y + raisedBy, position.z);
      this.poseArm(rig, 1, rig.rifle.getLocalTransform().transformPoint(new pc.Vec3(0, -1.0, 0.14)), armLengths.upper, armLengths.forearm);
    }
    this.plantFeet(p,rig,dt,tick,distance>=2);
    this.attachSupportArm(rig);
    if (raisedBy > 0.01) this.poseArm(rig, 0, rig.rifle.getLocalTransform().transformPoint(new pc.Vec3(0, -0.62, -0.02)), supportUpperLength, supportForearmLength);
    else this.alignGripHand(rig,p,tick);
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
    c.ragdoll.destroy(); c.entity.destroy();
  }
  // Knees give and the body drops and twists away from the hit. The ragdoll
  // starts from this pose once the fall has played (`fallReady`).
  private poseDeathFall(p: Soldier, rig: SoldierRig, age: number, lieDown: boolean) {
    if (rig.settled) return;
    const hit = this.deathHits.get(p.id);
    const local = hit ? this.people[p.id].getRotation().clone().invert().transformVector(hit) : pc.Vec3.ZERO;
    const fall = deathFall(lieDown ? age : Math.min(age, deathFallRules.fallTicks), local);
    rig.body.setLocalPosition(0, 0.94 - fall.drop, 0);
    rig.body.setLocalEulerAngles(fall.pitch, 0, fall.roll);
    rig.hips.setLocalEulerAngles(0, 0, 0);
    rig.upper.setLocalEulerAngles(fall.slump, fall.twist, 0);
    for (const leg of rig.legs) {
      leg.hip.setLocalEulerAngles(fall.hip, 0, 0);
      leg.knee.setLocalEulerAngles(fall.knee, 0, 0);
      leg.ankle.setLocalEulerAngles(fall.ankle, 0, 0);
    }
    // The rifle sags out of the aim, still in the left hand.
    rig.rifle.setLocalEulerAngles(-35 * fall.arm, 0, 20 * fall.arm);
    rig.arms[1].shoulder.setLocalEulerAngles(65 - 45 * fall.arm, 0, -8);
    rig.arms[1].elbow.setLocalEulerAngles(25 - 15 * fall.arm, 0, 0);
    this.attachSupportArm(rig);
    if (fall.fallen) rig.fallReady = true;
    if (lieDown ? fall.lying : fall.fallen) rig.settled = true;
  }
  private queueCasualty(p: Soldier) {
    this.visualWork ??= new VisualWorkQueue();
    this.pendingCasualties ??= new Map();
    const rig = this.soldiers[p.id], actor = this.people[p.id];
    if (rig.remnantCreated) return;
    rig.remnantCreated = true;
    rig.fallReady = false;
    rig.settled = false;
    if (Math.hypot(p.x - this.camera.getPosition().x, p.z - this.camera.getPosition().z) > casualtyRules.range) {
      // Too far for a ragdoll: the rig falls and stays down instead of vanishing.
      rig.downAtRange = true; return;
    }
    const pending = { rig, blasts: [] as { at: pc.Vec3; radius: number; power: number }[] };
    this.pendingCasualties.set(p.id, pending);
    const impulse = this.deathHits.get(p.id)?.clone();
    const game = this.activeGame;
    this.visualWork.set(`casualty:${p.id}`, { kind: "casualty", ready: () => rig.fallReady !== false, run: () => {
      this.pendingCasualties.delete(p.id);
      // A respawn, kit replacement or map reset invalidates the old death.
      if (this.activeGame !== game || this.soldiers[p.id] !== rig || p.hp > 0) return;
      actor.setLocalScale(pc.Vec3.ONE);
      try {
        const corpse = this.retainCasualty(p, impulse);
        if (corpse) for (const blast of pending.blasts)
          corpse.ragdoll.blast(blast.at, blast.radius, blast.power);
      } finally { actor.setLocalScale(pc.Vec3.ZERO); }
    } });
  }
  private retainCasualty(p: Soldier, impulse = new pc.Vec3(0.5, 0, 1.5)) {
    const start = battlePerformance.begin();
    try { return this.buildCasualty(p,impulse); } finally { battlePerformance.end("ragdollCreate",start); }
  }
  private buildCasualty(p: Soldier, impulse: pc.Vec3) {
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
    const pose = this.ragdollPose(p);
    const mesh = this.casualtyMesh(p, pose);
    if (!mesh) return;
    this.ragdollPhysics ??= new RagdollPhysics(this.terrainPhysics.world, this.map);
    const ragdoll = this.ragdollPhysics.create(pose.parts, new pc.Vec3(p.vx, 0, p.vz));
    ragdoll.hit(impulse, pose.parts[1].position.clone().add(new pc.Vec3(0.08, 0.08, 0)));
    const entity = this.joint("fallen soldier", this.app.root);
    let material = this.materials.get("casualty");
    if (!material) {
      material = this.modelMaterial("#ffffff",true).clone();
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
    const skin = new pc.SkinInstance(mesh.skin!);
    skin.bones = bones; skin.rootBone = entity; instance.skinInstance = skin;
    instance.castShadow = false;
    entity.addComponent("render", { meshInstances: [instance] });
    const corpse = { entity, mesh, skin, bones, ragdoll, x: p.x, z: p.z, age: 0 };
    this.casualties.push(corpse);
    this.soldierStats.remnants++;
    this.soldierStats.peakRemnants = Math.max(
      this.soldierStats.peakRemnants,
      this.casualties.length,
    );
    return corpse;
  }
  // Bake a kit's stand-in from this soldier as it is posed now: its far-detail
  // parts split into the body above the hips and each leg.
  private bakeStandIn(p: Soldier, key: string) {
    const rig = this.soldiers[p.id], root = this.people[p.id];
    if (!rig || !root || !this.distantSoldiers) return;
    const atlas = this.textures?.get("model-atlas-diffuse");
    const walnut = this.materials.get("rifle-material-walnut"), steel = this.materials.get("rifle-material-steel");
    const parts: BakePart[] = [];
    for (const component of root.findComponents("render") as pc.RenderComponent[]) {
      const entity = component.entity;
      if (!entity.enabled || !component.enabled || entity.tags.has("far-omit")) continue;
      let piece: BakePart["piece"] = "torso", skip = false;
      for (let node: pc.GraphNode | null = entity; node && node !== root; node = node.parent) {
        if (node === rig.reloadMagazine || node === rig.gasMask || node === rig.heldGrenade) { skip = true; break; }
        if (node === rig.legs[0].hip) piece = "left";
        else if (node === rig.legs[1].hip) piece = "right";
      }
      if (skip) continue;
      const farTag = entity.tags.list().find((t) => t.startsWith("model-far:"));
      for (const instance of component.meshInstances) {
        const material = instance.material as pc.StandardMaterial;
        const mesh = (farTag && this.kitMeshes.get(farTag.slice("model-far:".length))) || instance.mesh;
        if (!mesh || !material) continue;
        const tile = material === walnut ? "walnut" : material === steel ? "steel" : "solid";
        const tint = material === walnut ? color("#715037") : material === steel ? color("#353c3a") : material.diffuse ?? new pc.Color(0.4, 0.4, 0.35);
        parts.push({ mesh, world: entity.getWorldTransform(), tint, atlased: !!atlas && material.diffuseMap === atlas, tile: (u, v) => modelUV(u, v, tile), piece });
      }
    }
    const inverseRoot = root.getWorldTransform().clone().invert();
    const hip = inverseRoot.transformPoint(rig.legs[0].hip.getPosition(), new pc.Vec3());
    this.distantSoldiers.bake(key, { root: root.getWorldTransform(), body: rig.body.getWorldTransform(), left: rig.legs[0].hip.getWorldTransform(), right: rig.legs[1].hip.getWorldTransform() }, parts, hip.y);
  }
  private casualtyMesh(p: Soldier, pose = this.ragdollPose(p)) {
    this.casualtyTemplates ??= new Map();
    const look = this.soldiers[p.id]?.look;
    const key = `${p.team}-${this.actorKits?.get(p.id) ?? `${p.faction}-${p.weapon}-${p.weaponId}`}${look === undefined ? "" : `-look${look}`}`;
    const existing = this.casualtyTemplates.get(key);
    if (existing) return existing;
    const positions: number[] = [],
      normals: number[] = [],
      indices: number[] = [],
      colors: number[] = [], uvs:number[]=[], weights: number[] = [], blendIndices: number[] = [];
    const scratch = new pc.Vec3();
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
          sourceColors: number[] = [],sourceUV:number[]=[];
        instance.mesh.getColors(sourceColors);
        instance.mesh.getUvs(0,sourceUV);
        instance.mesh.getPositions(points);
        instance.mesh.getNormals(ns);
        instance.mesh.getIndices(is);
        const base = positions.length / 3;
        let tint =
          (instance.material as pc.StandardMaterial).diffuse ??
          new pc.Color(0.4, 0.4, 0.35);
        if (instance.material === this.materials.get("rifle-material-walnut")) tint = color("#715037");
        if (instance.material === this.materials.get("rifle-material-steel")) tint = color("#353c3a");
        // Per-vertex work only: one army's kit is merged several times at
        // deployment (once per face), so nothing here allocates or searches.
        const material=instance.material as pc.StandardMaterial,atlas=this.textures?.get("model-atlas-diffuse");
        const tile=material===this.materials.get("rifle-material-walnut")?"walnut":material===this.materials.get("rifle-material-steel")?"steel":"solid";
        const atlased=!!atlas&&material.diffuseMap===atlas, torso=component.entity === this.soldiers[p.id].upper;
        const boneIndex=pose.parts.findIndex(part => part.name === bone), headIndex=pose.parts.findIndex(part => part.name === "head");
        const r=tint.r ** 2.2, g=tint.g ** 2.2, b=tint.b ** 2.2;
        for (let i = 0; i < points.length; i += 3) {
          const v = world.transformPoint(scratch.set(points[i], points[i + 1], points[i + 2]), scratch);
          positions.push(v.x, v.y, v.z);
          const head = torso && (v.x - pose.head.x) * pose.up.x + (v.y - pose.head.y) * pose.up.y + (v.z - pose.head.z) * pose.up.z > -0.17;
          blendIndices.push(head ? headIndex : boneIndex, 0, 0, 0);
          weights.push(1, 0, 0, 0);
          const n = normalMatrix.transformVector(scratch.set(ns[i], ns[i + 1], ns[i + 2]), scratch).normalize();
          normals.push(n.x, n.y, n.z);
          const sourceU=sourceUV[i/3*2]??.5,sourceV=sourceUV[i/3*2+1]??.5;
          if(atlased)uvs.push(sourceU,sourceV);
          else{const [u,w]=modelUV(sourceU,sourceV,tile);uvs.push(u,w);}
          const ci = (i / 3) * 4;
          colors.push(r * (sourceColors[ci] ?? 1), g * (sourceColors[ci + 1] ?? 1), b * (sourceColors[ci + 2] ?? 1), 1);
        }
        for (const index of is) indices.push(index + base);
      }
    }
    if (!indices.length) return;
    const mesh = new pc.Mesh(this.app.graphicsDevice);
    mesh.setPositions(positions);
    mesh.setNormals(normals);
    mesh.setColors(colors);
    mesh.setUvs(0,uvs);
    mesh.setVertexStream(pc.SEMANTIC_TANGENT,pc.calculateTangents(positions,normals,uvs,indices).map(v=>Number.isFinite(v)?v:0),4);
    mesh.setIndices(indices);
    mesh.setVertexStream(pc.SEMANTIC_BLENDINDICES, blendIndices, 4, undefined, pc.TYPE_UINT8);
    mesh.setVertexStream(pc.SEMANTIC_BLENDWEIGHT, weights, 4);
    mesh.skin = new pc.Skin(this.app.graphicsDevice, pose.parts.map(part => new pc.Mat4().setTRS(part.position, part.rotation, pc.Vec3.ONE).invert()), pose.parts.map(p => p.name));
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    // Retain a template reference so evicting its last corpse keeps buffers warm.
    mesh.incRefCount();
    this.casualtyTemplates.set(key, mesh);
    return mesh;
  }
  private blastCasualties(e: Extract<Event, { type: "grenadeExplosion" | "artilleryImpact" }>) {
      const at = new pc.Vec3(e.at.x, e.at.y, e.at.z);
      // Death events precede the impact effect. Preserve that killing impulse
      // for bodies whose physical setup is deferred to a later frame.
      for (const [id, pending] of this.pendingCasualties ?? []) {
        const p = this.activeGame!.players[id];
        if (Math.hypot(p.x - e.at.x, p.y + 1 - e.at.y, p.z - e.at.z) > e.radius * 1.25) continue;
        const cover = this.ray(e.at, { x: p.x, y: p.y + 1, z: p.z }) < 0.98 ? 0.25 : 1;
        if (pending.blasts.length < 4) pending.blasts.push({ at, radius: e.radius * 1.25, power: (e.type === "artilleryImpact" ? 140 : 90) * cover });
      }
      for (const c of this.casualties) {
        c.ragdoll.read();
        const p = c.ragdoll.positions[0];
        const cover = this.ray(e.at, p) < 0.98 ? 0.25 : 1;
        c.ragdoll.blast(at, e.radius * 1.25, (e.type === "artilleryImpact" ? 140 : 90) * cover);
      }
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
      if (c.poseVersion !== c.ragdoll.poseVersion) {
        for (let i = 0; i < c.bones.length; i++) {
          c.bones[i].setPosition(c.ragdoll.positions[i]); c.bones[i].setRotation(c.ragdoll.rotations[i]);
        }
        c.poseVersion = c.ragdoll.poseVersion;
      }
      c.entity.render!.meshInstances[0].setParameter(
        "material_opacity",
        Math.min(1, (casualtyRules.lifetime - c.age) / 2),
      );
      return true;
    });
  }
  // Rain changes the light and sky, wets the ground and floods the holes.
  setRain(on: boolean) {
    if (on === this.raining && (!on || this.rainView)) return;
    this.raining = on;
    this.look = lookFor(this.map, on);
    this.applyLook();
    this.setQuality(this.quality);
    const ground = this.materials.get("surface-mud-#ffffff");
    if (ground) {
      // Darker, and the sheen of water over the whole field.
      ground.diffuse = color(on ? "#c4b8a8" : "#ffffff");
      ground.gloss = on ? 0.52 : 0.35;
      ground.specular = color(on ? "#4a524b" : "#343b30");
      ground.update();
    }
    if (this.dryPonds) this.dryPonds.visible = !on;
    if (on && !this.rainView) this.rainView = new RainView(this.app, this.mapRoot, this.map, this.quality);
    if (this.rainView) this.rainView.root.enabled = on;
  }
  reset(g: Game) {
    this.setRain(g.rain);
    this.visualWork.clear();
    this.machineGunPreview = undefined;
    for (const mesh of this.emplacementMeshes.values()) mesh.root.destroy();
    this.emplacementMeshes.clear();
    this.tankView?.reset();
    this.batteryView?.reset();
    this.gunGhost?.root.destroy();
    this.gunGhost = undefined;
    for (const bomb of this.mortarBombs.values()) bomb.destroy();
    this.mortarBombs.clear();
    if (this.mortarRing) this.mortarRing.root.enabled = false;
    this.pendingCasualties.clear();
    this.dirtyWorldBatches?.clear();
    this.clearEnvironmentEffects();
    for (const c of this.casualties) {
      this.releaseCasualty(c);
    }
    this.casualties = [];
    this.ragdollPhysics?.destroy(); this.ragdollPhysics = undefined;
    // Soldiers from the shader warm-up whose kit this match deploys again.
    const standIns = this.standIns?.game !== g && this.standIns?.map === this.map.id ? this.standIns : undefined;
    this.standIns = undefined;
    const kept = new Map<number, { root: pc.Entity; rig: SoldierRig }>();
    if (standIns) {
      for (const p of g.players)
        if (standIns.kits[p.id] === standInKit(p) && this.people[p.id] && this.soldiers[p.id])
          kept.set(p.id, { root: this.people[p.id], rig: this.soldiers[p.id] });
      for (const instance of standIns.hidden) instance.visible = true;
    } else {
      for (const mesh of this.casualtyTemplates.values()) { mesh.decRefCount(); mesh.destroy(); }
      this.casualtyTemplates.clear();
    }
    const keptRoots = new Set([...kept.values()].map((v) => v.root));
    this.activeGame = g; this.deathHits.clear();
    for (const key of Object.keys(
      this.soldierStats,
    ) as (keyof typeof this.soldierStats)[])
      this.soldierStats[key] = 0;
    for (const e of [
      ...this.people.filter((root) => !keptRoots.has(root)),
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
    this.blastSequence = 0;
    this.cameraReaction = { pitch: 0, yaw: 0, roll: 0 };
    this.weaponFx?.clear();
    this.deathView=null;
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
    for(const scorch of this.flameScorches.values())scorch.entity.destroy();this.flameScorches.clear();
    for(const marker of this.flamePickups.values())marker.destroy();this.flamePickups.clear();
    this.people = [];
    this.actorKits.clear();
    this.rings = [];
    this.objectiveTerrainRevision = -1;
    this.effects = [];
    this.remember(g);
    this.soldiers = [];
    this.batchGroup = this.actorBatch;
    let built = 0;
    const standInCount = standIns ? standIns.kits.length : 0;
    for (const p of g.players) {
      const reuse = kept.get(p.id);
      if (reuse) this.reuseSoldier(p, reuse.root, reuse.rig);
      else { this.createSoldier(p); built++; }
      this.actorKits.set(p.id, `${p.faction}-${p.weapon}-${p.weaponId}`);
    }
    // Merge each distinct rendered kit once during deployment, not mid-blast.
    for (const p of g.players) this.casualtyMesh(p);
    this.batchGroup = -1;
    // Stand-ins left over or rebuilt change the batch; otherwise it is current.
    if (built || kept.size < standInCount || !standIns) this.app.batcher!.generate([this.actorBatch]);
    this.boundSoldiers();
    this.createFirstPersonRig(g.players[0]?.faction);
    for (const rig of this.soldiers) rig.reloadMagazine.setLocalScale(0, 0, 0);
    this.soldiers.forEach((rig, i) => {
      if (!rig.standIn) return;
      rig.standIn = false; rig.gait = undefined; rig.placed = undefined;
      this.people[i].setLocalScale(1, 1, 1);
    });
    this.distantSoldiers?.destroy();
    this.distantSoldiers = this.app.graphicsDevice
      ? new SoldierStandIns(this.app, this.app.root, this.modelMaterial("#ffffff", true), g.players.length)
      : undefined;
    this.ctfMarkers.reset(g);
    for (const s of g.scoring !== "eliminations" && g.scoring !== "ctf" ? g.sectors : []) {
      const ring = new pc.Entity(s.id);
      this.app.root.addChild(ring);
      ring.setPosition(s.x, (s.y ?? groundHeight(s.x, s.z, this.map)) + (this.map.fort?.waterHeight ?? 0) + .04, s.z);
      const segments = this.map.fort ? 40 : 64;
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const e = this.cube(
          "boundary",
          Math.sin(a) *
            (g.scoring === "domination" ? dominationRules.radius : 8),
          0,
          Math.cos(a) *
            (g.scoring === "domination" ? dominationRules.radius : 8),
          this.map.fort ? .10 : .16,
          this.map.fort ? .028 : .05,
          this.map.fort ? .46 : .65,
          "#d4c699",
          false,
          ring,
        );
        e.setLocalEulerAngles(0, (a * 180) / Math.PI, 0);
      }
      if (g.scoring === "domination") {
        const flagScale = this.map.fort ? .64 : 1;
        this.cube(
          "flagpole",
          0,
          1.9 * flagScale,
          0,
          0.07,
          3.8 * flagScale,
          0.07,
          "#a5a697",
          false,
          ring,
        );
        // A hanging cloth instead of a board: limp under the fort's vaults,
        // lifted a little by the wind outdoors.
        const cloth = flagCloth(1.3, 0.75 * flagScale, this.map.fort ? 56 : 34), clothMesh = new pc.Mesh(this.app.graphicsDevice);
        clothMesh.setPositions(cloth.positions);
        clothMesh.setNormals(cloth.normals);
        clothMesh.setIndices(cloth.indices);
        clothMesh.update(pc.PRIMITIVE_TRIANGLES);
        const flag = new pc.Entity("flag cloth");
        flag.addComponent("render", {
          meshInstances: [new pc.MeshInstance(clothMesh, this.material(flagColor("neutral", this.map)), flag)],
          castShadows: false,
        });
        ring.addChild(flag);
        flag.setLocalPosition(0.035, 3.475 * flagScale, 0);
      } else
        this.cube("beacon", 0, 1, 0, 0.25, 2, 0.25, "#d4c699", false, ring);
      this.rings.push(ring);
    }
  }
  // Compile the match's shaders while the briefing is open. Deploy a stand-in
  // match (same map and kits), pose it once, and draw everything once from the
  // player's view into a tiny offscreen target, so soldiers, their shadows,
  // the first-person rig and the flags compile before Begin. The briefing view
  // is restored and the stand-ins hidden; reset() replaces them at Begin.
  warmShaders(g: Game) {
    const main = this.camera.camera!;
    const position = this.camera.getPosition().clone(), rotation = this.camera.getRotation().clone();
    const projection = main.projection, orthoHeight = main.orthoHeight, nearClip = main.nearClip, fov = main.fov;
    this.reset(g);
    this.draw(g, 1, 0, false);
    const device = this.app.graphicsDevice;
    const color = new pc.Texture(device, { width: 4, height: 4, format: pc.PIXELFORMAT_RGBA8, mipmaps: false });
    const target = new pc.RenderTarget({ colorBuffer: color, depth: true });
    const warm = new pc.Entity("shader warm-up");
    warm.addComponent("camera", {
      clearColor: main.clearColor, fov: main.fov, nearClip: main.nearClip, farClip: main.farClip,
      layers: main.layers, toneMapping: main.toneMapping, gammaCorrection: main.gammaCorrection,
      frustumCulling: false, renderTarget: target, priority: main.priority - 1,
    });
    warm.setPosition(this.camera.getPosition());
    warm.setRotation(this.camera.getRotation());
    this.app.root.addChild(warm);
    this.camera.setPosition(position);
    this.camera.setRotation(rotation);
    Object.assign(main, { projection, orthoHeight, nearClip, fov });
    // Only the stand-ins: Begin may already have deployed the real match.
    const people = [...this.people], others = [...this.rings, ...(this.firstPersonRig ? [this.firstPersonRig.root] : [])];
    this.app.once("frameend", () => {
      warm.destroy();
      target.destroy();
      color.destroy();
      if (this.activeGame !== g) return;
      for (const entity of others) entity.enabled = false;
      // Soldiers are hidden rather than disabled: disabling would mark the
      // actor batch dirty, and Begin would pay to rebuild it.
      const hidden: pc.MeshInstance[] = [];
      for (const root of people)
        for (const render of root.findComponents("render") as pc.RenderComponent[]) hidden.push(...render.meshInstances);
      for (const batch of (this.app.batcher as unknown as { _batchList: { batchGroupId: number; meshInstance: pc.MeshInstance | null }[] })._batchList)
        if (batch.batchGroupId === this.actorBatch && batch.meshInstance) hidden.push(batch.meshInstance);
      for (const instance of hidden) instance.visible = false;
      this.standIns = { game: g, map: this.map.id, kits: g.players.map(standInKit), hidden };
    });
  }
  // The dye currently on each flag's cloth, for the render review.
  flagDyes() {
    return this.rings.map((ring) => {
      const cloth = (ring.findByName("flag cloth") as pc.Entity | null)?.render?.meshInstances[0]?.material;
      return [...this.materials].find(([, material]) => material === cloth)?.[0] ?? null;
    });
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
  machineGunPreview?: Placement;
  // Metres past which living soldiers become stand-ins; Infinity turns them off (?standIns=).
  standInDistance = standInRules.enter;
  private emplacementMeshes = new Map<number, EmplacementMesh>();
  private gunGhost?: EmplacementMesh;
  private tankView?: TankView;
  private batteryView?: BatteryView;
  private gunGhostValid?: boolean;
  private previewMaterials = new Map<boolean, pc.StandardMaterial>();

  // Each nation's mounted gun: the Vickers with its fluted water jacket and
  // steam condenser, the MG 08 on its sled with a smooth jacket and muzzle
  // booster, and the air-cooled Hotchkiss with brass fins and a feed strip.
  // A trench mortar: baseplate, tube on its elevation joint, and a bipod.
  private buildMortar(name: string): EmplacementMesh {
    const root = this.joint(name, this.app.root);
    const steel = "#363c38", plate = "#4c5248", dark = "#1b201f";
    // The Ottoman thrower is drawn as the Granatenwerfer it stands in for.
    const german = name === "Granatenwerfer 16" || name === "Light bomb thrower", french = name.startsWith("Mortier");
    const garland = name === "Garland trench mortar", wood = "#6b5136", tin = "#9a978b";
    // The baseplate the tube's foot sits in; Garland's is a wooden block.
    if (garland) {
      this.cube("wooden base", 0, 0.05, 0.02, 0.46, 0.1, 0.5, wood, false, root);
      for (const x of [-0.17, 0.17]) this.cube("base batten", x, 0.105, 0.02, 0.06, 0.02, 0.52, "#54402b", false, root);
    } else {
      this.cube("baseplate", 0, 0.03, 0.02, german ? 0.42 : 0.56, 0.05, german ? 0.36 : 0.46, plate, false, root);
      this.cube("baseplate rib", 0, 0.065, 0.02, 0.06, 0.025, german ? 0.34 : 0.44, steel, false, root);
    }
    const yaw = this.joint("traverse", root, 0, 0.07, 0);
    const barrel = this.joint("elevation", yaw);
    const slide = this.joint("recoiling tube", barrel);
    const length = german ? 0.62 : french ? 0.78 : garland ? 0.5 : 1.05, bore = german ? 0.07 : french ? 0.1 : garland ? 0.085 : 0.095;
    const cylinder = (label: string, y: number, diameter: number, height: number, color: string) => {
      const part = this.joint(label, slide, 0, y, 0);
      part.addComponent("render", { type: "cylinder", material: this.material(color), castShadows: true, receiveShadows: true });
      part.setLocalScale(diameter, height, diameter);
      return part;
    };
    if (german) {
      // A spigot: a thin rod on which the finned bomb sits, over a small cradle.
      cylinder("spigot", length / 2, 0.035, length, steel);
      cylinder("spigot collar", 0.08, 0.08, 0.1, plate);
      cylinder("bomb body on spigot", length + 0.04, 0.11, 0.22, "#5b5f48");
    } else {
      cylinder("tube", length / 2, bore, length, steel);
      cylinder("breech cap", 0.04, bore + 0.03, 0.08, plate);
      cylinder("muzzle band", length - 0.03, bore + 0.018, 0.05, plate);
      cylinder("bore", length + 0.002, bore * 0.72, 0.004, dark);
    }
    if (garland) {
      // No bipod: the short barrel sits in a wooden cradle bolted to the
      // base, the shaft of a jam-tin bomb standing out of its muzzle. Range
      // was set by propping the base up, aim by turning the whole mortar.
      for (const side of [-1, 1]) this.cube("cradle cheek", side * 0.075, 0.12, -0.02, 0.025, 0.2, 0.26, wood, false, yaw);
      this.cube("cradle bolt", 0, 0.12, -0.02, 0.2, 0.03, 0.03, steel, false, yaw);
      this.cube("range prop", 0, -0.02, -0.2, 0.3, 0.06, 0.08, "#54402b", false, yaw);
      cylinder("bomb shaft", length + 0.06, 0.022, 0.14, "#7b6446");
      for (let i = 0; i < 3; i++) {
        const spare = this.joint("spare jam-tin bomb", root, 0.36, 0.08, -0.12 + i * 0.13);
        this.cube("tin", 0, 0, 0, 0.09, 0.1, 0.09, tin, false, spare);
        this.cube("shaft", 0, 0, 0.12, 0.022, 0.022, 0.2, "#7b6446", false, spare);
      }
      return { root, yaw, barrel, slide, name };
    }
    // The bipod stands ahead of the baseplate and holds the tube at its collar.
    const collar = new pc.Vec3(0, 0.07 + length * 0.55 * Math.sin(1.13), -length * 0.55 * Math.cos(1.13));
    for (const side of [-1, 1]) {
      const foot = new pc.Vec3(side * (german ? 0.2 : 0.26), -0.06, collar.z - 0.2);
      const center = new pc.Vec3().add2(foot, collar).mulScalar(0.5);
      const leg = this.cube("bipod leg", center.x, center.y, center.z, 0.03, 0.03, foot.distance(collar), steel, false, yaw);
      leg.lookAt(yaw.getWorldTransform().transformPoint(collar));
      this.cube("bipod foot", foot.x, foot.y + 0.01, foot.z, 0.07, 0.02, 0.07, plate, false, yaw);
    }
    this.cube("traversing screw", 0, collar.y, collar.z, 0.24, 0.035, 0.035, plate, false, yaw);
    // Spare bombs stacked beside the plate.
    for (let i = 0; i < 3; i++) this.cube("spare bomb", 0.42, 0.06, -0.12 + i * 0.13, 0.09, 0.09, 0.26, "#5b5f48", false, root);
    return { root, yaw, barrel, slide, name };
  }

  private buildEmplacement(name: string): EmplacementMesh {
    if (isMortarWeapon(name) || name === "Mortar preview") return this.buildMortar(name);
    const root = this.joint(name, this.app.root);
    const steel = "#343d3a", plate = "#51584e", brass = "#a8843c", canvas = "#6d6448";
    // The Ottoman Maxim is the MG 08 on its sled; ANZAC's Maxim stands on the Vickers tripod.
    const mg08 = name === "MG 08" || name === "Maxim M1909", hotchkiss = name === "Hotchkiss M1914";
    const beam = (label: string, from: pc.Vec3, to: pc.Vec3, width: number, parent = root, tint = steel) => {
      const center = new pc.Vec3().add2(from, to).mulScalar(0.5);
      const leg = this.cube(label, center.x, center.y, center.z, width, width, from.distance(to), tint, false, parent);
      leg.lookAt(parent.getWorldTransform().transformPoint(to));
    };
    const top = new pc.Vec3(0, emplacementRules.pivotHeight - 0.08, 0);
    if (mg08) {
      // Schlitten 08: two runners on the ground, braced, with the front legs
      // raised to put the gun at firing-step height.
      for (const side of [-1, 1]) {
        this.cube("sled runner", side * 0.27, 0.035, 0.05, 0.06, 0.05, 1.25, plate, false, root);
        this.cube("runner tip", side * 0.27, 0.07, -0.6, 0.06, 0.05, 0.12, plate, false, root).setLocalEulerAngles(25, 0, 0);
        beam("sled front leg", new pc.Vec3(side * 0.27, 0.06, -0.42), new pc.Vec3(side * 0.07, top.y, -0.04), 0.055);
      }
      beam("sled rear upright", new pc.Vec3(0, 0.06, 0.52), new pc.Vec3(0, top.y - 0.05, 0.06), 0.06);
      for (const z of [-0.42, 0.1, 0.52]) this.cube("sled cross bar", 0, 0.06, z, 0.6, 0.035, 0.05, steel, false, root);
      this.cube("sled cradle", 0, top.y - 0.02, 0, 0.18, 0.06, 0.22, plate, false, root);
    } else {
      for (const [x, z] of hotchkiss ? [[-0.48, -0.34], [0.48, -0.34], [0, 0.5]] : [[-0.43, -0.39], [0.43, -0.39], [0, 0.47]]) {
        beam("tripod leg", new pc.Vec3(x, 0.08, z), top, 0.068);
        this.cube("tripod foot", x, 0.038, z, 0.16, 0.075, 0.18, plate, false, root);
      }
      this.cube("tripod head", 0, top.y, 0, 0.16, 0.07, 0.16, plate, false, root);
    }

    const yaw = this.joint("traverse", root, 0, emplacementRules.pivotHeight, 0);
    const barrel = this.joint("elevation", yaw);
    // Everything that recoils on the mount.
    const slide = this.joint("recoiling gun", barrel);
    const tube = (label: string, z: number, diameter: number, length: number, color: string, x = 0, y = 0) => {
      const part = this.joint(label, slide, x, y, z);
      part.addComponent("render", { type: "cylinder", material: this.material(color), castShadows: true, receiveShadows: true });
      part.setLocalEulerAngles(90, 0, 0);
      part.setLocalScale(diameter, length, diameter);
      return part;
    };
    let glow: pc.Entity;
    if (hotchkiss) {
      this.riflePart("receiver", 0, -0.01, 0.1, 0.11, 0.13, 0.46, "steel", slide, "buttplate");
      this.riflePart("receiver top", 0, 0.06, 0.06, 0.1, 0.03, 0.3, "edge", slide, "buttplate");
      tube("air-cooled barrel", -0.47, 0.05, 0.8, "#2b302e");
      tube("gas cylinder", -0.3, 0.028, 0.46, steel, 0, -0.05);
      // Five broad brass cooling fins just ahead of the breech.
      for (let i = 0; i < 5; i++) tube("brass cooling fin", -0.11 - i * 0.045, 0.13, 0.012, brass);
      tube("muzzle", -0.86, 0.06, 0.04, plate);
      tube("muzzle opening", -0.882, 0.034, 0.012, "#181e1d");
      // A 30-round strip entering from the left, its rounds showing.
      this.cube("feed strip", -0.2, 0.025, 0.03, 0.3, 0.008, 0.05, "#6e705f", false, slide);
      for (let i = 0; i < 8; i++) this.cube("strip cartridge", -0.08 - i * 0.034, 0.04, 0.03, 0.012, 0.018, 0.075, brass, false, slide);
      this.riflePart("pistol grip", 0, -0.11, 0.25, 0.05, 0.13, 0.06, "walnut", slide, "knob");
      this.riflePart("butt", 0, -0.02, 0.4, 0.07, 0.1, 0.14, "walnut", slide, "buttplate");
      this.cube("sight post", 0, 0.06, -0.8, 0.012, 0.045, 0.02, steel, false, slide);
      glow = this.heatGlow(slide, -0.55, 0.062, 0.62);
    } else {
      this.riflePart("receiver", 0, -0.014, 0.07, mg08 ? 0.17 : 0.15, mg08 ? 0.17 : 0.15, mg08 ? 0.44 : 0.4, "steel", slide, "buttplate");
      this.riflePart("receiver cover", 0, mg08 ? 0.066 : 0.058, 0.046, mg08 ? 0.18 : 0.16, 0.034, 0.34, "steel", slide, "buttplate");
      this.riflePart("hinge", 0, 0.071, -0.093, 0.148, 0.043, 0.038, "edge", slide, "buttplate");
      tube("water jacket", -0.41, mg08 ? 0.16 : 0.145, 0.65, steel);
      tube("jacket rear cap", -0.09, mg08 ? 0.172 : 0.158, 0.03, plate);
      tube("jacket front cap", -0.735, mg08 ? 0.15 : 0.135, 0.03, plate);
      if (mg08) {
        this.cube("water filler cap", 0.02, 0.09, -0.2, 0.04, 0.03, 0.04, "#858d85", false, slide);
        tube("muzzle booster", -0.8, 0.095, 0.11, plate);
        tube("booster cone", -0.87, 0.07, 0.04, steel);
        this.cube("steam vent", 0, -0.085, -0.66, 0.03, 0.03, 0.05, plate, false, slide);
      } else {
        // The corrugated jacket: raised flutes all round it.
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          this.cube("jacket flute", Math.cos(a) * 0.073, Math.sin(a) * 0.073, -0.41, 0.014, 0.014, 0.6, "#3c4542", false, slide).setLocalEulerAngles(0, 0, (a * 180) / Math.PI);
        }
        tube("muzzle cup", -0.784, 0.084, 0.13, plate);
        tube("steam tube port", -0.7, 0.03, 0.05, plate, -0.06, -0.06);
      }
      tube("muzzle opening", -0.866, 0.047, 0.022, "#181e1d");
      for (const side of [-1, 1]) {
        this.riflePart("spade grip", side * 0.096, -0.046, 0.29, 0.038, 0.14, 0.043, "walnut", slide, "knob");
        this.riflePart("rear notch", side * 0.021, 0.103, 0.17, 0.02, 0.034, 0.02, "steel", slide, "buttplate");
        this.riflePart("fastener", side * 0.075, 0.005, 0.09, 0.012, 0.031, 0.031, "edge", slide, "pin").setLocalEulerAngles(0, 0, 90);
      }
      this.cube("sight post", 0, 0.085, -0.73, 0.015, 0.050, 0.027, steel, false, slide);
      // The cloth belt feeds in from the right and hangs to the box.
      this.cube("ammunition belt", 0.14, -0.02, 0.02, 0.12, 0.012, 0.06, canvas, false, slide).setLocalEulerAngles(0, 0, -35);
      for (let i = 0; i < 4; i++) this.cube("belt cartridge", 0.1 + i * 0.027, -0.004 - i * 0.019, 0.02, 0.014, 0.014, 0.07, brass, false, slide);
      glow = this.heatGlow(slide, -0.81, mg08 ? 0.1 : 0.09, mg08 ? 0.15 : 0.17);
    }
    this.cube("ammunition box", 0.27, 0.145, 0.16, 0.3, 0.28, 0.42, "#505743", false, root);
    this.cube("ammunition box lid", 0.27, 0.29, 0.16, 0.32, 0.035, 0.43, "#62694f", false, root);
    this.cube("box handle", 0.27, 0.32, 0.16, 0.125, 0.035, 0.04, steel, false, root);
    if (!mg08 && !hotchkiss) {
      // The condenser can the steam hose runs down to.
      const can = this.joint("condenser can", root, -0.36, 0.17, -0.25);
      can.addComponent("render", { type: "cylinder", material: this.material("#59614c"), castShadows: true, receiveShadows: true });
      can.setLocalScale(0.18, 0.32, 0.18);
      beam("condenser hose", new pc.Vec3(-0.34, 0.33, -0.27), new pc.Vec3(-0.08, 0.86, -0.55), 0.03, root, "#2a2a24");
    }
    return { root, yaw, barrel, slide, glow, name };
  }

  private drawEmplacements(g: Game, alpha = 1) {
    for (const [id, mesh] of this.emplacementMeshes) {
      const gun = g.emplacements.get(id);
      if (!gun || gun.weaponId !== mesh.name) {
        mesh.root.destroy();
        this.emplacementMeshes.delete(id);
        this.weaponFx?.forget(`gun-${id}`);
      }
    }
    const tick = g.tick - 1 + alpha;
    for (const gun of g.emplacements.values()) {
      let mesh = this.emplacementMeshes.get(gun.owner);
      if (!mesh) {
        mesh = this.buildEmplacement(gun.weaponId);
        this.emplacementMeshes.set(gun.owner, mesh);
      }
      // The gun slams back on each round and the whole mount shudders.
      const age = (tick - gun.lastShotAt) / 30, kick = age >= 0 ? Math.exp(-22 * age) : 0;
      const shake = kick * recoilBuzz(gun.lastShotAt, gun.owner);
      mesh.root.setPosition(gun.at.x, gun.at.y, gun.at.z);
      mesh.root.setEulerAngles(shake * 0.35, -gun.baseYaw * pc.math.RAD_TO_DEG, shake * 0.3);
      const setup = Math.max(0, (gun.readyAt - g.tick) / emplacementRules.setupTicks);
      mesh.root.setLocalScale(1, 1 - 0.25 * setup, 1);
      mesh.yaw.setLocalEulerAngles(0, (gun.baseYaw - gun.yaw) * pc.math.RAD_TO_DEG, 0);
      if (gun.mortar) {
        // Tilted forward from upright to the range table's elevation; each bomb jolts the tube down.
        mesh.barrel.setLocalEulerAngles(-(90 - tubeElevation(gun.mortar.range) * pc.math.RAD_TO_DEG), 0, 0);
        mesh.slide.setLocalPosition(0, -kick * 0.05, 0);
        continue;
      }
      mesh.barrel.setLocalEulerAngles(gun.pitch * pc.math.RAD_TO_DEG, 0, 0);
      mesh.slide.setLocalPosition(0, kick * 0.004, kick * recoilFeel.emplaced.push);
      mesh.slide.setLocalEulerAngles(shake * 0.9, 0, 0);
      this.showHeat(mesh.glow, gun.barrel.heat, tick);
      if (gun.barrel.heat > 0.18) {
        const view = emplacementView(gun);
        this.fx().heat({
          key: `gun-${gun.owner}`, at: view.muzzle, dir: viewDirection(gun.yaw, gun.pitch), length: 0.75,
          heat: gun.barrel.heat, overheated: gun.barrel.overheated, water: this.waterCooled(gun.weaponId, true), near: gun.operator === 0,
        }, this.frameDt);
      }
    }

    this.drawMortarBombs(g, alpha);
    this.drawMortarRing(g);
    const preview = this.machineGunPreview;
    if (!preview) {
      if (this.gunGhost) this.gunGhost.root.enabled = false;
      return;
    }
    const ghostName = preview.mortar ? "Mortar preview" : "Placement preview";
    if (this.gunGhost && this.gunGhost.name !== ghostName) {
      this.gunGhost.root.destroy();
      this.gunGhost = undefined;
    }
    if (!this.gunGhost) {
      this.gunGhost = this.buildEmplacement(ghostName);
      const root = this.gunGhost.root;
      this.cube("operator position", 0, 0.045, emplacementRules.operatorOffset, 0.62, 0.032, 0.6, "#ffffff", false, root);
      for (const edge of [-1, 1]) {
        const guide = this.joint("traverse limit", root);
        guide.setLocalEulerAngles(0, edge * emplacementRules.traverse * pc.math.RAD_TO_DEG, 0);
        this.cube("traverse guide", 0, 0.045, -1.28, 0.042, 0.025, 1.2, "#ffffff", false, guide);
      }
      this.gunGhostValid = undefined;
    }
    const ghost = this.gunGhost.root;
    ghost.enabled = true;
    ghost.setPosition(preview.at.x, preview.at.y, preview.at.z);
    ghost.setEulerAngles(0, -preview.baseYaw * pc.math.RAD_TO_DEG, 0);
    if (this.gunGhostValid === preview.valid) return;
    this.gunGhostValid = preview.valid;
    let material = this.previewMaterials.get(preview.valid);
    if (!material) {
      material = new pc.StandardMaterial();
      material.emissive = color(preview.valid ? "#579c8e" : "#bc6152");
      material.opacity = 0.52;
      material.blendType = pc.BLEND_NORMAL;
      material.depthWrite = false;
      material.useLighting = false;
      material.update();
      this.previewMaterials.set(preview.valid, material);
    }
    for (const render of ghost.findComponents("render") as pc.RenderComponent[]) {
      render.material = material;
      render.castShadows = false;
    }
  }

  // Bombs in flight, drawn from their velocity between ticks.
  private mortarBombs = new Map<number, pc.Entity>();
  private drawMortarBombs(g: Game, alpha: number) {
    const bombs = g.mortars?.bombs ?? [];
    const active = new Set(bombs.map(b => b.id));
    for (const [id, entity] of this.mortarBombs) if (!active.has(id)) { entity.destroy(); this.mortarBombs.delete(id); }
    for (const bomb of bombs) {
      let entity = this.mortarBombs.get(bomb.id);
      if (!entity) {
        entity = this.joint("mortar bomb", this.app.root);
        const body = this.joint("mortar bomb body", entity);
        body.addComponent("render", { type: "cylinder", material: this.material("#5b5f48") });
        body.setLocalScale(0.09, 0.26, 0.09);
        this.cube("mortar bomb fins", 0, -0.16, 0, 0.13, 0.08, 0.02, "#3c4033", false, entity);
        this.cube("mortar bomb fins", 0, -0.16, 0, 0.02, 0.08, 0.13, "#3c4033", false, entity);
        this.mortarBombs.set(bomb.id, entity);
      }
      const back = (1 - alpha) / 30;
      entity.setPosition(bomb.x - bomb.vx * back, bomb.y - bomb.vy * back, bomb.z - bomb.vz * back);
      // Nose along the flight path.
      const speed = Math.hypot(bomb.vx, bomb.vy, bomb.vz) || 1;
      entity.lookAt(bomb.x + bomb.vx / speed, bomb.y + bomb.vy / speed, bomb.z + bomb.vz / speed);
      entity.rotateLocal(-90, 0, 0);
    }
  }

  // The landing ring for the player's laid tube: its size is the spread the next
  // bomb will land in, so it blooms when the tube moves and tightens as it settles.
  private mortarRing?: { root: pc.Entity; marks: pc.Entity[]; cross: pc.Entity[]; refused?: boolean };
  private ringMaterials = new Map<boolean, pc.StandardMaterial>();
  private ringMaterial(refused: boolean) {
    let material = this.ringMaterials.get(refused);
    if (!material) {
      material = new pc.StandardMaterial();
      material.emissive = color(refused ? "#ff4a3a" : "#6ff2ff");
      material.diffuse = color("#000000");
      material.useLighting = false;
      material.opacity = 0.9;
      material.blendType = pc.BLEND_NORMAL;
      material.depthTest = false;
      material.depthWrite = false;
      material.update();
      this.ringMaterials.set(refused, material);
    }
    return material;
  }
  private drawMortarRing(g: Game) {
    const p = g.players[0], gun = mountedGun(g, p);
    if (!gun?.mortar || p.hp <= 0) {
      if (this.mortarRing) this.mortarRing.root.enabled = false;
      return;
    }
    if (!this.mortarRing) {
      const root = this.joint("mortar aim ring", this.app.root);
      const marks = Array.from({ length: 28 }, () => this.cube("mortar ring mark", 0, 0, 0, 0.16, 0.05, 1, "#f2d48a", false, root));
      // A ground cross and a thin post over the aim point, readable from a trench at 80 m.
      const cross = [0, 1, 2].map(i => this.cube("mortar aim cross", 0, 0, 0, i === 1 ? 0.12 : i ? 0.07 : 1.2, i === 2 ? 2.4 : 0.05, i === 1 ? 1.2 : i ? 0.07 : 0.12, "#f2d48a", false, root));
      for (const part of [...marks, ...cross]) part.render!.castShadows = false;
      this.mortarRing = { root, marks, cross };
    }
    const ring = this.mortarRing;
    ring.root.enabled = true;
    const aim = mortarAim(g, gun), radius = mortarSpread(gun), refused = mortarTargetBlocked(g, aim);
    if (ring.refused !== refused) {
      ring.refused = refused;
      const material = this.ringMaterial(refused);
      for (const part of [...ring.marks, ...ring.cross]) part.render!.material = material;
    }
    // Each mark rides the ground (or parapet) where it falls, so the ring
    // drapes over trench lips. It shows through cover: a mortarman lays the
    // tube from the bottom of a trench.
    const top = (x: number, z: number) => {
      const floor = groundHeight(x, z, g.map);
      return floor + 40 * (1 - this.ray({ x, y: floor + 40, z }, { x, y: floor - 0.02, z })) + 0.07;
    };
    // Stakes grow with range so they read the same size at 40 m and 80 m.
    const n = ring.marks.length, chord = 2 * Math.PI * radius / n, k = gun.mortar.range / 25;
    ring.marks.forEach((mark, i) => {
      const a = (i / n) * Math.PI * 2, x = aim.x + Math.cos(a) * radius, z = aim.z + Math.sin(a) * radius;
      // Short stakes rather than a flat line: seen nearly edge-on from the
      // tube, their spread across the view shows the ring's width.
      mark.setPosition(x, top(x, z) + 0.25 * k, z);
      mark.setEulerAngles(0, -a * pc.math.RAD_TO_DEG, 0);
      mark.setLocalScale(0.07 * k, 0.5 * k, chord * 0.45);
    });
    const centre = top(aim.x, aim.z);
    ring.cross.forEach((part, i) => {
      part.setPosition(aim.x, centre + (i === 2 ? 1.2 * k : 0), aim.z);
      if (i === 2) part.setLocalScale(0.05 * k, 2.4 * k, 0.05 * k);
      part.setEulerAngles(0, -gun.yaw * pc.math.RAD_TO_DEG, 0);
    });
  }

  private flameScorches = new Map<string,{entity:pc.Entity;life:number}>();
  private flamePickups = new Map<number,pc.Entity>();
  private actorKits = new Map<number,string>();
  draw(g: Game, alpha: number, dt: number, overview = false) {
    // Spread terrain rebuilds and presentation work over frames instead of
    // doing every shell's work in the frame it lands.
    // One heavy job a frame. The frame a shell lands already carries the
    // crater's simulation, so it does neither; after that, terrain rebuilds and
    // visual work (mesh uploads, casualty setup) take turns.
    const impact = this.worldChanged;
    this.worldChanged = false;
    const terrainStart = battlePerformance.begin();
    const rebuilt = impact || (this.visualTurn && this.visualWork.size) ? 0 : this.flushTerrainWork();
    battlePerformance.end("terrainWork", terrainStart);
    const visualStart = battlePerformance.begin();
    battlePerformance.count("visualJobs", impact || rebuilt ? 0 : this.visualWork.flush());
    battlePerformance.end("visualWork", visualStart);
    this.visualTurn = rebuilt > 0;
    this.flushWorldBatches();
    this.frameDt = dt;
    this.drawEmplacements(g, alpha);
    const batteryStart = battlePerformance.begin();
    (this.batteryView ??= new BatteryView(this.app, (root) => this.shellModel(root), () => this.fx())).draw(g, alpha, dt);
    battlePerformance.end("batteries", batteryStart);
    if (g.tanks?.list.length || this.tankView)
      (this.tankView ??= new TankView(this.app, (...a) => this.cube(...a), (c) => this.material(c))).draw(g, alpha);
    for (const kit of g.flames?.kits ?? []) {
      let marker=this.flamePickups.get(kit.id);
      if(!marker) {
        marker=this.joint("flame supply kit",this.app.root);
        this.cube("supply crate",0,.25,0,.7,.5,.6,"#535d42",false,marker);
        this.cube("fuel label",0,.52,0,.4,.02,.3,"#c4a86a",false,marker);
        this.flamePickups.set(kit.id,marker);
      }
      marker.enabled=!!kit.at;
      if(kit.at)marker.setPosition(kit.at.x,groundHeight(kit.at.x,kit.at.z,g.map),kit.at.z);
    }
    this.drawCount++;
    this.scheduleShadowCascades();
    const eye = this.camera.getPosition(), look = this.camera.forward, zoomed = this.camera.camera!.fov < 45;
    this.distantSoldiers?.begin();
    for (const p of g.players) {
      const visible=visualWeapon(p,g.tick-1+alpha);
      const kit = `${p.faction}-${visible.weapon}-${visible.weaponId}`;
      const previousKit = this.actorKits.get(p.id);
      if (previousKit !== undefined && previousKit !== kit && p.hp > 0) {
        const old = this.people[p.id];
        this.batchGroup = this.actorBatch;
        this.createSoldier(visible);
        this.people[p.id] = this.people.pop()!;
        this.soldiers[p.id] = this.soldiers.pop()!;
        old.destroy(); this.batchGroup = -1;
        this.app.batcher!.generate([this.actorBatch]);
        this.boundSoldiers();
        if (p.id === 0) this.createFirstPersonRig(p.faction);
      }
      // Dead actors keep the kit actually rendered at death while setup waits.
      if (p.hp > 0) this.actorKits.set(p.id, kit);
      // A tank's crew are out of sight inside it.
      if (p.tank !== undefined && p.hp > 0) {
        this.people[p.id].setLocalScale(pc.Vec3.ZERO);
        continue;
      }
      const e = this.people[p.id],
        previous = this.previous[p.id] ?? p,
        teleported = Math.hypot(previous.x - p.x, previous.z - p.z) > 2;
      const x = teleported ? p.x : previous.x + (p.x - previous.x) * alpha,
        y = teleported ? p.y : previous.y + (p.y - previous.y) * alpha,
        z = teleported ? p.z : previous.z + (p.z - previous.z) * alpha,
        yaw = (-p.yaw * 180) / Math.PI;
      const rig = this.soldiers[p.id],
        tick = g.tick - 1 + alpha;
      rig.bounds?.center.set(x, y + 1, z);
      // Far enough away, a living soldier is drawn as a stand-in and its
      // jointed model is hidden and left alone (src/soldier-standins.ts).
      const standKey = `${p.team}|${kit}`;
      if (this.distantSoldiers && p.id !== 0 && p.hp > 0 && rig.alive && p.mountedGun === undefined
        && standInDue(Math.hypot(x - eye.x, y + 1 - eye.y, z - eye.z), !!rig.standIn, zoomed, this.standInDistance)) {
        if (!this.distantSoldiers.has(standKey)) this.bakeStandIn(p, standKey);
        if (!rig.standIn) {
          rig.standIn = true;
          rig.gait = { phase: rig.phase, x, z, crouch: rig.crouch, amplitude: Math.min(1, rig.motion) };
          // The hidden model is also put far below the field: collapsed in
          // place, its thousands of triangles would all land on one spot of
          // the screen, while out of view the GPU drops them before drawing.
          e.setLocalScale(0, 0, 0);
          e.setPosition(x, -10000, z);
        }
        const swing = advanceGait(rig.gait!, x, z, p.crouched, dt);
        this.distantSoldiers.add(standKey, x, y, z, yaw, swing, rig.gait!.crouch, crouchRules.drop);
        continue;
      }
      let woke = false;
      if (rig.standIn) {
        rig.standIn = false; rig.gait = undefined; rig.placed = undefined; rig.owedSeconds = 0;
        if (p.hp > 0) e.setLocalScale(1, 1, 1);
        woke = true;
      }
      // Posing a soldier re-derives every one of its parts' transforms, which is
      // the largest per-frame cost of a big battle. Soldiers the camera cannot
      // see are posed one frame in four, and distant ones every other frame;
      // the time skipped is owed to the next pose, so nothing runs slow.
      const { every, inView } = soldierCadence(p.id === 0 || p.hp <= 0 || !rig.alive, x - eye.x, y + 1 - eye.y, z - eye.z, look, zoomed);
      rig.owedSeconds = (rig.owedSeconds ?? 0) + dt;
      const pose = woke || every === 1 || (this.drawCount + p.id) % every === 0;
      // A soldier in view moves every frame, so a runner never judders. One
      // standing still keeps its transforms: moving the root would mark every
      // part for recalculation.
      if (pose || inView) {
        const placed = rig.placed ??= { x: NaN, y: NaN, z: NaN, yaw: NaN };
        if (placed.x !== x || placed.y !== y || placed.z !== z) { e.setPosition(x, y, z); placed.x = x; placed.y = y; placed.z = z; }
        if (placed.yaw !== yaw) { e.setEulerAngles(0, yaw, 0); placed.yaw = yaw; }
      }
      if (!pose) continue;
      const owed = rig.owedSeconds;
      rig.owedSeconds = 0;
      if (p.hp > 0) {
        if (e.getLocalScale().x !== 1) e.setLocalScale(1, 1, 1);
        rig.deathAt = null;
        rig.remnantCreated = false;
        rig.fallReady = undefined; rig.downAtRange = false; rig.settled = false;
        this.visualWork.delete(`casualty:${p.id}`);
        this.pendingCasualties.delete(p.id);
        this.animateSoldier(visible, x, z, owed, tick);
        rig.rifle.enabled = p.mountedGun === undefined;
        this.applyModelDetail(p,rig);
        this.poseGasMask(rig, maskProgress(p, tick));
      } else {
        if (rig.deathAt === null) {
          rig.deathAt = tick;
          this.soldierStats.collapses++;
        }
        rig.alive = false;
        if (!rig.remnantCreated) {
          e.setLocalScale(pc.Vec3.ONE);
          this.queueCasualty(p);
        }
        const pending = this.pendingCasualties.has(p.id);
        // A distant body lies where it fell for as long as a ragdoll would last.
        const down = !!rig.downAtRange && tick - rig.deathAt < casualtyRules.lifetime * 30;
        e.setLocalScale(pending || down ? pc.Vec3.ONE : pc.Vec3.ZERO);
        if (pending || down) this.poseDeathFall(p, rig, tick - rig.deathAt, down);
      }
    }
    this.distantSoldiers?.end();
    this.drawCasualties(dt);
    const objectiveRevision = g.map.destruction?.terrainRevision ?? 0;
    const positionObjectives =
      this.objectiveTerrainRevision !== objectiveRevision;
    for (let i = 0; i < this.rings.length; i++) {
      const s = g.sectors[i],
        state: FlagState = s.contested ? "contested" : (s.owner ?? "neutral"),
        // Domination flags are dyed cloth over a worn painted ring; other modes keep a bright beacon.
        flags = g.scoring === "domination",
        c = flags ? flagColor(state, this.map) : beaconColors[state],
        // Attack and defend: a ring that cannot change hands now fades to grey.
        ringColor = flagStatus(g, i) !== "open" ? lockedRingColor : flags ? flagRingColor(state, this.map) : c;
      const root = this.rings[i];
      if (g.scoring === "domination" && positionObjectives) {
        const water = this.map.fort && inFortRect(s, this.map.fort.water) ? this.map.fort.waterHeight : 0;
        root.setPosition(s.x, (s.y ?? groundHeight(s.x, s.z, this.map)) + water + .04, s.z);
      }
      for (const child of root.children) {
        const e = child as pc.Entity;
        // A render component built from its own mesh instances ignores `material`,
        // so the cloth's instance is dyed directly.
        if (e.name === "flag cloth") e.render!.meshInstances[0].material = this.material(c);
        else if (e.name !== "flagpole") e.render!.material = this.material(e.name === "boundary" ? ringColor : c);
        if (
          g.scoring === "domination" &&
          positionObjectives &&
          e.name === "boundary"
        ) {
          const local = e.getLocalPosition();
          const point = {
            x: s.x + local.x,
            z: s.z + local.z,
            // A deck flag's ring lies on the deck around it, and gaps over open drops.
            y: s.y !== undefined
              ? supportHeight(s.x + local.x, s.z + local.z, g.map, s.y + 0.23, 0.45)
              : groundHeight(s.x + local.x, s.z + local.z, g.map),
          };
          const surface = this.map.fort ? Math.max(supportHeight(point.x, point.z, this.map, .23),
            inFortRect(point, this.map.fort.water) ? this.map.fort.waterHeight : 0) : point.y;
          e.setLocalPosition(
            local.x,
            surface - root.getPosition().y + 0.04,
            local.z,
          );
          e.render!.enabled = flagContains(g, point, s);
        }
      }
    }
    this.objectiveTerrainRevision = objectiveRevision;
    this.ctfMarkers.draw(g, overview);
    const p = g.players[0],
      watched = p.hp<=0&&!overview&&this.spectating!==null&&g.players[this.spectating]?.hp>0?g.players[this.spectating]:undefined,
      gun = mountedGun(g, p),
      crewed = p.hp > 0 && !overview ? crewTank(g, p) : undefined,
      firstPerson = (firstPersonView(p) || !!gun) && !overview && !watched && !crewed,
      deathView = p.hp<=0&&!overview&&!watched?this.deathView:null,
      baseView = deathView ?? gun ?? weaponAim(watched ?? p),
      view = {
        yaw: baseView.yaw + (overview || firstPerson || deathView ? 0 : this.cameraReaction.yaw),
        pitch: baseView.pitch + (overview || firstPerson || deathView ? 0 : this.cameraReaction.pitch),
      },
      d = p.hp<=0?3.5:p.command.aim ? 2.5 : 4,
      dir = {
        x: Math.sin(view.yaw) * Math.cos(view.pitch),
        y: Math.sin(view.pitch),
        z: -Math.cos(view.yaw) * Math.cos(view.pitch),
      };
    const visual = this.people[watched?.id ?? 0].getPosition();
    const cameraDrop = crouchRules.drop * (firstPerson ? Number(p.crouched) : this.soldiers[watched?.id ?? 0].crouch);
    // A tank commander looks on from behind and above the hull.
    const tankEye = crewed ? tankCamera({
      x: crewed.previous.x + (crewed.x - crewed.previous.x) * alpha,
      y: crewed.previous.y + (crewed.y - crewed.previous.y) * alpha,
      z: crewed.previous.z + (crewed.z - crewed.previous.z) * alpha,
    }, view.yaw, view.pitch) : undefined;
    // A raised periscope rifle lifts the eye to its top mirror.
    const raised = firstPerson && !gun ? periscopeLift(p) : 0;
    const pivot = tankEye?.pivot ?? (gun ? emplacementView(gun).eye : { x: visual.x, y: visual.y + 1.65 - cameraDrop + raised, z: visual.z }),
      desired = tankEye?.desired ?? {
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
    if (!overview && !firstPerson && !deathView) this.camera.rotateLocal(0, 0, this.cameraReaction.roll);
    // A shot jolts the eye back and rolls the view about its own axis; the
    // centre of the sight stays on the line the round takes.
    if (firstPerson && p.hp > 0) {
      const feel = gun ? recoilFeel.emplaced : feelFor(p) ?? recoilFeel.rifle;
      const last = gun ? gun.lastShotAt : p.lastShotAt, age = (g.tick - 1 + alpha - last) / 30;
      const kick = age >= 0 ? Math.exp(-20 * age) : 0;
      if (kick > 0.002) {
        const buzz = feel.buzz ? recoilBuzz(gun ? gun.lastShotAt : p.recoilShots, p.id) : 1;
        this.camera.translateLocal(0, kick * feel.jolt * 0.15 * buzz, kick * feel.jolt);
        this.camera.rotateLocal(0, 0, kick * feel.roll * buzz);
      }
    }
    this.camera.camera!.projection = pc.PROJECTION_PERSPECTIVE;
    this.camera.camera!.fov += ((crewed?65:p.hp<=0?70-15*(deathView?.zoom??0):70+((!gun && scoped(p)?scopeFov:!gun && periscopeRaised(p)?periscopeRules.fov:50)-70)*(gun ? Number(p.command.aim) : aimBlend(p,g.tick-1+alpha))) - this.camera.camera!.fov) * (1 - Math.exp(-16 * dt));
    this.camera.camera!.nearClip = firstPerson ? 0.04 : 0.08;
    if (this.fortRoof) this.fortRoof.enabled = !overview;
    // A morning fog that thins over the opening minutes (MapLook.fogLift).
    const lift = this.look.fogLift;
    if (lift) {
      const t = Math.min(1, Math.max(0, (g.tick + alpha) / 30 / lift.seconds)), k = t * t * (3 - 2 * t);
      this.app.scene.fog.start = lift.start + (this.look.fog.start - lift.start) * k;
      this.app.scene.fog.end = lift.end + (this.look.fog.end - lift.end) * k;
    }
    if (overview) {
      // Opt-in observer view for reviewing whole-map layouts and bot routes.
      this.camera.camera!.projection = pc.PROJECTION_ORTHOGRAPHIC;
      this.camera.camera!.orthoHeight = this.map.depth / 2 + 5;
      this.camera.setPosition(0, 100, 0);
      this.camera.setEulerAngles(-90, 0, 0);
      this.app.scene.fog.type = "none";
    }
    this.drawFirstPerson(visualWeapon(p,g.tick-1+alpha), g.tick - 1 + alpha, dt);
    if (this.firstPersonRig && ((scoped(p) && sighted(p,g.tick)) || periscopeRaised(p))) this.firstPersonRig.root.enabled = false;
    if (this.firstPersonRig && (overview || gun || crewed)) this.firstPersonRig.root.enabled = false;
    if (firstPerson) this.people[0].setLocalScale(pc.Vec3.ZERO);
    this.drawProjectiles(g, alpha);
    this.drawGrenades(g, alpha);
    this.drawArtillery(g, alpha);
    this.drawSmoke(g, alpha);
    this.drawBlasts(dt);
    this.drawEnvironmentEffects(dt);
    this.drawBackdrop(g, alpha);
    this.drawAtmosphere(g, alpha);
    if (this.raining && this.rainView && !overview) {
      const rainStart = battlePerformance.begin(), seconds = (g.tick + alpha) / 30;
      this.rainView.draw(this.camera.getPosition(), this.camera.right, this.camera.up, seconds, floodAt(g.tick + alpha - g.rainSince), rainIntensity(seconds), dt);
      battlePerformance.end("rain", rainStart);
    }
    if (g.gas.clouds.length || this.gasView) (this.gasView ??= this.createGasView()).draw(g, alpha, this.camera.getPosition(), this.quality);
    if (this.map.night) this.drawNight(g, alpha);
    this.drawWeaponHeat(g, dt);
    for(const [key,scorch] of this.flameScorches){scorch.life-=dt;if(scorch.life<=0){scorch.entity.destroy();this.flameScorches.delete(key);}}
    for (const fx of this.effects) {
      fx.life -= dt;
      const size = fx.life * 0.7;
      fx.e.setLocalScale(size, size, size);
    }
    this.effects = this.effects.filter((fx) => {
      if (fx.life > 0) return true;
      fx.e.destroy();
      return false;
    });
    const effectStart = battlePerformance.begin();
    this.weaponFx?.draw(dt, this.camera.getPosition(), this.camera.right, this.camera.up);
    battlePerformance.end("weaponEffects", effectStart);
  }
  // Hot light machine guns in other soldiers' hands shimmer and smoke too.
  private drawWeaponHeat(g: Game, dt: number) {
    if (!this.weaponFx) return;
    const eye = this.camera.getPosition();
    for (const q of g.players) {
      if (q.hp <= 0 || q.mountedGun !== undefined || q.weapon === "pistol" || q.barrel.heat < 0.3 || (q.id === 0 && firstPersonView(q))) continue;
      const rig = this.soldiers[q.id];
      if (!rig || rig.standIn || Math.hypot(q.x - eye.x, q.z - eye.z) > 60) continue;
      const m = rig.rifle.getWorldTransform().transformPoint(new pc.Vec3(0, 0.025, barrelEnd(q.weapon, q.weaponId))), f = rig.rifle.forward;
      this.weaponFx.heat({ key: `soldier-${q.id}`, at: { x: m.x, y: m.y, z: m.z }, dir: { x: f.x, y: f.y, z: f.z }, length: 0.45, heat: q.barrel.heat, overheated: q.barrel.overheated, water: this.waterCooled(q.weaponId, false), near: false }, dt);
    }
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
        // Smoke is the usual canister; a bomb takes its side's look.
        const look = grenade.kind === "smoke" ? { shape: "egg", body: "#b8b49e", fuse: "#ebc77a" } : grenadeLook(g.map, grenade.team);
        const shell = new pc.Entity("grenade shell");
        shell.addComponent("render", { type: look.shape === "tin" ? "cylinder" : "sphere", material: this.material(look.body) });
        if (look.shape === "tin") {
          // A jam tin, its lid bound down with wire, the fuse out of the top.
          shell.setLocalScale(0.17, 0.2, 0.17);
          this.cube("jam tin binding", 0, 0.02, 0, 0.18, 0.025, 0.18, "#6d5f47", false, entity);
          this.cube("jam tin fuse", 0.03, 0.14, 0, 0.025, 0.09, 0.025, look.fuse, false, entity);
        } else if (look.shape === "ball") {
          // A round iron bomb with a short brass fuse.
          shell.setLocalScale(0.25, 0.25, 0.25);
          this.cube("bomb fuse", 0, 0.14, 0, 0.05, 0.05, 0.05, look.fuse, false, entity);
        } else {
          shell.setLocalScale(0.24, 0.28, 0.24);
          this.cube("grenade fuse", 0, 0.15, 0, 0.07, 0.06, 0.07, look.fuse, false, entity);
        }
        entity.addChild(shell);
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
  // An artillery shell in flight: its body and a hot streak behind it.
  private shellModel(root: pc.Entity) {
    this.cube("shell body", 0, 0, 0, 0.28, 0.28, 0.8, "#443d2a", false, root);
    const trail = this.cube("shell hot trail", 0, 0, 1.5, 0.16, 0.16, 2.4, "#ffc874", false, root);
    trail.render!.material = this.tracerMaterial("tracer");
    return root;
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
        root = this.shellModel(this.joint("incoming artillery shell", this.app.root));
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
  // Period phosphorus tracers burn a warm red-orange for both sides; ball
  // rounds show only as a faint grey streak.
  private tracerMaterial(kind: "tracer" | "ball") {
    const key = `projectile-${kind}`;
    if (!this.materials.has(key)) {
      const material = new pc.StandardMaterial();
      material.diffuse = color(kind === "tracer" ? "#ff9a52" : "#b9b1a3");
      material.emissive = material.diffuse.clone();
      material.emissiveIntensity = kind === "tracer" ? 1.5 : this.map.night ? 0.18 : 0.55;
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
        const lit = tracerRound(p);
        tracer.render!.material = this.tracerMaterial(lit ? "tracer" : "ball");
        tracer.render!.castShadows = false;
        tracer.render!.receiveShadows = false;
        entity.tags.add(lit ? "tracer" : "ball");
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
      const tracer = entity.children[0], lit = entity.tags.has("tracer");
      const length = lit ? trailLength : Math.min(0.45, trailLength), width = lit ? 0.085 : 0.028;
      tracer.setLocalScale(width, width, length);
      tracer.setLocalPosition(0, 0, length / 2);
    }
  }
  effect(e: Event) {
    if(e.type === "flame") {
      const shooter = this.activeGame?.players[e.actor];
      this.fx().flame(e, !!shooter && firstPersonView(shooter));
      const key=`${Math.round(e.to.x)},${Math.round(e.to.z)}`;
      if(e.impact && this.flameScorches.size<24 && !this.flameScorches.has(key) && Math.abs(e.to.y-groundHeight(e.to.x,e.to.z,this.map))<.5){
        const mark=this.joint("charred soil",this.app.root);
        mark.addComponent("render",{type:"sphere",material:this.material("#38372e"),castShadows:false});
        mark.setPosition(e.to.x,groundHeight(e.to.x,e.to.z,this.map)+.025,e.to.z);mark.setLocalScale(.6,.025,.6);
        this.flameScorches.set(key,{entity:mark,life:12});
      }
    }
    if (e.type === "respawn") this.deathHits.delete(e.actor);
    if (e.type === "damage" && this.activeGame) {
      const at = (id: number) => this.soldiers[id]?.standIn ? new pc.Vec3(this.activeGame!.players[id].x, this.activeGame!.players[id].y, this.activeGame!.players[id].z) : this.people[id]?.getPosition();
      const target = at(e.actor), source = at(e.source);
      if (target && source) this.deathHits.set(e.actor, target.clone().sub(source).normalize().mulScalar(7));
    }
    if (e.type === "death" && this.activeGame) {
      const p = this.activeGame.players[e.actor], rig = this.soldiers[e.actor], actor = this.people[e.actor];
      if (p && rig && actor && !rig.remnantCreated) {
        if (rig.standIn) { rig.standIn = false; rig.gait = undefined; rig.placed = undefined; actor.setPosition(p.x, p.y, p.z); }
        actor.setLocalScale(pc.Vec3.ONE);
        this.queueCasualty(p);
        rig.deathAt = e.tick; rig.alive = false;
        this.soldierStats.collapses++;
      }
    }
    if (e.type === "grenadeExplosion" || e.type === "artilleryImpact") this.blastCasualties(e);
    // Burst lights are built only on night maps.
    if (this.burstLights?.length && (e.type === "grenadeExplosion" || e.type === "artilleryImpact")) {
      // Light the flash from the slot that has been dark longest.
      const burst = this.burstLights.reduce((a, b) => (a.bornAt <= b.bornAt ? a : b));
      {
        burst.bornAt = e.tick;
        burst.radius = burstRadius(e.type === "artilleryImpact" ? e.radius : grenadeExplosionProfile.radius);
        burst.light.setPosition(e.at.x, e.at.y + 2.5, e.at.z);
        burst.light.light!.range = burst.radius * 1.25;
      }
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
      // Dust and grit warn that unsupported kit pieces are about to give way.
      for (const [i, id] of (e.change.failing ?? []).slice(0, 4).entries()) {
        const b = this.map.destruction!.objects[id]?.original;
        if (b) this.spawnDebris({ x: b.x, y: (b.baseY ?? 0) + b.h * 0.2, z: b.z }, "stone", 3, e.id + i * 53, true);
      }
      if (e.change.kind === "rifle") {
        this.spawnDebris(e.change.at, "wood", 2, e.id, true);
      } else if (e.change.kind === "collapse") {
        this.spawnDebris(e.change.at, "stone", 10, e.id);
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
      // A fresh crater smoulders for a while; the oldest wisp is reused.
      const smoulder = this.atmosphere?.smoulders.reduce((a, b) => (a.bornAt <= b.bornAt ? a : b));
      if (smoulder) Object.assign(smoulder, { at: { ...e.at }, bornAt: e.tick });
      const scale = e.ambient ? 2 : 1;
      this.blastEffect(e.at, e.radius / scale, 1.7, scale);
      return;
    }
    if (e.type === "grenadeExplosion") {
      this.blastEffect(e.at, e.radius);
      return;
    }
    if (e.type === "fire") {
      this.muzzleEffect(e);
      return;
    }
    // A tank's main gun: flash and barrel smoke from the shared pools.
    if (e.type === "tank" && e.phase === "cannon" && e.to) {
      const d = { x: e.to.x - e.at.x, y: e.to.y - e.at.y, z: e.to.z - e.at.z }, n = Math.hypot(d.x, d.y, d.z) || 1;
      const dir = { x: d.x / n, y: d.y / n, z: d.z / n }, flat = Math.hypot(dir.x, dir.z) || 1;
      this.fx().shot({ at: e.at, dir, right: { x: -dir.z / flat, y: 0, z: dir.x / flat }, weaponId: tankGunMuzzle, mounted: true, heat: 0, seed: e.tank * 13.7 + e.at.x, near: false });
      return;
    }
    if (e.type === "overheat") {
      const g = this.activeGame, gun = e.emplacement === undefined ? undefined : g?.emplacements.get(e.emplacement);
      const shooter = g?.players[e.actor];
      const dir = gun ? viewDirection(gun.yaw, gun.pitch) : shooter ? viewDirection(weaponAim(shooter).yaw, weaponAim(shooter).pitch) : { x: 0, y: 0, z: -1 };
      this.fx().overheat({ at: e.at, dir, length: gun ? 0.75 : 0.5, water: this.waterCooled(gun?.weaponId ?? shooter?.weaponId, !!gun), near: e.actor === 0 });
      return;
    }
    if (e.type !== "impact") return;
    const p = e.at;
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
  private fx() {
    const key = `${this.map.id}|${!!this.map.night}|${this.quality}`;
    if (!this.weaponFx || key !== this.weaponFxKey) {
      this.weaponFx?.destroy();
      this.weaponFx = new WeaponFx(this.app, (x, z) => groundHeight(x, z, this.map), { night: !!this.map.night, quality: this.quality });
      this.weaponFxKey = key;
    }
    return this.weaponFx;
  }
  get weaponEffects() { return this.weaponFx?.stats; }
  get batteries() { return this.batteryView?.stats; }
  // Water-jacketed guns steam; the Hotchkiss, Chauchat and rifles are air-cooled.
  private waterCooled(weaponId: string | undefined, mounted: boolean) {
    return mounted ? weaponId !== "Hotchkiss M1914" : weaponId === "MG 08/15";
  }
  private muzzleEffect(e: Extract<Event, { type: "fire" }>) {
    const g = this.activeGame, shooter = g?.players[e.actor];
    // A tank's machine guns fire from their mounts, seen from outside.
    const crewed = shooter?.tank !== undefined;
    const mounted = e.emplacement !== undefined || crewed;
    let at = e.from, dir = { x: e.to.x - e.from.x, y: e.to.y - e.from.y, z: e.to.z - e.from.z };
    const near = e.actor === 0 && !!shooter && !crewed && (mounted || firstPersonView(shooter));
    // In first person the flash belongs on the weapon the player can see.
    if (near && !mounted && this.fpMuzzle) ({ at, dir } = this.fpMuzzle);
    const n = Math.hypot(dir.x, dir.y, dir.z) || 1;
    dir = { x: dir.x / n, y: dir.y / n, z: dir.z / n };
    const flat = Math.hypot(dir.x, dir.z) || 1;
    this.fx().shot({
      at, dir, right: { x: -dir.z / flat, y: 0, z: dir.x / flat },
      weapon: e.weapon, weaponId: e.weaponId, mounted, heat: e.heat ?? 0, seed: e.projectile * 7.13 + e.actor * 0.37, near,
    });
  }
  private heatGlow(parent: pc.Entity, z: number, diameter: number, length: number) {
    if (!this.heatGlowMaterial) {
      const m = (this.heatGlowMaterial = new pc.StandardMaterial());
      m.diffuse = color("#000000");
      m.emissive = color("#d23a10");
      m.emissiveIntensity = 1.3;
      m.useLighting = false;
      m.blendType = pc.BLEND_ADDITIVEALPHA;
      m.depthWrite = false;
      m.opacity = 0;
      m.update();
    }
    const glow = this.joint("barrel heat glow", parent, 0, 0, z);
    glow.addComponent("render", { type: "cylinder", material: this.heatGlowMaterial, castShadows: false, receiveShadows: false });
    glow.setLocalEulerAngles(90, 0, 0);
    glow.setLocalScale(diameter, length, diameter);
    glow.enabled = false;
    return glow;
  }
  private showHeat(glow: pc.Entity | undefined, heat: number, tick: number) {
    if (!glow) return;
    const level = Math.max(0, (heat - heatRules.glowFrom) / (1 - heatRules.glowFrom));
    glow.enabled = level > 0.01;
    if (glow.enabled)
      // Dull red first, so the metal still shows through; bright only when seized.
      glow.render!.meshInstances[0].setParameter("material_opacity", Math.min(0.7, level ** 1.6 * 0.7 * (0.9 + 0.1 * Math.sin(tick * 0.9))));
  }
  project(p: V3) {
    return this.camera.camera!.worldToScreen(new pc.Vec3(p.x, p.y, p.z));
  }
}
