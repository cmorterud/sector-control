import { armLengths, boltMotion } from "./weapons";
import { meleeRules } from "./melee";
import { it, expect, vi } from "vitest";
import { Entity, Vec3, NullGraphicsDevice, StandardMaterial, TEXTURELOCK_READ } from "playcanvas";
import { Renderer, shadowCascadeDue, soldierCadence } from "./rendering";
import {
  soldierStyle,
  reloadMotion,
} from "./soldier-presentation";
import { weaponProfiles, weaponProfile } from "./weapons";
import {
  Game,
  idle,
  TestCollision,
  mantlePosition,
  type Soldier,
} from "./simulation";
import { trenchMap } from "./trench-map";
import { eyeHeightOf } from "./crouch";
import { weaponAim } from "./recoil";
import { viewDirection } from "./player-view";
import { boltGrip, rifleGeometry, rifleTextureSize, type RifleShape } from "./rifle-geometry";
import { weaponDesign } from "./weapon-design";
import { viewMuzzle } from "./player-view";
import { updateAimMotion } from "./weapon-handling";

// Exercise the real rig and animation transforms without a WebGL context.
// Mesh creation is replaced by bare transform nodes; joint/IK code is unchanged.
type Rig = {
  body: Entity;
  hips: Entity;
  magazine: Entity;
  reloadMagazine: Entity;
  style: ReturnType<typeof soldierStyle>;
  phase: number;
  upper: Entity;
  rifle: Entity;
  bolt: Entity;
  supportHand: Entity;
  arms: { shoulder: Entity; elbow: Entity }[];
  legs: { hip: Entity; knee: Entity; ankle: Entity }[];
};
type Harness = {
  app: { root: Entity };
  camera: Entity;
  map: typeof trenchMap;
  people: Entity[];
  soldiers: Rig[];
  cube: Renderer["cube"];
  createSoldier(p: Soldier): void;
  riflePart(name: string, x: number, y: number, z: number, w: number, h: number, d: number, tint: string, parent: Entity, shape: RifleShape): Entity;
  createFirstPersonRig(): void;
  drawFirstPerson(p: Soldier, tick: number, dt?: number): void;
  firstPersonRig: Rig & { root: Entity; grenade: Entity; pullback: number };
  ray(a: import("./simulation").V3, b: import("./simulation").V3): number;
  ragdollPose(p: Soldier): { parts: import("./ragdoll").RagdollPart[] };
  animateSoldier(
    p: Soldier,
    x: number,
    z: number,
    dt: number,
    tick: number,
  ): void;
};
function rigFor(p: Soldier) {
  const renderer = Object.create(Renderer.prototype) as Harness;
  renderer.app = { root: new Entity("test world") };
  Object.assign(renderer.app.root, { _enabledInHierarchy: true });
  renderer.camera = new Entity("test camera");
  renderer.app.root.addChild(renderer.camera);
  renderer.map = trenchMap;
  renderer.ray = () => 1;
  renderer.people = [];
  renderer.soldiers = [];
  renderer.cube = (
    name,
    x,
    y,
    z,
    w,
    h,
    d,
    _color,
    _solid,
    parent,
    rotation = 0,
  ) => {
    const e = new Entity(name);
    (parent ?? renderer.app.root).addChild(e);
    e.setLocalPosition(x, y, z);
    e.setLocalScale(w, h, d);
    e.setLocalEulerAngles(0, 0, rotation);
    return e;
  };
  renderer.createSoldier(p);
  // Entity.clone needs an application registry even when meshes are omitted.
  Object.assign(renderer.app, { _entityIndex: {} });
  for (const e of renderer.app.root.find(() => true))
    Object.assign(e, { _app: renderer.app });
  return renderer;
}

const historicalKits = [
  ["serviceRifle", "SMLE Mk III"], ["serviceRifle", "Gewehr 98"],
  ["serviceRifle", "Berthier Mle 1916"], ["serviceRifle", "Scoped Lebel"],
  ["machineGun", "Lewis Mk I"], ["machineGun", "MG 08/15"], ["machineGun", "Chauchat"],
  ["pistol", "Webley Mk VI"], ["pistol", "P08"], ["pistol", "Ruby"],
] as const;

it("keeps every faction's cloned sights on the camera ray and its visible muzzle on the firing origin throughout shouldering", () => {
  for (const [weapon, weaponId] of historicalKits) {
    const g = new Game(new TestCollision(trenchMap), false), p = g.players[0];
    Object.assign(p, {weapon, weaponId, landedAt: -1000, pitch: .3, yaw: .7});
    p.command = {...idle(), firstPerson: true, aim: true};
    updateAimMotion(p, 100);
    const r = rigFor(p); r.createFirstPersonRig();
    const dir = viewDirection(p.yaw, p.pitch);
    r.camera.setPosition(p.x, p.y + eyeHeightOf(p), p.z);
    r.camera.lookAt(p.x + dir.x, p.y + eyeHeightOf(p) + dir.y, p.z + dir.z);
    for (const tick of [100, 102, 104, 106, 115]) {
      r.animateSoldier(p, p.x, p.z, 1/60, tick); r.drawFirstPerson(p, tick, 1/60);
      const rig = r.firstPersonRig, design = weaponDesign(p)!;
      const muzzle = rig.rifle.getWorldTransform().transformPoint(new Vec3(0, .025, design.muzzle));
      const origin = viewMuzzle(p, tick);
      expect(muzzle.distance(new Vec3(origin.x, origin.y, origin.z)), weaponId).toBeLessThan(.00001);
      if (tick === 115) {
        const tip = (rig.rifle.findByName("front sight") as Entity).getWorldTransform().transformPoint(new Vec3(0,.5,0));
        const cameraTip = r.camera.getWorldTransform().clone().invert().transformPoint(tip);
        expect(Math.hypot(cameraTip.x,cameraTip.y), weaponId).toBeLessThan(.00001);
        expect(cameraTip.z).toBeLessThan(-.5);
      }
      const right = rig.arms[1].elbow.getWorldTransform().transformPoint(new Vec3(0,-armLengths.forearm,0));
      const trigger = rig.rifle.getWorldTransform().transformPoint(new Vec3(...(design.trigger??[0,-.03,.14]) as [number,number,number]));
      expect(right.distance(trigger), weaponId).toBeLessThan(.001);
    }
    r.app.root.destroy();
  }
});

