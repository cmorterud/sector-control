import {expect,it} from "vitest";
import {Game,TestCollision,idle,type Soldier} from "./simulation";
import {industrialMap} from "./map";
import {grenadeExplosionProfile,ambientArtilleryExplosionProfile} from "./destruction";
import {combatRules,type DamageDetails} from "./combat-history";
import {switchWeapon,equipLoadout} from "./loadouts";
import {pickupFlame} from "./flamethrower";

const scene=()=>{
  const g=new Game(new TestCollision(industrialMap),true,6000,1,undefined,{map:industrialMap,teamSize:5,ambientArtillery:false});
  g.commandOverride=()=>idle();
  for(const [i,p] of g.players.entries())Object.assign(p,{x:-45+i*3,z:40,y:0,protectedUntil:0});
  g.events=[];return g;
};
// Directly exercising the common damage boundary isolates contribution rules;
// projectile, blast, flame and melee integration is covered separately below.
const hurt=(g:Game,p:Soldier,n:number,source:number,details?:DamageDetails)=>
  (g as any).damage(p,n,source,g.players[source]?.team??null,details);

it("credits actual recent damage to multiple teammates, once, without awarding capture points",()=>{
  const g=scene(),victim=g.players[5];
  hurt(g,victim,20,0);hurt(g,victim,30,1);hurt(g,victim,50,2);
  expect([g.players[0].assists,g.players[1].assists,g.players[2].assists]).toEqual([1,1,0]);
  expect(g.players[2].kills).toBe(1);expect(victim.deaths).toBe(1);
  expect(victim.lastDeath?.assists).toEqual([{actor:0,damage:20},{actor:1,damage:30}]);
  expect(g.events.filter(e=>e.type==="assist")).toHaveLength(2);
  expect(g.scores).toEqual({blue:0,red:0});
  hurt(g,victim,100,2);expect(g.players[0].assists).toBe(1);expect(victim.deaths).toBe(1);
});
it("rejects tiny, expired, friendly, self and environmental assist claims",()=>{
  for(const finish of ["small","expired","friendly","self","self-death","teamkill","ambient","redeploy"] as const) {
    const g=scene(),victim=g.players[5];
    if(finish==="friendly")hurt(g,victim,25,6);
    else if(finish==="self")hurt(g,victim,25,5);
    else hurt(g,victim,finish==="small"?19:25,0);
    if(finish==="expired")g.tick+=combatRules.assistWindow+1;
    if(finish==="redeploy")g.redeploy(victim.id);
    else hurt(g,victim,100,finish==="ambient"?-1:finish==="self-death"?5:finish==="teamkill"?6:1);
    expect(g.players.every(p=>p.assists===0),finish).toBe(true);
  }
});
it.each([299,300,301])("applies the ten-second assist window at %i ticks",ticks=>{
  const g=scene(),v=g.players[5];hurt(g,v,20,0);g.tick=ticks;hurt(g,v,80,1);
  expect(g.players[0].assists).toBe(ticks<=300?1:0);
});
it("awards only the finishing kill's team point in elimination mode",()=>{
  const map={...industrialMap,scoring:"eliminations" as const};
  const g=new Game(new TestCollision(map),true,6000,1,undefined,{map,teamSize:5,ambientArtillery:false});g.events=[];
  hurt(g,g.players[5],25,0);hurt(g,g.players[5],75,1);
  expect(g.players[0].assists).toBe(1);expect(g.players[1].kills).toBe(1);
  expect(g.scores).toEqual({blue:1,red:0});expect(g.events.filter(e=>e.type==="score")).toHaveLength(1);
});
it("does not refresh old contribution damage with a new tiny hit",()=>{
  const g=scene(),v=g.players[5];hurt(g,v,20,0);g.tick+=301;hurt(g,v,1,0);hurt(g,v,100,1);
  expect(g.players[0].assists).toBe(0);
});
it("keeps valid assists after the contributor dies and resets victim history on respawn",()=>{
  const g=scene(),v=g.players[5];hurt(g,v,25,0);hurt(g,g.players[0],100,6);hurt(g,v,75,1);
  expect(g.players[0].assists).toBe(1);
  g.respawn(v);expect(v.recentDamage).toEqual([]);hurt(g,v,100,1);
  expect(g.players[0].assists).toBe(1);expect(v.deaths).toBe(2);
});
it("caps overkill at lost health and records one immutable death report",()=>{
  const g=scene(),v=g.players[5],from={x:5,y:1.6,z:10};
  hurt(g,v,25,0,{kind:"bullet",weapon:"SMLE",from});hurt(g,v,999,1,{kind:"bullet",weapon:"Webley",from});
  const report=v.lastDeath!;from.x=99;g.players[1].x=200;
  expect(report.damage).toBe(75);expect(report.hits).toBe(1);expect(report.weapon).toBe("Webley");expect(report.from?.x).toBe(5);
  const hits=g.events.filter(e=>e.type==="damage");expect(hits.map(e=>e.amount)).toEqual([25,75]);
  hurt(g,v,999,1);expect(v.lastDeath).toBe(report);
  expect(structuredClone(g.snapshot()).players[5].lastDeath).toEqual(report);
});
it("retains the weapon and origin of an in-flight round after its shooter moves or switches",()=>{
  const g=scene(),shooter=g.players[5],victim=g.players[0];
  Object.assign(victim,{x:0,z:8,hp:25});Object.assign(shooter,{x:0,z:-4,yaw:Math.PI,pitch:0,command:{...idle(),aim:true}});
  const weapon=shooter.weaponId!;g.fire(shooter);const origin={...g.projectiles[0].origin!};
  switchWeapon(shooter,"sidearm",g.tick);shooter.x=20;
  for(let n=0;n<5&&victim.hp>0;n++)g.step(idle());
  expect(victim.hp).toBe(0);expect(victim.lastDeath?.weapon).toBe(weapon);expect(victim.lastDeath?.from).toEqual(origin);
});
it("uses the impact location for grenade and ambient artillery deaths, not a distant caller",()=>{
  for(const profile of [grenadeExplosionProfile,ambientArtilleryExplosionProfile]) {
    const g=scene(),v=g.players[0];Object.assign(v,{x:0,z:8,hp:1});const at={x:0,y:1,z:9};
    const ambient=profile.kind.includes("ambient");g.explode(at,ambient?-1:5,ambient?null:"red",{...profile,craterRadius:0,terrainReach:0});
    expect(v.lastDeath?.kind).toBe(ambient?"artillery":"grenade");expect(v.lastDeath?.from).toEqual(at);
    expect(v.lastDeath?.weapon).toBe(ambient?"Ambient artillery":"Fragmentation grenade");
    expect(v.lastDeath!.distance).toBeLessThan(2);
  }
});
it("does not issue damage feedback for zero damage or count redeploy as an enemy kill",()=>{
  const g=scene(),v=g.players[0];hurt(g,v,0,5);expect(g.events).toHaveLength(0);
  g.redeploy();expect(v.lastDeath?.kind).toBe("redeploy");expect(g.players.every(p=>p.kills===0&&p.assists===0)).toBe(true);
});

