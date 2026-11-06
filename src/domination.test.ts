import { expect, it } from "vitest";
import {
  Game,
  TestCollision,
  idle,
  botCommand,
  firingPosition,
  type Event,
} from "./simulation";
import { trenchMap } from "./trench-map";
import { industrialMap, groundHeight, dist } from "./map";
import { dominationRules, flagContains, flagOccupant } from "./domination";
import { advanceAssaults } from "./assault";
import { grenadeExplosionProfile } from "./destruction";

function scene() {
  const g = new Game(
    new TestCollision(trenchMap),
    false,
    5000,
    12345,
    undefined,
    { map: trenchMap, assaults: false },
  );
  g.artillery.enabled = false;
  return g;
}
function atFlag(g: Game, i = 0) {
  const s = g.sectors[i],
    p = g.players[0];
  Object.assign(p, {
    x: s.x,
    z: s.z,
    y: groundHeight(s.x, s.z, g.map),
    protectedUntil: 0,
  });
  return { p, s };
}
function advance(g: Game, n: number) {
  const events: Event[] = [];
  for (let i = 0; i < n; i++) {
    g.step(idle());
    events.push(...g.events);
  }
  return events;
}
it("places four neutral flags in the front trenches and captures one in fifteen seconds", () => {
  const g = scene(),
    { p, s } = atFlag(g);
  expect(g.scoring).toBe("domination");
  expect(g.scoreLimit).toBe(300);
  expect(g.sectors).toHaveLength(4);
  expect(g.sectors.filter((s) => s.home === "blue")).toHaveLength(2);
  expect(g.sectors.filter((s) => s.home === "red")).toHaveLength(2);
  for (const flag of g.sectors) {
    expect(groundHeight(flag.x, flag.z, g.map)).toBeLessThan(0.1);
    expect(flag.owner).toBeNull();
  }
  advance(g, 449);
  expect(s.owner).toBeNull();
  expect(g.scores.blue).toBe(0);
  g.step(idle());
  expect(s.owner).toBe("blue");
  expect(p.captures).toBe(1);
  expect(g.events.some((e) => e.type === "capture" && e.sector === s.id)).toBe(
    true,
  );
  expect(g.scores).toEqual({ blue: 1, red: 0 });
});
it("holds ownership without occupants and scores once per held uncontested flag every three seconds", () => {
  const g = scene();
  for (const s of g.sectors.slice(0, 2)) {
    s.owner = "blue";
    s.control = 1;
  }
  Object.assign(g.players[0], { hp: 0, respawnAt: 1e9 });
  advance(g, 89);
  expect(g.scores.blue).toBe(0);
  g.step(idle());
  expect(g.scores.blue).toBe(2);
  expect(g.events.find((e) => e.type === "score")).toMatchObject({
    points: { blue: 2, red: 0 },
    held: { blue: 2, red: 0 },
  });
  advance(g, 180);
  expect(g.scores.blue).toBe(6);
});
it("freezes capture and flag income while contested, then neutralizes and recaptures for the enemy", () => {
  const g = scene(),
    { p, s } = atFlag(g);
  s.owner = "blue";
  s.control = 1;
  const red = {
    ...p,
    id: 1,
    team: "red" as const,
    teamIndex: 0,
    nextThink: 1e9,
    awareness: structuredClone(p.awareness),
    path: [],
    command: idle(),
  };
  g.players.push(red);
  g.botSettings.engagementRange = 0;
  advance(g, 90);
  expect(s.contested).toBe(true);
  expect(s.control).toBe(1);
  expect(g.scores).toEqual({ blue: 0, red: 0 });
  p.hp = 0;
  p.respawnAt = 1e9;
  const neutral = advance(g, 450);
  expect(s.owner).toBeNull();
  expect(s.control).toBe(0);
  expect(
    neutral.some(
      (e) =>
        e.type === "neutralized" && e.previous === "blue" && e.team === "red",
    ),
  ).toBe(true);
  advance(g, 450);
  expect(s.owner).toBe("red");
  expect(red.captures).toBe(1);
  expect(g.scores.red).toBeGreaterThan(0);
});
it("requires an alive grounded soldier in the actual trench zone, respecting solid walls and excavation", () => {
  const g = scene(),
    { p, s } = atFlag(g);
  expect(flagOccupant(g, p, s)).toBe(true);
  p.hp = 0;
  expect(flagOccupant(g, p, s)).toBe(false);
  p.hp = 100;
  p.hop = { startTick: 0, height: 0.1, velocity: 1, originY: p.y };
  expect(flagOccupant(g, p, s)).toBe(false);
  p.hop = null;
  p.fall = { startTick: 0, velocity: -1 };
  expect(flagOccupant(g, p, s)).toBe(false);
  p.fall = null;
  Object.assign(p, { x: -17.5, z: s.z, y: 2.4 });
  expect(flagContains(g, p, s)).toBe(false);
  Object.assign(p, { x: -19, z: s.z, y: 0.85 });
  expect(flagContains(g, p, s)).toBe(true);
  g.map.boxes.push({ kind: "barrier", x: -21, z: s.z, w: 0.2, d: 8, h: 3 });
  expect(flagContains(g, p, s)).toBe(false);
  g.map.boxes.pop();
  atFlag(g);
  g.explode({ x: s.x, y: 0.025, z: s.z }, 0, "blue", {
    ...grenadeExplosionProfile,
    damage: 0,
  });
  expect(flagOccupant(g, p, s)).toBe(false);
  advance(g, 30);
  expect(p.fall).toBeNull();
  expect(p.y).toBeCloseTo(groundHeight(p.x, p.z, g.map));
  expect(flagOccupant(g, p, s)).toBe(true);
});
it("does not award team points for kills and ends at the score limit or timeout", () => {
  const map = { ...industrialMap, scoring: "domination" as const, boxes: [] };
  const g = new Game(new TestCollision(map), false, 1000, 12345, undefined, {
    map,
  });
  const p = g.players[0];
  p.protectedUntil = 0;
  const enemy = { ...p, id: 1, team: "red" as const, x: 0, z: 0, hp: 100 };
  g.players.push(enemy);
  g.explode({ x: 0, y: 0.5, z: 0 }, 0, "blue", {
    ...grenadeExplosionProfile,
    damage: 1000,
    craterRadius: 0,
    structuralDamage: 0,
  });
  expect(p.kills).toBe(1);
  expect(g.scores.blue).toBe(0);
  const game = scene();
  game.players[0].hp = 0;
  game.players[0].respawnAt = 1e9;
  game.sectors[0].owner = "blue";
  game.sectors[0].control = 1;
  game.scores.blue = 299;
  game.tick = 89;
  game.step(idle());
  expect(game.scores.blue).toBe(300);
  expect(game.phase).toBe("ended");
  expect(game.winner).toBe("blue");
  const timed = scene();
  timed.duration = 1;
  timed.scores.red = 2;
  timed.step(idle());
  expect(timed.winner).toBe("red");
  const tie = scene();
  tie.duration = 1;
  tie.step(idle());
  expect(tie.winner).toBe("draw");
  const fresh = scene();
  expect(fresh.scores).toEqual({ blue: 0, red: 0 });
  expect(fresh.sectors.every((s) => s.owner === null && s.control === 0)).toBe(
    true,
  );
});
it("routes assault squads to an enemy flag that still needs capture", () => {
  const g = new Game(
    new TestCollision(trenchMap),
    true,
    5000,
    12345,
    undefined,
    { map: trenchMap, teamSize: 25 },
  );
  g.artillery.enabled = false;
  g.sectors.find((s) => s.id === "C")!.owner = "blue";
  for (const p of g.players) {
    const post = firingPosition(g, p)!;
    Object.assign(p, {
      ...post,
      y: groundHeight(post.x, post.z, g.map),
      protectedUntil: 0,
    });
  }
  g.tick = 900;
  g.assaults.readyAt = { blue: 0, red: 1e9 };
  advanceAssaults(g);
  const m = g.assaults.missions.find((m) => m.team === "blue")!;
  expect(m).toBeDefined();
  expect(m.objective).toBe("D");
  expect(m.route.at(-1)).toMatchObject({
    x: g.sectors[3].x,
    z: g.sectors[3].z,
  });
  expect(
    m.members.every(
      (id) =>
        !g.humanPlayerIds.includes(id) && g.players[id].weapon !== "machineGun",
    ),
  ).toBe(true);
});
it("keeps home defenders near threatened flags and sends landed attackers to capture and then defend", () => {
  const g = new Game(
    new TestCollision(trenchMap),
    true,
    5000,
    12345,
    undefined,
    { map: trenchMap },
  );
  const flag = g.sectors[0],
    posts = g.map.terrain!.firingPositions!.filter((s) => s.team === "blue");
  const guard = g.players.find(
    (p) =>
      p.team === "blue" &&
      p.id !== 0 &&
      p.weapon === "rifle" &&
      p.teamIndex % 2 === 0 &&
      dist(posts[p.teamIndex], flag) < 8,
  )!;
  expect(guard).toBeDefined();
  flag.owner = "red";
  flag.control = -1;
  expect(dist(firingPosition(g, guard)!, flag)).toBeLessThan(1.2);
  const p = g.players[0];
  p.forwardPost = { x: g.sectors[3].x, z: g.sectors[3].z };
  expect(dist(firingPosition(g, p)!, g.sectors[3])).toBeLessThan(1.2);
  g.sectors[3].owner = "blue";
  g.sectors[3].control = 1;
  const post = firingPosition(g, p)!;
  expect(dist(post, g.sectors[3])).toBeLessThanOrEqual(dominationRules.radius);
  expect(groundHeight(post.x, post.z, g.map)).toBeCloseTo(0.85);
});
it("a landed bot physically captures an enemy flag, then holds it from a firing step", () => {
  const g = new Game(
    new TestCollision(trenchMap),
    true,
    3000,
    12345,
    { engagementRange: 0 },
    { map: trenchMap, teamSize: 1, assaults: false, humanPlayerIds: [] },
  );
  g.artillery.enabled = false;
  const p = g.players[0],
    s = g.sectors[3];
  g.players[1].hp = 0;
  g.players[1].respawnAt = 1e9;
  Object.assign(p, {
    x: s.x,
    z: s.z - 1,
    y: 0,
    forwardPost: { x: s.x, z: s.z },
    protectedUntil: 0,
  });
  const events: Event[] = [];
  for (let i = 0; i < 650; i++) {
    g.step(botCommand(g, p));
    events.push(...g.events);
  }
  expect(s.owner).toBe("blue");
  expect(events.some((e) => e.type === "capture" && e.sector === "D")).toBe(
    true,
  );
  expect(p.y).toBeCloseTo(0.85);
  expect(flagContains(g, p, s)).toBe(true);
  expect(g.scores.blue).toBeGreaterThan(0);
});
