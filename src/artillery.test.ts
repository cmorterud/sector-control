import { describe, expect, it } from "vitest";
import {
  Game,
  TestCollision,
  idle,
  botCommand,
  firingPosition,
  type Event,
} from "./simulation";
import {
  artilleryRules,
  artilleryTargetReason,
  artilleryAim,
  requestArtillery,
  artilleryThreat,
  botArtilleryTarget,
  barrageOffsets,
} from "./artillery";
import { artilleryExplosionProfile } from "./destruction";
import { groundHeight, industrialMap, type MapDefinition } from "./map";
import { trenchMap } from "./trench-map";
import { PlaytestLog, eventTimeline } from "./playtest";
const open: MapDefinition = {
  ...industrialMap,
  boxes: [],
  spawn: { blue: { x: -25, z: 0 }, red: { x: 25, z: 0 } },
  scoring: "eliminations",
};
function scene(map = open) {
  const g = new Game(new TestCollision(map), false, 5000, 12345, undefined, {
    map,
  });
  Object.assign(g.players[0], {
    x: -25,
    z: 0,
    y: groundHeight(-25, 0, g.map),
    protectedUntil: 0,
  });
  g.artillery.readyAt.red = 1e9;
  return g;
}
function advance(g: Game, n: number) {
  const events: Event[] = [];
  for (let i = 0; i < n; i++) {
    g.step(idle());
    events.push(...g.events);
  }
  return events;
}
const target = { x: 10, z: 0 };
function ready(g: Game) {
  g.tick = artilleryRules.initialDelay;
  return g.players[0];
}

