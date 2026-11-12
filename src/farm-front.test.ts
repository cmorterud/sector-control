import {test,expect} from "vitest";
import {trenchMap} from "./trench-map";
import {blocked,industrialMap,groundHeight,type Box} from "./map";
import {Game,TestCollision} from "./simulation";
import {grenadeExplosionProfile,artilleryExplosionProfile} from "./destruction";
import {farmPropParts} from "./farm-props";
import {groundField,groundPuddles} from "./ground-surface";
const parts=trenchMap.boxes.filter(b=>b.id?.startsWith('farm-'));
test("clusters destructible farm cover while keeping deployment, firing posts and standing cross-field sightlines open",()=>{
 expect(parts.length).toBeGreaterThan(55);expect(parts.length).toBeLessThan(140);
 expect(parts.filter(b=>b.farmProp==='cart').length).toBeGreaterThanOrEqual(3);
 expect(parts.filter(b=>b.kind==='tree').length).toBeGreaterThanOrEqual(6);
 for(const p of [...Object.values(trenchMap.spawn),...trenchMap.terrain!.firingPositions!,...trenchMap.sectors])expect(blocked(p.x,p.z,.6,trenchMap)).toBe(false);
 const c=new TestCollision({...trenchMap,boxes:parts,vegetation:[]});
 for(const z of [-54,-32,-18,0,18,32,54])expect(c.ray({x:-17,y:4,z},{x:17,y:4,z})).toBe(1);
 for(const b of parts.filter(b=>Math.abs(b.x)<18))expect(b.h).toBeLessThan(1.2);
 for(const b of parts.filter(b=>b.farmProp==='cart'||b.farmProp==='crate')){
  const details=farmPropParts(b,b.h);expect(details.length).toBeGreaterThan(5);
  expect(details.every(p=>[...p.at,...p.size].every(Number.isFinite))).toBe(true);
 }
});
const scene=(b:Box)=>new Game(new TestCollision(),false,600,12345,undefined,{map:{...industrialMap,boxes:[{...b,x:0,z:0,baseY:0,footingY:0}],sectors:[]},ambientArtillery:false});
const noCrater={craterRadius:0,craterDepth:0,terrainReach:0,damage:0};
test("grenades clear cart/crate/fence colliders without turning slender timber into blocking stone rubble",()=>{
 for(const style of ['crate','cart','fence'] as const){
  const b=parts.find(p=>p.farmProp===style)!,g=scene(b),y=Math.min(.6,b.h*.6);
  const ray=()=>g.collision.ray({x:-3,y,z:0},{x:3,y,z:0});expect(ray()).toBeLessThan(1);
  g.explode({x:b.w/2+.15,y:b.h*.5,z:0},-1,null,{...grenadeExplosionProfile,...noCrater});
  expect(g.map.destruction!.objects[b.id!].stage).toBe(2);expect(ray()).toBe(1);
  expect(g.map.boxes.some(p=>p.kind==='rubble')).toBe(false);
 }
});
test("artillery replaces farm walls and orchard trunks with low terrain-supported cover",()=>{
 for(const kind of ['masonry','tree'] as const){
  const b=parts.find(p=>p.kind===kind)!,g=scene(b);
  g.explode({x:b.w/2+.15,y:b.h*.5,z:0},-1,null,{...artilleryExplosionProfile,...noCrater});
  expect(g.map.destruction!.objects[b.id!].stage).toBe(2);
  expect(g.map.boxes.some(p=>p.id===b.id)).toBe(false);
  const remnants=g.map.boxes.filter(p=>p.kind==='rubble'||p.kind==='log'||p.kind==='stump');
  expect(remnants.length).toBeGreaterThan(0);expect(remnants.every(p=>p.h<1.2)).toBe(true);
  expect(remnants.filter(p=>p.kind==='rubble').every(p=>p.h<1)).toBe(true);
 }
});
test("supply tracks and sheltered water pockets are authored, shallow and separate from the main crossing",()=>{
 expect(trenchMap.farmland!.tracks).toHaveLength(2);
 for(const track of trenchMap.farmland!.tracks){const p=track.points[1];expect(groundField(trenchMap,p.x,p.z).wear).toBeGreaterThanOrEqual(.69);}
 expect(trenchMap.farmland!.pools.length).toBeGreaterThan(0);
 const puddles=groundPuddles(trenchMap);
 for(const pool of trenchMap.farmland!.pools){
  expect(groundHeight(pool.x,pool.z,trenchMap)).toBeLessThan(.1);
  expect(puddles.some(p=>Math.hypot(p.x-pool.x,p.z-pool.z)<1)).toBe(true);
 }
});

test("excavation removes shielded farm props and collision when their footing disappears",()=>{
 for(const style of ['crate','cart','fence'] as const){
  const b=parts.find(p=>p.farmProp===style)!,g=scene(b);
  // Isolate footing failure from pressure occlusion and direct structural damage.
  const ray=g.collision.ray.bind(g.collision);g.collision.ray=()=>1;
  g.explode({x:0,y:.02,z:0},-1,null,{...grenadeExplosionProfile,damage:0,structuralDamage:0});
  g.collision.ray=ray;
  expect(groundHeight(0,0,g.map)).toBeLessThan(-.3);
  expect(g.map.destruction!.objects[b.id!].stage).toBe(2);
  expect(g.map.boxes.some(p=>p.id===b.id)).toBe(false);
 }
});

test("retains most previously open firing-step sightlines across the front",()=>{
 const base=new TestCollision({...trenchMap,boxes:trenchMap.boxes.filter(b=>!b.id?.startsWith('farm-'))});
 const full=new TestCollision(trenchMap),posts=trenchMap.terrain!.firingPositions!;
 let open=0,retained=0;
 for(const p of posts.filter(p=>p.team==='blue')){
  const q=posts.filter(q=>q.team==='red').sort((a,b)=>Math.abs(a.z-p.z)-Math.abs(b.z-p.z))[0];
  const a={x:p.x,z:p.z,y:groundHeight(p.x,p.z,trenchMap)+1.65},b={x:q.x,z:q.z,y:groundHeight(q.x,q.z,trenchMap)+1.65};
  if(base.ray(a,b)===1){open++;if(full.ray(a,b)===1)retained++;}
 }
 expect(open).toBeGreaterThan(10);expect(retained/open).toBeGreaterThanOrEqual(.7);
});
