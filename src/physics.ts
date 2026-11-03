import {
  AmmoPhysicsWorld,
  Entity,
  Quat,
  Vec3,
  BODYGROUP_STATIC,
  BODYMASK_ALL,
} from "playcanvas";
import type { TerrainGeometry } from "./terrain-geometry";
import Ammo from "sync-ammo/dist/ammo.module.js";

export function createPhysicsWorld() {
  (globalThis as unknown as { Ammo: unknown }).Ammo = Ammo;
  // A standalone Application does not run the editor's library-loading lifecycle.
  return new AmmoPhysicsWorld();
}

// Own the terrain backend so restart also releases its cached triangle data.
export class TerrainPhysics {
  world = createPhysicsWorld();
  private sequence = 0;
  private patches = new Map<
    string,
    {
      body: ReturnType<AmmoPhysicsWorld["createBody"]>;
      shape: ReturnType<AmmoPhysicsWorld["createShape"]>;
    }
  >();
  setPatch(key: string, data: TerrainGeometry, entity: Entity) {
    const old = this.patches.get(key);
    if (old) {
      this.world.removeBody(old.body);
      this.world.destroyBody(old.body);
      this.world.destroyShape(old.shape);
    }
    const shape = this.world.createShape({
      type: "mesh",
      sources: [
        {
          id: ++this.sequence,
          positions: data.positions,
          stride: 3,
          indices: data.indices,
          base: 0,
          count: data.indices.length,
          convexHull: false,
          checkDuplicates: true,
          scale: null,
          position: new Vec3(),
          rotation: new Quat(),
        },
      ],
    });
    const body = this.world.createBody({
      type: "static",
      mass: 0,
      shape,
      position: new Vec3(),
      rotation: new Quat(),
      entity,
    });
    this.world.addBody(body, BODYGROUP_STATIC, BODYMASK_ALL);
    this.patches.set(key, { body, shape });
  }
  ray(
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
  ) {
    return (
      this.world.raycastFirst(new Vec3(a.x, a.y, a.z), new Vec3(b.x, b.y, b.z))
        ?.hitFraction ?? 1
    );
  }
  destroy() {
    for (const { body, shape } of this.patches.values()) {
      this.world.removeBody(body);
      this.world.destroyBody(body);
      this.world.destroyShape(shape);
    }
    this.patches.clear();
    this.world.destroy();
  }
}
