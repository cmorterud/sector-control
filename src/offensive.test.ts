import { describe, expect, it, vi } from "vitest";
import { gallipoliMap } from "./gallipoli-map";
import { trenchMap } from "./trench-map";
import { groundHeight } from "./map";
import { Game, TestCollision, botCommand, idle, type Soldier } from "./simulation";
import { dominationMap, flagStatus, objectiveOpen, offensiveDuration, respawnTicks, teamSpawn } from "./offensive";
import { OffensiveNotices, offensiveBrief, offensiveClock, offensiveEndReason, offensiveStrip } from "./offensive-hud";
import { modeChoice } from "./ctf-hud";
import { ctfMap } from "./ctf";
import { dominationRules } from "./domination";
import { reinforcementsLeft } from "./reinforcements";
import { outOfReinforcements, reinforcementTally } from "./reinforcement-hud";
import { rosterRoles } from "./loadouts";

// Building the navigation graph for a field this size takes a few seconds on a busy machine.
vi.setConfig({ testTimeout: 120000 });

const plan = gallipoliMap.offensive!;
// A small, still match: nobody moves or fires unless a test puts them somewhere.
function still(teamSize = 6, map = gallipoliMap) {
  const g = new Game(new TestCollision(map), true, 3600, 1915, undefined, { map, humanPlayerIds: [], ambientArtillery: false, teamSize });
  g.commandOverride = () => idle();
  return g;
}
const stand = (g: Game, p: Soldier, id: string) => {
  const s = g.sectors.find((q) => q.id === id)!;
  Object.assign(p, { x: s.x + (p.teamIndex % 3) * 0.6 - 0.6, z: s.z, vx: 0, vz: 0 });
  p.y = groundHeight(p.x, p.z, g.map);
};
const blue = (g: Game) => g.players.filter((p) => p.team === "blue");
const red = (g: Game) => g.players.filter((p) => p.team === "red");
const run = (g: Game, ticks: number, each?: () => void) => {
  for (let i = 0; i < ticks && g.phase === "playing"; i++) {
    each?.();
    g.step(idle());
  }
};
// Holds the open phase's flags with the attackers until it falls.
function takePhase(g: Game) {
  const ids = g.offensive!.phases[g.offensive!.phase].map((i) => g.sectors[i].id);
  const team = blue(g);
  const hold = () => team.forEach((p, i) => p.hp > 0 && stand(g, p, ids[i % ids.length]));
  const phase = g.offensive!.phase;
  run(g, dominationRules.captureTicks * 2 + 30, () => { if (g.offensive!.phase === phase) hold(); });
}

