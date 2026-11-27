import { describe, expect, it } from "vitest";
import { battlefields, battleModes } from "./battlefields";
import { flagPosition } from "./ctf";
import { dist } from "./map";
import { Game, TestCollision, botCommand, idle, prepareNavigation } from "./simulation";
import { supportsTanks } from "./tanks";

// Shared by src/bot-progress-*.test.ts, which vitest runs in parallel.
// Seeded, headless all-bot battles on every battlefield in every mode it
// offers (src/battlefields.ts), so a new map or mode is covered as soon as it
// is listed there. Each soldier must get clear of where it spawned, and the
// battle must move: flags change hands or enemy flags are taken.
export const botProgressRules = {
  // Simulated seconds per battle.
  seconds: 50,
  // A soldier has left its spawn once it is this far from where it appeared.
  leave: 12,
  // ...and it must do so within this long of appearing, unless it dies first.
  within: 35,
};

// The tutorial range runs scripted lessons rather than a battle.
const skipped = new Set(["training"]);

export const botProgressCases = battlefields.filter((map) => !skipped.has(map.id))
  .flatMap((field) => battleModes(field).map((mode) => ({ name: `${field.id} ${mode.id}`, map: mode.map, mode: mode.id })));

// Soldiers whose orders keep them at a post that may stand near their spawn:
// gun and mortar crews in action, and capture the flag guards beside the
// flag they guard. Anyone else still at the spawn is stranded.
function atPost(g: Game, p: Game["players"][number]) {
  if (p.mountedGun !== undefined || p.mode === "Laying mortar") return true;
  const role = g.ctf?.roles[p.id];
  const flag = role?.kind === "guard" ? g.ctf!.flags.find((f) => f.id === role.flag) : undefined;
  const at = flag && flagPosition(g, flag);
  return !!at && dist(p, at) < 15;
}

interface Life { at: { x: number; z: number }; tick: number; left: boolean }

function battle(map: (typeof botProgressCases)[number]["map"]) {
  const g = new Game(new TestCollision(map), true, 480 * 30, 12345, { difficulty: "regular" }, {
    map, humanPlayerIds: [], tanks: supportsTanks(map), rain: true,
  });
  prepareNavigation(g.map);
  const lives = new Map<number, Life>();
  const stranded: string[] = [];
  let captures = 0, takes = 0;
  const limit = botProgressRules.within * 30;
  while (g.phase === "playing" && g.tick < botProgressRules.seconds * 30) {
    g.step(g.players[0].hp > 0 ? botCommand(g, g.players[0]) : idle());
    for (const e of g.events) {
      if (e.type === "capture") captures++;
      if (e.type === "flag" && e.action === "take") takes++;
    }
    for (const p of g.players) {
      if (p.hp <= 0) { lives.delete(p.id); continue; }
      let life = lives.get(p.id);
      if (!life) lives.set(p.id, life = { at: { x: p.x, z: p.z }, tick: g.tick, left: false });
      if (life.left) continue;
      if (dist(p, life.at) >= botProgressRules.leave) life.left = true;
      else if (g.tick - life.tick === limit && !atPost(g, p))
        stranded.push(`${p.team} ${p.id} (${p.weapon}, ${p.mode}) spawned at ${life.at.x.toFixed(1)},${life.at.z.toFixed(1)}, now ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
    }
  }
  return { g, stranded, captures, takes };
}

// Defines the tests for every `count`th case from `shard`: the battles take
// about 90 s in all, so three files share them.
export function botProgressShard(shard: number, count: number) {
  describe("bots leave the spawn and make progress", () => {
    if (shard === 0) it("covers every offered battlefield and mode", () => {
      expect(botProgressCases.length).toBeGreaterThanOrEqual(battlefields.length - skipped.size);
    });
    botProgressCases.forEach((c, i) => {
      if (i % count !== shard) return;
      it(c.name, { timeout: 120_000 }, () => {
        const { stranded, captures, takes } = battle(c.map);
        expect(stranded, `${c.name}: soldiers still within ${botProgressRules.leave} m of their spawn after ${botProgressRules.within} s`).toEqual([]);
        if (c.mode === "ctf") expect(takes, `${c.name}: no enemy flag taken in ${botProgressRules.seconds} s`).toBeGreaterThan(0);
        else expect(captures, `${c.name}: no flag captured in ${botProgressRules.seconds} s`).toBeGreaterThan(0);
      });
    });
  });
}
