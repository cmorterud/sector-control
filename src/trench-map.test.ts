import { describe, it, expect } from "vitest";
import {
  blocked,
  dist,
  groundHeight,
  groundElevation,
  moveOnMap,
  walkSegment,
} from "./map";
import { trenchMap } from "./trench-map";
import {
  Game,
  pathfind,
  TestCollision,
  botCommand,
  mantlePosition,
  firingPosition,
  rifleHeight,
  resolveTeamSize,
} from "./simulation";

const createGame = (seconds = 60) =>
  new Game(new TestCollision(trenchMap), true, seconds * 30, 12345, undefined, {
    map: trenchMap,
    teamSize: 50,
    assaults: false,
  });

describe("trench prototype", () => {
  it("spawns 50 soldiers on each side in clear ground behind their first trench, spread along the front", () => {
    const game = createGame();
    expect(game.players).toHaveLength(100);
    expect(game.snapshot()).toMatchObject({ mapId: "trenches", teamSize: 50 });
    for (const team of ["blue", "red"]) {
      const soldiers = game.players.filter((p) => p.team === team);
      expect(soldiers).toHaveLength(50);
      expect(new Set(soldiers.map((p) => p.teamIndex)).size).toBe(50);
      expect(new Set(soldiers.map((p) => `${p.x},${p.z}`)).size).toBe(50);
      // One line from flank to flank, not a block round the spawn point.
      const zs = soldiers.map((p) => p.z).sort((a, b) => a - b);
      expect(zs.at(-1)! - zs[0]).toBeGreaterThan(120);
      for (let i = 1; i < zs.length; i++) expect(zs[i] - zs[i - 1]).toBeLessThan(6);
      for (const p of soldiers) {
        expect(p.y).toBeCloseTo(groundHeight(p.x, p.z, trenchMap));
        expect(p.y).toBeGreaterThan(1.5);
        expect(Math.abs(p.x)).toBeGreaterThan(50);
        expect(p.team === "blue" ? p.x < 0 : p.x > 0).toBe(true);
        expect(blocked(p.x, p.z, 0.5, trenchMap)).toBe(false);
        for (const s of trenchMap.sectors) expect(dist(p, s)).toBeGreaterThan(8);
        for (const q of soldiers) if (q !== p) expect(dist(p, q)).toBeGreaterThan(1.3);
      }
    }
  });

  it("connects every spawn to its own firing station inside the front trench", () => {
    const game = createGame();
    for (const p of game.players) {
      const station = firingPosition(game, p)!;
      const path = pathfind(p, station, game.map);
      expect(path.length, `soldier ${p.id}`).toBeGreaterThan(0);
      expect(groundHeight(station.x, station.z, trenchMap)).toBeCloseTo(0.85);
      let previous = p;
      for (const waypoint of path) {
        expect(walkSegment(previous, waypoint, game.map)).toBe(true);
        previous = { ...p, ...waypoint };
      }
      expect(dist(path.at(-1)!, station)).toBe(0);
    }
  });

  it("walks all one hundred soldiers to their distinct posts through the asymmetric bends", () => {
    const game = createGame(60);
    game.botSettings.engagementRange = 0;
    game.artillery.enabled = false;
    for (let i = 0; i < 30 * 30; i++)
      game.step(botCommand(game, game.players[0]));
    for (const p of game.players) {
      expect(dist(p, firingPosition(game, p)!), `soldier ${p.id}`).toBeLessThan(
        1,
      );
      expect(p.y).toBeCloseTo(0.85);
    }
  });

  it("authors different opposing front lines with varying sections and compact, screened communication paths", () => {
    const game = createGame(),
      map = game.map;
    const fronts = map.terrain!.trenchLines!.filter((l) => l.role === "front");
    expect(fronts).toHaveLength(2);
    expect(fronts[0].sections).toHaveLength(7);
    expect(fronts[1].sections).toHaveLength(8);
    expect(
      new Set(fronts.flatMap((l) => l.sections.map((s) => s.length))).size,
    ).toBeGreaterThan(3);
    expect(fronts[1].sections).not.toEqual(
      fronts[0].sections.map((s) => ({ ...s, x: -s.x })),
    );
    for (const route of map.terrain!.communicationRoutes!) {
      const a = route.points[0],
        b = route.points.at(-1)!;
      expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(16);
      expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(20);
      for (let i = 1; i < route.points.length; i++) {
        const a = route.points[i - 1],
          b = route.points[i],
          length = dist(a, b);
        for (const offset of [-0.5, 0, 0.5]) {
          const dx = (-(b.z - a.z) / length) * offset,
            dz = ((b.x - a.x) / length) * offset;
          expect(
            walkSegment(
              { x: a.x + dx, z: a.z + dz },
              { x: b.x + dx, z: b.z + dz },
              map,
            ),
          ).toBe(true);
        }
      }
      for (const offset of [-0.5, 0, 0.5])
        expect(
          game.collision.ray(
            { ...a, z: a.z + offset, y: 1.65 },
            { ...b, z: b.z + offset, y: 1.65 },
          ),
        ).toBeLessThan(1);
      expect(walkSegment(a, b, map)).toBe(false);
    }
    // Away from communication routes, front and rear remain separated by earth.
    for (let z = -53; z <= 53; z += 2) {
      if (
        map.terrain!.branchRoutes?.some(
          (r) =>
            z >= Math.min(...r.points.map((p) => p.z)) - 3 &&
            z <= Math.max(...r.points.map((p) => p.z)) + 3,
        ) ||
        map.terrain!.shelterBays?.some((b) => Math.abs(b.z - z) < 4) ||
        map.terrain!.communicationRoutes!.some(
          (r) => Math.abs(r.entrance.z - z) < 8,
        )
      )
        continue;
      let bands = 0,
        inside = false;
      for (let x = -77; x <= 77; x += 0.5) {
        const dug = groundHeight(x, z, map) - groundElevation(x, z, map) < 1.5;
        if (dug && !inside) bands++;
        inside = dug;
      }
      expect(bands, `cross-section ${z}`).toBe(4);
    }
  });

  it("keeps every firing-step parapet closed with protected floor positions and no center entrances", () => {
    const game = createGame(),
      map = game.map;
    for (const station of map.terrain!.firingPositions!) {
      const side = station.team === "blue" ? -1 : 1;
      const floor = { x: station.x + side * 2, z: station.z };
      expect(groundHeight(floor.x, floor.z, map)).toBe(0);
      const stopped = moveOnMap(floor, { x: -side * 14, z: 0 }, map);
      // Setbacks can now drop into their adjacent elbow, but the front bank stays sealed.
      expect(groundHeight(stopped.x, stopped.z, map)).toBeLessThan(1.2);
      expect(Math.abs(stopped.x)).toBeGreaterThanOrEqual(17.8);
      expect(walkSegment(floor, { x: side * 10, z: station.z }, map)).toBe(
        false,
      );
      expect(
        groundHeight(side * 14, station.z, map) -
          groundElevation(side * 14, station.z, map),
      ).toBeCloseTo(2.4);
      for (const height of [0.6, 1.1, 1.6, 1.98])
        expect(
          game.collision.ray(
            { x: 0, y: 2.5, z: station.z },
            { ...floor, y: height },
          ),
        ).toBeLessThan(1);
      expect(
        game.collision.ray(
          { ...station, y: 2.5 },
          { x: side * 14, y: 2.5, z: station.z },
        ),
      ).toBe(1);
    }
    expect(
      map
        .terrain!.ramps.filter((r) => r.high === 2.4)
        .every((r) => Math.abs(r.x) > 40),
    ).toBe(true);
    const entry = map.terrain!.ramps.find((r) => r.high === 2.4 && r.z === -1)!;
    expect(groundHeight(entry.x, entry.z, map)).toBeCloseTo(1.2);
  });

  it("occludes low trench rays with earth while allowing shots above the bank", () => {
    const collision = new TestCollision(trenchMap);
    expect(
      collision.ray({ x: -21, y: 1, z: -33 }, { x: 0, y: 1, z: -33 }),
    ).toBeLessThan(1);
    expect(
      collision.ray({ x: -21, y: 3, z: -33 }, { x: 0, y: 3, z: -33 }),
    ).toBe(1);
  });

  it("protects a standing soldier in the center while exposing the raised firing step", () => {
    const collision = new TestCollision(trenchMap);
    for (const height of [0.6, 1.1, 1.6, 1.98])
      expect(
        collision.ray({ x: 0, y: 3.85, z: -27 }, { x: -21, y: height, z: -27 }),
      ).toBeLessThan(1);
    const game = createGame();
    const p = game.players[1],
      enemy = game.players.find((q) => q.team === "red")!;
    for (const q of game.players) q.hp = 0;
    Object.assign(p, { x: -21, y: 0, z: -27, hp: 100, target: -1 });
    Object.assign(enemy, { x: 0, y: 2.4, z: -27, hp: 100 });
    game.tick = 1;
    botCommand(game, p);
    expect(p.target).toBe(-1);
    Object.assign(p, { x: -27, y: 0.85, z: -49 });
    Object.assign(enemy, { x: 0, y: 2.4, z: -49 });
    expect(
      collision.ray(
        { x: p.x, y: p.y + rifleHeight(trenchMap), z: p.z },
        { x: enemy.x, y: enemy.y + 1.25, z: enemy.z },
      ),
    ).toBe(1);
    p.awareness.nextLook = game.tick;
    botCommand(game, p);
    expect(p.target).toBe(enemy.id);
  });

  it("runs a 100-soldier match with combat from its own firing steps, valid heights, and cleanup", () => {
    const game = createGame();
    const counts: Record<string, number> = {};
    let maxProjectiles = 0;
    const income = { blue: 0, red: 0 };
    for (let i = 0; i < 60 * 30; i++) {
      game.step(botCommand(game, game.players[0]));
      for (const event of game.events) {
        counts[event.type] = (counts[event.type] ?? 0) + 1;
        if (event.type === "score") {
          income.blue += event.held!.blue;
          income.red += event.held!.red;
          expect(event.points).toEqual(income);
        }
      }
      maxProjectiles = Math.max(maxProjectiles, game.projectiles.length);
      if (i % 30 === 0)
        for (const p of game.players) {
          expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
          if (p.fall)
            expect(p.y).toBeGreaterThanOrEqual(
              groundHeight(p.x, p.z, game.map),
            );
          else
            expect(p.y).toBeCloseTo(
              p.mantle
                ? mantlePosition(p.mantle, game.tick).y
                : groundHeight(p.x, p.z, game.map) + (p.hop?.height ?? 0),
            );
          expect(blocked(p.x, p.z, 0.44, game.map)).toBe(false);
          // Intact parapets keep teams inside. Blasts can open real passages;
          // after excavation the shared-height and collision checks above apply.
          if (!game.map.destruction!.craters.length)
            expect(p.team === "blue" ? p.x < -17.8 : p.x > 17.8).toBe(true);
        }
    }
    expect(maxProjectiles).toBeLessThan(1000);
    expect(counts.mantle ?? 0).toBe(0);
    expect(counts.fire).toBeGreaterThan(100);
    expect(counts.damage).toBeGreaterThan(0);
    expect(counts.death).toBeGreaterThan(0);
    expect(counts.capture).toBe(4);
    expect(game.sectors.every((s) => s.owner === s.home)).toBe(true);
    expect(game.scores).toEqual(income);
    expect(income.blue).toBeGreaterThan(0);
    expect(income.red).toBeGreaterThan(0);
    expect(counts.end).toBe(1);
    expect(game.projectiles).toHaveLength(0);
  }, 15000);
});
