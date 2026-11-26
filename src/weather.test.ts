import { describe, expect, test } from "vitest";
import { trenchMap } from "./trench-map";
import { groundHeight } from "./map";
import { Game, TestCollision, idle } from "./simulation";
import { footSurface, duckboards } from "./battlefield";
import { lookFor } from "./map-look";
import {
  floodAt, floodStrips, onDuckboard, pondLevel, puddleThreshold, rainDrops, rainPace, rainPonds, supportsRain,
  trenchWaterLevel, waterDepth, weatherRules, type RainDrop,
} from "./weather";
import { craterPonds } from "./no-mans-land";

describe("rain on Ypres", () => {
  test("only Ypres has weather, and only when the match asks for it", () => {
    expect(supportsRain(trenchMap)).toBe(true);
    expect(supportsRain({ id: "night-raid" })).toBe(false);
    expect(supportsRain({ id: "verdun" })).toBe(false);
    expect(new Game(new TestCollision(trenchMap), false, 300, 1, undefined, { map: trenchMap, rain: true }).rain).toBe(true);
    expect(new Game(new TestCollision(trenchMap), false, 300, 1, undefined, { map: trenchMap }).rain).toBe(false);
  });

  test("the water rises through the match and then holds", () => {
    expect(floodAt(0)).toBeCloseTo(weatherRules.startFlood);
    let previous = floodAt(0);
    for (let s = 30; s <= weatherRules.riseSeconds; s += 30) {
      expect(floodAt(s * 30)).toBeGreaterThan(previous);
      previous = floodAt(s * 30);
    }
    expect(floodAt(weatherRules.riseSeconds * 30)).toBeCloseTo(1);
    expect(floodAt(weatherRules.riseSeconds * 60)).toBeCloseTo(1);
  });

  test("shell holes fill above their old water and stay inside their bowls", () => {
    const ponds = rainPonds(trenchMap);
    // The old craters and the shell scars between the lines.
    expect(ponds.length).toBeGreaterThan(craterPonds(trenchMap).length);
    for (const p of ponds) {
      expect(p.high).toBeGreaterThan(p.low);
      // Ground under every edge vertex is at or above the high water: no water hangs in the air.
      p.edge.forEach((r, i) => {
        const a = (i / p.edge.length) * Math.PI * 2;
        expect(groundHeight(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, trenchMap)).toBeGreaterThan(p.high - 0.03);
      });
    }
    const deep = ponds[0];
    expect(waterDepth(deep, trenchMap, 1)).toBeGreaterThan(waterDepth(deep, trenchMap, 0.2));
    expect(pondLevel(deep, 1)).toBeCloseTo(deep.high);
  });

  test("the trench floor floods but the duckboards stay above the water", () => {
    expect(floodStrips(trenchMap).length).toBeGreaterThan(10);
    expect(trenchWaterLevel(1)).toBeLessThan(0.0475);
    expect(puddleThreshold(1)).toBe(0);
    expect(puddleThreshold(0.2)).toBeGreaterThan(puddleThreshold(0.6));
  });

  test("mud slows a stride, water more, and the duckboards not at all", () => {
    const board = duckboards(trenchMap)[0];
    expect(onDuckboard(board, trenchMap)).toBe(true);
    expect(rainPace(board, trenchMap, 1)).toBe(1);
    const field = { x: 0, z: 60 };
    expect(rainPace(field, trenchMap, 1)).toBeCloseTo(weatherRules.mudPace);
    const hole = rainPonds(trenchMap).reduce((a, b) => (b.high - b.low > a.high - a.low ? b : a));
    expect(rainPace(hole, trenchMap, 1)).toBeLessThan(weatherRules.mudPace);
    expect(rainPace(hole, trenchMap, 1)).toBeLessThan(rainPace(hole, trenchMap, 0.2));
    // Off the boards on the flooded floor.
    const floor = floodStrips(trenchMap)[0], beside = { x: floor.x0 + 0.5, z: (floor.z0 + floor.z1) / 2 };
    expect(onDuckboard(beside, trenchMap)).toBe(false);
    expect(rainPace(beside, trenchMap, 1)).toBeCloseTo(weatherRules.trenchWade);
  });

  test("a rainy match is slower going than a dry one, but the same everywhere it was", () => {
    const walk = (rain: boolean) => {
      const g = new Game(new TestCollision(trenchMap), false, 3000, 7, undefined, { map: trenchMap, rain });
      const p = g.players[0], start = { x: p.x, z: p.z };
      for (let i = 0; i < 60; i++) g.step({ ...idle(), x: 0, z: 1 });
      return Math.hypot(p.x - start.x, p.z - start.z);
    };
    const dry = walk(false), wet = walk(true);
    expect(wet).toBeLessThan(dry);
    expect(wet).toBeGreaterThan(dry * 0.55);
  });

  test("footsteps squelch in the rain and splash where water stands", () => {
    const board = duckboards(trenchMap)[0];
    expect(footSurface(board, trenchMap, undefined, 1)).toBe("wood");
    expect(footSurface({ x: 0, z: 60 }, trenchMap, undefined, 1)).toBe("sludge");
    const hole = rainPonds(trenchMap)[0];
    expect(footSurface(hole, trenchMap, undefined, 1)).toBe("splash");
    expect(footSurface({ x: 0, z: 60 }, trenchMap)).toBe("mud");
  });

  test("the rain look is darker and closer than Ypres's dry dawn", () => {
    const dry = lookFor(trenchMap), wet = lookFor(trenchMap, true);
    expect(wet.sun.intensity).toBeLessThan(dry.sun.intensity);
    expect(wet.sun.shadowStrength).toBeLessThan(dry.sun.shadowStrength);
    expect(wet.fog.start).toBeLessThan(dry.fog.start);
    expect(lookFor({ id: "verdun" }, true)).toBe(lookFor({ id: "verdun" }));
  });

  test("drops wrap round the viewer and never fill the view", () => {
    const out: RainDrop[] = [], eye = { x: 10, y: 3, z: -4 };
    const n = rainDrops(eye, 12.5, 800, out);
    expect(n).toBeGreaterThan(700);
    for (const d of out.slice(0, n)) {
      expect(Math.abs(d.x - eye.x)).toBeLessThanOrEqual(13);
      expect(Math.abs(d.z - eye.z)).toBeLessThanOrEqual(13);
      expect(Math.hypot(d.x - eye.x, d.y - eye.y, d.z - eye.z)).toBeGreaterThanOrEqual(0.6);
    }
  });
});
