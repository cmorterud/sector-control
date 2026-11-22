import {Game, idle, botCommand, type Soldier, type Command, type Event} from "./simulation";
import {dist, groundHeight, blocked, type Vec} from "./map";
import {equipLoadout, type Loadout, type FactionId} from "./loadouts";
import {weaponProfile} from "./weapons";
import {soldierHealth} from "./weapon-stats";
import {flagContains} from "./domination";
import {trainingStations, type TrainingStationId} from "./training-map";

export const trainingLessons = [
  ["walk","sprint","crouch","hop","mantle","view","step"],
  ["rifle","reload","scope","machineGun","pistol","flame","semi"],
  ["grenade","smoke"], ["thrust","charge"], ["call","impact"],
  ["breach","tree","crater"], ["reaction","defeat"], ["clear","capture"],
] as const;
export type TrainingGoal = typeof trainingLessons[number][number];
export const trainingInstructions:Record<TrainingGoal,string>={
  walk:"Move eight metres with {forward} {left} {backward} {right}. Follow the marked lanes.",
  sprint:"Sprint along the lane using {sprint} and a movement key.",
  crouch:"Press {crouch} to crouch behind cover. Press it again to stand.",
  hop:"Use {mantle} in the clear hop lane to jump the low rails.",
  mantle:"Walk up to the low brick wall, face it and press {mantle} to climb over.",
  view:"Press {view} to try both first- and third-person views.",
  step:"Drop into the practice trench ahead. Use {mantle} to climb the raised firing step, then aim with RMB and fire over the bank with LMB.",
  rifle:"Choose Rifleman in Escape → Training armory, then hit a red target. Hold RMB to aim; click LMB to fire.",
  reload:"Fire, then press {reload}. Firing an empty weapon also reloads from reserve ammo.",
  scope:"In Escape → Training armory, choose Marksman. Aim with RMB and hit a target through the 4× scope.",
  machineGun:"Choose Support in the training armory. Hit a target with the machine gun; hold LMB for automatic fire.",
  pistol:"Press {sidearm} to draw your pistol and hit a target. {primary} returns to your primary.",
  flame:"Collect the flame kit beside the armory table with {interact}. Fire it at close range with LMB.",
  semi:"Choose Industrial training kit and Rifleman in the armory, then hit a target with the AR-01 semiautomatic rifle.",
  grenade:"Throw with {grenade}. Land an explosion near the red group about 20 m ahead. Look higher for more distance; stay clear of the blast.",
  smoke:"Press {smoke} to throw smoke. Let the cloud bloom and observe the screen it creates.",
  thrust:"Choose Britain, France or Germany and Rifleman in the armory. Approach a red target and press {melee} without sprinting for a bayonet thrust.",
  charge:"Keep your service rifle equipped. Sprint forward with {sprint}, then press {melee}. Keep charging until you strike a target.",
  call:"Open the tactical map with {tactical} and call artillery on the marked target house 30 m ahead. RMB cancels.",
  impact:"Wait for your shells to land. Notice that coordinates drift and individual shells scatter.",
  breach:"Use grenades or artillery to breach the two-story house. Direct hits damage structures most; destroy enough ground-floor supports and the building collapses.",
  tree:"Shell the marked pine to the right of the house and watch it fall. Training-menu resupply recharges artillery.",
  crater:"Land an explosive on open ground to cut a crater and expose fresh dirt.",
  reaction:"Fire near enemies and observe a real AI suppression or cover reaction. Friendly soldiers fight alongside you.",
  defeat:"Defeat two opponents in the squad exercise. Use cover, smoke and your preferred weapon.",
  clear:"Clear two defenders from the exercise objective. You can use everything you have practised.",
  capture:"Enter the objective area and hold it until flag C turns blue. Tab opens the scoreboard.",
};

