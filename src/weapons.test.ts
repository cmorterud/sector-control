import { expect, it } from "vitest";
import { Game, TestCollision, idle } from "./simulation";
import { trenchMap } from "./trench-map";
import { industrialMap } from "./map";
import { rosterWeapon } from "./weapons";
import { semiAutoIntent } from "./awareness";

it("keeps riflemen the majority and humans on semi-auto rifles", () => {
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
  expect(g.players[0].weapon).toBe("rifle");
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
  expect(p.ammo).toBe(59); // No held-trigger repeat on the player's rifle input path.
  const reload = idle();
  reload.reload = true;
  g.step(reload);
  expect(p.reloadAt - g.tick).toBe(90);
  for (let i = 0; i < 89; i++) g.step(idle());
  expect(p.ammo).toBe(59);
  g.step(idle());
  expect(p.ammo).toBe(60);
  expect(p.reserve).toBe(239);
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
