import { expect, it } from "vitest";
import { artilleryRules } from "./artillery";
import { BatteryPlan, batteryGuns, batteryRules, shotPosition, shotVelocity, type BatteryShot } from "./artillery-battery";
import { groundHeight } from "./map";
import { Game, TestCollision, idle, type Event } from "./simulation";
import { trenchMap } from "./trench-map";
import { verdunMap } from "./verdun-map";
import { springOffensiveMap } from "./spring-offensive-map";
import { villageMap } from "./village-map";
import { headlandMap } from "./headland-map";

const scene = (map = trenchMap, ambient = false) =>
  new Game(new TestCollision(map), true, 480 * 30, 5, undefined, { map, ambientArtillery: ambient, teamSize: 3 });

// Run a match with the batteries planning alongside it, and check that every
// shell the simulation launches was fired by a gun on the same side so that
// it reaches the launch point at the launch tick, moving as the shell does.
function follow(g: Game, ticks: number) {
  const plan = new BatteryPlan(), planned = new Map<string, BatteryShot>(), launches: Extract<Event, { type: "artilleryLaunch" }>[] = [];
  for (let i = 0; i < ticks; i++) {
    for (const shot of plan.update(g)) planned.set(shot.key, shot);
    g.step(idle());
    for (const e of g.events) if (e.type === "artilleryLaunch") launches.push(e);
  }
  return { planned: [...planned.values()], launches };
}
function matches(g: Game, shots: BatteryShot[], launch: Extract<Event, { type: "artilleryLaunch" }>, tick: number) {
  return shots.find((s) => s.handoffTick === tick && Math.hypot(shotPosition(s, (s.handoffTick - s.fireTick) / 30).x - launch.from.x, shotPosition(s, (s.handoffTick - s.fireTick) / 30).z - launch.from.z) < 1e-6);
}

it("parks each side's battery behind its spawn, on the far ground, clear of its scenery", () => {
  for (const map of [trenchMap, verdunMap, springOffensiveMap]) {
    const guns = batteryGuns(map);
    expect(guns).toHaveLength(batteryRules.guns * 2);
    for (const gun of guns) {
      const behind = gun.team === "blue" ? map.spawn.blue.x - gun.x : gun.x - map.spawn.red.x;
      expect(behind).toBeGreaterThan(45);
      expect(behind).toBeLessThan(90);
      expect(gun.hidden).toBe(false);
      expect(Number.isFinite(gun.y)).toBe(true);
    }
  }
});

it("fires from out of sight where the sea closes in the map", () => {
  for (const gun of batteryGuns(villageMap)) expect(gun.hidden).toBe(false);
  for (const map of [headlandMap])
    for (const gun of batteryGuns(map)) {
      expect(gun.hidden).toBe(true);
      expect(Math.abs(gun.x)).toBeGreaterThan(map.width / 2 + 60);
    }
});

