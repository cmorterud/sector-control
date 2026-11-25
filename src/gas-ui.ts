// The player's side of gas shells and masks: HUD notices, clouds on the
// minimap and tactical map, the mask's lens, the haze of standing in gas, and
// the alarm gong and breathing. Plain DOM and Web Audio only.
import "./gas.css";
import { cloudDensity, cloudPosition, cloudRadius, cloudExposure, gasRules, maskProgress, masked } from "./gas";
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
//
// The view is a period small box respirator from inside: two round glass
// eyepieces in pressed metal rims, set apart by the bridge of the nose in a
// dark rubberised facepiece. The eyepieces stay round on any screen shape
// (the drawing is cropped, never stretched). Putting it on, the facepiece
// comes up from under the chin, tilted, and settles; the glass mists over as
// it seals and then with each breath out.
// The eyepieces: radius, centre height and how far apart. Large and set wide,
// so the facepiece frames the view rather than hiding it.
const lens = { r: 35, cy: 45, left: 41, right: 119 };
const eyepiece = (cx: number) => {
  const { r, cy } = lens, k = r / 25;
  const at = (dx: number, dy: number) => `${cx + dx * k} ${cy + dy * k}`;
  return `
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#gas-glass)"/>
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#gas-glass-edge)"/>
  <circle class="gas-fog-seal" cx="${cx}" cy="${cy}" r="${r}" fill="url(#gas-fog)"/>
  <circle class="gas-fog-breath" cx="${cx}" cy="${cy}" r="${r}" fill="url(#gas-fog)"/>
  <path d="M${at(-17, -13)} A${21 * k} ${21 * k} 0 0 1 ${at(2, -21)}" fill="none" stroke="#f4f6e6" stroke-opacity=".16" stroke-width="${2.2 * k}" stroke-linecap="round" filter="url(#gas-soft)"/>
  <path d="M${at(14, 15)} A${20 * k} ${20 * k} 0 0 0 ${at(20, 6)}" fill="none" stroke="#f4f6e6" stroke-opacity=".08" stroke-width="${1.4 * k}" stroke-linecap="round" filter="url(#gas-soft)"/>
  <path d="M${at(-9, 9)} l${7 * k} ${-3 * k} M${at(6, -15)} l${4 * k} ${2.5 * k}" stroke="#e8ead8" stroke-opacity=".07" stroke-width=".3"/>
  <g filter="url(#gas-soft)">
    <circle cx="${cx}" cy="${cy}" r="${r - 1.4}" fill="none" stroke="#090806" stroke-width="1.6"/>
    <circle cx="${cx}" cy="${cy}" r="${r + 0.9}" fill="none" stroke="url(#gas-rim)" stroke-width="3.4"/>
    <circle cx="${cx}" cy="${cy}" r="${r + 2.8}" fill="none" stroke="#0c0b08" stroke-opacity=".8" stroke-width="1"/>
  </g>`;
};
const maskDrawing = `<svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice"><defs>
  <mask id="gas-eyepieces"><rect x="-80" y="-1" width="320" height="131" fill="#fff"/><circle cx="${lens.left}" cy="${lens.cy}" r="${lens.r}" fill="#000"/><circle cx="${lens.right}" cy="${lens.cy}" r="${lens.r}" fill="#000"/></mask>
  <filter id="gas-soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation=".45"/></filter>
  <filter id="gas-weave" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 .16  0 0 0 0 .15  0 0 0 0 .1  0 0 0 .22 0"/><feGaussianBlur stdDeviation=".25"/><feComposite in2="SourceGraphic" operator="in"/></filter>
  <radialGradient id="gas-face" cx="50%" cy="48%" r="62%"><stop offset=".3" stop-color="#26241a"/><stop offset=".75" stop-color="#121109"/><stop offset="1" stop-color="#050504"/></radialGradient>
  <radialGradient id="gas-bridge" cx="50%" cy="30%" r="50%"><stop offset="0" stop-color="#3b3828" stop-opacity=".7"/><stop offset="1" stop-color="#3b3828" stop-opacity="0"/></radialGradient>
  <radialGradient id="gas-nose" cx="50%" cy="100%" r="60%"><stop offset="0" stop-color="#000" stop-opacity=".7"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  <linearGradient id="gas-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8a8266"/><stop offset=".35" stop-color="#4c4632"/><stop offset=".6" stop-color="#25221a"/><stop offset="1" stop-color="#5e5741"/></linearGradient>
  <radialGradient id="gas-glass"><stop offset="0" stop-color="#b9c08e" stop-opacity=".05"/><stop offset="1" stop-color="#b9c08e" stop-opacity=".1"/></radialGradient>
  <radialGradient id="gas-glass-edge"><stop offset=".72" stop-color="#0e0f0a" stop-opacity="0"/><stop offset="1" stop-color="#0e0f0a" stop-opacity=".55"/></radialGradient>
  <radialGradient id="gas-fog" cx="50%" cy="95%" r="85%"><stop offset="0" stop-color="#e9ecdf" stop-opacity=".75"/><stop offset=".55" stop-color="#e2e6d6" stop-opacity=".4"/><stop offset="1" stop-color="#dde2d0" stop-opacity="0"/></radialGradient>
  <linearGradient id="gas-chin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".65"/></linearGradient>
</defs>
<g mask="url(#gas-eyepieces)">
  <rect x="-80" y="-1" width="320" height="131" fill="url(#gas-face)"/>
  <rect x="-80" y="-1" width="320" height="131" fill="#000" filter="url(#gas-weave)"/>
  <ellipse cx="80" cy="42" rx="4" ry="26" fill="url(#gas-bridge)"/>
  <ellipse cx="80" cy="92" rx="26" ry="24" fill="url(#gas-nose)"/>
  <rect x="-80" y="64" width="320" height="66" fill="url(#gas-chin)"/>
</g>
${eyepiece(lens.left)}${eyepiece(lens.right)}
</svg>`;

const smooth = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
export class GasScreen {
  private lens = document.createElement("div");
  private haze = document.createElement("div");
  constructor(parent: HTMLElement) {
    this.lens.className = "gas-lens";
    this.lens.setAttribute("aria-hidden", "true");
    this.lens.innerHTML = maskDrawing;
    this.haze.className = "gas-haze";
    this.haze.setAttribute("aria-hidden", "true");
    // First in the HUD, so health, ammo and notices draw over them.
    parent.prepend(this.haze, this.lens);
  }
  update(g: Game | undefined, p: Soldier | undefined, firstPerson: boolean, visible: boolean) {
    const live = !!g && !!p && p.hp > 0 && visible;
    const progress = live ? maskProgress(p!, g!.tick) : 0;
    const lens = firstPerson ? progress : 0;
    const style = this.lens.style;
    style.opacity = lens > 0 ? "1" : "0";
    // Up from under the chin, tilted and too close, then settled square on the face.
    const e = smooth(lens);
    style.transform = lens > 0 ? `translateY(${(1 - e) * 115}%) rotate(${(1 - e) * -7}deg) scale(${1 + (1 - e) * 0.25})` : "";
    // The glass mists as the seal closes, clears over a second and a half,
    // then fogs a little with each breath out.
    const m = p?.gasMask, sealed = live && firstPerson && masked(p!, g!.tick);
    const sinceSeal = sealed && m ? (g!.tick - m.since - (1 - m.from) * gasRules.donTicks) / 30 : Infinity;
    style.setProperty("--gas-seal-fog", sealed ? (0.15 + 0.6 * Math.exp(-sinceSeal / 0.7)).toFixed(3) : "0");
    this.lens.classList.toggle("sealed", sealed);
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
