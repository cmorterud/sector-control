// Capture the flag on the HUD and in the briefing: the flag strip under the
// score, labels over stands, carriers and dropped flags, the carrier's own
// prompt, announcer lines and kill-feed entries. Strings only, so it reads
// game state without touching the DOM.
import { factionFor, factions } from "./loadouts";
import { soldierName } from "./soldier-names";
import { carriedFlag, ctfRules, flagPosition, supportsCtf, type CtfEvent, type CtfFlag } from "./ctf";
import { dist, type MapDefinition } from "./map";
import type { Event, Game, Soldier, Team, V3 } from "./simulation";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const seconds = (ticks: number) => Math.max(0, Math.ceil(ticks / 30));
export const teamName = (g: Pick<Game, "map">, team: Team) => factions[factionFor(g.map, team)].name;
const other = (team: Team): Team => (team === "blue" ? "red" : "blue");

// Domination or capture the flag on a map that offers both, as briefing links.
export function modeChoice(map: MapDefinition, ctf: boolean, query: URLSearchParams) {
  if (!supportsCtf(map)) return "";
  const link = (mode: "domination" | "ctf", label: string, note: string) => {
    const q = new URLSearchParams(query);
    if (mode === "ctf") q.set("mode", "ctf");
    else q.delete("mode");
    const content = `<strong>${label}</strong><small>${note}</small>`;
    return (mode === "ctf") === ctf ? `<span aria-current="page">${content}</span>` : `<a href="?${q}">${content}</a>`;
  };
  return `<nav class="mode-choice" aria-label="Game mode">${link("domination", "Domination", "Hold flags to score")}${link("ctf", "Capture the flag", `Three flags a side · first to ${ctfRules.captureLimit}`)}</nav>`;
}

export function ctfBrief(g: Pick<Game, "map">) {
  return `Cross no-man's land, take an enemy flag from any of its three pickup points and carry it back to your own drop point in the support trench. Each capture scores one; first to ${ctfRules.captureLimit} wins, or the higher score after eight minutes. Tied at full time, the next capture wins. A carrier walks and fights with the pistol: no sprint and no grenades, but you can still mantle. The flag falls where its carrier dies. Touch your own dropped flag to return it, or it goes home after ${ctfRules.returnTicks / 30} seconds; a teammate can pick up a dropped enemy flag. An emptied pickup point restocks ${ctfRules.restockTicks / 30} seconds after a capture. With two minutes left, or once a side has four captures, each side gets a limited pool of reinforcements; a side with nobody standing and none left loses. ${escape(teamName(g, "blue"))} flags are A–C, ${escape(teamName(g, "red"))} flags D–F.`;
}

// The flag strip under the score: each side's three flags and what became of them.
export function ctfStrip(g: Game) {
  const ctf = g.ctf!;
  const tag = ctf.overtime
    ? `<span class="mode-tag">OVERTIME<small>NEXT CAPTURE WINS</small></span>`
    : `<span class="mode-tag">CAPTURE THE FLAG<small>FIRST TO ${g.scoreLimit}</small></span>`;
  const chip = (f: CtfFlag) => {
    const note =
      f.state === "carried" ? "⚑" : f.state === "dropped" ? seconds(ctfRules.returnTicks - (g.tick - f.since)) + "s" :
      f.state === "restocking" ? seconds(ctfRules.restockTicks - (g.tick - f.since)) + "s" : "";
    const title = `${f.id} · ${teamName(g, f.team)} flag · ${f.state === "home" ? "on its stand" : f.state === "carried" ? "carried" : f.state === "dropped" ? "dropped, returning" : "restocking"}`;
    return `<span class="sector ctf-flag ${f.team} ${f.state}" title="${escape(title)}">${f.id}<small>${note || "&nbsp;"}</small></span>`;
  };
  const side = (team: Team) => ctf.flags.filter((f) => f.team === team).map(chip).join("");
  return `${side("blue")}${tag}${side("red")}`;
}

