// What a shot looks like leaving the barrel: per-weapon blast sizes, the
// irregular shapes the flash atlas is drawn from, and the layers one shot
// is built of. No two shots repeat: each picks different flash shapes, turns
// and stretches them, and the shapes themselves are ragged tongues of fire
// at uneven angles rather than a regular star.
import type { WeaponKind } from "./weapons";

export interface MuzzleProfile {
  // Width of the front flash, metres.
  flash: number;
  // Length of the forward flame jet, metres.
  jet: number;
  // Smoke puffs per shot, and how big they grow.
  smoke: number;
  smokeSize: number;
  // Optional: how thick the smoke starts and how fast it climbs (m/s and
  // m/s² of lift). A tank gun's cloud is thicker and rises over the hull.
  smokeAlpha?: number;
  smokeRise?: number;
  smokeLift?: number;
  // How long the flash lasts, seconds.
  flashLife: number;
  // Dust thrown up from the ground under the muzzle.
  dust: number;
  // Spent casing: length in metres, or 0 for none (revolvers keep theirs).
  brass: number;
  // Night light brightness and reach.
  light: number;
  lightRange: number;
}

const profiles: Record<WeaponKind | "emplaced", MuzzleProfile> = {
  emplaced: { flash: 0.62, jet: 0.75, smoke: 2, smokeSize: 0.75, flashLife: 0.05, dust: 3, brass: 0.075, light: 3.2, lightRange: 11 },
  machineGun: { flash: 0.46, jet: 0.5, smoke: 1, smokeSize: 0.6, flashLife: 0.045, dust: 1, brass: 0.075, light: 2.4, lightRange: 9 },
  serviceRifle: { flash: 0.55, jet: 0.62, smoke: 3, smokeSize: 0.7, flashLife: 0.06, dust: 1, brass: 0.075, light: 2.8, lightRange: 10 },
  rifle: { flash: 0.42, jet: 0.45, smoke: 2, smokeSize: 0.55, flashLife: 0.05, dust: 0, brass: 0.06, light: 2.2, lightRange: 8 },
  pistol: { flash: 0.24, jet: 0.22, smoke: 1, smokeSize: 0.35, flashLife: 0.04, dust: 0, brass: 0.022, light: 1.4, lightRange: 6 },
  flamethrower: { flash: 0, jet: 0, smoke: 0, smokeSize: 0, flashLife: 0, dust: 0, brass: 0, light: 0, lightRange: 0 },
};

// A tank's main gun: a big flash, a long jet and a heavy cloud off the barrel.
export const tankGunMuzzle = "tank gun";
const tankGun: MuzzleProfile = { flash: 1.5, jet: 1.9, smoke: 16, smokeSize: 3.6, smokeAlpha: 0.9, smokeRise: 2.2, smokeLift: 1.1, flashLife: 0.09, dust: 6, brass: 0, light: 6, lightRange: 16 };

export function muzzleProfile(weapon: WeaponKind | undefined, weaponId: string | undefined, mounted: boolean): MuzzleProfile {
  if (weaponId === tankGunMuzzle) return tankGun;
  if (mounted) return profiles.emplaced;
  const base = profiles[weapon ?? "rifle"];
  // A revolver keeps its empties in the cylinder; a short carbine barrel
  // burns more powder in the open air.
  if (weaponId === "Webley Mk VI") return { ...base, brass: 0, flash: base.flash * 1.25 };
  if (weaponId === "Karabiner 98AZ" || weaponId === "Berthier Mle 1892 M16") return { ...base, flash: base.flash * 1.2, jet: base.jet * 1.15 };
  return base;
}

// Small deterministic hash in [0, 1).
export function hash(seed: number, salt = 0) {
  const n = Math.sin(seed * 127.1 + salt * 311.7 + 74.7) * 43758.5453;
  return n - Math.floor(n);
}

// The atlas both effect materials use: a 4 × 4 grid.
export const flashFrames = { blast: [0, 1, 2, 3, 4, 5, 6, 7, 14, 15], jet: [8, 9, 10, 11], glow: 12, spark: 13 };
export const smokeFrames = { puff: [0, 1, 2, 3, 4, 5], wisp: [6, 7], brass: 8, steam: [9, 10, 11] };

