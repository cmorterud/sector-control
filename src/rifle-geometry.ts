import { characterGeometry } from "./character-geometry";

type MeshData = ReturnType<typeof characterGeometry> & { uvs: number[] };
type Ring = [number, number, number, number?];
export type RifleShape = "stock" | "handguard" | "steel" | "barrel" |
  "band" | "guard" | "hood" | "sling" | "buttplate" | "screw" | "knob" | "shroud" | "notch";

// These profiles describe the furniture and machined parts, independently of
// the inexpensive cloth/limb meshes. All meshes are shared by every rifle.
function lathe(profile: Ring[], sides: number, caps = true): MeshData {
  const positions: number[] = [], normals: number[] = [], indices: number[] = [], uvs: number[] = [];
  for (let ring = 0; ring < profile.length; ring++) {
    const [y, rx, rz, offset = 0] = profile[ring];
    const before = profile[Math.max(0, ring - 1)], after = profile[Math.min(profile.length - 1, ring + 1)];
    const dy = after[0] - before[0], dx = after[1] - before[1], dz = after[2] - before[2];
    const center = (after[3] ?? 0) - (before[3] ?? 0);
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * Math.PI * 2, c = Math.cos(angle), s = Math.sin(angle);
      positions.push(rx * c, y, offset + rz * s);
      const nx = dy * rz * c, ny = -(dx * rz * c * c + rx * (center + dz * s) * s), nz = dy * rx * s;
      const length = Math.hypot(nx, ny, nz) || 1;
      normals.push(nx / length, ny / length, nz / length);
      uvs.push(side / sides, ring / (profile.length - 1));
      if (ring && side < sides) {
        const a = (ring - 1) * (sides + 1) + side, d = ring * (sides + 1) + side;
        indices.push(a, d, d + 1, a, d + 1, a + 1);
      }
    }
  }
  if (caps) for (const end of [0, profile.length - 1]) {
    const [y, rx, rz, offset = 0] = profile[end], sign = end ? 1 : -1;
    const base = positions.length / 3;
    positions.push(0, y, offset); normals.push(0, sign, 0); uvs.push(0.5, 0.5);
    for (let side = 0; side <= sides; side++) {
      const a = side / sides * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      positions.push(rx * c, y, offset + rz * s); normals.push(0, sign, 0); uvs.push(0.5 + c * 0.5, 0.5 + s * 0.5);
      if (side < sides) indices.push(base, base + 1 + side + (end ? 1 : 0), base + 1 + side + (end ? 0 : 1));
    }
  }
  return { positions, normals, indices, uvs };
}

function merge(meshes: MeshData[]): MeshData {
  const result: MeshData = { positions: [], normals: [], indices: [], uvs: [] };
  for (const mesh of meshes) {
    const offset = result.positions.length / 3;
    result.indices.push(...mesh.indices.map(i => i + offset));
    result.positions.push(...mesh.positions); result.normals.push(...mesh.normals); result.uvs.push(...mesh.uvs);
  }
  return result;
}

// Open elliptical loops: a real trigger guard, sling swivel and sight hood.
function loop(segments: number, tubeSides: number, thickness: number): MeshData {
  const positions: number[] = [], normals: number[] = [], indices: number[] = [], uvs: number[] = [];
  for (let i = 0; i <= segments; i++) for (let j = 0; j <= tubeSides; j++) {
    const a = i / segments * Math.PI * 2, b = j / tubeSides * Math.PI * 2;
    const radius = 0.5 - thickness + thickness * Math.cos(b);
    positions.push(0.5 * Math.sin(b), radius * Math.cos(a), radius * Math.sin(a));
    const nx = 2 * Math.sin(b), ny = Math.cos(b) * Math.cos(a) / thickness, nz = Math.cos(b) * Math.sin(a) / thickness;
    const length = Math.hypot(nx, ny, nz);
    normals.push(nx / length, ny / length, nz / length); uvs.push(i / segments, j / tubeSides);
    if (i < segments && j < tubeSides) {
      const a = i * (tubeSides + 1) + j, d = a + tubeSides + 1;
      indices.push(a, d, d + 1, a, d + 1, a + 1);
    }
  }
  return { positions, normals, indices, uvs };
}

