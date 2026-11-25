import { describe, expect, it } from "vitest";
import { raiseSights } from "./test-sights";
import {
  Game,
  TestCollision,
  botCommand,
  botSettingsFor,
  idle,
  pathfind,
  type BotSettings,
  type Event,
  type Soldier,
} from "./simulation";
import { villageMap } from "./village-map";
import { trenchMap } from "./trench-map";
import { industrialMap, dist, groundHeight, type Box, type MapDefinition, type Vec } from "./map";
import { canNotice } from "./awareness";
import { planVillageMove } from "./village-tactics";
import {
  advanceTactics,
  audible,
  checkCorners,
  dangerAt,
  dangerCost,
  grenadeCommand,
  kitBuildingAt,
  observeTactics,
  overwatchHold,
  raiseDanger,
  reloadCallout,
  reportContact,
  squadOf,
  squadRules,
  stackAtDoor,
  threatScore,
} from "./squads";

const village = (settings: Partial<BotSettings> = {}) =>
  new Game(new TestCollision(villageMap), true, 3600, 12345, settings, {
    map: villageMap,
    humanPlayerIds: [],
    ambientArtillery: false,
  });
// Two five-soldier teams on open ground, every bot parked so tests drive it.
function field(boxes: Box[] = [], settings: Partial<BotSettings> = {}) {
  const map: MapDefinition = {
    ...industrialMap,
    boxes,
    spawn: { blue: { x: 0, z: 0 }, red: { x: 45, z: 0 } },
  };
  const g = new Game(new TestCollision(map), true, 5000, 12345, settings, {
    map,
    teamSize: 5,
    humanPlayerIds: [],
    ambientArtillery: false,
    assaults: false,
  });
  for (const p of g.players)
    Object.assign(p, {
      x: p.team === "blue" ? 0 : 45,
      z: p.teamIndex * 3,
      y: 0,
      yaw: p.team === "blue" ? Math.PI / 2 : -Math.PI / 2,
      vx: 0,
      vz: 0,
      protectedUntil: 0,
      nextThink: Infinity,
      target: -1,
      distractedUntil: 0,
    });
  return g;
}
const yawTo = (from: Vec, to: Vec) => Math.atan2(to.x - from.x, from.z - to.z);
const blue = (g: Game) => g.players.filter((p) => p.team === "blue" && p.id !== 0);
const plan = (g: Game, p: Soldier, goal: Vec) =>
  (p.villagePlan = {
    objective: p.objective,
    goal,
    approach: null,
    cover: 0,
    capture: true,
    until: g.tick + 999,
    revision: 0,
    progress: { x: p.x, z: p.z },
    progressAt: g.tick,
  });

describe("squads and the commander", () => {
  it("forms squads of four or five and spreads them across the flags", () => {
    const g = village();
    for (const team of ["blue", "red"] as const) {
      const squads = g.tactics!.squads.filter((s) => s.team === team);
      expect(squads).toHaveLength(10);
      for (const s of squads) {
        expect(s.members.length).toBeGreaterThanOrEqual(4);
        expect(s.members.length).toBeLessThanOrEqual(5);
        expect(s.commanded).toBe(true);
      }
      expect(squads.flatMap((s) => s.members)).not.toContain(0);
    }
    // Bots first think on staggered ticks within the first second.
    for (let i = 0; i < 31; i++) g.step(idle());
    for (const team of ["blue", "red"] as const) {
      const squads = g.tactics!.squads.filter((s) => s.team === team);
      const perFlag = g.sectors.map((_, i) => squads.filter((s) => s.objective === i).length);
      expect(perFlag.every((n) => n >= 1 && n <= 3), perFlag.join()).toBe(true);
      // No flag is owned yet, so nobody is held back.
      expect(squads.some((s) => s.reserve)).toBe(false);
    }
    for (const p of g.players.filter((p) => p.id !== 0))
      expect(p.objective).toBe(squadOf(g, p)!.objective);
    // Once a flag is owned, one squad holds it in reserve.
    Object.assign(g.sectors[0], { owner: "blue", control: 1 });
    g.tactics!.nextCommand = g.tick;
    advanceTactics(g);
    const reserve = g.tactics!.squads.filter((s) => s.team === "blue" && s.reserve);
    expect(reserve).toHaveLength(1);
    expect(reserve[0].objective).toBe(0);
  });

  it("keeps individual flag choice for small teams and with squads turned off", () => {
    expect(field().tactics!.squads.every((s) => !s.commanded)).toBe(true);
    expect(village({ squads: false }).tactics).toBeUndefined();
    expect(new Game(new TestCollision(villageMap), false, 100, 1, undefined, { map: villageMap }).tactics).toBeUndefined();
  });

  it("holds half of a squad in cover while the other half moves, then swaps", () => {
    const g = field();
    const members = blue(g);
    for (const p of members) plan(g, p, { x: 30, z: p.z });
    const s = squadOf(g, members[0])!;
    reportContact(g, members[0], g.players.find((q) => q.team === "red")!);
    const holding = () => members.filter((p) => overwatchHold(g, p, idle(), true, () => 1)).map((p) => p.id);
    const first = holding();
    expect(first).toHaveLength(2);
    expect(first.every((id) => members.findIndex((p) => p.id === id) % 2 !== s.bound)).toBe(true);
    g.tick = s.boundUntil;
    g.events = [];
    advanceTactics(g);
    const second = holding();
    expect(second).toHaveLength(2);
    expect(second.some((id) => first.includes(id))).toBe(false);
    expect(g.events.some((e) => e.type === "callout" && e.line === "moving")).toBe(true);
    // Recruits move without overwatch.
    const recruits = field([], { difficulty: "recruit" });
    for (const p of blue(recruits)) plan(recruits, p, { x: 30, z: p.z });
    reportContact(recruits, blue(recruits)[0], recruits.players.find((q) => q.team === "red")!);
    expect(blue(recruits).some((p) => overwatchHold(recruits, p, idle(), true, () => 1))).toBe(false);
  });
});

