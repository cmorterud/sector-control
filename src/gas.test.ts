import { expect, it } from "vitest";
import {
  cloudDensity, cloudExposure, createGasState, deploymentCenter, frontDepth, gasAvailable, gasDepth, gasRules, gasSectors,
  gasStrikeReason, gasStrikeRules, gasThreatens, maskProgress, masked, nextSafeArea, safeAreaAt, type GasStage,
} from "./gas";
import { beyondPlayArea, blocked, groundHeight, type MapDefinition } from "./map";
import { Game, TestCollision, botCommand, firingPosition, idle, type Command, type Event as GameEvent } from "./simulation";
import { trenchMap } from "./trench-map";
import { verdunMap } from "./verdun-map";
import { villageMap } from "./village-map";
import { dominationRules } from "./domination";
import { edgePoints } from "./gas-view";

const maps = [trenchMap, verdunMap];
// A tenth-length match: stage one is announced at 6 s, rolls in from 9 s to 11 s.
const short = 1440;
const solo = (map: MapDefinition = trenchMap, duration = short) => {
  const g = new Game(new TestCollision(map), false, duration, 12345, undefined, { map, ambientArtillery: false, gas: true });
  return { g, p: g.players[0] };
};
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
const until = (g: Game, tick: number) => run(g, tick - g.tick);

it("is off unless asked for, and only offered on Trench front and Verdun", () => {
  const plain = new Game(new TestCollision(trenchMap), false, short, 12345, undefined, { map: trenchMap, ambientArtillery: false });
  expect(plain.gas).toBeNull();
  const events = run(plain, 400);
  expect(events.some((e) => e.type === "gas" || e.type === "gasMask" || e.type === "gasStrike")).toBe(false);
  expect(plain.players[0].gasMask).toBeUndefined();
  expect(plain.snapshot().gas).toBeNull();
  expect([gasAvailable(trenchMap), gasAvailable(verdunMap), gasAvailable(villageMap)]).toEqual([true, true, false]);
  const village = new Game(new TestCollision(villageMap), false, short, 12345, undefined, { map: villageMap, gas: true });
  expect(village.gas).toBeNull();
});

it("announces three advances half a minute ahead and rolls each in over twenty seconds", () => {
  const gas = createGasState(trenchMap, 480 * 30)!;
  expect(gas.stages.map((s) => [s.warnAt, s.startAt, s.endAt].map((t) => t / 30))).toEqual([[60, 90, 110], [150, 180, 200], [240, 270, 290]]);
  // Shorter matches compress the schedule rather than never reaching the end.
  const compressed = createGasState(trenchMap, 120 * 30)!;
  expect(compressed.stages.at(-1)!.endAt).toBeLessThan(120 * 30 * 0.65);
  const [first] = gas.stages;
  expect(safeAreaAt(gas, first.startAt)).toEqual({ halfWidth: 80, halfDepth: 64, radius: 0 });
  expect(safeAreaAt(gas, (first.startAt + first.endAt) / 2)).toEqual({ halfWidth: 75, halfDepth: 62, radius: 6 });
  expect(safeAreaAt(gas, first.endAt)).toEqual(gasSectors.trenches[0]);
  expect(safeAreaAt(gas, 480 * 30)).toEqual(gasSectors.trenches[2]);
  expect(nextSafeArea(gas, first.warnAt - 1)).toBeNull();
  expect(nextSafeArea(gas, first.warnAt)).toEqual(gasSectors.trenches[0]);
  expect(nextSafeArea(gas, gas.stages[1].warnAt)).toEqual(gasSectors.trenches[1]);
  // The front moves at a slow walk: half a meter a second across the width.
  expect((80 - 70) / ((first.endAt - first.startAt) / 30)).toBeCloseTo(0.5);
  const area = gasSectors.trenches[2];
  expect(gasDepth(area, 0, 0)).toBe(-48);
  expect(gasDepth(area, 55, 0)).toBeCloseTo(5);
  expect(gasDepth(area, 0, -50)).toBeCloseTo(2);
  // Corners are rounded: the very corner of the rectangle is already gas.
  expect(gasDepth(area, 49, 47)).toBeGreaterThan(0);
});

