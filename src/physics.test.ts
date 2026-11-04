import { it, expect } from "vitest";
import { Entity, Quat, Vec3, BODYGROUP_STATIC, BODYMASK_ALL } from "playcanvas";
import { createPhysicsWorld } from "./physics";
import { Game, idle } from "./simulation";

it("initializes real Ammo wall raycasts and stops a traveling round without stepping physics", () => {
  const world = createPhysicsWorld();
  const wall = new Entity("thin wall");
  const shape = world.createShape({
    type: "box",
    halfExtents: new Vec3(2, 2, 0.05),
  });
  const body = world.createBody({
    type: "static",
    mass: 0,
    shape,
    position: new Vec3(0, 2, 0),
    rotation: new Quat(),
    entity: wall,
  });
  world.addBody(body, BODYGROUP_STATIC, BODYMASK_ALL);
  try {
    const hit = world.raycastFirst(new Vec3(0, 1.45, 2), new Vec3(0, 1.45, -2));
    expect(hit?.entity).toBe(wall);
    expect(hit?.point.z).toBeCloseTo(0.05, 3);
    expect(
      world.raycastFirst(new Vec3(0, 5, 2), new Vec3(0, 5, -2)),
    ).toBeNull();
    const game = new Game(
      {
        move: (p) => p,
        ray: (a, b) =>
          world.raycastFirst(new Vec3(a.x, a.y, a.z), new Vec3(b.x, b.y, b.z))
            ?.hitFraction ?? 1,
      },
      false,
    );
    Object.assign(game.players[0], { x: 0, z: 5 });
    game.fire(game.players[0]);
    expect(game.projectiles).toHaveLength(1);
    let wallImpact = false;
    for (let i = 0; i < 20; i++) {
      game.step(idle());
      for (const event of game.events)
        if (event.type === "impact" && event.target === null) {
          expect(event.at.z).toBeCloseTo(0.05, 3);
          wallImpact = true;
        }
    }
    expect(wallImpact).toBe(true);
    expect(game.projectiles).toHaveLength(0);
    // Grenade shell sweeps must also catch this 10 cm Ammo wall.
    game.step({ ...idle(), grenade: true, pitch: -1 });
    const grenade = game.grenades[0];
    for (let i = 0; i < 10; i++) game.step(idle());
    expect(grenade.z).toBeGreaterThan(0.17);
    expect(grenade.vz).toBeGreaterThan(0);
    let explosions = 0;
    for (let i = 0; i < 80; i++) {
      game.step(idle());
      explosions += game.events.filter(
        (e) => e.type === "grenadeExplosion",
      ).length;
    }
    expect(explosions).toBe(1);
    expect(game.grenades).toHaveLength(0);
  } finally {
    world.removeBody(body);
    world.destroyBody(body);
    world.destroyShape(shape);
    world.destroy();
    wall.destroy();
  }
});