it("keeps cloned reload hands attached and moves the Webley frame, Luger toggle and Ruby slide with their mechanisms", () => {
  for (const [weapon, weaponId] of historicalKits) {
    const g = new Game(new TestCollision(trenchMap), false), p = g.players[0];
    Object.assign(p, {weapon, weaponId, landedAt: -1000, reloadAt:100+weaponProfiles[weapon].reloadTicks});
    p.command = {...idle(), firstPerson:true};
    const r = rigFor(p); r.createFirstPersonRig();
    for (const progress of [.25,.4,.6,.83]) {
      const tick=100+progress*weaponProfiles[weapon].reloadTicks;
      r.animateSoldier(p,p.x,p.z,1/60,tick); r.drawFirstPerson(p,tick,1/60);
      const source=r.soldiers[0], rig=r.firstPersonRig;
      const left=rig.arms[0].elbow.getWorldTransform().transformPoint(new Vec3(0,-armLengths.forearm,0));
      expect(left.distance(rig.supportHand.getPosition()),weaponId).toBeLessThan(.001);
      const worldHand=source.arms[1].elbow.getWorldTransform().transformPoint(new Vec3(0,-armLengths.forearm,0));
      const localHand=source.rifle.getWorldTransform().clone().invert().transformPoint(worldHand);
      const target=rig.rifle.getWorldTransform().transformPoint(localHand);
      const right=rig.arms[1].elbow.getWorldTransform().transformPoint(new Vec3(0,-armLengths.forearm,0));
      expect(right.distance(target),weaponId).toBeLessThan(.001);
      if (weaponId==="Webley Mk VI") {
        expect(Math.abs(rig.bolt.getLocalEulerAngles().x)).toBeGreaterThan(10);
        expect((rig.rifle.findByName("front sight") as Entity).parent).toBe(rig.bolt);
        expect(rig.magazine.getLocalScale().length()).toBeGreaterThan(0);
      }
      if(progress===.83 && weaponId==="P08")expect(Math.abs((rig.bolt.findByName("Luger toggle front link") as Entity).getLocalEulerAngles().x)).toBeGreaterThan(20);
      if(progress===.83 && weaponId==="Ruby")expect(rig.bolt.getLocalPosition().z).toBeGreaterThan(.05);
    }
    r.app.root.destroy();
  }
});

it("uploads real wood pixels and shares detailed rifle buffers/materials between instances", () => {
  const g = new Game(new TestCollision(trenchMap), false), r = rigFor(g.players[0]);
  const device = new NullGraphicsDevice();
  Object.assign(r.app, { graphicsDevice: device });
  Object.assign(r, { kitMeshes: new Map(), materials: new Map(), textures: new Map() });
  r.cube = (name, x, y, z, w, h, d, _tint, _solid, parent) => {
    const e = new Entity(name); (parent ?? r.app.root).addChild(e);
    e.setLocalPosition(x, y, z); e.setLocalScale(w, h, d);
    Object.assign(e, { render: { meshInstances: [] } }); return e;
  };
  const a = r.riflePart("stock a", 0, 0, 0, 1, 1, 1, "walnut", r.app.root, "stock");
  const b = r.riflePart("stock b", 0, 0, 0, 1, 1, 1, "walnut", r.app.root, "stock");
  const first = a.render!.meshInstances[0], second = b.render!.meshInstances[0];
  const mesh = first.mesh!;
  expect(first.mesh).toBe(second.mesh); expect(first.material).toBe(second.material);
  const indices: number[] = []; mesh.getIndices(indices);
  expect(indices.length).toBe(rifleGeometry("stock","world").indices.length);
  const material = first.material as StandardMaterial, texture = material.diffuseMap!;
  const pixels = texture.lock({ mode: TEXTURELOCK_READ }) as Uint8Array;
  expect(pixels.length).toBe(rifleTextureSize ** 2 * 4);
  expect(pixels[3]).toBe(255); expect(new Set(pixels.filter((_, i) => i % 4 === 0)).size).toBeGreaterThan(16);
  texture.unlock();
  first.destroy(); second.destroy(); mesh.destroy(); texture.destroy(); material.destroy(); device.destroy();
});

