import type {Soldier} from './simulation';
import {boltMotion} from './weapons';
import {reloadMotion} from './soldier-presentation';
export type HandKey={t:number;p:{x:number;y:number;z:number};contact?:boolean};
const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const ease=(v:number)=>{v=clamp(v);return v*v*(3-2*v);};
// Hermite arcs pass through the same interaction anchors. Contact keys stop
// deliberately at a mechanism; other keys carry momentum around the corner.
export function handlingPath(keys:HandKey[],time:number){
 let end=keys.findIndex(k=>k.t>=time);if(end<0)end=keys.length-1;end=Math.max(1,end);
 const a=keys[end-1],b=keys[end],before=keys[Math.max(0,end-2)],after=keys[Math.min(keys.length-1,end+1)];
 const span=b.t-a.t,u=clamp((time-a.t)/span),h00=2*u**3-3*u*u+1,h10=u**3-2*u*u+u,h01=-2*u**3+3*u*u,h11=u**3-u*u;
 const result={x:0,y:0,z:0};
 for(const axis of ['x','y','z'] as const){
  const start=a.contact?0:(b.p[axis]-before.p[axis])/Math.max(.001,b.t-before.t)*span;
  const finish=b.contact?0:(after.p[axis]-a.p[axis])/Math.max(.001,after.t-a.t)*span;
  result[axis]=clamp(h00*a.p[axis]+h10*start+h01*b.p[axis]+h11*finish,Math.min(a.p[axis],b.p[axis])-.025,Math.max(a.p[axis],b.p[axis])+.025);
 }
 return result;
}
export function handlingWrist(p:Soldier,tick:number){
 const loading=reloadMotion(p,tick),cycling=boltMotion(p,tick);
 const t=loading?.progress??0;
 const fetch=loading?ease((t-.18)/.12)*(1-ease((t-.43)/.15)):0;
 const push=loading?Math.sin(Math.PI*clamp((t-.48)/.17)):0;
 const bolt=cycling?.reach??(loading&&p.weapon==='serviceRifle'?Math.max(ease(t/.08)*(1-ease((t-.16)/.1)),ease((t-.72)/.1)*(1-ease((t-.88)/.1))):0);
 // While pressing a clip the wrist tips back, so the thumb comes down on the rounds.
 return {pitch:-25*fetch-30*push,roll:-30*fetch,bolt};
}
