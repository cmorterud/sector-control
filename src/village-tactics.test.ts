import { expect, it } from "vitest";
import {
  Game,
  TestCollision,
  botCommand,
  pathfind,
  type Soldier,
} from "./simulation";
import { villageMap } from "./village-map";
import { groundHeight, dist, blocked, walkSegment } from "./map";
import {
  planVillageMove,
  villageCover,
  villageSteering,
} from "./village-tactics";
import { idle } from "./simulation";
import { artilleryExplosionProfile } from "./destruction";
const scene = () =>
  new Game(new TestCollision(villageMap), true, 1800, 12345, undefined, {
    map: villageMap,
    humanPlayerIds: [],
    ambientArtillery: false,
  });
const plan = (g: Game, p: Soldier) =>
  planVillageMove(g, p, (a, b) => pathfind(a, b, g.map));
it("spreads deployments along the whole front, each with a route to its side's entrances", () => {
  const g = scene();
  for (const team of ["blue", "red"] as const) {
    const soldiers = g.players.filter((p) => p.team === team);
    const zs = soldiers.map((p) => p.z).sort((a, b) => a - b);
    expect(zs.at(-1)! - zs[0]).toBeGreaterThan(100);
    expect(
      new Set(soldiers.map((p) => (p.z < -20 ? 0 : p.z < 20 ? 1 : 2))).size,
    ).toBe(3);
    for (const p of soldiers) {
      expect(blocked(p.x, p.z, 0.5, g.map)).toBe(false);
      expect(p.y).toBeCloseTo(groundHeight(p.x, p.z, g.map));
      const routes = g.map.terrain!.communicationRoutes!.filter(
        (r) => r.team === p.team,
      );
      expect(
        pathfind(p, routes[p.teamIndex % 3].entrance, g.map).length,
      ).toBeGreaterThan(0);
    }
  }
  // The player starts in the middle of the line.
  const human = new Game(
    new TestCollision(villageMap),
    true,
    1800,
    12345,
    undefined,
    { map: villageMap },
  );
  expect(human.players[0].x).toBeCloseTo(villageMap.spawn.blue.x, 0);
  expect(Math.abs(human.players[0].z - villageMap.spawn.blue.z)).toBeLessThan(3);
});
it("reserves distinct reachable capture and covering positions instead of sending a crowd to the flag center", () => {
  const g = scene(),
    soldiers = g.players.filter((p) => p.team === "blue").slice(0, 12);
  for (const p of soldiers) {
    p.objective = 1;
    plan(g, p);
    expect(p.villagePlan, "soldier " + p.id).toBeTruthy();
  }
  const goals = soldiers.map((p) => p.villagePlan!.goal);
  expect(new Set(goals.map((p) => `${p.x},${p.z}`)).size).toBe(12);
  expect(
    soldiers.filter((p) => p.villagePlan!.capture).length,
  ).toBeGreaterThanOrEqual(3);
  expect(soldiers.some((p) => p.villagePlan!.cover > 0)).toBe(true);
  for (let i = 0; i < goals.length; i++)
    for (let j = 0; j < i; j++)
      expect(dist(goals[i], goals[j])).toBeGreaterThan(1.8);
  for (const p of soldiers) {
    const route = pathfind(
      p.villagePlan!.approach ?? p,
      p.villagePlan!.goal,
      g.map,
    );
    expect(route.length).toBeGreaterThan(0);
    let prev = p.villagePlan!.approach ?? p;
    for (const next of route) {
      expect(walkSegment(prev, next, g.map)).toBe(true);
      prev = next;
    }
  }
});
it("holds a plan without churn, but chooses a different position when physically stalled", () => {
  const g = scene(),
    p = g.players[1];
  plan(g, p);
  const first = p.villagePlan!;
  plan(g, p);
  expect(p.villagePlan).toBe(first);
  g.tick = 95;
  plan(g, p);
  expect(p.villagePlan).not.toBe(first);
  expect(dist(first.goal, p.villagePlan!.goal)).toBeGreaterThanOrEqual(3);
  expect(
    g.events.some(
      (e) =>
        e.type === "botPosition" && e.actor === p.id && e.reason === "stuck",
    ),
  ).toBe(true);
  g.respawn(p);
  expect(p.villagePlan).toBeNull();
});
it("rechecks physical cover after an explosion and drops a destroyed protective position", () => {
  const g = scene(),
    p = g.players[1];
  p.x = -20;
  p.z = 18;
  p.y = groundHeight(p.x, p.z, g.map);
  p.objective = 1;
  // Find a real low wall / corner post and verify its cover against real world rays.
  plan(g, p);
  const old = p.villagePlan!;
  expect(old.cover).toBeGreaterThan(0);
  const original = old.goal;
  for (let n = 0; n < 4; n++)
    g.explode(
      {
        x: original.x + 2,
        y: groundHeight(original.x, original.z, g.map) + 1,
        z: original.z,
      },
      -1,
      null,
      {
        ...artilleryExplosionProfile,
        damage: 0,
        structuralDamage: 1000,
        structuralRadius: 12,
        craterRadius: 0,
        terrainReach: 0,
        craterDepth: 0,
      },
    );
  expect(villageCover(g, p, original)).toBeLessThan(old.cover);
  plan(g, p);
  expect(p.villagePlan).not.toBe(old);
  expect(
    g.events.some(
      (e) =>
        e.type === "botPosition" &&
        e.actor === p.id &&
        e.reason === "coverLost",
    ),
  ).toBe(true);
});
it("moves toward cover under distant fire, then crouches behind real low cover when reloading", () => {
  const g = scene(),
    p = g.players[1];
  p.x = -23;
  p.z = 5;
  p.y = groundHeight(p.x, p.z, g.map);
  p.objective = 2;
  plan(g, p);
  const c = { ...idle(), x: 1, fire: true, aim: true };
  villageSteering(g, p, c, 20);
  expect(c.sprint).toBe(true);
  expect(c.fire).toBe(false);
  expect(c.aim).toBe(false);
  // Probe points beside the authored low garden walls, not an invented cover flag.
  const at = { x: -60.9, z: 36 };
  p.x = at.x;
  p.z = at.z;
  p.y = groundHeight(p.x, p.z, g.map);
  expect(villageCover(g, p, at)).toBe(1);
  p.villagePlan!.goal = at;
  p.reloadAt = 30;
  const shelter = idle();
  villageSteering(g, p, shelter, 20);
  expect(shelter.crouch).toBe(true);
});
it("does not give hidden enemy positions to the cover planner", () => {
  const g = scene(),
    p = g.players[1],
    at = { x: -60.9, z: 36 };
  const initial = villageCover(g, p, at, true);
  for (const q of g.players.filter((q) => q.team !== p.team)) {
    q.x = at.x - 4;
    q.z = at.z;
  }
  expect(villageCover(g, p, at, true)).toBe(initial);
  p.awareness.observed = {
    x: at.x - 4,
    y: groundHeight(at.x, at.z, g.map) + 1.65,
    z: at.z,
  };
  p.awareness.seenAt = g.tick;
  expect(villageCover(g, p, at, true)).toBe(0);
});