it("aligns the actual cloned front post and rear notch with the camera through aim, recoil and crouch", () => {
  for (const weapon of ["rifle", "serviceRifle", "machineGun"] as const) {
    const g = new Game(new TestCollision(trenchMap), false), p = g.players[0];
    p.weapon = weapon;
    p.command = { ...idle(), firstPerson: true, aim: true };
    const r = rigFor(p);
    r.createFirstPersonRig();
    for (const pitch of [-0.8, 0, 0.7]) for (const crouched of [false, true]) {
      Object.assign(p, { pitch, yaw: 1.3, crouched, recoilPitch: 0.025, recoilYaw: -0.01,
        combatReaction: {kind:"nearMiss",tick:97,strength:.8,from:{x:p.x+4,y:p.y+1,z:p.z},pauseUntil:106,braceUntil:115} });
      const view = weaponAim(p), direction = viewDirection(view.yaw, view.pitch);
      r.camera.setPosition(p.x, p.y + eyeHeightOf(p), p.z);
      r.camera.lookAt(p.x + direction.x, p.y + eyeHeightOf(p) + direction.y, p.z + direction.z);
      r.animateSoldier(p, p.x, p.z, 1 / 60, 100);
      r.drawFirstPerson(p,100,1/60);
      const rig = r.firstPersonRig;
      const front = rig.rifle.findByName("front sight") as Entity;
      const tip = front.getWorldTransform().transformPoint(new Vec3(0, 0.5, 0));
      const inCamera = r.camera.getWorldTransform().clone().invert().transformPoint(tip);
      expect(Math.abs(inCamera.x)).toBeLessThan(0.00001);
      expect(Math.abs(inCamera.y)).toBeLessThan(0.00001);
      expect(inCamera.z).toBeLessThan(-0.8);
      const ears = rig.rifle.findByName("rear sight ear") as Entity;
      const notchTop = ears.getWorldTransform().transformPoint(new Vec3(-ears.getLocalPosition().x / ears.getLocalScale().x, 0.5, 0));
      const notch = r.camera.getWorldTransform().clone().invert().transformPoint(notchTop);
      expect(Math.abs(notch.x)).toBeLessThan(0.00001);
      expect(Math.abs(notch.y)).toBeLessThan(0.00001);
      for (const aim of [true, false]) {
        p.command.aim = aim;
        r.drawFirstPerson(p, 100);
        const wrist = rig.arms[0].elbow.getWorldTransform().transformPoint(new Vec3(0, -armLengths.forearm, 0));
        expect(wrist.distance(rig.supportHand.getPosition())).toBeLessThan(0.001);
        const right = rig.arms[1].elbow.getWorldTransform().transformPoint(new Vec3(0, -armLengths.forearm, 0));
        const trigger = rig.rifle.getWorldTransform().transformPoint(new Vec3(0, -0.03, 0.14));
        expect(right.distance(trigger)).toBeLessThan(0.001);
      }
      p.command.aim = true;
    }
    p.throwUntil = 115;
    r.drawFirstPerson(p, 100);
    expect(r.firstPersonRig.root.enabled).toBe(true);
    const hand = r.firstPersonRig.arms[1].elbow.getWorldTransform()
      .transformPoint(new Vec3(0, -armLengths.forearm, 0));
    const localHand = r.camera.getWorldTransform().clone().invert().transformPoint(hand);
    expect(localHand.z).toBeCloseTo(-0.5);
    expect(localHand.y).toBeCloseTo(-0.14);
    p.command.firstPerson = p.command.aim = false;
    r.drawFirstPerson(p, 100);
    expect(r.firstPersonRig.root.enabled).toBe(false);
    const old = r.firstPersonRig.root;
    r.createFirstPersonRig();
    expect(old.parent).toBeNull();
  }
});

it("keeps the first-person support hand attached through reloads and animates the copied clip and bolt independently", () => {
  for (const weapon of ["rifle", "serviceRifle", "machineGun"] as const) {
    const g = new Game(new TestCollision(trenchMap), false), p = g.players[0];
    p.weapon = weapon;
    p.command = { ...idle(), firstPerson: true, aim: true };
    p.reloadAt = 100 + weaponProfiles[weapon].reloadTicks;
    const r = rigFor(p);
    r.createFirstPersonRig();
    for (let tick = 100; tick < p.reloadAt; tick += 2) {
      r.animateSoldier(p, p.x, p.z, 1 / 60, tick);
      const sourcePosition = r.soldiers[0].rifle.getLocalPosition().clone();
      r.drawFirstPerson(p, tick);
      const rig = r.firstPersonRig;
      const left = rig.arms[0].elbow.getWorldTransform().transformPoint(new Vec3(0, -armLengths.forearm, 0));
      expect(left.distance(rig.supportHand.getPosition())).toBeLessThan(0.001);
      expect(rig.reloadMagazine.getLocalScale().equals(r.soldiers[0].reloadMagazine.getLocalScale())).toBe(true);
      expect(rig.bolt.getLocalPosition().equals(r.soldiers[0].bolt.getLocalPosition())).toBe(true);
      expect(r.soldiers[0].rifle.getLocalPosition().equals(sourcePosition)).toBe(true);
      expect(rig.rifle).not.toBe(r.soldiers[0].rifle);
    }
  }
});

it("thrusts and butt-strikes with both wrists on the weapon, then restores the pose without changing simulation state", () => {
  for (const kind of ["bayonet", "charge", "butt"] as const) {
    const g = new Game(new TestCollision(trenchMap), false),
      p = g.players[0];
    p.weapon = kind === "butt" ? "machineGun" : "serviceRifle";
    const rule = meleeRules[kind];
    p.melee = {
      kind,
      startTick: 100,
      strikeTick: 100 + rule.windup,
      endTick:
        kind === "charge" ? Number.MAX_SAFE_INTEGER : 100 + rule.duration,
      yaw: 0,
      struck: false,
    };
    const r = rigFor(p),
      rig = r.soldiers[0],
      before = structuredClone(p);
    expect(!!r.people[0].findByName("bayonet blade")).toBe(kind !== "butt");
    for (const age of [
      ...Array.from({ length: rule.duration + 1 }, (_, i) => i),
      ...(kind === "charge" ? [120, 600] : []),
    ]) {
      r.animateSoldier(p, p.x, p.z, 1 / 60, 100 + age);
      const left = rig.arms[0].elbow
        .getWorldTransform()
        .transformPoint(new Vec3(0, -armLengths.forearm, 0));
      expect(
        left.distance(rig.supportHand.getPosition()),
        `${kind} frame${age}`,
      ).toBeLessThan(0.001);
      const right = rig.arms[1].elbow
        .getWorldTransform()
        .transformPoint(new Vec3(0, -armLengths.forearm, 0));
      const trigger = rig.rifle
        .getWorldTransform()
        .transformPoint(new Vec3(0, -0.03, 0.14));
      expect(right.distance(trigger), `${kind} right frame${age}`).toBeLessThan(
        0.001,
      );
    }
    expect(p).toEqual(before);
    p.melee = null;
    r.animateSoldier(p, p.x, p.z, 1 / 60, 200);
    expect(rig.arms[0].shoulder.getLocalPosition().z).toBeCloseTo(-0.12);
  }
});

