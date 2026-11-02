import { describe, it, expect } from "vitest";
import { blocked, dist, groundHeight, moveOnMap, walkSegment } from "./map";
import { trenchMap } from "./trench-map";
import {
  Game,
  pathfind,
  TestCollision,
  botCommand,
  mantlePosition,
} from "./simulation";

const createGame = (seconds = 60) =>
  new Game(new TestCollision(trenchMap), true, seconds * 30, 12345, undefined, {
    map: trenchMap,
    teamSize: 25,
  });

describe("trench prototype", () => {
  it("spawns 25 soldiers on each side in clear rear assembly areas", () => {
    const game = createGame();
    expect(game.players).toHaveLength(50);
    expect(game.snapshot()).toMatchObject({ mapId: "trenches", teamSize: 25 });
    for (const team of ["blue", "red"]) {
      const soldiers = game.players.filter((p) => p.team === team);
      expect(soldiers).toHaveLength(25);
      expect(new Set(soldiers.map((p) => p.teamIndex)).size).toBe(25);
      expect(new Set(soldiers.map((p) => `${p.x},${p.z}`)).size).toBe(25);
      for (const p of soldiers) {
        expect(p.y).toBe(0);
        expect(blocked(p.x, p.z, 0.7, trenchMap)).toBe(false);
      }
    }
  });

  it("connects every spawn to every objective with traversable waypoints", () => {
    const game = createGame();
    for (const p of game.players)
      for (const sector of trenchMap.sectors) {
        const path = pathfind(p, sector, trenchMap);
        expect(path.length, `${p.id} -> ${sector.id}`).toBeGreaterThan(0);
        let previous = p;
        for (const waypoint of path) {
          expect(walkSegment(previous, waypoint, trenchMap)).toBe(true);
          previous = { ...p, ...waypoint };
        }
        expect(dist(path.at(-1)!, sector)).toBe(0);
      }
  });

  it("keeps all six communication-trench junctions clear of timber panels and posts", () => {
    const walls = trenchMap.terrain!.lining;
    expect(walls.length).toBeGreaterThan(0);
    for (const side of [-1, 1])
      for (const z of [-33, -1, 31])
        for (const offset of [-2, 0, 2]) {
          expect(
            walkSegment(
              { x: side * 49, z: z + offset },
              { x: side * 19, z: z + offset },
              trenchMap,
            ),
          ).toBe(true);
          for (const wall of walls)
            if (Math.abs(wall.x) >= 19 && Math.abs(wall.x) <= 49)
              expect(Math.abs(wall.z - z - offset)).toBeGreaterThanOrEqual(
                wall.d / 2 + 0.15,
              );
        }
    // Real lined earth faces still stop walking; junctions need no invisible wall.
    const stopped = moveOnMap({ x: -31, z: -49 }, { x: -3, z: 0 }, trenchMap);
    expect(stopped.x).toBeGreaterThanOrEqual(-32.01);
  });

  it("blocks walking up banks but follows ramps and follows their continuous slope", () => {
    expect(groundHeight(-21, -33, trenchMap)).toBe(0);
    expect(groundHeight(0, -32, trenchMap)).toBeCloseTo(2.4);
    const stopped = moveOnMap({ x: -21, z: -30 }, { x: 10, z: 0 }, trenchMap);
    expect(stopped.x).toBeLessThan(-17.9);
    const ramp = moveOnMap({ x: -21, z: -33 }, { x: 12, z: 0 }, trenchMap);
    expect(ramp.x).toBeCloseTo(-9);
    expect(groundHeight(ramp.x, ramp.z, trenchMap)).toBeCloseTo(2.4);
    expect(groundHeight(-14, -33, trenchMap)).toBeCloseTo(1.2);
    const back = moveOnMap(ramp, { x: -12, z: 0 }, trenchMap);
    expect(back.x).toBeCloseTo(-21);
    expect(groundHeight(back.x, back.z, trenchMap)).toBe(0);
    expect(groundHeight(-27, -49, trenchMap)).toBeCloseTo(1.05);
    expect(walkSegment({ x: -30, z: -49 }, { x: -27, z: -49 }, trenchMap)).toBe(
      true,
    );
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
      enemy = game.players[25];
    for (const q of game.players) q.hp = 0;
    Object.assign(p, { x: -21, y: 0, z: -27, hp: 100, target: -1 });
    Object.assign(enemy, { x: 0, y: 2.4, z: -27, hp: 100 });
    game.tick = 1;
    botCommand(game, p);
    expect(p.target).toBe(-1);
    Object.assign(p, { x: -27, y: 1.05, z: -49 });
    Object.assign(enemy, { x: 0, y: 2.4, z: -49 });
    expect(
      collision.ray(
        { x: p.x, y: p.y + 1.45, z: p.z },
        { x: enemy.x, y: enemy.y + 1.25, z: enemy.z },
      ),
    ).toBe(1);
    botCommand(game, p);
    expect(p.target).toBe(enemy.id);
  });

  it("runs a 50-soldier match with combat, objectives, valid heights, and cleanup", () => {
    const game = createGame();
    const counts: Record<string, number> = {};
    let maxProjectiles = 0;
    for (let i = 0; i < 60 * 30; i++) {
      game.step(botCommand(game, game.players[0]));
      for (const event of game.events)
        counts[event.type] = (counts[event.type] ?? 0) + 1;
      maxProjectiles = Math.max(maxProjectiles, game.projectiles.length);
      if (i % 30 === 0)
        for (const p of game.players) {
          expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
          expect(p.y).toBeCloseTo(
            p.mantle
              ? mantlePosition(p.mantle, game.tick).y
              : groundHeight(p.x, p.z, trenchMap) + (p.hop?.height ?? 0),
          );
          expect(blocked(p.x, p.z, 0.44, trenchMap)).toBe(false);
        }
    }
    expect(maxProjectiles).toBeLessThan(1000);
    expect(counts.mantle).toBeGreaterThan(0);
    expect(counts.fire).toBeGreaterThan(100);
    expect(counts.damage).toBeGreaterThan(0);
    expect(counts.death).toBeGreaterThan(0);
    expect(counts.capture).toBeGreaterThan(0);
    expect(counts.end).toBe(1);
    expect(game.projectiles).toHaveLength(0);
  }, 15000);
});