it("leaves a final safe area that holds every flag and the trench lines but not the spawns", () => {
  for (const map of maps) {
    const areas = gasSectors[map.id], last = areas.at(-1)!;
    for (let i = 1; i < areas.length; i++) {
      expect(areas[i].halfWidth).toBeLessThan(areas[i - 1].halfWidth);
      expect(areas[i].halfDepth).toBeLessThan(areas[i - 1].halfDepth);
    }
    for (const flag of map.sectors) expect(gasDepth(last, flag.x, flag.z)).toBeLessThan(-dominationRules.radius - 1);
    for (const team of ["blue", "red"] as const) {
      expect(gasDepth(last, map.spawn[team].x, map.spawn[team].z)).toBeGreaterThan(0);
      expect(beyondPlayArea(map.spawn[team].x, map.spawn[team].z, map)).toBeLessThan(0);
    }
    // Both teams' front lines stay fightable to the end; only their far ends gas.
    for (const line of map.terrain!.trenchLines!.filter((l) => l.role === "front")) {
      const clear = line.sections.filter((s) => gasDepth(last, s.x, s.z) < 0).length;
      expect(clear / line.sections.length).toBeGreaterThanOrEqual(0.7);
    }
    // Still a battlefield, not a box: more than half the width remains.
    expect(last.halfWidth * 2).toBeGreaterThan(map.playArea!.width * 0.6);
  }
});

it("burns an unmasked soldier in the gas, credited to no one, and spares one outside it", () => {
  const { g, p } = solo();
  const stage = g.gas!.stages[0];
  until(g, stage.endAt);
  place(g, 0, 0);
  const clear = run(g, 60);
  expect(p.hp).toBe(100);
  expect(clear.some((e) => e.type === "damage")).toBe(false);
  place(g, -76, 0);
  expect(frontDepth(g, p)).toBeCloseTo(6);
  const events = run(g, 30);
  const hits = events.filter((e) => e.type === "damage");
  expect(hits.length).toBe(2);
  expect(p.hp).toBeCloseTo(100 - gasRules.damagePerSecond);
  for (const hit of hits) expect(hit).toMatchObject({ kind: "gas", source: -1, weapon: "Gas" });
  run(g, 12 * 30);
  expect(p.hp).toBe(0);
  expect(p.lastDeath).toMatchObject({ kind: "gas", weapon: "Gas", sourceName: "Gas" });
  expect(g.players.every((q) => q.kills === 0)).toBe(true);
  expect(g.scores).toEqual({ blue: 0, red: 0 });
});

it("does not burn anyone before the first advance begins", () => {
  const { g, p } = solo();
  place(g, -79, 60);
  const events = run(g, g.gas!.stages[0].startAt);
  expect(events.filter((e) => e.type === "gas").map((e) => e.type === "gas" && e.phase)).toEqual(["warning", "advance"]);
  expect(p.hp).toBe(100);
});

it("takes a second to pull the mask on, keeps the hands busy and cuts gas damage to a slow burn", () => {
  const { g, p } = solo();
  until(g, g.gas!.stages[0].endAt);
  place(g, -76, 0);
  const on = run(g, 1, { gasMask: true });
  expect(on.find((e) => e.type === "gasMask")).toMatchObject({ actor: 0, worn: true });
  expect(maskProgress(p, g.tick + 14)).toBeCloseTo(14 / 30);
  expect(masked(p, g.tick + gasRules.donTicks - 2)).toBe(false);
  // Hands at the face: no shot while the mask goes on.
  const busy = run(g, gasRules.donTicks - 2, { fire: true });
  expect(busy.some((e) => e.type === "fire")).toBe(false);
  run(g, 2);
  expect(masked(p, g.tick)).toBe(true);
  const before = p.hp;
  run(g, 60);
  expect(before - p.hp).toBeCloseTo(gasRules.maskedPerSecond * 2, 5);
  expect(gasRules.maskedPerSecond / gasRules.damagePerSecond).toBeLessThan(0.25);
  // Taking it off is quicker, and protection ends at once.
  run(g, 1, { gasMask: true });
  expect(masked(p, g.tick)).toBe(false);
  expect(maskProgress(p, g.tick + gasRules.doffTicks)).toBe(0);
  // Changing your mind halfway costs only the part already done.
  run(g, 5, { gasMask: false });
  run(g, 1, { gasMask: true });
  expect(maskProgress(p, g.tick)).toBeCloseTo(1 - 6 / gasRules.doffTicks);
  expect(masked(p, g.tick + 12)).toBe(true);
});

