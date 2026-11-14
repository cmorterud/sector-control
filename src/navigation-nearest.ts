import type { Vec } from "./map";

type Candidate = { i: number; d: number };
// Keep the same closest candidates and stable tie order as a full distance sort,
// without allocating/sorting every graph node for every bot path request.
export function nearestCandidates(
  points: readonly Vec[],
  p: Vec,
  limit = 48,
): Candidate[] {
  limit = Math.min(points.length, Math.max(0, Math.floor(limit)));
  if (!limit) return [];
  const heap: Candidate[] = [];
  const worse = (a: Candidate, b: Candidate) =>
    a.d > b.d || (a.d === b.d && a.i > b.i);
  const swap = (a: number, b: number) => {
    const n = heap[a];
    heap[a] = heap[b];
    heap[b] = n;
  };
  for (let i = 0; i < points.length; i++) {
    const d = points[i].y === undefined
      ? Math.hypot(points[i].x - p.x, points[i].z - p.z)
      : Math.hypot(points[i].x - p.x, points[i].z - p.z, (points[i].y! - (p.y ?? 0)) * 2);
    // Equal-distance later indices sort after every candidate already visited.
    if (heap.length === limit && d >= heap[0].d) continue;
    const candidate = { i, d };
    if (heap.length < limit) {
      heap.push(candidate);
      let k = heap.length - 1;
      while (k) {
        const parent = (k - 1) >> 1;
        if (!worse(heap[k], heap[parent])) break;
        swap(k, parent);
        k = parent;
      }
    } else {
      heap[0] = candidate;
      let k = 0;
      for (;;) {
        const left = k * 2 + 1,
          right = left + 1;
        let next = k;
        if (left < heap.length && worse(heap[left], heap[next])) next = left;
        if (right < heap.length && worse(heap[right], heap[next])) next = right;
        if (next === k) break;
        swap(k, next);
        k = next;
      }
    }
  }
  return heap.sort((a, b) => a.d - b.d || a.i - b.i);
}
