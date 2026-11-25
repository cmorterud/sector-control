import {describe,it,expect} from "vitest";
import {Game,TestCollision,idle,type Command} from "./simulation";
import {trainingMap,trainingStations} from "./training-map";
import {TrainingSession,trainingLessons} from "./training";
import {blocked,dist,mantleLanding,groundHeight} from "./map";
import {artilleryExplosionProfile} from "./destruction";
import {trainingHUD,trainingMenu} from "./training-ui";
import {freshControls} from "./controls";
import {architecturePieces} from "./architecture-geometry";

function exercise(index=0,session=new TrainingSession()){
  session.select(index);
  const g=new Game(new TestCollision(trainingMap),true,1,12345,undefined,{map:trainingMap,teamSize:4,ambientArtillery:false});
  session.begin(g);
  const step=(input:Partial<Command>={},ticks=1)=>{for(let n=0;n<ticks;n++){const c={...idle(),firstPerson:true,...input};g.step(c);session.observe(g,c);}};
  const fireAt=(id=4)=>{
    const p=g.players[0],q=g.players[id],yaw=Math.atan2(q.x-p.x,-(q.z-p.z));
    // Raise the sights first: a round fired on the way up leaves from the hip.
    step({yaw,aim:true},8);step({yaw,aim:true,fire:true});step({yaw,aim:true},24);
  };
  return {g,session,step,fireAt,p:g.players[0],done:session.progress[index]};
}

