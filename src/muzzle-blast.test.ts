import { describe, expect, it } from "vitest";
import { blastShape, flashFrames, flashLayers, muzzleProfile, tracerRound } from "./muzzle-blast";
import { FxQuads } from "./fx-quads";
import { recoilFeel } from "./recoil";

describe("muzzle blast", () => {
  it("is sized to the weapon, biggest from a mounted gun and smallest from a pistol", () => {
    const mounted = muzzleProfile("machineGun", "Vickers", true);
    const rifle = muzzleProfile("serviceRifle", "SMLE Mk III", false);
    const lmg = muzzleProfile("machineGun", "Lewis Mk I", false);
    const pistol = muzzleProfile("pistol", "P08 Luger", false);
    expect(mounted.flash).toBeGreaterThan(rifle.flash);
    expect(rifle.flash).toBeGreaterThan(lmg.flash);
    expect(lmg.flash).toBeGreaterThan(pistol.flash);
    expect(mounted.dust).toBeGreaterThan(lmg.dust);
    // A revolver keeps its empties; a carbine's short barrel flashes harder.
    expect(muzzleProfile("pistol", "Webley Mk VI", false).brass).toBe(0);
    expect(muzzleProfile("serviceRifle", "Karabiner 98AZ", false).flash).toBeGreaterThan(muzzleProfile("serviceRifle", "Gewehr 98", false).flash);
  });

  it("draws every flash shape with uneven tongues, so none is a regular star", () => {
    const counts = new Set<number>();
    for (let variant = 1; variant <= flashFrames.blast.length; variant++) {
      const { petals } = blastShape(variant);
      counts.add(petals.length);
      const gaps = petals.map((p, i) => {
        const next = petals[(i + 1) % petals.length].angle + (i + 1 === petals.length ? Math.PI * 2 : 0);
        return next - p.angle;
      });
      const even = (Math.PI * 2) / petals.length;
      // At least one gap well off even spacing, and tongues of clearly different lengths.
      expect(Math.max(...gaps.map((g) => Math.abs(g - even)))).toBeGreaterThan(even * 0.25);
      const lengths = petals.map((p) => p.length);
      expect(Math.max(...lengths) - Math.min(...lengths)).toBeGreaterThan(0.2);
    }
    expect(counts.size).toBeGreaterThan(2);
  });

  it("builds each shot from different shapes, turns and stretches", () => {
    const profile = muzzleProfile("machineGun", "MG 08", true);
    const shots = Array.from({ length: 60 }, (_, i) => flashLayers(profile, i * 7.13 + 0.37));
    const fronts = shots.map((layers) => layers.find((l) => l.kind === "blast")!);
    expect(new Set(fronts.map((f) => f.frame)).size).toBeGreaterThanOrEqual(8);
    for (let i = 1; i < fronts.length; i++) {
      const a = fronts[i - 1], b = fronts[i];
      expect(a.frame !== b.frame || Math.abs(a.roll - b.roll) > 0.3 || Math.abs(a.width - b.width) > 0.03).toBe(true);
    }
    // Stretched unevenly, not always round.
    expect(fronts.some((f) => Math.abs(f.width / f.height - 1) > 0.25)).toBe(true);
    expect(shots.filter((s) => s.filter((l) => l.kind === "blast").length > 1).length).toBeGreaterThan(20);
    expect(shots.every((s) => s.some((l) => l.kind === "jet"))).toBe(true);
  });

  it("loads machine-gun belts with a tracer every fourth round and rifles with ball", () => {
    const belt = Array.from({ length: 40 }, (_, id) => tracerRound({ id, weapon: "machineGun" }));
    expect(belt.filter(Boolean)).toHaveLength(10);
    expect(Array.from({ length: 40 }, (_, id) => tracerRound({ id, weapon: "serviceRifle" })).some(Boolean)).toBe(false);
  });

  it("kicks a bolt rifle hardest and lets a mounted gun shudder without rising", () => {
    expect(recoilFeel.serviceRifle.rise).toBeGreaterThan(recoilFeel.machineGun.rise);
    expect(recoilFeel.serviceRifle.shoulder).toBeGreaterThan(recoilFeel.machineGun.shoulder);
    expect(recoilFeel.emplaced.rise).toBe(0);
    expect(recoilFeel.emplaced.buzz).toBe(1);
  });
});

describe("effect quads", () => {
  it("writes camera-facing and axial quads with their atlas cell, colour and alpha", () => {
    const q = new FxQuads(4);
    q.begin([0, 0, 5], [1, 0, 0], [0, 1, 0]);
    expect(q.sprite(0, 0, 0, 2, 1, 0, 5, 1, 0.5, 0, 0.5)).toBe(true);
    expect([...q.positions.slice(0, 12)]).toEqual([-1, -0.5, 0, 1, -0.5, 0, 1, 0.5, 0, -1, 0.5, 0]);
    // Cell 5 of a 4 × 4 atlas: second column, second row down.
    expect([...q.uvs.slice(0, 8)]).toEqual([0.25, 0.5, 0.5, 0.5, 0.5, 0.25, 0.25, 0.25]);
    expect([...q.colors.slice(0, 4)]).toEqual([255, 128, 0, 128]);
    // A jet along x, seen from +z, is widened along y and runs from the muzzle.
    expect(q.axial(0, 0, 0, 1, 0, 0, 2, 0.4, 8)).toBe(true);
    const jet = [...q.positions.slice(12, 24)];
    expect(jet[0]).toBeCloseTo(0);
    expect(Math.abs(jet[1])).toBeCloseTo(0.2);
    expect(jet[3]).toBeCloseTo(2);
    expect(q.end()).toBe(2);
    expect([...q.positions.slice(24)].every((v) => v === 0)).toBe(true);
  });

  it("drops quads past capacity and invisible ones", () => {
    const q = new FxQuads(1);
    q.begin([0, 0, 5], [1, 0, 0], [0, 1, 0]);
    expect(q.sprite(0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0)).toBe(false);
    expect(q.sprite(0, 0, 0, 1, 1, 0, 0)).toBe(true);
    expect(q.sprite(0, 0, 0, 1, 1, 0, 0)).toBe(false);
    expect(q.end()).toBe(1);
  });
});
