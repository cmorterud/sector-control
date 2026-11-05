import { Entity } from "playcanvas";
import { TerrainPhysics } from "./physics";
import { terrainGeometry } from "./terrain-geometry";
import { describe, it, expect } from "vitest";
import {
  Game,
  TestCollision,
  idle,
  botCommand,
  rifleHeight,
  type CollisionWorld,
  type Projectile,
} from "./simulation";
import { canStand, eyeHeightOf, cameraHeightOf } from "./crouch";
import { industrialMap, type MapDefinition } from "./map";
import { trenchMap } from "./trench-map";
import { requestArtillery } from "./artillery";
import { PlaytestLog } from "./playtest";
const open: MapDefinition = { ...industrialMap, boxes: [] };
function scene(map = open, collision: CollisionWorld = new TestCollision(map)) {
  const g = new Game(collision, false, 5000, 12345, undefined, {
    map,
    assaults: false,
  });
  Object.assign(g.players[0], { x: 0, z: 0, y: 0, protectedUntil: 0 });
  return g;
}
function enemy(g: Game, x = 20) {
  const p = {
    ...g.players[0],
    id: g.players.length,
    team: "red" as const,
    x,
    z: 0,
    y: 0,
    nextThink: 1e9,
    protectedUntil: 0,
    ammo: 0,
    reserve: 0,
  };
  g.players.push(p);
  g.botSettings.engagementRange = 0;
  return p;
}
const round = (y: number): Projectile => ({
  id: 1,
  actor: 1,
  team: "red",
  x: -10,
  y,
  z: 0,
  vx: 32,
  vy: 0,
  vz: 0,
  remaining: 60,
  bornAt: 0,
});

describe("held crouching", () => {
  it("records only stance transitions, lowers eye/camera/muzzle, and stands when released", () => {
    const g = scene(),
      p = g.players[0],
      log = new PlaytestLog();
    for (let i = 0; i < 30; i++) {
      const c = { ...idle(), crouch: true };
      g.step(c);
      log.recordTick(g, c, i / 30);
    }
    expect(p.crouched).toBe(true);
    expect(p.y).toBe(0);
    expect(log.summary().stanceChanges).toBe(1);
    expect(eyeHeightOf(p)).toBeCloseTo(1.1);
    expect(cameraHeightOf(p)).toBeCloseTo(1.95);
    expect(rifleHeight(g.map, p)).toBeCloseTo(0.9);
    expect(g.snapshot().players[0].crouched).toBe(true);
    g.step(idle());
    expect(p.crouched).toBe(false);
    expect(g.events).toContainEqual(
      expect.objectContaining({ type: "stance", crouched: false }),
    );
  });
  it("moves at half walking speed and cannot sprint or gain speed diagonally while crouched", () => {
    const distance = (crouch: boolean, sprint = false, z = 0) => {
      const g = scene();
      for (let i = 0; i < 120; i++)
        g.step({ ...idle(), x: 1, z, crouch, sprint });
      return Math.hypot(g.players[0].x, g.players[0].z);
    };
    const walking = distance(false),
      crouching = distance(true);
    expect(crouching / walking).toBeCloseTo(0.5, 4);
    expect(distance(true, true)).toBeCloseTo(crouching, 4);
    expect(distance(true, false, 1)).toBeCloseTo(crouching, 4);
  });
  it("does not stand or jump into overhead cover, including a blocked shoulder ray, and stands once clear", () => {
    let ceiling = true;
    const world: CollisionWorld = {
      move: (p, d) => ({ x: p.x + d.x, z: p.z + d.z }),
      ray: (a, b) =>
        ceiling && a.x > 0.2 && a.y < 1.6 && b.y >= 1.6 ? 0.5 : 1,
    };
    const g = scene(open, world),
      p = g.players[0];
    g.step({ ...idle(), crouch: true });
    expect(canStand(g, p)).toBe(false);
    g.step(idle());
    expect(p.crouched).toBe(true);
    g.step({ ...idle(), mantle: true, crouch: true });
    expect(p.crouched).toBe(true);
    expect(p.hop).toBeNull();
    expect(p.mantle).toBeNull();
    ceiling = false;
    g.step(idle());
    expect(p.crouched).toBe(false);
  });
  it("stands when C is released at the very edge of a firing step beside higher earth", () => {
    const g = scene(trenchMap),
      p = g.players[0];
    Object.assign(p, { x: -18 - 1e-8, y: 0.85, z: -1 });
    g.step({ ...idle(), crouch: true });
    expect(p.crouched).toBe(true);
    g.step(idle());
    expect(p.crouched).toBe(false);
  });
  it("stands to hop or mantle with clearance, ignores crouch in the air, and resumes it after landing", () => {
    const g = scene(),
      p = g.players[0];
    g.step({ ...idle(), crouch: true });
    g.step({ ...idle(), crouch: true, mantle: true });
    expect(p.crouched).toBe(false);
    expect(p.hop).not.toBeNull();
    for (let i = 0; i < 8; i++) {
      g.step({ ...idle(), crouch: true });
      expect(p.crouched).toBe(false);
    }
    for (let i = 0; i < 25; i++) g.step({ ...idle(), crouch: true });
    expect(p.hop).toBeNull();
    expect(p.crouched).toBe(true);
    const trench = scene(trenchMap);
    Object.assign(trench.players[0], { x: -18.5, z: -27, y: 0 });
    trench.step({ ...idle(), crouch: true });
    trench.step({ ...idle(), yaw: Math.PI / 2, crouch: true, mantle: true });
    expect(trench.players[0].mantle).not.toBeNull();
    expect(trench.players[0].crouched).toBe(false);
  });
  it("resets crouch on death, respawn and a fresh match", () => {
    const g = scene(),
      p = g.players[0];
    g.step({ ...idle(), crouch: true });
    g.explode({ x: 0, y: 0.2, z: 0 }, 0, "blue", {
      kind: "test",
      radius: 5,
      damage: 500,
      structuralRadius: 0,
      structuralDamage: 0,
      craterRadius: 0,
      craterDepth: 0,
      terrainReach: 0,
    });
    expect(p.hp).toBe(0);
    expect(p.crouched).toBe(false);
    g.respawn(p);
    expect(p.crouched).toBe(false);
    expect(scene().players[0].crouched).toBe(false);
  });
});

