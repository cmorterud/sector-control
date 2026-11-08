import { expect, it } from "vitest";
import { trenchMap } from "./trench-map";
import { buildLandmarks, isStructure } from "./landmarks";
import {
  blocked,
  moveOnMap,
  groundHeight,
  industrialMap,
  type MapDefinition,
} from "./map";
import { Game, TestCollision, idle } from "./simulation";
import {
  grenadeExplosionProfile,
  artilleryExplosionProfile,
} from "./destruction";
import { PlaytestLog } from "./playtest";

it("gives each flag a named, distinct destructible neighborhood without obstructing any flag or firing post", () => {
  expect(trenchMap.landmarks!.map((l) => l.name)).toEqual([
    "Farmhouse",
    "Shattered Wood",
    "Gun Pit",
    "Broken Bunker",
  ]);
  expect(trenchMap.boxes.some((b) => b.kind === "gun")).toBe(true);
  for (const sector of trenchMap.sectors) {
    expect(sector.name).toBe(
      trenchMap.landmarks!.find((l) => l.id === sector.id)!.name,
    );
    expect(blocked(sector.x, sector.z, 0.6, trenchMap)).toBe(false);
  }
  for (const post of trenchMap.terrain!.firingPositions!)
    expect(blocked(post.x, post.z, 0.6, trenchMap)).toBe(false);
  for (const l of trenchMap.landmarks!)
    expect(
      trenchMap.boxes.filter((b) => b.landmark === l.id).length,
    ).toBeGreaterThanOrEqual(5);
  // Regenerating authored dressing uses no simulation randomness or source edits.
  const base = {
    ...trenchMap,
    boxes: trenchMap.boxes.filter((b) => !b.landmark),
  };
  expect(buildLandmarks(base)).toEqual(buildLandmarks(base));
  expect(industrialMap.landmarks).toBeUndefined();
});
const wallMap: MapDefinition = {
  ...industrialMap,
  boxes: [
    {
      id: "landmark-A-wall",
      landmark: "A",
      kind: "masonry",
      x: 0,
      z: 0,
      w: 0.4,
      d: 3,
      h: 2.8,
    },
  ],
  sectors: [],
};
const blast = {
  ...grenadeExplosionProfile,
  radius: 0,
  craterRadius: 0,
  craterDepth: 0,
  terrainReach: 0,
};
const scene = () =>
  new Game(new TestCollision(wallMap), false, 1000, 12345, undefined, {
    map: wallMap,
  });
it("breaks a wall in stages and replaces its high collider with persistent low shootable cover", () => {
  const g = scene(),
    p = { x: -0.5, y: 0.8, z: 0 };
  const ray = (y: number) =>
    g.collision.ray({ x: -2, y, z: 0 }, { x: 2, y, z: 0 });
  expect(ray(2.3)).toBeLessThan(1);
  g.explode(p, -1, null, blast);
  expect(g.map.destruction!.objects["landmark-A-wall"].stage).toBe(1);
  expect(ray(2.3)).toBe(1);
  expect(ray(1.2)).toBeLessThan(1);
  g.explode(p, -1, null, blast);
  expect(g.map.destruction!.objects["landmark-A-wall"].stage).toBe(2);
  const rubble = g.map.boxes.filter((b) => b.kind === "rubble");
  expect(rubble).toHaveLength(2);
  expect(
    rubble.every(
      (b) =>
        b.h < 1 &&
        Math.abs((b.baseY ?? 0) - groundHeight(b.x, b.z, g.map)) < 0.05,
    ),
  ).toBe(true);
  expect(ray(0.3)).toBeLessThan(1);
  expect(ray(1.2)).toBe(1);
  expect(blocked(0, 0, 0.4, g.map)).toBe(true);
  const log = new PlaytestLog();
  log.events.push(...g.events);
  expect(log.summary().structuresCollapsed).toBe(1);
  for (let i = 0; i < 3; i++)
    g.explode({ x: 0, y: 1.3, z: 0 }, -1, null, {
      ...blast,
      structuralDamage: 1000,
    });
  expect(g.map.boxes.filter((b) => b.kind === "rubble")).toHaveLength(0);
  expect(
    Object.keys(g.map.destruction!.objects).filter((id) =>
      id.startsWith("rubble-"),
    ),
  ).toHaveLength(2);
  expect(scene().map.destruction!.objects["landmark-A-wall"].stage).toBe(0);
});
it("collapses unsupported structures when unoccluded excavation removes their footing, even without structural blast damage", () => {
  // Isolate footing failure from structural shielding: the ordinary collision
  // regression above separately exercises physical wall/rubble obstruction.
  const g = new Game(
    { move: (p) => p, ray: () => 1 },
    false,
    1000,
    12345,
    undefined,
    { map: wallMap },
  );
  g.explode({ x: 0, y: 0.02, z: 0 }, -1, null, {
    ...artilleryExplosionProfile,
    radius: 0,
    structuralDamage: 0,
    craterRadius: 4,
    terrainReach: 5,
  });
  const changes = g.events.filter((e) => e.type === "destruction");
  expect(changes.flatMap((e) => e.change.collapses ?? [])).toContain(
    "landmark-A-wall",
  );
  expect(g.map.boxes.some((b) => b.id === "landmark-A-wall")).toBe(false);
  expect(
    g.map.boxes
      .filter((b) => b.kind === "rubble")
      .every((b) => (b.baseY ?? 0) < 0),
  ).toBe(true);
});
it("keeps concrete tougher than brick and records structural damage alongside ordinary terrain destruction", () => {
  const g = new Game(
    new TestCollision(trenchMap),
    false,
    1000,
    12345,
    undefined,
    { map: trenchMap },
  );
  const wall = Object.values(g.map.destruction!.objects).find(
    (o) => o.original.kind === "masonry",
  )!;
  const concrete = Object.values(g.map.destruction!.objects).find(
    (o) => o.original.kind === "concrete",
  )!;
  expect(concrete.maxHp).toBeGreaterThan(wall.maxHp);
  expect(isStructure(concrete.original)).toBe(true);
  const b = wall.original;
  g.explode(
    { x: b.x - b.w / 2 - 0.15, y: (b.baseY ?? 0) + 0.5, z: b.z },
    -1,
    null,
    artilleryExplosionProfile,
  );
  expect(
    g.events.some(
      (e) =>
        e.type === "destruction" &&
        (e.change.collapses ?? []).includes(wall.id),
    ),
  ).toBe(true);
  expect(g.map.destruction!.terrainRevision).toBeGreaterThan(0);
  for (let i = 0; i < 10; i++) g.step(idle());
  expect(g.players[0].hp).toBe(100);
});

