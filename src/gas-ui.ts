// The player's side of gas shells and masks: HUD notices, clouds on the
// minimap and tactical map, the mask's lens, the haze of standing in gas, and
// the alarm gong and breathing. Plain DOM and Web Audio only.
import "./gas.css";
import { cloudDensity, cloudPosition, cloudRadius, cloudExposure, maskProgress, masked } from "./gas";
import { playArea } from "./map";
import type { Game, Soldier } from "./simulation";

// The standing line at the top of the screen while you are in a cloud.
// Empty when there is nothing to say.
export function gasNotice(g: Game, p: Soldier, maskKey: string) {
  if (p.hp <= 0 || g.phase !== "playing" || !cloudExposure(g, p)) return { text: "", danger: false };
  if (masked(p, g.tick)) return { text: "IN GAS · MASK ON · STILL BURNING · LEAVE THE CLOUD", danger: true };
  return { text: `GAS! · ${maskKey} · MASK ON · LEAVE THE CLOUD`, danger: true };
}

// One short status line under the artillery charge.
export function gasStatus(g: Game, p: Soldier, maskKey: string) {
  const mask = p.gasMask?.worn ? (masked(p, g.tick) ? "MASK ON" : "MASKING…") : "MASK OFF";
  return `${maskKey} · ${mask}`;
}

// Gas shell clouds drawn over a plan of the play area.
export class GasOverlay {
  readonly root = document.createElement("div");
  private clouds: HTMLElement[] = [];
  constructor() {
    this.root.className = "gas-map";
    this.root.setAttribute("aria-hidden", "true");
  }
  update(g: Game, container: HTMLElement) {
    const live = g.gas.clouds.filter((c) => cloudDensity(c, g.tick) > 0);
    this.root.hidden = !live.length;
    if (!live.length) return;
    if (this.root.parentElement !== container) container.append(this.root);
    const { width, depth } = playArea(g.map);
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
    const live = !!g && !!p && p.hp > 0 && visible;
    const progress = live ? maskProgress(p!, g!.tick) : 0;
    const lens = firstPerson ? progress : 0;
    this.lens.style.opacity = lens > 0 ? String(Math.min(1, lens * 1.4)) : "0";
    // The facepiece comes up from below as it goes on.
    this.lens.style.transform = `translateY(${(1 - lens) * 35}%)`;
    let haze = 0;
    if (live) {
      const cloud = cloudExposure(g!, p!, 2);
      haze = cloud ? Math.min(0.85, 0.3 + cloud.strength * 0.6) : 0;
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
