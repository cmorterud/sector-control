import { test, expect } from "vitest";
import { tacticalRelief } from "./tactical-terrain";
import { industrialMap } from "./map";
import { trenchMap } from "./trench-map";
import { runtimeMap, deformExplosion, grenadeExplosionProfile } from "./destruction";
test("terrain overlay samples the battlefield and reflects excavation", () => {
  const map = runtimeMap(trenchMap), before = tacticalRelief(map, 80);
  const flat = tacticalRelief(industrialMap, 80);
  expect(new Set(before.pixels).size).toBeGreaterThan(new Set(flat.pixels).size);
  deformExplosion(map, {x:0,y:3,z:0}, grenadeExplosionProfile, () => 1);
  expect(tacticalRelief(map, 80).pixels).not.toEqual(before.pixels);
});
