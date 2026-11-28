import {describe,it,expect} from "vitest";
import {Game,TestCollision,idle,type Command} from "./simulation";
import {trainingMap,trainingStations,trainingYaw,movementMarks,demolitionMarks} from "./training-map";
import {TrainingSession,trainingLessons} from "./training";
import {blocked,dist,mantleLanding,groundHeight} from "./map";
import {artilleryExplosionProfile} from "./destruction";
import {trainingCue,trainingHUD,trainingMenu,trainingPrompt} from "./training-ui";
import {freshControls} from "./controls";
import {trainingMarkerPosition} from "./training-markers";
import {gasStrikeRules,gasRules} from "./gas";
import {artillerySector} from "./artillery-sectors";
import {architecturePieces} from "./architecture-geometry";

function freePractice(){
  const session=new TrainingSession();session.free=true;return session;
}
function exercise(index=0,session=freePractice()){
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
  it("has nine safe checkpoints, usable numbered boards and a real low wall to mantle",()=>{
    expect(new Set(trainingStations.map(s=>s.id)).size).toBe(9);
    expect(trainingMap.boxes.length).toBeLessThan(1500);
    for(const s of trainingStations){
      expect(blocked(s.x,s.z,.6,trainingMap),s.id).toBe(false);
      expect(blocked(s.x-7,s.z+2,.6,trainingMap),s.id).toBe(false);
    }
    expect(mantleLanding({x:-48,z:57,y:0},{x:0,z:-1},trainingMap)).not.toBeNull();
  });
  it("keeps the target lanes clear and screens the road and other exercises behind the earth banks",()=>{
    const collision=new TestCollision(trainingMap);
    for(const [station,end] of [
      [trainingStations[1],{x:0,z:19,y:3}],
      [trainingStations[2],{x:48,z:104,y:3}],
    ] as const){
      const eye={x:station.x,z:station.z,y:1.65};
      expect(collision.ray(eye,{...station.target,y:1.2}),station.id).toBe(1);
      expect(collision.ray(eye,end),station.id).toBeLessThan(1);
    }
    const weapon=trainingStations[1];
    const eye={x:weapon.x,z:weapon.z,y:1.65};
    for(const x of [-44,44]){
      expect(collision.ray(eye,{x,z:5,y:5})).toBeLessThan(.75);
    }
    const road=trainingMap.streets![0].points;
    for(let i=1;i<road.length;i++){
      const a=road[i-1],b=road[i],steps=Math.ceil(dist(a,b));
      for(let j=0;j<=steps;j++){
        const t=j/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
        expect(groundHeight(x,z,trainingMap), `road at ${x}, ${z}`).toBeLessThan(.15);
        expect(blocked(x,z,.6,trainingMap), `road at ${x}, ${z}`).toBe(false);
      }
    }
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
  it("spawns every active trainee clear of cover in every exercise",()=>{
    for(let i=0;i<trainingStations.length;i++){const {g}=exercise(i);for(const p of g.players.filter(p=>p.hp>0))expect(blocked(p.x,p.z,.6,g.map),`${i}: ${p.id}`).toBe(false);}
  });
  it("returns a killed trainee to the selected checkpoint with the selected faction and kit",()=>{
    const session=freePractice();session.faction="french";session.loadout="marksman";
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
    const session=freePractice();session.loadout=loadout;
    const {p,fireAt,done}=exercise(1,session);fireAt();
    expect(p.loadout).toBe(loadout);expect(done.has(loadout==="marksman"?"scope":"machineGun")).toBe(true);
  });
  it("offers faction-specific kit and pistol switching without changing ordinary matches",()=>{
    for(const faction of ["british","german","french"] as const){
      const session=freePractice();session.faction=faction;
      const {p,step,fireAt,done}=exercise(1,session);
      expect(p.faction).toBe(faction);expect(p.inventory!.sidearm.kind).toBe("pistol");
      step({equip:"sidearm"});step({},30);fireAt();expect(done.has("pistol")).toBe(true);
    }
    const normal=new Game(new TestCollision(trainingMap),false,1,1,undefined,{map:{...trainingMap,id:"village"}});
    normal.step(idle());expect(normal.phase).toBe("ended");
  });
  it("also teaches the Industrial map's actual AR-01 semiautomatic rifle",()=>{
    const session=freePractice();session.faction="trainingBlue";
    const {p,fireAt,done}=exercise(1,session);
    expect(p.weapon).toBe("rifle");expect(p.weaponId).toBe("AR-01");expect(p.ammo).toBe(30);
    fireAt();expect(done.has("semi")).toBe(true);expect(done.has("rifle")).toBe(false);
  });
  it("credits even a single direct flame hit from the pickup on a tick without a visible plume",()=>{
    const {g,p,step,done}=exercise(1);
    const target=g.players[7];
    Object.assign(p,g.flames.kits[0].at);
    step({interact:true});expect(p.weapon).toBe("flamethrower");
    step({},20);step({fire:true,yaw:Math.PI},4);expect(done.has("flame")).toBe(false);
    if((g.tick+1)%3===0)step();
    step({fire:true});
    expect(g.events.some(e=>e.type==="flame")).toBe(false);
    expect(g.events).toContainEqual(expect.objectContaining({type:"damage",kind:"flame",actor:target.id}));
    expect(done.has("flame")).toBe(true);
  });
  it("resupplies a dropped empty flame kit at the training pickup point",()=>{
    const {g,p,step,session}=exercise(1);
    const kit=g.flames.kits[0];
    Object.assign(p,kit.at);
    step({interact:true});expect(p.weapon).toBe("flamethrower");
    p.ammo=0;step();step({interact:true});
    expect(kit.at).toBeNull();expect(p.weapon).toBe("pistol");
    expect(session.resupply(g)).toBe(true);
    expect(kit).toMatchObject({at:kit.home,fuel:240,carrier:null});
    step();step({interact:true});
    expect(p.weapon).toBe("flamethrower");expect(p.ammo).toBe(240);
  });
  it("recognizes a real grenade explosion in the target area and a smoke bloom",()=>{
    const {g,step,done}=exercise(2);let explosion:unknown;
    expect(g.players[0].yaw).toBe(Math.PI);
    const yaw=trainingYaw(trainingStations[2]);
    step({grenade:true,yaw,pitch:.15});
    for(let n=0;n<130;n++){step({yaw,pitch:.15});explosion=g.events.find(e=>e.type==="grenadeExplosion")??explosion;}
    expect(explosion).toBeTruthy();expect(done.has("grenade"),JSON.stringify(explosion)).toBe(true);
    step({smoke:true,yaw});step({yaw},150);expect(done.has("smoke")).toBe(true);
  });
  it("recognizes both a real bayonet thrust and sustained charge hit",()=>{
    const {g,p,step,done}=exercise(3);
    Object.assign(p,{x:48,z:19.5,yaw:0});step({melee:true});step({},40);
    expect(done.has("thrust")).toBe(true);
    Object.assign(p,{x:48,z:27,yaw:0});step({z:-1,sprint:true},10);step({z:-1,sprint:true,melee:true});step({z:-1,sprint:true},100);
    expect(done.has("charge")).toBe(true);expect(g.players[0].kills).toBeGreaterThan(0);
  });
  it("does not count a machine-gun butt strike as a bayonet thrust",()=>{
    const session=freePractice();session.loadout="support";
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
    for(let i=0;i<4;i++)g.explode({...demolitionMarks.tree,x:demolitionMarks.tree.x+.6,y:.5},0,"blue",artilleryExplosionProfile);
    g.explode({x:-48,y:.1,z:10},0,"blue",artilleryExplosionProfile);
    session.observe(g,idle());
    expect([...session.progress[5]],JSON.stringify(g.events.filter(e=>e.type==="destruction").map(e=>e.type==="destruction"?e.change.objects.slice(0,4):[]))).toEqual(expect.arrayContaining(["breach","tree","crater"]));
    session.select(5,true);const clean=exercise(5,session);
    expect(clean.g.map.destruction!.craters).toHaveLength(0);expect(clean.session.progress[5].size).toBe(0);
    expect(trainingMap.boxes.some(b=>b.id===wall.id)).toBe(true);expect(p.hp).toBeGreaterThan(0);
  });
  it("activates real friendly and enemy AI only for combat exercises",()=>{
    const {g,step}=exercise(7);let shots=0,reactions=0;
    for(let n=0;n<240&&(!shots||!reactions);n++){step();shots+=g.events.filter(e=>e.type==="fire"&&e.actor!==0).length;reactions+=g.events.filter(e=>e.type==="combatReaction"||e.type==="reactionCover").length;}
    expect(g.players.filter(p=>p.team==="blue"&&p.id!==0&&p.hp>0).length).toBeGreaterThan(0);
    expect(shots).toBeGreaterThan(0);expect(reactions).toBeGreaterThan(0);
  });
  it("final defenders stay defeated and capture requires the player at a genuinely blue flag",()=>{
    const {g,p,step,done}=exercise(8);
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
    expect(()=>session.select(-1)).toThrow();expect(()=>session.select(9)).toThrow();
  });
  it("guides movement through real checkpoints, then opens the next station from the finish",()=>{
    const {g,p,session,step,done}=exercise(0,new TrainingSession());
    const moveTo=({x,z}:{x:number;z:number},sprint=false)=>{
      for(let i=0;i<180 && Math.hypot(x-p.x,z-p.z)>.25;i++){
        const d=Math.hypot(x-p.x,z-p.z);
        step({x:(x-p.x)/d,z:(z-p.z)/d,sprint});
      }
      step({},10);
    };
    expect(trainingCue(session,g)?.at).toEqual(movementMarks.walk);
    const marker=trainingCue(session,g)!;
    expect(trainingMarkerPosition(marker,g,()=>({x:640,y:380,z:8}),1280,720))
      .toEqual({x:640,y:380,arrow:"▼"});
    expect(trainingMarkerPosition(marker,g,()=>({x:2000,y:380,z:8}),1280,720)?.arrow).toBe("▶");
    step({crouch:true});step({});
    expect(done.size).toBe(0);
    expect(session.interaction(g)).toBeNull();
    moveTo(movementMarks.walk);
    expect(session.nextGoal).toBe("sprint");
    moveTo(movementMarks.sprint,true);
    expect(session.nextGoal).toBe("crouch");
    step({crouch:true});
    expect(session.nextGoal).toBe("crouch");
    expect(trainingPrompt(session,g,freshControls())).toContain("again to stand");
    step();
    expect(trainingCue(session,g)?.at).toEqual(movementMarks.hop);
    moveTo(movementMarks.hop);
    step({mantle:true});step({},28);
    expect(session.nextGoal).toBe("mantle");
    moveTo(movementMarks.mantle);
    step({mantle:true});step({},38);
    expect(session.nextGoal).toBe("view");
    step({firstPerson:false});
    expect(session.nextGoal).toBe("step");
    expect(trainingCue(session,g)?.at).toEqual(movementMarks.trench);
    moveTo(movementMarks.trench);
    expect(trainingCue(session,g)?.at).toEqual(movementMarks.step);
    step({z:-1,mantle:true});step({z:-1},12);step({},20);
    expect(p.y).toBeCloseTo(-.5,1);
    step({aim:true,fire:true});
    expect(session.passed).toBe(true);
    expect(session.interaction(g)).toBe(1);
  });
  it("issues the range kits as the guided drill advances",()=>{
    const {g,p,session,step,fireAt}=exercise(1,new TrainingSession());
    expect(session.nextGoal).toBe("rifle");
    fireAt();step({reload:true});step({},90);
    expect(session.nextGoal).toBe("scope");expect(p.loadout).toBe("marksman");
    fireAt();expect(session.nextGoal).toBe("machineGun");expect(p.loadout).toBe("support");
    for(let i=0;i<5 && session.nextGoal==="machineGun";i++) fireAt(g.players[4].hp>0?4:5);
    expect(session.nextGoal).toBe("pistol");expect(p.loadout).toBe("rifleman");
    step({equip:"sidearm"});step({},30);
    for(let i=0;i<3 && session.nextGoal==="pistol";i++) fireAt(g.players[4].hp>0?4:5);
    expect(session.nextGoal).toBe("flame");expect(trainingCue(session,g)?.at).toEqual(g.flames.kits[0].at);
    const kit=g.flames.kits[0];
    Object.assign(p,kit.at);
    step({interact:true});step({},20);
    expect(p.weapon).toBe("flamethrower");
    p.ammo=0;step();
    expect(trainingPrompt(session,g,freshControls())).toContain("drop the empty kit");
    step({interact:true});step();
    expect(kit.at).toEqual(kit.home);
    step({interact:true});step({},20);
    expect(p.ammo).toBe(240);
    step({fire:true});
    expect(session.nextGoal).toBe("semi");
    expect(p.weapon).toBe("rifle");
    expect(p.flameKit).toBeUndefined();
    expect(p.flamePrimary).toBeUndefined();
    expect(kit.carrier).toBeNull();
  });
  it("requires a gas call on the marked sector, then a properly sealed mask and that strike landing",()=>{
    const {g,session,step,done}=exercise(6,new TrainingSession());
    const target=artillerySector(g.map,session.station.target);
    const gasStrike={...target,area:true as const};
    step({gasMask:true});step({},gasRules.donTicks+1);
    expect(done.size).toBe(0);
    step({gasStrike});
    expect(session.nextGoal).toBe("gasMask");
    expect(done.has("gasLand")).toBe(false);
    step();expect(done.has("gasMask")).toBe(false);
    step({gasMask:true});step({},gasRules.doffTicks);
    step({gasMask:true});step({},gasRules.donTicks-1);
    expect(done.has("gasMask")).toBe(false);
    step();expect(session.nextGoal).toBe("gasLand");
    step({},gasStrikeRules.flightTicks);
    expect(session.passed).toBe(true);
    expect(session.interaction(g)).toBe(7);
  });
  it("prints remapped controls, an honest free-practice view and every station/armory choice",()=>{
    const {g,session}=exercise(0,new TrainingSession());const controls=freshControls();controls.bindings.sprint="KeyP";
    session.progress[0].add("walk");
    expect(trainingPrompt(session,g,controls)).toContain("<kbd>P</kbd>");
    expect(trainingPrompt(session,g,controls)).not.toContain("<kbd>Shift</kbd>");
    session.free=true;expect(trainingPrompt(session,g,controls)).toBe("");
    expect(trainingHUD(session,g)).not.toContain('aria-label="Exercise progress"');
    const menu=trainingMenu(session,true);for(const s of trainingStations)expect(menu).toContain(s.name.replace("&","&amp;"));
    for(const role of ["rifleman","marksman","support"])expect(menu).toContain(`value="${role}"`);
    expect(trainingLessons).toHaveLength(trainingStations.length);
  });
});
