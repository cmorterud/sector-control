// The player's side of the gas rule: the briefing option, HUD announcements,
// gas on the minimap and tactical map, the mask's lens, the haze of standing
// in gas, and the alarm gong and breathing. Plain DOM and Web Audio only.
import "./gas.css";
import {
  cloudDensity, cloudPosition, cloudRadius, cloudExposure, frontDepth, gasActive,
  maskProgress, masked, nextSafeArea, pendingStage, safeAreaAt, type SafeArea,
} from "./gas";
import { playArea } from "./map";
import type { Game, Soldier } from "./simulation";

// `?gas=1` turns it on for a direct link; the briefing checkbox otherwise.
export const gasParameter = (params: URLSearchParams) => ["1", "on", "true"].includes(params.get("gas") ?? "");

export function gasBriefing(enabled: boolean, started: boolean, change: (on: boolean) => void) {
  const option = document.createElement("div");
  option.className = "loadout-choice gas-choice";
  option.innerHTML = `<label><input id="gas-option" type="checkbox" ${enabled ? "checked" : ""}> Creeping gas</label><small>From 1:30 gas rolls in from the sector edges in three announced stages, closing on the flags. Wear your mask (M) or keep moving. Adds gas shells to the tactical map.${started ? " Applies when you restart." : ""}</small>`;
  (option.querySelector("input") as HTMLInputElement).onchange = (e) => change((e.target as HTMLInputElement).checked);
  return option;
}

const seconds = (ticks: number) => Math.max(0, Math.ceil(ticks / 30));
// The standing line at the top of the screen: what the gas is doing and what
// to do about it. Empty when there is nothing to say.
export function gasNotice(g: Game, p: Soldier, maskKey: string) {
  const gas = g.gas;
  if (!gas || p.hp <= 0 || g.phase !== "playing") return { text: "", danger: false };
  const front = frontDepth(g, p) > 0, cloud = !!cloudExposure(g, p);
  if (front || cloud) {
    if (masked(p, g.tick)) return { text: `IN GAS · MASK ON · STILL BURNING · ${front ? "MOVE INSIDE THE LINE" : "LEAVE THE CLOUD"}`, danger: true };
    return { text: `GAS! · ${maskKey} · MASK ON · ${front ? "GET INSIDE THE LINE" : "LEAVE THE CLOUD"}`, danger: true };
  }
  const stage = pendingStage(gas, g.tick);
  if (!stage) return { text: "", danger: false };
  const which = stage.index === gas.stages.length - 1 ? "FINAL GAS ADVANCE" : "GAS ADVANCE";
  if (g.tick < stage.startAt) return { text: `${which} IN ${seconds(stage.startAt - g.tick)}s · MOVE INSIDE THE DASHED LINE`, danger: false };
  return { text: `GAS ADVANCING · ${seconds(stage.endAt - g.tick)}s · KEEP INSIDE THE DASHED LINE`, danger: false };
}

// One short status line beside the artillery charge.
export function gasStatus(g: Game, p: Soldier, maskKey: string) {
  if (!g.gas) return "";
  const ready = seconds(g.gas.strikeReadyAt[p.team] - g.tick);
  const mask = p.gasMask?.worn ? (masked(p, g.tick) ? "MASK ON" : "MASKING…") : "MASK OFF";
  return `${maskKey} · ${mask}　 GAS SHELLS ${ready ? ready + "s" : "READY"}`;
}

// Gas drawn over a plan of the play area: the gassed ground now, the outline
// of the next safe area once announced, and any gas shell clouds.
export class GasOverlay {
  readonly root = document.createElement("div");
  private safe = document.createElement("i");
  private next = document.createElement("i");
  private clouds: HTMLElement[] = [];
  constructor() {
    this.root.className = "gas-map";
    this.root.setAttribute("aria-hidden", "true");
    this.safe.className = "gas-safe";
    this.next.className = "gas-next";
    this.root.append(this.safe, this.next);
  }
  update(g: Game, container: HTMLElement) {
    const gas = g.gas;
    this.root.hidden = !gas;
    if (!gas) return;
    if (this.root.parentElement !== container) container.append(this.root);
    const { width, depth } = playArea(g.map);
    const place = (e: HTMLElement, a: SafeArea) => {
      e.style.left = `${(0.5 - a.halfWidth / width) * 100}%`;
      e.style.top = `${(0.5 - a.halfDepth / depth) * 100}%`;
      e.style.width = `${(a.halfWidth * 2 / width) * 100}%`;
      e.style.height = `${(a.halfDepth * 2 / depth) * 100}%`;
      e.style.borderRadius = `${(a.radius / (2 * a.halfWidth)) * 100}% / ${(a.radius / (2 * a.halfDepth)) * 100}%`;
    };
    this.safe.hidden = !gasActive(gas, g.tick);
    if (!this.safe.hidden) place(this.safe, safeAreaAt(gas, g.tick));
    const next = nextSafeArea(gas, g.tick), stage = pendingStage(gas, g.tick);
    this.next.hidden = !next || !stage;
    if (next && stage) place(this.next, next);
    const live = gas.clouds.filter((c) => cloudDensity(c, g.tick) > 0);
    while (this.clouds.length < live.length) {
      const dot = document.createElement("b");
      dot.className = "gas-cloud";
      this.root.append(dot);
      this.clouds.push(dot);
    }
    this.clouds.forEach((dot, i) => {
      const cloud = live[i];
      dot.hidden = !cloud;
      if (!cloud) return;
      const at = cloudPosition(cloud, g.tick), r = cloudRadius(cloudDensity(cloud, g.tick));
      dot.style.left = `${(at.x / width + 0.5) * 100}%`;
      dot.style.top = `${(at.z / depth + 0.5) * 100}%`;
      dot.style.width = `${(2 * r / width) * 100}%`;
      dot.style.height = `${(2 * r / depth) * 100}%`;
    });
  }
}

