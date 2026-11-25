import { expect, it } from "vitest";
import { artilleryRules } from "./artillery";
import { gasStrikeRules } from "./gas";
import { groundHeight } from "./map";
import { Game, TestCollision, idle, type Event as GameEvent } from "./simulation";
import { trenchMap } from "./trench-map";

it("delivers a gas strike by shells: launched, whistling in, bursting into the cloud without a blast", () => {
  const g = new Game(new TestCollision(trenchMap), true, 480 * 30, 5, undefined, { map: trenchMap, ambientArtillery: false, teamSize: 3 });
  g.commandOverride = () => idle();
  const human = g.players[0];
  Object.assign(human, { x: -20, z: 0, y: groundHeight(-20, 0, g.map), vx: 0, vz: 0, protectedUntil: 0 });
  g.tick = artilleryRules.initialDelay;
  const events: GameEvent[] = [];
  g.step({ ...idle(), gasStrike: { x: 10, z: 0, area: true } });
  events.push(...g.events);
  const cloud = g.gas.clouds[0];
  expect(cloud).toMatchObject({ launched: 0, bursts: [] });
  // Nothing in the air yet: the battery fires so the first shell lands as the cloud starts.
  expect(g.artillery.shells).toHaveLength(0);
  const hp = g.players.map((p) => p.hp);
  let firstImpact = -1;
  for (let i = 0; i < gasStrikeRules.flightTicks + 40; i++) {
    g.step(idle());
    events.push(...g.events);
    if (firstImpact < 0 && g.events.some((e) => e.type === "gasShellImpact")) firstImpact = g.tick;
  }
  const launches = events.filter((e) => e.type === "artilleryLaunch");
  const impacts = events.filter((e) => e.type === "gasShellImpact");
  expect(launches).toHaveLength(gasStrikeRules.shells);
  expect(impacts).toHaveLength(gasStrikeRules.shells);
  // No high-explosive blast, crater or fire mission from a gas shell.
  expect(events.some((e) => e.type === "artilleryImpact" || e.type === "artilleryCall")).toBe(false);
  expect(g.artillery.missions).toHaveLength(0);
  expect(g.artillery.shells).toHaveLength(0);
  // Each shell lands near the aim point, the first about when the cloud starts.
  for (const e of impacts) if (e.type === "gasShellImpact") expect(Math.hypot(e.at.x - cloud.x, e.at.z - cloud.z)).toBeLessThan(gasStrikeRules.shellScatter + 2);
  expect(Math.abs(firstImpact - cloud.landAt)).toBeLessThanOrEqual(3);
  expect(cloud.bursts!.length).toBe(gasStrikeRules.shells);
  // Nobody stood near it, so nobody was hurt by the landing.
  expect(g.players.map((p) => p.hp)).toEqual(hp);
  // Bursts are drawn for a few seconds, then dropped from the state.
  for (let i = 0; i < gasStrikeRules.burstTicks + 30; i++) g.step(idle());
  expect(cloud.bursts).toHaveLength(0);
});
