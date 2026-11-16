import {angleDelta} from "./awareness";
import {combatRules,soldierName,type DeathReport} from "./combat-history";
import type {Event,Game,V3} from "./simulation";

export type DeathView={yaw:number;pitch:number;zoom:number};
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const ease=(n:number)=>{const t=clamp(n);return t*t*(3-2*t);};
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const damageText=(n:number)=>String(Math.round(n*10)/10);

export function deathCard(report:DeathReport,seconds:number) {
  const voluntary=report.kind==="redeploy",blast=report.kind==="grenade"||report.kind==="artillery";
  return `<section class="death-card" aria-label="Death report"><small>${voluntary?"REDEPLOYING":"KILLED BY"}</small><h2>${escape(report.sourceName)}</h2>${voluntary?"":`<p>${escape(report.weapon)}${report.distance!==undefined?` · ${blast?"BLAST":"DISTANCE"} ${Math.round(report.distance)} m`:""}</p><div class="death-damage">${damageText(report.damage)} damage · ${report.hits} ${report.hits===1?"hit":"hits"} from this attacker</div>`}<div class="death-countdown">Redeploying in ${Math.max(0,seconds).toFixed(1)}s</div>${!voluntary&&report.from?`<small>${blast?"IMPACT LOCATION":"LAST ATTACK DIRECTION"}</small>`:""}</section>`;
}

// All directions and camera targets are frozen from real damage events. The
// controller never reads a killer's current position or changes a command.
export class CombatFeedback {
  private arcs:{tick:number;bearing:number;strength:number}[]=[];
  private notices:{tick:number;text:string}[]=[];
  private deathMarker?:{at:V3;expires:number};
  private viewReport?:DeathReport;
  private clearView=false;
  reset(){this.arcs=[];this.notices=[];this.deathMarker=undefined;this.viewReport=undefined;}
  event(g:Game,e:Event) {
    if(e.type==="damage"&&e.actor===0&&e.from&&e.at&&(e.amount??0)>0&&e.kind!=="redeploy") {
      const dx=e.from.x-e.at.x,dz=e.from.z-e.at.z;
      if(Number.isFinite(dx+dz)&&Math.hypot(dx,dz)>.2) {
        const bearing=Math.atan2(dx,-dz),strength=Math.min(1,.35+(e.amount??0)/35);
        this.arcs=this.arcs.filter(a=>g.tick-a.tick<combatRules.indicatorTicks);
        const old=this.arcs.find(a=>Math.abs(angleDelta(a.bearing,bearing))<.35);
        if(old)Object.assign(old,{tick:e.tick,bearing,strength:Math.max(old.strength,strength)});
        else this.arcs.push({tick:e.tick,bearing,strength});
        this.arcs=this.arcs.slice(-8);
      }
    }
    if(e.type==="death"&&e.actor===0) {
      this.arcs=[];this.viewReport=undefined;
      if(e.report)this.deathMarker={at:{...e.report.at},expires:Infinity};
    }
    if(e.type==="respawn"&&e.actor===0) {
      this.arcs=[];this.viewReport=undefined;
      if(this.deathMarker)this.deathMarker.expires=g.tick+combatRules.deathMarkerTicks;
    }
    if(e.type==="assist"&&e.actor===0) {
      const victim=g.players.find(p=>p.id===e.target);
      this.notices.push({tick:e.tick,text:`ASSIST · ${damageText(e.damage)} DAMAGE${victim?` · ${soldierName(victim,g.map)}`:""}`});
      this.notices=this.notices.slice(-3);
    }
  }
  marker(g:Game):V3|undefined {
    return this.deathMarker&&g.tick<this.deathMarker.expires?{...this.deathMarker.at}:undefined;
  }
  camera(g:Game,tick:number,base:{yaw:number;pitch:number}):DeathView|null {
    const p=g.players[0],r=p.lastDeath,age=r?tick-r.tick:Infinity;
    if(p.hp>0||!r||r.life!==p.deaths||!r.from||r.kind==="redeploy"||age>=combatRules.killerViewTicks)return null;
    const dx=r.from.x-r.at.x,dz=r.from.z-r.at.z,d=Math.hypot(dx,dz);
    if(d<.6||!Number.isFinite(d))return null;
    if(this.viewReport!==r) {
      this.viewReport=r;
      this.clearView=g.collision.ray({...r.at,y:r.at.y+1.65},r.from)>=.99;
    }
    const blend=ease(age/10)*ease((combatRules.killerViewTicks-age)/15);
    return {yaw:base.yaw+angleDelta(base.yaw,Math.atan2(dx,-dz))*blend,
      pitch:base.pitch+(Math.max(-.6,Math.min(.6,Math.atan2(r.from.y-r.at.y-1.65,d)))-base.pitch)*blend,
      zoom:this.clearView?blend:0};
  }
  html(g:Game,yaw:number) {
    const p=g.players[0];
    const arcs=p.hp>0?this.arcs.filter(a=>g.tick-a.tick<combatRules.indicatorTicks).map(a=>
      `<svg class="damage-bearing" aria-label="Incoming damage direction" viewBox="0 0 200 200" style="transform:rotate(${angleDelta(yaw,a.bearing)}rad);opacity:${a.strength*(1-(g.tick-a.tick)/combatRules.indicatorTicks)}"><path d="M76 20 Q100 8 124 20"/></svg>`).join(""):"";
    const card=p.hp<=0&&p.lastDeath?deathCard(p.lastDeath,(p.respawnAt-g.tick)/30):"";
    const notices=this.notices.filter(n=>g.tick-n.tick<90).map(n=>`<div class="assist-notice">${escape(n.text)}</div>`).join("");
    return arcs+card+`<div class="combat-notices" role="status">${notices}</div>`;
  }
}
