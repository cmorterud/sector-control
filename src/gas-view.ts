// Gas shell clouds as the camera sees them: low yellow-green puffs that sit
// on the ground and drift. Batched camera-facing quads (src/billboards.ts),
// one draw. Quads near the camera are left out, as for mist, so standing in a
// cloud never fills the screen; the screen haze in src/gas-ui.ts says you are
// in it.
import type { BillboardBuffer } from "./billboards";
import { cloudDensity, cloudPosition, cloudRadius } from "./gas";
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
  constructor(private hooks: GasViewHooks) {
    this.clouds = hooks.billboards("gas shell clouds", 160, gasLook.cloud, gasLook.cloudOpacity);
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
  }
}