export interface Petal { angle: number; length: number; width: number; bend: number }
// One front-flash shape: a handful of ragged tongues at uneven angles around
// a lumpy core. Between five and nine tongues, their spacing, length, width
// and curl all drawn separately, so no shape is a regular star.
export function blastShape(variant: number) {
  const count = 5 + Math.floor(hash(variant, 1) * 5);
  const petals: Petal[] = [];
  let angle = hash(variant, 2) * Math.PI * 2;
  for (let i = 0; i < count; i++) {
    // Uneven gaps: anywhere from a third to nearly twice the even spacing.
    angle += (Math.PI * 2 / count) * (0.35 + hash(variant, 10 + i) * 1.4);
    const long = hash(variant, 30 + i);
    petals.push({
      angle,
      length: 0.3 + long * long * 0.7,
      width: 0.07 + hash(variant, 50 + i) * 0.16,
      bend: (hash(variant, 70 + i) - 0.5) * 0.9,
    });
  }
  return { petals, core: 0.16 + hash(variant, 3) * 0.12, lumps: 5 + Math.floor(hash(variant, 4) * 4) };
}

export interface FlashLayer {
  kind: "blast" | "jet" | "glow";
  frame: number;
  // Along the barrel from the muzzle, metres.
  offset: number;
  width: number;
  height: number;
  roll: number;
  // Warmth, 0 (white-yellow) to 1 (deep orange).
  warmth: number;
  intensity: number;
}

// The layers one shot's flash is built from.
export function flashLayers(profile: MuzzleProfile, seed: number): FlashLayer[] {
  const r = (salt: number) => hash(seed, salt);
  const pick = (list: number[], salt: number) => list[Math.floor(r(salt) * list.length) % list.length];
  const size = profile.flash * (0.75 + r(1) * 0.5);
  const layers: FlashLayer[] = [
    { kind: "blast", frame: pick(flashFrames.blast, 2), offset: 0.02, width: size * (0.8 + r(3) * 0.4), height: size * (0.8 + r(4) * 0.4), roll: r(5) * Math.PI * 2, warmth: r(6) * 0.5, intensity: 1.1 + r(7) * 0.4 },
    { kind: "glow", frame: flashFrames.glow, offset: 0.04, width: size * 1.2, height: size * 1.2, roll: 0, warmth: 0.6, intensity: 0.14 + r(8) * 0.1 },
  ];
  // A second, smaller tongue of fire on about two shots in three.
  if (r(9) < 0.65)
    layers.push({ kind: "blast", frame: pick(flashFrames.blast, 10), offset: 0.08 + r(11) * 0.1, width: size * (0.4 + r(12) * 0.35), height: size * (0.35 + r(13) * 0.4), roll: r(14) * Math.PI * 2, warmth: 0.4 + r(15) * 0.5, intensity: 0.7 });
  if (profile.jet > 0)
    layers.push({ kind: "jet", frame: pick(flashFrames.jet, 16), offset: 0, width: profile.jet * (0.6 + r(17) * 0.8), height: size * (0.35 + r(18) * 0.25), roll: 0, warmth: r(19) * 0.6, intensity: 0.8 + r(20) * 0.3 });
  return layers;
}

// The flash colour at a warmth, as linear-ish RGB scaled by intensity.
export function flashColor(warmth: number, intensity: number): [number, number, number] {
  return [intensity, intensity * (0.86 - warmth * 0.34), intensity * (0.55 - warmth * 0.4)];
}