it("braces the free hand on the bank, keeps the support hand on the rifle, and clears the bank with tucked feet", () => {
  const game = new Game(
    new TestCollision(trenchMap),
    false,
    600,
    12345,
    undefined,
    { map: trenchMap },
  );
  const p = game.players[0];
  Object.assign(p, { x: -18.5, y: 0, z: -27 });
  game.step({ ...idle(), yaw: Math.PI / 2, mantle: true });
  const m = p.mantle!;
  expect(m).toBeTruthy();
  const r = rigFor(p),
    rig = r.soldiers[0];
  for (const phase of [0.46, 0.7, 0.9]) {
    const tick = m.startTick + (m.endTick - m.startTick) * phase;
    const pos = mantlePosition(m, tick);
    r.people[0].setPosition(pos.x, pos.y, pos.z);
    r.people[0].setEulerAngles(0, (-m.yaw * 180) / Math.PI, 0);
    r.animateSoldier(p, pos.x, pos.z, 1 / 60, tick);
    const supportWrist = rig.arms[0].elbow
      .getWorldTransform()
      .transformPoint(new Vec3(0, -armLengths.forearm, 0));
    expect(supportWrist.distance(rig.supportHand.getPosition())).toBeLessThan(
      0.0001,
    );
    if (phase === 0.46) {
      const wrist = rig.arms[1].elbow
        .getWorldTransform()
        .transformPoint(new Vec3(0, -armLengths.forearm, 0));
      const ledge = new Vec3(
        m.edge.x + Math.cos(m.yaw) * 0.32,
        m.edge.y + 0.04,
        m.edge.z + Math.sin(m.yaw) * 0.32,
      );
      expect(wrist.distance(ledge)).toBeLessThan(0.01);
    } else {
      for (const leg of rig.legs)
        expect(leg.ankle.getPosition().y - 0.07).toBeGreaterThan(m.to.y - 0.01);
    }
  }
});

it("exposes the helmet and rifle while keeping the torso below the firing-step parapet", () => {
  const game = new Game(
    new TestCollision(trenchMap),
    false,
    600,
    12345,
    undefined,
    { map: trenchMap },
  );
  const p = game.players[0];
  Object.assign(p, {
    x: -19,
    y: 0.85,
    z: -1,
    yaw: Math.PI / 2,
    command: { ...idle(), aim: true },
  });
  const r = rigFor(p);
  r.animateSoldier(p, p.x, p.z, 1 / 60, 10);
  const nodes = new Map<string, Entity>();
  const visit = (e: Entity) => {
    nodes.set(e.name, e);
    for (const child of e.children) visit(child as Entity);
  };
  visit(r.people[0]);
  const bounds = (name: string) => {
    const e = nodes.get(name)!;
    const ys = [];
    for (const x of [-0.5, 0.5])
      for (const y of [-0.5, 0.5])
        for (const z of [-0.5, 0.5])
          ys.push(e.getWorldTransform().transformPoint(new Vec3(x, y, z)).y);
    return { min: Math.min(...ys), max: Math.max(...ys) };
  };
  for (const name of ["torso", "vest", "backpack", "pelvis"])
    expect(bounds(name).max).toBeLessThan(2.4);
  expect(bounds("helmet").max).toBeGreaterThan(2.65);
  expect(bounds("barrel").min).toBeGreaterThan(2.4);
});

it("crouches with bent knees and planted boots, keeps the support hand attached, and hides below the parapet", () => {
  const game = new Game(
    new TestCollision(trenchMap),
    false,
    600,
    12345,
    undefined,
    { map: trenchMap },
  );
  const p = game.players[0];
  Object.assign(p, { x: -19, y: 0.85, z: -1, crouched: true, landedAt: -1000 });
  const r = rigFor(p),
    rig = r.soldiers[0];
  const nodes = new Map<string, Entity>();
  const visit = (e: Entity) => {
    nodes.set(e.name, e);
    for (const child of e.children) visit(child as Entity);
  };
  visit(r.people[0]);
  for (let i = 0; i < 75; i++) {
    r.animateSoldier(p, p.x, p.z, 1 / 60, 100 + i / 2);
    for (const leg of rig.legs)
      expect(leg.ankle.getPosition().y - p.y).toBeGreaterThan(0.07);
    const wrist = rig.arms[0].elbow
      .getWorldTransform()
      .transformPoint(new Vec3(0, -armLengths.forearm, 0));
    expect(wrist.distance(rig.supportHand.getPosition())).toBeLessThan(0.0001);
  }
  const helmet = nodes.get("helmet")!;
  expect(helmet.getPosition().y + 0.09).toBeLessThan(2.4);
  expect(nodes.get("knee")!.getLocalEulerAngles().x).toBeLessThan(-120);
  p.crouched = false;
  for (let i = 0; i < 75; i++)
    r.animateSoldier(p, p.x, p.z, 1 / 60, 140 + i / 2);
  expect(helmet.getPosition().y).toBeGreaterThan(2.65);
});