it("never respawns a team into gas, moving its deployment up to its own side of the safe area", () => {
  for (const map of maps) {
    const g = new Game(new TestCollision(map), true, 480 * 30, 4242, undefined, { map, ambientArtillery: false, gas: true });
    // The same match without gas shows where each soldier would have stood.
    const plain = new Game(new TestCollision(map), true, 480 * 30, 4242, undefined, { map, ambientArtillery: false });
    const checkpoints = [0, ...g.gas!.stages.flatMap((s: GasStage) => [s.warnAt, s.startAt, s.endAt]), g.duration - 1];
    let moved = 0;
    for (const tick of checkpoints) {
      g.tick = plain.tick = tick;
      for (const p of g.players) {
        g.respawn(p);
        const q = plain.players[p.id];
        plain.respawn(q);
        // Clear of the gas now, and of where the announced advance will stop.
        expect(frontDepth(g, p, Math.max(tick, g.gas!.stages[0].startAt + 1))).toBeLessThan(-2);
        const next = nextSafeArea(g.gas!, tick);
        if (next) expect(gasDepth(next, p.x, p.z)).toBeLessThan(-2);
        expect(Math.sign(p.x)).toBe(p.team === "blue" ? -1 : 1);
        if (p.x === q.x && p.z === q.z) continue;
        moved++;
        expect(blocked(p.x, p.z, 0.5, g.map), `${map.id} ${tick} ${p.x} ${p.z}`).toBe(false);
      }
    }
    expect(moved).toBeGreaterThan(100);
    // By the end each side deploys from the rear of the final area, still apart.
    const blue = deploymentCenter(g, "blue"), red = deploymentCenter(g, "red");
    expect(red.x - blue.x).toBeGreaterThanOrEqual(map.id === "verdun" ? 120 : 80);
  }
});

it("abandons firing steps the gas is about to reach", () => {
  const g = new Game(new TestCollision(trenchMap), true, 480 * 30, 99, undefined, { map: trenchMap, ambientArtillery: false, gas: true });
  const stations = () => g.players.map((p) => firingPosition(g, p)).filter((v) => v !== undefined);
  expect(stations().some((v) => gasThreatens(g, { x: v.x, z: v.z }, 2) || Math.abs(v.z) > 47)).toBe(true);
  g.tick = g.gas!.stages[2].warnAt;
  expect(stations().length).toBeGreaterThan(20);
  for (const v of stations()) expect(gasThreatens(g, v, 2)).toBe(false);
});

it("masks bots near the gas and walks them out of it", () => {
  const g = new Game(new TestCollision(trenchMap), true, short, 777, undefined, { map: trenchMap, ambientArtillery: false, gas: true, humanPlayerIds: [], teamSize: 4 });
  g.tick = g.gas!.stages[0].endAt;
  const bot = g.players[1];
  Object.assign(bot, { protectedUntil: 0 });
  place(g, -76, 6, 1);
  expect(frontDepth(g, bot)).toBeGreaterThan(5);
  let maskedAt = -1, outAt = -1;
  for (let i = 0; i < 300 && (maskedAt < 0 || outAt < 0); i++) {
    g.step(botCommand(g, g.players[0]));
    if (maskedAt < 0 && masked(bot, g.tick)) maskedAt = i;
    if (outAt < 0 && frontDepth(g, bot) < -1) outAt = i;
  }
  expect(maskedAt).toBeGreaterThan(0);
  expect(maskedAt).toBeLessThan(60);
  expect(outAt).toBeGreaterThan(0);
  expect(outAt).toBeLessThan(150);
  expect(bot.hp).toBeGreaterThan(50);
  // Clear of the gas for a while, it comes off again.
  place(g, -20, 6, 1);
  bot.gasEscape = null;
  for (let i = 0; i < 300; i++) g.step(botCommand(g, g.players[0]));
  if (bot.hp > 0 && frontDepth(g, bot) < -gasRules.bot.unmaskBeyond) expect(bot.gasMask?.worn).toBe(false);
});