// Draws the flash atlas into a square 2D canvas context: ten blast shapes,
// four side-on jets, a soft glow and a spark. Colour only; the material adds it.
export function drawFlashAtlas(ctx: CanvasRenderingContext2D, size: number) {
  const cell = size / 4;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = "lighter";
  const origin = (frame: number) => [(frame % 4) * cell, Math.floor(frame / 4) * cell];
  const glowAt = (x: number, y: number, radius: number, inner: string, outer: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  };
  flashFrames.blast.forEach((frame, variant) => {
    const [ox, oy] = origin(frame), cx = ox + cell / 2, cy = oy + cell / 2, R = cell * 0.48;
    const shape = blastShape(variant + 1);
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, cell, cell);
    ctx.clip();
    for (const petal of shape.petals) {
      // A tapered tongue, curling to one side, drawn in a few shrinking passes
      // so its root is hot and its tip ragged.
      for (let pass = 0; pass < 3; pass++) {
        const reach = R * petal.length * (1 - pass * 0.22), half = R * petal.width * (1 - pass * 0.3);
        const a = petal.angle + petal.bend * 0.15 * pass, bend = petal.bend;
        const tip = [cx + Math.cos(a + bend * 0.5) * reach, cy + Math.sin(a + bend * 0.5) * reach];
        const side = (s: number) => [cx + Math.cos(a + s * Math.PI / 2) * half, cy + Math.sin(a + s * Math.PI / 2) * half];
        const mid = (s: number) => [cx + Math.cos(a + bend * 0.25) * reach * 0.55 + Math.cos(a + s * Math.PI / 2) * half * 0.6,
          cy + Math.sin(a + bend * 0.25) * reach * 0.55 + Math.sin(a + s * Math.PI / 2) * half * 0.6];
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach);
        const heat = 1 - pass * 0.25;
        g.addColorStop(0, `rgba(255,250,225,${0.75 * heat})`);
        g.addColorStop(0.35, `rgba(255,205,110,${0.55 * heat})`);
        g.addColorStop(0.75, `rgba(240,120,40,${0.3 * heat})`);
        g.addColorStop(1, "rgba(160,50,10,0)");
        ctx.fillStyle = g;
        const [l, r] = [side(-1), side(1)], [ml, mr] = [mid(-1), mid(1)];
        ctx.beginPath();
        ctx.moveTo(l[0], l[1]);
        ctx.quadraticCurveTo(ml[0], ml[1], tip[0], tip[1]);
        ctx.quadraticCurveTo(mr[0], mr[1], r[0], r[1]);
        ctx.closePath();
        ctx.fill();
      }
    }
    // A lumpy core: overlapping hot blobs rather than one round disc.
    for (let i = 0; i < shape.lumps; i++) {
      const a = hash(variant, 90 + i) * Math.PI * 2, d = R * shape.core * 0.5 * hash(variant, 110 + i);
      glowAt(cx + Math.cos(a) * d, cy + Math.sin(a) * d, R * shape.core * (0.6 + hash(variant, 130 + i) * 0.6), "rgba(255,255,240,0.7)", "rgba(255,190,90,0)");
    }
    // Sparks thrown out past the tongues.
    for (let i = 0; i < 6; i++) {
      const a = hash(variant, 150 + i) * Math.PI * 2, d = R * (0.45 + hash(variant, 170 + i) * 0.5);
      glowAt(cx + Math.cos(a) * d, cy + Math.sin(a) * d, cell * 0.012 + hash(variant, 190 + i) * cell * 0.012, "rgba(255,230,160,0.9)", "rgba(255,140,40,0)");
    }
    ctx.restore();
  });
  // Side-on jets: the muzzle sits at the left edge (u = 0) and the flame runs right.
  flashFrames.jet.forEach((frame, variant) => {
    const [ox, oy] = origin(frame), cy = oy + cell / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, cell, cell);
    ctx.clip();
    for (let i = 0; i < 7; i++) {
      const at = ox + cell * (0.08 + i * 0.12 + hash(variant, 200 + i) * 0.06);
      const radius = cell * (0.22 - i * 0.022) * (0.7 + hash(variant, 220 + i) * 0.6);
      const wobble = (hash(variant, 240 + i) - 0.5) * cell * 0.12;
      ctx.save();
      ctx.translate(at, cy + wobble);
      ctx.scale(1.6, 0.6 + hash(variant, 260 + i) * 0.4);
      glowAt(0, 0, radius, `rgba(255,${220 - i * 14},${150 - i * 16},${0.75 - i * 0.07})`, "rgba(200,70,10,0)");
      ctx.restore();
    }
    ctx.restore();
  });
  {
    const [ox, oy] = origin(flashFrames.glow);
    glowAt(ox + cell / 2, oy + cell / 2, cell / 2, "rgba(255,200,120,0.85)", "rgba(255,120,40,0)");
  }
  {
    const [ox, oy] = origin(flashFrames.spark);
    glowAt(ox + cell / 2, oy + cell / 2, cell * 0.22, "rgba(255,240,200,1)", "rgba(255,150,50,0)");
  }
  ctx.globalCompositeOperation = "source-over";
}

