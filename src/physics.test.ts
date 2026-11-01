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
  } finally {
    world.removeBody(body);
    world.destroyBody(body);
    world.destroyShape(shape);
    world.destroy();
    wall.destroy();
  }
});
