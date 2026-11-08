import { expect, it } from "vitest";
import { Game, idle, TestCollision, type Event } from "./simulation";
import { industrialMap } from "./map";
import { meleeRules, botMeleeIntent } from "./melee";
import { PlaytestLog } from "./playtest";

function duel() {
  const map = { ...industrialMap, boxes: [] };
  const world = new TestCollision(map);
  const g = new Game(world, true, 3000, 12345, undefined, {
    map,
    teamSize: 1,
    assaults: false,
    ambientArtillery: false,
  });
  g.artillery.enabled = false;
  g.botSettings.engagementRange = 0;
  const [p, q] = g.players;
  Object.assign(p, {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    weapon: "serviceRifle",
    protectedUntil: 0,
  });
  Object.assign(q, {
    x: 0,
    y: 0,
    z: -1.6,
    yaw: Math.PI,
    protectedUntil: 0,
    nextThink: 1e9,
    forwardPost: { x: 0, z: -1.6 },
  });
  return { g, p, q, world };
}
const swings = (e: Event[]) =>
  e.filter((e) => e.type === "melee" && e.phase === "start");

it("winds up, damages once, blocks other actions, honors held input and recovery, then counts a kill normally", () => {
  const { g, p, q } = duel();
  const events: Event[] = [];
  const ammo = p.ammo;
  for (let i = 0; i < 60; i++) {
    g.step({
      ...idle(),
      melee: true,
      fire: i < 24,
      reload: i < 24,
      grenade: i < 24,
    });
    events.push(...g.events);
  }
  expect(swings(events)).toHaveLength(1);
  expect(q.hp).toBe(35);
  expect(
    events.filter((e) => e.type === "melee" && e.phase === "strike"),
  ).toMatchObject([{ tick: 8, damage: 65, target: q.id, killed: false }]);
  expect(p.ammo).toBe(ammo);
  expect(p.grenades).toBe(3);
  expect(q.staggerUntil).toBe(17);
  g.step(idle());
  g.step({ ...idle(), melee: true });
  for (let i = 0; i < 7; i++) g.step(idle());
  expect(q.hp).toBe(0);
  expect(p.kills).toBe(1);
  expect(q.deaths).toBe(1);
  expect(g.scores.blue).toBe(0); // Domination/sector kills do not grant points.
});

it("checks range, facing, height, cover, allies and spawn protection at the strike rather than locking on at input", () => {
  for (const obstacle of [
    "dodge",
    "behind",
    "high",
    "wall",
    "ally",
    "protected",
  ] as const) {
    const { g, p, q } = duel();
    g.step({ ...idle(), melee: true });
    if (obstacle === "dodge") q.z = -5;
    if (obstacle === "behind") q.z = 1;
    if (obstacle === "high") {
      q.y = 3;
      q.hop = { startTick: g.tick, height: 3, velocity: 0, originY: 0 };
    }
    if (obstacle === "wall") g.collision.ray = () => 0;
    if (obstacle === "ally") q.team = p.team;
    if (obstacle === "protected") q.protectedUntil = 1000;
    const events: Event[] = [];
    for (let i = 0; i < 10; i++) {
      g.step(idle());
      events.push(...g.events);
    }
    expect(q.hp, obstacle).toBe(100);
    expect(
      events.find((e) => e.type === "melee" && e.phase === "strike"),
    ).toMatchObject({ damage: 0, killed: false });
  }
});

