import type { Vec } from "./map";

export interface CraterShape {
  radiusX: number;
  radiusZ: number;
  rotation: number;
  offsetX: number;
  offsetZ: number;
  depth: number;
  roughness: number;
  phase: number;
  reach: number;
}

// Local terrain randomness never advances the combat/scatter random stream.
export function craterShape(
  at: Vec,
  ordinal: number,
  radius: number,
  depth: number,
  variation: number,
): CraterShape {
  let seed =
    (Math.imul(Math.round(at.x * 128), 73856093) ^
      Math.imul(Math.round(at.z * 128), 19349663) ^
      Math.imul(ordinal, 83492791)) >>>
    0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const size = 1 + (random() - 0.5) * variation * 1.2;
  const aspect = 1 + (random() - 0.5) * variation * 1.4;
  const shape = {
    radiusX: radius * size * aspect,
    radiusZ: (radius * size) / aspect,
    rotation: random() * Math.PI * 2,
    offsetX: (random() - 0.5) * radius * variation * 0.8,
    offsetZ: (random() - 0.5) * radius * variation * 0.8,
    depth: depth * (1 + (random() - 0.4) * variation * 1.4),
    roughness: variation * (0.2 + random() * 0.2),
    phase: random() * Math.PI * 2,
    reach: 0,
  };
  shape.reach =
    Math.max(shape.radiusX, shape.radiusZ) * (1 + shape.roughness * 1.6) +
    Math.hypot(shape.offsetX, shape.offsetZ);
  return shape;
}

// Smooth lobes give a broken, asymmetric rim without noisy stair-step terrain.
export function craterSampler(shape: CraterShape) {
  const c = Math.cos(shape.rotation),
    s = Math.sin(shape.rotation);
  return (dx: number, dz: number) => {
    const x = dx - shape.offsetX,
      z = dz - shape.offsetZ;
    const u = (x * c + z * s) / shape.radiusX;
    const v = (-x * s + z * c) / shape.radiusZ;
    const angle = Math.atan2(v, u);
    const rim =
      1 +
      shape.roughness *
        (Math.sin(angle * 3 + shape.phase) +
          0.6 * Math.sin(angle * 5 - shape.phase * 0.7));
    return Math.hypot(u, v) / rim;
  };
}
