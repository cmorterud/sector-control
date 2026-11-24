import { controlLabels, defaultBindings, freshControls, keyLabel, rebind, type ControlAction, type ControlSettings } from "./controls";

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
    this.waiting = null; this.changed(); this.draw();
    return true;
  }
  private draw() {
    this.panel.replaceChildren();
    const title = document.createElement("h2"); title.textContent = "Controls";
    this.panel.append(title);
    const list = document.createElement("div"); list.className = "binding-list";
    for (const action of Object.keys(defaultBindings) as ControlAction[]) {
      const label = document.createElement("label"); label.textContent = controlLabels[action];
      const button = document.createElement("button"); button.textContent = keyLabel(this.settings.bindings[action]);
      button.setAttribute("aria-label", `Rebind ${controlLabels[action]}`);
      button.onclick = () => { this.waiting = action; this.status.textContent = `Press a key for ${controlLabels[action].toLowerCase()}, or Escape to cancel.`; };
      label.append(button); list.append(label);
    }
    this.panel.append(list);
    const sprint = document.createElement("label");
    const toggle = document.createElement("input"); toggle.type = "checkbox"; toggle.checked = this.settings.toggleSprint;
    toggle.onchange = () => { this.settings.toggleSprint = toggle.checked; this.changed(); };
    sprint.append(toggle, " Toggle sprint"); this.panel.append(sprint);
    const camera = document.createElement("label");
    const first = document.createElement("input"); first.type = "checkbox"; first.checked = this.settings.firstPerson;
    first.onchange = () => { this.settings.firstPerson = first.checked; this.changed(); };
    camera.append(first, " Start in first person"); this.panel.append(camera);
    this.status = document.createElement("p"); this.status.setAttribute("role", "status"); this.panel.append(this.status);
    const reset = document.createElement("button"); reset.textContent = "Reset controls"; reset.className = "secondary";
    reset.onclick = () => { Object.assign(this.settings, freshControls()); this.changed(); this.waiting = null; this.draw(); };
    const close = document.createElement("button"); close.textContent = "Done"; close.onclick = () => this.close();
    this.panel.append(reset, close);
  }
}
