import type { HudPreset } from "./hud-preset";
export const defaultBindings = {
  forward: "KeyW", backward: "KeyS", left: "KeyA", right: "KeyD",
  sprint: "ShiftLeft", crouch: "KeyC", reload: "KeyR", melee: "KeyV",
  grenade: "KeyG", smoke: "KeyF", mantle: "Space", tactical: "KeyQ",
  view: "KeyT", scoreboard: "Tab", primary: "Digit1", sidearm: "Digit2", interact: "KeyE", emplace: "KeyB",
  whistle: "KeyZ",
  mask: "KeyM",
};
export type ControlAction = keyof typeof defaultBindings;
export interface ControlSettings {
  bindings: Record<ControlAction, string>;
  toggleSprint: boolean;
  firstPerson: boolean;
  /** "frontLine" is the minimal HUD preset; see hud-preset.ts. */
  hud: HudPreset;
}
const canonicalKey = (code: string) => code === "ShiftRight" ? "ShiftLeft" : code;
export const keyLabel = (code: string) => code.replace(/^Key|^Digit/, "").replace("Left", "").replace("Right", "");
export const controlLabels: Record<ControlAction, string> = {
  forward: "Move forward", backward: "Move backward", left: "Move left", right: "Move right",
  sprint: "Sprint", crouch: "Toggle crouch", reload: "Reload", melee: "Melee",
  grenade: "Grenade", smoke: "Smoke", mantle: "Hop / mantle", tactical: "Tactical map",
  view: "Change view", scoreboard: "Scoreboard", primary: "Primary weapon", sidearm: "Sidearm", interact: "Interact with equipment", emplace: "Set up / pack machine gun",
  whistle: "Whistle: squad bayonet charge",
  mask: "Gas mask on / off",
};
export function freshControls(): ControlSettings {
  return { bindings: { ...defaultBindings }, toggleSprint: false, firstPerson: true, hud: "standard" };
}
export function loadControls(storage?: Pick<Storage, "getItem">): ControlSettings {
  const settings = freshControls();
  try {
    const saved = JSON.parse(storage?.getItem("sector-control.controls.v1") ?? "null");
    if (!saved) return settings;
    if (typeof saved.firstPerson === "boolean") settings.firstPerson = saved.firstPerson;
    if (typeof saved.toggleSprint === "boolean") settings.toggleSprint = saved.toggleSprint;
    if (saved.hud === "frontLine") settings.hud = "frontLine";
    const bindings = saved.bindings ? { ...saved.bindings } : undefined;
    // Actions added since a layout was saved take their default key, or the
    // first free one, so an older custom layout survives.
    const added: [ControlAction, string[]][] = [["emplace", ["KeyB", "KeyN", "KeyJ"]], ["mask", ["KeyM", "KeyX", "KeyZ"]], ["whistle", ["KeyZ", "KeyX", "KeyH"]]];
    for (const [action, preferred] of added) if (bindings && bindings[action] === undefined) {
      const used = new Set(Object.values(bindings));
      bindings[action] = [...preferred, ...Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ", c => "Key" + c)]
        .find(code => !used.has(code));
    }
    if (bindings && Object.keys(defaultBindings).every(action =>
      typeof bindings[action] === "string" && validBinding(bindings[action])) &&
      new Set(Object.keys(defaultBindings).map(action => canonicalKey(bindings[action]))).size === Object.keys(defaultBindings).length)
      settings.bindings = { ...settings.bindings, ...bindings };
  } catch { /* Defaults also support browsers with unavailable storage. */ }
  return settings;
}
export function saveControls(settings: ControlSettings, storage?: Pick<Storage, "setItem">) {
  try { storage?.setItem("sector-control.controls.v1", JSON.stringify(settings)); } catch { /* Session settings remain usable. */ }
}
function validBinding(code: string) {
  return /^(Key[A-Z]|Digit[0-9]|ShiftLeft|ShiftRight|Space|Tab|ArrowUp|ArrowDown|ArrowLeft|ArrowRight|Enter|Backspace|BracketLeft|BracketRight|Comma|Period|Slash|Backquote|Minus|Equal)$/.test(code);
}
export function rebind(settings: ControlSettings, action: ControlAction,
  event: Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "altKey">): string | null {
  if (event.ctrlKey || event.metaKey || event.altKey || !validBinding(event.code))
    return "Choose a single letter, number, Shift, arrow or navigation key. Escape is reserved for pause.";
  const conflict = (Object.keys(defaultBindings) as ControlAction[]).find(other =>
    other !== action && canonicalKey(settings.bindings[other]) === canonicalKey(event.code));
  if (conflict) return `Already assigned to ${controlLabels[conflict].toLowerCase()}.`;
  settings.bindings[action] = event.code;
  return null;
}
export class SprintInput {
  active = false;
  press(repeat: boolean, toggle: boolean) {
    if (toggle && !repeat) this.active = !this.active;
  }
  reset() { this.active = false; }
}
