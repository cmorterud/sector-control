import type { Game, Soldier, Team } from "./simulation";

// Limited reinforcements in the final phase of a domination or capture the
// flag match. Until then
// respawns are free; from then on each one spends from a team pool, and at
// zero the dead stay dead. A side with nobody standing and nothing left in
// its pool loses on the spot, so a stalemate can't simply run out the clock.
export const reinforcementRules = {
  // The final phase opens with two minutes left, or the last quarter of a
  // shortened (?duration=) match, whichever is shorter.
  finalTicks: 120 * 30,
  finalShare: 0.25,
  // ...or as soon as either side is within reach of the score limit (in
  // capture the flag, 4 of the 5 captures).
  scoreShare: 0.8,
  // Respawns per soldier. Measured bot battles lose about one to three
  // soldiers per man in two minutes, so one each runs the harder-pressed side
  // dry with half a minute to a minute left, without emptying the map
  // (tools/reinforcement-audit.ts).
  perSoldier: 1,
  // Your HUD warns, and bots stop launching trench assaults, at or below this
  // share of the pool.
  lowShare: 0.25,
  lowMinimum: 3,
  // Assault planning re-checks once a second; hold it a little past that.
  assaultHoldTicks: 45,
};

export interface ReinforcementState {
  enabled: boolean;
  // Tick at which the clock opens the final phase.
  clockAt: number;
  finalAt: number | null;
  trigger: "clock" | "score" | null;
  pool: Record<Team, number>;
  remaining: Record<Team, number>;
  low: Record<Team, boolean>;
  // The side or sides that ran out with nobody standing.
  eliminated: Team[];
}

export type ReinforcementEvent =
  | { type: "reinforcements"; phase: "final"; trigger: "clock" | "score"; pool: Record<Team, number> }
  | { type: "reinforcements"; phase: "low" | "empty"; team: Team; remaining: number }
  | { type: "reinforcements"; phase: "eliminated"; team: Team };

const teams = ["blue", "red"] as const;
const other = (t: Team): Team => (t === "blue" ? "red" : "blue");

export const finalPhaseTicks = (duration: number) =>
  Math.min(reinforcementRules.finalTicks, Math.round(duration * reinforcementRules.finalShare));

export function createReinforcements(g: Game): ReinforcementState {
  const count = (t: Team) => g.players.filter((p) => p.team === t).length;
  const size = { blue: count("blue"), red: count("red") };
  // Training keeps its own respawn rules, and a lone soldier with no enemy
  // (?bots=0) can't be eliminated by anyone.
  const enabled = (g.scoring === "domination" || g.scoring === "ctf") && g.scoreLimit !== null && size.blue > 0 && size.red > 0;
  const pool = {
    blue: Math.max(1, Math.round(size.blue * reinforcementRules.perSoldier)),
    red: Math.max(1, Math.round(size.red * reinforcementRules.perSoldier)),
  };
  return {
    enabled,
    clockAt: g.duration - finalPhaseTicks(g.duration),
    finalAt: null,
    trigger: null,
    pool,
    remaining: { ...pool },
    low: { blue: false, red: false },
    eliminated: [],
  };
}

export const finalPhase = (g: Game) => g.reinforcements.enabled && g.reinforcements.finalAt !== null;

// Whether a soldier of this team could come back now.
export const reinforcementsLeft = (g: Game, team: Team) =>
  !finalPhase(g) || g.reinforcements.remaining[team] > 0;

// Never "low" from the start, however small the side.
export const lowThreshold = (g: Game, team: Team) => {
  const pool = g.reinforcements.pool[team];
  return Math.min(pool - 1, Math.max(reinforcementRules.lowMinimum, Math.ceil(pool * reinforcementRules.lowShare)));
};

// Called when a dead soldier's respawn comes due: spends one if the final
// phase is on, and refuses when the pool is empty.
export function takeReinforcement(g: Game, p: Soldier): boolean {
  const r = g.reinforcements;
  if (!finalPhase(g)) return true;
  if (r.remaining[p.team] <= 0) return false;
  r.remaining[p.team]--;
  if (!r.remaining[p.team]) g.emit({ type: "reinforcements", phase: "empty", team: p.team, remaining: 0 });
  else if (!r.low[p.team] && r.remaining[p.team] <= lowThreshold(g, p.team)) {
    r.low[p.team] = true;
    g.emit({ type: "reinforcements", phase: "low", team: p.team, remaining: r.remaining[p.team] });
  }
  return true;
}

// Runs once a tick after flag scoring. Opens the final phase, keeps low bots
// from going over the top, and returns the winner when a side is wiped out.
export function advanceReinforcements(g: Game): Team | "draw" | undefined {
  const r = g.reinforcements;
  if (!r.enabled || g.phase !== "playing") return undefined;
  if (r.finalAt === null) {
    const limit = g.scoreLimit! * reinforcementRules.scoreShare;
    const trigger = g.tick >= r.clockAt ? "clock" : Math.max(g.scores.blue, g.scores.red) >= limit ? "score" : null;
    if (!trigger) return undefined;
    r.finalAt = g.tick;
    r.trigger = trigger;
    g.emit({ type: "reinforcements", phase: "final", trigger, pool: { ...r.pool } });
  }
  for (const team of teams)
    // A side short of men holds what it has rather than charging across
    // open ground it can no longer replace.
    if (r.remaining[team] <= lowThreshold(g, team))
      g.assaults.readyAt[team] = Math.max(g.assaults.readyAt[team], g.tick + reinforcementRules.assaultHoldTicks);
  const out = teams.filter(
    (team) => !r.remaining[team] && !g.players.some((p) => p.team === team && p.hp > 0),
  );
  if (!out.length) return undefined;
  r.eliminated = out;
  for (const team of out) g.emit({ type: "reinforcements", phase: "eliminated", team });
  if (out.length === 1) return other(out[0]);
  // Both sides fell on the same tick: the flags decide it.
  return g.scores.blue === g.scores.red ? "draw" : g.scores.blue > g.scores.red ? "blue" : "red";
}
