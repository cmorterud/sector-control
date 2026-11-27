import { expect, it, vi } from "vitest";
import { gallipoliMap } from "./gallipoli-map";
import { groundHeight } from "./map";
import { Game, TestCollision, idle, type Soldier } from "./simulation";
import { reactToThreat, reactionCoverCommand } from "./combat-reaction";
import { dominationMap, flagStatus, inLockedRing } from "./offensive";

vi.setConfig({ testTimeout: 120000 });

const game = (map = gallipoliMap) => {
  const g = new Game(new TestCollision(map), true, 3600, 11, undefined, { map, humanPlayerIds: [], ambientArtillery: false, teamSize: 4 });
  g.commandOverride = () => idle();
  return g;
};
// Put a soldier at (x, z) under fire from `from`, and ask for a cover move a few ticks later.
function underFire(g: Game, p: Soldier, x: number, z: number, from: { x: number; z: number }) {
  Object.assign(p, { x, z, y: groundHeight(x, z, g.map), vx: 0, vz: 0, hp: 100, protectedUntil: 0, nextCombatCover: 0, combatCover: null });
  g.tick += 40;
  reactToThreat(g, p, { x: from.x, y: groundHeight(from.x, from.z, g.map) + 1.6, z: from.z }, "nearMiss", 0.9);
  g.tick += 8;
  return reactionCoverCommand(g, p);
}

it("keeps bots from going to ground in a locked flag's ring", () => {
  const g = game();
  const e = g.sectors.find((s) => s.id === "E")!, red = g.players.find((p) => p.id !== 0 && p.team === "red")!;
  expect(flagStatus(g, g.sectors.indexOf(e))).toBe("locked");
  expect(inLockedRing(g, e)).toBe(true);
  // Shot at in E's pit during phase 1: no cover move there; the soldier carries on.
  const c = underFire(g, red, e.x + 1, e.z, { x: e.x - 30, z: e.z });
  expect(red.combatCover ?? null).toBeNull();
  expect(c).toBeNull();
  // In plain domination no flag is locked, and the pit is fair cover.
  const d = game(dominationMap(gallipoliMap));
  expect(inLockedRing(d, d.sectors.find((s) => s.id === "E")!)).toBe(false);
});

it("never picks cover inside a locked ring from just outside it", () => {
  const g = game();
  const red = g.players.find((p) => p.id !== 0 && p.team === "red")!;
  let tried = 0;
  for (const s of g.sectors) {
    if (flagStatus(g, g.sectors.indexOf(s)) === "open") continue;
    for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const x = s.x + Math.cos(angle) * 8, z = s.z + Math.sin(angle) * 8;
      underFire(g, red, x, z, { x: x - 30 * Math.cos(angle), z: z - 30 * Math.sin(angle) });
      tried++;
      if (red.combatCover) expect(inLockedRing(g, red.combatCover.goal)).toBe(false);
    }
  }
  expect(tried).toBe(16);
});
