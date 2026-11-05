import { describe, expect, it } from "vitest";
import { Game, botCommand, idle, defaultBotSettings } from "./simulation";
import { industrialMap } from "./map";
import { trenchMap } from "./trench-map";
import { PlaytestLog } from "./playtest";

function scene() {
  const g = new Game(
    { ray: () => 1, move: (p) => ({ x: p.x, z: p.z }) },
    true,
    1800,
    12345,
    undefined,
    { map: { ...industrialMap, boxes: [] }, teamSize: 1, assaults: false },
  );
  const [target, p] = g.players;
  Object.assign(target, { x: 0, y: 0, z: 0, hp: 1000000, protectedUntil: 0 });
  Object.assign(p, { x: 20, y: 0, z: 0, nextThink: 1e9, protectedUntil: 0 });
  g.botSettings.awareness = false; // isolate attention timers from the separate perception model.
  return { g, p, target };
}

describe("bot attention", () => {
  it("uses wider default cones and delays a newly acquired target before firing", () => {
    expect(defaultBotSettings.aimError).toBe(0.075);
    const trench = new Game(
      { ray: () => 1, move: (p) => p },
      false,
      1800,
      12345,
      undefined,
      { map: trenchMap },
    );
    expect(trench.botSettings.aimError).toBe(0.06);
    const { g, p, target } = scene();
    g.botSettings.burstPeriodTicks = g.botSettings.burstFireTicks = 1;
    g.tick = 1;
    expect(botCommand(g, p).fire).toBe(false);
    expect(p.target).toBe(target.id);
    const acquired = p.spottedAt;
    for (g.tick = acquired + 1; g.tick < acquired + 27; g.tick++)
      expect(botCommand(g, p).fire).toBe(false);
    let first = 0;
    for (; g.tick <= acquired + 45; g.tick++)
      if (botCommand(g, p).fire) {
        first = g.tick - acquired;
        break;
      }
    expect(first).toBeGreaterThanOrEqual(27);
    expect(first).toBeLessThanOrEqual(45);
  });

  it("actually stops firing/tracking during breaks, then searches and pays the full reaction delay again", () => {
    const { g, p } = scene(),
      log = new PlaytestLog();
    g.botSettings.burstPeriodTicks = g.botSettings.burstFireTicks = 1;
    let breakUntil = 0,
      lost = false,
      acquiredAgain = 0,
      firedAgain = 0;
    for (let i = 0; i < 300; i++) {
      g.step(idle());
      log.recordTick(g, idle(), g.tick / 30);
      const distracted = g.events.find(
        (e) => e.type === "botAttention" && e.phase === "distracted",
      );
      if (distracted?.type === "botAttention" && !lost) {
        lost = true;
        breakUntil = distracted.until;
      }
      if (lost && g.tick < breakUntil) {
        expect(p.target).toBe(-1);
        expect(p.command.fire).toBe(false);
        expect(p.command.aim).toBe(false);
        expect(
          g.events.some((e) => e.type === "fire" && e.actor === p.id),
        ).toBe(false);
      }
      if (lost && !acquiredAgain && g.tick >= breakUntil && p.target >= 0)
        acquiredAgain = p.spottedAt;
      if (acquiredAgain && g.tick - acquiredAgain < 27)
        expect(p.command.fire).toBe(false);
      if (
        acquiredAgain &&
        g.events.some((e) => e.type === "fire" && e.actor === p.id)
      ) {
        firedAgain = g.tick;
        break;
      }
    }
    expect(lost).toBe(true);
    expect(acquiredAgain).toBeGreaterThanOrEqual(breakUntil);
    expect(firedAgain).toBeGreaterThanOrEqual(acquiredAgain + 27);
    expect(firedAgain).toBeLessThanOrEqual(acquiredAgain + 62);
    expect(log.summary().attentionBreaks).toBe(1);
    expect(log.summary().targetAcquisitions).toBe(2);
  });

  it("can find a different enemy after an attention break instead of retaining the old target", () => {
    const { g, p, target } = scene();
    g.tick = 1;
    botCommand(g, p);
    const other = { ...target, id: 2, x: 15 };
    g.players.push(other);
    g.tick = p.focusUntil;
    expect(botCommand(g, p).fire).toBe(false);
    expect(p.target).toBe(-1);
    g.tick = Math.ceil((p.distractedUntil - (p.id % 3)) / 3) * 3 + (p.id % 3);
    expect(botCommand(g, p).fire).toBe(false);
    expect(p.target).toBe(other.id);
    expect(p.spottedAt).toBe(g.tick);
  });

  it("staggers focus windows deterministically across soldiers without consuming gameplay randomness", () => {
    const windows = [];
    for (let id = 1; id <= 25; id++) {
      const run = () => {
        const { g, p } = scene();
        p.id = id;
        g.tick = 300 + (id % 3);
        const seed = g.seed;
        botCommand(g, p);
        expect(g.seed).toBe(seed);
        return p.focusUntil - g.tick;
      };
      const n = run();
      expect(run()).toBe(n);
      expect(n).toBeGreaterThanOrEqual(60);
      expect(n).toBeLessThanOrEqual(120);
      windows.push(n);
    }
    expect(new Set(windows).size).toBeGreaterThan(15);
  });

  it("serializes independent attention state, resets it on respawn and honors explicit zero-delay/no-break settings", () => {
    const { g, p } = scene();
    g.tick = 1;
    botCommand(g, p);
    const snapshot = g.snapshot();
    g.tick = p.focusUntil;
    botCommand(g, p);
    expect(p.distractedUntil).toBeGreaterThan(g.tick);
    expect(snapshot.players[1].distractedUntil).toBe(0);
    g.respawn(p);
    expect(p.focusUntil).toBe(0);
    expect(p.distractedUntil).toBe(0);
    expect(p.target).toBe(-1);
    Object.assign(p, { x: 20, z: 0, y: 0, nextThink: 1e9 });
    Object.assign(g.botSettings, {
      reactionTicks: 0,
      focusMaxTicks: 0,
      burstPeriodTicks: 1,
      burstFireTicks: 1,
    });
    g.tick = Math.ceil((g.tick - 1) / 3) * 3 + 1;
    expect(botCommand(g, p).fire).toBe(true);
    expect(p.focusUntil).toBe(0);
    expect(p.distractedUntil).toBe(0);
  });
});