it("kicks the barrel and shoulder back while keeping the support wrist on the grip throughout recovery", () => {
  const game = new Game(
    new TestCollision(trenchMap),
    false,
    3000,
    12345,
    undefined,
    { map: trenchMap },
  );
  const p = game.players[0];
  game.tick = 100;
  const r = rigFor(p),
    rig = r.soldiers[0];
  r.animateSoldier(p, p.x, p.z, 1 / 60, 99);
  const rest = rig.rifle.getLocalPosition().clone();
  const restDirection = rig.rifle.forward.clone();
  r.animateSoldier(p, p.x, p.z, 1 / 60, 159);
  const futureIdle = rig.rifle.forward.clone();
  r.animateSoldier(p, p.x, p.z, 1 / 60, 99);
  game.fire(p);
  let previousZ = Infinity;
  for (const age of [0, 0.5, 1, 2, 4, 8]) {
    r.animateSoldier(p, p.x, p.z, 1 / 60, 99 + age);
    const z = rig.rifle.getLocalPosition().z;
    expect(z).toBeLessThanOrEqual(previousZ);
    expect(z).toBeGreaterThan(rest.z);
    previousZ = z;
    const wrist = rig.arms[0].elbow
      .getWorldTransform()
      .transformPoint(new Vec3(0, -armLengths.forearm, 0));
    expect(wrist.distance(rig.supportHand.getPosition())).toBeLessThan(0.0001);
    if (age === 0) {
      expect(z - rest.z).toBeGreaterThan(0.08);
      expect(rig.rifle.forward.y).toBeGreaterThan(restDirection.y + 0.04);
    }
  }
  for (let i = 0; i < 60; i++) game.step(idle());
  r.animateSoldier(p, p.x, p.z, 1 / 60, game.tick - 1);
  expect(rig.rifle.getLocalPosition().z).toBeCloseTo(rest.z, 4);
  expect(rig.rifle.forward.y).toBeCloseTo(futureIdle.y, 4);
});

it("tucks falling legs and keeps the rifle grip attached while the root drops", () => {
  const game = new Game(
    new TestCollision(trenchMap),
    false,
    600,
    12345,
    undefined,
    { map: trenchMap },
  );
  const p = game.players[0];
  Object.assign(p, {
    x: -18.8,
    z: -27,
    y: 1.3,
    fall: { startTick: 100, velocity: -6 },
  });
  const r = rigFor(p),
    rig = r.soldiers[0];
  r.animateSoldier(p, p.x, p.z, 1 / 60, 110);
  for (const leg of rig.legs)
    expect(leg.ankle.getPosition().y).toBeGreaterThan(p.y + 0.07);
  const wrist = rig.arms[0].elbow
    .getWorldTransform()
    .transformPoint(new Vec3(0, -armLengths.forearm, 0));
  expect(wrist.distance(rig.supportHand.getPosition())).toBeLessThan(0.0001);
});

it("braces after a nearby blast without detaching the support hand, then settles", () => {
  const game = new Game(
    new TestCollision(trenchMap),
    false,
    600,
    12345,
    undefined,
    { map: trenchMap },
  );
  const p = game.players[0],
    r = rigFor(p),
    rig = r.soldiers[0];
  p.combatReaction = {kind: "blast", tick: 100, strength: 1, from: {x:p.x+4,y:p.y,z:p.z}, pauseUntil:109,braceUntil:122};
  r.animateSoldier(p, p.x, p.z, 1 / 60, 99);
  const rest = rig.upper.forward.clone();
  const control = rigFor(p);
  control.animateSoldier(p, p.x, p.z, 1 / 60, 130);
  const futureIdle = control.soldiers[0].upper.forward.clone();
  r.animateSoldier(p, p.x, p.z, 1 / 60, 103);
  expect(rig.upper.forward.distance(rest)).toBeGreaterThan(0.02);
  const wrist = rig.arms[0].elbow
    .getWorldTransform()
    .transformPoint(new Vec3(0, -armLengths.forearm, 0));
  expect(wrist.distance(rig.supportHand.getPosition())).toBeLessThan(0.0001);
  r.animateSoldier(p, p.x, p.z, 1 / 60, 130);
  expect(rig.upper.forward.distance(futureIdle)).toBeLessThan(0.0001);
  expect(p.combatReaction.tick).toBe(100);
});

