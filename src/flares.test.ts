import { expect, it } from "vitest";
import { botFlareTarget, flareBrightness, flareLight, flarePosition, flareRules, flareTargetReason, requestFlare } from "./flares";
import { artilleryRules, botArtilleryTarget, requestArtillery } from "./artillery";
import { sightLimit } from "./night";
import { nightRaidMap } from "./night-map";
import { trenchMap } from "./trench-map";
import { groundHeight } from "./map";
import { Game, TestCollision, botCommand, idle, rifleHeight } from "./simulation";

const match = (map = nightRaidMap, humanPlayerIds: number[] = []) => new Game(new TestCollision(map), true, 7200, 12345, undefined,
  { map, teamSize: 6, humanPlayerIds, ambientArtillery: false });
// Steps the match, returning the flare events raised along the way.
const run = (g: Game, ticks: number) => {
  const phases: string[] = [];
  for (let i = 0; i < ticks; i++) {
    g.step(idle());
    for (const e of g.events) if (e.type === "flare" && e.tick === g.tick) phases.push(e.phase);
  }
  return phases;
};
// Everyone but the two under test waits, dead, in a corner.
function pair(g: Game) {
  const p = g.players[0], enemy = g.players[g.teamSize];
  for (const q of g.players) if (q !== p && q !== enemy) Object.assign(q, { x: q.team === "blue" ? -70 : 70, z: 55, hp: 0 });
  return { p, enemy };
}
const stand = (g: Game, q: Game["players"][0], x: number, z: number, yaw = 0) =>
  Object.assign(q, { x, z, y: groundHeight(x, z, g.map), yaw, hp: 100, target: -1 });

it("has flares only at night", () => {
  const day = match(trenchMap, [0]);
  day.tick = 600;
  expect(flareTargetReason(day, day.players[0], { x: 0, z: 0, area: true })).toBe("No flares on this battlefield");
  expect(requestFlare(day, day.players[0], { x: 0, z: 0, area: true })).toBe(false);
  const night = match(nightRaidMap, [0]);
  night.tick = 600;
  expect(flareTargetReason(night, night.players[0], { x: 0, z: 0, area: true })).toBeNull();
});

it("keeps the flare and artillery cooldowns apart", () => {
  const g = match(nightRaidMap, [0]), p = g.players[0];
  g.tick = Math.max(flareRules.initialDelay, artilleryRules.initialDelay) + 1;
  const guns = g.artillery.readyAt.blue;
  expect(requestFlare(g, p, { x: 0, z: 10, area: true })).toBe(true);
  // The flare started its own clock and left the guns alone.
  expect(g.flares.readyAt.blue).toBe(g.tick + flareRules.cooldown);
  expect(g.artillery.readyAt.blue).toBe(guns);
  expect(g.flares.readyAt.red).toBe(flareRules.initialDelay);
  // A barrage can follow at once, and does not delay the next flare.
  const flareReady = g.flares.readyAt.blue;
  expect(requestArtillery(g, p, { x: -10, z: 10, area: true })).toBe(true);
  expect(g.artillery.readyAt.blue).toBe(g.tick + artilleryRules.cooldown);
  expect(g.flares.readyAt.blue).toBe(flareReady);
  // A second flare has to wait for the first one's cooldown, and no longer.
  expect(requestFlare(g, p, { x: 0, z: 10, area: true })).toBe(false);
  expect(flareTargetReason(g, p, { x: 0, z: 10, area: true })).toBe("Flare pistol is reloading");
  g.tick = flareReady;
  expect(requestFlare(g, p, { x: 0, z: -10, area: true })).toBe(true);
  expect(flareRules.cooldown).toBeLessThan(artilleryRules.cooldown);
});

it("bursts overhead after its flight, sinks and drifts, then burns out", () => {
  const g = match(nightRaidMap, [0]), p = g.players[0];
  run(g, flareRules.initialDelay + 1);
  expect(requestFlare(g, p, { x: 3, z: 9 })).toBe(true);
  const flare = g.flares.flares[0];
  expect(g.events.filter((e) => e.type === "flare").map((e) => e.type === "flare" && e.phase)).toEqual(["call"]);
  expect(flare).toMatchObject({ team: "blue", actor: 0, x: 3, z: 9, burstAt: g.tick + flareRules.flightTicks });
  // Dark until it bursts.
  expect(flarePosition(flare, g.tick)).toBeNull();
  expect(flareLight(g, { x: 3, z: 9 })).toBe(0);
  expect(run(g, flareRules.flightTicks + 1)).toEqual(["burst"]);
  const start = flarePosition(flare, flare.burstAt)!;
  expect(start).toMatchObject({ x: 3, z: 9, y: flareRules.burstHeight });
  // Full light directly beneath within a third of a second.
  run(g, 12);
  expect(flareLight(g, { x: 3, z: 9 })).toBeGreaterThan(0.85);
  const late = flarePosition(flare, flare.endsAt - 1)!;
  expect(late.y).toBeCloseTo(flareRules.endHeight, 0);
  expect(Math.hypot(late.x - 3, late.z - 9)).toBeCloseTo(flareRules.drift * flareRules.burnTicks / 30, 0);
  // It gutters over its last seconds and is gone at the end.
  expect(flareBrightness(flare, flare.endsAt - 30)).toBeLessThan(0.4);
  run(g, flareRules.burnTicks);
  // Red's bots may have sent up their own by now; this one is spent.
  expect(g.flares.flares.some((f) => f.id === flare.id)).toBe(false);
  expect(flarePosition(flare, g.tick)).toBeNull();
  expect(flareBrightness(flare, g.tick)).toBe(0);
});

