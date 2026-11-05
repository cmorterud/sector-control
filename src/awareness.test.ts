import { trenchMap } from "./trench-map";
import { it, expect } from "vitest";
import { Game, TestCollision, idle, botCommand } from "./simulation";
import { industrialMap } from "./map";
import { freshAwareness } from "./awareness";
function scene(settings = {}) {
  const g = new Game(
    { ray: () => 1, move: (p) => ({ x: p.x, z: p.z }) },
    true,
    5000,
    12345,
    settings,
    { map: { ...industrialMap, boxes: [] }, teamSize: 1, assaults: false },
  );
  const [target, p] = g.players;
  Object.assign(target, {
    x: 0,
    y: 0,
    z: -25,
    hp: 1000000,
    protectedUntil: 0,
    nextThink: 1e9,
  });
  Object.assign(p, {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    hp: 1000000,
    protectedUntil: 0,
    nextThink: 1e9,
  });
  return { g, p, target };
}
it("notices a visible enemy before recognizing and shooting, using slower variable reaction times", () => {
  const { g, p } = scene();
  let acquired = -1,
    first = -1;
  for (let i = 0; i < 100; i++) {
    g.step(idle());
    if (p.target >= 0 && acquired < 0) {
      acquired = g.tick;
      expect(p.awareness.confidence).toBeLessThan(0.1);
    }
    if (g.events.some((e) => e.type === "fire" && e.actor === p.id)) {
      first = g.tick;
      break;
    }
  }
  expect(acquired).toBeGreaterThan(0);
  expect(first - acquired).toBeGreaterThanOrEqual(27);
  expect(first - acquired).toBeLessThan(70);
  expect(p.awareness.confidence).toBeGreaterThanOrEqual(0.75);
});
it("does not spot a quiet soldier behind its view immediately but can turn toward nearby gunfire", () => {
  const { g, p, target } = scene();
  target.z = 25;
  g.tick = 1;
  botCommand(g, p);
  expect(p.target).toBe(-1);
  target.lastShotAt = 1;
  g.tick = p.awareness.nextLook;
  const c = botCommand(g, p);
  expect(p.target).toBe(target.id);
  expect(c.fire).toBe(false);
  expect(Math.abs(c.yaw - p.yaw)).toBeLessThanOrEqual(0.0751);
});
it("tracks sampled last-seen positions and estimated velocity without instant perfect leading", () => {
  const { g, p, target } = scene({ aimError: 0 });
  g.tick = 1;
  botCommand(g, p);
  const seen = { ...p.awareness.observed! };
  target.x = 8;
  target.vx = 7;
  g.tick = 2;
  const delayed = botCommand(g, p);
  expect(p.awareness.observed).toEqual(seen);
  expect(delayed.yaw).toBeCloseTo(0);
  g.tick = p.awareness.nextLook;
  const correction = botCommand(g, p);
  expect(p.awareness.observed!.x).toBe(8);
  expect(p.awareness.velocity.x).toBeGreaterThan(0);
  expect(p.awareness.velocity.x).toBeLessThan(7);
  expect(Math.abs(correction.yaw - p.yaw)).toBeLessThanOrEqual(0.0751);
  expect(correction.yaw).toBeLessThan(Math.atan2(8, 25));
});
it("stops on lost sight, searches the remembered position, and must recognize a reappearing enemy again", () => {
  const { g, p, target } = scene();
  for (let i = 0; i < 50; i++) g.step(idle());
  const last = { ...p.awareness.observed! };
  g.collision.ray = () => 0;
  p.awareness.nextTrigger = g.tick;
  p.nextShot = g.tick;
  let c = botCommand(g, p);
  expect(c.fire).toBe(false);
  expect(p.target).toBe(-1);
  target.x = 20;
  g.tick++;
  c = botCommand(g, p);
  expect(c.fire).toBe(false);
  expect(p.awareness.observed).toEqual(last);
  expect(p.mode).toBe("Searching");
  g.collision.ray = () => 1;
  target.x = 0;
  g.tick = p.awareness.nextLook + 1;
  c = botCommand(g, p);
  expect(c.fire).toBe(false);
  expect(p.spottedAt).toBe(g.tick);
  expect(p.awareness.confidence).toBeLessThan(0.1);
});
it("uses irregular single trigger pulls, longer regrouping pauses, and never beams on consecutive ticks", () => {
  const { g, p } = scene({ focusMaxTicks: 0 });
  const shots: number[] = [];
  for (let i = 0; i < 450; i++) {
    g.step(idle());
    if (g.events.some((e) => e.type === "fire" && e.actor === p.id))
      shots.push(g.tick);
  }
  const gaps = shots.slice(1).map((n, i) => n - shots[i]);
  expect(shots.length).toBeGreaterThan(6);
  expect(shots.length).toBeLessThan(40);
  expect(Math.min(...gaps)).toBeGreaterThanOrEqual(7);
  expect(Math.max(...gaps)).toBeGreaterThanOrEqual(20);
  expect(new Set(gaps).size).toBeGreaterThan(3);
});
it("still hits real soldiers but fires and hits less consistently than the perfect-aim control", () => {
  const run = (settings: object) => {
    const { g, p, target } = scene(settings);
    let shots = 0,
      hits = 0;
    for (let i = 0; i < 900; i++) {
      p.recoilPitch = p.recoilYaw = 0;
      g.step(idle());
      for (const e of g.events) {
        if (e.type === "fire" && e.actor === p.id) shots++;
        if (e.type === "impact" && e.actor === p.id && e.hit) hits++;
      }
    }
    return { shots, hits };
  };
  const perfect = run({
      awareness: false,
      aimError: 0,
      reactionTicks: 0,
      focusMaxTicks: 0,
      burstPeriodTicks: 1,
      burstFireTicks: 1,
    }),
    soft = run({});
  expect(soft.hits, JSON.stringify({ perfect, soft })).toBeGreaterThan(0);
  expect(soft.shots).toBeLessThan(perfect.shots);
  expect(soft.hits / soft.shots).toBeLessThan(
    (perfect.hits / perfect.shots) * 0.6,
  );
  expect(soft.shots - soft.hits).toBeGreaterThan(soft.hits);
});
it("serializes isolated perception and resets recognition and firing plans on respawn", () => {
  const { g, p } = scene();
  g.tick = 1;
  botCommand(g, p);
  const snapshot = g.snapshot();
  p.awareness.confidence = 1;
  expect(snapshot.players[1].awareness.confidence).toBeLessThan(1);
  g.respawn(p);
  expect(p.awareness).toEqual(freshAwareness());
  expect(p.triggerHeld).toBe(false);
});

