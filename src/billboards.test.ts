import { expect, it } from "vitest";
import { clothGeometry, clothScraps } from "./atmosphere";
import { BillboardBuffer } from "./billboards";
import { trenchMap } from "./trench-map";

const corner = (b: BillboardBuffer, quad: number, k: number) => [0, 1, 2].map((j) => b.positions[quad * 12 + k * 3 + j]);
const sub = (a: number[], b: number[]) => a.map((v, i) => v - b[i]);
const dot = (a: number[], b: number[]) => a.reduce((n, v, i) => n + v * b[i], 0);
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

it("writes each quad centred, sized and flat against the view direction", () => {
  const b = new BillboardBuffer(4), right = [0.6, 0, -0.8], up = [0, 1, 0], forward = cross(right, up);
  b.begin(right, up);
  b.add(10, 2, -5, 4, 2, 0, 0.5);
  b.add(0, 0, 0, 1, 1, 30);
  expect(b.end()).toBe(2);
  const quad = [0, 1, 2, 3].map((k) => corner(b, 0, k));
  expect([0, 1, 2].map((j) => quad.reduce((n, c) => n + c[j], 0) / 4)).toEqual([10, 2, -5]);
  expect(Math.hypot(...sub(quad[1], quad[0]))).toBeCloseTo(4, 6);
  expect(Math.hypot(...sub(quad[3], quad[0]))).toBeCloseTo(2, 6);
  for (const c of quad) expect(dot(sub(c, [10, 2, -5]), forward)).toBeCloseTo(0, 6);
  // Rolling turns the quad in its own plane and keeps its size.
  const rolled = [0, 1, 2, 3].map((k) => corner(b, 1, k)), edge = sub(rolled[1], rolled[0]);
  expect(Math.hypot(...edge)).toBeCloseTo(1, 6);
  expect(dot(edge, up)).toBeCloseTo(Math.sin(Math.PI / 6), 6);
  for (const c of rolled) expect(dot(c, forward)).toBeCloseTo(0, 6);
  // Alpha rides in the vertex colour, so fading a quad needs no material change.
  expect([0, 1, 2, 3].map((k) => b.colors[k * 4 + 3])).toEqual([128, 128, 128, 128]);
  expect(b.colors[16 + 3]).toBe(255);
});

it("drops quads past its capacity or with no alpha, and collapses the unused ones", () => {
  const b = new BillboardBuffer(2);
  b.begin([1, 0, 0], [0, 1, 0]);
  b.add(1, 1, 1, 2, 2);
  b.add(5, 5, 5, 2, 2, 0, 0);
  expect(b.end()).toBe(1);
  expect([...b.positions.slice(12)].every((v) => v === 0)).toBe(true);
  b.begin([1, 0, 0], [0, 1, 0]);
  for (let i = 0; i < 5; i++) b.add(i, 0, 0, 1, 1);
  expect(b.end()).toBe(2);
  // A reused buffer keeps no quads from the frame before.
  b.begin([1, 0, 0], [0, 1, 0]);
  expect(b.end()).toBe(0);
  expect([...b.positions].every((v) => v === 0)).toBe(true);
  expect([...b.indices]).toEqual([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  expect(() => new BillboardBuffer(20000)).toThrow();
});

it("hangs every cloth scrap from its strand as a two-sided quad whose faces match their normals", () => {
  const scraps = clothScraps(trenchMap), cloth = clothGeometry(scraps);
  expect(cloth.indices).toHaveLength(scraps.length * 12);
  const p = (i: number) => [0, 1, 2].map((j) => cloth.positions[i * 3 + j]), n = (i: number) => [0, 1, 2].map((j) => cloth.normals[i * 3 + j]);
  for (const t of [0, 0.7, 3.1]) {
    cloth.update(t);
    for (let i = 0; i < cloth.indices.length; i += 3) {
      const [a, b, c] = [cloth.indices[i], cloth.indices[i + 1], cloth.indices[i + 2]];
      expect(dot(cross(sub(p(b), p(a)), sub(p(c), p(a))), n(a))).toBeGreaterThan(0);
    }
    scraps.forEach((scrap, s) => {
      // The top edge stays on the strand; the bottom swings but keeps its length.
      const top = p(s * 8), bottom = p(s * 8 + 3);
      expect(top[1]).toBeCloseTo(scrap.y + 0.25, 4);
      expect(Math.hypot(...sub(bottom, top))).toBeCloseTo(0.5, 4);
      expect(bottom[1]).toBeLessThan(top[1] - 0.4);
    });
  }
});
