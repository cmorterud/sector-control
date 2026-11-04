import { describe, expect, it } from "vitest";
import {
  Game,
  TestCollision,
  idle,
  botCommand,
  firingPosition,
  type Event,
  type Projectile,
} from "./simulation";
import {
  smokeBlocks,
  smokeDensity,
  smokeRules,
  type SmokeCloud,
} from "./smoke";
import {
  suppressionCommand,
  suppressNearMiss,
  suppressionRules,
} from "./suppression";
import { advanceAssaults, assaultCommand } from "./assault";
import { requestArtillery } from "./artillery";
import { industrialMap, groundHeight, type MapDefinition } from "./map";
import { trenchMap } from "./trench-map";
import { PlaytestLog } from "./playtest";
const open: MapDefinition = {
  ...industrialMap,
  boxes: [],
  spawn: { blue: { x: 0, z: 0 }, red: { x: 20, z: 0 } },
};
function scene(map = open) {
  const g = new Game(new TestCollision(map), false, 5000, 12345, undefined, {
    map,
    assaults: false,
  });
  Object.assign(g.players[0], {
    x: 0,
    z: 0,
    y: groundHeight(0, 0, g.map),
    protectedUntil: 0,
  });
  return g;
}
function enemy(g: Game) {
  const p = {
    ...g.players[0],
    id: g.players.length,
    team: "red" as const,
    x: 20,
    y: 0,
    z: 0,
    nextThink: 1e9,
    target: -1,
    protectedUntil: 0,
  };
  g.players.push(p);
  return p;
}
function cloud(g: Game, x = 10): SmokeCloud {
  return {
    id: ++g.smokeSequence,
    actor: 0,
    team: "blue",
    x,
    y: 1.5,
    z: 0,
    bornAt: g.tick - 60,
    expiresAt: g.tick + 600,
  };
}
function advance(g: Game, n: number) {
  const ev: Event[] = [];
  for (let i = 0; i < n; i++) {
    g.step(idle());
    ev.push(...g.events);
  }
  return ev;
}
const shot = (): Projectile => ({
  id: 1,
  actor: 0,
  team: "blue",
  x: 0,
  y: 1.5,
  z: 0,
  vx: 32,
  vy: 0,
  vz: 0,
  remaining: 60,
  bornAt: 0,
});

describe("concealing smoke", () => {
  it("throws smoke with its own inventory, blooms without damage or excavation, records it, and replenishes on respawn", () => {
    const g = scene(),
      p = g.players[0],
      log = new PlaytestLog();
    const c = { ...idle(), smoke: true, yaw: Math.PI / 2 };
    g.step(c);
    log.recordTick(g, c, 0);
    expect(p.smokes).toBe(1);
    expect(p.grenades).toBe(3);
    expect(p.ammo).toBe(30);
    expect(g.grenades[0].kind).toBe("smoke");
    for (let i = 0; i < 100; i++) {
      g.step(idle());
      log.recordTick(g, idle(), i / 30);
    }
    expect(log.summary().smokeThrows).toBe(1);
    expect(log.summary().smokeClouds).toBe(1);
    expect(g.smokeClouds).toHaveLength(1);
    expect(p.hp).toBe(100);
    expect(g.map.destruction!.revision).toBe(0);
    const snapshot = g.snapshot();
    snapshot.smokeClouds[0].x = 99;
    expect(g.smokeClouds[0].x).not.toBe(99);
    g.respawn(p);
    expect(p.smokes).toBe(2);
    expect(g.smokeClouds).toHaveLength(1);
  });
  it("blocks both viewing directions as it thickens, permits close silhouettes and rays above it, and fades", () => {
    const g = scene();
    g.tick = 100;
    const s = cloud(g, 0);
    g.smokeClouds = [s];
    const a = { x: -10, y: 1.5, z: 0 },
      b = { x: 10, y: 1.5, z: 0 };
    expect(smokeBlocks(g, a, b)).toBe(true);
    expect(smokeBlocks(g, b, a)).toBe(true);
    expect(
      smokeBlocks(g, { x: -0.3, y: 1.5, z: 0 }, { x: 0.3, y: 1.5, z: 0 }),
    ).toBe(false);
    expect(smokeBlocks(g, { ...a, y: 7 }, { ...b, y: 7 })).toBe(false);
    s.bornAt = g.tick;
    expect(smokeDensity(s, g.tick)).toBe(0);
    expect(smokeBlocks(g, a, b)).toBe(false);
    s.bornAt = g.tick - 60;
    s.expiresAt = g.tick + 1;
    expect(smokeBlocks(g, a, b)).toBe(false);
    g.step(idle());
    expect(g.smokeClouds).toHaveLength(0);
    expect(g.events.some((e) => e.type === "smokeEnd")).toBe(true);
  });
  it("removes a bot target immediately and requires a fresh reaction after visibility returns", () => {
    const g = scene(),
      p = g.players[0];
    enemy(g);
    g.tick = 12;
    expect(botCommand(g, p).fire).toBe(false);
    g.tick = 24;
    botCommand(g, p);
    g.tick = 25;
    expect(botCommand(g, p).fire).toBe(true);
    g.smokeClouds = [cloud(g)];
    expect(botCommand(g, p).fire).toBe(false);
    expect(p.target).toBe(-1);
    g.smokeClouds = [];
    g.tick = 27;
    expect(botCommand(g, p).fire).toBe(false);
    g.tick = 49;
    expect(botCommand(g, p).fire).toBe(true);
  });
  it("lets bullets travel through smoke and deal normal damage", () => {
    const g = scene(),
      p = enemy(g);
    g.botSettings.engagementRange = 0;
    g.smokeClouds = [cloud(g)];
    g.projectiles = Array.from({ length: 4 }, (_, i) => ({
      ...shot(),
      id: i + 1,
      y: 1.1,
    }));
    advance(g, 40);
    expect(p.hp).toBe(0);
    expect(g.smokeClouds).toHaveLength(1);
  });
  it("rejects an artillery sighting obscured by smoke without consuming a charge", () => {
    const g = scene();
    g.tick = 900;
    g.smokeClouds = [cloud(g)];
    expect(requestArtillery(g, g.players[0], { x: 25, z: 0 })).toBe(false);
    expect(g.artillery.readyAt.blue).toBe(900);
  });
  it("clears canisters/clouds at match end and restores fresh inventory/state in a new game", () => {
    const g = scene();
    g.smokeClouds = [cloud(g)];
    g.step({ ...idle(), smoke: true });
    g.duration = g.tick + 1;
    g.step(idle());
    expect(g.smokeClouds).toHaveLength(0);
    expect(g.grenades).toHaveLength(0);
    expect(scene().smokeClouds).toHaveLength(0);
  });
});

