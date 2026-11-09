import { it, expect } from "vitest";
import { Entity, Quat, Vec3, BODYGROUP_STATIC, BODYMASK_ALL } from "playcanvas";
import { terrainGeometry, terrainPatchKeys } from "./terrain-geometry";
import { createPhysicsWorld, TerrainPhysics } from "./physics";
import { Game, idle } from "./simulation";

it("initializes real Ammo wall raycasts and stops a sight-aligned traveling round without stepping physics", () => {
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
    Object.assign(game.players[0], {
      x: 0, z: 5, command: { ...idle(), firstPerson: true, aim: true },
    });
    game.fire(game.players[0]);
    expect(game.projectiles).toHaveLength(1);
    let wallImpact = false;
    for (let i = 0; i < 20; i++) {
      game.step(idle());
      for (const event of game.events)
        if (event.type === "impact" && event.target === null) {
          expect(event.at.z).toBeCloseTo(0.05, 3);
          expect(event.at.x).toBeCloseTo(0, 3);
          expect(event.at.y).toBeCloseTo(1.65, 3);
          wallImpact = true;
        }
    }
    expect(wallImpact).toBe(true);
    expect(game.projectiles).toHaveLength(0);
    // Grenade shell sweeps must also catch this 10 cm Ammo wall.
    game.step({ ...idle(), grenade: true, pitch: 0 });
    for (let windup = 0; windup < 6; windup++) game.step({ ...idle(), yaw: game.players[0].yaw, pitch: game.players[0].pitch });
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
  const physics = new TerrainPhysics(),
    root = new Entity("rounded trench earth");
  try {
    for (const key of terrainPatchKeys(trenchMap))
      physics.setPatch(key, terrainGeometry(trenchMap, key), root);
    const ray = (
      a: { x: number; y: number; z: number },
      b: { x: number; y: number; z: number },
    ) => physics.ray(a, b);
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
    expect(
      5 - 6 * ray({ x: -43, y: 5, z: -1 }, { x: -43, y: -1, z: -1 }),
    ).toBeCloseTo(1.2, 2);
    const game = new Game(
      { ray, move: (p, d) => moveOnMap(p, d, trenchMap) },
      false,
      300,
      12345,
      undefined,
      { map: trenchMap },
    );
    expect(
      ray({ x: 21.1, y: 0.1, z: -1 }, { x: 21.1, y: -0.1, z: -1 }),
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
    game.step({ ...idle(), yaw: Math.PI / 2, pitch: 0.7, grenade: true });
    for (let windup = 0; windup < 6; windup++) game.step({ ...idle(), yaw: game.players[0].yaw, pitch: game.players[0].pitch });
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
    physics.destroy();
    root.destroy();
  }
});

it("releases replaced terrain mesh data immediately and preserves collision across repeated rebuilds", async () => {
  const { default: Ammo } = await import("sync-ammo/dist/ammo.module.js");
  const { vi } = await import("vitest");
  const physics = new TerrainPhysics(),
    root = new Entity("rebuild lifecycle");
  const release = vi.spyOn(Ammo, "destroy");
  try {
    for (let i = 0; i < 80; i++) {
      const y = (i % 5) * 0.2;
      const old = (
        physics as unknown as {
          patches: Map<string, { shape: object; triangles: object }>;
        }
      ).patches.get("0,0");
      physics.setPatch(
        "0,0",
        {
          positions: [0, y, 0, 4, y, 0, 4, y, 4, 0, y, 4],
          indices: [0, 2, 1, 0, 3, 2],
          colors: [],
          uvs: [],
        },
        root,
      );
      if (old) {
        expect(release).toHaveBeenCalledWith(old.shape);
        expect(release).toHaveBeenCalledWith(old.triangles);
      }
      expect(
        physics.ray({ x: 2, y: 2, z: 2 }, { x: 2, y: -2, z: 2 }),
      ).toBeCloseTo((2 - y) / 4, 5);
    }
    // Engine source caching must stay unused: changing shapes have explicit lifetimes.
    expect(physics.world._triMeshCache.size).toBe(0);
    const current = (
      physics as unknown as {
        patches: Map<string, { shape: object; triangles: object }>;
      }
    ).patches.get("0,0")!;
    physics.destroy();
    expect(release).toHaveBeenCalledWith(current.shape);
    expect(release).toHaveBeenCalledWith(current.triangles);
  } finally {
    release.mockRestore();
    root.destroy();
  }
});

it("clears either front parapet from the firing step at a level look, while crouching and floor throws still hit earth", async () => {
  const { trenchMap } = await import("./trench-map");
  const { groundHeight } = await import("./map");
  const physics = new TerrainPhysics(), root = new Entity("grenade step clearance");
  try {
    for (const key of terrainPatchKeys(trenchMap)) physics.setPatch(key, terrainGeometry(trenchMap, key), root);
    for (const side of [-1, 1]) for (const stance of ["step", "crouch", "floor"]) {
      const g = new Game({ ray: (a, b) => physics.ray(a, b), move: p => p }, false, 600, 12345,
        { engagementRange: 0 }, { map: trenchMap, ambientArtillery: false, assaults: false });
      const p = g.players[0], yaw = -side * Math.PI / 2;
      Object.assign(p, { x: side * (stance === "floor" ? 21 : 19), z: -1 });
      p.y = groundHeight(p.x, p.z, g.map);
      const c = { ...idle(), yaw, crouch: stance === "crouch" };
      g.step({ ...c, grenade: true });
      for (let i = 0; i < 6; i++) g.step({ ...c });
      expect(g.grenades).toHaveLength(1);
      const grenade = g.grenades[0]; let bounced = false, lipBounce = false;
      for (let i = 0; i < 12; i++) {
        g.step({ ...c });
        const contact = g.events.some(e => e.type === "grenadeBounce");
        bounced ||= contact;
        if (i < 5) lipBounce ||= contact;
        expect(grenade.y).toBeGreaterThanOrEqual(groundHeight(grenade.x, grenade.z, g.map) + 0.11);
      }
      if (stance === "step") {
        expect(lipBounce, `${side}/${stance}`).toBe(false);
        expect(Math.abs(grenade.x)).toBeLessThan(14);
      } else {
        expect(bounced, `${side}/${stance}`).toBe(true);
        expect(Math.abs(grenade.x)).toBeGreaterThan(17);
      }
    }
  } finally { physics.destroy(); root.destroy(); }
});