describe("shared memory and perception", () => {
  const wall: Box = { x: 20, z: 3, w: 0.6, d: 14, h: 2.4, kind: "barrier" };
  it("shares a sighting with the squad, and a gunner fires at the remembered position", () => {
    const g = field([wall]);
    const [observer, gunner] = blue(g);
    const enemy = g.players.find((q) => q.team === "red")!;
    Object.assign(enemy, { x: 21.5, z: 3 });
    reportContact(g, observer, enemy);
    expect(squadOf(g, gunner)!.contact).toMatchObject({ enemy: enemy.id });
    Object.assign(gunner, { weapon: "machineGun", ammo: 50, yaw: Math.PI / 2 });
    raiseSights(gunner);
    let fired = 0;
    for (let i = 0; i < 60; i++) {
      g.tick++;
      const c = botCommand(g, gunner);
      if (c.fire) fired++;
      gunner.yaw = c.yaw;
      gunner.pitch = c.pitch;
    }
    expect(gunner.target).toBe(-1);
    expect(fired).toBeGreaterThan(0);
    expect(gunner.mode).toBe("Suppressing");
    expect(Math.abs(gunner.yaw - yawTo(gunner, enemy))).toBeLessThan(0.15);
  });

  it("lets a rifleman fire after a target that just went out of sight, but not through a friend", () => {
    const g = field([wall]);
    const rifleman = blue(g).find((p) => p.id % 3 === 0)!;
    rifleman.awareness.observed = { x: 21.5, y: 1.3, z: rifleman.z };
    rifleman.awareness.seenAt = g.tick - 20;
    raiseSights(rifleman);
    let fired = false;
    for (let i = 0; i < 30 && !fired; i++) {
      g.tick++;
      rifleman.awareness.seenAt = g.tick - 20;
      const c = botCommand(g, rifleman);
      fired = c.fire;
      rifleman.yaw = c.yaw;
      rifleman.pitch = c.pitch;
    }
    expect(fired).toBe(true);
    const friend = blue(g).find((p) => p !== rifleman)!;
    Object.assign(friend, { x: 10, z: rifleman.z });
    let blocked = true;
    for (let i = 0; i < 30; i++) {
      g.tick++;
      rifleman.awareness.seenAt = g.tick - 20;
      if (botCommand(g, rifleman).fire) blocked = false;
    }
    expect(blocked).toBe(true);
  });

  it("hears sprinting and reloading enemies behind it, within the profile's range", () => {
    const g = field();
    const p = blue(g)[0],
      q = g.players.find((r) => r.team === "red")!;
    Object.assign(q, { x: p.x - 12, z: p.z, vx: 3, vz: 0 });
    expect(canNotice(g, p, q)).toBe(false);
    expect(audible(g, p, q)).toBe(false);
    q.vx = 7;
    expect(audible(g, p, q)).toBe(true);
    q.vx = 0;
    q.reloadAt = g.tick + 30;
    expect(audible(g, p, q)).toBe(true);
    botCommand(g, p);
    expect(p.target).toBe(q.id);
    // Recruits hear 10 m, veterans 20 m.
    for (const [difficulty, heard] of [["recruit", false], ["veteran", true]] as const) {
      const h = field([], { difficulty });
      const a = blue(h)[0],
        b = h.players.find((r) => r.team === "red")!;
      Object.assign(b, { x: a.x - 14, z: a.z, vx: 7 });
      expect(audible(h, a, b)).toBe(heard);
    }
  });

  it("targets the enemy aiming at it before a nearer one", () => {
    for (const squads of [true, false]) {
      const g = field([], { squads });
      const p = blue(g)[0];
      const [near, aiming] = g.players.filter((q) => q.team === "red");
      Object.assign(near, { x: p.x + 12, z: p.z });
      Object.assign(aiming, { x: p.x + 20, z: p.z + 4 });
      aiming.command = { ...idle(), aim: true };
      aiming.yaw = yawTo(aiming, p);
      if (squads) expect(threatScore(g, p, aiming)).toBeLessThan(threatScore(g, p, near));
      botCommand(g, p);
      expect(p.target).toBe(squads ? aiming.id : near.id);
    }
  });
});

