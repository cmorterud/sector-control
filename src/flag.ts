// Capture flags: a cloth that hangs from its pole, in dyed-fabric colours that
// sit in each map's light. Presentation only; flag state comes from the game.
import type { MapDefinition } from "./map";

export type FlagState = "neutral" | "blue" | "red" | "contested";
// Cloth dyes: darker than the signal colours a HUD would use, but still strongly
// blue or red, because a soldier reads a flag's side from across a room.
const dyes: Record<FlagState, string> = { neutral: "#a69c80", blue: "#3d86b3", red: "#b6503f", contested: "#c09557" };
// Indoors the only light is a few lanterns, so the same dye would glare.
const tone = (map: Pick<MapDefinition, "fort">) => (map.fort ? 0.85 : 1);
const scaled = (hex: string, k: number) => "#" + [1, 3, 5]
  .map((i) => Math.round(Math.min(255, parseInt(hex.slice(i, i + 2), 16) * k)).toString(16).padStart(2, "0")).join("");
export const flagColor = (state: FlagState, map: Pick<MapDefinition, "fort">) => scaled(dyes[state], tone(map));
// The ring painted on the ground around a flag: the same dye, worn darker.
export const flagRingColor = (state: FlagState, map: Pick<MapDefinition, "fort">) => scaled(dyes[state], tone(map) * 0.72);
// A ring that cannot change hands now (attack and defend's locked phases): grey chalk.
export const lockedRingColor = "#6f6d62";

// A flag in still or light air. `length` runs out from the pole and `height`
// down it; the origin is the top of the hoist. The fly end sinks through `droop`
// degrees and the cloth falls into soft folds that deepen away from the pole.
// Both faces are drawn, each with its own normals.
export function flagCloth(length: number, height: number, droop: number) {
  const columns = 10, rows = 4, positions: number[] = [], normals: number[] = [], indices: number[] = [];
  const point = (u: number, v: number) => {
    // Walk out along the top edge as it curves downward.
    let x = 0, y = 0;
    const steps = 24;
    for (let i = 0; i < steps; i++) {
      const t = ((i + 0.5) / steps) * u, angle = (droop * Math.PI) / 180 * t ** 0.8;
      x += (Math.cos(angle) * length * u) / steps;
      y -= (Math.sin(angle) * length * u) / steps;
    }
    const fold = 0.09 * length * u * Math.sin(u * 7.2 + v * 1.4);
    // The bottom edge gathers slightly toward the pole as the cloth hangs.
    return [x * (1 - 0.12 * v * u), y - v * height, fold];
  };
  for (const side of [1, -1]) {
    const base = positions.length / 3;
    for (let c = 0; c <= columns; c++) for (let r = 0; r <= rows; r++) {
      const u = c / columns, v = r / rows, e = 0.01;
      const p = point(u, v), du = point(Math.min(1, u + e), v), dv = point(u, Math.min(1, v + e));
      const a = u + e > 1 ? point(u - e, v).map((q, i) => p[i] - q) : du.map((q, i) => q - p[i]);
      const b = v + e > 1 ? point(u, v - e).map((q, i) => p[i] - q) : dv.map((q, i) => q - p[i]);
      // Along the cloth crossed with down the cloth points toward -z.
      const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const size = Math.hypot(n[0], n[1], n[2]) || 1;
      positions.push(p[0], p[1], p[2]);
      normals.push((-side * n[0]) / size, (-side * n[1]) / size, (-side * n[2]) / size);
    }
    for (let c = 0; c < columns; c++) for (let r = 0; r < rows; r++) {
      const i = base + c * (rows + 1) + r, j = i + rows + 1;
      if (side > 0) indices.push(i, i + 1, j, j, i + 1, j + 1);
      else indices.push(i, j, i + 1, j, j + 1, i + 1);
    }
  }
  return { positions, normals, indices };
}