// Draws the smoke atlas: soft lumpy puffs, thin rising wisps, a brass casing
// and steam, as white with alpha for vertex colours to tint.
export function drawSmokeAtlas(ctx: CanvasRenderingContext2D, size: number) {
  const cell = size / 4;
  ctx.clearRect(0, 0, size, size);
  const origin = (frame: number) => [(frame % 4) * cell, Math.floor(frame / 4) * cell];
  const blob = (x: number, y: number, radius: number, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, `rgba(255,255,255,${alpha})`);
    g.addColorStop(0.6, `rgba(255,255,255,${alpha * 0.45})`);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  };
  const clipped = (frame: number, draw: (ox: number, oy: number) => void) => {
    const [ox, oy] = origin(frame);
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, cell, cell);
    ctx.clip();
    draw(ox, oy);
    ctx.restore();
  };
  for (const [variant, frame] of [...smokeFrames.puff, ...smokeFrames.steam].entries())
    clipped(frame, (ox, oy) => {
      const lumps = 7 + Math.floor(hash(variant, 300) * 5), steam = variant >= smokeFrames.puff.length;
      for (let i = 0; i < lumps; i++) {
        const a = hash(variant, 310 + i) * Math.PI * 2, d = cell * 0.17 * hash(variant, 330 + i);
        blob(ox + cell / 2 + Math.cos(a) * d, oy + cell / 2 + Math.sin(a) * d, cell * (0.16 + hash(variant, 350 + i) * 0.14), steam ? 0.28 : 0.36);
      }
    });
  for (const [variant, frame] of smokeFrames.wisp.entries())
    clipped(frame, (ox, oy) => {
      for (let i = 0; i < 9; i++) {
        const t = i / 8, x = ox + cell / 2 + Math.sin(t * 5 + variant * 2) * cell * 0.12;
        blob(x, oy + cell * (0.9 - t * 0.8), cell * (0.07 + t * 0.06), 0.3 * (1 - t * 0.5));
      }
    });
  clipped(smokeFrames.brass, (ox, oy) => {
    // A casing seen side-on: base rim on the left, shoulder and neck to the right.
    const y = oy + cell / 2, h = cell * 0.36, g = ctx.createLinearGradient(0, y - h / 2, 0, y + h / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(235,235,235,1)");
    g.addColorStop(1, "rgba(150,150,150,1)");
    ctx.fillStyle = g;
    ctx.fillRect(ox + cell * 0.06, y - h / 2, cell * 0.62, h);
    ctx.beginPath();
    ctx.moveTo(ox + cell * 0.68, y - h / 2);
    ctx.lineTo(ox + cell * 0.78, y - h * 0.25);
    ctx.lineTo(ox + cell * 0.94, y - h * 0.25);
    ctx.lineTo(ox + cell * 0.94, y + h * 0.25);
    ctx.lineTo(ox + cell * 0.78, y + h * 0.25);
    ctx.lineTo(ox + cell * 0.68, y + h / 2);
    ctx.fill();
    ctx.fillStyle = "rgba(120,120,120,1)";
    ctx.fillRect(ox + cell * 0.04, y - h * 0.58, cell * 0.05, h * 1.16);
  });
}

// Machine-gun belts and pans were loaded with a tracer every few rounds; the
// rest fly unseen but for a faint streak. Rifles and pistols fire ball only.
export const tracerEvery = 4;
export function tracerRound(projectile: { id: number; weapon?: WeaponKind }) {
  return projectile.weapon === "machineGun" && projectile.id % tracerEvery === 0;
}