describe("buildings", () => {
  it("gives every kit window a firing post a pace inside, looking out", () => {
    const g = village();
    let upper = 0;
    for (const b of g.map.buildings!.filter((b) => b.kit)) {
      expect(b.kit!.windows.length, b.id).toBeGreaterThan(0);
      for (const w of b.kit!.windows) {
        expect(kitBuildingAt(g, w)?.id).toBe(b.id);
        const out = { x: w.x + Math.sin(w.yaw) * 1.5, z: w.z - Math.cos(w.yaw) * 1.5 };
        expect(kitBuildingAt(g, out)?.id).not.toBe(b.id);
        if (w.y !== undefined) upper++;
      }
    }
    expect(upper).toBeGreaterThan(0);
  });

  it("puts one defender at each window facing the threat", () => {
    const g = village();
    const flag = g.sectors.findIndex((s) => s.id === "C");
    Object.assign(g.sectors[flag], { owner: "blue", control: 1 });
    const defenders = blue(g).filter((p) => p.weapon !== "machineGun").slice(0, 14);
    for (const [i, p] of defenders.entries()) {
      // Start just outside the manor's doors.
      const manor = g.map.buildings!.find((b) => b.id === "manor")!;
      const door = manor.kit!.entrances[i % manor.kit!.entrances.length];
      const away = Math.hypot(door.x - manor.x, door.z - manor.z);
      Object.assign(p, { x: door.x + ((door.x - manor.x) / away) * (1.5 + Math.floor(i / 4)), z: door.z + ((door.z - manor.z) / away) * (1.5 + Math.floor(i / 4)), objective: flag, villagePlan: null });
      planVillageMove(g, p, (a, b) => pathfind(a, b, g.map));
    }
    const windows = defenders.filter((p) => p.villagePlan?.window !== undefined);
    expect(windows.length).toBeGreaterThanOrEqual(4);
    for (const p of windows)
      for (const q of windows)
        if (p !== q) expect(dist(p.villagePlan!.goal, q.villagePlan!.goal)).toBeGreaterThan(0.5);
    // Enemies come from the east: nobody watches a west window, and upstairs is used.
    for (const p of windows) expect(Math.sin(p.villagePlan!.window!)).toBeGreaterThan(-0.5);
    expect(windows.some((p) => p.villagePlan!.goal.y !== undefined)).toBe(true);
  });

  // An enemy inside the school, a squad outside one of its doors.
  function breach() {
    const g = village();
    const school = g.map.buildings!.find((b) => b.id === "school")!;
    const [thrower, ...squad] = blue(g).slice(0, 5);
    const enemy = g.players.find((q) => q.team === "red")!;
    for (const door of school.kit!.entrances) {
      const out = Math.abs(door.x - school.x) / school.w > Math.abs(door.z - school.z) / school.d
        ? { x: Math.sign(door.x - school.x), z: 0 }
        : { x: 0, z: Math.sign(door.z - school.z) };
      Object.assign(thrower, { x: door.x + out.x * 8, z: door.z + out.z * 8 });
      thrower.y = groundHeight(thrower.x, thrower.z, g.map);
      Object.assign(enemy, { x: door.x - out.x * 3.5, z: door.z - out.z * 3.5 });
      g.tactics!.squads[squadOf(g, thrower)!.id].lastGrenade = -1000;
      reportContact(g, thrower, enemy);
      g.tick += (3 + (thrower.id % 3) - (g.tick % 3)) % 3;
      const c = idle();
      if (grenadeCommand(g, thrower, c)) return { g, school, door, out, thrower, squad, enemy, c };
    }
    throw Error("No door gave a clear throw");
  }

  it("throws a frag through a door at an enemy inside, and it lands in the room", () => {
    const { g, school, thrower, c } = breach();
    expect(c.grenade).toBe(true);
    expect(c.throwSpeed).toBeLessThanOrEqual(20);
    g.commandOverride = (_, p) => (p === thrower && g.tick === throwTick ? c : idle());
    const throwTick = g.tick + 1;
    let landed: Vec | undefined;
    for (let i = 0; i < 150 && !landed; i++) {
      g.step(idle());
      const e = g.events.find((e) => e.type === "grenadeExplosion" && e.actor === thrower.id);
      if (e && e.type === "grenadeExplosion") landed = e.at;
    }
    expect(landed).toBeDefined();
    expect(kitBuildingAt(g, landed!)?.id).toBe(school.id);
    expect(thrower.grenades).toBe(2);
  });

  it("does not throw with a friend near the target, or twice in quick succession", () => {
    const { g, thrower, squad, enemy } = breach();
    const s = squadOf(g, thrower)!;
    s.lastGrenade = g.tick;
    const second = squad[0];
    Object.assign(second, { x: thrower.x, z: thrower.z + 1 });
    g.tick += (3 + (second.id % 3) - (g.tick % 3)) % 3;
    expect(grenadeCommand(g, second, idle())).toBe(false);
    s.lastGrenade = -1000;
    g.tactics!.nextFrag[thrower.id] = 0;
    Object.assign(squad[1], { x: enemy.x + 1, z: enemy.z });
    g.tick += 3;
    expect(grenadeCommand(g, thrower, idle())).toBe(false);
  });

  it("stacks at the door until the grenade goes off, then clears the doorway", () => {
    const { g, school, door, out, squad } = breach();
    const p = squad[0];
    Object.assign(p, { x: door.x + out.x * 2, z: door.z + out.z * 2 });
    plan(g, p, { x: school.x, z: school.z });
    const c = idle();
    expect(stackAtDoor(g, p, c)).toBe(true);
    expect(c.crouch).toBe(true);
    expect(p.mode).toBe("Stacking");
    observeTactics(g, [{ id: 1, tick: g.tick, type: "grenadeExplosion", actor: squad[1].id } as Event]);
    g.tick += 7;
    expect(stackAtDoor(g, p, idle())).toBe(false);
    // Through the door, a moving soldier looks along both walls.
    const inside = school.kit!.doorways.find((d) => kitBuildingAt(g, d)?.id === school.id)!;
    Object.assign(p, { x: inside.x, z: inside.z, y: inside.y });
    const yaws: number[] = [];
    for (let i = 0; i < 30; i++) {
      g.tick++;
      const turn = { ...idle(), x: 1 };
      expect(checkCorners(g, p, turn)).toBe(true);
      yaws.push((p.yaw = turn.yaw));
    }
    expect(p.mode).toBe("Clearing");
    // A sweep either side of the way in.
    expect(Math.max(...yaws) - Math.min(...yaws)).toBeGreaterThan(1);
  });

  it("gets off a failing floor before it falls and avoids that building's posts", () => {
    const g = village();
    // An upstairs navigation anchor, which is clear of furniture, and its floor bay.
    const floors = g.map.boxes.filter(
      (b) => b.architecture?.building === "manor" && b.architecture.part === "floor" && b.architecture.level === 1,
    );
    const at = g.map.navigationPoints!.find((n) => n.y !== undefined && floors.some((b) => Math.abs(n.x - b.x) < 0.6 && Math.abs(n.z - b.z) < 0.6))!;
    const floor = floors.find((b) => Math.abs(at.x - b.x) < 0.6 && Math.abs(at.z - b.z) < 0.6)!;
    const p = blue(g)[0];
    Object.assign(p, { x: at.x, z: at.z, y: at.y });
    g.map.destruction!.failing = { [floor.id!]: g.tick + 30 };
    g.commandOverride = (game, s) => (s === p ? botCommand(game, s) : idle());
    g.step(idle());
    expect(p.mode).toBe("Escaping collapse");
    expect(g.tactics!.unsafe.manor).toBeGreaterThan(g.tick);
    for (let i = 0; i < 28; i++) g.step(idle());
    expect(Math.abs(p.x - floor.x) > floor.w / 2 || Math.abs(p.z - floor.z) > floor.d / 2).toBe(true);
  });
});

