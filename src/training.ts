import { masked } from "./gas";
import { dropFlame, flameRules } from "./flamethrower";
import { resupplyEmplacement } from "./emplacements";
import {Game, idle, botCommand, type Soldier, type Command, type Event} from "./simulation";
import {dist, groundHeight, blocked, type Vec} from "./map";
import {equipLoadout, type Loadout, type FactionId} from "./loadouts";
import {weaponProfile} from "./weapons";
import {soldierHealth} from "./weapon-stats";
import {flagContains} from "./domination";
import {smokeRules} from "./smoke";
import {trainingStations, trainingForwardZ, trainingYaw, movementMarks, demolitionMarks, type TrainingStationId} from "./training-map";

export const trainingLessons = [
  ["walk","sprint","crouch","hop","mantle","view","step"],
  ["rifle","reload","scope","machineGun","pistol","flame","semi","deployGun","fireGun","reloadGun","packGun"],
  ["grenade","smoke"], ["thrust","charge"], ["call","impact"],
  ["breach","tree","crater"], ["gasCall","gasMask","gasLand"], ["reaction","defeat"], ["clear","capture"],
] as const;
export type TrainingGoal = typeof trainingLessons[number][number];
const drillKits: Partial<Record<TrainingGoal, Loadout>> = {
  scope: "marksman", machineGun: "support", semi: "rifleman",
  deployGun: "emplacement", fireGun: "emplacement", reloadGun: "emplacement", packGun: "emplacement",
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
  private crouchedForDrill=false;
  private reloadingRifle=false;
  private heldTicks=0;
  private gasDrill?: {id:number; calledAt:number};
  get station(){return trainingStations[this.lesson];}
  get goals():readonly TrainingGoal[]{return trainingLessons[this.lesson];}
  get combat(){return this.id==="squad" || this.id==="finale";}
  get passed(){return this.goals.every(goal=>this.progress[this.lesson].has(goal));}
  get completed(){return trainingLessons.filter((goals,i)=>goals.every(goal=>this.progress[i].has(goal))).length;}
  get standingAfterCrouch(){return this.crouchedForDrill;}
  get nextStation(){return this.lesson + 1 < trainingStations.length ? this.lesson + 1 : null;}
  get nextGoal(){
    const completed = this.progress[this.lesson];
    const emplacementGoals = ["deployGun", "fireGun", "reloadGun", "packGun"] as const;
    if (this.free && this.lesson === 1 && this.loadout === "emplacement") {
      const next = emplacementGoals.find(goal => !completed.has(goal));
      if (next) return next;
    }
    return this.goals.find(goal => !completed.has(goal));
  }
  select(index:number, replay=false){
    if(!Number.isInteger(index)||index<0||index>=trainingStations.length)throw Error("Unknown training station");
    this.lesson=index;
    if(replay)this.progress[index].clear();
  }
  private resetDrill(){
    this.walked=this.sprintTicks=0;
    this.crouchedForDrill=this.reloadingRifle=false;
    this.views.clear();
  }
  private issuedKit(goal=this.nextGoal){
    if(this.free || this.combat) return {loadout:this.loadout,faction:this.faction};
    return {
      loadout:goal ? drillKits[goal] ?? "rifleman" : "rifleman",
      faction:goal==="semi" ? "trainingBlue" as const : this.faction==="trainingBlue" ? "british" as const : this.faction,
    };
  }
  private equip(p:Soldier){
    const {loadout,faction}=this.issuedKit();
    p.faction=faction;
    equipLoadout(p,loadout,faction==="trainingBlue"?"industrial":"service");
  }
  artilleryTarget(){
    if(this.free) return this.station.target;
    if(this.id==="artillery" || this.id==="gas") return this.station.target;
    const goal=this.nextGoal;
    if(this.id==="destruction" && (goal==="breach" || goal==="tree" || goal==="crater")) return demolitionMarks[goal];
    return undefined;
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
    this.active.clear();this.shots.clear();this.previous=undefined;this.gasDrill=undefined;
    this.heldTicks=0;this.resetDrill();
    const s=this.station,p=g.players[0];
    if(this.id==="gas" && !this.passed){
      this.progress[this.lesson].clear();
    }
    this.equip(p);this.place(g,p,s,trainingYaw(s));
    const combat=this.combat;
    const forward=trainingForwardZ(s);
    const kitAt={x:s.x+6,z:s.z+forward*4};
    for(const q of g.players.slice(1)){q.hp=0;q.respawnAt=Infinity;}
    for(let n=0;n<(this.id==="movement"||this.id==="artillery"||this.id==="destruction"||this.id==="gas"?0:3);n++){
      const q=g.players[4+n];
      const at=this.lesson===3?{x:s.x+(n===2?5:0),z:s.z-[4,16,23][n]}:
        {x:s.target.x+(n-1)*5,z:this.lesson===1&&n===2?s.z-40:s.target.z-(n===1?forward*4:0)};
      q.hp=soldierHealth;this.place(g,q,at,trainingYaw(s)+Math.PI);q.protectedUntil=0;this.active.set(q.id,at);
    }
    if(this.lesson===1){
      const q=g.players[7],at={x:kitAt.x,z:kitAt.z-6};
      q.hp=soldierHealth;this.place(g,q,at,trainingYaw(s)+Math.PI);q.protectedUntil=0;this.active.set(q.id,at);
    }
    if(combat)for(const [i,dx] of [[1,-4],[2,4]]){
      const q=g.players[i];q.hp=soldierHealth;const at={x:s.x+dx,z:s.z-2};this.place(g,q,at);this.active.set(q.id,at);
    }
    Object.assign(g.sectors[0],{x:s.target.x,z:s.target.z,owner:null,control:0,contested:false});
    // Safe targets never participate in capture; only the two combat exercises do.
    if(!combat)Object.assign(g.sectors[0],{x:40,z:-85});
    const kit=g.flames.kits[0];
    Object.assign(kit,{home:kitAt,at:kitAt,fuel:flameRules.fuel,carrier:null,readyAt:0,droppedAt:null});
    for(const other of g.flames.kits.slice(1)){other.at=null;other.readyAt=Infinity;}
    g.artillery.readyAt.blue=0;
    g.artillery.readyAt.red=Number.MAX_SAFE_INTEGER;
    g.commandOverride=(game,soldier)=>this.command(game,soldier);
  }
  command(g:Game,p:Soldier):Command {
    if(!this.active.has(p.id))return idle();
    if(this.combat)return botCommand(g,p);
    const moving=this.lesson===1&&p.id===6;
    const home=this.active.get(p.id)!;
    return {...idle(),yaw:trainingYaw(this.station)+Math.PI,...(moving?{x:Math.cos(g.tick/100)*.65,z:(home.z-p.z)*.4}: {})};
  }
  resupply(g:Game){
    const p=g.players[0],profile=weaponProfile(p);
    if(p.hp<=0)return false;
    if(p.inventory)for(const state of [p.inventory.primary,p.inventory.sidearm,p.flamePrimary]){
      if(!state)continue;
      const ammo=weaponProfile({weapon:state.kind,weaponId:state.id});state.ammo=ammo.magazine;state.reserve=ammo.reserve;
    }
    p.hp=soldierHealth;p.recentDamage=[];p.ammo=profile.magazine;p.reserve=profile.reserve;p.grenades=3;p.smokes=smokeRules.perSpawn;
    p.reloadAt=0;g.artillery.readyAt.blue=g.tick;
    resupplyEmplacement(g,p);
    const kit=g.flames.kits[0];
    if(kit.carrier===p.id)kit.fuel=flameRules.fuel;
    else if(kit.carrier===null && kit.fuel===0){
      Object.assign(kit,{at:{...kit.home},fuel:flameRules.fuel,readyAt:0,droppedAt:null});
    }
    return true;
  }
  interaction(g:Game):number|null {
    const p=g.players[0];if(p.hp<=0)return null;
    if(!this.free) return this.passed ? this.nextStation : null;
    for(const [i,s] of trainingStations.entries())if(i!==this.lesson&&dist(p,{x:s.x-7,z:s.z})<5)return i;
    return null;
  }
  observe(g:Game,input:Command,events:readonly Event[]=g.events){
    const p=g.players[0],done=this.progress[this.lesson],goal=this.nextGoal;
    // Targets and terrain can change irreversibly within one explosion. Preserve
    // combined credit there while walking and weapon handling teach one input at a time.
    const ordered=!this.free && this.lesson<=4;
    const credit=(action:TrainingGoal)=>{
      if((!ordered || action===goal) && this.goals.includes(action)) done.add(action);
    };
    if(this.lesson===0 && p.hp>0){
      const travelled=this.previous ? dist(p,this.previous) : 0;
      if(travelled<1){
        this.walked+=travelled;
        if(input.sprint && travelled>.01 && !p.crouched && !input.aim) this.sprintTicks++;
      }
      if(this.free ? this.walked>=8 : dist(p,movementMarks.walk)<1.4) credit("walk");
      if(this.sprintTicks>=(this.free?20:12) && (this.free || dist(p,movementMarks.sprint)<1.3)) credit("sprint");
      this.views.add(!!input.firstPerson);
      if(this.views.size===2) credit("view");
    }
    this.previous={x:p.x,z:p.z};
    for(const e of events){
      if(e.type==="respawn"&&this.active.has(e.actor)){const q=g.players[e.actor];this.place(g,q,this.active.get(e.actor)!,trainingYaw(this.station)+(q.team==="red"?Math.PI:0));q.protectedUntil=0;}
      if(e.type==="respawn"&&e.actor===0){this.resetDrill();this.equip(p);this.place(g,p,this.station,trainingYaw(this.station));}
      if(e.type==="stance"&&e.actor===0){
        if(this.free && e.crouched) credit("crouch");
        if(goal==="crouch"){
          if(e.crouched) this.crouchedForDrill=true;
          else if(this.crouchedForDrill) credit("crouch");
        }
      }
      if(e.type==="hop"&&e.actor===0&&e.phase==="land" &&
         (this.free || (Math.abs(e.at.x-movementMarks.hop.x)<2 && e.at.z>=58 && e.at.z<=66))) credit("hop");
      if(e.type==="mantle"&&e.actor===0&&e.phase==="end" &&
         (this.free || (dist(e.from,movementMarks.mantle)<2 && e.to.z<56))) credit("mantle");
      if(e.type==="reload"&&e.actor===0){
        if(this.free) credit("reload");
        else if(goal==="reload" && p.loadout==="rifleman" && p.weapon==="serviceRifle") this.reloadingRifle=true;
      }
      if(e.type==="emplacement"&&e.actor===0){
        if(e.phase==="deploy") credit("deployGun");
        if(e.phase==="reload") credit("reloadGun");
        if(e.phase==="pack") credit("packGun");
      }
      if(e.type==="fire"&&e.actor===0){
        if(this.lesson===1){
          const shot=e.weapon==="rifle"?"semi":e.weapon==="machineGun"?(p.mountedGun!==undefined?"fireGun":"machineGun"):e.weapon==="pistol"?"pistol":p.loadout==="marksman"&&input.aim?"scope":"rifle";
          if(!ordered || shot===goal) this.shots.set(e.projectile,shot);
        }
        if(this.lesson===0&&input.aim&&!p.hop&&!p.fall&&p.y>-.7&&p.y<-.3&&Math.abs(p.x+48)<6&&p.z>45&&p.z<47.1&&e.from.y>.2) credit("step");
      }
      if(e.type==="impact"&&e.actor===0){if(e.hit&&e.target!==null&&g.players[e.target]?.team==="red"){const shot=this.shots.get(e.projectile);if(shot)credit(shot);}this.shots.delete(e.projectile);}
      if(e.type==="damage"&&e.kind==="flame"&&e.source===0&&g.players[e.actor]?.team==="red") credit("flame");
      if(e.type==="grenadeExplosion"&&e.actor===0&&dist(e.at,this.station.target)<9) credit("grenade");
      if(e.type==="smokeBloom"&&e.actor===0) credit("smoke");
      if(e.type==="melee"&&e.actor===0&&e.phase==="strike"&&e.damage&&e.target!==null&&e.kind!=="butt") credit(e.kind==="charge"?"charge":"thrust");
      if(e.type==="artilleryCall"&&e.actor===0&&dist(e.target,this.station.target)<14) credit("call");
      if(e.type==="artilleryImpact"&&e.actor===0&&dist(e.at,this.station.target)<22) credit("impact");
      if(e.type==="gasStrike" && e.actor===0 && this.id==="gas"){
        if(e.phase==="call" && !done.has("gasCall") && dist(e.at,this.station.target)<8){
          this.gasDrill={id:e.cloud,calledAt:g.tick};
          credit("gasCall");
        }
        if(e.phase==="land" && e.cloud===this.gasDrill?.id) credit("gasLand");
      }
      if(e.type==="destruction"&&e.actor===0){
        if(e.change.objects.some(o=>o.stage===2&&o.id.startsWith("village-demolition-house-"))) credit("breach");
        if(e.change.objects.some(o=>o.stage===2&&o.id==="training-demo-tree")) credit("tree");
        if(e.change.crater) credit("crater");
      }
      if((e.type==="suppression"&&e.source===0&&g.players[e.actor]?.team==="red")||
        (e.type==="reactionCover"&&g.players[e.actor]?.team==="red")) credit("reaction");
    }
    if(goal==="reload" && p.hp>0 && this.reloadingRifle && !p.reloadAt &&
      p.weapon==="serviceRifle" && p.ammo===weaponProfile(p).magazine) credit("reload");
    if(p.kills>=2) credit("defeat");
    if(this.id==="gas" && p.hp>0 && this.gasDrill && (p.gasMask?.since??-1)>=this.gasDrill.calledAt && masked(p,g.tick)) credit("gasMask");
    if(this.id==="finale"){
      if([...this.active.keys()].every(id=>g.players[id].team!=="red" || g.players[id].hp<=0)) credit("clear");
      if((this.free || done.has("clear")) && p.hp>0&&g.sectors[0].owner==="blue"&&flagContains(g,p,g.sectors[0])){if(++this.heldTicks>=90)credit("capture");}
      else this.heldTicks=0;
    }
    if(goal!==this.nextGoal && !this.free){
      this.resetDrill();
      if(p.hp>0 && this.lesson===1 && this.nextGoal &&
         (this.issuedKit(goal).loadout!==this.issuedKit().loadout || this.issuedKit(goal).faction!==this.issuedKit().faction)){
        dropFlame(g,p);
        this.equip(p);
      }
    }
    if(!this.free && p.hp>0 && !this.passed){
      // Refill exhausted drill supplies after their last throw or barrage has resolved.
      if(this.lesson===2 && !p.throwAction && !g.grenades.some(q=>q.actor===0)){
        if(this.nextGoal==="grenade" && !p.grenades) p.grenades=3;
        if(this.nextGoal==="smoke" && !p.smokes) p.smokes=smokeRules.perSpawn;
      }
      if((this.id==="artillery" || this.id==="destruction" || (this.id==="gas" && !done.has("gasCall"))) &&
         !g.artillery.missions.some(m=>m.team==="blue") && !g.gas.clouds.length) g.artillery.readyAt.blue=g.tick;
      if(this.nextGoal==="flame"){
        const kit=g.flames.kits[0];
        if(kit.carrier===null && !kit.at) kit.readyAt=g.tick;
      }
    }
    for(const q of g.players.slice(1))if(this.active.has(q.id)&&q.hp<=0){
      // Targets reset; the final defenders stay defeated so capture is achievable.
      q.respawnAt=this.id==="finale"&&q.team==="red"?Infinity:Math.min(q.respawnAt,g.tick+75);
    }
    if(p.hp<=0)p.respawnAt=Math.min(p.respawnAt,g.tick+45);
  }
  get id():TrainingStationId{return this.station.id;}
}
