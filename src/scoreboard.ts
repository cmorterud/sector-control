import { factionFor, factions } from "./loadouts";
import { soldierName } from "./soldier-names";
import type { Game, Soldier } from "./simulation";

const points = { capture: 300, kill: 100, assist: 75 };

export function scoreboardTable(game: Game) {
  const capture = game.scoring !== "eliminations";
  const score = (p: Soldier) =>
    p.kills * points.kill + (p.assists ?? 0) * points.assist + (capture ? p.captures * points.capture : 0);
  const key = `${capture ? `${points.capture} per capture · ` : ""}${points.kill} per kill · ${points.assist} per assist`;
  const header = `<thead><tr class="row"><th scope="col">Soldier</th><th scope="col" title="Kills">K</th><th scope="col" title="Assists">A</th><th scope="col" title="Deaths">D</th>${capture ? '<th scope="col" title="Captures">CAP</th>' : ''}<th scope="col" title="Kill-to-death ratio">K/D</th><th scope="col" class="personal-points" title="Personal points">PTS</th></tr></thead>`;
  const row = (p: Soldier, total: number) => `<tr class="row ${p.team}${p.id === 0 ? " local-soldier" : ""}"><th scope="row">${soldierName(p, game.map)}</th><td>${p.kills}</td><td>${p.assists ?? 0}</td><td>${p.deaths}</td>${capture ? `<td>${p.captures}</td>` : ''}<td>${(p.kills / Math.max(1, p.deaths)).toFixed(2)}</td><td class="personal-points">${total}</td></tr>`;
  const rosters = (["blue", "red"] as const).map((team) => {
    const players = game.players.filter((p) => p.team === team);
    if (!players.length) return "";
    const ranked = players.map((p) => ({ p, total: score(p) }))
      .sort((a, b) => b.total - a.total || a.p.id - b.p.id);
    const title = factions[factionFor(game.map, team)].name;
    return `<table class="table"><caption class="${team}">${title} · ${players.length}</caption>${header}<tbody>${ranked.map(({ p, total }) => row(p, total)).join("")}</tbody></table>`;
  }).filter(Boolean);
  return `<div class="scoreboard-standings"><p class="score-key">${key}</p><div class="rosters${rosters.length === 1 ? " single-roster" : ""}">${rosters.join("")}</div></div>`;
}
