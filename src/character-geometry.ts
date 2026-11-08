export type CharacterShape =
  "soft" | "limb" | "tunic" | "head" | "helmet" | "disc" | "stock";
type Ring = [number, number, number];
const profiles: Record<CharacterShape, Ring[]> = {
  soft: [
    [-0.5, 0, 0],
    [-0.43, 0.3, 0.3],
    [-0.25, 0.44, 0.44],
    [0, 0.5, 0.5],
    [0.25, 0.44, 0.44],
    [0.43, 0.3, 0.3],
    [0.5, 0, 0],
  ],
  limb: [
    [-0.5, 0.34, 0.36],
    [-0.35, 0.38, 0.4],
    [0.18, 0.5, 0.5],
    [0.42, 0.48, 0.48],
    [0.5, 0.43, 0.43],
  ],
  tunic: [
    [-0.5, 0.42, 0.44],
    [-0.41, 0.5, 0.49],
    [-0.16, 0.4, 0.42],
    [0.18, 0.48, 0.49],
    [0.35, 0.5, 0.45],
    [0.48, 0.32, 0.33],
    [0.5, 0.25, 0.28],
  ],
  head: [
    [-0.5, 0.23, 0.28],
    [-0.34, 0.37, 0.41],
    [0, 0.5, 0.5],
    [0.29, 0.47, 0.47],
    [0.46, 0.3, 0.32],
    [0.5, 0, 0],
  ],
  helmet: [
    [-0.5, 0.47, 0.47],
    [-0.3, 0.5, 0.5],
    [0, 0.44, 0.44],
    [0.3, 0.32, 0.32],
    [0.5, 0, 0],
  ],
  disc: [
    [-0.5, 0, 0],
    [-0.5, 0.45, 0.45],
    [-0.3, 0.5, 0.5],
    [0.3, 0.5, 0.5],
    [0.5, 0.45, 0.45],
    [0.5, 0, 0],
  ],
  stock: [
    [-0.5, 0.2, 0.22],
    [-0.43, 0.25, 0.27],
    [0.06, 0.31, 0.3],
    [0.2, 0.26, 0.32],
    [0.35, 0.46, 0.49],
    [0.5, 0.46, 0.49],
  ],
};
// Shared low-resolution elliptical rings give cloth and limbs curved silhouettes
// and smooth normals without expensive default sphere meshes on every soldier.
export function characterGeometry(shape: CharacterShape, sides = 10) {
  const profile = profiles[shape],
    positions: number[] = [],
    normals: number[] = [],
    indices: number[] = [];
  for (let ring = 0; ring < profile.length; ring++) {
    const [y, rx, rz] = profile[ring],
      before = profile[Math.max(0, ring - 1)],
      after = profile[Math.min(profile.length - 1, ring + 1)];
    const dy = after[0] - before[0] || 1,
      dx = (after[1] - before[1]) / dy,
      dz = (after[2] - before[2]) / dy;
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * Math.PI * 2,
        c = Math.cos(a),
        sn = Math.sin(a);
      positions.push(rx * c, y, rz * sn);
      const nx = rz * c,
        ny = -(dx * rz * c * c + dz * rx * sn * sn),
        nz = rx * sn,
        n = Math.hypot(nx, ny, nz);
      normals.push(n ? nx / n : 0, n ? ny / n : ring ? 1 : -1, n ? nz / n : 0);
      if (ring && s < sides) {
        const a = (ring - 1) * (sides + 1) + s,
          b = a + 1,
          d = ring * (sides + 1) + s,
          c = d + 1;
        indices.push(a, d, c, a, c, b);
      }
    }
  }
  for (const end of [0, profile.length - 1]) {
    const [y, rx, rz] = profile[end];
    if (!rx || !rz) continue;
    const center = positions.length / 3,
      sign = end ? 1 : -1;
    positions.push(0, y, 0);
    normals.push(0, sign, 0);
    for (let side = 0; side <= sides; side++) {
      const a = (side / sides) * Math.PI * 2;
      positions.push(rx * Math.cos(a), y, rz * Math.sin(a));
      normals.push(0, sign, 0);
      if (side < sides)
        indices.push(
          center,
          center + 1 + side + (end ? 1 : 0),
          center + 1 + side + (end ? 0 : 1),
        );
    }
  }
  return { positions, normals, indices };
}
