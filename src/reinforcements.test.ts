import { describe, expect, it } from "vitest";
import { Game, TestCollision, botCommand, idle, type Event, type Soldier, type Team } from "./simulation";
import { finalPhase, finalPhaseTicks, lowThreshold, reinforcementRules } from "./reinforcements";
import {
  ReinforcementNotices,
  outOfReinforcements,
  reinforcementCountdown,
  reinforcementEndReason,
  reinforcementTally,
  spectateTarget,
} from "./reinforcement-hud";
import { trenchMap } from "./trench-map";
import { trainingMap } from "./training-map";
import { fortVauxMap } from "./fort-vaux-map";

// Small idle sides on Ypres: the rule only needs bodies, not tactics.
function scene(teamSize = 3, duration = 14400) {
  const g = new Game(new TestCollision(trenchMap), true, duration, 12345, undefined, {
    map: trenchMap,
    teamSize,
    assaults: false,
    ambientArtillery: false,
  });
  g.artillery.enabled = false;
  g.commandOverride = () => idle();
  return g;
}
const run = (g: Game, ticks: number) => {
  const events: Event[] = [];
  for (let i = 0; i < ticks && g.phase === "playing"; i++) {
    g.step(idle());
    events.push(...g.events);
  }
  return events;
};
// Into the final phase by the clock, one tick at a time across the boundary.
const openFinal = (g: Game) => {
  g.tick = g.reinforcements.clockAt - 1;
  return run(g, 1);
};
const kill = (g: Game, p: Soldier) => {
  if (!g.redeploy(p.id)) Object.assign(p, { hp: 0, respawnAt: g.tick + 150 });
};
const team = (g: Game, t: Team) => g.players.filter((p) => p.team === t);
const names = (t: Team) => (t === "blue" ? "Britain" : "Imperial Germany");