it("varies cadence and idle upper-body motion without moving planted boots or simulation state", () => {
  const g = new Game(
      new TestCollision(trenchMap),
      false,
      3000,
      12345,
      undefined,
      { map: trenchMap },
    ),
    p = g.players[0];
  p.landedAt = -1000;
  const a = rigFor(p),
    b = rigFor(p);
  b.soldiers[0].style = soldierStyle(17);
  const before = structuredClone(p);
  a.animateSoldier(p, p.x, p.z, 1 / 60, 100);
  const ankle = a.soldiers[0].legs[0].ankle.getPosition().clone(),
    facing = a.soldiers[0].upper.forward.clone();
  a.animateSoldier(p, p.x, p.z, 1 / 60, 160);
  expect(
    a.soldiers[0].legs[0].ankle.getPosition().distance(ankle),
  ).toBeLessThan(0.0001);
  expect(a.soldiers[0].upper.forward.distance(facing)).toBeGreaterThan(0.001);
  for (let i = 1; i <= 20; i++) {
    a.animateSoldier(p, p.x + i * 0.08, p.z, 1 / 60, 160 + i);
    b.animateSoldier(p, p.x + i * 0.08, p.z, 1 / 60, 160 + i);
  }
  expect(Math.abs(a.soldiers[0].phase - b.soldiers[0].phase)).toBeGreaterThan(
    0.01,
  );
  expect(p).toEqual(before);
  for (const name of [
    "helmet brim",
    "web belt",
    "ammunition pouch",
    "webbing strap",
    "pack flap",
    "rolled blanket",
  ])
    expect(a.people[0].findByName(name)).toBeTruthy();
});
it("animates magazine exchanges and service-rifle clips with the support wrist attached, then restores the firing pose", () => {
  for (const weapon of ["rifle", "serviceRifle", "machineGun"] as const) {
    const g = new Game(new TestCollision(trenchMap), false),
      p = g.players[0];
    p.weapon = weapon;
    p.reloadAt = 100 + weaponProfiles[weapon].reloadTicks;
    p.landedAt = -1000;
    const r = rigFor(p),
      rig = r.soldiers[0],
      hands = [];
    const magazineChanges = vi.spyOn(rig.magazine, "enabled", "set"),
      carriedChanges = vi.spyOn(rig.reloadMagazine, "enabled", "set");
    for (let i = 0; i < 100; i++) {
      const tick = 100 + (i / 100) * weaponProfiles[weapon].reloadTicks;
      r.animateSoldier(p, p.x, p.z, 1 / 60, tick);
      const wrist = rig.arms[0].elbow
        .getWorldTransform()
        .transformPoint(new Vec3(0, -armLengths.forearm, 0));
      expect(wrist.distance(rig.supportHand.getPosition())).toBeLessThan(
        0.0001,
      );
      const motion = reloadMotion(p, tick)!;
      expect(rig.magazine.getLocalScale().length() > 0).toBe(!motion.removed);
      expect(rig.reloadMagazine.getLocalScale().length() > 0).toBe(
        motion.carrying,
      );
      if (i === 40 || i === 79)
        hands.push(rig.arms[1].elbow.getPosition().clone());
    }
    expect(hands[0].distance(hands[1])).toBeGreaterThan(0.1);
    p.reloadAt = 0;
    r.animateSoldier(p, p.x, p.z, 1 / 60, 200);
    expect(rig.magazine.enabled).toBe(true);
    expect(rig.reloadMagazine.getLocalScale().length()).toBe(0);
    expect(magazineChanges).not.toHaveBeenCalled();
    expect(carriedChanges).not.toHaveBeenCalled();
  }
});
it("opens, retracts and closes the service bolt with the right wrist on its knob and the left wrist on the stock", () => {
  const g = new Game(
      new TestCollision(trenchMap),
      false,
      3000,
      12345,
      undefined,
      { map: trenchMap },
    ),
    p = g.players[0];
  p.lastShotAt = 100;
  const r = rigFor(p),
    rig = r.soldiers[0];
  const before = structuredClone(p);
  const cycle = weaponProfile(p).shotTicks;
  for (const phase of [0.25, 0.47, 0.56, 0.75, 0.78]) {
    const age = cycle * phase;
    r.animateSoldier(p, p.x, p.z, 1 / 60, 100 + age);
    const motion = boltMotion(p, 100 + age)!;
    expect(rig.bolt.getLocalPosition().z).toBeCloseTo(
      0.13 + 0.1 * motion.pull,
    );
    const knob = rig.bolt
      .getWorldTransform()
      .transformPoint(new Vec3(boltGrip.x, boltGrip.y, boltGrip.z));
    const right = rig.arms[1].elbow
      .getWorldTransform()
      .transformPoint(new Vec3(0, -armLengths.forearm, 0));
    expect(right.distance(knob)).toBeLessThan(0.001);
    const left = rig.arms[0].elbow
      .getWorldTransform()
      .transformPoint(new Vec3(0, -armLengths.forearm, 0));
    expect(left.distance(rig.supportHand.getPosition())).toBeLessThan(0.001);
  }
  r.animateSoldier(p, p.x, p.z, 1 / 60, 100 + cycle);
  expect(rig.bolt.getLocalPosition().z).toBeCloseTo(0.13);
  expect(rig.bolt.getLocalEulerAngles().z).toBeCloseTo(0);
  expect(p).toEqual(before);
});
it("captures standing and crouching live rig anatomy for ragdolls without changing soldier state", () => {
  const g = new Game(new TestCollision(trenchMap), false), p = g.players[0], r = rigFor(p);
  const standingHead = r.ragdollPose(p).parts.find(b => b.name === "head")!.position.y;
  p.crouched = true; p.command = { ...idle(), crouch: true, aim: true };
  for (let i = 0; i < 90; i++) r.animateSoldier(p, p.x, p.z, 1 / 60, 100 + i);
  const before = structuredClone(p), pose = r.ragdollPose(p);
  expect(pose.parts).toHaveLength(14);
  expect(pose.parts.filter(b => b.parent)).toHaveLength(13);
  expect(pose.parts.find(b => b.name === "head")!.position.y).toBeLessThan(standingHead - 0.45);
  const arm = r.soldiers[0].arms[0];
  const wrist = arm.elbow.getWorldTransform().transformPoint(new Vec3(0, -armLengths.forearm, 0));
  const center = arm.elbow.getPosition().clone().lerp(arm.elbow.getPosition(), wrist, 0.5);
  expect(pose.parts.find(b => b.name === "left forearm")!.position.distance(center)).toBeLessThan(0.00001);
  expect(pose.parts.every(b => Number.isFinite(b.position.x + b.position.y + b.position.z))).toBe(true);
  expect(p).toEqual(before);
});