it("makes a running charge lethal but limits turning and movement during the longer recovery; collision still stops it", () => {
  const { g, p, q } = duel();
  q.z = -3.9;
  p.vz = -7;
  g.step({ ...idle(), melee: true, sprint: true, z: -1 });
  expect(p.melee?.kind).toBe("charge");
  expect(p.melee!.endTick - p.melee!.startTick).toBe(42);
  const first = p.z;
  for (let i = 0; i < 12; i++) g.step({ ...idle(), z: -1 });
  expect(q.hp).toBe(0);
  expect(p.z).toBeLessThan(first - 2);
  const before = p.yaw;
  g.step({ ...idle(), z: -1, yaw: Math.PI });
  expect(Math.abs(p.yaw - before)).toBeCloseTo(0.03);
  for (let i = 0; i < 15; i++) g.step({ ...idle(), z: -1, yaw: p.yaw });
  expect(Math.hypot(p.vx, p.vz)).toBeLessThan(1.5);
  expect(p.nextMelee).toBe(61);
  const blocked = duel();
  blocked.g.collision.move = (pos) => pos;
  blocked.p.vz = -7;
  blocked.g.step({ ...idle(), z: -1, sprint: true, melee: true });
  blocked.q.z = -3;
  for (let i = 0; i < 13; i++) blocked.g.step(idle());
  expect(blocked.p.z).toBe(0);
  expect(blocked.q.hp).toBe(100);
});

it("uses a shorter weaker butt strike for machine guns and cannot charge from standing, crouching or in the air", () => {
  const { g, p, q } = duel();
  p.weapon = "machineGun";
  q.z = -1.1;
  p.vz = -7;
  g.collision.move = (pos) => pos;
  g.step({ ...idle(), melee: true, sprint: true, z: -1 });
  expect(p.melee?.kind).toBe("butt");
  for (let i = 0; i < 9; i++) g.step(idle());
  expect(q.hp).toBe(55);
  for (const state of [
    "standing",
    "crouch",
    "reload",
    "throw",
    "stagger",
    "hop",
  ]) {
    const { g, p } = duel();
    if (state === "crouch") p.crouched = true;
    if (state === "reload") p.reloadAt = 100;
    if (state === "throw") p.throwUntil = 100;
    if (state === "stagger") p.staggerUntil = 100;
    if (state === "hop")
      p.hop = { startTick: 0, height: 0, velocity: 3, originY: 0 };
    g.step({
      ...idle(),
      melee: true,
      sprint: true,
      z: -1,
      crouch: state === "crouch",
    });
    expect(p.melee?.kind, state).toBe(
      state === "standing" || state === "crouch" ? "bayonet" : undefined,
    );
  }
});

it("cancels on death/falling, resets on respawn/restart and clears unfinished attacks at match end", () => {
  for (const reason of ["death", "fall", "end"]) {
    const { g, p, q } = duel();
    g.step({ ...idle(), melee: true });
    if (reason === "death") {
      p.hp = 0;
      p.respawnAt = 1e9;
    }
    if (reason === "fall") {
      p.y = 4;
      p.fall = { startTick: g.tick, velocity: -3 };
    }
    if (reason === "end") g.duration = g.tick + 1;
    for (let i = 0; i < 10; i++) g.step(idle());
    expect(p.melee).toBeNull();
    expect(q.hp).toBe(100);
    g.respawn(p);
    expect(p.meleeThreat).toBeNull();
    expect(p.meleeHeld).toBe(false);
    expect(p.staggerUntil).toBe(0);
  }
});

it("requires continuous close awareness and a reaction delay before a bot can start a melee attack", () => {
  const { g, p, q } = duel();
  g.botSettings.reactionTicks = 27;
  Object.assign(p, {
    spottedAt: 0,
    awareness: { ...p.awareness, visible: true, seenAt: 0 },
  });
  let first = -1;
  for (g.tick = 1; g.tick <= 40; g.tick++) {
    p.awareness.seenAt = g.tick;
    const c = idle();
    expect(botMeleeIntent(g, p, q, c)).toBe(true);
    if (c.melee && first < 0) first = g.tick;
  }
  expect(first).toBe(27);
  q.z = -6;
  expect(botMeleeIntent(g, p, q, idle())).toBe(false);
  expect(p.meleeThreat).toBeNull();
  q.z = -1.6;
  p.awareness.visible = false;
  expect(botMeleeIntent(g, p, q, idle())).toBe(false);
  p.awareness.visible = true;
  p.awareness.seenAt = g.tick;
  const c = idle();
  botMeleeIntent(g, p, q, c);
  expect(c.melee).toBe(false);
  expect(meleeRules.bayonet.rest).toBeGreaterThan(0);
});