it("drops a gas shell cloud that lingers about 25 seconds, drifts and hurts the unmasked most", () => {
  const g = new Game(new TestCollision(trenchMap), true, 480 * 30, 5, undefined, { map: trenchMap, ambientArtillery: false, gas: true, teamSize: 3, humanPlayerIds: [0, 3] });
  // Soldier 3 stands still and never masks, as a careless human might.
  g.commandOverride = () => idle();
  g.tick = gasStrikeRules.initialDelay;
  const [human] = g.players, unmasked = g.players[3], wearing = g.players[4];
  place(g, -20, 0, 0);
  place(g, 0, 0, 3);
  place(g, 0.5, 0.5, 4);
  wearing.gasMask = { worn: true, since: 0, from: 1 };
  for (const p of g.players) p.protectedUntil = 0;
  expect(gasStrikeReason(g, human, { x: -60, z: 0 })).toBe("Too close to a deployment area");
  const call = run(g, 1, { gasStrike: { x: 0, z: 0 } }).find((e) => e.type === "gasStrike");
  expect(call).toMatchObject({ phase: "call", actor: 0 });
  expect(gasStrikeReason(g, human, { x: 0, z: 0 })).toBe("Gas shells are reloading");
  const cloud = g.gas!.clouds[0];
  expect(cloud.endsAt - cloud.landAt).toBe(25 * 30);
  expect(cloudDensity(cloud, cloud.landAt - 1)).toBe(0);
  run(g, gasStrikeRules.flightTicks + 2 * 30);
  expect(unmasked.hp).toBeLessThan(100);
  run(g, 3 * 30);
  // Both in the same place; the masked soldier loses a small fraction as much.
  const lostBare = 100 - unmasked.hp, lostMasked = 100 - wearing.hp;
  expect(lostMasked).toBeGreaterThan(0);
  expect(lostMasked * 4).toBeLessThan(lostBare);
  const events = run(g, 30 * 30);
  expect(unmasked.deaths).toBe(1);
  // The caller earns the kill on an enemy; the gas drifted slowly along the front.
  expect(unmasked.lastDeath).toMatchObject({ kind: "gas", source: 0, weapon: "Gas shell" });
  expect(human.kills).toBe(1);
  expect(events.some((e) => e.type === "gasStrike" && e.phase === "end")).toBe(true);
  expect(g.gas!.clouds).toHaveLength(0);
});

it("sends bots out of a known cloud and masks them on the way", () => {
  const g = new Game(new TestCollision(trenchMap), true, 480 * 30, 31, undefined, { map: trenchMap, ambientArtillery: false, gas: true, teamSize: 3, humanPlayerIds: [] });
  g.tick = 600;
  const bot = g.players[4];
  place(g, 2, 3, 4);
  bot.protectedUntil = 0;
  g.gas!.clouds.push({ id: 1, team: "blue", actor: 1, x: 0, z: 0, heading: Math.PI / 2, landAt: g.tick - 90, endsAt: g.tick + 600 });
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
});

it("finishes a seeded 20v20 battle with gas on, by score, with bots masked and mostly clear of the gas", () => {
  const g = new Game(new TestCollision(trenchMap), true, 120 * 30, 6842, undefined, { map: trenchMap, humanPlayerIds: [], teamSize: 20, gas: true });
  let masks = 0, gasDeaths = 0, insideAtEnd = 0, strikes = 0;
  const kinds = new Set<string>();
  while (g.phase === "playing") {
    g.step(g.players[0].hp > 0 ? botCommand(g, g.players[0]) : idle());
    for (const e of g.events) {
      if (e.type === "gasMask" && e.worn) masks++;
      if (e.type === "gas") kinds.add(e.phase);
      if (e.type === "gasStrike" && e.phase === "call") strikes++;
      if (e.type === "death" && e.report?.kind === "gas" && e.report.source < 0) gasDeaths++;
    }
    if (g.tick === g.duration - 30) insideAtEnd = g.players.filter((p) => p.hp > 0 && frontDepth(g, p) > 0).length;
  }
  expect(g.events.some((e) => e.type === "end")).toBe(true);
  expect(g.scores.blue + g.scores.red).toBeGreaterThan(0);
  expect([...kinds].sort()).toEqual(["advance", "settled", "warning"]);
  expect(masks).toBeGreaterThan(5);
  expect(strikes).toBeGreaterThan(0);
  // The front is announced and slow: few soldiers die to it, and almost none
  // are left standing in it at the end.
  expect(gasDeaths).toBeLessThan(10);
  expect(insideAtEnd).toBeLessThan(3);
}, 120_000);

it("lays the gas bank along the rounded safe edge, facing out", () => {
  for (const area of [...gasSectors.trenches, ...gasSectors.verdun]) {
    const points = edgePoints(area, 4);
    const perimeter = 4 * (area.halfWidth + area.halfDepth) - (8 - 2 * Math.PI) * area.radius;
    expect(points.length).toBeGreaterThan(perimeter / 4 - 6);
    expect(points.length).toBeLessThan(perimeter / 4 + 6);
    for (const v of points) {
      expect(Math.abs(gasDepth(area, v.x, v.z))).toBeLessThan(1e-6);
      expect(gasDepth(area, v.x + v.nx, v.z + v.nz)).toBeCloseTo(1, 5);
    }
  }
});
