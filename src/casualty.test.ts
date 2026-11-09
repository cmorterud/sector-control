import { it, expect, vi } from "vitest";
import * as pc from "playcanvas";
import { Renderer } from "./rendering";
import { casualtyRules } from "./soldier-presentation";
import { Game, TestCollision, type Soldier, type Event } from "./simulation";
import { industrialMap, groundHeight } from "./map";
import { grenadeExplosionProfile } from "./destruction";
import { TerrainPhysics } from "./physics";
import { terrainGeometry } from "./terrain-geometry";
import type { Ragdoll, RagdollPhysics } from "./ragdoll";

it("skins a live rig to physical ragdoll bones, bounds bodies, follows excavation and releases native/GPU resources", () => {
  const map = { ...industrialMap, boxes: [] };
  const g = new Game(new TestCollision(map), false, 5000, 12345, undefined, {
    map,
  });
  const p = g.players[0];
  Object.assign(p, { x: 0, y: 0, z: 0 });
  const device = new pc.NullGraphicsDevice(),
    root = new pc.Entity("world");
  Object.assign(root, { _enabledInHierarchy: true });
  type Corpse = {
    entity: pc.Entity;
    mesh: pc.Mesh;
    x: number;
    z: number;
    age: number;
    ragdoll: Ragdoll;
    skin: pc.SkinInstance;
    bones: pc.Entity[];
  };
  type Harness = {
    app: { root: pc.Entity; graphicsDevice: pc.GraphicsDevice };
    map: typeof g.map;
    terrainPhysics: TerrainPhysics;
    ragdollPhysics?: RagdollPhysics;
    activeGame?: Game;
    deathHits: Map<number, pc.Vec3>;
    camera: pc.Entity;
    people: pc.Entity[];
    soldiers: unknown[];
    materials: Map<string, pc.StandardMaterial>;
    casualties: Corpse[];
    soldierStats: Record<string, number>;
    joint(
      name: string,
      parent: pc.Entity,
      x?: number,
      y?: number,
      z?: number,
    ): pc.Entity;
    cube: Renderer["cube"];
    createSoldier(p: Soldier): void;
    retainCasualty(p: Soldier): void;
    drawCasualties(dt: number): void;
    effect(e: Event): void;
  };
  const r = Object.create(Renderer.prototype) as Harness;
  Object.assign(r, {
    app: { root, graphicsDevice: device },
    map: g.map,
    terrainPhysics: new TerrainPhysics(),
    camera: new pc.Entity("camera"),
    people: [],
    soldiers: [],
    materials: new Map(),
    casualties: [],
    soldierStats: {
      collapses: 0,
      remnants: 0,
      expired: 0,
      evicted: 0,
      peakRemnants: 0,
    },
  });
  const joint = r.joint.bind(r);
  r.joint = (name, parent, x = 0, y = 0, z = 0) => {
    const e = joint(name, parent, x, y, z);
    e.removeComponent = ((_type: string) => {
      delete (e as unknown as { render?: unknown }).render;
    }) as typeof e.removeComponent;
    e.addComponent = ((
      _type: string,
      options: { meshInstances: pc.MeshInstance[] },
    ) => {
      Object.assign(e, {
        render: { entity: e, meshInstances: options.meshInstances },
      });
      return e.render;
    }) as typeof e.addComponent;
    return e;
  };
  const box = new pc.BoxGeometry(),
    mesh = new pc.Mesh(device);
  mesh.setPositions(box.positions);
  mesh.setNormals(box.normals);
  mesh.setIndices(box.indices);
  mesh.update();
  const components: pc.RenderComponent[] = [];
  r.cube = (name, x, y, z, w, h, d, tint, _solid, parent, rotation = 0) => {
    const e = r.joint(name, parent ?? root, x, y, z);
    e.setLocalScale(w, h, d);
    e.setLocalEulerAngles(0, 0, rotation);
    const material = new pc.StandardMaterial();
    material.diffuse = new pc.Color().fromString(tint);
    Object.assign(e, {
      render: {
        entity: e,
        meshInstances: [new pc.MeshInstance(mesh, material, e)],
      },
    });
    components.push(e.render!);
    return e;
  };
  r.createSoldier(p);
  r.people[0].findComponents = (() => {
    const found: pc.RenderComponent[] = [];
    const visit = (e: pc.Entity) => {
      if (e.render) found.push(e.render);
      for (const child of e.children) visit(child as pc.Entity);
    };
    visit(r.people[0]);
    return found;
  }) as (typeof r.people)[0]["findComponents"];
  expect(
    (r.people[0].findByName("upper body") as pc.Entity).render!.meshInstances,
  ).toHaveLength(1);
  expect(
    (r.people[0].findByName("helmet") as pc.Entity).render,
  ).toBeUndefined();
  const patchKeys = ["-1,-1", "-1,0", "0,-1", "0,0"];
  for (const key of patchKeys) r.terrainPhysics.setPatch(key, terrainGeometry(g.map, key), root);
  const before = g.snapshot();
  r.retainCasualty(p);
  expect(r.casualties).toHaveLength(1);
  const first = r.casualties[0],
    points: number[] = [];
  first.mesh.getPositions(points);
  expect(points.length).toBeGreaterThan(500);
  expect(points.every(Number.isFinite)).toBe(true);
  const palette: number[] = [];
  first.mesh.getColors(palette);
  expect(new Set(palette.map((v) => v.toFixed(3))).size).toBeGreaterThan(8);
  const pouch = new pc.Color().fromString("#817152");
  expect(
    palette.some(
      (v, i) =>
        i % 4 === 0 &&
        Math.abs(v - pouch.r ** 2.2) < 0.0001 &&
        Math.abs(palette[i + 1] - pouch.g ** 2.2) < 0.0001 &&
        Math.abs(palette[i + 2] - pouch.b ** 2.2) < 0.0001,
    ),
  ).toBe(true);
  expect(first.entity.render!.meshInstances).toHaveLength(1);
  expect(first.entity.collision).toBeUndefined();
  expect(first.entity.rigidbody).toBeUndefined();
  expect(first.ragdoll.bodies).toHaveLength(14);
  expect(first.ragdoll.joints).toHaveLength(13);
  expect(first.mesh.skin!.boneNames).toHaveLength(14);
  expect(r.terrainPhysics.ray({ x: -2, y: 1.25, z: 0 }, { x: 2, y: 1.25, z: 0 })).toBe(1);
  first.skin.updateMatrixPalette(first.entity, 1);
  for (const matrix of first.skin.matrices as pc.Mat4[])
    expect([...matrix.data].every((value, i) => Math.abs(value - (i % 5 === 0 ? 1 : 0)) < 0.00001)).toBe(true);
  r.drawCasualties(0);
  expect(first.age).toBe(0);
  expect(g.snapshot()).toEqual(before);
  for (let i = 0; i < 240; i++) r.drawCasualties(1 / 60);
  const settled = first.ragdoll.positions[0].clone();
  expect(first.ragdoll.positions[1].y).toBeLessThan(0.8);
  first.skin.updateMatrixPalette(first.entity, 2);
  expect([...first.skin.matrixPalette].every(Number.isFinite)).toBe(true);
  expect((first.skin.matrices[1] as pc.Mat4).isIdentity()).toBe(false);
  g.explode({ x: settled.x, y: 0.025, z: settled.z }, 0, "blue", { ...grenadeExplosionProfile, damage: 0 });
  for (const key of patchKeys) r.terrainPhysics.setPatch(key, terrainGeometry(g.map, key), root);
  for (let i = 0; i < 180; i++) r.drawCasualties(1 / 60);
  expect(first.ragdoll.positions[0].y).toBeLessThan(settled.y - 0.1);
  const release = vi.spyOn(first.mesh, "destroy");
  for (let i = 0; i < casualtyRules.max; i++) r.retainCasualty(p);
  expect(r.casualties).toHaveLength(casualtyRules.max);
  expect(release).toHaveBeenCalledOnce();
  expect(r.soldierStats.peakRemnants).toBe(casualtyRules.max);
  expect(r.ragdollPhysics!.ragdolls.size).toBe(casualtyRules.max);
  const final = vi.spyOn(r.casualties[0].mesh, "destroy");
  r.drawCasualties(30);
  expect(r.casualties).toHaveLength(0);
  expect(final).toHaveBeenCalledOnce();
  expect(r.soldierStats.expired).toBe(casualtyRules.max);
  expect(r.ragdollPhysics!.ragdolls.size).toBe(0);
  // First person scales the local world actor to zero. Death must capture its
  // full live pose once, then hide it again, without duplicating the body.
  r.activeGame = g; r.deathHits = new Map([[0, new pc.Vec3(5, 0, 0)]]);
  p.hp = 0;
  r.people[0].setLocalScale(pc.Vec3.ZERO);
  const death: Event = { type: "death", actor: 0, id: 10000, tick: g.tick };
  r.effect(death); r.effect(death);
  expect(r.casualties).toHaveLength(1);
  expect(r.people[0].getLocalScale().equals(pc.Vec3.ZERO)).toBe(true);
  const visible: number[] = [];
  r.casualties[0].mesh.getPositions(visible);
  expect(Math.max(...visible.filter((_, i) => i % 3 === 1)) - Math.min(...visible.filter((_, i) => i % 3 === 1))).toBeGreaterThan(1.8);
  r.drawCasualties(30);
  expect(r.ragdollPhysics!.ragdolls.size).toBe(0);
  r.ragdollPhysics!.destroy();
  r.terrainPhysics.destroy();
  mesh.destroy();
  device.destroy();
});
