import { describe, expect, it } from "vitest";
import { Entity, Vec3 } from "playcanvas";
import { Game, idle, TestCollision } from "./simulation";
import { industrialMap, type MapDefinition } from "./map";
import { eyeHeightOf } from "./crouch";
import { weaponAim } from "./recoil";
import { firstPersonView, sighted, viewDirection, viewToWorld } from "./player-view";

const map: MapDefinition = { ...industrialMap, boxes: [] };
function scene() {
  const g = new Game(new TestCollision(map), false, 600, 12345, undefined, { map });
  g.players.splice(1);
  Object.assign(g.players[0], { x: 0, y: 0, z: 0, protectedUntil: 0 });
  return g;
}

describe("first-person sight and projectile alignment", () => {
  it("puts camera-local points in the actual camera basis through yaw, pitch, recoil and crouch", () => {
    const p = scene().players[0];
    for (const yaw of [-2.1, 0, 1.5]) for (const pitch of [-0.8, 0, 0.7])
      for (const crouched of [false, true]) {
        Object.assign(p, { yaw, pitch, crouched, recoilPitch: 0.03, recoilYaw: -0.01 });
        const aim = weaponAim(p), dir = viewDirection(aim.yaw, aim.pitch);
        const camera = new Entity();
        camera.setPosition(p.x, p.y + eyeHeightOf(p), p.z);
        camera.lookAt(p.x + dir.x, p.y + eyeHeightOf(p) + dir.y, p.z + dir.z);
        const local = new Vec3(0.18, -0.0875, -1.02);
        const actual = camera.getWorldTransform().transformPoint(local);
        const calculated = viewToWorld(p, local);
        expect(actual.distance(new Vec3(calculated.x, calculated.y, calculated.z))).toBeLessThan(0.00001);
        camera.destroy();
      }
  });

  it("converges actual traveling rounds on the center sight ray at near and distant surfaces", () => {
    for (const weapon of ["rifle", "serviceRifle", "machineGun"] as const)
      for (const range of [3, 20, 55]) for (const crouched of [false, true]) {
        const g = scene(), p = g.players[0];
        Object.assign(p, { weapon, crouched, yaw: 0.7, pitch: 0.2, recoilPitch: 0.025, recoilYaw: -0.009 });
        p.command = { ...idle(), firstPerson: true, aim: true };
        const aim = weaponAim(p), dir = viewDirection(aim.yaw, aim.pitch);
        const eye = { x: p.x, y: p.y + eyeHeightOf(p), z: p.z };
        const plane = { x: eye.x + dir.x * range, y: eye.y + dir.y * range, z: eye.z + dir.z * range };
        const dot = (v: { x: number; y: number; z: number }) => v.x * dir.x + v.y * dir.y + v.z * dir.z;
        g.collision = { move: (v) => v, ray: (a, b) => {
          const t = (dot(plane) - dot(a)) / (dot(b) - dot(a));
          return t >= 0 && t < 1 ? t : 1;
        } };
        g.fire(p);
        const shot = g.projectiles[0];
        expect(shot).toBeDefined();
        const travel = (dot(plane) - dot(shot)) / dot({ x: shot.vx, y: shot.vy, z: shot.vz });
        expect(Math.hypot(shot.x + shot.vx * travel - plane.x,
          shot.y + shot.vy * travel - plane.y, shot.z + shot.vz * travel - plane.z)).toBeLessThan(0.00001);
        expect(Math.hypot(shot.vx, shot.vy, shot.vz)).toBeCloseTo(weapon === "machineGun" ? 32 : 128);
      }
  });

  it("stops at close cover below the sight instead of spawning a round beyond the bank", () => {
    const selected = { ...map, boxes: [{ x: 0, z: -0.75, w: 2, d: 0.1, h: 1.61, kind: "barrier" as const }] };
    const g = new Game(new TestCollision(selected), false, 600, 12345, undefined, { map: selected });
    g.players.splice(1);
    const p = g.players[0];
    Object.assign(p, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, weapon: "serviceRifle" });
    p.command = { ...idle(), firstPerson: true, aim: true };
    g.fire(p);
    expect(g.projectiles).toHaveLength(0);
    expect(g.events.some((e) => e.type === "impact" && !e.hit)).toBe(true);
  });

  it("uses sights from either preferred view, retains first person while throwing, and restores a death view", () => {
    const g = scene(), p = g.players[0];
    expect(firstPersonView(p)).toBe(false);
    p.command.aim = true;
    expect(sighted(p, g.tick)).toBe(true);
    p.command.aim = false;
    expect(firstPersonView(p)).toBe(false);
    g.step({ ...idle(), firstPerson: true, grenade: true });
    expect(firstPersonView(p)).toBe(true);
    expect(sighted(p, g.tick)).toBe(false);
    for (let i = 0; i < 6; i++) g.step({ ...idle(), firstPerson: true });
    const bomb = g.grenades[0];
    expect(Math.atan2(bomb.vy, Math.hypot(bomb.vx, bomb.vz))).toBeCloseTo(0.1);
    expect(bomb.y).toBeGreaterThan(p.y + eyeHeightOf(p));
    p.hp = 0;
    expect(firstPersonView(p)).toBe(false);
  });
});
