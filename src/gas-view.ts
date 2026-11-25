// Gas shell clouds as the camera sees them: low yellow-green puffs that sit
// on the ground and drift. Batched camera-facing quads (src/billboards.ts),
// one draw. Quads near the camera are left out, as for mist, so standing in a
// cloud never fills the screen; the screen haze in src/gas-ui.ts says you are
// in it.
import type { BillboardBuffer } from "./billboards";
import { cloudDensity, cloudPosition, cloudRadius, gasStrikeRules } from "./gas";
import type { Quality } from "./graphics-quality";
import { groundHeight, type MapDefinition } from "./map";
import type { Game } from "./simulation";

type Batch = { buffer: BillboardBuffer };
export interface GasViewHooks {
  map: MapDefinition;
  billboards(name: string, capacity: number, hex: string, opacity: number): Batch;
  begin(batch: Batch): BillboardBuffer;
  end(batch: Batch): void;
  enable(on: boolean): void;
}
export const gasLook = {
  cloud: "#c3bd52",
  cloudOpacity: 0.6,
  // Each shell's burst: a dense jet of gas thrown up from the hole, over a
  // quick spit of earth from the bursting charge.
  burst: "#cfc95a",
  burstOpacity: 0.85,
  earth: "#4b4130",
  earthOpacity: 0.9,
  earthSeconds: 0.8,
  // Hidden this close to the camera, faded in over the next few meters.
  hideWithin: 6,
  fadeOver: 5,
};
const hash = (n: number) => {
  n = Math.imul(n ^ (n >>> 15), 2246822519);
  n = Math.imul(n ^ (n >>> 13), 3266489917);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

export class GasView {
  private clouds: Batch;
  private bursts: Batch;
  private earth: Batch;
  constructor(private hooks: GasViewHooks) {
    this.clouds = hooks.billboards("gas shell clouds", 160, gasLook.cloud, gasLook.cloudOpacity);
    this.bursts = hooks.billboards("gas shell bursts", 96, gasLook.burst, gasLook.burstOpacity);
    this.earth = hooks.billboards("gas shell earth", 48, gasLook.earth, gasLook.earthOpacity);
  }
  hide() { this.hooks.enable(false); }
  draw(g: Game, alpha: number, eye: { x: number; y: number; z: number }, quality: Quality) {
    const gas = g.gas;
    this.hooks.enable(gas.clouds.length > 0);
    if (!gas.clouds.length) return;
    const tick = g.tick - 1 + alpha, t = tick / 30, map = this.hooks.map;
    const fade = (x: number, y: number, z: number) => {
      const d = Math.hypot(x - eye.x, y - eye.y, z - eye.z);
      return d < gasLook.hideWithin ? 0 : Math.min(1, (d - gasLook.hideWithin) / gasLook.fadeOver);
    };
    const clouds = this.hooks.begin(this.clouds);
    for (const cloud of gas.clouds) {
      const density = cloudDensity(cloud, tick);
      if (density <= 0) continue;
      const at = cloudPosition(cloud, tick), r = cloudRadius(density), puffs = quality === "low" ? 10 : 22;
      for (let i = 0; i < puffs; i++) {
        const seed = cloud.id * 97 + i, a = i * 2.39996 + t * 0.05 * (i % 2 ? 1 : -1), d = r * 0.85 * Math.sqrt((i + 0.5) / puffs);
        const x = at.x + Math.cos(a) * d, z = at.z + Math.sin(a) * d;
        const size = (3.2 + hash(seed) * 2.4) * (0.6 + 0.4 * density) * (quality === "low" ? 1.4 : 1);
        const y = groundHeight(x, z, map) + size * 0.3 + (i % 3) * 0.25;
        clouds.add(x, y, z, size * 1.3, size * 0.75, (hash(seed + 1) - 0.5) * 40, density * fade(x, y, z));
      }
    }
    this.hooks.end(this.clouds);
    const bursts = this.hooks.begin(this.bursts), earth = this.hooks.begin(this.earth);
    for (const cloud of gas.clouds)
      for (const [n, b] of (cloud.bursts ?? []).entries()) {
        const age = (tick - b.tick) / 30, life = gasStrikeRules.burstTicks / 30;
        if (age < 0 || age >= life) continue;
        // Eases out: fast from the hole, then hanging and spreading.
        const out = 1 - Math.exp(-age * 2.2), seed = cloud.id * 131 + n * 17;
        const fadeIn = Math.min(1, age * 10), fadeOut = (1 - age / life) ** 1.4;
        const jets = quality === "low" ? 5 : 8;
        for (let i = 0; i < jets; i++) {
          const a = i * 2.39996 + hash(seed + i) * 0.8, spread = (0.3 + 2.6 * out) * (0.5 + 0.5 * hash(seed + i + 40));
          const x = b.x + Math.cos(a) * spread, z = b.z + Math.sin(a) * spread;
          const rise = (0.5 + 2.6 * out) * (0.6 + 0.6 * hash(seed + i + 80));
          const size = (1.2 + 3.4 * out) * (0.8 + 0.4 * hash(seed + i + 120));
          const y = Math.max(b.y, groundHeight(x, z, map)) + rise;
          bursts.add(x, y, z, size, size * 0.85, (hash(seed + i + 160) - 0.5) * 60, fadeIn * fadeOut * fade(x, y, z));
        }
        if (age < gasLook.earthSeconds) {
          const e = age / gasLook.earthSeconds;
          for (let i = 0; i < 4; i++) {
            const a = i * 1.7 + hash(seed + i + 200) * 1.2, d = 0.3 + 1.2 * e;
            const x = b.x + Math.cos(a) * d, z = b.z + Math.sin(a) * d, y = b.y + 0.3 + 1.4 * Math.sin(Math.min(1, e * 1.4) * Math.PI * 0.6);
            earth.add(x, y, z, 0.6 + 1.2 * e, 0.6 + 1.2 * e, (hash(seed + i + 240) - 0.5) * 80, (1 - e) * fade(x, y, z));
          }
        }
      }
    this.hooks.end(this.bursts);
    this.hooks.end(this.earth);
  }
}