it("fires every fire-mission shell from its own side's guns, arriving exactly where and when the shell takes over", () => {
  const g = scene();
  g.commandOverride = () => idle();
  const human = g.players[0];
  Object.assign(human, { x: -20, z: 0, y: groundHeight(-20, 0, g.map), vx: 0, vz: 0, protectedUntil: 0 });
  g.tick = artilleryRules.initialDelay;
  g.step({ ...idle(), artillery: { x: 20, z: 6, area: true } });
  const mission = g.artillery.missions[0];
  expect(mission).toBeDefined();
  const calledAt = mission.calledAt, shells = new Map<number, { x: number; y: number; z: number; vx: number; vy: number; vz: number; bornAt: number }>();
  const plan = new BatteryPlan(), seen = new Map<string, BatteryShot>();
  for (let i = 0; i < artilleryRules.warning + artilleryRules.barrageDuration + 20; i++) {
    for (const shot of plan.update(g)) seen.set(shot.key, shot);
    g.step(idle());
    for (const s of g.artillery.shells) if (!shells.has(s.id)) shells.set(s.id, { ...s });
  }
  const shots = [...seen.values()].filter((s) => s.key.startsWith(`m${mission.id}.`));
  expect(shots).toHaveLength(artilleryRules.shellCount);
  expect(shells.size).toBe(artilleryRules.shellCount);
  const guns = batteryGuns(g.map);
  for (const shell of shells.values()) {
    const shot = shots.find((s) => s.handoffTick === shell.bornAt && Math.abs(shotPosition(s, (s.handoffTick - s.fireTick) / 30).x - shell.x) < 1e-6)!;
    expect(shot).toBeDefined();
    expect(guns[shot.gun].team).toBe("blue");
    // The guns answer after the call, with time to spare.
    expect(shot.fireTick).toBeGreaterThan(calledAt + 10);
    const seconds = (shot.handoffTick - shot.fireTick) / 30;
    const at = shotPosition(shot, seconds), v = shotVelocity(shot, seconds);
    expect(at.x).toBeCloseTo(shell.x, 6);
    expect(at.y).toBeCloseTo(shell.y, 6);
    expect(at.z).toBeCloseTo(shell.z, 6);
    expect(v.x).toBeCloseTo(shell.vx, 6);
    expect(v.y).toBeCloseTo(shell.vy, 6);
    expect(v.z).toBeCloseTo(shell.vz, 6);
    // High into the sky on the way.
    let apex = -Infinity;
    for (let t = 0; t <= seconds; t += 1 / 30) apex = Math.max(apex, shotPosition(shot, t).y);
    expect(apex - guns[shot.gun].y).toBeGreaterThan(40);
    // Fast: well over 100 m/s out of the muzzle.
    expect(Math.hypot(shot.v0.x, shot.v0.y, shot.v0.z)).toBeGreaterThan(100);
  }
});

it("fires gas shells and the strays from the guns too", () => {
  const g = scene(trenchMap, true);
  g.commandOverride = () => idle();
  const human = g.players[0];
  Object.assign(human, { x: -20, z: 0, y: groundHeight(-20, 0, g.map), vx: 0, vz: 0, protectedUntil: 0 });
  g.tick = artilleryRules.initialDelay;
  g.step({ ...idle(), gasStrike: { x: 10, z: 0, area: true } });
  const { planned, launches } = follow(g, 2400);
  const gas = launches.filter((e) => e.mission < 0), strays = launches.filter((e) => e.ambient);
  expect(gas.length).toBe(4);
  expect(strays.length).toBeGreaterThan(2);
  const tickOf = new Map<number, number>();
  // Launch ticks are recorded by re-running the same seeded match.
  const again = scene(trenchMap, true);
  again.commandOverride = () => idle();
  Object.assign(again.players[0], { x: -20, z: 0, y: groundHeight(-20, 0, again.map), vx: 0, vz: 0, protectedUntil: 0 });
  again.tick = artilleryRules.initialDelay;
  again.step({ ...idle(), gasStrike: { x: 10, z: 0, area: true } });
  for (let i = 0; i < 2400; i++) {
    again.step(idle());
    for (const e of again.events) if (e.type === "artilleryLaunch") tickOf.set(e.shell, again.tick);
  }
  for (const launch of [...gas, ...strays]) {
    const shot = matches(g, planned, launch, tickOf.get(launch.shell)!);
    expect(shot, `shell ${launch.shell}`).toBeDefined();
    expect(shot!.fireTick).toBeLessThan(shot!.handoffTick - batteryRules.minFlightTicks + 1);
  }
});

it("only reads the match: planning shells changes nothing in it", () => {
  const run = (watch: boolean) => {
    const g = scene(trenchMap, true), plan = new BatteryPlan();
    g.tick = artilleryRules.initialDelay;
    for (let i = 0; i < 1200; i++) {
      if (watch) plan.update(g);
      g.step(idle());
    }
    return JSON.stringify(g.snapshot());
  };
  expect(run(true)).toBe(run(false));
});
