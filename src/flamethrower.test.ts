import {test,expect} from "vitest";
import {Game,idle,TestCollision} from "./simulation";
import {industrialMap,groundHeight,type MapDefinition} from "./map";
import {trenchMap} from "./trench-map";
import {pickupFlame,advanceFlames,canDropEmptyFlame,flameRules} from "./flamethrower";
import {switchWeapon} from "./loadouts";
import {activeTank,rayTanks,takeCommand} from "./tanks";

function scene(blocked=false){
 const g=new Game({ray:()=>blocked?.3:1,move:(p)=>p},true,3000,5,undefined,{map:{...industrialMap,boxes:[]},teamSize:1,ambientArtillery:false});
 g.flames={kits:[{id:0,home:{x:0,z:0},at:{x:0,z:0},fuel:240,carrier:null,readyAt:0,droppedAt:null}]};
 const [p,q]=g.players;Object.assign(p,{x:0,y:0,z:0,yaw:0,protectedUntil:0});Object.assign(q,{x:0,y:0,z:-5,nextThink:1e9,protectedUntil:0});
 expect(pickupFlame(g,p)).toBe(true);return {g,p,q};
}
function field(boxes:MapDefinition["boxes"]=[],tanks=false){
 const map:MapDefinition={...industrialMap,id:tanks?"trenches":"industrial",boxes};
 const g=new Game(new TestCollision(map),true,10000,5,undefined,{map,teamSize:2,ambientArtillery:false,tanks});
 g.commandOverride=()=>idle();
 g.step(idle());
 const [p,ally,enemy,other]=g.players;
 Object.assign(p,{x:0,y:0,z:0,yaw:0,protectedUntil:0,ammo:12,reserve:39});
 const issuedPrimary={kind:p.weapon,id:p.weaponId,ammo:p.ammo,reserve:p.reserve,nextShot:p.nextShot,lastShotAt:p.lastShotAt};
 Object.assign(ally,{x:20,y:0,z:20,protectedUntil:0});
 Object.assign(enemy,{x:0,y:0,z:-6,protectedUntil:0});
 Object.assign(other,{x:20,y:0,z:-20,protectedUntil:0});
 g.flames.kits=[{id:0,home:{x:0,z:0},at:{x:0,z:0},fuel:240,carrier:null,readyAt:0,droppedAt:null}];
 g.step({...idle(),interact:true});
 expect(p.weapon).toBe("flamethrower");
 g.tick=Math.ceil(p.nextShot/3)*3-1;
 return {g,p,ally,enemy,other,issuedPrimary};
}
test("flame spends finite fuel, does 30 DPS, and earth completely blocks the jet",()=>{
 for(const blocked of [false,true]){
  const {g,p,q}=scene(blocked);for(let i=0;i<41;i++)g.step({...idle(),fire:true});
  expect(p.ammo).toBe(210);expect(q.hp).toBeCloseTo(blocked?100:70,6);
  expect(g.flames.kits).toHaveLength(1);
 }
});
test("a soldier who dies with the kit holstered drops its remaining fuel",()=>{
 const {g,p,q}=scene();p.ammo=90;switchWeapon(p,"sidearm",g.tick);expect(p.ammo).toBe(8);
 expect(g.redeploy()).toBe(true);
 const kit=g.flames.kits[0];
 expect(kit).toMatchObject({fuel:90,at:{x:0,z:0},carrier:null});
 Object.assign(q,{x:0,y:0,z:0});
 expect(pickupFlame(g,q)).toBe(true);expect(q.ammo).toBe(90);
});
test.each(["primary","sidearm"] as const)("interact drops an empty kit while using the %s, releases its supply slot and restores the primary",slot=>{
 const {g,p,issuedPrimary}=field();
 const kit=g.flames.kits[0],fresh={...kit,id:1,carrier:null,at:{...kit.home},fuel:240};
 g.flames.kits.push(fresh);
 p.ammo=1;
 expect(canDropEmptyFlame(g,p)).toBe(false);
 g.step({...idle(),fire:true});
 expect(p.ammo).toBe(0);
 expect(p.flameKit).toBe(kit.id);
 if(slot==="sidearm")g.step({...idle(),equip:"sidearm"});
 expect(canDropEmptyFlame(g,p)).toBe(true);
 g.step({...idle(),interact:true,fire:true});
 const droppedAt=g.tick;
 expect(g.events).toContainEqual(expect.objectContaining({type:"flameDrop",actor:p.id,kit:kit.id,fuel:0}));
 expect(g.events.some(e=>e.type==="fire")).toBe(false);
 expect(p.weapon).toBe("pistol");
 expect(p.inventory?.primary).toEqual(issuedPrimary);
 expect(p.flameKit).toBeUndefined();
 expect(canDropEmptyFlame(g,p)).toBe(false);
 expect(kit).toMatchObject({at:null,carrier:null,fuel:0,readyAt:droppedAt+flameRules.restock});
 g.step({...idle(),interact:true});
 expect(fresh.carrier).toBeNull();
 g.step(idle());
 g.step({...idle(),interact:true});
 expect(p.flameKit).toBe(fresh.id);
 expect(p.ammo).toBe(flameRules.fuel);
 g.tick=droppedAt+flameRules.restock-1;advanceFlames(g,()=>{});
 expect(kit.at).toBeNull();
 g.tick++;advanceFlames(g,()=>{});
 expect(kit).toMatchObject({at:kit.home,carrier:null,fuel:flameRules.fuel});
});
test("two supply positions sit on traversable trench floors, and restart clears burns and carriers",()=>{
 const g=new Game({ray:()=>1,move:p=>p},false,100,5,undefined,{map:trenchMap});
 expect(g.flames.kits).toHaveLength(2);
 for(const kit of g.flames.kits)expect(groundHeight(kit.at!.x,kit.at!.z,g.map)).toBeLessThan(.1);
});
test("flame burn is brief and does not add damage while the jet is hitting",()=>{
 const {g,q}=scene(); for(let i=0;i<12;i++)g.step(idle());
 g.step({...idle(),fire:true});expect(q.hp).toBeCloseTo(99,6);
 for(let i=0;i<40;i++)g.step(idle());expect(q.hp).toBeCloseTo(93.2,6);
});
test("cover clips the visible jet and the off-center damage cone, even with clear line of sight to the target",()=>{
 const {g,enemy}=field([{id:"cover",x:0,z:-2,w:.4,d:.2,h:2,kind:"concrete"}]);
 enemy.x=.8;
 expect(g.collision.ray({x:0,y:1.53,z:0},{x:enemy.x,y:1.155,z:enemy.z})).toBe(1);
 g.step({...idle(),fire:true});
 const flame=g.events.find(e=>e.type==="flame");
 expect(flame?.to.z).toBeCloseTo(-1.9);
 expect(enemy.hp).toBe(100);
});
test("a tank hull stops the jet and protects both its crew and infantry behind it",()=>{
 const {g,p,enemy,other}=field([],true);
 if(enemy.tank===undefined)expect(takeCommand(g,enemy)).toBe(true);
 const tank=activeTank(g,"red")!;
 expect(enemy.tank).toBe(tank.id);
 Object.assign(tank,{x:0,y:0,z:-5,yaw:Math.PI/2});
 Object.assign(enemy,{x:tank.x,y:.4,z:tank.z});
 Object.assign(other,{x:0,y:0,z:-7.8});
 const from={x:0,y:1.53,z:0},end={...from,z:-flameRules.range};
 const cut=rayTanks(g,from,end);
 expect(cut.tank).toBe(tank);
 const armorHp=tank.hp;
 g.tick++;
 g.fire(p);
 expect(g.events.find(e=>e.type==="flame")?.to.z).toBeCloseTo(end.z*cut.t);
 expect(enemy.hp).toBe(100);expect(other.hp).toBe(100);expect(tank.hp).toBe(armorHp);
});
test("enemy bots evade the flame while friendly bots keep their fire command",()=>{
 const {g,ally,enemy}=field();
 Object.assign(ally,{x:1,y:0,z:enemy.z});
 const previousThreat=ally.flameThreatUntil;
 g.step({...idle(),fire:true});
 expect(ally.hp).toBe(100);expect(ally.flameThreatUntil).toBe(previousThreat);
 expect(enemy.hp).toBe(99);expect(enemy.flameThreatUntil).toBe(g.tick+45);
 g.commandOverride=()=>({...idle(),aim:true,fire:true});
 g.step(idle());
 expect(ally.command).toMatchObject({fire:true,sprint:false});
 expect(enemy.command).toMatchObject({fire:false,sprint:true});
});
test("sustained flame burns wooden cover without deforming earth or damaging concrete",()=>{
 const map={...industrialMap,boxes:[{id:"wood-test",x:0,z:-4,w:2,d:.3,h:2,kind:"wood" as const},{id:"concrete-test",x:0,z:-5,w:2,d:.3,h:2,kind:"concrete" as const}]};
 const g=new Game(new TestCollision(map),false,1000,5,undefined,{map,ambientArtillery:false});
 const p=g.players[0];Object.assign(p,{x:0,y:0,z:0,protectedUntil:0});
 g.flames={kits:[{id:0,home:{x:0,z:0},at:{x:0,z:0},fuel:240,carrier:null,readyAt:0,droppedAt:null}]};pickupFlame(g,p);
 for(let i=0;i<270;i++)g.step({...idle(),fire:true});
 expect(g.map.destruction!.objects["wood-test"].stage).toBeGreaterThan(0);
 expect(g.map.destruction!.objects["concrete-test"].stage).toBe(0);
 expect(g.map.destruction!.craters).toHaveLength(0);expect(p.ammo).toBe(0);
});
