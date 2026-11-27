// Attack and defend on the HUD and in the briefing: the phase strip under the
// score, flag labels, the clock, announcer banners and the end of match line.
// Strings only, so it reads game state without touching the DOM.
import { factionFor, factions } from "./loadouts";
import { flagStatus, type OffensiveState } from "./offensive";
import type { MapDefinition } from "./map";
import type { Event, Game, Sector, Team } from "./simulation";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const name = (map: Pick<MapDefinition, "id">, team: Team) => factions[factionFor(map, team)].name;
const clock = (ticks: number) => {
  const s = Math.max(0, Math.ceil(ticks / 30));
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
};
const flagNames = (map: Pick<MapDefinition, "sectors">, ids: string[]) => {
  const names = ids.map((id) => map.sectors.find((s) => s.id === id)?.name ?? id);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0] ?? "";
};
const minutes = (seconds: number) => (seconds % 60 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : `${seconds / 60}`);

// A small padlock for locked flags, drawn in the text colour.
export const padlock = `<svg class="padlock" viewBox="0 0 10 12" aria-hidden="true"><path d="M2.5 5V3.5a2.5 2.5 0 0 1 5 0V5" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="1" y="5" width="8" height="6.5" rx="1" fill="currentColor"/></svg>`;

// The time the attack has left.
export const offensiveClock = (g: Game) => clock(g.offensive!.deadline - g.tick);

// Briefing paragraph for a map that plays attack and defend.
export function offensiveBrief(map: MapDefinition) {
  const plan = map.offensive!;
  const attacker = escape(name(map, plan.attacker)), defender = escape(name(map, plan.attacker === "blue" ? "red" : "blue"));
  const phases = plan.phases.map((p, i) => `${i + 1}: ${escape(flagNames(map, p.flags))} (${p.flags.join(" and ")})`).join("; ");
  return `${attacker} attacks and ${defender} defends. ${defender} starts holding every flag. Take them phase by phase: ${phases}. Only the open phase's flags can be captured; later flags are locked. Once every flag of a phase is yours it locks in your hands and the next opens. The attack starts with ${minutes(plan.clock.start)} minutes and ${plan.pool.perSoldier} reinforcements per soldier; each phase taken adds ${minutes(plan.clock.perPhase)} minutes and ${plan.pool.perPhase} more per soldier, ${attacker} deploys closer behind the line it took, and ${defender} falls back to the next. Capture works as in domination: neutralize, then hold the ring for 15 seconds. ${defender} redeploys without limit, ${plan.defenderRespawn ?? 5} seconds after falling. ${attacker} wins by taking the last phase; ${defender} wins if the clock runs out, or if ${attacker} runs out of reinforcements with nobody left standing.`;
}

// The strip under the score: the phase, the attacker's pool and each flag.
export function offensiveStrip(g: Game) {
  const o = g.offensive!, r = g.reinforcements;
  const attacker = name(g.map, o.attacker).toUpperCase();
  const phase = Math.min(o.phase + 1, o.phases.length);
  const left = r.remaining[o.attacker];
  const low = left <= Math.max(3, Math.ceil(r.pool[o.attacker] * 0.25));
  const tag = `<span class="mode-tag offensive-tag">PHASE ${phase} / ${o.phases.length}<small class="${o.attacker}${low ? " low" : ""}">${escape(attacker)} · ${left} ${left === 1 ? "REINFORCEMENT" : "REINFORCEMENTS"}</small></span>`;
  const chip = (s: Sector, i: number) => {
    const status = flagStatus(g, i);
    const state = status === "open" ? (s.contested ? "contested" : (s.owner ?? "")) : s.owner ?? "";
    const title = `${s.id}${s.name ? " · " + s.name : ""} · ${status === "locked" ? "Locked until an earlier phase falls" : status === "taken" ? "Taken and locked" : s.contested ? "Contested" : s.owner ? `Held by ${name(g.map, s.owner)}` : "Neutral"}`;
    return `<span class="sector flag-sector ${state} ${status}" title="${escape(title)}">${s.id}${status === "open" ? "" : padlock}<div class="bar"><i class="${s.control < 0 ? "redbar" : ""}" style="width:${Math.abs(s.control) * 100}%"></i></div></span>`;
  };
  return tag + g.sectors.map(chip).join("");
}

// The flag the player stands on, for the capture prompt.
export function offensiveFlagNote(g: Game, s: Sector) {
  const status = flagStatus(g, s);
  return status === "locked" ? "LOCKED · TAKE THE EARLIER PHASE FIRST" : status === "taken" ? "TAKEN · LOCKED" : undefined;
}

export function offensiveEndReason(g: Game) {
  const o = g.offensive;
  if (!o) return "";
  const attacker = name(g.map, o.attacker);
  if (o.result === "taken") return `${attacker} took every phase`;
  if (o.result === "time") return `${attacker} ran out of time in phase ${o.phase + 1}`;
  return "";
}

// The end of match line's mode and score: phases taken, not points.
export const offensiveSummary = (o: OffensiveState) => `Attack and defend · ${Math.min(o.phase, o.phases.length)} of ${o.phases.length} phases taken`;

// Banners for a phase falling and for the clock, worded from the player's side.
export class OffensiveNotices {
  private notice = { text: "", until: 0, urgent: false };
  private warned = new Set<string>();
  reset() { this.notice = { text: "", until: 0, urgent: false }; this.warned.clear(); }
  event(g: Game, e: Event, now: number) {
    const o = g.offensive;
    if (e.type !== "offensive" || !o) return;
    const attacking = g.players[0].team === o.attacker;
    if (e.phase === "taken") {
      const places = flagNames(g.map, e.flags).toUpperCase();
      this.notice = {
        text: e.next === null
          ? `${places} TAKEN`
          : `${places} TAKEN · PHASE ${e.next + 1} OPEN · +${clock(e.added.seconds * 30)} · ${attacking ? `+${e.added.reinforcements} REINFORCEMENTS` : "FALL BACK TO THE NEXT LINE"}`,
        until: now + 6000,
        urgent: !attacking,
      };
    }
  }
  // A minute and then ten seconds before the clock runs out.
  tick(g: Game, now: number) {
    const o = g.offensive;
    if (!o || g.phase !== "playing") return;
    const left = Math.ceil((o.deadline - g.tick) / 30);
    for (const mark of [60, 10]) {
      const key = `${o.deadline}:${mark}`;
      if (left > mark || left <= mark - 3 || this.warned.has(key)) continue;
      this.warned.add(key);
      {
        const attacking = g.players[0].team === o.attacker;
        this.notice = { text: `${mark === 60 ? "ONE MINUTE" : "TEN SECONDS"} LEFT · ${attacking ? "TAKE THE OPEN FLAGS" : "HOLD ON"}`, until: now + 4000, urgent: attacking };
      }
    }
  }
  text(now: number) { return now < this.notice.until ? this.notice.text : ""; }
  urgent(now: number) { return now < this.notice.until && this.notice.urgent; }
}
