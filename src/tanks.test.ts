import { describe, expect, it } from "vitest";
import { Game, TestCollision, idle, type Command, type Event } from "./simulation";
import { groundHeight } from "./map";
import { trenchMap } from "./trench-map";
import { verdunMap } from "./verdun-map";
import { villageMap } from "./village-map";
import { artilleryExplosionProfile, grenadeExplosionProfile } from "./destruction";
import { ctfMap } from "./ctf";
import { flagOccupant } from "./domination";
import { activeTank, crewTank, rayHull, supportsTanks, tankPose, tankRules, toWorld, type Tank } from "./tanks";
import { tankChoice, tankNotice } from "./tank-hud";

function scene(map = trenchMap, tanks = true, teamSize = 3) {
  const g = new Game(new TestCollision(map), true, 30 * 600, 12345, undefined, { map, teamSize, ambientArtillery: false, tanks });
  g.artillery.enabled = false;
  g.commandOverride = () => idle();
  for (const p of g.players) p.protectedUntil = 0;
  return g;
}
function run(g: Game, ticks: number, command: Partial<Command> = {}) {
  const events: Event[] = [];
  for (let i = 0; i < ticks && g.phase === "playing"; i++) {
    g.step({ ...idle(), ...command });
    events.push(...g.events);
  }
  return events;
}
const tankEvents = (events: Event[], phase: string) => events.filter((e) => e.type === "tank" && e.phase === phase);
// Put a tank somewhere on open ground, facing along yaw.
function place(g: Game, t: Tank, x: number, z: number, yaw: number) {
  const pose = tankPose(g.map, x, z, yaw);
  Object.assign(t, { x, z, yaw, y: pose.y, pitch: pose.pitch, roll: pose.roll, gap: pose.gap, speed: 0 });
  t.previous = { x, y: pose.y, z, yaw, pitch: pose.pitch, roll: pose.roll };
}
// Player 0 walks up to Blue's tank and climbs in.
function command(g: Game) {
  run(g, 1);
  const t = activeTank(g, "blue")!;
  const door = toWorld(t, 0, tankRules.width / 2 + 0.7);
  Object.assign(g.players[0], { ...door, y: groundHeight(door.x, door.z, g.map), vx: 0, vz: 0 });
  run(g, 1, { interact: true });
  return t;
}
const east = Math.PI / 2;