describe("danger-aware routes", () => {
  it("raises danger where soldiers die, fades it over about 30 s, and routes round it", () => {
    const g = village();
    const victim = blue(g)[0];
    observeTactics(g, [{ id: 1, tick: g.tick, type: "death", actor: victim.id } as Event]);
    expect(dangerAt(g, "blue", victim.x, victim.z)).toBeCloseTo(2.5, 1);
    expect(dangerAt(g, "red", victim.x, victim.z)).toBe(0);
    const start = g.map.spawn.blue,
      flag = g.sectors.find((s) => s.id === "C")!;
    const before = pathfind(start, flag, g.map);
    expect(before.length).toBeGreaterThan(2);
    const exposure = (route: Vec[]) => {
      let sum = 0,
        from = start;
      for (const next of route) {
        sum += dist(from, next) * dangerAt(g, "blue", (from.x + next.x) / 2, (from.z + next.z) / 2);
        from = next;
      }
      return sum;
    };
    // A killing zone on the middle of the direct route.
    for (const node of before.slice(1, -1)) raiseDanger(g, "blue", node, squadRules.dangerCap);
    const after = pathfind(start, flag, g.map, false, dangerCost(g, "blue"));
    expect(after.length).toBeGreaterThan(0);
    expect(exposure(after)).toBeLessThan(exposure(before) * 0.7);
    g.tick += 900;
    expect(dangerAt(g, "blue", victim.x, victim.z)).toBeLessThan(0.15);
  });
});

