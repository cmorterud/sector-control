import { expect, it } from "vitest";
import { artilleryRules } from "./artillery";
import { cloudDensity, cloudExposure, gasRules, gasStrikeReason, gasStrikeRules, maskProgress, masked } from "./gas";
import { groundHeight } from "./map";
import { Game, TestCollision, botCommand, idle, type Command, type Event as GameEvent } from "./simulation";
import { trenchMap } from "./trench-map";

const place = (g: Game, x: number, z: number, id = 0) =>
  Object.assign(g.players[id], { x, z, y: groundHeight(x, z, g.map), vx: 0, vz: 0 });
const run = (g: Game, ticks: number, command: Partial<Command> = {}) => {
  const events: GameEvent[] = [];
  for (let i = 0; i < ticks && g.phase === "playing"; i++) {
    g.step({ ...idle(), ...command });
    events.push(...g.events);
  }
  return events;
};
const cloudAt = (g: Game, x: number, z: number, team: "blue" | "red" = "red", actor = g.teamSize) =>
  g.gas.clouds.push({ id: ++g.gas.sequence, team, actor, x, z, heading: Math.PI / 2, landAt: g.tick - 90, endsAt: g.tick + 600 });

it("has no gas, creeping or otherwise, until someone fires gas shells", () => {
  const g = new Game(new TestCollision(trenchMap), false, 120 * 30, 12345, undefined, { map: trenchMap, ambientArtillery: false });
  place(g, -79, 60);
  const events = run(g, 60 * 30);
  expect(events.some((e) => e.type === "gasStrike" || (e.type === "damage" && e.kind === "gas"))).toBe(false);
  expect(g.players[0].hp).toBe(100);
  expect(g.gas.clouds).toHaveLength(0);
});

it("takes a second to pull the mask on, keeps the hands busy and cuts gas damage to a slow burn", () => {
  const g = new Game(new TestCollision(trenchMap), false, 480 * 30, 12345, undefined, { map: trenchMap, ambientArtillery: false });
  const p = g.players[0];
  place(g, 0, 0);
  const on = run(g, 1, { gasMask: true });
  expect(on.find((e) => e.type === "gasMask")).toMatchObject({ actor: 0, worn: true });
  expect(maskProgress(p, g.tick + 14)).toBeCloseTo(14 / 30);
  expect(masked(p, g.tick + gasRules.donTicks - 2)).toBe(false);
  // Hands at the face: no shot while the mask goes on.
  const busy = run(g, gasRules.donTicks - 2, { fire: true });
  expect(busy.some((e) => e.type === "fire")).toBe(false);
  run(g, 2);
  expect(masked(p, g.tick)).toBe(true);
  cloudAt(g, 0, 0);
  const before = p.hp;
  run(g, 60);
  expect(before - p.hp).toBeCloseTo(gasStrikeRules.maskedPerSecond * 2, 5);
  // Taking it off is quicker, and protection ends at once.
  run(g, 1, { gasMask: true });
  expect(masked(p, g.tick)).toBe(false);
  expect(maskProgress(p, g.tick + gasRules.doffTicks)).toBe(0);
  // Changing your mind halfway costs only the part already done.
  run(g, 5, { gasMask: false });
  run(g, 1, { gasMask: true });
  expect(maskProgress(p, g.tick)).toBeCloseTo(1 - 6 / gasRules.doffTicks);
  expect(masked(p, g.tick + 12)).toBe(true);
  // Redeploying puts you back bare-faced.
  g.respawn(p);
  expect(p.gasMask).toBeNull();
});

it("fires gas shells as an alternate artillery strike on the shared artillery cooldown", () => {
  const g = new Game(new TestCollision(trenchMap), true, 480 * 30, 5, undefined, { map: trenchMap, ambientArtillery: false, teamSize: 3 });
  g.commandOverride = () => idle();
  const human = g.players[0];
  place(g, -20, 0, 0);
  human.protectedUntil = 0;
  g.tick = artilleryRules.initialDelay;
  const target = { x: 10, z: 0, area: true as const };
  // The same rules as a fire mission, plus no gas onto a deployment.
  expect(gasStrikeReason(g, human, { x: -60, z: 0, area: true })).toBe("Too close to a deployment area");
  expect(gasStrikeReason(g, human, { x: 80, z: 0, area: true })).toBe("Mark ground 15–70 m away");
  const call = run(g, 1, { gasStrike: target }).find((e) => e.type === "gasStrike");
  expect(call).toMatchObject({ phase: "call", actor: 0 });
  expect(g.artillery.readyAt.blue).toBe(g.tick + artilleryRules.cooldown);
  // Gas instead of high explosive: neither is available until the battery reloads.
  expect(gasStrikeReason(g, human, target)).toBe("Artillery is reloading");
  const shells = run(g, 1, { artillery: target });
  expect(shells.some((e) => e.type === "artilleryCall")).toBe(false);
  expect(g.artillery.missions).toHaveLength(0);
});

