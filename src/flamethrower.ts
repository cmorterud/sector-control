import { beginWeaponChange } from "./weapon-handling";
import { switchWeapon } from "./loadouts";
import { groundHeight, dist, type Vec } from "./map";
import type { Game, Soldier, V3, Team } from "./simulation";
import { eyeHeightOf } from "./crouch";
import { weaponAim } from "./recoil";
import { viewDirection, viewMuzzle } from "./player-view";
import { deformExplosion, type DestructionChange } from "./destruction";
import { rayTanks } from "./tanks";
import { carriedFlag } from "./ctf";
export const flameRules = { fuel:240, range:8, damagePerTick:1, burnTicks:30, burnPerTick:.2, restock:3600, droppedLifetime:1800 };
export interface FlameKit { id:number; home:Vec; at:Vec|null; fuel:number; carrier:number|null; readyAt:number; droppedAt:number|null }
export interface FlameState { kits:FlameKit[] }
export function createFlames(map:Game["map"]):FlameState {
 // No flame kits on Industrial, aboard a hydrogen airship, or where a map leaves them out.
 if(map.id==="industrial"||map.sky||map.flamethrower===false)return {kits:[]};
 return {kits:(["blue","red"] as const).map((team,id)=>{
  const line=map.terrain?.trenchLines?.find(l=>l.team===team&&l.role==="front");
  const flag=map.sectors.find(s=>s.home===team);
  const home=line ? {...line.sections[Math.floor(line.sections.length/2)]} : flag ? {x:flag.x,z:flag.z+3} : {...map.spawn[team]};
  return {id,home,at:{...home},fuel:flameRules.fuel,carrier:null,readyAt:0,droppedAt:null};
 })};
}
export function nearestFlame(g:Game,p:Soldier) {
 return g.flames.kits.find(k=>k.at && dist(k.at,p)<1.8 && Math.abs(groundHeight(k.at.x,k.at.z,g.map)-p.y)<.8);
}
const carriedFuel = (p:Soldier) => p.weapon==="flamethrower"?p.ammo:p.inventory?.primary.ammo;
export function canDropEmptyFlame(g:Game,p:Soldier) {
 return p.flameKit!==undefined && p.hp>0 && carriedFuel(p)===0 &&
  p.tank===undefined && p.mountedGun===undefined && !p.melee && !p.mantle && g.tick>=p.throwUntil && !carriedFlag(g,p);
}
export function pickupFlame(g:Game,p:Soldier) {
 const kit=nearestFlame(g,p);
 if(!kit || !p.inventory || p.flameKit!==undefined || p.hp<=0 || p.melee || p.mantle || p.reloadAt || g.tick<p.throwUntil)return false;
 beginWeaponChange(p,g.tick);
 p.inventory[p.equippedSlot??"primary"]={kind:p.weapon,id:p.weaponId??p.weapon,ammo:p.ammo,reserve:p.reserve,nextShot:p.nextShot,lastShotAt:p.lastShotAt};
 p.flamePrimary=p.inventory.primary;
 p.inventory.primary={kind:"flamethrower",id:"Wex-inspired flame kit",ammo:kit.fuel,reserve:0,nextShot:g.tick+12,lastShotAt:-1000};
 p.weapon="flamethrower"; p.weaponId=p.inventory.primary.id; p.equippedSlot="primary";
 p.ammo=kit.fuel;p.reserve=0;p.nextShot=g.tick+12;p.reloadAt=0;p.flameKit=kit.id;p.aimSince=-1;
 kit.carrier=p.id;kit.at=null;kit.droppedAt=null;
 g.emit({type:"flamePickup",actor:p.id,kit:kit.id,fuel:kit.fuel});return true;
}
export function dropFlame(g:Game,p:Soldier) {
 const kit=g.flames.kits.find(k=>k.id===p.flameKit && k.carrier===p.id);
 if(!kit)return;
 kit.fuel=carriedFuel(p)??0;
 kit.carrier=null;kit.at=kit.fuel>0?{x:p.x,z:p.z}:null;kit.droppedAt=g.tick;kit.readyAt=g.tick+flameRules.restock;
 if(p.hp>0 && p.inventory && p.flamePrimary) {
  if(switchWeapon(p,"sidearm",g.tick))g.emit({type:"weaponAction",actor:p.id,action:"holster",weaponId:p.weaponChange?.fromId});
  p.inventory.primary=p.flamePrimary;
 }
 p.flameKit=undefined;p.flamePrimary=undefined;
 g.emit({type:"flameDrop",actor:p.id,kit:kit.id,fuel:kit.fuel});
}
export function advanceFlames(g:Game, damage:(p:Soldier,n:number,source:number,team:Team|null)=>void) {
 for(const kit of g.flames.kits) {
  if(kit.carrier!==null) {
   const p=g.players[kit.carrier]; if(!p || p.hp<=0){if(p)dropFlame(g,p);continue;}
   kit.fuel=carriedFuel(p)??0;
  } else {
   if(kit.at && kit.droppedAt!==null && g.tick-kit.droppedAt>=flameRules.droppedLifetime) kit.at=null;
   if(!kit.at && g.tick>=kit.readyAt){kit.at={...kit.home};kit.fuel=flameRules.fuel;kit.droppedAt=null;}
  }
 }
 for(const p of g.players) if(p.hp>0 && g.tick<(p.burnUntil??0) && p.lastFlameHitAt!==g.tick && g.tick>=p.protectedUntil) damage(p,flameRules.burnPerTick,p.burnSource??-1,p.burnTeam??null);
}
function flameRay(g:Game,from:V3,to:V3) {
 return Math.min(g.collision.ray(from,to),rayTanks(g,from,to).t);
}
export function fireFlame(g:Game,p:Soldier,damage:(p:Soldier,n:number,source:number,team:Team|null)=>void,change:(c:DestructionChange)=>void) {
 const aim=weaponAim(p),dir=viewDirection(aim.yaw,aim.pitch);
 // Clip the jet and its damage cone to the same distance along the aim ray.
 const from={x:p.x,y:p.y+eyeHeightOf(p)-.12,z:p.z};
 const end={x:from.x+dir.x*flameRules.range,y:from.y+dir.y*flameRules.range,z:from.z+dir.z*flameRules.range};
 const world=g.collision.ray(from,end),armor=rayTanks(g,from,end).t;
 const reach=flameRules.range*Math.min(world,armor);
 const to={x:from.x+dir.x*reach,y:from.y+dir.y*reach,z:from.z+dir.z*reach};
 p.ammo--;p.nextShot=g.tick+1;p.protectedUntil=0;
 for(const q of g.players) {
  if(q.team===p.team || q.hp<=0 || q.tank!==undefined)continue;
  const target={x:q.x,y:q.y+eyeHeightOf(q)*.7,z:q.z};
  const dx=target.x-from.x,dy=target.y-from.y,dz=target.z-from.z,length=Math.hypot(dx,dy,dz);
  const along=dx*dir.x+dy*dir.y+dz*dir.z;
  const threatened=length<12 && dist(q,to)<4;
  const inJet=length<=flameRules.range && along>=0 && along<=reach &&
   Math.hypot(dx-dir.x*along,dy-dir.y*along,dz-dir.z*along)<=.3+along*.12;
  if((!threatened && !inJet) || flameRay(g,from,target)<.999)continue;
  if(threatened) {q.flameThreatUntil=g.tick+45;q.flameThreatFrom={...from};}
  if(!inJet || g.tick<q.protectedUntil)continue;
  damage(q,flameRules.damagePerTick,p.id,p.team);
  q.lastFlameHitAt=g.tick; q.burnUntil=g.tick+flameRules.burnTicks;q.burnSource=p.id;q.burnTeam=p.team;q.burnFrom={...from};
 }
 if(g.tick%10===0 && world<armor) {
  const surface={x:to.x-dir.x*.04,y:to.y-dir.y*.04,z:to.z-dir.z*.04};
  const c=deformExplosion(g.map,surface,{kind:"flame",radius:0,damage:0,structuralRadius:1.3,structuralDamage:8,craterRadius:0,craterDepth:0,terrainReach:0},(a,b)=>flameRay(g,a,b));if(c)change(c);
 }
 if(g.tick%3===0) {
  const nozzle=viewMuzzle(p,g.tick);
  const nozzleAlong=(nozzle.x-from.x)*dir.x+(nozzle.y-from.y)*dir.y+(nozzle.z-from.z)*dir.z;
  const clear=Math.min(flameRay(g,from,nozzle),nozzleAlong>reach?reach/nozzleAlong:1);
  const visualFrom={x:from.x+(nozzle.x-from.x)*clear,y:from.y+(nozzle.y-from.y)*clear,z:from.z+(nozzle.z-from.z)*clear};
  g.emit({type:"flame",actor:p.id,from:visualFrom,to,fuel:p.ammo});
 }
}
export function evadeFlame(g:Game,p:Soldier) {
 const threat=p.flameThreatFrom;
 if(!threat || g.tick>=(p.flameThreatUntil??0))return;
 const options=Array.from({length:8},(_,i)=>{const a=i*Math.PI/4;return {x:p.x+Math.sin(a)*4,z:p.z-Math.cos(a)*4};});
 let best:Vec|undefined,score=-Infinity;
 for(const at of options) {
  const ground=groundHeight(at.x,at.z,g.map);
  if(Math.abs(ground-p.y)>1 || dist(g.collision.move(p,{x:(at.x-p.x)/4,z:(at.z-p.z)/4}),p)<.5)continue;
  const s=dist(at,threat)+(g.collision.ray(threat,{...at,y:ground+.9})<.99?10:0);
  if(s>score){best=at;score=s;}
 }
 if(best){const d=dist(best,p);p.command.x=(best.x-p.x)/d;p.command.z=(best.z-p.z)/d;p.command.fire=false;p.command.aim=false;p.command.sprint=true;}
}