it("uses real Ammo earth banks for trench protection, firing steps, ramps, and mantling", async () => {
  const { trenchMap } = await import("./trench-map");
  const { moveOnMap, groundHeight } = await import("./map");
  const world = createPhysicsWorld();
  const bodies: ReturnType<typeof world.createBody>[] = [];
  const shapes: ReturnType<typeof world.createShape>[] = [];
  const entities: Entity[] = [];
  const addBox = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    angle = 0,
  ) => {
    const entity = new Entity("trench earth");
    const shape = world.createShape({
      type: "box",
      halfExtents: new Vec3(w / 2, h / 2, d / 2),
    });
    const body = world.createBody({
      type: "static",
      mass: 0,
      shape,
      position: new Vec3(x, y, z),
      rotation: new Quat().setFromEulerAngles(0, 0, angle),
      entity,
    });
    world.addBody(body, BODYGROUP_STATIC, BODYMASK_ALL);
    bodies.push(body);
    shapes.push(shape);
    entities.push(entity);
  };
  try {
    addBox(0, -0.3, 0, trenchMap.width, 0.6, trenchMap.depth);
    for (const p of trenchMap.terrain!.rectangles)
      addBox(p.x, p.h / 2, p.z, p.w, p.h, p.d);
    for (const r of trenchMap.terrain!.ramps) {
      const angle = Math.atan2(r.high - r.low, r.w);
      addBox(
        r.x,
        (r.low + r.high) / 2 - 0.1 / Math.cos(angle),
        r.z,
        Math.hypot(r.w, r.high - r.low) + 0.12,
        0.2,
        r.d,
        (r.direction * angle * 180) / Math.PI,
      );
    }
    const ray = (
      a: { x: number; y: number; z: number },
      b: { x: number; y: number; z: number },
    ) =>
      world.raycastFirst(new Vec3(a.x, a.y, a.z), new Vec3(b.x, b.y, b.z))
        ?.hitFraction ?? 1;
    for (const height of [0.6, 1.1, 1.6, 1.98])
      expect(
        ray({ x: 0, y: 3.85, z: -27 }, { x: -21, y: height, z: -27 }),
      ).toBeLessThan(1);
    expect(ray({ x: -27, y: 2.5, z: -49 }, { x: 0, y: 3.65, z: -49 })).toBe(1);
    // Opposing steps expose only the high head volume; torso and floor stay screened.
    expect(ray({ x: -19, y: 2.5, z: -1 }, { x: 19, y: 2.5, z: -1 })).toBe(1);
    expect(
      ray({ x: -19, y: 2.5, z: -1 }, { x: 19, y: 1.95, z: -1 }),
    ).toBeLessThan(1);
    expect(
      ray({ x: -19, y: 2.5, z: -1 }, { x: 23, y: 1.65, z: -1 }),
    ).toBeLessThan(1);
    for (const route of trenchMap.terrain!.communicationRoutes!)
      expect(
        ray(
          { ...route.points[0], y: 1.65 },
          { ...route.points.at(-1)!, y: 1.65 },
        ),
      ).toBeLessThan(1);
    const rampHit = world.raycastFirst(
      new Vec3(-45, 5, -1),
      new Vec3(-45, -1, -1),
    );
    expect(rampHit?.point.y).toBeCloseTo(1.2, 2);
    const game = new Game(
      { ray, move: (p, d) => moveOnMap(p, d, trenchMap) },
      false,
      300,
      12345,
      undefined,
      { map: trenchMap },
    );
    expect(
      ray({ x: 24, y: 0.1, z: -1 }, { x: 24, y: -0.1, z: -1 }),
    ).toBeLessThan(1);
    Object.assign(game.players[0], { x: -18.5, y: 0, z: -27 });
    game.step({ ...idle(), yaw: Math.PI / 2, mantle: true });
    expect(game.players[0].mantle).not.toBeNull();
    while (game.players[0].mantle) game.step(idle());
    expect(game.players[0].mantle).toBeNull();
    expect(game.players[0].y).toBeCloseTo(2.4);
    Object.assign(game.players[0], { x: -18, y: 0.85, z: -1 });
    game.botSettings.engagementRange = 0;
    const target = {
      ...game.players[0],
      id: 1,
      team: "red" as const,
      x: 23,
      y: 0,
      nextThink: 1e9,
      protectedUntil: 0,
    };
    game.players.push(target);
    game.step({ ...idle(), yaw: Math.PI / 2, grenade: true });
    for (let i = 0; i < 89; i++) {
      game.step(idle());
      const grenade = game.grenades[0];
      expect(grenade.y, JSON.stringify(grenade)).toBeGreaterThanOrEqual(
        groundHeight(grenade.x, grenade.z, trenchMap) + 0.11,
      );
    }
    game.step(idle());
    expect(target.hp).toBeLessThan(100);
    expect(game.events.some((e) => e.type === "grenadeExplosion")).toBe(true);
  } finally {
    for (const body of bodies) {
      world.removeBody(body);
      world.destroyBody(body);
    }
    for (const shape of shapes) world.destroyShape(shape);
    world.destroy();
    for (const entity of entities) entity.destroy();
  }
});
