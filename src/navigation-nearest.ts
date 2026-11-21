import type { Vec } from "./map";

type Candidate = { i: number; d: number };
// Large node sets are bucketed into square cells once, so a query visits only
// the rings of cells around it instead of every graph node.
const cellSize = 4, gridMinimum = 256;
type Grid = { length: number; cells: Map<number, number[]>; minX: number; maxX: number; minZ: number; maxZ: number };
const grids = new WeakMap<readonly Vec[], Grid>();
const cellKey = (x: number, z: number) => (x + 32768) * 65536 + (z + 32768);
function gridFor(points: readonly Vec[]) {
  let grid = grids.get(points);
  // Node lists are built once per graph; a changed length means a new list.
  if (grid?.length === points.length) return grid;
  grid = { length: points.length, cells: new Map(), minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let i = 0; i < points.length; i++) {
    const x = Math.floor(points[i].x / cellSize), z = Math.floor(points[i].z / cellSize), key = cellKey(x, z);
    const list = grid.cells.get(key);
    if (list) list.push(i); else grid.cells.set(key, [i]);
    grid.minX = Math.min(grid.minX, x); grid.maxX = Math.max(grid.maxX, x);
    grid.minZ = Math.min(grid.minZ, z); grid.maxZ = Math.max(grid.maxZ, z);
  }
  grids.set(points, grid);
  return grid;
}
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
  const visit = (i: number) => {
    const d = points[i].y === undefined
      ? Math.hypot(points[i].x - p.x, points[i].z - p.z)
      : Math.hypot(points[i].x - p.x, points[i].z - p.z, (points[i].y! - (p.y ?? 0)) * 2);
    // The root is the worst kept candidate; ties go to the lower index.
    if (heap.length === limit && (d > heap[0].d || (d === heap[0].d && i > heap[0].i))) return;
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
  };
  if (points.length < gridMinimum) for (let i = 0; i < points.length; i++) visit(i);
  else {
    const grid = gridFor(points), cx = Math.floor(p.x / cellSize), cz = Math.floor(p.z / cellSize);
    const span = Math.max(cx - grid.minX, grid.maxX - cx, cz - grid.minZ, grid.maxZ - cz);
    for (let r = 0; r <= span; r++) {
      for (let x = cx - r; x <= cx + r; x++)
        for (let z = cz - r; z <= cz + r; z++) {
          if (Math.abs(x - cx) !== r && Math.abs(z - cz) !== r) continue;
          const list = grid.cells.get(cellKey(x, z));
          if (list) for (const i of list) visit(i);
        }
      // Every unvisited point is at least this far away horizontally, and
      // height only adds distance.
      const reach = Math.min(p.x - (cx - r) * cellSize, (cx + r + 1) * cellSize - p.x,
        p.z - (cz - r) * cellSize, (cz + r + 1) * cellSize - p.z);
      if (heap.length === limit && heap[0].d < reach) break;
    }
  }
  return heap.sort((a, b) => a.d - b.d || a.i - b.i);
}
