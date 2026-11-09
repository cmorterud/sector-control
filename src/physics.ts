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

// Terrain changes replace geometry permanently. Own its native mesh data rather
// than putting each revision in the engine's lifetime geometry-source cache.
export class TerrainPhysics {
  world = createPhysicsWorld();
  private patches = new Map<
    string,
    {
      body: ReturnType<AmmoPhysicsWorld["createBody"]>;
      shape: object;
      triangles: object;
    }
  >();
  setPatch(key: string, data: TerrainGeometry, entity: Entity) {
    const old = this.patches.get(key);
    if (old) {
      this.world.removeBody(old.body);
      this.world.destroyBody(old.body);
      Ammo.destroy(old.shape);
      Ammo.destroy(old.triangles);
    }
    const triangles = new Ammo.btTriangleMesh();
    const point = new Ammo.btVector3();
    const vertices = new Map<string, number>();
    const indices: number[] = [];
    try {
      for (let i = 0; i < data.positions.length; i += 3) {
        const x = data.positions[i],
          y = data.positions[i + 1],
          z = data.positions[i + 2];
        const key = `${x}:${y}:${z}`;
        let index = vertices.get(key);
        if (index === undefined) {
          point.setValue(x, y, z);
          index = triangles.findOrAddVertex(point, false) as number;
          vertices.set(key, index);
        }
        indices.push(index);
      }
      triangles.getIndexedMeshArray().at(0).m_numTriangles =
        data.indices.length / 3;
      for (const index of data.indices) triangles.addIndex(indices[index]);
    } finally {
      Ammo.destroy(point);
    }
    const shape = new Ammo.btBvhTriangleMeshShape(triangles, true);
    const body = this.world.createBody({
      type: "static",
      mass: 0,
      shape,
      position: new Vec3(),
      rotation: new Quat(),
      entity,
    });
    this.world.addBody(body, BODYGROUP_STATIC, BODYMASK_ALL);
    this.patches.set(key, { body, shape, triangles });
  }
  ray(
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
  ) {
    return (
      this.world.raycastFirst(new Vec3(a.x, a.y, a.z), new Vec3(b.x, b.y, b.z), { filterCollisionMask: BODYGROUP_STATIC })
        ?.hitFraction ?? 1
    );
  }
  destroy() {
    for (const { body, shape, triangles } of this.patches.values()) {
      this.world.removeBody(body);
      this.world.destroyBody(body);
      Ammo.destroy(shape);
      Ammo.destroy(triangles);
    }
    this.patches.clear();
    this.world.destroy();
  }
}