it("lets soldiers walk and fire beneath solid roofs, then drops the roof when supports fail", () => {
  const map: MapDefinition = {
    ...industrialMap,
    sectors: [],
    boxes: [
      {
        id: "landmark-D-support-1",
        landmark: "D",
        kind: "concrete",
        x: -2,
        z: 0,
        w: 0.5,
        d: 0.5,
        h: 2.5,
      },
      {
        id: "landmark-D-support-2",
        landmark: "D",
        kind: "concrete",
        x: 2,
        z: 0,
        w: 0.5,
        d: 0.5,
        h: 2.5,
      },
      {
        id: "landmark-D-roof",
        landmark: "D",
        kind: "concrete",
        x: 0,
        z: 0,
        w: 5,
        d: 3,
        h: 0.4,
        baseY: 2.45,
        supports: ["landmark-D-support-1", "landmark-D-support-2"],
      },
    ],
  };
  const g = new Game(new TestCollision(map), false, 1000, 12345, undefined, {
    map,
  });
  const r = g.collision;
  expect(blocked(0, 0, 0.5, g.map)).toBe(false);
  expect(
    moveOnMap({ x: 0, y: 0, z: -2 }, { x: 0, z: 1.5 }, g.map).z,
  ).toBeCloseTo(-0.5);
  expect(r.move({ x: 0, z: -2 }, { x: 0, z: 1.5 })).toEqual({ x: 0, z: -0.5 });
  expect(r.ray({ x: 0, y: 1.5, z: -2 }, { x: 0, y: 1.5, z: 2 })).toBe(1);
  expect(r.ray({ x: 0, y: 5, z: 0 }, { x: 0, y: 0, z: 0 })).toBeLessThan(1);
  g.explode({ x: -2, y: 0.5, z: -0.5 }, -1, null, {
    ...blast,
    structuralDamage: 1000,
    structuralRadius: 1,
  });
  expect(g.map.destruction!.objects["landmark-D-support-1"].stage).toBe(2);
  expect(g.map.destruction!.objects["landmark-D-roof"].stage).toBe(2);
  expect(g.map.boxes.some((b) => b.id === "landmark-D-roof")).toBe(false);
  expect(r.ray({ x: 0, y: 5, z: 0 }, { x: 0, y: 1.3, z: 0 })).toBe(1);
  expect(
    g.events.some(
      (e) =>
        e.type === "destruction" &&
        e.change.collapses?.includes("landmark-D-roof"),
    ),
  ).toBe(true);
});
