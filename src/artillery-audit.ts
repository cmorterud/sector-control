import { dist, type Vec } from "./map";
import type { Game, Team } from "./simulation";
export interface ArtilleryAudit {
 callsNearFlags:number; repeatedFlagCalls:number; exposedSoldiers:number;
 coveredSoldiers:number; damagePrevented:number; deaths:number; captureInterruptions:number;
 lastFlagCalls:Record<string,number>;
}
export const freshArtilleryAudit = ():ArtilleryAudit=>({callsNearFlags:0,repeatedFlagCalls:0,exposedSoldiers:0,coveredSoldiers:0,damagePrevented:0,deaths:0,captureInterruptions:0,lastFlagCalls:{}});
export function auditArtilleryCall(g:Game,team:Team,at:Vec) {
 const flag=g.sectors.find(s=>dist(s,at)<=16);if(!flag)return;
 const key=`${team}:${flag.id}`,last=g.artilleryAudit.lastFlagCalls[key];
 g.artilleryAudit.callsNearFlags++;
 if(last!==undefined && g.tick-last<=90*30)g.artilleryAudit.repeatedFlagCalls++;
 g.artilleryAudit.lastFlagCalls[key]=g.tick;
}