// Screen labels: stands with a flag on them, your drop point, every carrier and
// every dropped flag. A carried flag stands out over any trench line.
export function ctfLabels(g: Game, project: (p: V3) => { x: number; y: number; z: number }, viewer: Soldier) {
  const ctf = g.ctf!;
  const label = (at: V3, height: number, cls: string, text: string, aria: string) => {
    const v = project({ x: at.x, y: at.y + height, z: at.z });
    return v.z > 0
      ? `<div class="objective ctf-label ${cls}" aria-label="${escape(aria)}" style="left:${v.x}px;top:${v.y}px">${text}<small>${Math.round(dist(viewer, at))}m</small></div>`
      : "";
  };
  const out: string[] = [];
  for (const f of ctf.flags) {
    const at = flagPosition(g, f);
    if (!at) continue;
    if (f.state === "home") out.push(label(at, 3.2, f.team, f.id, `Flag ${f.id}`));
    else if (f.state === "dropped") out.push(label(at, 1.6, `${f.team} dropped`, `⚑ ${f.id} · ${seconds(ctfRules.returnTicks - (g.tick - f.since))}s`, `Dropped flag ${f.id}`));
    else if (f.carrier !== viewer.id) out.push(label(at, 2.9, `${f.team} carried`, `⚑ ${f.id}`, `Flag ${f.id} carrier`));
  }
  const drop = ctf.drops[viewer.team];
  out.push(label(drop, 3.4, `${viewer.team} drop`, "DROP", "Your drop point"));
  return out.join("");
}

// The carrier's own prompt, or what to do near your own dropped flag.
export function ctfPrompt(g: Game, p: Soldier) {
  if (p.hp <= 0) return "";
  const carried = carriedFlag(g, p);
  if (carried) {
    const drop = g.ctf!.drops[p.team];
    return `<small class="ctf-carrying">YOU HAVE FLAG ${carried.id} · TAKE IT TO YOUR DROP POINT · ${Math.round(dist(p, drop))}m</small><small>PISTOL ONLY · NO SPRINT</small>`;
  }
  const own = g.ctf!.flags.find((f) => f.team === p.team && f.state === "dropped" && dist(p, f.at!) < 12);
  if (own) return `<small>YOUR FLAG ${own.id} IS DOWN · TOUCH IT TO RETURN IT</small>`;
  return "";
}

interface Line { tick: number; text: string; team: Team; personal: boolean }
// Announcer lines and kill-feed entries from flag events.
export class CtfAnnouncer {
  private lines: Line[] = [];
  reset() { this.lines = []; }
  event(g: Game, e: Event) {
    if (e.type !== "flag") return;
    const text = this.describe(g, e);
    if (!text) return;
    const actor = e.actor === undefined ? undefined : g.players[e.actor];
    // Coloured by the side the news is good for.
    const team = e.action === "take" || e.action === "pickup" || e.action === "capture" ? other(e.team) : e.action === "overtime" ? "blue" : e.team;
    this.lines.push({ tick: e.tick, text, team: actor?.team ?? team, personal: e.actor === 0 });
    this.lines = this.lines.slice(-5);
  }
  private describe(g: Game, e: CtfEvent & { tick: number }) {
    const who = e.actor === undefined ? "" : e.actor === 0 ? "You" : soldierName(g.players[e.actor], g.map);
    switch (e.action) {
      case "take": return `${who} took the flag at ${e.flag}`;
      case "pickup": return `${who} picked up flag ${e.flag}`;
      case "drop": return `${who} dropped flag ${e.flag}`;
      case "return": return e.auto ? `Flag ${e.flag} returned to its stand` : `${who} returned flag ${e.flag}`;
      case "capture": return `${teamName(g, other(e.team))} captured flag ${e.flag} · ${g.scores.blue}–${g.scores.red}`;
      case "restock": return `Flag ${e.flag} restocked`;
      case "overtime": return "Overtime · the next capture wins";
    }
  }
  // The latest line, for a few seconds, across the middle of the screen.
  notice(g: Game) {
    const line = this.lines.at(-1);
    return line && g.tick - line.tick < 3.5 * 30 ? `<span class="${line.team}">${escape(line.text)}</span>` : "";
  }
  killFeed(g: Game) {
    return this.lines
      .filter((l) => g.tick - l.tick < 6 * 30)
      .reverse()
      .map((l) => `<li class="kill-feed-entry ctf-feed ${l.team}"><span class="feed-action">⚑ ${escape(l.text)}</span></li>`)
      .join("");
  }
}
