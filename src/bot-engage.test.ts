import { describe, expect, it } from "vitest";
import { Game, botCommand } from "./simulation";
import { industrialMap } from "./map";
import { respectTarget } from "./bot-engage";

const raiseSights = (p: { aimMotion?: unknown }) => { p.aimMotion = { tick: 0, from: 1, to: 1, duration: 6 }; };

// A bot walking a route east with an enemy (or none) somewhere else.
function scene(enemyAt: { x: number; z: number } | null) {
  const g = new Game(
    { ray: () => 1, move: (p) => ({ x: p.x, z: p.z }) },
    true, 1800, 12345, undefined,
    { map: { ...industrialMap, boxes: [] }, teamSize: 1, assaults: false },
  );
  const [enemy, p] = g.players;
  Object.assign(enemy, { x: enemyAt?.x ?? 0, y: 0, z: enemyAt?.z ?? 0, hp: enemyAt ? 1e6 : 0, protectedUntil: 0 });
  Object.assign(p, { x: 20, y: 0, z: 0, nextThink: 1e9, protectedUntil: 0 });
  g.sectors[p.objective] = { ...g.sectors[p.objective], x: 60, z: 0 };
  p.path = [{ x: 40, z: 0 }, { x: 60, z: 0 }];
  g.botSettings.awareness = false;
  raiseSights(p);
  g.tick = 1;
  return { g, p };
}
// Route motion only (the sidestep every few seconds is a separate move), on
// a tick when bot 1 looks around without awareness timers.
const routeTick = (g: Game) => { g.tick = 31; };

describe("bots engaging a target", () => {
  it("still walks its route when nobody is in sight", () => {
    const { g, p } = scene(null);
    routeTick(g);
    const c = botCommand(g, p);
    expect(p.target).toBe(-1);
    expect(c.x).toBeGreaterThan(0.9);
  });

  it("does not walk on away from an enemy behind it while shooting at him", () => {
    const { g, p } = scene({ x: 0, z: 0 });
    routeTick(g);
    const c = botCommand(g, p);
    expect(p.target).toBe(0);
    expect(c.aim).toBe(true);
    expect(c.x).toBeLessThanOrEqual(1e-9);
  });

  it("does not walk past an enemy off to the side", () => {
    const { g, p } = scene({ x: 22, z: 30 });
    routeTick(g);
    const c = botCommand(g, p);
    expect(p.target).toBe(0);
    // Hardly any of the eastward walk is left.
    expect(Math.abs(c.x)).toBeLessThan(0.05);
  });

  it("still closes on an enemy ahead", () => {
    const { g, p } = scene({ x: 50, z: 0 });
    routeTick(g);
    const c = botCommand(g, p);
    expect(p.target).toBe(0);
    expect(c.x).toBeGreaterThan(0.1);
  });

  it("keeps sideways cover moves but drops the part away from the enemy", () => {
    const c = { x: -1, z: 1 };
    respectTarget({ x: 0, z: 0 }, { x: 20, z: 0 }, c, true);
    expect(c.x).toBeCloseTo(0);
    expect(c.z).toBeCloseTo(1);
  });

  it("holds its ground on an enemy behind it through several seconds of fighting, lapses of attention included", () => {
    const { g, p } = scene({ x: 0, z: 0 });
    const start = p.x;
    g.tick = 30;
    for (let i = 0; i < 150; i++) {
      g.tick++;
      const c = botCommand(g, p);
      // Integrate the command the way the movement step does (route + sidestep).
      const len = Math.max(1, Math.hypot(c.x, c.z));
      p.x += (c.x / len) * 4.5 / 30;
      p.z += (c.z / len) * 4.5 / 30;
    }
    expect(p.target).toBe(0);
    expect(p.x - start).toBeLessThan(0.5);
  });
});