it("raises and sways the first-person rifle throughout an active charge, retaining both wrists and clearing on contact or cancel", () => {
  const g = new Game(new TestCollision(trenchMap), false), p = g.players[0], r = rigFor(p);
  p.command = { ...idle(), firstPerson: true, sprint: true, z: -1 };
  r.createFirstPersonRig();
  r.animateSoldier(p, p.x, p.z, 1 / 60, 100);
  r.drawFirstPerson(p, 100);
  const neutralY = r.firstPersonRig.rifle.getLocalPosition().y;
  p.melee = { kind: "charge", startTick: 100, strikeTick: 112, endTick: Number.MAX_SAFE_INTEGER, yaw: 0, struck: false };
  const before = structuredClone(p);
  r.drawFirstPerson(p, 100);
  expect(r.firstPersonRig.rifle.getLocalPosition().y).toBeCloseTo(neutralY);
  r.drawFirstPerson(p, 103);
  expect(r.firstPersonRig.rifle.getLocalPosition().y).toBeCloseTo(neutralY + 0.055);
  const positions: Vec3[] = [];
  for (const [i, phase] of [0, Math.PI / 4, Math.PI / 2, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.5].entries()) {
    Object.assign(r.soldiers[0], { phase, motion: 1 });
    r.drawFirstPerson(p, 700 + i);
    const rig = r.firstPersonRig;
    positions.push(rig.rifle.getLocalPosition().clone());
    expect(positions.at(-1)!.y).toBeGreaterThan(neutralY + 0.09);
    const left = rig.arms[0].elbow.getWorldTransform().transformPoint(new Vec3(0, -armLengths.forearm, 0));
    expect(left.distance(rig.supportHand.getPosition())).toBeLessThan(0.001);
    const right = rig.arms[1].elbow.getWorldTransform().transformPoint(new Vec3(0, -armLengths.forearm, 0));
    const trigger = rig.rifle.getWorldTransform().transformPoint(new Vec3(0, -0.03, 0.14));
    expect(right.distance(trigger)).toBeLessThan(0.001);
  }
  expect(Math.max(...positions.map(p => p.x)) - Math.min(...positions.map(p => p.x))).toBeGreaterThan(0.035);
  expect(Math.max(...positions.map(p => p.y)) - Math.min(...positions.map(p => p.y))).toBeGreaterThan(0.009);
  expect(Math.max(...positions.map(p => p.z)) - Math.min(...positions.map(p => p.z))).toBeGreaterThan(0.012);
  expect(p).toEqual(before);
  p.melee.struck = true;
  p.melee.strikeTick = 705; p.melee.endTick = 735;
  r.drawFirstPerson(p, 705);
  expect(r.firstPersonRig.rifle.getLocalPosition().y).toBeCloseTo(neutralY);
  p.melee = null;
  r.drawFirstPerson(p, 740);
  expect(r.firstPersonRig.rifle.getLocalPosition().y).toBeCloseTo(neutralY);
});

it("adds stride motion to the raised third-person charge without detaching the hands", () => {
  const g = new Game(new TestCollision(trenchMap), false), p = g.players[0], r = rigFor(p);
  p.command = { ...idle(), sprint: true, z: -1 };
  p.melee = { kind: "charge", startTick: 100, strikeTick: 112, endTick: Number.MAX_SAFE_INTEGER, yaw: 0, struck: false };
  const before = structuredClone(p), xs: number[] = [];
  for (let i = 0; i < 36; i++) {
    r.animateSoldier(p, p.x, p.z - (i + 1) * 6.8 / 60, 1 / 60, 120 + i / 2);
    const rig = r.soldiers[0]; xs.push(rig.rifle.getLocalPosition().x);
    expect(rig.rifle.getLocalPosition().y).toBeGreaterThan(0.45);
    const left = rig.arms[0].elbow.getWorldTransform().transformPoint(new Vec3(0, -armLengths.forearm, 0));
    const right = rig.arms[1].elbow.getWorldTransform().transformPoint(new Vec3(0, -armLengths.forearm, 0));
    expect(left.distance(rig.supportHand.getPosition())).toBeLessThan(0.001);
    const trigger = rig.rifle.getWorldTransform().transformPoint(new Vec3(0, -0.03, 0.14));
    expect(right.distance(trigger)).toBeLessThan(0.001);
  }
  expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.015);
  expect(p).toEqual(before);
});

