import { test, expect } from "vitest";
import type * as pc from "playcanvas";
import { modelScene } from "../tools/model-scene";
import { gripHandGeometry, handPoses, type HandPose } from "./hand-geometry";
import { idle } from "./simulation";
import { weaponProfiles } from "./weapons";

const triangles = (mesh: pc.Mesh) => { const indices: number[] = []; mesh.getIndices(indices); return indices.length / 3; };

test("each hand pose is a distinct, well-formed mesh with the same topology as the grip", () => {
  const grip = gripHandGeometry("right", "view");
  for (const pose of Object.keys(handPoses) as HandPose[]) {
    const mesh = gripHandGeometry("right", "view", pose);
    expect(mesh.positions.every(Number.isFinite)).toBe(true);
    expect(mesh.indices).toEqual(grip.indices);
    if (pose !== "grip") expect(mesh.positions).not.toEqual(grip.positions);
    for (let i = 0; i < mesh.normals.length; i += 3) expect(Math.hypot(...mesh.normals.slice(i, i + 3))).toBeCloseTo(1);
  }
  // Opening a finger moves its tip away from the palm.
  const reach = (pose: HandPose) => { const m = gripHandGeometry("right", "view", pose).positions; let far = 0; for (let i = 0; i < m.length; i += 3) far = Math.max(far, Math.hypot(m[i], m[i + 1])); return far; };
  expect(reach("open")).toBeGreaterThan(reach("grip") + .02);
});

test.each(["french", "german"] as const)("%s first-person arms get cuffs, a wrist and finer sleeves; the trigger hand follows the action", (faction) => {
  const { r, p, destroy } = modelScene(faction);
  try {
    r.createFirstPersonRig();
    const view = r.firstPersonRig, world = r.soldiers[0];
    for (const arm of view.arms) {
      expect(arm.elbow.findByName("turned cuff")).toBeTruthy();
      expect(arm.elbow.findByName("wrist")).toBeTruthy();
    }
    expect(world.arms[1].elbow.findByName("turned cuff")).toBeNull();
    const sleeve = (rig: { arms: { shoulder: pc.Entity }[] }) => triangles((rig.arms[1].shoulder.findByName("upper arm") as pc.Entity).render!.meshInstances[0].mesh!);
    expect(sleeve(view)).toBeGreaterThan(sleeve(world) * 1.5);
    const poseAt = (tick: number) => { r.animateSoldier(p, 0, 0, 1 / 60, tick); r.drawFirstPerson(p, tick, 1 / 60); return view.handPose; };
    Object.assign(p, { landedAt: -1000, lastShotAt: -1000, reloadAt: 0 });
    p.command = { ...idle(), firstPerson: true };
    expect(poseAt(100)).toBe("trigger");
    p.lastShotAt = 100 - Math.round(weaponProfiles.serviceRifle.shotTicks * 14 / 36);
    expect(poseAt(100)).toBe("pinch");
    Object.assign(p, { lastShotAt: -1000, reloadAt: 200 + Math.round(weaponProfiles.serviceRifle.reloadTicks / 2) });
    expect(poseAt(200)).toBe("open");
    p.reloadAt = 0;
    Object.assign(p, { throwAction: { startTick: 300, releaseTick: 306, smoke: false, released: false }, throwUntil: 321 });
    expect(poseAt(303)).toBe("grenade");
  } finally { destroy(); }
});
