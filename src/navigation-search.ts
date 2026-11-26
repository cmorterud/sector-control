import { dist, type Vec } from "./map";

// A* over a navigation graph that visits nodes in exactly the order the
// original search did. That search kept its open nodes in a Set and scanned
// every one of them for the lowest cost-plus-distance score on each step,
// taking the first in Set order on a tie. Here a binary heap keyed on
// (score, sequence) finds the same node: the sequence is the order in which a
// node joined the open set, which is the Set's iteration order. A node whose
// cost drops while open keeps its sequence, as it keeps its Set position, and
// its old heap entry goes stale. The scores are the same sums of the same
// numbers, so routes come out bit for bit the same, but each step costs
// O(log n) instead of a scan of the whole open set.

// Scratch arrays shared by every search, reset by bumping a generation stamp
// instead of refilling them. The simulation is single threaded and a search
// never calls back into another search.
let capacity = 0;
let generation = 0;
let stamp = new Uint32Array(0); // node touched in this search when stamp[v] === generation
let cost = new Float64Array(0);
let heuristic = new Float64Array(0);
let came = new Int32Array(0);
let sequence = new Float64Array(0); // open-set position; -1 when not open
let heapNode: number[] = [];
let heapScore: number[] = [];
let heapSeq: number[] = [];

function prepare(n: number) {
  if (n > capacity) {
    capacity = Math.max(n, capacity * 2);
    stamp = new Uint32Array(capacity);
    cost = new Float64Array(capacity);
    heuristic = new Float64Array(capacity);
    came = new Int32Array(capacity);
    sequence = new Float64Array(capacity);
    generation = 0;
  }
  if (++generation === 0xffffffff) { stamp.fill(0); generation = 1; }
  heapNode.length = heapScore.length = heapSeq.length = 0;
}

const before = (a: number, b: number) =>
  heapScore[a] < heapScore[b] || (heapScore[a] === heapScore[b] && heapSeq[a] < heapSeq[b]);
function swap(a: number, b: number) {
  let t = heapNode[a]; heapNode[a] = heapNode[b]; heapNode[b] = t;
  t = heapScore[a]; heapScore[a] = heapScore[b]; heapScore[b] = t;
  t = heapSeq[a]; heapSeq[a] = heapSeq[b]; heapSeq[b] = t;
}
function push(node: number, score: number, seq: number) {
  let i = heapNode.length;
  heapNode.push(node); heapScore.push(score); heapSeq.push(seq);
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if (!before(i, parent)) break;
    swap(i, parent); i = parent;
  }
}
function pop() {
  const last = heapNode.length - 1;
  swap(0, last);
  const node = heapNode.pop()!, score = heapScore.pop()!, seq = heapSeq.pop()!;
  for (let i = 0; ;) {
    const l = 2 * i + 1, r = l + 1;
    let m = i;
    if (l < heapNode.length && before(l, m)) m = l;
    if (r < heapNode.length && before(r, m)) m = r;
    if (m === i) break;
    swap(i, m); i = m;
  }
  popped.node = node; popped.score = score; popped.seq = seq;
}
const popped = { node: -1, score: 0, seq: 0 };

// The node indices from start to goal, or undefined when the goal cannot be
// reached. `extra` is an optional non-negative cost added to each edge.
export function searchGraph(
  nodes: readonly Vec[],
  edges: readonly (readonly number[])[],
  start: number,
  goal: number,
  extra?: (a: Vec, b: Vec) => number,
): number[] | undefined {
  prepare(nodes.length);
  const g = generation, target = nodes[goal];
  let nextSeq = 0;
  const touch = (v: number) => {
    if (stamp[v] === g) return;
    stamp[v] = g; cost[v] = Infinity; came[v] = -1; sequence[v] = -1;
    heuristic[v] = dist(nodes[v], target);
  };
  touch(start);
  cost[start] = 0; sequence[start] = nextSeq++;
  push(start, cost[start] + heuristic[start], sequence[start]);
  while (heapNode.length) {
    pop();
    const u = popped.node;
    // Stale: closed since, or re-scored with a lower cost.
    if (sequence[u] !== popped.seq || cost[u] + heuristic[u] !== popped.score) continue;
    if (u === goal) {
      const route = [u];
      for (let w = came[u]; w >= 0; w = came[w]) route.push(w);
      return route.reverse();
    }
    sequence[u] = -1;
    const from = nodes[u], out = edges[u];
    for (let k = 0; k < out.length; k++) {
      const v = out[k];
      touch(v);
      const next = cost[u] + dist(from, nodes[v]) + (extra ? extra(from, nodes[v]) : 0);
      if (next < cost[v]) {
        came[v] = u;
        cost[v] = next;
        if (sequence[v] < 0) sequence[v] = nextSeq++;
        push(v, cost[v] + heuristic[v], sequence[v]);
      }
    }
  }
  return undefined;
}
