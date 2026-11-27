import { expect, it } from "vitest";
import { freshControls, loadControls, saveControls } from "./controls";
import { frontLineAmmoShown, frontLineFlagShown, frontLineRules } from "./hud-preset";

const idle = { crewing: false, reloading: false, overheated: false, now: 10_000, peekUntil: 0 };

it("keeps the standard HUD by default and remembers the Front line preset", () => {
  expect(freshControls().hud).toBe("standard");
  const settings = freshControls(); settings.hud = "frontLine";
  let data = "";
  saveControls(settings, { setItem: (_, value) => { data = value; } });
  expect(loadControls({ getItem: () => data }).hud).toBe("frontLine");
  // Layouts saved before the preset existed, or with a junk value, stay standard.
  expect(loadControls({ getItem: () => JSON.stringify({ firstPerson: false }) }).hud).toBe("standard");
  expect(loadControls({ getItem: () => JSON.stringify({ hud: "<b>" }) }).hud).toBe("standard");
});

it("shows ammo only while reloading, overheated, crewing a weapon or just after reload is pressed", () => {
  expect(frontLineAmmoShown(idle)).toBe(false);
  expect(frontLineAmmoShown({ ...idle, reloading: true })).toBe(true);
  expect(frontLineAmmoShown({ ...idle, overheated: true })).toBe(true);
  expect(frontLineAmmoShown({ ...idle, crewing: true })).toBe(true);
  // Pressing R with a full magazine starts no reload but still shows the count.
  const pressed = idle.now;
  expect(frontLineAmmoShown({ ...idle, peekUntil: pressed + frontLineRules.ammoPeekMs })).toBe(true);
  expect(frontLineAmmoShown({ ...idle, now: pressed + frontLineRules.ammoPeekMs, peekUntil: pressed + frontLineRules.ammoPeekMs })).toBe(false);
});

it("shows a flag marker only near the flag", () => {
  expect(frontLineFlagShown(frontLineRules.flagLabelRange)).toBe(true);
  expect(frontLineFlagShown(frontLineRules.flagLabelRange + 1)).toBe(false);
});
