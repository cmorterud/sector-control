import { expect, it } from "vitest";
import { searchGraph } from "./navigation-search";
import { dist, type Vec } from "./map";

// The search pathfind used before: the open set is a Set scanned in full for
// the lowest score, the first in Set order winning a tie.
function reference(nodes: Vec[], edges: number[][], start: number, goal: number, extra?: (a: Vec, b: Vec) => number) {
  const open = new Set([start]), came = new Map<number, number>(), cost = new Map([[start, 0]]);
  while (open.size) {
    let u = -1, best = Infinity;
    for (const index of open) {
      const score = cost.get(index)! + dist(nodes[index], nodes[goal]);
      if (score < best) { best = score; u = index; }
    }
    if (u === goal) {
      const out = [u];
      while (came.has(u)) { u = came.get(u)!; out.push(u); }
      return out.reverse();
    }
    open.delete(u);
    for (const v of edges[u]) {
      const next = cost.get(u)! + dist(nodes[u], nodes[v]) + (extra ? extra(nodes[u], nodes[v]) : 0);
      if (next < (cost.get(v) ?? Infinity)) { came.set(v, u); cost.set(v, next); open.add(v); }
    }
  }
  return undefined;
}
// A square lattice is full of equal-cost routes, so it exercises tie order.
function lattice(size: number, holes: (x: number, z: number) => boolean, diagonals: boolean) {
  const nodes: Vec[] = [], index = new Map<string, number>();
  for (let x = 0; x < size; x++)
    for (let z = 0; z < size; z++)
      if (!holes(x, z)) { index.set(`${x},${z}`, nodes.length); nodes.push({ x: x * 2.5 - 30, z: z * 2.5 - 30 }); }
  const steps = diagonals ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const edges = nodes.map((n) => {
    const x = Math.round((n.x + 30) / 2.5), z = Math.round((n.z + 30) / 2.5);
    return steps.map(([dx, dz]) => index.get(`${x + dx},${z + dz}`)).filter((i): i is number => i !== undefined);
  });
  return { nodes, edges };
}
it("finds exactly the routes of the full-scan search on lattices with walls, ties and danger costs", () => {
  const cases = [
    lattice(24, () => false, false),
    lattice(24, () => false, true),
    lattice(30, (x, z) => (x === 12 && z !== 3 && z !== 25) || (z === 18 && x > 4 && x < 26), true),
    lattice(30, (x, z) => Math.sin(x * 12.9898 + z * 78.233) * 43758.5453 % 1 > 0.6, true),
  ];
  const dangers: (((a: Vec, b: Vec) => number) | undefined)[] = [
    undefined,
    (a, b) => Math.max(0, 6 - Math.hypot((a.x + b.x) / 2 - 4, (a.z + b.z) / 2 + 2)) * 0.8,
    (a, b) => ((a.x + b.x) / 2 > 0 ? 1.5 : 0) * dist(a, b),
  ];
  let checked = 0, found = 0;
  for (const { nodes, edges } of cases)
    for (const extra of dangers)
      for (let k = 0; k < 40; k++) {
        const start = (k * 97) % nodes.length, goal = (k * 389 + 11) % nodes.length;
        const expected = reference(nodes, edges, start, goal, extra);
        expect(searchGraph(nodes, edges, start, goal, extra)).toEqual(expected);
        checked++; if (expected) found++;
      }
  expect(checked).toBe(480);
  expect(found).toBeGreaterThan(300);
});
it("starts each search clean after a bigger graph and after an unreachable goal", () => {
  const big = lattice(40, () => false, true), small = lattice(6, () => false, false);
  expect(searchGraph(big.nodes, big.edges, 0, big.nodes.length - 1)).toEqual(reference(big.nodes, big.edges, 0, big.nodes.length - 1));
  const split = { nodes: small.nodes, edges: small.edges.map((out, u) => (u < 18 ? out.filter((v) => v < 18) : out.filter((v) => v >= 18))) };
  expect(searchGraph(split.nodes, split.edges, 0, 35)).toBeUndefined();
  expect(searchGraph(small.nodes, small.edges, 0, 35)).toEqual(reference(small.nodes, small.edges, 0, 35));
  expect(searchGraph(small.nodes, small.edges, 7, 7)).toEqual([7]);
});