// The mask's eyepieces in first person, and the yellow haze of standing in
// gas. Both are screen overlays, so the gas billboards can stay out of the
// camera's way instead of washing out the view.
export class GasScreen {
  private lens = document.createElement("div");
  private haze = document.createElement("div");
  constructor(parent: HTMLElement) {
    this.lens.className = "gas-lens";
    this.lens.setAttribute("aria-hidden", "true");
    // Two eyepieces cut out of the facepiece; the mask makes the holes a union.
    this.lens.innerHTML = `<svg viewBox="0 0 160 90" preserveAspectRatio="none"><defs><mask id="gas-eyepieces"><rect width="160" height="90" fill="#fff"/><ellipse cx="56" cy="43" rx="33" ry="33" fill="#000"/><ellipse cx="104" cy="43" rx="33" ry="33" fill="#000"/></mask><radialGradient id="gas-glass" cx="50%" cy="85%" r="60%"><stop offset="0" stop-color="#e8f0dc" stop-opacity=".09"/><stop offset="1" stop-color="#e8f0dc" stop-opacity="0"/></radialGradient></defs><rect width="160" height="90" fill="#16180f" mask="url(#gas-eyepieces)"/><ellipse cx="56" cy="43" rx="33" ry="33" fill="url(#gas-glass)" stroke="#2f3324" stroke-width="2.4"/><ellipse cx="104" cy="43" rx="33" ry="33" fill="url(#gas-glass)" stroke="#2f3324" stroke-width="2.4"/></svg>`;
    this.haze.className = "gas-haze";
    this.haze.setAttribute("aria-hidden", "true");
    // First in the HUD, so health, ammo and notices draw over them.
    parent.prepend(this.haze, this.lens);
  }
  update(g: Game | undefined, p: Soldier | undefined, firstPerson: boolean, visible: boolean) {
    const live = !!g?.gas && !!p && p.hp > 0 && visible;
    const progress = live ? maskProgress(p!, g!.tick) : 0;
    const lens = firstPerson ? progress : 0;
    this.lens.style.opacity = lens > 0 ? String(Math.min(1, lens * 1.4)) : "0";
    // The facepiece comes up from below as it goes on.
    this.lens.style.transform = `translateY(${(1 - lens) * 35}%)`;
    let haze = 0;
    if (live) {
      const front = frontDepth(g!, p!), cloud = cloudExposure(g!, p!, 2);
      haze = Math.max(front > -2 ? Math.min(0.85, 0.4 + front / 10) : 0, cloud ? Math.min(0.85, 0.3 + cloud.strength * 0.6) : 0);
      // Through a mask the gas is still there, but the glass keeps it off your eyes.
      if (masked(p!, g!.tick)) haze *= 0.5;
    }
    this.haze.style.opacity = haze.toFixed(2);
  }
}

// The alarm and the breathing, on the game's own audio context.
export class GasAudio {
  private out?: GainNode;
  private noise?: AudioBuffer;
  private nextBreath = 0;
  constructor(private context: () => { context: AudioContext; capture: MediaStreamAudioDestinationNode } | undefined) {}
  private output() {
    const a = this.context();
    if (!a) return undefined;
    if (!this.out || this.out.context !== a.context) {
      const c = a.context;
      this.out = c.createGain();
      this.out.connect(c.destination);
      this.out.connect(a.capture);
      this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.out;
  }
  volume(value: number) {
    const out = this.output();
    if (out) out.gain.value = value;
  }
  // A struck shell case: a few inharmonic partials, rung three times. Gas
  // alarms along the line were gongs and rattles.
  gong(level = 1) {
    const out = this.output();
    if (!out || out.context.state !== "running") return;
    const c = out.context, now = c.currentTime;
    for (let strike = 0; strike < 3; strike++)
      for (const [freq, gain] of [[196, 0.05], [303, 0.035], [447, 0.025], [618, 0.014]]) {
        const o = c.createOscillator(), g = c.createGain(), t = now + strike * 0.55;
        o.frequency.value = freq * (1 + strike * 0.004);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.setValueAtTime(gain * level, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + 1.9);
        o.onended = () => { o.disconnect(); g.disconnect(); };
      }
  }
  // Filtered breath, and the rubbery seal as the mask goes on or off.
  private breath(at: number, length: number, freq: number, level: number) {
    const out = this.output();
    if (!out || !this.noise) return;
    const c = out.context, source = c.createBufferSource(), filter = c.createBiquadFilter(), g = c.createGain();
    source.buffer = this.noise;
    source.loop = true;
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = 0.9;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(level, at + length * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, at + length);
    source.connect(filter).connect(g).connect(out);
    source.start(at, Math.random());
    source.stop(at + length + 0.05);
    source.onended = () => { source.disconnect(); filter.disconnect(); g.disconnect(); };
  }
  seal() {
    const out = this.output();
    if (out?.context.state === "running") this.breath(out.context.currentTime, 0.35, 260, 0.05);
  }
  update(masked: boolean) {
    const out = this.output();
    if (!out || out.context.state !== "running") return;
    const now = out.context.currentTime;
    if (!masked) { this.nextBreath = 0; return; }
    if (now < this.nextBreath - 0.2) return;
    const at = Math.max(now, this.nextBreath);
    // In through the canister, out through the valve: slow, close and loud.
    this.breath(at, 1.3, 620, 0.028);
    this.breath(at + 1.55, 1.1, 380, 0.034);
    this.nextBreath = at + 3.7;
  }
}