describe("artillery missions", () => {
  it("makes the first barrage available at ten seconds and replenishes the charge exactly thirty seconds after a call", () => {
    const g = scene(),
      p = g.players[0];
    g.tick = 299;
    expect(requestArtillery(g, p, target)).toBe(false);
    g.step(idle());
    expect(requestArtillery(g, p, target)).toBe(true);
    expect(g.artillery.readyAt.blue).toBe(1200);
    advance(g, 899);
    expect(g.artillery.missions).toHaveLength(0);
    expect(requestArtillery(g, p, target)).toBe(false);
    g.step(idle());
    expect(requestArtillery(g, p, target)).toBe(true);
    expect(g.artillery.readyAt.blue).toBe(2100);
  });
  it("varies shell gaps substantially, reproducibly and within the same barrage window", () => {
    const patterns = new Set<string>();
    for (let seed = 0; seed < 256; seed++) {
      const offsets = barrageOffsets(seed);
      expect(offsets).toEqual(barrageOffsets(seed));
      expect(offsets).toHaveLength(8);
      expect(offsets[0]).toBe(0);
      expect(offsets.at(-1)).toBe(120);
      expect(offsets.every(Number.isInteger)).toBe(true);
      const gaps = offsets.slice(1).map((n, i) => n - offsets[i]);
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(7);
      expect(Math.max(...gaps)).toBeLessThanOrEqual(28);
      expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThanOrEqual(8);
      patterns.add(offsets.join(","));
    }
    expect(patterns.size).toBeGreaterThan(240);
  });
  it("stores isolated mission timing without consuming extra combat randomness", () => {
    const g = scene(),
      expected = scene();
    ready(g);
    ready(expected);
    for (let i = 0; i < 16; i++) expected.random(); // Existing eight-shell scatter.
    requestArtillery(g, g.players[0], target);
    expect(g.seed).toBe(expected.seed);
    const snapshot = g.snapshot();
    snapshot.artillery.missions[0].impactOffsets[1] = 999;
    expect(g.artillery.missions[0].impactOffsets[1]).toBeLessThan(30);
  });
  it("starts locked, spends a shared team charge once, and preserves cooldown through respawn", () => {
    const g = scene(),
      p = g.players[0];
    expect(requestArtillery(g, p, target)).toBe(false);
    ready(g);
    expect(requestArtillery(g, p, target)).toBe(true);
    const cooldown = g.artillery.readyAt.blue;
    expect(cooldown).toBe(g.tick + 900);
    expect(requestArtillery(g, { ...p, id: 1 }, target)).toBe(false);
    g.respawn(p);
    expect(g.artillery.readyAt.blue).toBe(cooldown);
    expect(g.events.filter((e) => e.type === "artilleryCall")).toHaveLength(1);
    expect(scene().artillery.readyAt.blue).toBe(300);
  });
  it("rejects hidden, blocked, airborne, dead, out-of-range and invalid markers without spending a charge", () => {
    const g = scene(trenchMap),
      p = ready(g);
    Object.assign(p, { x: -23, z: -1, y: 0 });
    expect(artilleryTargetReason(g, p, { x: 19, z: -1 })).toContain(
      "firing step",
    );
    Object.assign(p, { x: -19, y: 0.85 });
    expect(artilleryTargetReason(g, p, { x: 19, z: -1 })).toBeNull();
    const invalid = [
      { x: -18, z: -1 },
      { x: 70, z: -1 },
      { x: NaN, z: 0 },
      { x: 19, z: Infinity },
    ];
    for (const marker of invalid)
      expect(requestArtillery(g, p, marker)).toBe(false);
    p.hp = 0;
    expect(requestArtillery(g, p, { x: 19, z: -1 })).toBe(false);
    p.hp = 100;
    p.hop = { startTick: g.tick, height: 0.1, velocity: 1, originY: p.y };
    expect(requestArtillery(g, p, { x: 19, z: -1 })).toBe(false);
    p.hop = null;
    g.map.boxes.push({ x: 0, z: -1, w: 3, d: 20, h: 10, kind: "building" });
    expect(requestArtillery(g, p, { x: 19, z: -1 })).toBe(false);
    expect(g.artillery.readyAt.blue).toBe(300);
    expect(g.artillery.missions).toHaveLength(0);
  });
  it("gives four seconds of warning and spreads eight moving shells over the same four-second impact window", () => {
    const g = scene();
    ready(g);
    g.step({ ...idle(), artillery: target });
    const mission = structuredClone(g.artillery.missions[0]);
    const events = advance(
      g,
      artilleryRules.warning - artilleryRules.flightTicks - 1,
    );
    expect(g.artillery.shells).toHaveLength(0);
    g.step(idle());
    expect(g.artillery.shells).toHaveLength(1);
    const launchedAt = g.tick;
    const shell = { ...g.artillery.shells[0] };
    expect(shell.vy).toBeCloseTo(-39.75);
    expect(Math.abs(shell.vx)).toBe(15);
    g.step(idle());
    expect(g.artillery.shells[0].y).toBeLessThan(shell.y);
    expect(Math.abs(g.artillery.shells[0].x - shell.x)).toBeGreaterThan(0.3);
    events.push(...advance(g, 180));
    const impacts = events.filter((e) => e.type === "artilleryImpact");
    expect(mission.firstImpactAt - mission.calledAt).toBe(120);
    expect(impacts).toHaveLength(8);
    expect(impacts.at(-1)!.tick - impacts[0].tick).toBe(120);
    const radii = mission.impacts.map((p) =>
      Math.hypot(p.x - mission.target.x, p.z - mission.target.z),
    );
    expect(Math.max(...radii)).toBeGreaterThan(10);
    expect(radii.every((r) => r <= 14)).toBe(true);
    expect(artilleryRules.dangerRadius).toBe(26);
    expect(impacts[0].tick).toBe(mission.firstImpactAt);
    expect(impacts[0].tick - launchedAt).toBe(24);
    impacts.forEach((e, i) =>
      expect(e.tick).toBe(mission.firstImpactAt + mission.impactOffsets[i]),
    );
    impacts.forEach((e, i) => {
      expect(e.at.x).toBeCloseTo(mission.impacts[i].x, 2);
      expect(e.at.z).toBeCloseTo(mission.impacts[i].z, 2);
    });
    expect(g.artillery.shells).toHaveLength(0);
    expect(g.artillery.missions).toHaveLength(0);
    expect(g.map.destruction!.craters).toHaveLength(8);
  });
  it("keeps a confirmed barrage after caller death, serializes isolated state, and logs the complete lifecycle", () => {
    const g = scene();
    ready(g);
    g.step({ ...idle(), artillery: target });
    const log = new PlaytestLog();
    log.recordTick(g, idle(), 0);
    const snapshot = g.snapshot();
    snapshot.artillery.missions[0].target.x = 99;
    expect(g.artillery.missions[0].target.x).toBe(10);
    g.players[0].hp = 0;
    g.players[0].respawnAt = 1e9;
    for (let i = 0; i < 331; i++) {
      g.step(idle());
      log.recordTick(g, idle(), i / 30);
    }
    expect(log.summary().artilleryCalls).toBe(1);
    expect(log.summary().artilleryImpacts).toBe(8);
    expect(eventTimeline(log.events)).toContain("artilleryEnd");
    expect(g.artillery.missions).toHaveLength(0);
  });
  it("ends cleanly with shells still airborne and starts a new game without old missions or damage", () => {
    const g = scene();
    ready(g);
    requestArtillery(g, g.players[0], target);
    advance(g, artilleryRules.warning - artilleryRules.flightTicks + 1);
    expect(g.artillery.shells).toHaveLength(1);
    g.duration = g.tick + 1;
    g.step(idle());
    expect(g.artillery.missions).toHaveLength(0);
    expect(g.artillery.shells).toHaveLength(0);
    const fresh = scene();
    expect(fresh.snapshot().world!.revision).toBe(0);
    expect(fresh.artillery.missions).toHaveLength(0);
  });
  it("is deterministic and sweeps shells into roofs instead of the protected ground underneath", () => {
    const run = () => {
      const g = scene();
      ready(g);
      requestArtillery(g, g.players[0], target);
      return advance(g, 332).filter((e) => e.type === "artilleryImpact");
    };
    expect(run()).toEqual(run());
    const roof = {
      ...open,
      boxes: [{ x: 10, z: 0, w: 24, d: 24, h: 5, kind: "bunker" as const }],
    };
    const g = scene(roof);
    ready(g);
    requestArtillery(g, g.players[0], { x: -5, z: 0 });
    // Aim validation remains ground/LOS based; force this mission's scatter onto a roof to verify collision.
    g.artillery.missions[0].impacts = Array.from({ length: 8 }, () => ({
      x: 10,
      z: 0,
    }));
    const impacts = advance(g, 332).filter((e) => e.type === "artilleryImpact");
    expect(impacts).toHaveLength(8);
    for (const hit of impacts) expect(hit.at.y).toBeGreaterThanOrEqual(5);
    expect(g.map.boxes[0].h).toBe(5);
    expect(groundHeight(10, 0, g.map)).toBe(0);
  });
});

