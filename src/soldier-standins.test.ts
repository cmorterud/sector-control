import { expect, it } from "vitest";
import { advanceGait, standInDue, standInRules } from "./soldier-standins";

it("switches to a stand-in past 40 m and back inside 36 m, never through a scope", () => {
  expect(standInRules.enter).toBe(40);
  expect(standInDue(39, false, false)).toBe(false);
  expect(standInDue(41, false, false)).toBe(true);
  // Between the two distances a soldier keeps what it was drawn as.
  expect(standInDue(38, true, false)).toBe(true);
  expect(standInDue(38, false, false)).toBe(false);
  expect(standInDue(35, true, false)).toBe(false);
  expect(standInDue(120, false, true)).toBe(false);
  expect(standInDue(120, true, true)).toBe(false);
});
it("swings the legs a full cycle per stride, harder at a run, still when standing", () => {
  const gait = { phase: 0, x: 0, z: 0, crouch: 0, amplitude: 0 };
  let peak = 0;
  // Two seconds at 5 m/s: ten metres, about six strides.
  for (let i = 1; i <= 60; i++) peak = Math.max(peak, Math.abs(advanceGait(gait, (i * 5) / 30, 0, false, 1 / 30)));
  expect(gait.amplitude).toBeGreaterThan(0.95);
  expect(peak).toBeGreaterThan(standInRules.swing * 0.9);
  expect(peak).toBeLessThanOrEqual(standInRules.swing);
  for (let i = 0; i < 60; i++) advanceGait(gait, 10, 0, true, 1 / 30);
  expect(gait.amplitude).toBeLessThan(0.02);
  expect(gait.crouch).toBeGreaterThan(0.98);
  // A respawn across the map is not a stride.
  const phase = gait.phase;
  advanceGait(gait, 80, 40, true, 1 / 30);
  expect(gait.phase).toBe(phase);
});
it("moves the switch with the setting, keeping the margin, and Infinity keeps every soldier whole", () => {
  expect(standInDue(13, false, false, 12)).toBe(true);
  expect(standInDue(11, true, false, 12)).toBe(true);
  expect(standInDue(10.5, true, false, 12)).toBe(false);
  expect(standInDue(1e6, false, false, Infinity)).toBe(false);
});