it("drops a cloud that lingers about 25 seconds, drifts and hurts the unmasked most", () => {
  const g = new Game(new TestCollision(trenchMap), true, 480 * 30, 5, undefined, { map: trenchMap, ambientArtillery: false, teamSize: 3, humanPlayerIds: [0, 3, 4] });
  // Soldiers 3 and 4 stand still; only 4 wears a mask.
  g.commandOverride = () => idle();
  g.tick = artilleryRules.initialDelay;
  const [human] = g.players, unmasked = g.players[3], wearing = g.players[4];
  place(g, -20, 0, 0);
  wearing.gasMask = { worn: true, since: 0, from: 1 };
  for (const p of g.players) p.protectedUntil = 0;
  run(g, 1, { gasStrike: { x: 10, z: 0, area: true } });
  const cloud = g.gas.clouds[0];
  place(g, cloud.x, cloud.z, 3);
  place(g, cloud.x + 0.5, cloud.z + 0.5, 4);
  expect(cloud.endsAt - cloud.landAt).toBe(gasStrikeRules.lifetime);
  expect(cloudDensity(cloud, cloud.landAt - 1)).toBe(0);
  run(g, gasStrikeRules.flightTicks + 2 * 30);
  expect(unmasked.hp).toBeLessThan(100);
  run(g, 3 * 30);
  const lostBare = 100 - unmasked.hp, lostMasked = 100 - wearing.hp;
  expect(lostMasked).toBeGreaterThan(0);
  expect(lostMasked * 4).toBeLessThan(lostBare);
  const events = run(g, 30 * 30);
  expect(unmasked.deaths).toBe(1);
  // The caller earns the kill on an enemy.
  expect(unmasked.lastDeath).toMatchObject({ kind: "gas", source: 0, weapon: "Gas shell" });
  expect(human.kills).toBe(1);
  expect(events.some((e) => e.type === "gasStrike" && e.phase === "end")).toBe(true);
  expect(g.gas.clouds).toHaveLength(0);
});

it("sends bots out of a cloud and masks them on the way", () => {
  const g = new Game(new TestCollision(trenchMap), true, 480 * 30, 31, undefined, { map: trenchMap, ambientArtillery: false, teamSize: 3, humanPlayerIds: [] });
  g.tick = 600;
  const bot = g.players[4];
  place(g, 2, 3, 4);
  bot.protectedUntil = 0;
  cloudAt(g, 0, 0, "blue", 1);
  expect(cloudExposure(g, bot)).not.toBeNull();
  let outAt = -1;
  for (let i = 0; i < 240 && outAt < 0; i++) {
    g.step(botCommand(g, g.players[0]));
    if (!cloudExposure(g, bot)) outAt = i;
  }
  expect(outAt).toBeGreaterThan(0);
  expect(outAt).toBeLessThan(120);
  expect(bot.gasMask?.worn).toBe(true);
  expect(bot.hp).toBeGreaterThan(40);
  // Clear of every cloud for a while, the mask comes off again.
  g.gas.clouds = [];
  for (let i = 0; i < gasRules.bot.unmaskAfter + 30; i++) g.step(botCommand(g, g.players[0]));
  if (bot.hp > 0) expect(bot.gasMask?.worn).toBe(false);
});

// Seed 3: since bots aim down sights (hip-fire spread), seed 6842's callers
// happen to choose gas every time in these two minutes.
it("finishes a seeded 20v20 battle by score with bots choosing gas shells sometimes", () => {
  const g = new Game(new TestCollision(trenchMap), true, 120 * 30, 3, undefined, { map: trenchMap, humanPlayerIds: [], teamSize: 20 });
  let gasCalls = 0, shellCalls = 0;
  while (g.phase === "playing") {
    g.step(g.players[0].hp > 0 ? botCommand(g, g.players[0]) : idle());
    for (const e of g.events) {
      if (e.type === "gasStrike" && e.phase === "call") gasCalls++;
      if (e.type === "artilleryCall") shellCalls++;
    }
  }
  expect(g.events.some((e) => e.type === "end")).toBe(true);
  expect(g.scores.blue + g.scores.red).toBeGreaterThan(0);
  expect(gasCalls).toBeGreaterThan(0);
  expect(shellCalls).toBeGreaterThan(0);
}, 120_000);