describe("attack and defend", () => {
  it("starts with the defender holding every flag and only the first phase open", () => {
    const g = still();
    expect(g.scoring).toBe("domination");
    expect(g.scoreLimit).toBeNull();
    expect(g.sectors.map((s) => s.owner)).toEqual(["red", "red", "red", "red", "red", "red"]);
    expect(g.sectors.map((s) => flagStatus(g, s))).toEqual(["open", "open", "locked", "locked", "locked", "locked"]);
    expect(g.duration).toBe(offensiveDuration(plan) + 1);
    expect(offensiveClock(g)).toBe("05:00");
    // ANZAC gets two respawns a man; the Ottoman army is never counted.
    expect(g.reinforcements.remaining.blue).toBe(12);
    expect(reinforcementsLeft(g, "red")).toBe(true);
    expect(teamSpawn(g, "blue")).toEqual(gallipoliMap.spawn.blue);
    expect(teamSpawn(g, "red")).toEqual(plan.phases[0].spawn!.red);
    expect(red(g).every((p) => Math.abs(p.x - plan.phases[0].spawn!.red!.x) < 8)).toBe(true);
  });

  it("keeps a locked flag in the defender's hands however long the attacker stands on it", () => {
    const g = still();
    run(g, dominationRules.captureTicks * 2 + 30, () => blue(g).forEach((p) => stand(g, p, "C")));
    const c = g.sectors.find((s) => s.id === "C")!;
    expect(c.owner).toBe("red");
    expect(c.control).toBe(-1);
    expect(g.offensive!.phase).toBe(0);
  });

  it("locks a phase in the attacker's hands once it holds all of it, adds time and men, and moves both spawns", () => {
    const g = still();
    const notices = new OffensiveNotices();
    // A alone does not open the next phase.
    run(g, dominationRules.captureTicks * 2 + 30, () => blue(g).forEach((p) => stand(g, p, "A")));
    expect(g.sectors[0].owner).toBe("blue");
    expect(g.offensive!.phase).toBe(0);
    const before = { deadline: g.offensive!.deadline, pool: g.reinforcements.remaining.blue };
    let taken: Extract<Game["events"][number], { type: "offensive" }> | undefined;
    run(g, dominationRules.captureTicks * 2 + 30, () => {
      for (const e of g.events) if (e.type === "offensive") { taken = e; notices.event(g, e, 0); }
      if (!taken) blue(g).forEach((p) => stand(g, p, "B"));
    });
    expect(taken).toMatchObject({ phase: "taken", taken: 1, next: 1, flags: ["A", "B"], added: { seconds: 240, reinforcements: 6 } });
    expect(g.offensive!.deadline).toBe(before.deadline + 240 * 30);
    expect(g.reinforcements.remaining.blue).toBe(before.pool + 6);
    expect(g.sectors.map((s) => flagStatus(g, s))).toEqual(["taken", "taken", "open", "open", "locked", "locked"]);
    expect(teamSpawn(g, "blue")).toEqual(plan.phases[1].spawn!.blue);
    expect(teamSpawn(g, "red")).toEqual(plan.phases[1].spawn!.red);
    expect(notices.text(0)).toBe("TABLE TOP AND OWEN'S GULLY TAKEN · PHASE 2 OPEN · +04:00 · +6 REINFORCEMENTS");
    // The taken flags stay ANZAC's even with the defenders on them.
    run(g, dominationRules.captureTicks * 2 + 30, () => red(g).forEach((p) => stand(g, p, "A")));
    expect(g.sectors[0].owner).toBe("blue");
    // The next soldier to fall comes back on the new line.
    const p = blue(g)[1];
    g.redeploy(p.id);
    run(g, 160);
    expect(p.hp).toBeGreaterThan(0);
    expect(Math.abs(p.x - plan.phases[1].spawn!.blue!.x)).toBeLessThan(8);
  });

  it("is won by the attacker when the last phase falls", () => {
    const g = still();
    for (let phase = 0; phase < 3 && g.phase === "playing"; phase++) takePhase(g);
    expect(g.phase).toBe("ended");
    expect(g.winner).toBe("blue");
    expect(g.offensive!.result).toBe("taken");
    expect(g.scores).toEqual({ blue: 6, red: 0 });
    expect(offensiveEndReason(g)).toBe("ANZAC took every phase");
  });

  it("is won by the defender when the clock runs out", () => {
    const g = still();
    run(g, plan.clock.start * 30 + 5);
    expect(g.winner).toBe("red");
    expect(g.offensive!.result).toBe("time");
    expect(offensiveEndReason(g)).toBe("ANZAC ran out of time in phase 1");
  });

  it("is won by the defender when the attacker's pool is spent and its last man falls", () => {
    const g = still(3);
    // Game.damage is private; a test reaches it to fell a man with no pool left.
    const kill = (p: Soldier) => (g as unknown as { damage: (...a: unknown[]) => void }).damage(p, 200, -1, null, { kind: "redeploy", weapon: "Redeploy" });
    // The defender comes back as often as it falls, ten seconds later.
    const r = red(g)[0];
    kill(r);
    expect(r.respawnAt - g.tick).toBe(respawnTicks(g, "red"));
    expect(respawnTicks(g, "red")).toBe(300);
    expect(respawnTicks(g, "blue")).toBe(150);
    for (let i = 0; i < 6 && g.phase === "playing"; i++) {
      for (const p of blue(g)) if (p.hp > 0) kill(p);
      run(g, 160);
    }
    expect(g.reinforcements.remaining.blue).toBe(0);
    expect(outOfReinforcements(g, blue(g)[0])).toBe(true);
    expect(outOfReinforcements(g, r)).toBe(false);
    for (const p of blue(g)) if (p.hp > 0) kill(p);
    run(g, 2);
    expect(g.winner).toBe("red");
    expect(g.reinforcements.eliminated).toEqual(["blue"]);
  });

  it("shows the phase, the attacker's pool and padlocks on the locked flags", () => {
    const g = still();
    const strip = offensiveStrip(g);
    expect(strip).toContain("PHASE 1 / 3");
    expect(strip).toContain("ANZAC · 12 REINFORCEMENTS");
    expect(strip.match(/class="padlock"/g)).toHaveLength(4);
    expect(reinforcementTally(g)).toBe("");
    expect(offensiveBrief(gallipoliMap)).toContain("1: Table Top and Owen&#39;s Gully (A and B); 2: The Nek and Lone Pine (C and D); 3: Scrubby Knoll and Chunuk Bair (E and F)");
  });

  it("sends the bots only to the open phase's flags", () => {
    const g = new Game(new TestCollision(gallipoliMap), true, 3600, 1915, undefined, { map: gallipoliMap, humanPlayerIds: [], ambientArtillery: false });
    for (let i = 0; i < 60; i++) g.step(botCommand(g, g.players[0]));
    const bots = g.players.filter((p) => p.id !== 0 && p.hp > 0);
    expect(bots.every((p) => objectiveOpen(g, p.objective)), JSON.stringify(bots.map((p) => p.objective))).toBe(true);
    // Neither army brings a light machine gun; the slots go to riflemen.
    expect(g.players.some((p) => p.weapon === "machineGun" || p.loadout === "support")).toBe(false);
    expect(rosterRoles(50, false, true).filter((r) => r === "rifleman").length).toBeGreaterThan(25);
    expect(g.players.filter((p) => p.loadout === "rifleman").length).toBeGreaterThan(g.players.length / 2);
  });

  it("plays plain domination on the same field with ?mode=domination, and leaves other maps alone", () => {
    const map = dominationMap(gallipoliMap);
    expect(map.offensive).toBeUndefined();
    const g = still(6, map);
    expect(g.offensive).toBeUndefined();
    expect(g.scoreLimit).toBe(dominationRules.scoreLimit);
    expect(g.sectors.every((s) => s.owner === null && flagStatus(g, s) === "open")).toBe(true);
    expect(teamSpawn(g, "red")).toEqual(gallipoliMap.spawn.red);
    expect(dominationMap(trenchMap)).toBe(trenchMap);
    expect(ctfMap({ ...trenchMap, offensive: plan }).offensive).toBeUndefined();
    const choice = modeChoice(gallipoliMap, "offensive", new URLSearchParams("map=gallipoli"));
    expect(choice).toMatch(/<span aria-current="page"><strong>Attack and defend/);
    expect(choice).toContain('href="?map=gallipoli&mode=domination"');
    expect(modeChoice(gallipoliMap, "domination", new URLSearchParams("map=gallipoli&mode=domination"))).toContain('href="?map=gallipoli"');
  });
});
