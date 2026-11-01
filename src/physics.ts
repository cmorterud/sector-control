import { AmmoPhysicsWorld } from "playcanvas";
import Ammo from "sync-ammo/dist/ammo.module.js";

export function createPhysicsWorld() {
  (globalThis as unknown as { Ammo: unknown }).Ammo = Ammo;
  // A standalone Application does not run the editor's library-loading lifecycle.
  return new AmmoPhysicsWorld();
}
