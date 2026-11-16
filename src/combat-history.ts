import {factions, factionFor} from "./loadouts";
import type {Game, Soldier, V3,Team} from "./simulation";

export const combatRules={assistWindow:300,assistDamage:20,indicatorTicks:45,killerViewTicks:75,deathMarkerTicks:180};
export type DamageKind="bullet"|"melee"|"grenade"|"artillery"|"flame"|"burn"|"redeploy";
export type DamageDetails={kind:DamageKind;weapon:string;from?:V3};
export type Wound=DamageDetails&{source:number;tick:number;damage:number};
export type DeathReport=Wound&{
  life:number;at:V3;sourceName:string;distance?:number;hits:number;
  assists:{actor:number;damage:number}[];
};
export const soldierName=(p:Soldier,map:Game["map"])=>p.id===0?"YOU":`${factions[p.faction??factionFor(map,p.team)].name} ${p.teamIndex+1}`;

export function rememberWound(p:Soldier,wound:Wound) {
  p.recentDamage=(p.recentDamage??[]).filter(h=>wound.tick-h.tick<=combatRules.assistWindow);
  p.recentDamage.push({...wound,...(wound.from?{from:{...wound.from}}:{})});
}
export function reportDeath(g:Game,p:Soldier,wound:Wound,team:Team|null):DeathReport {
  const killer=g.players.find(q=>q.id===wound.source),recent=(p.recentDamage??[]).filter(h=>g.tick-h.tick<=combatRules.assistWindow);
  const enemyKiller=killer&&team!==null&&killer.team===team&&killer.id!==p.id&&killer.team!==p.team&&wound.kind!=="redeploy";
  const totals=new Map<number,number>();
  if(enemyKiller)for(const hit of recent) {
    const contributor=g.players.find(q=>q.id===hit.source);
    if(contributor&&contributor.team===killer.team&&contributor.id!==killer.id&&contributor.id!==p.id)
      totals.set(hit.source,(totals.get(hit.source)??0)+hit.damage);
  }
  const incoming=recent.filter(h=>h.source===wound.source&&(wound.source>=0||h.kind===wound.kind));
  return {...wound,from:wound.from?{...wound.from}:undefined,life:p.deaths,at:{x:p.x,y:p.y,z:p.z},
    sourceName:wound.kind==="redeploy"?"Voluntary redeploy":killer?.id===p.id?"Your own explosive":killer?soldierName(killer,g.map):"Battlefield shellfire",
    distance:wound.from?Math.hypot(wound.from.x-p.x,wound.from.y-(p.y+1),wound.from.z-p.z):undefined,
    damage:incoming.reduce((n,h)=>n+h.damage,0),hits:incoming.length,
    assists:[...totals].filter(([,damage])=>damage+1e-6>=combatRules.assistDamage).sort(([a],[b])=>a-b).map(([actor,damage])=>({actor,damage})),
  };
}