describe("final-phase reinforcements", () => {
  it("opens the final phase with two minutes left, a quarter of a shortened match", () => {
    const g = scene();
    expect(g.reinforcements.enabled).toBe(true);
    expect(g.reinforcements.clockAt).toBe(14400 - 120 * 30);
    g.tick = g.reinforcements.clockAt - 2;
    run(g, 1);
    expect(finalPhase(g)).toBe(false);
    const events = run(g, 1);
    expect(g.duration - g.tick).toBe(3600);
    expect(g.reinforcements).toMatchObject({ finalAt: g.tick, trigger: "clock", pool: { blue: 3, red: 3 } });
    expect(events.filter((e) => e.type === "reinforcements" && e.phase === "final")).toHaveLength(1);
    expect(run(g, 30).some((e) => e.type === "reinforcements" && e.phase === "final")).toBe(false);
    // ?duration=30: the last 7.5 seconds rather than a final phase longer than the match.
    expect(finalPhaseTicks(900)).toBe(225);
    const short = scene(3, 900);
    expect(short.reinforcements.clockAt).toBe(675);
    run(short, 674);
    expect(finalPhase(short)).toBe(false);
    run(short, 1);
    expect(short.reinforcements.trigger).toBe("clock");
  });

  it("opens early on the score tick a side reaches 80% of the limit", () => {
    const g = scene();
    expect(Math.ceil(g.scoreLimit! * reinforcementRules.scoreShare)).toBe(240);
    Object.assign(g.sectors[0], { owner: "red", control: -1 });
    g.scores.red = 239;
    run(g, 89);
    expect(finalPhase(g)).toBe(false);
    const events = run(g, 1);
    expect(g.scores.red).toBe(240);
    expect(g.reinforcements).toMatchObject({ finalAt: 90, trigger: "score" });
    expect(events.find((e) => e.type === "reinforcements")).toMatchObject({ phase: "final", trigger: "score" });
  });

  it("spends one reinforcement per respawn, including a death queued before the phase opened", () => {
    const g = scene(12);
    expect(g.reinforcements.pool).toEqual({ blue: 12, red: 12 });
    expect(lowThreshold(g, "blue")).toBe(3);
    // Free respawns before the final phase.
    const early = g.players[1];
    kill(g, early);
    run(g, 150);
    expect(early.hp).toBe(100);
    expect(g.reinforcements.remaining.blue).toBe(12);
    // Dying just before the whistle doesn't buy a free return.
    g.tick = g.reinforcements.clockAt - 50;
    const queued = g.players[2];
    kill(g, queued);
    run(g, 50);
    expect(finalPhase(g)).toBe(true);
    expect(queued.hp).toBe(0);
    run(g, 100);
    expect(queued.hp).toBe(100);
    expect(g.reinforcements.remaining).toEqual({ blue: 11, red: 12 });
    // Spend down to the low line and past it: one warning, then empty.
    const events: Event[] = [];
    for (let i = 0; i < 11; i++) {
      kill(g, g.players[3]);
      events.push(...run(g, 150));
    }
    expect(g.reinforcements.remaining.blue).toBe(0);
    expect(events.filter((e) => e.type === "respawn" && e.actor === 3)).toHaveLength(11);
    expect(events.filter((e) => e.type === "reinforcements" && e.phase === "low")).toEqual([
      expect.objectContaining({ team: "blue", remaining: 3 }),
    ]);
    expect(events.filter((e) => e.type === "reinforcements" && e.phase === "empty")).toEqual([
      expect.objectContaining({ team: "blue", remaining: 0 }),
    ]);
    expect(g.reinforcements.remaining.red).toBe(12);
  });

  it("keeps the dead down at zero, refuses redeploy and shows the player no countdown", () => {
    const g = scene();
    openFinal(g);
    const p = g.players[0];
    kill(g, p);
    expect(reinforcementCountdown(g, p, 5)).toBe("Redeploying in 5.0s · 3 reinforcements left");
    g.reinforcements.remaining.blue = 0;
    const events = run(g, 600);
    expect(g.phase).toBe("playing");
    expect(p.hp).toBe(0);
    expect(events.some((e) => e.type === "respawn")).toBe(false);
    expect(outOfReinforcements(g, p)).toBe(true);
    expect(reinforcementCountdown(g, p, -15)).toBe("No reinforcements · 2 of your side still stand");
    // A living soldier can't redeploy around the rule either.
    const mate = g.players[1];
    expect(g.redeploy(mate.id)).toBe(false);
    expect(mate.hp).toBe(100);
    // The enemy's pool is untouched and still works.
    const enemy = team(g, "red")[0];
    kill(g, enemy);
    run(g, 150);
    expect(enemy.hp).toBe(100);
    expect(g.reinforcements.remaining.red).toBe(2);
  });

  it("ends the match at once when a side has nobody standing and nothing left, whatever the score", () => {
    const g = scene();
    openFinal(g);
    g.scores = { blue: 120, red: 200 };
    g.reinforcements.remaining.red = 0;
    for (const p of team(g, "red").slice(0, 2)) kill(g, p);
    run(g, 30);
    expect(g.phase).toBe("playing");
    kill(g, team(g, "red")[2]);
    const events = run(g, 1);
    expect(g.phase).toBe("ended");
    expect(g.tick).toBeLessThan(g.duration);
    expect(g.winner).toBe("blue");
    expect(g.reinforcements.eliminated).toEqual(["red"]);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(["reinforcements", "end"]));
    expect(events.find((e) => e.type === "end")).toMatchObject({ winner: "blue" });
    expect(reinforcementEndReason(g, names)).toBe("Imperial Germany ran out of reinforcements");
  });

  it("doesn't eliminate a side whose dead are still waiting on reinforcements", () => {
    const g = scene();
    openFinal(g);
    for (const p of team(g, "red")) kill(g, p);
    run(g, 149);
    expect(g.phase).toBe("playing");
    run(g, 1);
    expect(team(g, "red").every((p) => p.hp === 100)).toBe(true);
    expect(g.reinforcements.remaining.red).toBe(0);
  });

  it("lets the flags decide when both sides fall on the same tick", () => {
    const g = scene();
    openFinal(g);
    g.scores = { blue: 150, red: 140 };
    g.reinforcements.remaining = { blue: 0, red: 0 };
    for (const p of g.players) kill(g, p);
    run(g, 1);
    expect(g.phase).toBe("ended");
    expect(g.reinforcements.eliminated).toEqual(["blue", "red"]);
    expect(g.winner).toBe("blue");
    expect(reinforcementEndReason(g, names)).toBe("Both sides ran out of reinforcements");
  });

  it("holds a low side's trench assaults", () => {
    const g = scene();
    openFinal(g);
    g.reinforcements.remaining.red = lowThreshold(g, "red");
    const blueReady = g.assaults.readyAt.blue;
    run(g, 1);
    expect(g.assaults.readyAt.red).toBeGreaterThan(g.tick);
    expect(g.assaults.readyAt.blue).toBe(blueReady);
  });

  it("leaves Training, a lone soldier and the time limit alone", () => {
    const t = new Game(new TestCollision(trainingMap), true, 14400, 1, undefined, { map: trainingMap });
    expect(t.reinforcements.enabled).toBe(false);
    t.tick = 20000;
    t.scores.blue = 299;
    const p = t.players[0];
    kill(t, p);
    run(t, 150);
    expect(p.hp).toBe(100);
    expect(finalPhase(t)).toBe(false);
    expect(t.events.some((e) => e.type === "reinforcements")).toBe(false);
    expect(reinforcementTally(t)).toBe("");
    // ?bots=0 has nobody to be eliminated by.
    const solo = new Game(new TestCollision(trenchMap), false, 900, 1, undefined, { map: trenchMap, ambientArtillery: false });
    expect(solo.reinforcements.enabled).toBe(false);
    run(solo, 900);
    expect(solo.phase).toBe("ended");
    expect(solo.reinforcements.finalAt).toBeNull();
    // An ordinary time-limit finish carries no reinforcement reason.
    const g = scene(3, 900);
    run(g, 900);
    expect(g.phase).toBe("ended");
    expect(g.reinforcements.eliminated).toEqual([]);
    expect(reinforcementEndReason(g, names)).toBe("");
  });

  it("describes the pools on the HUD and in the banners from the player's side", () => {
    const g = scene();
    expect(reinforcementTally(g)).toContain("LIMITED REINFORCEMENTS AT 02:00 OR 240 POINTS");
    const notices = new ReinforcementNotices();
    for (const e of openFinal(g)) notices.event(g, e, 0, names);
    expect(notices.text(0)).toBe("FINAL PHASE · 3 REINFORCEMENTS EACH · THEN THE FALLEN STAY DOWN");
    expect(notices.text(10000)).toBe("");
    expect(reinforcementTally(g)).toMatch(/<b class="blue">3<\/b><small>REINFORCEMENTS<\/small><b class="red">3<\/b>/);
    for (const e of [{ type: "reinforcements", phase: "empty", team: "red", remaining: 0 }] as const)
      notices.event(g, { ...e, id: 0, tick: g.tick }, 0, names);
    g.reinforcements.remaining.red = 2;
    expect(reinforcementTally(g)).toContain('<b class="red low">2</b>');
    expect(notices.text(0)).toBe("IMPERIAL GERMANY HAS NO REINFORCEMENTS · FINISH THEM");
    expect(notices.urgent(0)).toBe(false);
    notices.event(g, { type: "reinforcements", phase: "low", team: "blue", remaining: 2, id: 0, tick: g.tick }, 0, names);
    expect(notices.text(0)).toBe("REINFORCEMENTS LOW · 2 LEFT");
    expect(notices.urgent(0)).toBe(true);
  });

  it("lets the player watch living teammates once their death report has run", () => {
    const g = scene();
    openFinal(g);
    const p = g.players[0];
    g.reinforcements.remaining.blue = 0;
    kill(g, p);
    expect(spectateTarget(g, null)).toBeNull();
    run(g, 150);
    expect(spectateTarget(g, null)).toBe(1);
    expect(spectateTarget(g, 1)).toBe(1);
    expect(spectateTarget(g, 1, true)).toBe(2);
    expect(spectateTarget(g, 2, true)).toBe(1);
    kill(g, g.players[1]);
    run(g, 1);
    expect(spectateTarget(g, 1)).toBe(2);
    // Never an enemy, and nothing once the side is down to nobody.
    expect(team(g, "red").map((q) => q.id)).not.toContain(spectateTarget(g, 2, true));
  });

  it("keeps its state in the serializable snapshot", () => {
    const g = scene();
    openFinal(g);
    g.reinforcements.remaining.red = 1;
    expect(g.snapshot().reinforcements).toEqual(g.reinforcements);
  });
});

