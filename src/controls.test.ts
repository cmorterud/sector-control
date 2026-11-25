import { expect, it } from "vitest";
import { freshControls, loadControls, saveControls, rebind, SprintInput } from "./controls";
const key = (code: string) => ({ code, ctrlKey: false, metaKey: false, altKey: false });
it("persists bindings, sprint and camera settings and tolerates invalid or unavailable storage", () => {
  const settings = freshControls();
  expect(settings.firstPerson).toBe(true);
  expect(rebind(settings, "sprint", key("KeyZ"))).toBeNull();
  settings.toggleSprint = true; settings.firstPerson = false;
  let data = "";
  saveControls(settings, { setItem: (_, value) => { data = value; } });
  expect(loadControls({ getItem: () => data })).toEqual(settings);
  expect(loadControls({ getItem: () => "broken" })).toEqual(freshControls());
  expect(loadControls({ getItem: () => { throw Error(); } })).toEqual(freshControls());
  saveControls(settings, { setItem: () => { throw Error(); } });
});
it("rejects conflicts and browser shortcut combinations without changing bindings", () => {
  const settings = freshControls(), before = structuredClone(settings);
  expect(rebind(settings, "sprint", key("KeyW"))).toContain("Already assigned");
  expect(rebind(settings, "sprint", key("Escape"))).not.toBeNull();
  expect(rebind(settings, "sprint", { ...key("KeyW"), ctrlKey: true })).not.toBeNull();
  expect(rebind(settings, "sprint", key("<script>"))).not.toBeNull();
  expect(settings).toEqual(before);
  const invalid = { ...settings, bindings: { ...settings.bindings, sprint: "KeyW" } };
  expect(loadControls({ getItem: () => JSON.stringify(invalid) }).bindings).toEqual(before.bindings);
});
it("debounces toggle sprint and clears the latch on lifecycle resets", () => {
  const sprint = new SprintInput();
  sprint.press(false, false); expect(sprint.active).toBe(false);
  sprint.press(false, true); expect(sprint.active).toBe(true);
  sprint.press(true, true); expect(sprint.active).toBe(true);
  sprint.reset(); expect(sprint.active).toBe(false);
  sprint.press(false, true); sprint.press(false, true); expect(sprint.active).toBe(false);
});

it("adds the emplacement binding without resetting an older custom layout", () => {
  const original = freshControls();
  const { emplace: _missing, ...bindings } = original.bindings;
  const saved = { ...original, bindings: { ...bindings, forward: "KeyB", interact: "KeyH" } };
  const restored = loadControls({ getItem: () => JSON.stringify(saved) });
  expect(restored.bindings.forward).toBe("KeyB");
  expect(restored.bindings.interact).toBe("KeyH");
  expect(restored.bindings.emplace).not.toBe("KeyB");
});

it("adds the gas mask binding to an older layout without taking a key already in use", () => {
  expect(freshControls().bindings.mask).toBe("KeyM");
  const { mask: _mask, emplace: _emplace, ...bindings } = freshControls().bindings;
  const restored = loadControls({ getItem: () => JSON.stringify({ ...freshControls(), bindings: { ...bindings, reload: "KeyM" } }) });
  expect(restored.bindings.reload).toBe("KeyM");
  expect(restored.bindings.emplace).toBe("KeyB");
  expect(restored.bindings.mask).toBe("KeyX");
});
