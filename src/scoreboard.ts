import {factions,factionFor} from "./loadouts";
import {soldierName} from "./combat-history";
import type {Game,Soldier} from "./simulation";

export function scoreboardTable(game:Game) {
  const capture=game.scoring!=="eliminations",style=` style="--score-cols:${capture?4:3}"`;
  const header=`<div class="row"${style}><span>SOLDIER</span><span title="Kills">K</span><span title="Assists">A</span><span title="Deaths">D</span>${capture?"<span>CAP</span>":""}</div>`;
  const row=(p:Soldier)=>`<div class="row ${p.team}"${style}><span>${soldierName(p,game.map)}</span><span>${p.kills}</span><span>${p.assists??0}</span><span>${p.deaths}</span>${capture?`<span>${p.captures}</span>`:""}</div>`;
  if(game.teamSize>8)return `<div class="rosters">${(["blue","red"] as const).map(team=>{
    const players=game.players.filter(p=>p.team===team);
    return `<div class="table"><b class="${team}">${factions[factionFor(game.map,team)].name.toUpperCase()} · ${players.length}</b>${header}${players.map(row).join("")}</div>`;
  }).join("")}</div>`;
  return `<div class="table">${header}${game.players.map(row).join("")}</div>`;
}
