import { controlLabels, freshControls, keyLabel, rebind, type ControlAction, type ControlSettings } from "./controls";
import { mapCallKey } from "./artillery-map";

const keyActions: Record<ControlAction, string> = {
  forward: "Forward", backward: "Back", left: "Left", right: "Right",
  sprint: "Sprint", crouch: "Crouch", reload: "Reload", melee: "Melee",
  grenade: "Grenade", smoke: "Smoke", mantle: "Hop / mantle", tactical: "Tactical map",
  view: "Change view", scoreboard: "Scoreboard", primary: "Primary", sidearm: "Sidearm",
  interact: "Interact", emplace: "Set up kit", whistle: "Whistle", mask: "Gas mask",
};
const keyboardRows = [
  "Escape Backquote Digit1 Digit2 Digit3 Digit4 Digit5 Digit6 Digit7 Digit8 Digit9 Digit0 Minus Equal Backspace",
  "Tab KeyQ KeyW KeyE KeyR KeyT KeyY KeyU KeyI KeyO KeyP BracketLeft BracketRight Backslash",
  "CapsLock KeyA KeyS KeyD KeyF KeyG KeyH KeyJ KeyK KeyL Semicolon Quote Enter",
  "ShiftLeft KeyZ KeyX KeyC KeyV KeyB KeyN KeyM Comma Period Slash ShiftRight",
  "ControlLeft AltLeft Space AltRight ControlRight ArrowLeft ArrowUp ArrowDown ArrowRight",
];
const keyGlyphs: Record<string, string> = {
  Escape: "Esc", Backquote: "`", Backspace: "⌫", CapsLock: "Caps", Backslash: "\\",
  BracketLeft: "[", BracketRight: "]", Semicolon: ";", Quote: "'", Comma: ",",
  Period: ".", Slash: "/", Minus: "−", Equal: "=", ShiftLeft: "Shift", ShiftRight: "Shift",
  ControlLeft: "Ctrl", ControlRight: "Ctrl", AltLeft: "Alt", AltRight: "Alt",
  ArrowLeft: "←", ArrowUp: "↑", ArrowDown: "↓", ArrowRight: "→",
};
const keyWidths: Record<string, number> = {
  Tab: 1.5, Backspace: 1.5, Backslash: 2, CapsLock: 1.75, Enter: 2.75,
  ShiftLeft: 2.25, ShiftRight: 3.25, ControlLeft: 1.5, AltLeft: 1.5,
  Space: 5.5, AltRight: 1.5, ControlRight: 1.5,
};
const keyboardKey = (code: string) => keyGlyphs[code] ?? keyLabel(code);

