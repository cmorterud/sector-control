import { test, expect } from "vitest";
import * as pc from "playcanvas";
import { modelScene } from "../tools/model-scene";
import { deathFall, deathFallRules, throwBody } from "./soldier-presentation";
import { idle } from "./simulation";

test("a human throw winds the body up with the grenade in hand, then comes through; bots start cocked", () => {
  const { p, destroy } = modelScene("german");
  try {
    Object.assign(p, { throwAction: { startTick: 100, releaseTick: 106, smoke: false, released: false }, throwUntil: 121 });
    const windUp = throwBody(p, 105)!;
    expect(windUp.held).toBe(true);
    expect(windUp.twist).toBeLessThan(-20);
    expect(windUp.shoulder).toBeGreaterThan(160);
    p.throwAction!.released = true;
    const through = throwBody(p, 112)!;
    expect(through.held).toBe(false);
    expect(through.twist).toBeGreaterThan(0);
    expect(through.shoulder).toBeLessThan(90);
    expect(throwBody(p, 121)).toBeNull();
    // A bot's grenade leaves at once: the first frame is the cocked pose.
    Object.assign(p, { throwAction: null, throwUntil: 215 });
    expect(throwBody(p, 200)!.shoulder).toBeGreaterThan(200);
    expect(throwBody(p, 214)!.weight).toBeLessThan(.1);
  } finally { destroy(); }
});

test("a death fall buckles away from the hit, and a distant body goes on to lie flat", () => {
  const fromFront = deathFall(deathFallRules.fallTicks, { x: 0, z: 7 });
  expect(fromFront.fallen).toBe(true);
  expect(fromFront.lying).toBe(false);
  expect(fromFront.pitch).toBeGreaterThan(20);
  expect(fromFront.knee).toBeLessThan(-80);
  expect(deathFall(deathFallRules.fallTicks, { x: 0, z: -7 }).pitch).toBeLessThan(-20);
  expect(Math.sign(deathFall(10, { x: 5, z: 0 }).twist)).toBe(1);
  expect(deathFall(4, { x: 0, z: 7 }).fallen).toBe(false);
  const flat = deathFall(deathFallRules.fallTicks + deathFallRules.lieTicks, { x: 0, z: 7 });
  expect(flat.lying).toBe(true);
  expect(Math.abs(flat.pitch)).toBeGreaterThan(70);
  // No known shooter: a forward slump, never NaN.
  expect(Number.isFinite(deathFall(8, { x: 0, z: 0 }).pitch)).toBe(true);
});

test("the torso leans with the aim while the rifle keeps the exact aim pitch", () => {
  const { r, p, destroy } = modelScene("french");
  try {
    const rig = r.soldiers[0];
    for (const pitch of [.6, -.5]) {
      Object.assign(p, { pitch, landedAt: -1000 });
      p.command = { ...idle(), aim: true, pitch };
      for (let tick = 100; tick < 160; tick++) r.animateSoldier(p, 0, 0, 1 / 60, tick);
      const torso = rig.upper.forward, barrel = rig.rifle.forward;
      const elevation = (v: pc.Vec3) => Math.asin(v.y / v.length());
      expect(Math.sign(elevation(torso))).toBe(Math.sign(pitch));
      expect(Math.abs(elevation(torso))).toBeGreaterThan(.1);
      expect(Math.abs(elevation(barrel) - pitch)).toBeLessThan(.1);
    }
  } finally { destroy(); }
});

test("a dying soldier holds its ragdoll back until the fall has played", () => {
  const { r, p, destroy } = modelScene("german");
  try {
    const rig = r.soldiers[0];
    r.deathHits = new Map([[0, new pc.Vec3(0, 0, 7)]]);
    rig.fallReady = false;
    r.poseDeathFall(p, rig, 6, false);
    expect(rig.fallReady).toBe(false);
    expect(rig.body.getLocalPosition().y).toBeLessThan(.94);
    r.poseDeathFall(p, rig, deathFallRules.fallTicks, false);
    expect(rig.fallReady).toBe(true);
    const settled = rig.body.getLocalPosition().clone();
    r.poseDeathFall(p, rig, deathFallRules.fallTicks + 30, false);
    expect(rig.body.getLocalPosition().equals(settled)).toBe(true);
  } finally { destroy(); }
});