describe("difficulty and callouts", () => {
  it("scales reaction, aim, grenades, memory and coordination by profile", () => {
    const [recruit, regular, veteran] = (["recruit", "regular", "veteran"] as const).map((d) => botSettingsFor(villageMap, d));
    expect(recruit.reactionTicks).toBeGreaterThan(regular.reactionTicks);
    expect(veteran.reactionTicks).toBeLessThan(regular.reactionTicks);
    expect(recruit.aimError).toBeGreaterThan(regular.aimError);
    expect(veteran.aimError).toBeLessThan(regular.aimError);
    expect(recruit.grenadeGapTicks).toBeGreaterThan(veteran.grenadeGapTicks);
    expect(veteran.squadMemoryTicks).toBeGreaterThan(recruit.squadMemoryTicks);
    expect([recruit.overwatch, regular.overwatch, veteran.overwatch]).toEqual([false, true, true]);
    // Regular is today's tuning, including the trench maps' own aim.
    expect(regular.reactionTicks).toBe(27);
    expect(regular.aimError).toBe(0.075);
    expect(botSettingsFor(trenchMap).aimError).toBe(0.06);
    expect(village({ difficulty: "veteran" }).botSettings).toMatchObject({ difficulty: "veteran", aimError: veteran.aimError });
  });

  it("calls out an enemy in a house once, and reloading while in contact", () => {
    const g = village();
    const p = blue(g)[0];
    const enemy = g.players.find((q) => q.team === "red")!;
    const school = g.map.buildings!.find((b) => b.id === "school")!;
    Object.assign(enemy, { x: school.x, z: school.z });
    g.events = [];
    reportContact(g, p, enemy);
    reportContact(g, blue(g)[1], enemy);
    expect(g.events.filter((e) => e.type === "callout" && e.line === "house")).toHaveLength(1);
    const reload = { ...idle(), reload: true };
    reloadCallout(g, blue(g)[2], reload);
    expect(g.events.some((e) => e.type === "callout" && e.line === "reloading")).toBe(true);
  });
});

it("plays a village battle with squads that throw grenades, man windows and capture", () => {
  const g = village();
  let grenades = 0,
    captures = 0,
    callouts = 0,
    atWindow = 0;
  for (let tick = 0; tick < 1800; tick++) {
    g.step(botCommand(g, g.players[0]));
    for (const e of g.events) {
      if (e.type === "grenadeThrow") grenades++;
      if (e.type === "capture") captures++;
      if (e.type === "callout") callouts++;
    }
    if (tick % 30 === 0)
      atWindow += g.players.filter((p) => p.hp > 0 && p.villagePlan?.window !== undefined && dist(p, p.villagePlan.goal) < 1.5).length;
    if (tick % 300 === 0) expect(g.players.every((p) => Number.isFinite(p.x + p.y + p.z + p.hp))).toBe(true);
  }
  expect(grenades).toBeGreaterThan(0);
  expect(captures).toBeGreaterThanOrEqual(2);
  expect(callouts).toBeGreaterThan(0);
  expect(atWindow).toBeGreaterThan(0);
}, 60000);