it("records melee attacks, charges, hits and kills in the event-only diagnostic summary", () => {
  const { g, p, q } = duel(),
    log = new PlaytestLog();
  p.vz = -7;
  q.z = -3.9;
  for (let i = 0; i < 14; i++) {
    const c = { ...idle(), melee: i === 0, sprint: true, z: -1 };
    g.step(c);
    log.recordTick(g, c, i / 30);
  }
  expect(log.summary()).toMatchObject({
    meleeAttacks: 1,
    bayonetCharges: 1,
    meleeHits: 1,
    meleeKills: 1,
  });
});

it("lets a real bot recognize a nearby enemy, pause, wind up and strike instead of instantly shooting", () => {
  const { g, p, q } = duel();
  g.botSettings.engagementRange = 30;
  g.collision.move = (pos) => pos;
  q.yaw = Math.PI;
  q.z = -1.1;
  p.hp = 10000;
  const events: Event[] = [];
  for (let i = 0; i < 110; i++) {
    g.step(idle());
    events.push(...g.events);
  }
  const acquired = events.find(
    (e) =>
      e.type === "botAttention" && e.actor === q.id && e.phase === "acquired",
  )!;
  const start = events.find(
    (e) => e.type === "melee" && e.actor === q.id && e.phase === "start",
  )!;
  const strike = events.find(
    (e) =>
      e.type === "melee" &&
      e.actor === q.id &&
      e.phase === "strike" &&
      e.damage,
  )!;
  expect(acquired).toBeDefined();
  expect(start).toBeDefined();
  expect(strike).toBeDefined();
  expect(start.tick - acquired.tick).toBeGreaterThanOrEqual(18);
  expect(strike.tick - start.tick).toBe(8); // Industrial rifle uses its butt.
  expect(events.some((e) => e.type === "fire")).toBe(false);
  expect(p.hp).toBeLessThan(10000);
});

it("a nearer friendly body blocks the thrust, and an interruption cancels an unfinished attack", () => {
  const { g, p, q } = duel();
  g.collision.move = (pos) => pos;
  g.players.push({
    ...structuredClone(q),
    id: 2,
    team: p.team,
    z: -0.8,
    protectedUntil: 0,
  });
  g.step({ ...idle(), melee: true });
  for (let i = 0; i < 9; i++) g.step(idle());
  expect(q.hp).toBe(100);
  expect(g.players[2].hp).toBe(100);
  const pair = duel();
  pair.g.collision.move = (pos) => pos;
  pair.q.weapon = "serviceRifle";
  pair.q.hp = 10000;
  pair.p.hp = 10000;
  pair.g.botSettings.engagementRange = 30;
  const events: Event[] = [];
  for (let i = 0; i < 90 && !pair.q.melee; i++) {
    pair.g.step(idle());
    events.push(...pair.g.events);
  }
  expect(pair.q.melee).not.toBeNull();
  // The bot has begun its wind-up; a player's already-started attack can interrupt it.
  pair.p.melee = {
    kind: "bayonet",
    startTick: pair.g.tick - 6,
    strikeTick: pair.g.tick + 1,
    endTick: pair.g.tick + 18,
    yaw: 0,
    struck: false,
  };
  pair.g.step(idle());
  expect(
    pair.g.events.some(
      (e) =>
        e.type === "melee" && e.phase === "cancel" && e.actor === pair.q.id,
    ),
  ).toBe(true);
  expect(pair.q.melee).toBeNull();
  expect(pair.q.staggerUntil).toBe(pair.g.tick + 9);
});
