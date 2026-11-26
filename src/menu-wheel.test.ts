import { expect, it } from "vitest";
import { wheelPixels } from "./menu-wheel";
it("passes pixel deltas through and converts line and page deltas to pixels", () => {
  expect(wheelPixels(120, 0, 800)).toBe(120);
  expect(wheelPixels(3, 1, 800)).toBe(48);
  expect(wheelPixels(-1, 2, 800)).toBe(-800);
});
