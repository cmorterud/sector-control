import { test, expect } from "vitest";
import { tacticalRelief } from "./tactical-terrain";
import { industrialMap } from "./map";
import { trenchMap } from "./trench-map";
import { runtimeMap, deformExplosion, grenadeExplosionProfile } from "./destruction";
test("terrain overlay samples the battlefield and reflects excavation", () => {
  const map = runtimeMap(trenchMap), before = tacticalRelief(map, 80);
  const flat = tacticalRelief(industrialMap, 80);
  expect(new Set(before.pixels).size).toBeGreaterThan(new Set(flat.pixels).size);
  // Off the 2 m sample grid: dead centre, the deeper floor and steeper slope cancel in the shading.
  deformExplosion(map, {x:1.2,y:3,z:1.2}, grenadeExplosionProfile, () => 1);
  expect(tacticalRelief(map, 80).pixels).not.toEqual(before.pixels);
});