it("reacts to suppression by replacing an exposed post with cover against a remembered threat", () => {
  const g = scene(),
    p = g.players[1];
  p.objective = 1;
  plan(g, p);
  p.x = -12;
  // The garden at z=18 now has real cover. Keep this fixture on its open
  // street-facing edge so it still exercises an exposed-to-sheltered move.
  p.z = 20.5;
  p.y = groundHeight(p.x, p.z, g.map);
  p.villagePlan!.goal = { x: -11, z: 20.5 };
  p.villagePlan!.cover = 0;
  p.suppression = 0.5;
  p.awareness.observed = { x: 20, y: p.y + 1.65, z: 20.5 };
  p.awareness.seenAt = g.tick;
  expect(blocked(p.villagePlan!.goal.x,p.villagePlan!.goal.z,.6,g.map)).toBe(false);
  expect(villageCover(g, p, p.villagePlan!.goal, true)).toBe(0);
  plan(g, p);
  expect(villageCover(g, p, p.villagePlan!.goal, true)).toBeGreaterThan(0);
  expect(
    g.events.some(
      (e) =>
        e.type === "botPosition" &&
        e.actor === p.id &&
        e.reason === "underFire",
    ),
  ).toBe(true);
});
it("disperses the opening 100-soldier advance instead of accumulating a dense stationary mob", () => {
  const g = scene();
  g.artillery.enabled = false;
  // Fifteen seconds: soldiers deploy along the whole rear line and file to
  // the three communication routes, so the flanks take a few seconds longer.
  for (let i = 0; i < 450; i++) g.step(botCommand(g, g.players[0]));
  const live = g.players.filter((p) => p.hp > 0);
  const neighbors = live.map(
    (p) =>
      live.filter((q) => q !== p && q.team === p.team && dist(p, q) < 2.5)
        .length,
  );
  expect(Math.max(...neighbors)).toBeLessThanOrEqual(8);
  expect(neighbors.filter((n) => n >= 5).length).toBeLessThanOrEqual(10);
  expect(live.filter((p) => Math.abs(p.x) < 60).length).toBeGreaterThan(75);
  expect(
    live.filter((p) => p.villagePlan && p.villagePlan.cover > 0).length,
  ).toBeGreaterThan(25);
}, 15000);

it("passes approaching teammates on opposite world sides without steering through solid ground", () => {
  const g = scene(),
    a = g.players[1],
    b = g.players[2];
  for (const p of g.players) if (p !== a && p !== b) p.hp = 0;
  a.x = -24;
  a.z = 18;
  a.y = groundHeight(a.x, a.z, g.map);
  a.vx = 4;
  b.x = -22.3;
  b.z = 18;
  b.y = groundHeight(b.x, b.z, g.map);
  b.vx = -4;
  plan(g, a);
  plan(g, b);
  a.villagePlan!.goal = { x: 20, z: 18 };
  b.villagePlan!.goal = { x: -30, z: 18 };
  const ca = { ...idle(), x: 1 },
    cb = { ...idle(), x: -1 };
  villageSteering(g, a, ca, Infinity);
  villageSteering(g, b, cb, Infinity);
  expect(ca.z).toBeGreaterThan(0);
  expect(cb.z).toBeLessThan(0);
});
