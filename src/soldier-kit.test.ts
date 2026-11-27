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

test("Gallipoli armies wear hats, not steel helmets: slouch hats with some lemon squeezers, and the kabalak", async () => {
  const { anzacDress, anzacHat, looksFor, wearsHat, viewCuffParts } = await import("./soldier-kit");
  expect(wearsHat("anzac") && wearsHat("ottoman")).toBe(true);
  expect(wearsHat("british") || wearsHat("german") || wearsHat("french")).toBe(false);
  const hats = soldierLooks.map((_, look) => anzacDress(look).hat);
  expect(hats.filter(h => h === "slouch").length).toBeGreaterThan(hats.filter(h => h === "lemonSqueezer").length);
  expect(hats).toContain("lemonSqueezer");
  expect(soldierLooks.some((_, look) => anzacDress(look).shorts)).toBe(true);
  expect(soldierLooks.some((_, look) => !anzacDress(look).shorts)).toBe(true);
  for (let look = 0; look < soldierLooks.length; look++) {
    const names = new Set(factionKit("anzac", "#777777", "#555555", look).map(part => part.name));
    expect(names).toContain("hat brim");
    expect(names.has("turned-up hat brim")).toBe(anzacDress(look).hat === "slouch");
    expect(anzacHat(look, "#555555").every(part => modelSurfaceFor(part.name) === "cloth" || part.small)).toBe(true);
  }
  const ottoman = factionKit("ottoman", "#777777", "#555555").map(part => part.name);
  expect(ottoman).toContain("kabalak");
  expect(ottoman.some(name => /helmet|brim/.test(name))).toBe(false);
  // Every army keeps four faces, so a soldier's face index works for all of them.
  for (const faction of kitFactions) expect(looksFor(faction).length).toBe(soldierLooks.length);
  expect(looksFor("ottoman").filter(l => l.moustache !== "none").length).toBeGreaterThanOrEqual(3);
  // Rolled sleeves: the first-person ANZAC wrist has no cuff.
  expect(viewCuffParts("anzac", "#777777", "#bbbbbb").map(part => part.name)).toEqual(["wrist"]);
});

test.each([["anzac", 1], ["anzac", 0], ["ottoman", 0]] as const)("%s soldier (face %i) builds with a hat and no steel helmet", async (faction, id) => {
  const { standInKit } = await import("./rendering");
  const { r, p, destroy } = modelScene(faction, id);
  try {
    const rig = r.soldiers[0];
    expect(rig.look).toBe(soldierLookFor(id));
    const names: string[] = [];
    r.people[0].forEach((node: pc.GraphNode) => { names.push(node.name); });
    expect(names).not.toContain("helmet");
    // ANZAC stand-ins are baked per face, so a distant New Zealander keeps his hat.
    expect(standInKit(p)).toContain(faction === "anzac" ? `|${soldierLookFor(id)}` : "ottoman");
  } finally { destroy(); }
});
