import { expect, it } from "vitest";
import { boundaryWireGeometry, boundaryWireLayout } from "./boundary-wire";
import { beyondPlayArea, groundHeight, industrialMap, playArea } from "./map";
import { trenchMap } from "./trench-map";

const wire = boundaryWireGeometry(trenchMap);

it("builds no wire on a map without a boundary", () => {
  const none = boundaryWireGeometry(industrialMap);
  expect(none.lines.length + none.pickets.positions.length).toBe(0);
});

it("keeps every picket and wire inside the boundary belt", () => {
  const depth = trenchMap.boundary!.wireDepth;
  for (const b of wire.pickets.bases) {
    const beyond = beyondPlayArea(b.x, b.z, trenchMap);
    expect(beyond).toBeGreaterThan(0);
    expect(beyond).toBeLessThan(depth);
    expect(b.y).toBeCloseTo(groundHeight(b.x, b.z, trenchMap), 5);
  }
  for (let i = 0; i < wire.lines.length; i += 3) {
    const beyond = beyondPlayArea(wire.lines[i], wire.lines[i + 2], trenchMap);
    expect(beyond).toBeGreaterThan(0);
    expect(beyond).toBeLessThan(depth);
  }
});

it("closes all four edges with pickets no further apart than the layout spacing", () => {
  const area = playArea(trenchMap);
  for (const [axis, side] of [["x", -1], ["x", 1], ["z", -1], ["z", 1]] as const) {
    const edge = (axis === "x" ? area.width : area.depth) / 2;
    const along = wire.pickets.bases
      .filter((b) => Math.abs((axis === "x" ? b.x : b.z) - side * (edge + boundaryWireLayout.rows[0])) < 0.01)
      .map((b) => (axis === "x" ? b.z : b.x))
      .sort((a, b) => a - b);
    const half = (axis === "x" ? area.depth : area.width) / 2;
    expect(along[0]).toBeLessThan(-half);
    expect(along.at(-1)!).toBeGreaterThan(half);
    for (let i = 1; i < along.length; i++)
      expect(along[i] - along[i - 1]).toBeLessThanOrEqual(boundaryWireLayout.picketSpacing + 1e-6);
  }
});

it("winds every picket face outward and stays within its vertex budget", () => {
  const { positions, normals, indices } = wire.pickets;
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [indices[i], indices[i + 1], indices[i + 2]].map((k) => [0, 1, 2].map((j) => positions[k * 3 + j]));
    const u = [0, 1, 2].map((j) => b[j] - a[j]), v = [0, 1, 2].map((j) => c[j] - a[j]);
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const n = [0, 1, 2].map((j) => normals[indices[i] * 3 + j]);
    expect(cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2]).toBeGreaterThan(0);
  }
  expect(positions.length / 3).toBeLessThan(16_000);
  expect(wire.lines.length / 3).toBeLessThan(140_000);
});