it("reduces actual long-range head-hit accuracy as well as volume, while preserving occasional hits", () => {
  const measure = (settings: object) => {
    let shots = 0,
      hits = 0;
    for (let id = 1; id <= 8; id++) {
      const g = new Game(
        new TestCollision(trenchMap),
        true,
        900,
        12345,
        settings,
        { map: trenchMap, teamSize: 1, assaults: false },
      );
      g.artillery.enabled = false;
      const [q, p] = g.players;
      Object.assign(q, {
        x: -19,
        y: 0.85,
        z: -1,
        hp: 1000000,
        protectedUntil: 0,
        nextThink: 1e9,
      });
      Object.assign(p, {
        id,
        x: 19,
        y: 0.85,
        z: -1,
        yaw: -Math.PI / 2,
        hp: 1000000,
        protectedUntil: 0,
        nextThink: 1e9,
        ammo: 10000,
        reserve: 10000,
      });
      for (let i = 0; i < 900; i++) {
        g.step(idle());
        for (const e of g.events) {
          if (e.type === "fire") shots++;
          if (e.type === "impact" && e.hit) hits++;
        }
      }
    }
    return { shots, hits, rate: hits / shots };
  };
  const priorAim = measure({
    awareness: false,
    aimError: 0.026,
    reactionTicks: 18,
    reactionJitterTicks: 6,
    focusMinTicks: 90,
    focusMaxTicks: 180,
    distractionMinTicks: 18,
    distractionMaxTicks: 36,
  });
  const current = measure({});
  expect(current.hits, JSON.stringify({ priorAim, current })).toBeGreaterThan(
    0,
  );
  expect(current.hits).toBeLessThan(priorAim.hits);
  expect(current.rate).toBeLessThan(priorAim.rate * 0.8);
}, 30000);