export function rifleGeometry(shape: RifleShape): MeshData {
  if (shape === "notch") {
    const result: MeshData = { positions: [], normals: [], indices: [], uvs: [] };
    for (const sign of [-1, 1]) {
      const polygon = [[-0.5, -0.5], [0, -0.5], [0, 0.12], [-0.18, 0.5], [-0.5, 0.5]].map(([x, y]) => [x * sign, y]);
      if (sign < 0) polygon.reverse();
      for (const side of [-1, 1]) {
        const base = result.positions.length / 3;
        for (const [x, y] of polygon) { result.positions.push(x, y, side * 0.5); result.normals.push(0, 0, side); result.uvs.push(x + 0.5, y + 0.5); }
        for (let i = 1; i < polygon.length - 1; i++) result.indices.push(base, base + i + (side < 0 ? 1 : 0), base + i + (side < 0 ? 0 : 1));
      }
      for (let i = 0; i < polygon.length; i++) {
        const [x, y] = polygon[i], [a, b] = polygon[(i + 1) % polygon.length];
        const base = result.positions.length / 3, length = Math.hypot(a - x, b - y);
        for (const [u, v, z] of [[x, y, -0.5], [a, b, -0.5], [a, b, 0.5], [x, y, 0.5]]) {
          result.positions.push(u, v, z); result.normals.push((b - y) / length, (x - a) / length, 0); result.uvs.push(u + 0.5, v + 0.5);
        }
        result.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
    return result;
  }
  if (shape === "stock") return lathe([
    [-0.5, 0.25, 0.20, -0.08], [-0.47, 0.34, 0.23, -0.07],
    [-0.3, 0.40, 0.24, -0.04], [-0.12, 0.43, 0.27, -0.02],
    [0.06, 0.43, 0.29], [0.15, 0.29, 0.24, 0.04],
    [0.23, 0.26, 0.24, 0.08], [0.30, 0.34, 0.36, 0.10],
    [0.40, 0.48, 0.48, 0.20], [0.48, 0.50, 0.50, 0.25], [0.50, 0.47, 0.47, 0.25],
  ], 24);
  if (shape === "handguard") return lathe([
    [-0.5, 0.30, 0.30], [-0.44, 0.45, 0.43], [0, 0.50, 0.50],
    [0.44, 0.45, 0.43], [0.5, 0.30, 0.30],
  ], 16);
  if (shape === "buttplate") return lathe([
    [-0.5, 0.43, 0.43], [-0.25, 0.5, 0.5], [0.25, 0.5, 0.5], [0.5, 0.43, 0.43],
  ], 16);
  if (shape === "guard") return loop(24, 4, 0.08);
  if (shape === "hood") return loop(24, 4, 0.065);
  if (shape === "sling") return loop(16, 4, 0.1);
  if (shape === "barrel") {
    const outside = lathe([[-0.5, 0.42, 0.42], [-0.44, 0.45, 0.45], [-0.25, 0.5, 0.5], [0.5, 0.5, 0.5]], 32, false);
    const mouth = lathe([[-0.5, 0.17, 0.17], [-0.5, 0.42, 0.42]], 32, false);
    const inside = lathe([[-0.5, 0.17, 0.17], [-0.35, 0.17, 0.17]], 32, false);
    inside.normals = inside.normals.map(n => -n);
    for (let i = 0; i < inside.indices.length; i += 3)
      [inside.indices[i + 1], inside.indices[i + 2]] = [inside.indices[i + 2], inside.indices[i + 1]];
    return merge([outside, mouth, inside]);
  }
  const sides = shape === "screw" ? 12 : shape === "shroud" ? 20 : 32;
  const data = characterGeometry(shape === "knob" ? "soft" : "disc", sides);
  return { ...data, uvs: data.positions.flatMap((_, i, all) => i % 3 ? [] : [Math.atan2(all[i + 2], all[i]) / (2 * Math.PI) + 0.5, all[i + 1] + 0.5]) };
}

export type RiflePart = { name: string; shape: RifleShape; at: [number, number, number]; size: [number, number, number]; tint: string; rotation?: [number, number, number] };
export const detailedRifleParts: RiflePart[] = [
  { name: "wooden stock", shape: "stock", at: [0, -0.045, 0.04], size: [0.105, 0.94, 0.18], tint: "walnut", rotation: [90, 0, 0] },
  { name: "upper handguard", shape: "handguard", at: [0, 0.022, -0.27], size: [0.072, 0.28, 0.042], tint: "walnut", rotation: [90, 0, 0] },
  { name: "receiver", shape: "steel", at: [0, 0.025, 0.04], size: [0.075, 0.34, 0.075], tint: "steel", rotation: [90, 0, 0] },
  { name: "barrel", shape: "barrel", at: [0, 0.025, -0.53], size: [0.04, 0.34, 0.04], tint: "steel", rotation: [90, 0, 0] },
  ...[-0.35, -0.13].map(z => ({ name: "barrel band", shape: "band" as const, at: [0, -0.018, z] as [number, number, number], size: [0.105, 0.024, 0.13] as [number, number, number], tint: "steel", rotation: [90, 0, 0] as [number, number, number] })),
  { name: "open trigger guard", shape: "guard", at: [0, -0.105, 0.18], size: [0.012, 0.09, 0.14], tint: "steel" },
  { name: "buttplate", shape: "buttplate", at: [0, -0.09, 0.514], size: [0.101, 0.012, 0.173], tint: "steel", rotation: [90, 0, 0] },
  { name: "front sight hood", shape: "hood", at: [0, 0.115, -0.65], size: [0.018, 0.065, 0.065], tint: "steel", rotation: [0, 90, 0] },
  { name: "front sight base", shape: "buttplate", at: [0, 0.058, -0.65], size: [0.032, 0.035, 0.045], tint: "steel" },
  { name: "V-notch rear sight", shape: "notch", at: [0, 0.1005, 0.08], size: [0.075, 0.035, 0.04], tint: "steel" },
  { name: "rear sight base", shape: "buttplate", at: [0, 0.074, 0.08], size: [0.055, 0.025, 0.085], tint: "steel" },
  { name: "sling swivel", shape: "sling", at: [0, -0.1, -0.35], size: [0.01, 0.036, 0.05], tint: "steel" },
  ...[-0.09, 0.25].map(z => ({ name: "stock screw", shape: "screw" as const, at: [z > 0.2 ? 0.029 : 0.045, -0.06, z] as [number, number, number], size: [0.021, 0.005, 0.021] as [number, number, number], tint: "edge", rotation: [0, 0, 90] as [number, number, number] })),
];
export const boltGrip = { x: 0.105, y: -0.055, z: 0 };
export const detailedBoltParts: RiflePart[] = [
  { name: "bolt handle", shape: "steel", at: [0.025, 0, 0], size: [0.016, 0.055, 0.016], tint: "steel", rotation: [0, 0, -90] },
  { name: "bolt handle bend", shape: "shroud", at: [0.078, -0.028, 0], size: [0.014, 0.08, 0.014], tint: "steel", rotation: [0, 0, -132] },
  { name: "bolt knob", shape: "knob", at: [boltGrip.x, boltGrip.y, boltGrip.z], size: [0.045, 0.045, 0.045], tint: "steel" },
  { name: "bolt shroud", shape: "shroud", at: [-0.05, 0.005, 0.095], size: [0.06, 0.07, 0.06], tint: "steel", rotation: [90, 0, 0] },
];

// Deterministic close-up materials; no photos or simulation RNG are consumed.
export function rifleSurfacePixels(kind: "walnut" | "steel", size = 128) {
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const hash = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    const noise = hash - Math.floor(hash);
    const grain = Math.sin(x * 0.72 + Math.sin(y * 0.04) * 2 + Math.sin(x * 0.12 + y * 0.018));
    const shade = kind === "walnut" ? 0.86 + grain * 0.09 + noise * 0.05 : 0.92 + noise * 0.06 + Math.sin(y * 1.9) * 0.02;
    const base = kind === "walnut" ? [112, 65, 34] : [82, 89, 87];
    pixels.set([...base.map(c => Math.round(c * shade)), 255], (y * size + x) * 4);
  }
  return pixels;
}
