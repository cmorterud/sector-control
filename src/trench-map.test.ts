import { describe, it, expect } from "vitest";
import { blocked, dist, groundHeight, moveOnMap, walkSegment } from "./map";
import { trenchMap } from "./trench-map";
import {
  Game,
  pathfind,
  TestCollision,
  botCommand,
  mantlePosition,
  firingPosition,
  rifleHeight,
} from "./simulation";

const createGame = (seconds = 60) =>
  new Game(new TestCollision(trenchMap), true, seconds * 30, 12345, undefined, {
    map: trenchMap,
    teamSize: 25,
    assaults: false,
  });

describe("trench prototype", () => {
  it("spawns 25 soldiers on each side in clear ground behind their first trench", () => {
    const game = createGame();
    expect(game.players).toHaveLength(50);
    expect(game.snapshot()).toMatchObject({ mapId: "trenches", teamSize: 25 });
    for (const team of ["blue", "red"]) {
      const soldiers = game.players.filter((p) => p.team === team);
      expect(soldiers).toHaveLength(25);
      expect(new Set(soldiers.map((p) => p.teamIndex)).size).toBe(25);
      expect(new Set(soldiers.map((p) => `${p.x},${p.z}`)).size).toBe(25);
      for (const p of soldiers) {
        expect(p.y).toBeCloseTo(2.4);
        expect(Math.abs(p.x)).toBeGreaterThan(50);
        expect(p.team === "blue" ? p.x < 0 : p.x > 0).toBe(true);
        expect(blocked(p.x, p.z, 0.7, trenchMap)).toBe(false);
        const entrance = moveOnMap(
          p,
          { x: p.team === "blue" ? 24 : -24, z: 0 },
          trenchMap,
        );
        expect(groundHeight(entrance.x, entrance.z, trenchMap)).toBe(0);
        expect(Math.abs(entrance.x)).toBeLessThan(41);
      }
    }
  });

  it("has four separate trench lines and an exposed central no man's land", () => {
    for (const z of [-49, -17, 15, 47]) {
      let bands = 0,
        inTrench = false;
      for (let x = -77; x <= 77; x += 0.5) {
        const dug = groundHeight(x, z, trenchMap) < 1.5;
        if (dug && !inTrench) bands++;
        inTrench = dug;
      }
      expect(bands).toBe(4);
      for (const x of [-45, -29, 29, 45])
        expect(groundHeight(x, z, trenchMap)).toBeLessThan(1.1);
    }
    for (let x = -9; x <= 9; x += 2)
      for (let z = -50; z <= 50; z += 5)
        expect(groundHeight(x, z, trenchMap)).toBeGreaterThanOrEqual(
          1.55 - 0.001,
        );
    const centerCover = trenchMap.boxes.filter((box) => Math.abs(box.x) < 18);
    expect(centerCover.filter((box) => box.kind === "sandbag")).toHaveLength(2);
    expect(
      centerCover.every((box) => box.h <= 0.65 && box.kind !== "bunker"),
    ).toBe(true);
    const coverArea = centerCover.reduce((sum, box) => sum + box.w * box.d, 0);
    expect(coverArea).toBeLessThan(15);
    for (const sector of trenchMap.sectors)
      expect(trenchMap.boxes.some((box) => dist(box, sector) < 10)).toBe(false);
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

  it("shortens the gap between each pair of lines and keeps every dogleg walkable but screened by earth", () => {
    const game = createGame(),
      map = game.map,
      collision = game.collision;
    for (const side of [-1, 1])
      for (const z of [-33, -1, 31]) {
        expect(groundHeight(side * 21, z - 2, map)).toBeLessThan(1);
        expect(groundHeight(side * 37, z + 2, map)).toBeLessThan(1);
        // Follow the offset passages, checking their full usable width.
        for (const offset of [-0.6, 0, 0.6]) {
          const route = [
            { x: side * 37, z: z + 3 + offset },
            { x: side * 29, z: z + 3 + offset },
            { x: side * 29, z: z - 3 + offset },
            { x: side * 21, z: z - 3 + offset },
          ];
          for (let i = 1; i < route.length; i++)
            expect(walkSegment(route[i - 1], route[i], map)).toBe(true);
        }
        expect(walkSegment({ x: side * 37, z }, { x: side * 21, z }, map)).toBe(
          false,
        );
        for (const offset of [-3, -2, -1, 0, 1, 2, 3])
          expect(
            collision.ray(
              { x: side * 37, y: 1.65, z: z + offset },
              { x: side * 21, y: 1.65, z: z + offset },
            ),
          ).toBeLessThan(1);
        expect(groundHeight(side * 25, z, map)).toBeCloseTo(2.4);
        expect(groundHeight(side * 33, z, map)).toBeCloseTo(2.4);
      }
    // Adjacent front/rear zigzag traverses retain a solid earth separator.
    for (const side of [-1, 1])
      for (const z of [-41, -25, -9, 7, 23, 39])
        expect(groundHeight(side * 33, z, map)).toBeCloseTo(2.4);
    const stopped = moveOnMap({ x: -31, z: -49 }, { x: -3, z: 0 }, map);
    expect(stopped.x).toBeGreaterThanOrEqual(-32.01);
  });

  it("keeps every front parapet closed, with ramps only behind the lines and onto firing steps", () => {
    for (const side of [-1, 1])
      for (const z of [-33, -1, 31]) {
        const stopped = moveOnMap(
          { x: side * 23, z },
          { x: -side * 14, z: 0 },
          trenchMap,
        );
        expect(Math.abs(stopped.x)).toBeGreaterThanOrEqual(17.99);
        expect(groundHeight(stopped.x, stopped.z, trenchMap)).toBeCloseTo(0.85);
        expect(groundHeight(side * 14, z, trenchMap)).toBeCloseTo(2.4);
        expect(
          walkSegment({ x: side * 23, z }, { x: side * 10, z }, trenchMap),
        ).toBe(false);
      }
    expect(
      trenchMap
        .terrain!.ramps.filter((r) => r.high === 2.4)
        .every((r) => Math.abs(r.x) > 40),
    ).toBe(true);
    expect(groundHeight(-45, -1, trenchMap)).toBeCloseTo(1.2);
    expect(groundHeight(-27, -49, trenchMap)).toBeCloseTo(0.85);
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
    Object.assign(p, { x: -27, y: 0.85, z: -49 });
    Object.assign(enemy, { x: 0, y: 2.4, z: -49 });
    expect(
      collision.ray(
        { x: p.x, y: p.y + rifleHeight(trenchMap), z: p.z },
        { x: enemy.x, y: enemy.y + 1.25, z: enemy.z },
      ),
    ).toBe(1);
    botCommand(game, p);
    expect(p.target).toBe(enemy.id);
  });

  it("runs a 50-soldier match with combat from its own firing steps, valid heights, and cleanup", () => {
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
              : groundHeight(p.x, p.z, game.map) + (p.hop?.height ?? 0),
          );
          expect(blocked(p.x, p.z, 0.44, game.map)).toBe(false);
          expect(p.team === "blue" ? p.x < -18 : p.x > 18).toBe(true);
        }
    }
    expect(maxProjectiles).toBeLessThan(1000);
    expect(counts.mantle ?? 0).toBe(0);
    expect(counts.fire).toBeGreaterThan(100);
    expect(counts.damage).toBeGreaterThan(0);
    expect(counts.death).toBeGreaterThan(0);
    expect(counts.capture ?? 0).toBe(0);
    expect(game.scores.blue + game.scores.red).toBe(counts.death);
    expect(counts.end).toBe(1);
    expect(game.projectiles).toHaveLength(0);
  }, 15000);
});