describe("artillery damage and bots", () => {
  it("excavates a broad rounded bowl, destroys light cover, respects fixed foundations and grenade friendly protection", () => {
    const g = scene();
    const p = g.players[0];
    Object.assign(p, { x: 0, z: 0, y: 0 });
    const friend = { ...p, id: 1 },
      enemy = { ...p, id: 2, team: "red" as const };
    g.players.push(friend, enemy);
    // Use a fresh runtime map so cover health is authored at construction.
    const cover = scene({
      ...open,
      boxes: [{ x: 10, z: 0, w: 1, d: 1, h: 1, kind: "wood" }],
    });
    cover.explode(
      { x: 9, y: 0.05, z: 0 },
      0,
      "blue",
      artilleryExplosionProfile,
    );
    expect(cover.map.boxes).toHaveLength(0);
    g.explode({ x: 0, y: 0.05, z: 0 }, 0, "blue", artilleryExplosionProfile);
    expect(friend.hp).toBe(100);
    expect(p.hp).toBe(0);
    expect(enemy.hp).toBe(0);
    expect(groundHeight(0, 0, g.map)).toBeCloseTo(-0.9, 3);
    expect(groundHeight(2, 0, g.map)).toBeLessThan(-0.35);
    expect(groundHeight(4, 0, g.map)).toBeCloseTo(0, 3);
  });
  it("reserves Blue's charge for the player, lets Red coordinate, and returns bots to firing positions after retreating", () => {
    const g = new Game(
      new TestCollision(trenchMap),
      true,
      5000,
      12345,
      undefined,
      { map: trenchMap, teamSize: 25 },
    );
    g.tick = 900;
    const p = g.players[1],
      red = g.players[25];
    const station = firingPosition(g, p)!;
    Object.assign(p, { ...station, y: 0.85, protectedUntil: 0 });
    const redStation = firingPosition(g, red)!;
    Object.assign(red, { ...redStation, y: 0.85, protectedUntil: 0 });
    g.tick = 925;
    expect(botCommand(g, p).artillery).toBeUndefined();
    expect(botCommand(g, red).artillery).toBeDefined();
    const original = { x: p.x, z: p.z };
    g.artillery.readyAt.red = 900;
    expect(requestArtillery(g, red, original)).toBe(true);
    expect(p.artilleryEvade).toBeNull();
    g.artillery.shells.push({
      id: 1,
      mission: g.artillery.missions[0].id,
      actor: red.id,
      team: red.team,
      ...original,
      y: 35,
      vx: 0,
      vy: -40,
      vz: 0,
      bornAt: g.tick,
    });
    const c = botCommand(g, p);
    expect(c.sprint).toBe(true);
    expect(c.fire).toBe(false);
    expect(p.artilleryEvade).not.toBeNull();
    expect(
      groundHeight(
        p.artilleryEvade!.destination.x,
        p.artilleryEvade!.destination.z,
        g.map,
      ),
    ).toBeLessThan(0.86);
    const destination = p.artilleryEvade!.destination;
    const shelterUntil = g.artillery.missions[0].endsAt;
    while (g.tick < shelterUntil - 1) {
      g.tick++;
      const c = botCommand(g, p);
      const pos = g.collision.move(p, { x: (c.x * 7) / 30, z: (c.z * 7) / 30 });
      Object.assign(p, pos, { y: groundHeight(pos.x, pos.z, g.map) });
    }
    expect(Math.hypot(p.x - original.x, p.z - original.z)).toBeGreaterThan(2);
    expect(
      Math.hypot(p.x - destination.x, p.z - destination.z),
      JSON.stringify({
        original,
        destination,
        at: { x: p.x, z: p.z },
        path: p.path,
      }),
    ).toBeLessThan(1);
    g.tick = g.artillery.missions[0].endsAt + 1;
    g.artillery.missions = [];
    g.artillery.shells = [];
    g.tick = Math.max(g.tick, p.artilleryEvade!.until + 1);
    botCommand(g, p);
    expect(p.artilleryEvade).toBeNull();
    expect(p.path.length).toBeGreaterThan(0);
  });
  it.each(["blue", "red"] as const)(
    "reserves %s artillery for its human even while dead, and rejects bot requests in the simulation",
    (team) => {
      const humanId = team === "blue" ? 0 : 2;
      const g = new Game(
        new TestCollision(open),
        true,
        5000,
        12345,
        undefined,
        {
          map: open,
          teamSize: 2,
          humanPlayerIds: [humanId],
        },
      );
      g.players.forEach((p) =>
        Object.assign(p, {
          x: p.team === "blue" ? -25 : 25,
          z: 0,
          y: 0,
          protectedUntil: 0,
        }),
      );
      const human = g.players[humanId],
        teammate = g.players[humanId + 1];
      const enemy = g.players.find((p) => p.team !== team)!;
      g.tick = 900 + teammate.id;
      expect(botArtilleryTarget(g, teammate)).toBeNull();
      expect(requestArtillery(g, teammate, enemy)).toBe(false);
      expect(g.artillery.readyAt[team]).toBe(300);
      human.hp = 0;
      expect(requestArtillery(g, teammate, enemy)).toBe(false);
      expect(botArtilleryTarget(g, teammate)).toBeNull();
      expect(botArtilleryTarget(g, human)).toBeNull();
      human.hp = 100;
      expect(requestArtillery(g, human, enemy)).toBe(true);
      expect(
        g.events.filter((e) => e.type === "artilleryCall").map((e) => e.actor),
      ).toEqual([humanId]);
      expect(g.snapshot().humanPlayerIds).toEqual([humanId]);
      g.tick = 930 + enemy.id;
      expect(botArtilleryTarget(g, enemy)).not.toBeNull();
      expect(requestArtillery(g, enemy, human)).toBe(true);
    },
  );
  it("lets either team and slot zero call automatically when no humans are playing", () => {
    const g = new Game(new TestCollision(open), true, 5000, 12345, undefined, {
      map: open,
      teamSize: 2,
      humanPlayerIds: [],
    });
    g.players.forEach((p) =>
      Object.assign(p, {
        x: p.team === "blue" ? -25 : 25,
        z: 0,
        y: 0,
        protectedUntil: 0,
      }),
    );
    for (const p of [g.players[0], g.players[2]]) {
      g.tick = 900 + p.id;
      const marker = botArtilleryTarget(g, p);
      expect(marker).not.toBeNull();
      expect(requestArtillery(g, p, marker!)).toBe(true);
    }
    expect(g.events.filter((e) => e.type === "artilleryCall")).toHaveLength(2);
    expect(g.snapshot().humanPlayerIds).toEqual([]);
  });
  it("relocates firing posts whose steps are excavated, and lets horizon/downward aim select ground", () => {
    const g = scene(trenchMap),
      p = g.players[0];
    const original = firingPosition(g, p)!;
    g.explode({ ...original, y: 0.9 }, 0, "blue", artilleryExplosionProfile);
    expect(firingPosition(g, p)).not.toEqual(original);
    const flat = scene(),
      soldier = flat.players[0];
    expect(artilleryAim(flat, soldier, Math.PI / 2, 0).x).toBeCloseTo(20);
    expect(artilleryAim(flat, soldier, Math.PI / 2, -0.05).x).toBeGreaterThan(
      -10,
    );
  });
});
