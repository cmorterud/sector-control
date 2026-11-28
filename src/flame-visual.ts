import type { FxQuads } from "./fx-quads";
import { flashFrames, hash } from "./muzzle-blast";
import type { V3 } from "./simulation";

export interface FlameJet {
  from: V3;
  to: V3;
  age: number;
  elapsed: number;
  seed: number;
  impact: boolean;
}

export const flameVisual = { release: 0.23, streams: 4, quadsPerStream: 26 };

export function drawFlameJet(quads: FxQuads, jet: FlameJet, sparse: boolean) {
  const { from, to, age, elapsed, seed, impact } = jet;
  const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  if (length < 0.04 || age >= flameVisual.release) return;
  const dx = (to.x - from.x) / length, dy = (to.y - from.y) / length, dz = (to.z - from.z) / length;
  const horizontal = Math.hypot(dx, dz) || 1;
  const sx = -dz / horizontal, sz = dx / horizontal;
  const ux = -dy * sz, uy = horizontal, uz = dy * sx;
  const head = Math.min(length, elapsed * 65);
  const fade = Math.min(1, (flameVisual.release - age) / 0.11);
  const phase = elapsed * 16 + hash(seed) * Math.PI * 2;
  const spacing = sparse ? 2.2 : 1.65;
  const scroll = (elapsed * 12) % spacing;
  // Overlapping tongues are stretched down the jet, then widen into the plume.
  for (let i = -1; i * spacing + scroll < head; i++) {
    const start = Math.max(0, i * spacing + scroll), end = Math.min(head, (i + 1.8) * spacing + scroll);
    const t = (start + end) / (2 * length);
    const side = Math.sin(phase - t * 12) * t * 0.24;
    const rise = (0.14 + Math.sin(phase * 0.8 - t * 9) * 0.13) * t;
    const width = (0.38 + 2 * t ** 0.8) * (0.92 + Math.sin(phase + i * 1.8) * 0.14);
    const hot = (0.57 + (1 - t) * 0.17) * fade;
    const frame = flashFrames.jet[(i + 1 + seed) % flashFrames.jet.length];
    quads.axial(from.x + dx * start + sx * side + ux * rise, from.y + dy * start + uy * rise,
      from.z + dz * start + sz * side + uz * rise, dx, dy, dz, end - start, width, frame,
      hot, hot * (0.9 - t * 0.23), hot * (0.73 - t * 0.39));
  }
  // The axial sheets are narrow when seen along the barrel. Add tumbling,
  // irregular billows so the widening plume also reads from that angle.
  const billows = sparse ? 4 : 6;
  const stride = (elapsed * 5.5) % 1;
  for (let i = 0; i < billows; i++) {
    const t = (i + stride) / billows, distance = t * length;
    if (distance > head) continue;
    const spread = t * Math.min(length / 8, 1);
    const side = Math.sin(phase - t * 10) * spread * 0.46;
    const rise = (0.40 + Math.sin(phase * 0.7 - t * 13) * 0.25) * spread;
    const size = 0.24 + 2.55 * spread ** 0.85;
    const frame = flashFrames.blast[(seed + i * 3) % flashFrames.blast.length];
    const hot = (0.44 + 0.22 * t) * fade;
    quads.sprite(from.x + dx * distance + sx * side + ux * rise, from.y + dy * distance + uy * rise,
      from.z + dz * distance + sz * side + uz * rise, size, size * 0.82, phase * 0.19 + i * 2.1, frame,
      hot, hot * (0.9 - t * 0.22), hot * (0.61 - t * 0.34));
  }
  // Tiny sparks break away from the jet as they travel.
  for (let i = 0; i < (sparse ? 4 : 8); i++) {
    const t = (elapsed * (1.4 + hash(seed, i) * 1.6) + hash(seed, i + 10)) % 1;
    const distance = t * length;
    if (distance > head) continue;
    const side = (hash(seed, i + 20) - 0.5) * t * 1.9;
    const rise = hash(seed, i + 30) * t * 0.8;
    const size = 0.10 + hash(seed, i + 40) * 0.13;
    const glow = Math.sin(t * Math.PI) * fade;
    quads.sprite(from.x + dx * distance + sx * side + ux * rise, from.y + dy * distance + uy * rise,
      from.z + dz * distance + sz * side + uz * rise, size, size, 0, flashFrames.spark,
      glow, glow * 0.62, glow * 0.29);
  }
  if (impact && head === length) {
    const spread = Math.min(1.4, length * 0.42) * (0.9 + 0.15 * Math.sin(phase));
    const glow = fade * 0.5;
    quads.sprite(to.x - dx * 0.06, to.y - dy * 0.06, to.z - dz * 0.06,
      spread, spread, 0, flashFrames.glow, glow, glow * 0.58, glow * 0.28);
  }
}
