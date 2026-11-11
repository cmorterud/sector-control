import type { Soldier } from "./simulation";
import { weaponProfiles } from "./weapons";
import { weaponDesign } from "./weapon-design";
export const switchRules = { lowerTicks: 4, readyTicks: 9 };
const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
export function switchPose(p:Pick<Soldier,"weaponChange"|"hp">,tick:number) {
 const change=p.hp>0?p.weaponChange:undefined,age=change?tick-change.tick:Infinity;
 const active=age>=0&&age<switchRules.readyTicks;
 return {active,old:active&&age<switchRules.lowerTicks,lower:!active?0:age<switchRules.lowerTicks
  ?(change!.startLower??0)+(1-(change!.startLower??0))*smooth(age/switchRules.lowerTicks)
  :1-smooth((age-switchRules.lowerTicks)/(switchRules.readyTicks-switchRules.lowerTicks))};
}
export function visualWeapon(p:Soldier,tick:number):Soldier {
 return switchPose(p,tick).old ? {...p,weapon:p.weaponChange!.from,weaponId:p.weaponChange!.fromId,equippedSlot:p.weaponChange!.fromSlot} : p;
}
export function beginWeaponChange(p:Soldier,tick:number) {
 const pose=switchPose(p,tick),visible=visualWeapon(p,tick);
 p.weaponChange={tick,from:visible.weapon,fromId:visible.weaponId,fromSlot:visible.equippedSlot,startLower:pose.lower};
}
export function reloadCue(p:Soldier,tick:number) {
 const design=weaponDesign(p);if(!design || !p.reloadAt || p.hp<=0)return null;
 const duration=weaponProfiles[p.weapon].reloadTicks;
 const crossed=(fraction:number)=>p.reloadAt-tick===duration-Math.round(fraction*duration);
 if(design.reload==="clip" || design.reload==="tube")return null;
 if(design.reload==="revolver")return crossed(.14)?"cylinderOpen":crossed(.5)?"cartridges":crossed(.88)?"cylinderClose":null;
 return crossed(.2)?"magazineOut":crossed(.68)?"magazineIn":crossed(.85)?"rack":null;
}

// The simulation and renderer share the same timed shoulder pose, so a round
// leaves the visible barrel during the raise instead of snapping to an ADS origin.
export function aimBlend(p:Pick<Soldier,"aimMotion"|"command">,tick:number) {
 const m=p.aimMotion;
 return m?m.from+(m.to-m.from)*smooth((tick-m.tick)/m.duration):(p.command.aim?1:0);
}
export function updateAimMotion(p:Soldier,tick:number) {
 const target=p.command.aim && !p.reloadAt && !p.mantle && !p.melee && tick>=p.throwUntil && !switchPose(p,tick).active?1:0;
 if(!p.aimMotion || p.aimMotion.to!==target){
  const current=p.aimMotion?aimBlend(p,tick):0;
  p.aimMotion={tick,from:current,to:target,duration:target && p.loadout==="marksman" && p.weapon==="serviceRifle"?15:6};
  p.aimSince=target?tick:-1;
 }
}
