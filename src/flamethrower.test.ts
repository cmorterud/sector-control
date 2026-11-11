import {test,expect} from "vitest";
import {Game,idle} from "./simulation";
import {industrialMap,groundHeight} from "./map";
import {trenchMap} from "./trench-map";
import {pickupFlame,dropFlame,advanceFlames} from "./flamethrower";
import {switchWeapon} from "./loadouts";
function scene(blocked=false){
 const g=new Game({ray:()=>blocked?.3:1,move:(p)=>p},true,3000,5,undefined,{map:{...industrialMap,boxes:[]},teamSize:1,ambientArtillery:false});
 g.flames={kits:[{id:0,home:{x:0,z:0},at:{x:0,z:0},fuel:240,carrier:null,readyAt:0,droppedAt:null}]};
 const [p,q]=g.players;Object.assign(p,{x:0,y:0,z:0,yaw:0,protectedUntil:0});Object.assign(q,{x:0,y:0,z:-5,nextThink:1e9,protectedUntil:0});
 expect(pickupFlame(g,p)).toBe(true);return {g,p,q};
}
test("flame spends finite fuel, does 30 DPS, and earth completely blocks the jet",()=>{
 for(const blocked of [false,true]){
  const {g,p,q}=scene(blocked);for(let i=0;i<41;i++)g.step({...idle(),fire:true});
  expect(p.ammo).toBe(210);expect(q.hp).toBeCloseTo(blocked?100:70,6);
  expect(g.flames.kits).toHaveLength(1);
 }
});
test("flame kit replaces primary, preserves pistol, drops remaining fuel, and restocks after exhaustion",()=>{
 const {g,p}=scene();p.ammo=90;switchWeapon(p,"sidearm",g.tick);expect(p.ammo).toBe(8);dropFlame(g,p);
 expect(g.flames.kits[0].fuel).toBe(90);expect(g.flames.kits[0].at).toEqual({x:0,z:0});
 p.flameKit=undefined;expect(pickupFlame(g,p)).toBe(true);expect(p.ammo).toBe(90);
 p.ammo=0;dropFlame(g,p);expect(g.flames.kits[0].at).toBeNull();g.tick+=3600;advanceFlames(g,()=>{});expect(g.flames.kits[0].fuel).toBe(240);
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
test("sustained flame burns wooden cover without deforming earth or damaging concrete",async()=>{
 const {TestCollision}=await import("./simulation");
 const map={...industrialMap,boxes:[{id:"wood-test",x:0,z:-4,w:2,d:.3,h:2,kind:"wood" as const},{id:"concrete-test",x:0,z:-5,w:2,d:.3,h:2,kind:"concrete" as const}]};
 const g=new Game(new TestCollision(map),false,1000,5,undefined,{map,ambientArtillery:false});
 const p=g.players[0];Object.assign(p,{x:0,y:0,z:0,protectedUntil:0});
 g.flames={kits:[{id:0,home:{x:0,z:0},at:{x:0,z:0},fuel:240,carrier:null,readyAt:0,droppedAt:null}]};pickupFlame(g,p);
 for(let i=0;i<270;i++)g.step({...idle(),fire:true});
 expect(g.map.destruction!.objects["wood-test"].stage).toBeGreaterThan(0);
 expect(g.map.destruction!.objects["concrete-test"].stage).toBe(0);
 expect(g.map.destruction!.craters).toHaveLength(0);expect(p.ammo).toBe(0);
});
