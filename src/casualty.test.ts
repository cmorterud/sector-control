import { it, expect, vi } from "vitest";
import * as pc from "playcanvas";
import { Renderer } from "./rendering";
import { casualtyRules } from "./soldier-presentation";
import { Game, TestCollision, type Soldier } from "./simulation";
import { industrialMap, groundHeight } from "./map";
import { grenadeExplosionProfile } from "./destruction";

it("bakes a collapsed rig into one non-colliding mesh, bounds bodies, follows excavation, pauses and frees expired geometry", () => {
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
  };
  type Harness = {
    app: { root: pc.Entity; graphicsDevice: pc.GraphicsDevice };
    map: typeof g.map;
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
    collapseSoldier(p: Soldier, age: number): void;
    retainCasualty(p: Soldier): void;
    drawCasualties(dt: number): void;
  };
  const r = Object.create(Renderer.prototype) as Harness;
  Object.assign(r, {
    app: { root, graphicsDevice: device },
    map: g.map,
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
  r.collapseSoldier(p, casualtyRules.fallSeconds);
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
  const pouch = new pc.Color().fromString("#8b8060");
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
  expect(Math.min(...points.filter((_, i) => i % 3 === 1))).toBeGreaterThan(
    0.03,
  );
  const release = vi.spyOn(first.mesh, "destroy");
  for (let i = 0; i < casualtyRules.max; i++) r.retainCasualty(p);
  expect(r.casualties).toHaveLength(casualtyRules.max);
  expect(release).toHaveBeenCalledOnce();
  expect(r.soldierStats.peakRemnants).toBe(casualtyRules.max);
  r.drawCasualties(0);
  expect(r.casualties.every((c) => c.age === 0)).toBe(true);
  expect(g.snapshot()).toEqual(before);
  g.explode({ x: 0, y: 0.025, z: 0 }, 0, "blue", {
    ...grenadeExplosionProfile,
    damage: 0,
  });
  r.drawCasualties(1);
  for (const c of r.casualties)
    expect(c.entity.getPosition().y).toBeCloseTo(groundHeight(0, 0, g.map));
  const final = vi.spyOn(r.casualties[0].mesh, "destroy");
  r.drawCasualties(30);
  expect(r.casualties).toHaveLength(0);
  expect(final).toHaveBeenCalledOnce();
  expect(r.soldierStats.expired).toBe(casualtyRules.max);
  mesh.destroy();
  device.destroy();
});
