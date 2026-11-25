import { finalPhase, finalPhaseTicks, lowThreshold, reinforcementRules } from "./reinforcements";
import type { Event, Game, Soldier, Team } from "./simulation";

// HUD text for the final phase's limited reinforcements. Strings only, so the
// wording is testable without a DOM; main.ts places them.
type Names = (team: Team) => string;
const clock = (ticks: number) => {
  const s = Math.ceil(ticks / 30);
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
};
const noticeMs = 6000;

// The pools under the score, or before the final phase what is coming.
export function reinforcementTally(g: Game): string {
  const r = g.reinforcements;
  if (!r.enabled) return "";
  if (!finalPhase(g))
    return `<small class="reinforcement-hint">LIMITED REINFORCEMENTS AT ${clock(finalPhaseTicks(g.duration))} OR ${Math.ceil(g.scoreLimit! * reinforcementRules.scoreShare)} ${g.scoring === "ctf" ? "CAPTURES" : "POINTS"}</small>`;
  const count = (team: Team) =>
    `<b class="${team}${r.remaining[team] <= lowThreshold(g, team) ? " low" : ""}">${r.remaining[team]}</b>`;
  return `<div class="reinforcement-tally" title="Respawns each side has left. At zero its fallen stay down.">${count("blue")}<small>REINFORCEMENTS</small>${count("red")}</div>`;
}

// Whether this soldier is down for the rest of the match.
export const outOfReinforcements = (g: Game, p: Soldier) =>
  p.hp <= 0 && finalPhase(g) && g.reinforcements.remaining[p.team] <= 0;

// The death card's line in place of the respawn countdown, if it changes.
export function reinforcementCountdown(g: Game, p: Soldier, seconds: number): string | undefined {
  if (!finalPhase(g)) return undefined;
  if (outOfReinforcements(g, p)) {
    const standing = g.players.filter((q) => q.team === p.team && q.hp > 0).length;
    return `No reinforcements · ${standing} of your side still ${standing === 1 ? "stands" : "stand"}`;
  }
  const left = g.reinforcements.remaining[p.team];
  return `Redeploying in ${Math.max(0, seconds).toFixed(1)}s · ${left} ${left === 1 ? "reinforcement" : "reinforcements"} left`;
}

// The teammate to watch while out: keep the current one while they live,
// else (or when asked for the next) the next living teammate by roster order.
// The usual five-second death report and killer view come first.
export function spectateTarget(g: Game, current: number | null, next = false): number | null {
  const p = g.players[0];
  if (!outOfReinforcements(g, p) || g.tick < p.respawnAt) return null;
  const mates = g.players.filter((q) => q.team === p.team && q.id !== p.id && q.hp > 0);
  if (!next && mates.some((q) => q.id === current)) return current;
  return (mates.find((q) => q.id > (current ?? -1)) ?? mates[0])?.id ?? null;
}

export function reinforcementEndReason(g: Game, names: Names): string {
  const out = g.reinforcements.eliminated;
  if (!out.length) return "";
  return out.length === 2
    ? "Both sides ran out of reinforcements"
    : `${names(out[0])} ran out of reinforcements`;
}

// Banners for the phase change and for either side running low or dry,
// worded from the player's side.
export class ReinforcementNotices {
  private notice = { text: "", until: 0, urgent: false };
  reset() { this.notice = { text: "", until: 0, urgent: false }; }
  event(g: Game, e: Event, now: number, names: Names) {
    if (e.type !== "reinforcements" || !g.reinforcements.enabled) return;
    const mine = g.players[0].team;
    const show = (text: string, urgent = false) => { this.notice = { text, until: now + noticeMs, urgent }; };
    if (e.phase === "final") {
      const pools = `${e.pool[mine]} REINFORCEMENTS ${e.pool.blue === e.pool.red ? "EACH" : "FOR YOUR SIDE"}`;
      const leader = g.scores.blue >= g.scores.red ? "blue" : "red";
      show(`FINAL PHASE${e.trigger === "score" ? ` · ${names(leader).toUpperCase()} NEARS VICTORY` : ""} · ${pools} · THEN THE FALLEN STAY DOWN`);
    } else if (e.phase === "low" && e.team === mine)
      show(`REINFORCEMENTS LOW · ${e.remaining} LEFT`, true);
    else if (e.phase === "empty")
      show(e.team === mine
        ? "NO REINFORCEMENTS LEFT · HOLD ON · IF YOUR SIDE FALLS, IT LOSES"
        : `${names(e.team).toUpperCase()} HAS NO REINFORCEMENTS · FINISH THEM`, e.team === mine);
  }
  text(now: number) { return now < this.notice.until ? this.notice.text : ""; }
  urgent(now: number) { return now < this.notice.until && this.notice.urgent; }
}
