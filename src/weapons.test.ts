import { expect, it } from "vitest";
import { Game, TestCollision, idle } from "./simulation";
import { trenchMap } from "./trench-map";
import { industrialMap } from "./map";
import { rosterWeapon } from "./weapons";
import { semiAutoIntent } from "./awareness";

it("cycles a five-round service rifle between individual clicks, preserves traveling shot damage and reloads from reserve", () => {
  const map = { ...industrialMap, boxes: [] };
  const g = new Game(new TestCollision(map), false, 3000, 12345, undefined, {
    map,
  });
  const p = g.players[0];
  p.weapon = "serviceRifle";
  g.respawn(p);
  const shots: number[] = [],
    actions: string[] = [];
  for (let i = 0; i < 190; i++) {
    g.step({ ...idle(), fire: i % 2 === 0 });
    for (const e of g.events) {
      if (e.type === "fire") shots.push(e.tick);
      if (e.type === "weaponAction") actions.push(e.action);
    }
  }
  expect(shots).toEqual([1, 19, 37, 55, 73]);
  expect(p.ammo).toBe(0);
  expect(p.reserve).toBe(60);
  expect(actions.filter((a) => a === "boltOpen")).toHaveLength(5);
  expect(actions.filter((a) => a === "boltClose")).toHaveLength(5);
  g.step({ ...idle(), reload: true });
  expect(p.reloadAt - g.tick).toBe(48);
  const loading: string[] = [];
  for (let i = 0; i < 47; i++) {
    g.step({ ...idle(), fire: i % 2 === 0 });
    for (const e of g.events)
      if (e.type === "weaponAction") loading.push(e.action);
  }
  expect(loading).toEqual(["boltOpen", "clip", "boltClose"]);
  expect(p.ammo).toBe(0);
  g.step(idle());
  expect(p.ammo).toBe(5);
  expect(p.reserve).toBe(55);
  g.step({ ...idle(), fire: true });
  expect(g.projectiles[0].damage).toBe(50);
  g.respawn(p);
  expect(p.ammo).toBe(5);
  expect(p.reserve).toBe(60);
});

it("retains a traveling service round's damage after the shooter changes weapon or dies", () => {
  const map = { ...industrialMap, boxes: [] };
  const g = new Game(
    { ray: () => 1, move: (p) => p },
    true,
    3000,
    12345,
    undefined,
    { map, teamSize: 1, assaults: false },
  );
  g.artillery.enabled = false;
  g.botSettings.engagementRange = 0;
  const [p, target] = g.players;
  Object.assign(p, {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    weapon: "serviceRifle",
    protectedUntil: 0,
  });
  Object.assign(target, {
    x: 0.18,
    y: 0,
    z: -12,
    hp: 100,
    protectedUntil: 0,
    nextThink: 1e9,
  });
  g.step({ ...idle(), fire: true });
  expect(target.hp).toBe(100);
  expect(g.projectiles[0].damage).toBe(50);
  p.weapon = "machineGun";
  p.hp = 0;
  p.respawnAt = 1e9;
  for (let i = 0; i < 20; i++) g.step(idle());
  expect(target.hp).toBe(50);
});

it("keeps riflemen the majority and trench humans on bolt-action service rifles", () => {
  for (const size of [5, 25, 50]) {
    const roles = Array.from({ length: size }, (_, i) =>
      rosterWeapon(i, size, false),
    );
    expect(roles.filter((r) => r === "machineGun")).toHaveLength(
      Math.floor(size / 12),
    );
    expect(roles.filter((r) => r === "rifle").length).toBeGreaterThan(
      size * 0.9,
    );
    for (let i = 0; i < size; i++)
      expect(rosterWeapon(i, size, true)).toBe("rifle");
  }
  const g = new Game(
    new TestCollision(trenchMap),
    true,
    1000,
    12345,
    undefined,
    { map: trenchMap },
  );
  for (const team of ["blue", "red"]) {
    const gunners = g.players.filter(
      (p) => p.team === team && p.weapon === "machineGun",
    );
    expect(gunners).toHaveLength(4);
    expect(gunners.every((p) => p.ammo === 60 && p.reserve === 240)).toBe(true);
  }
  expect(g.players[0].weapon).toBe("serviceRifle");
});

it("emits rapid four-to-six-round bursts separated by long pauses, with suppression slowing them", () => {
  const g = new Game(new TestCollision(), false),
    p = g.players[0];
  p.weapon = "machineGun";
  p.ammo = 60;
  const shots: number[] = [];
  for (g.tick = 0; g.tick < 300; g.tick++) {
    if (semiAutoIntent(g, p)) shots.push(g.tick);
  }
  const gaps = shots.slice(1).map((s, i) => s - shots[i]);
  expect(gaps.filter((n) => n === 3).length).toBeGreaterThan(12);
  expect(gaps.some((n) => n >= 45 && n <= 90)).toBe(true);
  const bursts: number[] = [1];
  for (const gap of gaps)
    gap === 3 ? bursts[bursts.length - 1]++ : bursts.push(1);
  expect(bursts.slice(0, -1).every((n) => n >= 4 && n <= 6)).toBe(true);
  p.awareness.nextTrigger = 0;
  p.awareness.stringShots = 0;
  p.suppression = 1;
  expect(semiAutoIntent(g, p)).toBe(true);
  expect(p.awareness.nextTrigger - g.tick).toBe(13);
});