describe("training grounds",()=>{
  it("has eight safe checkpoints, usable numbered boards and a real low wall to mantle",()=>{
    expect(new Set(trainingStations.map(s=>s.id)).size).toBe(8);
    expect(trainingMap.boxes.length).toBeLessThan(1500);
    for(const s of trainingStations){
      expect(blocked(s.x,s.z,.6,trainingMap),s.id).toBe(false);
      expect(blocked(s.x-7,s.z+2,.6,trainingMap),s.id).toBe(false);
    }
    expect(mantleLanding({x:-48,z:57,y:0},{x:0,z:-1},trainingMap)).not.toBeNull();
  });
  it("draws numbered instruction boards and every training letter on both faces",()=>{
    const board=trainingMap.boxes.find(b=>b.id==="training-board-weapons")!;
    const pieces=architecturePieces(board,0);
    expect(pieces.filter(p=>p.name==="painted entrance sign")).toHaveLength(2);
    for(const letter of "0123456789HJKPQVWXYZ&"){
      const geometry=architecturePieces({...board,architecture:{...board.architecture!,sign:letter}},0);
      expect(geometry.filter(p=>p.name==="painted sign lettering").length,letter).toBeGreaterThan(0);
    }
  });
  it.each(trainingStations.map((s,i)=>[i,s.name] as const))("exercise %i does not end or pass itself while idle (%s)",(index)=>{
    const {g,session,step}=exercise(index);
    // Combat continues, but passing always requires a player's action or presence.
    step({},2);
    expect(g.phase).toBe("playing");expect(g.scoreLimit).toBeNull();
    expect(g.artillery.ambient.enabled).toBe(false);
    expect(session.passed).toBe(false);
  });
  it("recognizes walking, sprinting, crouching, jumping, mantling and camera switching through normal steps",()=>{
    const {g,p,session,step,done}=exercise();
    step({x:-1,sprint:true},60);
    step({crouch:true});step({crouch:false});
    step({mantle:true});step({},45);
    Object.assign(p,{x:-48,z:57,y:0,yaw:0,hop:null,fall:null,nextMantle:0});
    step({mantle:true});step({},45);
    step({firstPerson:false});
    Object.assign(p,{x:-48,z:46,y:groundHeight(-48,46,g.map)});step({aim:true,fire:true});
    expect([...done]).toEqual(expect.arrayContaining(["walk","sprint","crouch","hop","mantle","view","step"]));
    expect(session.passed).toBe(true);expect(p.mantle).toBeNull();expect(g.phase).toBe("playing");
  });
  it("range targets do not fire back, and a moving target actually moves",()=>{
    const {g,step}=exercise(1),before={...g.players[6]};let enemyShots=0;
    for(let n=0;n<120;n++){step();enemyShots+=g.events.filter(e=>e.type==="fire"&&e.actor!==0).length;}
    expect(enemyShots).toBe(0);expect(dist(before,g.players[6])).toBeGreaterThan(.5);
  });
  it("spawns every active trainee clear of cover in all eight exercises",()=>{
    for(let i=0;i<8;i++){const {g}=exercise(i);for(const p of g.players.filter(p=>p.hp>0))expect(blocked(p.x,p.z,.6,g.map),`${i}: ${p.id}`).toBe(false);}
  });
  it("returns a killed trainee to the selected checkpoint with the selected faction and kit",()=>{
    const session=new TrainingSession();session.faction="french";session.loadout="marksman";
    const {g,p,step}=exercise(4,session);
    g.redeploy();session.observe(g,idle());expect(p.hp).toBe(0);expect(session.resupply(g)).toBe(false);
    step({},60);expect(p.hp).toBe(100);expect(dist(p,trainingStations[4])).toBeLessThan(.1);
    expect(p.faction).toBe("french");expect(p.loadout).toBe("marksman");expect(p.weaponId).toBe("Scoped Lebel");
  });
  it("credits real rifle hits and reloads, not merely firing at the backstop",()=>{
    const {g,p,step,fireAt,done}=exercise(1);
    step({yaw:1.5,fire:true});step({},34);expect(done.has("rifle")).toBe(false);
    fireAt();expect(done.has("rifle")).toBe(true);
    expect(g.players[4].hp).toBeLessThan(100);
    step({reload:true});step({},66);expect(done.has("reload")).toBe(true);expect(p.ammo).toBe(10);
  });
  it.each(["marksman","support"] as const)("uses the real %s loadout and credits hits",loadout=>{
    const session=new TrainingSession();session.loadout=loadout;
    const {p,fireAt,done}=exercise(1,session);fireAt();
    expect(p.loadout).toBe(loadout);expect(done.has(loadout==="marksman"?"scope":"machineGun")).toBe(true);
  });
  it("offers faction-specific kit and pistol switching without changing ordinary matches",()=>{
    for(const faction of ["british","german","french"] as const){
      const session=new TrainingSession();session.faction=faction;
      const {p,step,fireAt,done}=exercise(1,session);
      expect(p.faction).toBe(faction);expect(p.inventory!.sidearm.kind).toBe("pistol");
      step({equip:"sidearm"});step({},30);fireAt();expect(done.has("pistol")).toBe(true);
    }
    const normal=new Game(new TestCollision(trainingMap),false,1,1,undefined,{map:{...trainingMap,id:"village"}});
    normal.step(idle());expect(normal.phase).toBe("ended");
  });
  it("also teaches the Industrial map's actual AR-01 semiautomatic rifle",()=>{
    const session=new TrainingSession();session.faction="trainingBlue";
    const {p,fireAt,done}=exercise(1,session);
    expect(p.weapon).toBe("rifle");expect(p.weaponId).toBe("AR-01");expect(p.ammo).toBe(30);
    fireAt();expect(done.has("semi")).toBe(true);expect(done.has("rifle")).toBe(false);
  });
  it("teaches actual flame-kit pickup and firing",()=>{
    const {g,p,step,done}=exercise(1);
    Object.assign(p,g.flames.kits[0].at);
    step({interact:true});expect(p.weapon).toBe("flamethrower");
    step({},20);step({fire:true},4);expect(done.has("flame")).toBe(false);
    Object.assign(p,{x:g.players[4].x,z:g.players[4].z+6});step({fire:true},6);
    expect(done.has("flame")).toBe(true);expect(p.ammo).toBeLessThan(240);
  });
  it("recognizes a real grenade explosion in the target area and a smoke bloom",()=>{
    const {g,step,done}=exercise(2);let explosion:unknown;
    step({grenade:true,yaw:0,pitch:.15});
    for(let n=0;n<130;n++){step();explosion=g.events.find(e=>e.type==="grenadeExplosion")??explosion;}
    expect(explosion).toBeTruthy();expect(done.has("grenade"),JSON.stringify(explosion)).toBe(true);
    step({smoke:true});step({},150);expect(done.has("smoke")).toBe(true);
  });
  it("recognizes both a real bayonet thrust and sustained charge hit",()=>{
    const {g,p,step,done}=exercise(3);
    Object.assign(p,{x:48,z:19.5,yaw:0});step({melee:true});step({},40);
    expect(done.has("thrust")).toBe(true);
    Object.assign(p,{x:48,z:27,yaw:0});step({z:-1,sprint:true},10);step({z:-1,sprint:true,melee:true});step({z:-1,sprint:true},100);
    expect(done.has("charge")).toBe(true);expect(g.players[0].kills).toBeGreaterThan(0);
  });
  it("does not count a machine-gun butt strike as a bayonet thrust",()=>{
    const session=new TrainingSession();session.loadout="support";
    const {g,p,step,done}=exercise(3,session);Object.assign(p,{x:48,z:19,yaw:0});
    step({melee:true});step({},40);expect(g.players[4].hp).toBeLessThan(100);expect(done.has("thrust")).toBe(false);
  });
  it("calls real artillery and observes its delayed impacts",()=>{
    const {g,step,done}=exercise(4);
    step({artillery:{...trainingStations[4].target,area:true}});expect(done.has("call")).toBe(true);
    expect(done.has("impact")).toBe(false);step({},330);
    expect(done.has("impact")).toBe(true);expect(g.map.destruction!.craters.length).toBeGreaterThan(0);
  });
  it("credits real structural breaches, fallen trees and craters; reset restores authored geometry",()=>{
    const {g,session,p}=exercise(5);
    const wall=g.map.boxes.find(b=>b.architecture?.building==="demolition-house"&&b.architecture.part==="wall")!;
    expect(wall).toBeTruthy();
    for(let i=0;i<4;i++)g.explode({x:wall.x,y:(wall.baseY??0)+1,z:wall.z-wall.d/2-.12},0,"blue",artilleryExplosionProfile);
    for(let i=0;i<4;i++)g.explode({x:-28.4,y:.5,z:-2},0,"blue",artilleryExplosionProfile);
    g.explode({x:-48,y:.1,z:10},0,"blue",artilleryExplosionProfile);
    session.observe(g,idle());
    expect([...session.progress[5]],JSON.stringify(g.events.filter(e=>e.type==="destruction").map(e=>e.type==="destruction"?e.change.objects.slice(0,4):[]))).toEqual(expect.arrayContaining(["breach","tree","crater"]));
    session.select(5,true);const clean=exercise(5,session);
    expect(clean.g.map.destruction!.craters).toHaveLength(0);expect(clean.session.progress[5].size).toBe(0);
    expect(trainingMap.boxes.some(b=>b.id===wall.id)).toBe(true);expect(p.hp).toBeGreaterThan(0);
  });
  it("activates real friendly and enemy AI only for combat exercises",()=>{
    const {g,step}=exercise(6);let shots=0,reactions=0;
    for(let n=0;n<240&&(!shots||!reactions);n++){step();shots+=g.events.filter(e=>e.type==="fire"&&e.actor!==0).length;reactions+=g.events.filter(e=>e.type==="combatReaction"||e.type==="reactionCover").length;}
    expect(g.players.filter(p=>p.team==="blue"&&p.id!==0&&p.hp>0).length).toBeGreaterThan(0);
    expect(shots).toBeGreaterThan(0);expect(reactions).toBeGreaterThan(0);
  });
  it("final defenders stay defeated and capture requires the player at a genuinely blue flag",()=>{
    const {g,p,step,done}=exercise(7);
    for(const q of g.players.slice(4))if(q.hp>0)g.explode({x:q.x,y:q.y+.5,z:q.z},0,"blue",{...artilleryExplosionProfile,radius:2,damage:1000,partialCover:false,structuralRadius:0,craterRadius:0,terrainReach:0});
    step();expect(done.has("clear")).toBe(true);
    step({},100);expect(done.has("capture")).toBe(false);
    Object.assign(p,{x:40,z:-65,y:0});step({},700);
    expect(g.sectors[0].owner,JSON.stringify({s:g.sectors[0],p:{x:p.x,z:p.z,hp:p.hp,y:p.y},players:g.players.map(q=>({id:q.id,hp:q.hp,x:q.x,z:q.z}))})).toBe("blue");expect(done.has("capture")).toBe(true);
    expect(g.players.slice(4).every(q=>q.hp<=0)).toBe(true);
  });
  it("resupplies consumables and artillery, recognizes board interaction and preserves completed tasks across gear changes",()=>{
    const {g,p,session,step}=exercise(1);
    step({reload:true});p.ammo=0;p.reserve=0;p.grenades=0;p.smokes=0;p.hp=20;g.artillery.readyAt.blue=10000;
    session.resupply(g);expect(p.ammo).toBe(10);expect(p.reserve).toBe(60);expect(p.grenades).toBe(3);expect(p.smokes).toBe(1);expect(p.hp).toBe(100);expect(g.artillery.readyAt.blue).toBe(g.tick);
    p.inventory!.primary.ammo=0;p.inventory!.sidearm.ammo=0;step({equip:"sidearm"});session.resupply(g);
    expect(p.inventory!.primary.ammo).toBe(10);expect(p.inventory!.sidearm.ammo).toBe(6);
    Object.assign(p,{x:41,z:24});expect(session.interaction(g)).toBe(3);
    expect(()=>session.select(-1)).toThrow();expect(()=>session.select(8)).toThrow();
  });
  it("prints remapped controls, an honest free-practice view and every station/armory choice",()=>{
    const {g,session}=exercise();const controls=freshControls();controls.bindings.sprint="KeyP";
    session.progress[0].add("walk");
    expect(trainingHUD(session,g,controls)).toContain("<kbd>P</kbd>");
    expect(trainingHUD(session,g,controls)).not.toContain("<kbd>Shift</kbd>");
    session.free=true;expect(trainingHUD(session,g,controls)).toContain("no required order");
    expect(trainingHUD(session,g,controls)).not.toContain('aria-label="Exercise progress"');
    const menu=trainingMenu(session,true);for(const s of trainingStations)expect(menu).toContain(s.name.replace("&","&amp;"));
    for(const role of ["rifleman","marksman","support"])expect(menu).toContain(`value="${role}"`);
    expect(trainingLessons).toHaveLength(8);
  });
});