export class ControlsPanel {
  private panel = document.createElement("section");
  private waiting: ControlAction | null = null;
  private status = document.createElement("p");
  private opener?: HTMLElement;
  open = false;
  constructor(private settings: ControlSettings, private changed: () => void) {
    this.panel.className = "controls-panel hidden";
    this.panel.setAttribute("role", "dialog");
    this.panel.setAttribute("aria-modal", "true");
    this.panel.setAttribute("aria-label", "Controls");
    document.getElementById("ui")!.append(this.panel);
    // A press anywhere outside the dialog dismisses it, like Done. Capture
    // phase, so the press closes the dialog without also reaching the game.
    document.addEventListener("pointerdown", (event) => {
      if (!this.open || this.panel.contains(event.target as Node)) return;
      event.preventDefault(); event.stopPropagation();
      this.close();
    }, true);
  }
  show(opener: HTMLElement) {
    this.open = true; this.opener = opener; this.waiting = null;
    document.getElementById("menu")!.inert = true;
    this.panel.classList.remove("hidden"); this.draw();
    this.panel.querySelector<HTMLButtonElement>("button")?.focus();
  }
  close() {
    this.open = false; this.waiting = null;
    this.panel.classList.add("hidden");
    document.getElementById("menu")!.inert = false; this.opener?.focus();
  }
  key(event: KeyboardEvent) {
    if (!this.open) return false;
    if (event.code === "Escape") {
      event.preventDefault(); event.stopImmediatePropagation();
      if (this.waiting) { this.waiting = null; this.status.textContent = "Binding canceled."; }
      else this.close();
      return true;
    }
    if (!this.waiting) {
      if (event.code === "Tab") {
        const items = Array.from(this.panel.querySelectorAll<HTMLElement>("button,input"));
        const index = items.indexOf(document.activeElement as HTMLElement);
        if ((!event.shiftKey && index === items.length - 1) || (event.shiftKey && index === 0)) {
          event.preventDefault(); items[event.shiftKey ? items.length - 1 : 0]?.focus();
        }
      }
      return true;
    }
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.repeat) return true;
    const error = rebind(this.settings, this.waiting, event);
    if (error) { this.status.textContent = error; return true; }
    const action = this.waiting;
    this.waiting = null; this.changed(); this.draw();
    this.panel.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)?.focus();
    return true;
  }
  private drawKeyboard() {
    const keyboard = document.createElement("div"); keyboard.className = "controls-keyboard";
    keyboard.setAttribute("role", "group");
    keyboard.setAttribute("aria-label", "Keyboard bindings");
    const actions = new Map((Object.keys(keyActions) as ControlAction[]).map(action =>
      [this.settings.bindings[action], action] as const));
    for (const keys of keyboardRows) {
      const row = document.createElement("div"); row.className = "keyboard-row";
      for (const code of keys.split(" ")) {
        const action = actions.get(code) ?? (code === "ShiftRight" ? actions.get("ShiftLeft") : undefined);
        const label = action ? keyActions[action] : code === "Escape" ? "Pause" : "";
        const key = action ? document.createElement("button") : document.createElement("span");
        key.className = "keyboard-key";
        key.style.setProperty("--units", String(keyWidths[code] ?? 1));
        const glyph = document.createElement("kbd"); glyph.textContent = keyboardKey(code);
        key.append(glyph);
        if (label) {
          const caption = document.createElement("small"); caption.textContent = label;
          key.append(caption);
        } else key.setAttribute("aria-hidden", "true");
        if (action && key instanceof HTMLButtonElement) {
          key.type = "button";
          key.dataset.action = action;
          key.title = controlLabels[action];
          key.setAttribute("aria-label", `Rebind ${controlLabels[action]} (currently ${keyboardKey(code)})`);
          key.onclick = () => {
            this.waiting = action;
            this.status.textContent = `Press a key for ${controlLabels[action].toLowerCase()}, or Escape to cancel.`;
          };
        }
        row.append(key);
      }
      keyboard.append(row);
    }
    return keyboard;
  }

  private drawMechanics() {
    const key = (action: ControlAction) => `<kbd>${keyboardKey(this.settings.bindings[action])}</kbd>`;
    const guide = document.createElement("section"); guide.className = "controls-mechanics";
    guide.innerHTML = `
      <h3>Field mechanics</h3>
      <div class="mechanic-grid">
        <article><h4>Artillery</h4><p>${key("tactical")} opens the tactical map. Left-click an eligible sector to call a barrage. <kbd>${keyboardKey(mapCallKey)}</kbd> cycles available missions, including gas or night flares. Right-click closes the map.</p></article>
        <article><h4>Squad whistle</h4><p>Aim where you want the charge to go and press ${key("whistle")} to send nearby friendly riflemen. The team shares a 50-second cooldown.</p></article>
        <article><h4>Bayonet charge</h4><p>Sprint forward with a service rifle and press ${key("melee")} when the charge prompt appears. Keep sprinting to carry the charge through.</p></article>
        <article><h4>Gas mask</h4><p>Press ${key("mask")} to put on or take off the mask. It reduces gas damage and blocks aiming down sights.</p></article>
      </div>`;
    return guide;
  }

  private draw() {
    this.panel.replaceChildren();
    const title = document.createElement("h2"); title.textContent = "Controls";
    this.panel.append(title);
    const hint = document.createElement("p"); hint.className = "controls-keyboard-hint";
    hint.textContent = "Select a highlighted key to rebind it. Mouse: left click fires, right click aims, and moving the mouse looks around.";
    this.status = document.createElement("p"); this.status.className = "controls-binding-status";
    this.status.setAttribute("role", "status");
    this.panel.append(hint, this.drawKeyboard(), this.status, this.drawMechanics());
    const sprint = document.createElement("label");
    const toggle = document.createElement("input"); toggle.type = "checkbox"; toggle.checked = this.settings.toggleSprint;
    toggle.onchange = () => { this.settings.toggleSprint = toggle.checked; this.changed(); };
    sprint.append(toggle, " Toggle sprint"); this.panel.append(sprint);
    const camera = document.createElement("label");
    const first = document.createElement("input"); first.type = "checkbox"; first.checked = this.settings.firstPerson;
    first.onchange = () => { this.settings.firstPerson = first.checked; this.changed(); };
    camera.append(first, " Start in first person"); this.panel.append(camera);
    const preset = document.createElement("label"); preset.className = "hud-preset";
    const frontLine = document.createElement("input"); frontLine.type = "checkbox"; frontLine.checked = this.settings.hud === "frontLine";
    frontLine.onchange = () => { this.settings.hud = frontLine.checked ? "frontLine" : "standard"; this.changed(); };
    const note = document.createElement("small");
    note.textContent = "No minimap, kill feed, scores, health or controls bar. Ammo shows while reloading or when you press " +
      `${keyLabel(this.settings.bindings.reload)}; flag state shows near a flag. ${keyboardKey(this.settings.bindings.scoreboard)} opens the scoreboard.`;
    preset.append(frontLine, " Front line HUD", note); this.panel.append(preset);
    const reset = document.createElement("button"); reset.textContent = "Reset controls"; reset.className = "secondary";
    reset.onclick = () => { Object.assign(this.settings, freshControls()); this.changed(); this.waiting = null; this.draw(); };
    const close = document.createElement("button"); close.textContent = "Done"; close.onclick = () => this.close();
    this.panel.append(reset, close);
  }
}