it("pulls the actual barrel and bayonet in front of close cover, retaining grips and settling back after clearance", () => {
  const g = new Game(new TestCollision(trenchMap), false), p = g.players[0];
  p.weapon = "serviceRifle";
  const r = rigFor(p);
  Object.assign(p, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
  p.command = { ...idle(), firstPerson: true };
  r.camera.setPosition(0, eyeHeightOf(p), 0); r.camera.lookAt(0, eyeHeightOf(p), -1);
  r.createFirstPersonRig(); r.animateSoldier(p, 0, 0, 1 / 60, 100);
  const wall = new TestCollision({ ...trenchMap, terrain: undefined, boxes: [
    { x: 0, z: -0.55, w: 3, d: 0.1, h: 4, kind: "barrier" },
  ] });
  r.ray = (a, b) => wall.ray(a, b);
  const before = structuredClone(p);
  r.drawFirstPerson(p, 100);
  const rig = r.firstPersonRig;
  expect(rig.pullback).toBeGreaterThan(0.8);
  const tip = rig.rifle.getWorldTransform().transformPoint(new Vec3(0, -0.05, -0.98));
  expect(tip.z).toBeGreaterThan(-0.5);
  for (const [i, target] of [rig.supportHand.getPosition(), rig.rifle.getWorldTransform().transformPoint(new Vec3(0, -0.03, 0.14))].entries()) {
    const wrist = rig.arms[i].elbow.getWorldTransform().transformPoint(new Vec3(0, -armLengths.forearm, 0));
    expect(wrist.distance(target)).toBeLessThan(0.001);
  }
  r.ray = () => 1;
  const pulled = rig.pullback;
  r.drawFirstPerson(p, 100, 0); expect(rig.pullback).toBe(pulled);
  r.drawFirstPerson(p, 101); expect(rig.pullback).toBeGreaterThan(0); expect(rig.pullback).toBeLessThan(pulled);
  for (let i = 0; i < 60; i++) r.drawFirstPerson(p, 102 + i);
  expect(rig.pullback).toBeLessThan(0.00001);
  expect(p).toEqual(before);
});

it("lowers the first-person weapon during actual sprint travel and smoothly shoulders it on aiming", () => {
  for (const fps of [30, 60, 120]) {
    const g = new Game(new TestCollision(trenchMap), false), p = g.players[0], r = rigFor(p);
    p.command = { ...idle(), firstPerson: true, sprint: true };
    r.createFirstPersonRig(); r.animateSoldier(p, p.x, p.z, 1 / fps, 100); r.drawFirstPerson(p, 100, 1 / fps);
    const y = r.firstPersonRig.rifle.getLocalPosition().y;
    for (let i = 1; i <= fps; i++) {
      r.animateSoldier(p, p.x, p.z - i * 6.8 / fps, 1 / fps, 100 + i * 30 / fps);
      r.drawFirstPerson(p, 100 + i * 30 / fps, 1 / fps);
    }
    expect(r.firstPersonRig.rifle.getLocalPosition().y).toBeLessThan(y - 0.06);
    p.command.aim = true;
    r.animateSoldier(p, p.x, p.z - 6.8, 1 / fps, 131); r.drawFirstPerson(p, 131, 1 / fps);
    expect(r.firstPersonRig.rifle.getLocalPosition().y).toBeLessThan(-0.15);
    for (let i = 0; i < fps; i++) {
      r.animateSoldier(p, p.x, p.z - 6.8, 1 / fps, 131 + i * 30 / fps);
      r.drawFirstPerson(p, 131 + i * 30 / fps, 1 / fps);
    }
    const post = r.firstPersonRig.rifle.findByName("front sight") as Entity;
    const tip = post.getWorldTransform().transformPoint(new Vec3(0, 0.5, 0));
    expect(Math.abs(tip.x)).toBeLessThan(0.001);
    expect(Math.abs(tip.y)).toBeLessThan(0.001);
  }
});

it("shows a grenade attached to the winding-up hand, hides it on physical release and restores the grip", () => {
  const g = new Game(new TestCollision(trenchMap), false), p = g.players[0], r = rigFor(p);
  g.step({ ...idle(), firstPerson: true, grenade: true });
  r.createFirstPersonRig(); r.animateSoldier(p, p.x, p.z, 1 / 60, g.tick);
  const before = structuredClone(p), heights: number[] = [];
  for (const age of [0, 2, 4, 5.5]) {
    r.drawFirstPerson(p, 1 + age);
    const rig = r.firstPersonRig;
    expect(rig.grenade.enabled).toBe(true);
    const wrist = rig.arms[1].elbow.getWorldTransform().transformPoint(new Vec3(0, -armLengths.forearm, 0));
    expect(wrist.distance(rig.grenade.getPosition())).toBeLessThan(0.07);
    heights.push(wrist.y);
  }
  expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.2);
  expect(p).toEqual(before);
  for (let i = 0; i < 6; i++) g.step({ ...idle(), firstPerson: true });
  expect(g.grenades).toHaveLength(1);
  r.drawFirstPerson(p, g.tick);
  expect(r.firstPersonRig.grenade.enabled).toBe(false);
  for (let i = 0; i < 15; i++) g.step({ ...idle(), firstPerson: true });
  r.drawFirstPerson(p, g.tick);
  const rig = r.firstPersonRig;
  const wrist = rig.arms[1].elbow.getWorldTransform().transformPoint(new Vec3(0, -armLengths.forearm, 0));
  expect(wrist.distance(rig.rifle.getWorldTransform().transformPoint(new Vec3(0, -0.03, 0.14)))).toBeLessThan(0.001);
});

it("poses near and visible soldiers every frame, distant ones less often, and unseen ones one frame in four", () => {
  const look = { x: 0, y: 0, z: -1 };
  // Close by, in any direction: every frame.
  expect(soldierCadence(false, 0, 0, 8, look)).toEqual({ every: 1, inView: true });
  expect(soldierCadence(false, 5, 0, -9, look)).toEqual({ every: 1, inView: true });
  // Ahead: every frame to 30 m, every other to 75 m, every third beyond.
  expect(soldierCadence(false, 0, 0, -25, look)).toEqual({ every: 1, inView: true });
  expect(soldierCadence(false, 0, 0, -45, look)).toEqual({ every: 2, inView: true });
  expect(soldierCadence(false, 0, 0, -90, look)).toEqual({ every: 3, inView: true });
  // Behind or far off to the side: one frame in four, and not in view.
  expect(soldierCadence(false, 0, 0, 40, look)).toEqual({ every: 4, inView: false });
  expect(soldierCadence(false, 40, 0, -5, look)).toEqual({ every: 4, inView: false });
  // The edge of a wide screen (about 55 degrees off axis) still counts as in view.
  expect(soldierCadence(false, 33, 0, -23, look).inView).toBe(true);
  // Through a scope everything in view is posed every frame; what is behind is not.
  expect(soldierCadence(false, 0, 0, -90, look, true)).toEqual({ every: 1, inView: true });
  expect(soldierCadence(false, 0, 0, 40, look, true).every).toBe(4);
  // The player's own soldier, and anyone dying, is never skipped.
  expect(soldierCadence(true, 0, 0, 90, look)).toEqual({ every: 1, inView: true });
});

it("redraws the near shadow cascade every frame and never all three in one frame", () => {
  const frames = Array.from({ length: 16 }, (_, frame) => [0, 1, 2].filter((cascade) => shadowCascadeDue(cascade, frame)));
  for (const due of frames) {
    expect(due).toContain(0);
    expect(due.length).toBeLessThanOrEqual(2);
  }
  // The second cascade every other frame, the third one frame in four.
  expect(frames.filter((due) => due.includes(1))).toHaveLength(8);
  expect(frames.filter((due) => due.includes(2))).toHaveLength(4);
});
