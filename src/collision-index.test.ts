import { expect, it } from "vitest";
import { Game, TestCollision } from "./simulation";
import { trenchMap } from "./trench-map";
import { artilleryExplosionProfile } from "./destruction";
import { groundHeight, type MapDefinition } from "./map";

// Reference keeps the prior full-box scan, including the exact terrain/slab math.
function fullScan(map: MapDefinition) {
  const collision = new TestCollision(map);
  Object.defineProperty(collision, "rayBoxes", {
    value: () => collision.map.boxes,
  });
  return collision;
}
it("preserves full-scan hits for short sweeps, cell boundaries and long rays before/after a damaged bank", () => {
  const indexed = new TestCollision(trenchMap);
  const game = new Game(indexed, false, 1000, 12345, undefined, {
    map: trenchMap,
  });
  const reference = fullScan(game.map);
  let seed = 5678;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const check = () => {
    for (let i = 0; i < 1800; i++) {
      const x = i % 5 ? (random() - 0.5) * 144 : ((i % 17) - 8) * 8;
      const z = i % 7 ? (random() - 0.5) * 112 : ((i % 13) - 6) * 8;
      const a = { x, z, y: groundHeight(x, z, game.map) + random() * 3 };
      const range = i % 4 ? 1.2 : 70;
      const b = {
        x: x + (random() - 0.5) * range,
        z: z + (random() - 0.5) * range,
        y: a.y + (random() - 0.5) * 5,
      };
      expect(indexed.ray(a, b)).toBe(reference.ray(a, b));
    }
  };
  check();
  game.explode({ x: -19, z: -1, y: 2.45 }, -1, null, artilleryExplosionProfile);
  expect(game.map.destruction!.revision).toBeGreaterThan(0);
  check();
});
it("refreshes indexed cover after insertion/removal, in-place world updates and map replacement", () => {
  const map: MapDefinition = { ...trenchMap, terrain: undefined, boxes: [] };
  const indexed = new TestCollision(map);
  const a = { x: -1, y: 1, z: 0 },
    b = { x: 1, y: 1, z: 0 };
  expect(indexed.ray(a, b)).toBe(1);
  map.boxes.push({ x: 0, z: 0, w: 0.1, d: 2, h: 2, kind: "wood" });
  expect(indexed.ray(a, b)).toBeCloseTo(0.475);
  map.boxes[0].x = 30;
  indexed.updateWorld({
    geometry: true,
    revision: 1,
    kind: "artillery",
    at: a,
    crater: null,
    terrain: [],
    objects: [],
    patches: [],
  });
  expect(indexed.ray(a, b)).toBe(1);
  const c = { x: 29, y: 1, z: 0 },
    d = { x: 31, y: 1, z: 0 };
  expect(indexed.ray(c, d)).toBeCloseTo(0.475);
  map.boxes.pop();
  expect(indexed.ray(c, d)).toBe(1);
  indexed.setMap({
    ...map,
    boxes: [{ x: 0, z: 0, w: 0.1, d: 2, h: 2, kind: "wood" }],
  });
  expect(indexed.ray(a, b)).toBeCloseTo(0.475);
});

it("keeps routes identical to a fresh graph after terrain and fallen-tree changes", async () => {
  const { pathfind, idle } = await import("./simulation");
  for (const map of [
    trenchMap,
    {
      ...trenchMap,
      terrain: undefined,
      boxes: [
        { id: "tree", kind: "tree" as const, x: 0, z: 0, w: 0.8, d: 0.8, h: 5 },
      ],
    },
  ]) {
    const cached = new Game(
      new TestCollision(map),
      false,
      1000,
      12345,
      undefined,
      { map },
    );
    const fresh = new Game(
      new TestCollision(map),
      false,
      1000,
      12345,
      undefined,
      { map },
    );
    const routes = map.terrain
      ? map.terrain
          .communicationRoutes!.map((r) => [r.entrance, r.points.at(-1)!])
          .concat([
            [
              { x: -21, z: -33 },
              { x: 23, z: 31 },
            ],
            [
              { x: -30, z: -8 },
              { x: -19, z: 6 },
            ],
          ])
      : [
          [
            { x: -8, z: 0 },
            { x: 8, z: 0 },
          ],
          [
            { x: 0, z: -8 },
            { x: 0, z: 8 },
          ],
        ];
    for (const [a, b] of routes) pathfind(a, b, cached.map);
    const at = map.terrain
      ? { x: -19, y: 2.45, z: -1 }
      : { x: 0, y: 0.1, z: 1 };
    for (const g of [cached, fresh])
      g.explode(at, -1, null, artilleryExplosionProfile);
    for (const [a, b] of routes)
      expect(pathfind(a, b, cached.map)).toEqual(pathfind(a, b, fresh.map));
    // A subsequent distant blast must preserve reusable edges as well as the
    // changed bank/log paths; compare against a newly instantiated world again.
    cached.step(idle());
    cached.explode(
      { x: 25, y: 2.45, z: -25 },
      -1,
      null,
      artilleryExplosionProfile,
    );
    const rebuilt = new Game(
      new TestCollision(map),
      false,
      1000,
      12345,
      undefined,
      { map },
    );
    rebuilt.explode(at, -1, null, artilleryExplosionProfile);
    rebuilt.step(idle());
    rebuilt.explode(
      { x: 25, y: 2.45, z: -25 },
      -1,
      null,
      artilleryExplosionProfile,
    );
    for (const [a, b] of routes)
      expect(pathfind(a, b, cached.map)).toEqual(pathfind(a, b, rebuilt.map));
  }
});
