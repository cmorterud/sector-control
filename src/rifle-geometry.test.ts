import { expect, it } from "vitest";
import { detailedRifleParts, detailedBoltParts, rifleGeometry, rifleSurfacePixels, type RifleShape } from "./rifle-geometry";

const shapes: RifleShape[] = ["stock", "handguard", "steel", "barrel", "band", "guard", "hood", "sling", "buttplate", "screw", "knob", "shroud", "notch"];

it("builds finite UV-mapped rifle meshes with outward faces and unit normals", () => {
  for (const shape of shapes) {
    const g = rifleGeometry(shape);
    expect(g.positions.length).toBe(g.normals.length);
    expect(g.uvs.length).toBe(g.positions.length / 3 * 2);
    expect(g.positions.every(v => Number.isFinite(v) && Math.abs(v) <= (shape === "stock" ? 0.751 : 0.601))).toBe(true);
    expect(g.uvs.every(v => Number.isFinite(v) && v >= 0 && v <= 1)).toBe(true);
    for (let i = 0; i < g.normals.length; i += 3)
      expect(Math.hypot(...g.normals.slice(i, i + 3)), `${shape} vertex${i / 3}`).toBeCloseTo(1);
    for (let i = 0; i < g.indices.length; i += 3) {
      const ids = g.indices.slice(i, i + 3);
      expect(ids.every(id => id >= 0 && id < g.positions.length / 3)).toBe(true);
      const [a, b, c] = ids.map(id => g.positions.slice(id * 3, id * 3 + 3));
      const u = b.map((v, j) => v - a[j]), v = c.map((v, j) => v - a[j]);
      const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const normal = [0, 1, 2].map(axis => ids.reduce((sum, id) => sum + g.normals[id * 3 + axis], 0));
      expect(cross.reduce((sum, value, axis) => sum + value * normal[axis], 0), `${shape} triangle${i / 3}`).toBeGreaterThanOrEqual(-1e-10);
    }
  }
});

it("provides roughly four times the previous service-rifle triangles while sharing a bounded catalog", () => {
  // Previous gun-only count: 1,032 triangles (excludes hands and carried clip).
  // Fixed new meshes: front post, magazine, bayonet+guard, trigger, port, safety.
  const fixed = 204;
  const triangles = fixed + detailedRifleParts.reduce((sum, p) => sum + rifleGeometry(p.shape).indices.length / 3, 0)
    + detailedBoltParts.reduce((sum, p) => sum + rifleGeometry(p.shape).indices.length / 3, 0);
  expect(triangles).toBeGreaterThanOrEqual(1032 * 3.8);
  expect(triangles).toBeLessThanOrEqual(1032 * 4.6);
  expect(shapes.length).toBeLessThan(16);
});

it("keeps the trigger guard, front hood and rear V-notch open along their viewing axes", () => {
  for (const shape of ["guard", "hood", "sling"] as const) {
    const g = rifleGeometry(shape);
    for (let i = 0; i < g.positions.length; i += 3)
      expect(Math.hypot(g.positions[i + 1], g.positions[i + 2])).toBeGreaterThan(0.29);
  }
  const notch = rifleGeometry("notch");
  // Every triangle at the center is below the V's root; the aimed ray at
  // local y .343 passes through the cutout, above its .12 root.
  for (let i = 0; i < notch.indices.length; i += 3) {
    const vertices = notch.indices.slice(i, i + 3).map(id => notch.positions.slice(id * 3, id * 3 + 3));
    if (vertices.every(p => Math.abs(p[0]) < 1e-8))
      expect(Math.max(...vertices.map(p => p[1]))).toBeLessThanOrEqual(0.12);
  }
});

it("generates distinct deterministic walnut grain and steel surfaces", () => {
  for (const kind of ["walnut", "steel"] as const) {
    const a = rifleSurfacePixels(kind, 32), b = rifleSurfacePixels(kind, 32);
    expect(a).toEqual(b);
    expect(a.length).toBe(32 * 32 * 4);
    expect(new Set(a.filter((_, i) => i % 4 === 0)).size).toBeGreaterThan(8);
    expect(a.every((v, i) => i % 4 !== 3 || v === 255)).toBe(true);
  }
  expect(rifleSurfacePixels("walnut", 32)).not.toEqual(rifleSurfacePixels("steel", 32));
});
