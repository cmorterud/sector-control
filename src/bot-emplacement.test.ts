import { expect, it } from "vitest";
import { Game, TestCollision, idle, type Event } from "./simulation";
import { springOffensiveMap } from "./spring-offensive-map";

it("emplacement bots set their guns down, sit behind them and fire", () => {
  const g = new Game(new TestCollision(springOffensiveMap), true, 30 * 600, 11, undefined, { map: springOffensiveMap, teamSize: 24, ambientArtillery: false, humanPlayerIds: [] });
  g.artillery.enabled = false;
  const gunners = g.players.filter(p => p.loadout === "emplacement");
  expect(gunners.length).toBe(2);
  const seen = new Set<string>();
  let gunShots = 0;
  for (let i = 0; i < 30 * 90; i++) {
    g.step(idle());
    for (const e of g.events as Event[]) {
      if (e.type === "emplacement") seen.add(e.phase);
      if (e.type === "fire" && e.emplacement !== undefined) gunShots++;
    }
  }
  expect(seen.has("deploy")).toBe(true);
  expect(seen.has("mount")).toBe(true);
  expect(gunShots).toBeGreaterThan(0);
}, 30000);