describe("crouching combat profile", () => {
  it("lets head-height rounds pass over a crouched soldier while lower rounds still damage them", () => {
    const hit = (crouch: boolean, y: number) => {
      const g = scene();
      enemy(g);
      g.projectiles = [round(y)];
      for (let i = 0; i < 14; i++) g.step({ ...idle(), crouch });
      return g.players[0].hp;
    };
    expect(hit(false, 1.6)).toBe(75);
    expect(hit(true, 1.6)).toBe(100);
    expect(hit(true, 1)).toBe(75);
  });
  it("uses crouched hit volumes during the muzzle sweep rather than an invisible standing head", () => {
    const fire = (crouched: boolean) => {
      const g = scene(),
        p = enemy(g, 0.65);
      p.z = 0.2;
      p.crouched = crouched;
      g.players[0].yaw = Math.PI / 2;
      g.fire(g.players[0]);
      return g;
    };
    expect(
      fire(false).events.some((e) => e.type === "impact" && e.target === 1),
    ).toBe(true);
    const low = fire(true);
    expect(low.events.some((e) => e.type === "impact" && e.target === 1)).toBe(
      false,
    );
    expect(low.projectiles).toHaveLength(1);
  });
  it("hides the head on a firing step, drops the enemy target immediately, and blocks spotting until standing", () => {
    const g = scene(trenchMap),
      p = g.players[0],
      red = enemy(g, 19);
    Object.assign(p, { x: -19, y: 0.85, z: -1 });
    Object.assign(red, { y: 0.85, z: -1 });
    g.botSettings.engagementRange = 59;
    g.botSettings.awareness = false;
    g.tick = 1;
    botCommand(g, red);
    expect(red.target).toBe(0);
    p.crouched = true;
    g.tick = 2;
    botCommand(g, red);
    expect(red.target).toBe(-1);
    g.tick = 900;
    expect(requestArtillery(g, p, { x: 19, z: -1 })).toBe(false);
    expect(g.artillery.readyAt.blue).toBe(600);
    p.crouched = false;
    expect(requestArtillery(g, p, { x: 19, z: -1 })).toBe(true);
  });
  it("fires from the lowered muzzle into the parapet instead of spawning rounds beyond it", () => {
    const g = scene(trenchMap),
      p = g.players[0];
    Object.assign(p, { x: -19, y: 0.85, z: -1 });
    g.step({ ...idle(), crouch: true, fire: true, yaw: Math.PI / 2 });
    const fire = g.events.find((e) => e.type === "fire");
    expect(fire?.type === "fire" && fire.from.y).toBeCloseTo(1.95);
    expect(g.projectiles).toHaveLength(0);
    expect(g.events.some((e) => e.type === "impact" && e.target === null)).toBe(
      true,
    );
    g.step(idle());
    p.nextShot = 0;
    g.step({ ...idle(), fire: true, yaw: Math.PI / 2 });
    expect(g.projectiles).toHaveLength(1);
  });
  it("releases smoke from the crouched hand height with its normal inventory and lifecycle", () => {
    const g = scene(),
      p = g.players[0];
    g.step({ ...idle(), crouch: true, smoke: true, yaw: Math.PI / 2 });
    const e = g.events.find((e) => e.type === "smokeThrow");
    expect(e?.type === "smokeThrow" && e.from.y).toBeCloseTo(1.4);
    expect(p.smokes).toBe(1);
    expect(p.grenades).toBe(3);
    expect(p.crouched).toBe(true);
    for (let i = 0; i < 120; i++) g.step({ ...idle(), crouch: true });
    expect(g.smokeClouds).toHaveLength(1);
  });
});

it("keeps a flat crouched muzzle behind the bank with actual Ammo terrain contact tolerance", () => {
  const physics = new TerrainPhysics(),
    entity = new Entity("bank test");
  const g = scene(trenchMap, {
    move: (p) => ({ x: p.x, z: p.z }),
    ray: (a, b) => physics.ray(a, b),
  });
  try {
    physics.setPatch("-3,-1", terrainGeometry(g.map, "-3,-1"), entity);
    expect(
      physics.ray({ x: -17, y: 4, z: -1 }, { x: -17, y: 1, z: -1 }),
    ).toBeCloseTo((4 - 2.4) / 3, 3);
    const p = g.players[0];
    Object.assign(p, {
      x: -18 - 1e-8,
      y: 0.85,
      z: -1,
      crouched: true,
      yaw: Math.PI / 2,
      pitch: 0,
    });
    g.fire(p);
    expect(g.projectiles).toHaveLength(0);
    expect(g.events.some((e) => e.type === "impact" && e.target === null)).toBe(
      true,
    );
  } finally {
    physics.destroy();
    entity.destroy();
  }
});