describe("tanks", () => {
  it("only spawn when switched on, on Trench front and Verdun", () => {
    expect(supportsTanks(trenchMap) && supportsTanks(verdunMap)).toBe(true);
    expect(supportsTanks(villageMap)).toBe(false);
    const off = scene(trenchMap, false);
    run(off, 5);
    expect(off.tanks.list).toHaveLength(0);
    const village = scene(villageMap, true);
    run(village, 5);
    expect(village.tanks.list).toHaveLength(0);
    for (const map of [trenchMap, verdunMap, ctfMap(trenchMap)]) {
      const g = scene(map);
      run(g, 2);
      expect(g.tanks.list.map((t) => t.team).sort()).toEqual(["blue", "red"]);
      expect(g.tanks.list.map((t) => t.model).sort()).toEqual(map.id === "verdun" ? ["a7v", "saint-chamond"] : ["a7v", "mark-iv"]);
    }
    expect(tankChoice(villageMap, true)).toBe("");
    expect(tankChoice(trenchMap, true)).toContain("checked");
  });

  it("are crewed by a bot, who climbs out when a human takes command", () => {
    const g = scene();
    run(g, 2);
    const t = activeTank(g, "blue")!;
    const bot = g.players[t.driver!];
    expect(bot.id).not.toBe(0);
    expect(crewTank(g, bot)).toBe(t);
    const events = (() => { command(g); return g.events; })();
    expect(t.driver).toBe(0);
    expect(crewTank(g, g.players[0])).toBe(t);
    expect(bot.tank).toBeUndefined();
    // The bot stands clear of the hull and fights on foot.
    expect(rayHull(t, { x: bot.x, y: bot.y + 1, z: bot.z }, { x: bot.x, y: bot.y + 1.01, z: bot.z })).toBe(1);
    expect(events.some((e) => e.type === "tank" && e.phase === "exit" && e.actor === bot.id)).toBe(true);
    // Climbing out leaves it empty for a while, then a bot crews it again.
    run(g, 1);
    run(g, 1, { interact: true });
    expect(g.players[0].tank).toBeUndefined();
    expect(t.driver).toBeUndefined();
    run(g, tankRules.refillTicks + 5);
    expect(t.driver).not.toBeUndefined();
    expect(t.driver).not.toBe(0);
  });

  it("are slow", () => {
    const g = scene();
    const t = command(g);
    place(g, t, -70, -45, east);
    run(g, 30 * 10, { drive: { throttle: 1, turn: 0 }, yaw: east });
    const travelled = t.x + 70;
    expect(travelled).toBeGreaterThan(10);
    // Infantry walk at 4.5 m/s; a tank under 1.4.
    expect(travelled / 10).toBeLessThan(1.4);
  });

  it("cross an ordinary trench and flatten wire without ditching", () => {
    const g = scene();
    const t = command(g);
    place(g, t, -36, -20, east);
    const events = run(g, 30 * 30, { drive: { throttle: 1, turn: 0 }, yaw: east });
    expect(t.x).toBeGreaterThan(-8);
    expect(tankEvents(events, "ditched").filter((e) => e.type === "tank" && e.tank === t.id)).toHaveLength(0);
    expect(Object.keys(g.map.destruction?.wire ?? {}).length).toBeGreaterThan(0);
  });

  it("ditch in a gap too wide to bridge, then work free", () => {
    const g = scene();
    const t = command(g);
    // Shellfire widens the fire trench where the tank will cross it.
    for (const x of [-25, -21, -17]) g.explode({ x, y: groundHeight(x, -20, g.map), z: -20 }, -1, null, artilleryExplosionProfile);
    expect(tankPose(g.map, -19, -20, east).gap).toBeGreaterThanOrEqual(tankRules.ditchGap);
    place(g, t, -34, -20, east);
    const events = run(g, 30 * 20, { drive: { throttle: 1, turn: 0 }, yaw: east });
    expect(tankEvents(events, "ditched")).toHaveLength(1);
    expect(t.state).toBe("ditched");
    run(g, tankRules.ditchTicks + 2);
    expect(t.state).toBe("mobile");
  });

  it("shrug off bullets, which only splash the crew's view", () => {
    const g = scene();
    run(g, 2);
    const t = activeTank(g, "blue")!;
    const shooter = g.players.find((p) => p.team === "red" && p.tank === undefined)!;
    const from = toWorld(t, 0, tankRules.width / 2 + 12);
    Object.assign(shooter, { ...from, y: groundHeight(from.x, from.z, g.map) });
    shooter.yaw = Math.atan2(t.x - shooter.x, shooter.z - t.z);
    shooter.pitch = Math.atan2(t.y + 1.2 - (shooter.y + 1.5), 12 + tankRules.width / 2);
    for (let i = 0; i < 40; i++) {
      shooter.ammo = 10;
      shooter.nextShot = 0;
      shooter.reloadAt = 0;
      g.fire(shooter);
      run(g, 3);
    }
    expect(t.hp).toBe(tankRules.hp);
    expect(t.splash).toBeGreaterThan(0.2);
    // The crew inside take no hits either.
    expect(g.players[t.driver!].hp).toBe(100);
  });

  it("are worn down by grenades on the plates, throw a track, then are knocked out", () => {
    const g = scene();
    run(g, 2);
    const t = activeTank(g, "blue")!;
    const crew = g.players[t.driver!];
    const red = g.players.find((p) => p.team === "red" && p.tank === undefined)!;
    const roof = { x: t.x, y: t.y + tankRules.height + 0.1, z: t.z };
    let grenades = 0;
    while (t.state !== "wreck" && grenades < 20) {
      g.explode(roof, red.id, red.team, grenadeExplosionProfile);
      grenades++;
      if (t.state === "immobilized") expect(t.hp).toBeLessThan(tankRules.hp * tankRules.immobilizedBelow);
    }
    const events = g.events;
    // Roughly a section's worth of bombs: more than a couple, fewer than ten.
    expect(grenades).toBeGreaterThanOrEqual(5);
    expect(grenades).toBeLessThanOrEqual(8);
    expect(tankEvents(events, "immobilized")).toHaveLength(1);
    expect(tankEvents(events, "knockedOut")).toHaveLength(1);
    // The crew bail out, hurt but alive, and the wreck stays as cover.
    expect(crew.tank).toBeUndefined();
    expect(crew.hp).toBeGreaterThan(0);
    expect(crew.hp).toBeLessThan(100);
    expect(g.tanks.list).toContain(t);
    expect(rayHull(t, { x: t.x - 10, y: t.y + 1, z: t.z }, { x: t.x + 10, y: t.y + 1, z: t.z })).toBeLessThan(1);
    // A replacement arrives later.
    run(g, tankRules.respawnTicks + 5);
    expect(activeTank(g, "blue")).toBeDefined();
    expect(activeTank(g, "blue")).not.toBe(t);
  });

  it("a shell bursting nearby does far less than a charge on the plates", () => {
    const g = scene();
    run(g, 2);
    const t = activeTank(g, "blue")!;
    const red = g.players.find((p) => p.team === "red")!;
    g.explode({ x: t.x, y: t.y + tankRules.height + 0.1, z: t.z }, red.id, red.team, grenadeExplosionProfile);
    const contact = tankRules.hp - t.hp;
    const before = t.hp;
    const side = toWorld(t, 0, tankRules.width / 2 + 2.5);
    g.explode({ ...side, y: groundHeight(side.x, side.z, g.map) + 0.2 }, red.id, red.team, grenadeExplosionProfile);
    expect(before - t.hp).toBeLessThan(contact / 2);
    // A team's own grenades leave its tank alone.
    const blue = g.players.find((p) => p.team === "blue" && p.tank === undefined)!;
    const hp = t.hp;
    g.explode({ x: t.x, y: t.y + tankRules.height + 0.1, z: t.z }, blue.id, blue.team, grenadeExplosionProfile);
    expect(t.hp).toBe(hp);
  });

  it("keep their crew off the flags and push soldiers aside", () => {
    const g = scene();
    run(g, 2);
    const t = activeTank(g, "blue")!;
    const crew = g.players[t.driver!];
    const s = g.sectors[0];
    place(g, t, s.x, s.z, east);
    run(g, 1);
    expect(flagOccupant(g, crew, s)).toBe(false);
    place(g, t, -70, -45, east);
    const red = g.players.find((p) => p.team === "red" && p.tank === undefined)!;
    Object.assign(red, { x: t.x + 0.5, z: t.z + 0.3, y: t.y, vx: 0, vz: 0 });
    run(g, 2);
    expect(rayHull(t, { x: red.x, y: red.y + 1, z: red.z }, { x: red.x, y: red.y + 1.01, z: red.z })).toBe(1);
  });

  it("tell the player what happens to them", () => {
    const g = scene();
    const events = run(g, 2);
    const spawn = events.find((e) => e.type === "tank" && e.phase === "spawn" && e.team === "red")!;
    expect(tankNotice(g, spawn, g.players[0])).toBe("ENEMY A7V REPORTED");
  });
});
