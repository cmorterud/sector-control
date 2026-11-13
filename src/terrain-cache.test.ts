import {expect, test} from "vitest";
import {terrainGeometry, TerrainGeometryCache} from "./terrain-geometry";
import {Game, TestCollision} from "./simulation";
import {trenchMap} from "./trench-map";
import {verdunMap} from "./verdun-map";
import {groundHeight, industrialMap} from "./map";
import {runtimeMap} from "./destruction";
import {Renderer} from "./rendering";
import {artilleryExplosionProfile} from "./destruction";

for (const map of [trenchMap, verdunMap]) test(`${map.id} cached cells match cold geometry after overlapping blasts and revision gaps`, () => {
  const g = new Game(new TestCollision(map), false, 10000, 12345, undefined, {map, ambientArtillery:false});
  const cache = new TerrainGeometryCache(g.map, 4);
  for (const key of ["-1,-1", "0,0", "-3,-5"]) expect(cache.build(key)).toEqual(terrainGeometry(g.map,key));
  for (let i=0;i<5;i++) {
    const x=-2+i, z=map.id === "verdun" ? -31 : -35;
    g.explode({x,z,y:groundHeight(x,z,g.map)+.02}, -1, null, {...artilleryExplosionProfile, damage:0});
    for (const event of g.events) if (event.type === "destruction") {
      // Omit one notification to exercise safe cold fallback.
      if (i !== 2) cache.invalidate(event.change);
      for (const key of event.change.patches) expect(cache.build(key)).toEqual(terrainGeometry(g.map,key));
    }
    g.events=[];
  }
  expect((cache as any).patches.size).toBeLessThanOrEqual(4);
});

test("same-map fresh starts discard the previous runtime geometry cache", () => {
  const map = runtimeMap(industrialMap), fresh = runtimeMap(industrialMap);
  const r = Object.assign(Object.create(Renderer.prototype), {map, terrainGeometryCache:new TerrainGeometryCache(map)});
  r.setMap(fresh);
  expect(r.map).toBe(fresh);
  expect(r.terrainGeometryCache).toBeUndefined();
});