export class TrainingSession {
  lesson=0;
  free=false;
  loadout:Loadout="rifleman";
  faction:FactionId="british";
  progress=trainingLessons.map(()=>new Set<TrainingGoal>());
  active=new Map<number,Vec>();
  private shots=new Map<number,TrainingGoal>();
  private previous?:Vec;
  private walked=0;
  private sprintTicks=0;
  private views=new Set<boolean>();
  private heldTicks=0;
  get station(){return trainingStations[this.lesson];}
  get goals(){return trainingLessons[this.lesson];}
  get passed(){return this.goals.every(goal=>this.progress[this.lesson].has(goal));}
  get completed(){return trainingLessons.filter((goals,i)=>goals.every(goal=>this.progress[i].has(goal))).length;}
  get nextGoal(){return this.goals.find(goal=>!this.progress[this.lesson].has(goal));}
  select(index:number, replay=false){
    if(!Number.isInteger(index)||index<0||index>=trainingStations.length)throw Error("Unknown training station");
    this.lesson=index;
    if(replay)this.progress[index].clear();
    this.walked=this.sprintTicks=this.heldTicks=0;this.views.clear();this.previous=undefined;this.shots.clear();
  }
  private place(g:Game,p:Soldier,at:Vec,yaw=0){
    let safe={x:at.x,z:at.z};
    search:for(const dx of [0,-1.5,1.5,-3,3])for(const dz of [0,-1.5,1.5,-3,3]){
      if(!blocked(at.x+dx,at.z+dz,.6,g.map)){safe={x:at.x+dx,z:at.z+dz};break search;}
    }
    Object.assign(p,{...safe,y:groundHeight(safe.x,safe.z,g.map),yaw,pitch:0,vx:0,vz:0,path:[],target:-1,
      hop:null,mantle:null,fall:null,melee:null,reloadAt:0,throwAction:null,throwUntil:0,protectedUntil:g.tick+60,command:idle()});
  }
  begin(g:Game){
    this.active.clear();this.shots.clear();this.previous=undefined;
    const s=this.station,p=g.players[0];p.faction=this.faction;equipLoadout(p,this.loadout,this.faction==="trainingBlue");this.place(g,p,s);
    const combat=this.lesson>=6;
    for(const q of g.players.slice(1)){q.hp=0;q.respawnAt=Infinity;}
    for(let n=0;n<(this.lesson===0||this.lesson===4||this.lesson===5?0:3);n++){
      const q=g.players[4+n];
      const at=this.lesson===3?{x:s.x+(n===2?5:0),z:s.z-[4,16,23][n]}:
        {x:s.target.x+(n-1)*5,z:this.lesson===1&&n===2?s.z-40:s.target.z+(n===1?4:0)};
      q.hp=soldierHealth;this.place(g,q,at,Math.PI);q.protectedUntil=0;this.active.set(q.id,at);
    }
    if(combat)for(const [i,dx] of [[1,-4],[2,4]]){
      const q=g.players[i];q.hp=soldierHealth;const at={x:s.x+dx,z:s.z-2};this.place(g,q,at);this.active.set(q.id,at);
    }
    Object.assign(g.sectors[0],{x:s.target.x,z:s.target.z,owner:null,control:0,contested:false});
    // Safe targets never participate in capture; only the two combat exercises do.
    if(!combat)Object.assign(g.sectors[0],{x:40,z:-85});
    const kit=g.flames.kits[0],at={x:s.x+6,z:s.z-4};
    Object.assign(kit,{home:at,at,fuel:240,carrier:null,readyAt:0,droppedAt:null});
    for(const other of g.flames.kits.slice(1)){other.at=null;other.readyAt=Infinity;}
    g.artillery.readyAt.blue=0;
    g.artillery.readyAt.red=Number.MAX_SAFE_INTEGER;
    g.commandOverride=(game,soldier)=>this.command(game,soldier);
  }
  command(g:Game,p:Soldier):Command {
    if(!this.active.has(p.id))return idle();
    if(this.lesson>=6)return botCommand(g,p);
    const moving=this.lesson===1&&p.id===6;
    const home=this.active.get(p.id)!;
    return {...idle(),yaw:Math.PI,...(moving?{x:Math.cos(g.tick/100)*.65,z:(home.z-p.z)*.4}: {})};
  }
  resupply(g:Game){
    const p=g.players[0],profile=weaponProfile(p);
    if(p.hp<=0)return false;
    if(p.inventory)for(const slot of ["primary","sidearm"] as const){const state=p.inventory[slot],ammo=weaponProfile({weapon:state.kind,weaponId:state.id});state.ammo=ammo.magazine;state.reserve=ammo.reserve;}
    p.hp=soldierHealth;p.recentDamage=[];p.ammo=profile.magazine;p.reserve=profile.reserve;p.grenades=3;p.smokes=2;
    p.reloadAt=0;g.artillery.readyAt.blue=g.tick;
    const kit=g.flames.kits.find(k=>k.carrier===0);if(kit)kit.fuel=240;
    return true;
  }
  interaction(g:Game):number|null {
    const p=g.players[0];if(p.hp<=0)return null;
    for(const [i,s] of trainingStations.entries())if(i!==this.lesson&&dist(p,{x:s.x-7,z:s.z})<5)return i;
    return null;
  }
  observe(g:Game,input:Command,events:readonly Event[]=g.events){
    const p=g.players[0],done=this.progress[this.lesson];
    const flaming=events.some(e=>e.type==="flame"&&e.actor===0);
    let travelled=0;
    if(this.previous&&p.hp>0){const d=dist(p,this.previous);if(d<1){this.walked+=d;travelled=d;}}
    this.previous={x:p.x,z:p.z};
    if(this.walked>=8)done.add("walk");
    if(input.sprint&&travelled>.01&&++this.sprintTicks>=20)done.add("sprint");
    this.views.add(!!input.firstPerson);if(this.views.size===2)done.add("view");
    for(const e of events){
      if(e.type==="respawn"&&this.active.has(e.actor)){const q=g.players[e.actor];this.place(g,q,this.active.get(e.actor)!,q.team==="red"?Math.PI:0);q.protectedUntil=0;}
      if(e.type==="respawn"&&e.actor===0){p.faction=this.faction;equipLoadout(p,this.loadout,this.faction==="trainingBlue");this.place(g,p,this.station);}
      if(e.type==="stance"&&e.actor===0&&e.crouched)done.add("crouch");
      if(e.type==="hop"&&e.actor===0&&e.phase==="land")done.add("hop");
      if(e.type==="mantle"&&e.actor===0&&e.phase==="end")done.add("mantle");
      if(e.type==="reload"&&e.actor===0)done.add("reload");
      if(e.type==="fire"&&e.actor===0){
        this.shots.set(e.projectile,e.weapon==="rifle"?"semi":e.weapon==="machineGun"?"machineGun":e.weapon==="pistol"?"pistol":p.loadout==="marksman"&&input.aim?"scope":"rifle");
        if(this.lesson===0&&input.aim&&!p.hop&&!p.fall&&p.y>-.7&&p.y<-.3&&Math.abs(p.x+48)<6&&p.z>45&&p.z<47.1&&e.from.y>.2)done.add("step");
      }
      if(e.type==="impact"&&e.actor===0){if(e.hit&&e.target!==null&&g.players[e.target]?.team==="red"){const goal=this.shots.get(e.projectile);if(goal)done.add(goal);}this.shots.delete(e.projectile);}
      if(e.type==="damage"&&e.source===0&&g.players[e.actor]?.team==="red"&&p.weapon==="flamethrower"&&flaming)done.add("flame");
      if(e.type==="grenadeExplosion"&&e.actor===0&&dist(e.at,this.station.target)<9)done.add("grenade");
      if(e.type==="smokeBloom"&&e.actor===0)done.add("smoke");
      if(e.type==="melee"&&e.actor===0&&e.phase==="strike"&&e.damage&&e.target!==null&&e.kind!=="butt")done.add(e.kind==="charge"?"charge":"thrust");
      if(e.type==="artilleryCall"&&e.actor===0&&dist(e.target,this.station.target)<14)done.add("call");
      if(e.type==="artilleryImpact"&&e.actor===0&&dist(e.at,this.station.target)<22)done.add("impact");
      if(e.type==="destruction"&&e.actor===0){
        if(e.change.objects.some(o=>o.stage===2&&o.id.startsWith("village-demolition-house-")))done.add("breach");
        if(e.change.objects.some(o=>o.stage===2&&o.id==="training-demo-tree"))done.add("tree");
        if(e.change.crater)done.add("crater");
      }
      if((e.type==="suppression"&&e.source===0&&g.players[e.actor]?.team==="red")||
        (e.type==="reactionCover"&&g.players[e.actor]?.team==="red"))done.add("reaction");
    }
    const kills=p.kills;
    if(kills>=2)done.add("defeat");
    if(this.lesson===7){
      if([...this.active.keys()].filter(id=>g.players[id].team==="red"&&g.players[id].hp<=0).length>=2)done.add("clear");
      if(p.hp>0&&g.sectors[0].owner==="blue"&&flagContains(g,p,g.sectors[0])){if(++this.heldTicks>=90)done.add("capture");}
      else this.heldTicks=0;
    }
    for(const q of g.players.slice(1))if(this.active.has(q.id)&&q.hp<=0){
      // Targets reset; the final defenders stay defeated so capture is achievable.
      q.respawnAt=this.lesson===7&&q.team==="red"?Infinity:Math.min(q.respawnAt,g.tick+75);
    }
    if(p.hp<=0)p.respawnAt=Math.min(p.respawnAt,g.tick+45);
  }
  get id():TrainingStationId{return this.station.id;}
}
