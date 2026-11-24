import { expect, it } from "vitest";
import { backdropBoxMesh, backdropHeight, backdropLife, backdropRelief } from "./backdrop";
import { beyondPlayArea, groundHeight } from "./map";
import { trenchMap } from "./trench-map";
import { verdunBackdropScenery, verdunDeadZoneTrees, verdunLandmarks } from "./verdun-backdrop";
import { verdunMap } from "./verdun-map";

const hx = verdunMap.width / 2, hz = verdunMap.depth / 2, bank = verdunMap.terrain!.bankHeight;
const scenery = verdunBackdropScenery(verdunMap), mesh = backdropBoxMesh(scenery.boxes);
const trees = verdunDeadZoneTrees(verdunMap);

it("carries the woods past the wire into the dead zone, clear of the wire itself", () => {
  expect(trees.length).toBeGreaterThan(80);
  expect(trees.length).toBeLessThan(260);
  for (const t of trees) {
    expect(beyondPlayArea(t.x, t.z, verdunMap)).toBeGreaterThan(verdunMap.boundary!.wireDepth + 1);
    expect(Math.abs(t.x)).toBeLessThan(hx);
    expect(Math.abs(t.z)).toBeLessThan(hz);
  }
  expect(new Set(trees.map((t) => t.treeStyle)).size).toBe(4);
  // The belts reaching the north and south edges continue across the wire:
  // those stretches are far more wooded than the open ground behind the spawns.
  const belt = trees.filter((t) => Math.abs(t.z) > 64 && Math.abs(t.x) < 96).length / (192 * 2);
  const rear = trees.filter((t) => Math.abs(t.x) > 104 && Math.abs(t.z) < 40).length / (80 * 2);
  expect(belt).toBeGreaterThan(rear * 1.5);
  expect(verdunDeadZoneTrees(verdunMap)).toEqual(trees);
  expect(verdunDeadZoneTrees(trenchMap)).toEqual([]);
});

it("stands every silhouette beyond the terrain edge, wound outward and within budget", () => {
  for (const b of scenery.boxes) expect(Math.abs(b.x) >= hx - 0.01 || Math.abs(b.z) >= hz - 0.01).toBe(true);
  for (let i = 0; i < scenery.lines.length; i += 3)
    expect(Math.abs(scenery.lines[i]) >= hx - 0.01 || Math.abs(scenery.lines[i + 2]) >= hz - 0.01).toBe(true);
  let inward = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => [0, 1, 2].map((j) => mesh.positions[mesh.indices[i + k] * 3 + j]));
    const u = [0, 1, 2].map((j) => b[j] - a[j]), v = [0, 1, 2].map((j) => c[j] - a[j]);
    const n = [0, 1, 2].map((j) => mesh.normals[mesh.indices[i] * 3 + j]);
    if ((u[1] * v[2] - u[2] * v[1]) * n[0] + (u[2] * v[0] - u[0] * v[2]) * n[1] + (u[0] * v[1] - u[1] * v[0]) * n[2] <= 0) inward++;
  }
  expect(inward).toBe(0);
  expect(mesh.indices.length / 3).toBeLessThan(90_000);
  // Woods, mostly: well over a thousand silhouettes, pines and broadleaf crowns among them.
  expect(scenery.boxes.filter((b) => b.shape === "spire").length).toBeGreaterThan(1000);
  expect(scenery.boxes.filter((b) => b.shape === "crown").length).toBeGreaterThan(200);
});

it("climbs into hill country, with the fort on a ridge and the village in a clearing", () => {
  for (const [x, z] of [[hx, 0], [-hx, 40], [30, hz], [-60, -hz], [hx + 20, hz + 10]])
    expect(backdropHeight(verdunMap, x, z)).toBeCloseTo(bank, 6);
  // The edge of the terrain itself is the dead zone's level ground.
  expect(groundHeight(hx - 1, 0, verdunMap)).toBeCloseTo(bank, 1);
  const far = (map: typeof verdunMap) => Array.from({ length: 64 }, (_, i) => {
    const a = (i / 64) * Math.PI * 2, r = 160 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
    return backdropHeight(map, Math.cos(a) * (r + map.width / 2), Math.sin(a) * (r + map.depth / 2));
  });
  const mean = (v: number[]) => v.reduce((n, h) => n + h, 0) / v.length;
  expect(mean(far(verdunMap)) - bank).toBeGreaterThan(mean(far(trenchMap)) - trenchMap.terrain!.bankHeight + 3);
  const { fort, village } = verdunLandmarks, hill = backdropRelief(verdunMap).hills[0];
  expect(Math.hypot(fort.x - hill.x, fort.z - hill.z)).toBeLessThan(1);
  expect(backdropHeight(verdunMap, fort.x, fort.z)).toBeGreaterThan(backdropHeight(verdunMap, fort.x - 60, fort.z) + 4);
  const trunks = scenery.boxes.filter((b) => b.color === "#4d4236" || b.color === "#574a3c" || b.color === "#5a4c3d");
  expect(trunks.some((b) => Math.hypot(b.x - village.x, b.z - village.z) < 30)).toBe(false);
  for (const b of backdropLife(verdunMap).balloons) expect(Math.abs(b.x)).toBeGreaterThan(hx + 60);
  for (const s of backdropLife(verdunMap).smoke) expect(Math.max(Math.abs(s.x) - hx, Math.abs(s.z) - hz)).toBeGreaterThan(40);
});
