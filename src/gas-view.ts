// The gas as the camera sees it: a low yellow-green bank along the edge of
// the safe area with thinner rows behind it, and lingering gas shell clouds.
// Both are batched camera-facing quads (src/billboards.ts), one draw each.
// Quads near the camera are left out, as for mist, so standing in the gas
// never fills the screen; the screen haze in src/gas-ui.ts says you are in it.
import type { BillboardBuffer } from "./billboards";
import { cloudDensity, cloudPosition, cloudRadius, gasActive, safeAreaAt, type SafeArea } from "./gas";
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
  front: "#b7ba4c",
  cloud: "#c3bd52",
  frontOpacity: 0.62,
  cloudOpacity: 0.6,
  // Hidden this close to the camera, faded in over the next few meters.
  hideWithin: 6,
  fadeOver: 5,
};
// Rows of quads behind the edge, in meters into the gas, and their spacing
// along it. Low quality draws fewer, larger and denser quads, so the bank
// still reads plainly at a fraction of the count.
const rows: Record<Quality, { offsets: number[]; spacing: number }> = {
  low: { offsets: [1, 7, 15, 27], spacing: 6 },
  medium: { offsets: [0.5, 5, 11, 19, 30], spacing: 4.5 },
  high: { offsets: [0.5, 4, 8, 13, 19, 27, 38], spacing: 3.6 },
};
// Points along the rounded edge of a safe area, each with its outward normal.
export function edgePoints(area: SafeArea, spacing: number) {
  const r = Math.min(area.radius, area.halfWidth, area.halfDepth), hx = area.halfWidth - r, hz = area.halfDepth - r;
  const points: { x: number; z: number; nx: number; nz: number }[] = [];
  const side = (x0: number, z0: number, x1: number, z1: number, nx: number, nz: number) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / spacing));
    for (let i = 0; i < n; i++) points.push({ x: x0 + ((x1 - x0) * i) / n, z: z0 + ((z1 - z0) * i) / n, nx, nz });
  };
  const corner = (cx: number, cz: number, from: number) => {
    const n = Math.max(1, Math.round((r * Math.PI) / 2 / spacing));
    for (let i = 0; i < n; i++) {
      const a = from + ((Math.PI / 2) * i) / n;
      points.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, nx: Math.cos(a), nz: Math.sin(a) });
    }
  };
  side(hx + r, -hz, hx + r, hz, 1, 0); corner(hx, hz, 0);
  side(hx, hz + r, -hx, hz + r, 0, 1); corner(-hx, hz, Math.PI / 2);
  side(-hx - r, hz, -hx - r, -hz, -1, 0); corner(-hx, -hz, Math.PI);
  side(-hx, -hz - r, hx, -hz - r, 0, -1); corner(hx, -hz, (3 * Math.PI) / 2);
  return points;
}
const hash = (n: number) => {
  n = Math.imul(n ^ (n >>> 15), 2246822519);
  n = Math.imul(n ^ (n >>> 13), 3266489917);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

export class GasView {
  private front: Batch;
  private clouds: Batch;
  constructor(private hooks: GasViewHooks) {
    this.front = hooks.billboards("gas front", 2400, gasLook.front, gasLook.frontOpacity);
    this.clouds = hooks.billboards("gas shell clouds", 160, gasLook.cloud, gasLook.cloudOpacity);
  }
  hide() { this.hooks.enable(false); }
  draw(g: Game, alpha: number, eye: { x: number; y: number; z: number }, quality: Quality) {
    const gas = g.gas;
    this.hooks.enable(!!gas);
    if (!gas) return;
    const tick = g.tick - 1 + alpha, t = tick / 30, map = this.hooks.map;
    const fade = (x: number, y: number, z: number) => {
      const d = Math.hypot(x - eye.x, y - eye.y, z - eye.z);
      return d < gasLook.hideWithin ? 0 : Math.min(1, (d - gasLook.hideWithin) / gasLook.fadeOver);
    };
    const front = this.hooks.begin(this.front);
    // Gas waits beyond the wire once announced, and rolls in from there.
    if (tick >= gas.stages[0].warnAt || gasActive(gas, tick)) {
      const area = safeAreaAt(gas, tick), { offsets, spacing } = rows[quality];
      const edgeX = map.width / 2 + 2, edgeZ = map.depth / 2 + 2;
      edgePoints(area, spacing).forEach((point, i) => {
        offsets.forEach((offset, row) => {
          const seed = i * 7 + row * 131, wobble = Math.sin(t * 0.35 + seed) * 1.4;
          // Rows behind the edge wander along it so the bank never looks laid out.
          const along = (hash(seed) - 0.5) * spacing + Math.sin(t * 0.12 + seed * 0.7) * 1.2;
          const x = point.x + point.nx * (offset + wobble * 0.4) - point.nz * along;
          const z = point.z + point.nz * (offset + wobble * 0.4) + point.nx * along;
          if (Math.abs(x) > edgeX || Math.abs(z) > edgeZ) return;
          const leading = row === 0, size = spacing * (leading ? 2.1 : 2.5) * (0.85 + hash(seed + 3) * 0.3);
          const height = (leading ? 2.4 : 3.1) * (0.85 + hash(seed + 5) * 0.3);
          // Heavier than air: it sits on the ground and fills the trenches.
          const y = groundHeight(x, z, map) + height * 0.38 + Math.sin(t * 0.5 + seed) * 0.12;
          front.add(x, y, z, size, height, (hash(seed + 9) - 0.5) * 30, (leading && quality !== "low" ? 0.75 : 0.95) * fade(x, y, z));
        });
      });
    }
    this.hooks.end(this.front);
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
