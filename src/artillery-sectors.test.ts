import { expect, it } from "vitest";
import { artillerySector, artillerySectors } from "./artillery-sectors";
import {
  artilleryRules,
  artilleryTargetReason,
  artilleryUncertainty,
  requestArtillery,
  artilleryThreat,
} from "./artillery";
import { Game, TestCollision, idle } from "./simulation";
import { trenchMap } from "./trench-map";
import { dist } from "./map";

function scene() {
  const g = new Game(
    new TestCollision(trenchMap),
    false,
    5000,
    12345,
    undefined,
    { map: trenchMap, teamSize: 1 },
  );
  g.tick = artilleryRules.initialDelay;
  Object.assign(g.players[0], { x: -23, z: -1, y: 0, crouched: true });
  return g;
}
it("covers the battlefield with broad stable sectors and quantizes fine coordinates", () => {
  const sectors = artillerySectors(trenchMap);
  expect(sectors).toHaveLength(100);
  expect(new Set(sectors.map((s) => s.name)).size).toBe(100);
  expect(artillerySector(trenchMap, { x: 17, z: 2 }).name).toBe("G6");
  expect(artillerySector(trenchMap, { x: 29, z: 14 }).name).toBe("G6");
});
it("allows a blind call from the trench floor with bounded extra dispersion and normal warning/charge", () => {
  const g = scene(),
    p = g.players[0],
    target = { x: 17, z: 2, area: true };
  expect(artilleryTargetReason(g, p, target)).toBeNull();
  expect(artilleryUncertainty(g, p, target)).toBe(10);
  g.random = () => 0.5;
  const c = idle();
  c.artillery = target;
  g.step(c);
  const m = g.artillery.missions[0];
  expect(m.target).toEqual({ x: 24, z: 8 });
  expect(m.uncertainty).toBe(10);
  expect(m.dangerRadius).toBe(40);
  expect(m.firstImpactAt - m.calledAt).toBe(120);
  expect(m.endsAt - m.firstImpactAt).toBe(150);
  expect(m.impacts).toHaveLength(8);
  expect(m.impacts.every((v) => dist(v, m.target) <= 31.001)).toBe(true);
  expect(m.impacts.some((v) => dist(v, m.target) > 21)).toBe(true);
  expect(artilleryThreat(g, { x: m.target.x + m.dangerRadius! - 1, z: m.target.z })).toBe(m);
  expect(g.artillery.readyAt.blue).toBe(g.tick + 900);
  expect(requestArtillery(g, p, target)).toBe(false);
});
it("retains ownership/range/death/finite bounds rules and allows map-edge sectors without off-map shells", () => {
  const g = scene(),
    p = g.players[0];
  const target = { x: 24, z: 8, area: true };
  expect(requestArtillery(g, { ...p, id: 1 }, target)).toBe(false);
  for (const t of [
    { x: NaN, z: 0 },
    { x: 100, z: 0 },
    { x: -23, z: -1 },
    { x: 72, z: 56 },
  ])
    expect(requestArtillery(g, p, { ...t, area: true })).toBe(false);
  p.hp = 0;
  expect(requestArtillery(g, p, target)).toBe(false);
  p.hp = 100;
  p.x = 30;
  p.z = 40;
  p.y = 2.4;
  expect(requestArtillery(g, p, { x: 72, z: 56, area: true })).toBe(true);
  expect(
    g.artillery.missions[0].impacts.every(
      (v) => Math.abs(v.x) <= 79 && Math.abs(v.z) <= 79,
    ),
  ).toBe(true);
});
it("gives clear-view requests less drift and preserves exact bot spotting constraints", () => {
  const g = scene(),
    p = g.players[0],
    target = { x: 24, z: 8 };
  Object.assign(p, { x: -18, z: -1, y: 2.4, crouched: false });
  expect(artilleryUncertainty(g, p, target)).toBe(6);
  p.x = -23;
  p.y = 0;
  expect(artilleryTargetReason(g, p, target)).toContain("firing step");
  expect(artilleryTargetReason(g, p, { ...target, area: true })).toBeNull();
});