it("finishes a seeded Fort Vaux bot battle with the reinforcement rule in force", () => {
  const g = new Game(new TestCollision(fortVauxMap), true, 14400, 12345, undefined, { map: fortVauxMap, humanPlayerIds: [] });
  const respawns = { blue: 0, red: 0 };
  let finalAt: number | null = null;
  while (g.phase === "playing") {
    const empty = { ...g.reinforcements.remaining };
    g.step(g.players[0].hp > 0 ? botCommand(g, g.players[0]) : idle());
    if (finalAt === null && finalPhase(g)) finalAt = g.tick;
    for (const e of g.events)
      // Respawns on the opening tick come before the phase does, and are free.
      if (e.type === "respawn" && g.reinforcements.finalAt !== null && e.tick > g.reinforcements.finalAt) {
        const t = g.players[e.actor].team;
        // Nobody came back after their side's pool was already spent.
        expect(empty[t]).toBeGreaterThan(0);
        respawns[t]++;
      }
    expect(g.players.every((p) => Number.isFinite(p.x + p.y + p.z + p.hp))).toBe(true);
  }
  const r = g.reinforcements;
  expect(finalAt).toBe(r.finalAt);
  expect(r.finalAt).toBeLessThanOrEqual(10800);
  expect(r.pool).toEqual({ blue: 6, red: 6 });
  for (const t of ["blue", "red"] as const) {
    expect(respawns[t]).toBe(r.pool[t] - r.remaining[t]);
    expect(respawns[t]).toBeGreaterThan(0);
  }
  // Attrition after the pools run dry is what the rule is for.
  expect(Math.min(r.remaining.blue, r.remaining.red)).toBe(0);
  const decided = r.eliminated.length === 1;
  expect(g.winner).toBe(
    decided ? (r.eliminated[0] === "blue" ? "red" : "blue")
      : g.scores.blue === g.scores.red ? "draw" : g.scores.blue > g.scores.red ? "blue" : "red",
  );
}, 60000);