describe("near-miss suppression", () => {
  it("accumulates from distinct enemy rounds, counts a round once, and recovers when fire stops", () => {
    const g = scene(),
      p = enemy(g);
    Object.assign(p, { x: 0 });
    g.tick = 100;
    const from = { x: -2, y: 1.5, z: 1 },
      to = { x: 2, y: 1.5, z: 1 },
      s = shot();
    suppressNearMiss(g, p, s, from, to);
    const first = p.suppression;
    expect(first).toBeGreaterThan(0);
    suppressNearMiss(g, p, s, from, to);
    expect(p.suppression).toBe(first);
    for (let i = 0; i < 4; i++)
      suppressNearMiss(g, p, { ...shot(), id: i + 2 }, from, to);
    expect(p.suppression).toBeGreaterThan(suppressionRules.threshold);
    expect(g.events.some((e) => e.type === "suppression")).toBe(true);
    g.botSettings.engagementRange = 0;
    advance(g, 150);
    expect(p.suppression).toBe(0);
  });
  it("ignores friendly and protected soldiers and near misses behind solid cover", () => {
    const g = scene(),
      p = enemy(g);
    p.x = 0;
    const from = { x: -2, y: 1.5, z: 1 },
      to = { x: 2, y: 1.5, z: 1 };
    suppressNearMiss(g, g.players[0], shot(), from, to);
    expect(g.players[0].suppression).toBe(0);
    p.protectedUntil = 100;
    suppressNearMiss(g, p, shot(), from, to);
    expect(p.suppression).toBe(0);
    p.protectedUntil = 0;
    g.collision.ray = () => 0;
    suppressNearMiss(g, p, shot(), from, to);
    expect(p.suppression).toBe(0);
  });
  it("uses the clipped projectile segment so a wall shields soldiers from rounds on the other side", () => {
    const g = scene({
      ...open,
      boxes: [{ x: 5, z: 0, w: 1, d: 10, h: 4, kind: "building" }],
    });
    const p = enemy(g);
    p.x = 6;
    g.botSettings.engagementRange = 0;
    for (let i = 0; i < 20; i++)
      g.step({ ...idle(), yaw: Math.PI / 2, fire: i < 9 });
    expect(p.hp).toBe(100);
    expect(p.suppression).toBe(0);
  });
  it("moves a pinned bot off the firing step and releases it to resume its post", () => {
    const g = new Game(
      new TestCollision(trenchMap),
      true,
      5000,
      12345,
      undefined,
      { map: trenchMap, teamSize: 25, assaults: false },
    );
    const p = g.players[1];
    Object.assign(p, {
      ...firingPosition(g, p),
      y: 0.85,
      suppression: 1,
      protectedUntil: 0,
    });
    g.tick = 100;
    let c = suppressionCommand(g, p)!;
    expect(c.fire).toBe(false);
    expect(c.sprint).toBe(true);
    for (let i = 0; i < 44; i++) {
      g.tick++;
      c = suppressionCommand(g, p)!;
      const pos = g.collision.move(p, { x: (c.x * 7) / 30, z: (c.z * 7) / 30 });
      Object.assign(p, pos, { y: groundHeight(pos.x, pos.z, g.map) });
    }
    expect(p.y).toBeLessThan(0.1);
    g.tick++;
    expect(suppressionCommand(g, p)).toBeNull();
    expect(p.duckUntil).toBe(0);
    expect(botCommand(g, p).x).toBeGreaterThan(0);
  });
  it("gives a human near-miss feedback without changing their movement, aim, or forcing a duck", () => {
    const g = scene(),
      p = g.players[0];
    const s = { ...shot(), actor: 1, team: "red" as const };
    g.tick = 100;
    for (let i = 0; i < 4; i++)
      suppressNearMiss(
        g,
        p,
        { ...s, id: i },
        { x: -2, y: 1.5, z: 0.7 },
        { x: 2, y: 1.5, z: 0.7 },
      );
    expect(g.events.filter((e) => e.type === "nearMiss")).toHaveLength(1);
    g.step({ ...idle(), yaw: 0.6, pitch: 0.2, x: 0.5 });
    expect(p.yaw).toBe(0.6);
    expect(p.pitch).toBe(0.2);
    expect(p.duckUntil).toBe(0);
    expect(p.x).toBeGreaterThan(0);
    g.respawn(p);
    expect(p.suppression).toBe(0);
    expect(p.duckUntil).toBe(0);
  });
});