it("uses the gunner's actual magazine, reload time, rate, events and respawn inventory", () => {
  const map = { ...industrialMap, boxes: [] };
  const g = new Game(new TestCollision(map), false, 1000, 12345, undefined, {
    map,
  });
  const p = g.players[0];
  p.weapon = "machineGun";
  g.respawn(p);
  const c = idle();
  c.fire = true;
  g.step(c);
  expect(g.events.find((e) => e.type === "fire")).toMatchObject({
    weapon: "machineGun",
  });
  expect(p.ammo).toBe(59);
  expect(p.nextShot - g.tick).toBe(3);
  for (let i = 0; i < 10; i++) g.step(c);
  expect(p.ammo).toBe(56); // Player support weapons repeat while held.
  const reload = idle();
  reload.reload = true;
  g.step(reload);
  expect(p.reloadAt - g.tick).toBe(45);
  for (let i = 0; i < 44; i++) g.step(idle());
  expect(p.ammo).toBe(56);
  g.step(idle());
  expect(p.ammo).toBe(60);
  expect(p.reserve).toBe(236);
  g.respawn(p);
  expect(p.ammo).toBe(60);
  expect(p.reserve).toBe(240);
});

it("requires awareness and stops gunner bursts immediately when sight is lost", () => {
  let visible = true;
  const g = new Game(
    { ray: () => (visible ? 1 : 0), move: (p) => ({ x: p.x, z: p.z }) },
    true,
    5000,
    12345,
    undefined,
    { map: { ...industrialMap, boxes: [] }, teamSize: 1, assaults: false },
  );
  const [target, p] = g.players;
  Object.assign(target, {
    x: 0,
    z: -25,
    y: 0,
    hp: 1000000,
    protectedUntil: 0,
    nextThink: 1e9,
  });
  Object.assign(p, {
    x: 0,
    z: 0,
    y: 0,
    yaw: 0,
    hp: 1000000,
    weapon: "machineGun",
    ammo: 60,
    protectedUntil: 0,
    nextThink: 1e9,
  });
  let acquired = -1;
  const shots: number[] = [];
  for (let i = 0; i < 180; i++) {
    g.step(idle());
    if (p.target >= 0 && acquired < 0) acquired = g.tick;
    if (g.events.some((e) => e.type === "fire" && e.actor === p.id))
      shots.push(g.tick);
  }
  expect(shots[0] - acquired).toBeGreaterThanOrEqual(27);
  expect(shots.some((s, i) => i > 0 && s - shots[i - 1] === 3)).toBe(true);
  expect(shots.length).toBeGreaterThan(4);
  visible = false;
  for (let i = 0; i < 30; i++) {
    g.step(idle());
    expect(g.events.some((e) => e.type === "fire" && e.actor === p.id)).toBe(
      false,
    );
  }
});

it("doubles both rifle velocities, retains machine-gun speed, and keeps in-flight speed after a weapon change", () => {
  for (const [weapon, speed] of [
    ["rifle", 128],
    ["serviceRifle", 128],
    ["machineGun", 32],
  ] as const) {
    const g = new Game(
        new TestCollision({ ...industrialMap, boxes: [] }),
        false,
      ),
      p = g.players[0];
    p.weapon = weapon;
    g.respawn(p);
    g.fire(p);
    const shot = g.projectiles[0],
      start = { ...shot };
    expect(Math.hypot(shot.vx, shot.vy, shot.vz)).toBeCloseTo(speed);
    p.weapon = weapon === "machineGun" ? "serviceRifle" : "machineGun";
    for (let i = 0; i < 3; i++) g.step(idle());
    expect(
      Math.hypot(shot.x - start.x, shot.y - start.y, shot.z - start.z),
    ).toBeCloseTo(speed / 10);
  }
});

it("aligns the faster bolt and clip sound events with the shortened mechanical cycle", () => {
  const map = { ...industrialMap, boxes: [] };
  const g = new Game(new TestCollision(map), false, 3000, 12345, undefined, {
      map,
    }),
    p = g.players[0];
  p.weapon = "serviceRifle";
  g.respawn(p);
  g.step({ ...idle(), fire: true });
  const shotAt = g.tick,
    cycle: { tick: number; action: string }[] = [];
  expect(p.nextShot - shotAt).toBe(18);
  for (let i = 0; i < 17; i++) {
    g.step(idle());
    for (const e of g.events)
      if (e.type === "weaponAction")
        cycle.push({ tick: e.tick - shotAt, action: e.action });
  }
  expect(cycle).toEqual([
    { tick: 5, action: "boltOpen" },
    { tick: 14, action: "boltClose" },
  ]);
  g.step({ ...idle(), fire: true });
  expect(p.ammo).toBe(3);
  g.step({ ...idle(), reload: true });
  const reloadAt = g.tick,
    loading: { tick: number; action: string }[] = [];
  for (let i = 0; i < 48; i++) {
    g.step(idle());
    for (const e of g.events)
      if (e.type === "weaponAction")
        loading.push({ tick: e.tick - reloadAt, action: e.action });
  }
  expect(loading).toEqual([
    { tick: 3, action: "boltOpen" },
    { tick: 24, action: "clip" },
    { tick: 42, action: "boltClose" },
  ]);
  expect(p.ammo).toBe(5);
  expect(p.reloadAt).toBe(0);
});
