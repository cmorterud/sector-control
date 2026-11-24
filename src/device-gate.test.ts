import { expect, it } from "vitest";
import { deviceGateHTML, needsDesktopNotice, type InputSupport } from "./device-gate";

const none = new URLSearchParams();
const desktop: InputSupport = { finePointer: true, coarsePointer: false, touchPoints: 0, pointerLock: true };
const phone: InputSupport = { finePointer: false, coarsePointer: true, touchPoints: 5, pointerLock: false };

it("lets desktops, touchscreen laptops and tablets with a mouse straight through", () => {
  expect(needsDesktopNotice(desktop, none)).toBe(false);
  expect(needsDesktopNotice({ ...desktop, touchPoints: 10 }, none)).toBe(false);
  expect(needsDesktopNotice({ finePointer: true, coarsePointer: true, touchPoints: 5, pointerLock: true }, none)).toBe(false);
});

it("stops phones, and touch tablets that have no mouse", () => {
  expect(needsDesktopNotice(phone, none)).toBe(true);
  expect(needsDesktopNotice({ ...phone, pointerLock: true }, none)).toBe(true);
  expect(needsDesktopNotice({ finePointer: false, coarsePointer: false, touchPoints: 5, pointerLock: true }, none)).toBe(true);
});

it("stops any browser that cannot capture the mouse", () => {
  expect(needsDesktopNotice({ ...desktop, pointerLock: false }, none)).toBe(true);
});

it("is skipped with ?desktop and in automated runs", () => {
  for (const q of ["desktop", "demo", "autoplay&playtest"])
    expect(needsDesktopNotice(phone, new URLSearchParams(q))).toBe(false);
});

it("points the preview and Armory at the deployed base path", () => {
  const html = deviceGateHTML("/sector-control/pr-preview/pr-9/", false);
  expect(html).toContain('src="/sector-control/pr-preview/pr-9/previews/verdun.jpg"');
  expect(html).toContain('href="/sector-control/pr-preview/pr-9/armory/"');
  expect(html).toContain("Copy link");
  expect(deviceGateHTML("/", true)).toContain("Share link");
});