describe("covered squad advances", () => {
  function formedSquad() {
    const g = new Game(
      new TestCollision(trenchMap),
      true,
      5000,
      12345,
      undefined,
      { map: trenchMap, teamSize: 25 },
    );
    g.artillery.enabled = false;
    g.botSettings.engagementRange = 0;
    for (const p of g.players)
      Object.assign(p, { ...firingPosition(g, p), y: 0.85, protectedUntil: 0 });
    g.tick = 540;
    advanceAssaults(g);
    return { g, m: g.assaults.missions[0] };
  }
  it("replaces a dead smoke carrier and still gets survivors out into the field", () => {
    const { g, m } = formedSquad();
    g.players[m.leader].hp = 0;
    const replacement = g.players[m.members.find((id) => id !== m.leader)!];
    expect(assaultCommand(g, replacement, idle()).smoke).toBe(true);
    let thrown = false,
      crossed = false;
    for (let i = 0; i < 450 && !crossed; i++) {
      g.step(idle());
      thrown ||= g.events.some(
        (e) => e.type === "smokeThrow" && e.actor === replacement.id,
      );
      crossed = m.members.some(
        (id) => g.players[id].hp > 0 && Math.abs(g.players[id].x) < 15,
      );
    }
    expect(thrown).toBe(true);
    expect(crossed).toBe(true);
    expect(g.players[0].assaultId).toBeNull();
  });
  it("waits for thick smoke before leaving, then keeps moving if that cloud disappears", () => {
    const { g, m } = formedSquad(),
      p = g.players[m.members[1]];
    m.waitUntil[p.id] = g.tick;
    m.screens[0] = { actor: m.leader, tick: g.tick };
    g.smokeClouds.push({ ...cloud(g), actor: m.leader, bornAt: g.tick });
    expect(assaultCommand(g, p, idle()).x).toBe(0);
    g.tick += 60;
    expect(assaultCommand(g, p, idle()).x).toBeGreaterThan(0);
    g.smokeClouds = [];
    expect(assaultCommand(g, p, idle()).x).toBeGreaterThan(0);
  });
  it("lets stranded survivors dash onward without inventing smoke inventory", () => {
    const { g, m } = formedSquad(),
      p = g.players[m.members[1]];
    for (const id of m.members) g.players[id].smokes = 0;
    m.waitUntil[p.id] = g.tick;
    expect(assaultCommand(g, p, idle()).x).toBe(0);
    m.progress[p.id] = 1;
    Object.assign(p, m.route[0]);
    expect(assaultCommand(g, p, idle()).x).toBe(0);
    g.tick += 90;
    const c = assaultCommand(g, p, idle());
    expect(c.x).toBeGreaterThan(0);
    expect(c.sprint).toBe(true);
    expect(c.smoke).not.toBe(true);
    expect(p.smokes).toBe(0);
  });
  it("sends another small wave after a failed attempt while leaving most soldiers at their posts", () => {
    const { g, m } = formedSquad();
    for (const id of m.members) g.players[id].hp = 0;
    advanceAssaults(g);
    const next = g.assaults.readyAt.blue;
    expect(next - g.tick).toBeGreaterThanOrEqual(18 * 30);
    expect(next - g.tick).toBeLessThanOrEqual(24 * 30);
    for (const id of m.members) {
      const p = g.players[id];
      g.respawn(p);
      Object.assign(p, { ...firingPosition(g, p), y: 0.85 });
    }
    g.tick = next - 1;
    advanceAssaults(g);
    expect(g.assaults.missions.some((q) => q.team === "blue")).toBe(false);
    g.tick = next;
    advanceAssaults(g);
    const wave = g.assaults.missions.find((q) => q.team === "blue")!;
    expect(wave.members.length).toBeGreaterThanOrEqual(3);
    expect(wave.members.length).toBeLessThanOrEqual(4);
    expect(
      g.players.filter((p) => p.assaultId === null).length,
    ).toBeGreaterThan(40);
  });
  it("forms a small group of bots without assigning a human or sending the entire team", () => {
    const g = new Game(
      new TestCollision(trenchMap),
      true,
      5000,
      12345,
      undefined,
      { map: trenchMap, teamSize: 25, humanPlayerIds: [1] },
    );
    for (const p of g.players)
      Object.assign(p, { ...firingPosition(g, p), y: 0.85, protectedUntil: 0 });
    g.tick = 540;
    advanceAssaults(g);
    const m = g.assaults.missions[0];
    expect(m).toBeDefined();
    expect(m.members.length).toBeGreaterThanOrEqual(3);
    expect(m.members.length).toBeLessThanOrEqual(4);
    expect(m.members).not.toContain(1);
    expect(m.team).toBe("blue");
    expect(
      g.players.filter((p) => p.assaultId === null).length,
    ).toBeGreaterThan(40);
    const human = g.players[1];
    expect(human.assaultId).toBeNull();
    const mover = g.players[m.members[1]];
    const c = botCommand(g, mover);
    expect(c.mantle).toBe(false);
    expect(Math.hypot(c.x, c.z)).toBe(0);
    for (const id of m.members) g.players[id].hp = 0;
    advanceAssaults(g);
    expect(g.assaults.missions).toHaveLength(0);
  });
  it("keeps assault behavior disabled for industrial combat and resets squad membership on respawn", () => {
    const g = scene();
    expect(g.assaults.enabled).toBe(false);
    const p = g.players[0];
    p.assaultId = 1;
    p.forwardPost = { x: 10, z: 0 };
    g.respawn(p);
    expect(p.assaultId).toBeNull();
    expect(p.forwardPost).toBeNull();
  });
  it("lets a screened squad reach the opposing trench when defenders are not firing", () => {
    const g = new Game(
      new TestCollision(trenchMap),
      true,
      5000,
      12345,
      undefined,
      { map: trenchMap, teamSize: 25, humanPlayerIds: [] },
    );
    g.artillery.enabled = false;
    g.botSettings.engagementRange = 0;
    for (const p of g.players)
      Object.assign(p, { ...firingPosition(g, p), y: 0.85, protectedUntil: 0 });
    g.tick = 540;
    let arrived = false;
    for (let i = 0; i < 1800 && !arrived; i++) {
      g.step(botCommand(g, g.players[0]));
      arrived = g.events.some(
        (e) => e.type === "assaultProgress" && e.stage === "trench",
      );
    }
    expect(arrived).toBe(true);
    expect(
      g.players.some(
        (p) =>
          p.forwardPost &&
          (p.team === "blue" ? p.x > 18 : p.x < -18) &&
          p.y < 1.5,
      ),
    ).toBe(true);
  });
  it("runs a real 25v25 advance through smoke into crater cover with sustained covering fire", () => {
    const g = new Game(
      new TestCollision(trenchMap),
      true,
      90 * 30,
      12345,
      undefined,
      { map: trenchMap, teamSize: 25, humanPlayerIds: [] },
    );
    const log = new PlaytestLog();
    for (let i = 0; i < 90 * 30; i++) {
      const c = botCommand(g, g.players[0]);
      g.step(c);
      log.recordTick(g, c, i / 30);
    }
    const summary = log.summary();
    expect(summary.assaults).toBeGreaterThan(0);
    expect(summary.smokeClouds).toBeGreaterThan(0);
    expect(summary.ducks).toBeGreaterThan(0);
    expect(summary.craterArrivals).toBeGreaterThan(0);
    expect(
      log.events.some(
        (e) => e.type === "assaultProgress" && e.stage === "forwardCrater",
      ),
    ).toBe(true);
    expect(summary.shots).toBeGreaterThan(1000);
    expect(
      log.events.some((e) => e.type === "mantle" && e.phase === "start"),
    ).toBe(true);
    expect(
      log.samples.some((s) =>
        s.state.players.some((p) => p.hp > 0 && Math.abs(p.x) < 15),
      ),
    ).toBe(true);
    expect(g.assaults.missions).toHaveLength(0);
    expect(g.smokeClouds).toHaveLength(0);
  }, 10000);
});
