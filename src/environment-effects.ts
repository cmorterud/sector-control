import type { V3 } from "./simulation";

export const treeFallTime = 0.95;
export const treeSettleTime = 0.3;
export const maxFallingTrees = 8;
export const maxDebris = 192;

// Accelerate under the tree's weight, then rebound once without penetrating soil.
export function treeFallPose(age: number) {
  const t = Math.max(0, Math.min(1, age / treeFallTime));
  const bounce = Math.max(
    0,
    Math.min(1, (age - treeFallTime) / treeSettleTime),
  );
  return {
    angle: 90 * t ** 2.1 - Math.sin(bounce * Math.PI) * 3.5 * (1 - bounce),
    blend: t * t * (3 - 2 * t),
    landed: age >= treeFallTime,
    finished: age >= treeFallTime + treeSettleTime,
  };
}

export type DebrisKind = "earth" | "wood" | "leaf";
export type Debris = {
  at: V3;
  velocity: V3;
  rotation: V3;
  spin: V3;
  size: V3;
  kind: DebrisKind;
  age: number;
  life: number;
  resting: boolean;
};

export function debrisPiece(at: V3, kind: DebrisKind, seed: number): Debris {
  let n = seed + 1;
  const random = () => {
    const value = Math.sin(n++ * 127.1) * 43758.5453;
    return value - Math.floor(value);
  };
  const angle = random() * Math.PI * 2;
  const speed = 1.5 + random() * (kind === "leaf" ? 2 : 4);
  return {
    at: { ...at },
    velocity: {
      x: Math.cos(angle) * speed,
      y: 1.4 + random() * 4,
      z: Math.sin(angle) * speed,
    },
    rotation: { x: random() * 180, y: random() * 180, z: random() * 180 },
    spin: {
      x: random() * 360 - 180,
      y: random() * 360 - 180,
      z: random() * 360 - 180,
    },
    size:
      kind === "wood"
        ? {
            x: 0.06 + random() * 0.06,
            y: 0.2 + random() * 0.4,
            z: 0.05 + random() * 0.05,
          }
        : kind === "leaf"
          ? { x: 0.12 + random() * 0.1, y: 0.025, z: 0.08 + random() * 0.08 }
          : {
              x: 0.1 + random() * 0.13,
              y: 0.08 + random() * 0.12,
              z: 0.1 + random() * 0.13,
            },
    kind,
    age: 0,
    life: kind === "wood" ? 3.8 : kind === "leaf" ? 4.2 : 2.6,
    resting: false,
  };
}

export function advanceDebris(
  piece: Debris,
  dt: number,
  ground: (x: number, z: number) => number,
) {
  const steps = Math.max(1, Math.ceil(Math.min(0.1, dt) / (1 / 120)));
  const h = Math.min(0.1, Math.max(0, dt)) / steps;
  if (dt <= 0) return Math.max(0, Math.min(1, (piece.life - piece.age) / 0.45));
  for (let i = 0; i < steps; i++) {
    const radius =
      piece.resting && piece.kind === "wood"
        ? Math.max(piece.size.x, piece.size.z) / 2
        : piece.resting && piece.kind === "leaf"
          ? piece.size.y / 2
          : Math.max(piece.size.x, piece.size.y, piece.size.z) / 2;
    piece.age += h;
    const floor = ground(piece.at.x, piece.at.z) + radius;
    if (piece.resting && piece.at.y > floor + 0.03) piece.resting = false;
    if (piece.resting) {
      piece.at.y = floor;
      continue;
    }
    const drag = Math.exp(-(piece.kind === "leaf" ? 1.8 : 0.35) * h);
    piece.velocity.x *= drag;
    piece.velocity.z *= drag;
    piece.velocity.y -= (piece.kind === "leaf" ? 3.2 : 10) * h;
    const x = piece.at.x + piece.velocity.x * h,
      z = piece.at.z + piece.velocity.z * h;
    const nextFloor = ground(x, z) + radius;
    if (nextFloor > piece.at.y + 0.06) {
      piece.velocity.x *= -0.25;
      piece.velocity.z *= -0.25;
    } else {
      piece.at.x = x;
      piece.at.z = z;
    }
    piece.at.y += piece.velocity.y * h;
    const surface = ground(piece.at.x, piece.at.z) + radius;
    if (piece.at.y <= surface) {
      piece.at.y = surface;
      piece.velocity.y =
        Math.abs(piece.velocity.y) * (piece.kind === "wood" ? 0.28 : 0.16);
      piece.velocity.x *= 0.5;
      piece.velocity.z *= 0.5;
      piece.spin.x *= 0.4;
      piece.spin.y *= 0.4;
      piece.spin.z *= 0.4;
      if (piece.velocity.y < 0.45) {
        piece.resting = true;
        piece.velocity = { x: 0, y: 0, z: 0 };
        piece.spin = { x: 0, y: 0, z: 0 };
        if (piece.kind === "wood") {
          piece.rotation.x = 90;
          piece.rotation.z = 0;
          piece.at.y =
            ground(piece.at.x, piece.at.z) +
            Math.max(piece.size.x, piece.size.z) / 2;
        } else if (piece.kind === "leaf") {
          piece.rotation.x = piece.rotation.z = 0;
          piece.at.y = ground(piece.at.x, piece.at.z) + piece.size.y / 2;
        }
      }
    }
    for (const axis of ["x", "y", "z"] as const)
      piece.rotation[axis] += piece.spin[axis] * h;
  }
  return Math.max(0, Math.min(1, (piece.life - piece.age) / 0.45));
}
