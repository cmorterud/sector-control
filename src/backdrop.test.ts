import { expect, it } from "vitest";
import {
  backdropBoxMesh, backdropGround, backdropHeight, backdropRules, backdropScenery, backdropTrenches,
  distantFlares, distantFlashes, flarePosition, flareTicks, trenchEnds,
} from "./backdrop";
import { trenchMap } from "./trench-map";

const hx = trenchMap.width / 2, hz = trenchMap.depth / 2, bank = trenchMap.terrain!.bankHeight;
const ground = backdropGround(trenchMap);
const outward = (mesh: { positions: Float32Array; normals: Float32Array; indices: Uint32Array }) => {
  let wrong = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => [0, 1, 2].map((j) => mesh.positions[mesh.indices[i + k] * 3 + j]));
    const u = [0, 1, 2].map((j) => b[j] - a[j]), v = [0, 1, 2].map((j) => c[j] - a[j]);
    const n = [0, 1, 2].map((j) => mesh.normals[mesh.indices[i] * 3 + j]);
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    if (cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2] <= 0) wrong++;
  }
  return wrong;
};

it("rings the terrain with ground out to the horizon without covering it", () => {
  const xs: number[] = [], zs: number[] = [];
  for (let i = 0; i < ground.positions.length; i += 3) { xs.push(ground.positions[i]); zs.push(ground.positions[i + 2]); }
  expect(Math.min(...xs)).toBe(-backdropRules.radius);
  expect(Math.max(...zs)).toBe(backdropRules.radius);
  for (let i = 0; i < ground.indices.length; i += 3) {
    const c = [0, 2].map((j) => [0, 1, 2].reduce((n, k) => n + ground.positions[ground.indices[i + k] * 3 + j], 0) / 3);
    expect(Math.abs(c[0]) >= hx || Math.abs(c[1]) >= hz).toBe(true);
  }
  expect(outward(ground)).toBe(0);
  expect(ground.indices.length / 3).toBeLessThan(25_000);
});

it("meets the terrain edge level, then rolls and rises toward the horizon", () => {
  for (const [x, z] of [[hx, 0], [-hx, 40], [30, hz], [-60, -hz], [hx + 20, hz + 10]])
    expect(backdropHeight(trenchMap, x, z)).toBeCloseTo(bank, 6);
  // Around a ring 200 m beyond the edge the ground rolls, and on average rises.
  const far = Array.from({ length: 64 }, (_, i) => {
    const a = (i / 64) * Math.PI * 2, r = 200 / Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a)));
    return backdropHeight(trenchMap, Math.cos(a) * (r + hx), Math.sin(a) * (r + hz));
  });
  expect(Math.max(...far) - Math.min(...far)).toBeGreaterThan(2);
  expect(far.reduce((n, h) => n + h, 0) / far.length).toBeGreaterThan(bank + 2);
});

it("continues every trench end as a zigzag front reaching the horizon", () => {
  const trenches = backdropTrenches(trenchMap);
  expect(trenches).toHaveLength(trenchEnds(trenchMap).length);
  expect(trenches).toHaveLength(8);
  for (const trench of trenches) {
    expect(trench.points[0]).toEqual({ x: trench.x, z: trench.north * hz });
    expect(Math.abs(trench.points.at(-1)!.z)).toBeGreaterThan(250);
    expect(new Set(trench.points.map((p) => p.x)).size).toBeGreaterThan(1);
  }
});

it("stands every silhouette beyond the terrain edge and winds it outward", () => {
  const { boxes, lines } = backdropScenery(trenchMap);
  for (const b of boxes) expect(Math.abs(b.x) >= hx - 0.01 || Math.abs(b.z) >= hz - 0.01).toBe(true);
  for (let i = 0; i < lines.length; i += 3) expect(Math.abs(lines[i]) >= hx - 0.01 || Math.abs(lines[i + 2]) >= hz - 0.01).toBe(true);
  const mesh = backdropBoxMesh(boxes);
  expect(outward(mesh)).toBe(0);
  expect(mesh.indices.length / 3).toBeLessThan(40_000);
});

it("schedules distant bursts and flares deterministically, far from the fighting", () => {
  const all = distantFlashes(trenchMap, 0, 9000);
  expect(distantFlashes(trenchMap, 3000, 6000)).toEqual(all.filter((f) => f.tick >= 3000 && f.tick < 6000));
  expect(all.length).toBeGreaterThan(45);
  for (const f of all) expect(Math.hypot(f.x, f.z)).toBeGreaterThan(140);
  const flares = distantFlares(0, 9000);
  expect(flares.length).toBeGreaterThan(8);
  for (const flare of flares) {
    expect(Math.abs(flare.z)).toBeGreaterThan(hz + 20);
    const top = flarePosition(flare, flare.tick + 75), end = flarePosition(flare, flare.tick + flareTicks - 1);
    expect(top.y).toBeCloseTo(42, 0);
    expect(end.y).toBeLessThan(top.y);
    expect(end.burning).toBe(true);
    expect(flarePosition(flare, flare.tick + flareTicks).burning).toBe(false);
  }
});
