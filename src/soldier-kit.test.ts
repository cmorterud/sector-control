import { test, expect } from "vitest";
import type * as pc from "playcanvas";
import { modelScene } from "../tools/model-scene";
import { faceParts, factionKit, kitFactions, soldierLookFor, soldierLooks } from "./soldier-kit";
import { modelSurfaceFor } from "./model-surfaces";

test("each army carries its own period kit, with finite sizes and surfaces that are not skin", () => {
  const names = (faction: (typeof kitFactions)[number]) => new Set(factionKit(faction, "#777777", "#555555").map((part) => part.name));
  expect(names("british")).toContain("helmet brim");
  expect(names("german")).toContain("gas mask canister");
  expect(names("german")).toContain("spade blade");
  expect(names("french")).toContain("musette bag");
  expect(names("french")).toContain("turned coat tail");
  for (const faction of kitFactions) {
    const kit = factionKit(faction, "#777777", "#555555");
    expect(kit.filter((part) => part.name === "ammunition pouch").length).toBeGreaterThanOrEqual(2);
    for (const part of kit) {
      expect([...part.at, ...part.size, ...(part.rotation ?? [])].every(Number.isFinite)).toBe(true);
      expect(Math.min(...part.size)).toBeGreaterThan(0);
      // Kit names must never fall through to the skin tile (e.g. "spade handle" once did).
      expect(modelSurfaceFor(part.name)).not.toBe("skin");
    }
  }
});

test("faces vary by soldier but stay the same for one soldier", () => {
  const looks = new Set(Array.from({ length: 100 }, (_, id) => soldierLookFor(id)));
  expect(looks.size).toBe(soldierLooks.length);
  expect(soldierLookFor(17)).toBe(soldierLookFor(17));
  const moustaches = soldierLooks.map((_, look) => faceParts(look).filter((part) => part.name.startsWith("moustache")).length);
  expect(new Set(moustaches).size).toBeGreaterThan(1);
  for (let look = 0; look < soldierLooks.length; look++) {
    expect(faceParts(look).some((part) => part.name === "nose")).toBe(true);
    expect(faceParts(look).every((part) => part.small)).toBe(true);
  }
});

test.each(["french", "german"] as const)("%s far torso leaves out buttons, brows and other sub-pixel kit", (faction) => {
  const { r, p, destroy } = modelScene(faction);
  try {
    const rig = r.soldiers[0];
    const count = (mesh: pc.Mesh) => { const indices: number[] = []; mesh.getIndices(indices); return indices.length / 3; };
    const tag = (detail: string) => rig.upper.tags.list().find((t: string) => t.startsWith(`model-${detail}:`)).slice(`model-${detail}:`.length);
    const near = r.kitMeshes.get(tag("near")), far = r.kitMeshes.get(tag("far"));
    expect(count(far)).toBeLessThan(count(near) * .5);
    expect(rig.look).toBe(soldierLookFor(p.id));
    expect(tag("near")).toContain(`look${rig.look}`);
    // A corpse is merged from the soldier's own face, one template per face.
    r.casualtyMesh(p);
    expect([...r.casualtyTemplates.keys()].some((key: string) => key.endsWith(`look${rig.look}`))).toBe(true);
  } finally { destroy(); }
});
