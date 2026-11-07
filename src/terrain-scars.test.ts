import { expect, it } from "vitest";
import { Entity } from "playcanvas";
import { authoredTerrainCut, groundHeight, type MapDefinition } from "./map";
import { trenchMap } from "./trench-map";
import { buildTrenchRelief, scarRubble } from "./terrain-relief";
import { TerrainPhysics } from "./physics";
import { terrainGeometry } from "./terrain-geometry";

it("bakes repeatable rotated, irregular bowls without reading prior relief or mutable world state", () => {
  const t = trenchMap.terrain!;
  expect(
    buildTrenchRelief(trenchMap, [...t.shellScars!, ...t.depressions!]),
  ).toEqual(t.relief);
  const flat: MapDefinition = {
    ...trenchMap,
    boxes: [],
    terrain: { ...t, relief: undefined, elevation: undefined },
  };
  const scar = { ...t.shellScars![0], x: 0, z: 0 };
  const map: MapDefinition = {
    ...flat,
    terrain: { ...flat.terrain!, relief: buildTrenchRelief(flat, [scar]) },
  };
  expect(authoredTerrainCut(0, 0, map)).toBeCloseTo(scar.depth, 5);
  const cuts = Array.from({ length: 16 }, (_, i) => {
    const angle = (i * Math.PI) / 8;
    return authoredTerrainCut(Math.cos(angle) * 2, Math.sin(angle) * 2, map);
  });
  expect(Math.max(...cuts) - Math.min(...cuts)).toBeGreaterThan(0.08);
  expect(
    Math.max(...cuts.slice(0, 8).map((v, i) => Math.abs(v - cuts[i + 8]))),
  ).toBeGreaterThan(0.025);
  expect(
    Object.values(map.terrain!.relief!.cuts).every(
      (v) => Number.isFinite(v) && v > 0 && v <= 0.85,
    ),
  ).toBe(true);
});

it("adds nine shallow shoulder hollows while retaining the six major bot cover anchors", () => {
  const t = trenchMap.terrain!,
    oldRelief = buildTrenchRelief(trenchMap, [
      ...t.shellScars!.slice(0, 6),
      ...t.depressions!,
    ]),
    old: MapDefinition = { ...trenchMap, terrain: { ...t, relief: oldRelief } };
  expect(t.craters).toHaveLength(6);
  expect(t.shellScars).toHaveLength(15);
  for (const pock of t.shellScars!.slice(6)) {
    expect(authoredTerrainCut(pock.x, pock.z, trenchMap)).toBeGreaterThan(
      authoredTerrainCut(pock.x, pock.z, old) + 0.08,
    );
    expect(groundHeight(pock.x, pock.z, trenchMap)).toBeLessThan(
      groundHeight(pock.x, pock.z, old) - 0.08,
    );
  }
  const pieces = t.shellScars!.slice(0, 6).flatMap(scarRubble);
  expect(pieces).toEqual(t.shellScars!.slice(0, 6).flatMap(scarRubble));
  expect(pieces).toHaveLength(30); // Same bounded presentation cost as the old rubble.
  expect(new Set(pieces.map((p) => p.w.toFixed(2))).size).toBeGreaterThan(10);
  expect(pieces.every((p) => p.h >= 0.1 && p.h <= 0.26 && p.w <= 0.6)).toBe(
    true,
  );
});

it("matches actual Ammo hits on an irregular scar and a smaller off-grid hollow", () => {
  const physics = new TerrainPhysics(),
    entities: Entity[] = [];
  try {
    for (const scar of [
      trenchMap.terrain!.shellScars![0],
      trenchMap.terrain!.shellScars![8],
    ]) {
      const x = scar.x + 0.13,
        z = scar.z + 0.27,
        key = `${Math.floor(x / 8)},${Math.floor(z / 8)}`,
        e = new Entity("churned ground");
      entities.push(e);
      physics.setPatch(key, terrainGeometry(trenchMap, key), e);
      for (const [dx, dz] of [
        [0, 0],
        [0.31, 0.13],
        [0.58, -0.17],
      ]) {
        const a = { x: x + dx, y: 6, z: z + dz },
          b = { ...a, y: -1 };
        expect(6 - physics.ray(a, b) * 7).toBeCloseTo(
          groundHeight(a.x, a.z, trenchMap),
          3,
        );
      }
    }
  } finally {
    physics.destroy();
    for (const e of entities) e.destroy();
  }
});
