import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { SoldierChatter, voiceLines } from "./soldier-chatter";
import { Game, TestCollision, type Event } from "./simulation";
import { industrialMap } from "./map";
function scene() {
  const map = { ...industrialMap, boxes: [] };
  const g = new Game(new TestCollision(map), false, 5000, 12345, undefined, {
    map,
  });
  const p = g.players[0];
  Object.assign(p, { x: 0, y: 0, z: 0 });
  g.players.push({ ...p, id: 1, x: 4 }, { ...p, id: 2, team: "red", x: 8 });
  return { g, c: new SoldierChatter() };
}
const event = (g: Game, data: object) =>
  ({ id: 1, tick: g.tick, ...data }) as Event;
it("announces real nearby friendly actions sparsely without changing simulation state", () => {
  const { g, c } = scene(),
    snapshot = g.snapshot();
  expect(c.react(g, event(g, { type: "reload", actor: 0 }))).toMatchObject({
    actor: { id: 0 },
    line: "reloading",
  });
  for (let i = 0; i < 50; i++)
    expect(
      c.react(g, event(g, { type: "reload", actor: i % 2 })),
    ).toBeUndefined();
  expect(g.snapshot()).toEqual(snapshot);
  g.tick = 361;
  expect(c.react(g, event(g, { type: "reload", actor: 1 }))).toMatchObject({
    line: "reloading",
  });
  g.tick = 1000;
  expect(c.react(g, event(g, { type: "reload", actor: 2 }))).toBeUndefined();
  g.players[1].x = 50;
  expect(
    c.react(g, event(g, { type: "smokeThrow", actor: 1 })),
  ).toBeUndefined();
});
it("lets a public incoming barrage warning use another nearby soldier after a short speech gap", () => {
  const { g, c } = scene();
  c.react(g, event(g, { type: "reload", actor: 0 }));
  const call = () =>
    event(g, {
      type: "artilleryCall",
      actor: 2,
      team: "red",
      target: { x: 4, z: 0 },
      radius: 12,
    });
  g.tick = 74;
  expect(c.react(g, call())).toBeUndefined();
  g.tick = 75;
  expect(c.react(g, call())).toMatchObject({
    actor: { id: 1 },
    line: "incoming",
  });
  g.tick = 76;
  expect(c.react(g, call())).toBeUndefined();
  c.reset();
  expect(c.react(g, { ...call(), team: "blue" } as Event)).toBeUndefined();
  expect(
    c.react(g, { ...call(), target: { x: 80, z: 80 } } as Event),
  ).toBeUndefined();
});
it("requires actual sight for an enemy grenade warning and respects death, mute and restart", () => {
  const { g, c } = scene();
  g.players[1].hp = 0;
  const thrown = () =>
    event(g, { type: "grenadeThrow", actor: 2, from: { x: 8, y: 1.5, z: 0 } });
  g.map.boxes.push({ kind: "barrier", x: 4, z: 0, w: 1, d: 8, h: 3 });
  expect(c.react(g, thrown())).toBeUndefined();
  g.map.boxes.pop();
  expect(c.react(g, thrown())).toMatchObject({
    actor: { id: 0 },
    line: "grenade",
  });
  c.reset();
  c.enabled = false;
  expect(c.react(g, thrown())).toBeUndefined();
  c.enabled = true;
  g.players[0].hp = 0;
  expect(c.react(g, thrown())).toBeUndefined();
  g.players[0].hp = 100;
  c.reset();
  expect(c.react(g, thrown())).toMatchObject({ line: "grenade" });
});
it("ships eight non-empty mono PCM speech clips without requiring speech synthesis at runtime or in CI", () => {
  for (const line of voiceLines)
    for (const variant of [0, 1]) {
      const bytes = readFileSync(
        new URL(
          `../public/audio/voices/${line}-${variant}.wav`,
          import.meta.url,
        ),
      );
      expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
      expect(bytes.toString("ascii", 8, 12)).toBe("WAVE");
      const fmt = bytes.indexOf("fmt "),
        data = bytes.indexOf("data");
      expect(bytes.readUInt16LE(fmt + 8)).toBe(1);
      expect(bytes.readUInt16LE(fmt + 10)).toBe(1);
      expect(bytes.readUInt32LE(fmt + 12)).toBe(22050);
      expect(bytes.readUInt16LE(fmt + 22)).toBe(16);
      const n = bytes.readUInt32LE(data + 4);
      expect(n).toBeGreaterThan(10000);
      expect(n).toBeLessThan(100000);
      let energy = 0;
      for (let i = data + 8; i < data + 8 + n; i += 2)
        energy += bytes.readInt16LE(i) ** 2;
      expect(Math.sqrt(energy / (n / 2))).toBeGreaterThan(1000);
    }
});
