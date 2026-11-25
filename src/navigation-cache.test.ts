import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { Game, TestCollision, botCommand, idle, prepareNavigation } from "./simulation";
import { trenchMap } from "./trench-map";
import { battlePerformance } from "./battle-performance";
import { addDestructible, destructibles, runtimeMap } from "./destruction";

// Every match on a map shares one prebuilt graph of the untouched map. A
// match must play out exactly as if it had built its own, and one match's
// craters must not leak into the next.
function play(ticks: number) {
  const g = new Game(new TestCollision(trenchMap), true, ticks + 1, 12345, undefined, { map: trenchMap });
  const hash = createHash("sha256");
  let destruction = 0;
  for (let i = 0; i < ticks; i++) {
    g.step(g.players[0].hp > 0 ? botCommand(g, g.players[0]) : idle());
    for (const e of g.events) if (e.type === "destruction") destruction++;
    hash.update(JSON.stringify(g.events));
  }
  hash.update(JSON.stringify(g.snapshot()));
  return { hash: hash.digest("hex"), destruction };
}

describe("shared navigation graph", () => {
  it("replays identically after earlier matches cratered the same map", () => {
    const first = play(600);
    expect(first.destruction).toBeGreaterThan(0);
    expect(play(600)).toEqual(first);
  }, 60_000);
  it("is built ahead of the match, not on its first path request", () => {
    prepareNavigation(trenchMap);
    battlePerformance.enabled = true;
    battlePerformance.reset();
    try {
      const g = new Game(new TestCollision(trenchMap), true, 10, 12345, undefined, { map: trenchMap });
      prepareNavigation(g.map);
      g.step(idle());
      expect(battlePerformance.summary().stages.navigationBuild).toBeUndefined();
    } finally {
      battlePerformance.enabled = false;
    }
  });
});

describe("destructible lists", () => {
  it("include objects added after the lists were first read", () => {
    const map = runtimeMap(trenchMap), state = map.destruction!;
    const before = destructibles(state).all.length;
    addDestructible(state, { id: "added", original: { id: "added", kind: "rubble", x: 0, z: 0, w: 1, d: 1, h: 0.4 }, hp: 10, maxHp: 10, stage: 0, lining: false });
    expect(destructibles(state).all.length).toBe(before + 1);
    expect(destructibles(state).all.at(-1)?.id).toBe("added");
    expect(destructibles(state).all.map((o) => o.id)).toEqual(Object.keys(state.objects));
  });
});