it("reports real bayonet and butt strikes with their correct cause",()=>{
  for(const bayonet of [true,false]) {
    const g=scene(),p=g.players[0],v=g.players[5];
    Object.assign(p,{x:0,z:8,faction:"british"});if(bayonet)equipLoadout(p,"rifleman");
    Object.assign(v,{x:0,z:6.9,hp:40});g.step({...idle(),melee:true});
    for(let n=0;n<12&&v.hp>0;n++)g.step(idle());
    expect(v.lastDeath?.kind).toBe("melee");expect(v.lastDeath?.weapon).toBe(bayonet?"Bayonet":"Rifle butt");
  }
});
it("keeps flame and delayed burn causes correct after a weapon switch and movement",()=>{
  for(const burn of [false,true]) {
    const g=scene(),p=g.players[0],v=g.players[5];Object.assign(p,{x:0,z:8,yaw:0,pitch:0});Object.assign(v,{x:0,z:4,hp:burn?1.1:.9});
    g.flames.kits=[{id:0,home:{x:0,z:8},at:{x:0,z:8},carrier:null,fuel:240,readyAt:0,droppedAt:null}];
    expect(pickupFlame(g,p)).toBe(true);for(let n=0;n<13;n++)g.step(idle());
    g.fire(p);const ignition={...v.burnFrom!};
    if(burn){switchWeapon(p,"sidearm",g.tick);p.x=30;g.step(idle());}
    expect(v.hp).toBe(0);expect(v.lastDeath?.kind).toBe(burn?"burn":"flame");
    expect(v.lastDeath?.weapon).toBe(burn?"Flamethrower burn":"Wex-inspired flame kit");
    if(burn)expect(v.lastDeath?.from).toEqual(ignition);
  }
});
