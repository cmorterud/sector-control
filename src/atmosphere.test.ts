import { expect, it } from "vitest";
import { brazierSites, clothScraps, mistBanks } from "./atmosphere";
import { mapLooks } from "./map-look";
import { beyondPlayArea, groundHeight, inBoundaryWire } from "./map";
import { trenchMap } from "./trench-map";

const atmosphere = mapLooks.trenches.atmosphere!;

it("lays wide mist banks low over no-man's land and small ones in the trenches", () => {
  const banks = mistBanks(trenchMap), bank = trenchMap.terrain!.bankHeight;
  const field = banks.filter((b) => !b.trench), trench = banks.filter((b) => b.trench);
  expect(field).toHaveLength(60);
  expect(trench.length).toBeGreaterThan(8);
  for (const b of field) {
    expect(Math.abs(b.x)).toBeLessThanOrEqual(32);
    expect(b.y).toBeGreaterThan(bank + 0.5);
    expect(b.y).toBeLessThan(bank + 1.5);
    expect(b.w).toBeGreaterThan(b.h * 2);
  }
  const zs = field.map((b) => b.z);
  expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(trenchMap.playArea!.depth * 0.8);
  for (const b of trench) {
    expect(groundHeight(b.x, b.z, trenchMap)).toBeLessThan(1);
    expect(b.y).toBeLessThan(bank - 1);
  }
  expect(atmosphere.fieldMist).toBeLessThan(0.3);
});

it("sets braziers on trench floors inside the play area", () => {
  const sites = brazierSites(trenchMap);
  expect(sites.length).toBeGreaterThan(8);
  for (const s of sites) {
    expect(beyondPlayArea(s.x, s.z, trenchMap)).toBeLessThan(0);
    expect(groundHeight(s.x, s.z, trenchMap)).toBeLessThan(1);
  }
});

it("snags every scrap of cloth in the boundary wire", () => {
  const scraps = clothScraps(trenchMap);
  expect(scraps.length).toBeGreaterThan(20);
  for (const s of scraps) expect(inBoundaryWire(s.x, s.z, trenchMap)).toBe(true);
});
