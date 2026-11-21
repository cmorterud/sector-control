import { expect, it } from "vitest";
import { nearestCandidates } from "./navigation-nearest";
import type { Vec } from "./map";
const reference = (points: Vec[], p: Vec, n: number) =>
  points
    .map((q, i) => ({ i, d: Math.hypot(q.x - p.x, q.z - p.z) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, n);
it("matches the old full-sort candidate list across dense graphs, negative coordinates and off-grid queries", () => {
  const points = Array.from({ length: 1800 }, (_, i) => ({
    x: Math.sin(i * 7.31) * 78,
    z: Math.sin(i * 13.11) * 60,
  }));
  const before = structuredClone(points);
  for (let i = 0; i < 160; i++) {
    const p = { x: Math.sin(i * 43.1) * 80, z: Math.cos(i * 57.3) * 64 };
    expect(nearestCandidates(points, p)).toEqual(reference(points, p, 48));
  }
  expect(points).toEqual(before);
});
it("preserves insertion order at equal-distance boundaries, including duplicate doorway anchors", () => {
  const points = Array.from({ length: 120 }, (_, i) => ({
    x: i % 4 === 0 ? 1 : i % 4 === 1 ? -1 : 0,
    z: i % 4 === 2 ? 1 : i % 4 === 3 ? -1 : 0,
  }));
  for (const n of [0, 1, 7, 48, 120, 200])
    expect(nearestCandidates(points, { x: 0, z: 0 }, n)).toEqual(
      reference(points, { x: 0, z: 0 }, n),
    );
  expect(nearestCandidates([], { x: 0, z: 0 })).toEqual([]);
});
it("finds the same candidates through the cell grid, with heights, ties and points far outside the graph", () => {
  const points: Vec[] = Array.from({ length: 2900 }, (_, i) => ({
    x: Math.round(Math.sin(i * 3.7) * 50) + (i % 3) * 0.5,
    z: Math.round(Math.cos(i * 5.3) * 40),
    ...(i % 5 === 0 ? { y: (i % 7) * 0.6 } : {}),
  }));
  // Exact duplicates tie on distance and must keep index order.
  for (let i = 0; i < 40; i++) points.push({ ...points[i * 11] });
  const full = (p: Vec, n: number) => points
    .map((q, i) => ({ i, d: q.y === undefined ? Math.hypot(q.x - p.x, q.z - p.z) : Math.hypot(q.x - p.x, q.z - p.z, (q.y - (p.y ?? 0)) * 2) }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .slice(0, n);
  const queries: Vec[] = [{ x: 0, z: 0 }, { x: 500, z: -400 }, { x: -49.75, z: 39.9, y: 1.2 }, ...points.slice(0, 60).map((q, i) => ({ x: q.x + (i % 2) * 0.25, z: q.z, y: i % 3 ? undefined : 2 }))];
  for (const p of queries) for (const n of [1, 48, 400])
    expect(nearestCandidates(points, p, n)).toEqual(full(p, n));
});