it("lights a circle of ground and lifts the sight limit inside it", () => {
  const g = match(nightRaidMap, [0]);
  run(g, flareRules.initialDelay + 1);
  requestFlare(g, g.players[0], { x: 0, z: 10 });
  run(g, flareRules.flightTicks + 15);
  const at = flarePosition(g.flares.flares[0], g.tick)!;
  expect(sightLimit(g, { x: at.x, z: at.z })).toBeGreaterThan(80);
  let previous = Infinity;
  for (const fraction of [0, 0.3, 0.6, 0.9, 1.05]) {
    const limit = sightLimit(g, { x: at.x + flareRules.radius * fraction, z: at.z });
    expect(limit).toBeLessThanOrEqual(previous);
    previous = limit;
  }
  // Beyond the circle it is as dark as before.
  expect(previous).toBe(15);
  expect(sightLimit(g, { x: at.x + 60, z: at.z })).toBe(15);
  // The map alone, without the match, knows nothing of flares.
  expect(sightLimit({ map: nightRaidMap }, { x: at.x, z: at.z })).toBe(15);
});

it("shows an enemy under a flare to a bot forty meters away, and hides them again when it burns out", () => {
  const g = match(), { p, enemy } = pair(g);
  const look = () => {
    stand(g, enemy, 6, 12);
    stand(g, p, -34, 12, Math.PI / 2);
    p.awareness.nextLook = g.tick;
    expect(g.collision.ray({ x: p.x, y: p.y + rifleHeight(g.map, p), z: p.z }, { x: enemy.x, y: enemy.y + 1.25, z: enemy.z })).toBeGreaterThan(0.99);
    botCommand(g, p);
    return p.target === enemy.id;
  };
  g.tick = flareRules.initialDelay + 1;
  expect(look()).toBe(false);
  g.flares.flares.push({ id: 1, team: "blue", actor: p.id, x: 6, z: 12, heading: 0, burstAt: g.tick - 30, endsAt: g.tick - 30 + flareRules.burnTicks });
  expect(look()).toBe(true);
  g.tick += flareRules.burnTicks;
  g.flares.flares = [];
  expect(look()).toBe(false);
});

it("lets a bot spotter call artillery at night only onto ground it can see", () => {
  const spot = (map: typeof nightRaidMap, lit: boolean) => {
    const g = match(map), { p, enemy } = pair(g);
    g.tick = artilleryRules.initialDelay + 30;
    // A spotter on open ground with a clear view of an enemy 45 m off.
    stand(g, enemy, 12, 12);
    stand(g, p, -33, 12, Math.PI / 2);
    enemy.protectedUntil = 0;
    if (lit) g.flares.flares.push({ id: 1, team: "blue", actor: p.id, x: 12, z: 12, heading: 0, burstAt: g.tick - 30, endsAt: g.tick + 600 });
    for (let i = 0; i < 30 && g.tick % 30 !== p.id % 30; i++) g.tick++;
    return botArtilleryTarget(g, p);
  };
  // By day the same spotter calls it in, so the setup is sound.
  expect(spot(trenchMap, false)).toMatchObject({ x: 12, z: 12 });
  expect(spot(nightRaidMap, false)).toBeNull();
  expect(spot(nightRaidMap, true)).toMatchObject({ x: 12, z: 12 });
});

it("has bots send a flare over enemies they hear firing in the dark", () => {
  const g = match(), { p, enemy } = pair(g);
  g.tick = flareRules.initialDelay + 30;
  stand(g, enemy, 10, 20);
  stand(g, p, -30, 20, Math.PI / 2);
  for (let i = 0; i < 30 && g.tick % 30 !== p.id % 30; i++) g.tick++;
  // Silent and unseen: nothing to light yet.
  enemy.lastShotAt = -1000;
  expect(botFlareTarget(g, p)).toBeNull();
  enemy.lastShotAt = g.tick - 10;
  expect(botFlareTarget(g, p)).toMatchObject({ x: 10, z: 20 });
  // Already under a flare: no need for another.
  g.flares.flares.push({ id: 1, team: "blue", actor: p.id, x: 10, z: 20, heading: 0, burstAt: g.tick - 30, endsAt: g.tick + 600 });
  expect(botFlareTarget(g, p)).toBeNull();
  g.flares.flares = [];
  // Too close to need one, and nothing at all by day.
  stand(g, enemy, -20, 20);
  enemy.lastShotAt = g.tick - 10;
  expect(botFlareTarget(g, p)).toBeNull();
  const day = match(trenchMap), dayPair = pair(day);
  day.tick = g.tick;
  stand(day, dayPair.enemy, 10, 20);
  stand(day, dayPair.p, -30, 20, Math.PI / 2);
  dayPair.enemy.lastShotAt = day.tick - 10;
  expect(botFlareTarget(day, dayPair.p)).toBeNull();
});

it("sees both sides send up flares in a bot match, and leaves them to the player on a human's team", () => {
  const g = match();
  const calls = { blue: 0, red: 0 };
  for (let i = 0; i < 3600; i++) {
    g.step(idle());
    for (const e of g.events) if (e.type === "flare" && e.phase === "call" && e.tick === g.tick) calls[e.team]++;
  }
  expect(calls.blue).toBeGreaterThanOrEqual(2);
  expect(calls.red).toBeGreaterThanOrEqual(2);
  // No team can outpace its cooldown.
  expect(calls.blue).toBeLessThanOrEqual(Math.ceil(3600 / flareRules.cooldown));
  const mixed = match(nightRaidMap, [0]);
  let blue = 0;
  for (let i = 0; i < 1800; i++) {
    mixed.step(idle());
    for (const e of mixed.events) if (e.type === "flare" && e.phase === "call" && e.tick === mixed.tick && e.team === "blue") blue++;
  }
  expect(blue).toBe(0);
  // Three simulated minutes of bot play.
}, 30_000);
