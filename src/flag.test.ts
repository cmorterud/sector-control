import { expect, it } from "vitest";
import { flagCloth, flagColor, flagRingColor, type FlagState } from "./flag";

const states: FlagState[] = ["neutral", "blue", "red", "contested"];
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (hex: string) => { const [r, g, b] = rgb(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const saturation = (hex: string) => { const c = rgb(hex), max = Math.max(...c), min = Math.min(...c); return max ? (max - min) / max : 0; };
// What the flags were painted before: bright signal colours.
const before: Record<FlagState, string> = { neutral: "#d4c699", blue: "#46a9d8", red: "#de6e5f", contested: "#edc76d" };

it("dyes flags in muted colours that still tell the states apart", () => {
  for (const fort of [undefined, {}] as const) {
    const map = { fort } as Parameters<typeof flagColor>[1];
    for (const state of states) {
      const cloth = flagColor(state, map);
      expect(cloth).toMatch(/^#[0-9a-f]{6}$/);
      // Darker than the old paint.
      expect(luminance(cloth)).toBeLessThan(luminance(before[state]) * 0.82);
      // The ground ring is the same dye, darker again.
      expect(luminance(flagRingColor(state, map))).toBeLessThan(luminance(cloth) * 0.8);
    }
    // A side's flag stays plainly its colour; an unclaimed one stays plainly neither.
    expect(saturation(flagColor("blue", map))).toBeGreaterThan(0.6);
    expect(saturation(flagColor("red", map))).toBeGreaterThan(0.6);
    expect(saturation(flagColor("neutral", map))).toBeLessThan(0.3);
    for (const a of states) for (const b of states) {
      if (a >= b) continue;
      const p = rgb(flagColor(a, map)), q = rgb(flagColor(b, map));
      expect(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]), `${a} against ${b}`).toBeGreaterThan(35);
    }
  }
  // Under the fort's lanterns the same cloth is dimmer than in daylight.
  expect(luminance(flagColor("blue", { fort: {} } as never))).toBeLessThan(luminance(flagColor("blue", {})));
});

it("hangs the cloth from the hoist, drooping and folded, with both faces lit", () => {
  const length = 1.3, height = 0.75;
  for (const droop of [30, 66]) {
    const { positions, normals, indices } = flagCloth(length, height, droop);
    const count = positions.length / 3;
    expect(indices.every((i) => i >= 0 && i < count)).toBe(true);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, maxZ = 0;
    for (let i = 0; i < positions.length; i += 3) {
      minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
      minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1]);
      maxZ = Math.max(maxZ, Math.abs(positions[i + 2]));
    }
    // The hoist edge lies on the pole, from the top down by the flag's height.
    expect(minX).toBeCloseTo(0, 6);
    expect(maxY).toBeCloseTo(0, 6);
    const hoist = [];
    for (let i = 0; i < positions.length; i += 3) if (Math.abs(positions[i]) < 1e-9) hoist.push(positions[i + 1], positions[i + 2]);
    expect(hoist.length).toBeGreaterThanOrEqual(10);
    for (let i = 0; i < hoist.length; i += 2) { expect(hoist[i]).toBeGreaterThanOrEqual(-height - 1e-9); expect(hoist[i + 1]).toBeCloseTo(0, 6); }
    // The fly end sinks below a flat flag's bottom edge and never reaches full length.
    expect(minY).toBeLessThan(-height - 0.2);
    expect(maxX).toBeLessThan(length);
    expect(maxX).toBeGreaterThan(length * 0.45);
    expect(maxZ).toBeGreaterThan(0.03);
    // Every triangle's winding agrees with the normals stored at its corners.
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = [0, 1, 2].map((n) => indices[i + n] * 3);
      const u = [0, 1, 2].map((k) => positions[b + k] - positions[a + k]), v = [0, 1, 2].map((k) => positions[c + k] - positions[a + k]);
      const face = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      for (const corner of [a, b, c]) {
        expect(face[0] * normals[corner] + face[1] * normals[corner + 1] + face[2] * normals[corner + 2]).toBeGreaterThan(0);
      }
    }
  }
  // A steeper droop hangs lower and reaches less far out.
  const light = flagCloth(length, height, 30).positions, limp = flagCloth(length, height, 66).positions;
  const reach = (p: number[]) => Math.max(...p.filter((_, i) => i % 3 === 0));
  expect(reach(limp)).toBeLessThan(reach(light));
});
