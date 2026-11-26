import {expect,test} from "vitest";
import {verdunMap} from "./verdun-map";
import {Game,TestCollision,idle,pathfind} from "./simulation";
import {groundHeight,blocked,walkSegment} from "./map";
import {flagContains,dominationRules} from "./domination";
import {artilleryExplosionProfile} from "./destruction";
import * as pc from "playcanvas";
import {Renderer} from "./rendering";
import {runtimeMap} from "./destruction";
import {farmPropParts} from "./farm-props";

test("Broken Relay has four walkable shallow dogleg approaches and no high firing platform",()=>{
 const g=new Game(new TestCollision(verdunMap),false,1000,41,undefined,{map:verdunMap,ambientArtillery:false});
 const flag=g.sectors.find(s=>s.id==="C")!;
 expect(flag.name).toBe("Thiaumont");expect(flag.home).toBeUndefined();
 const paths=g.map.terrain!.branchRoutes!;expect(paths).toHaveLength(4);
 for(const route of paths){
  for(const p of route.points){expect(groundHeight(p.x,p.z,g.map)).toBeCloseTo(1.5,1);expect(blocked(p.x,p.z,.6,g.map)).toBe(false);}
  for(let i=1;i<route.points.length;i++){
   expect(walkSegment(route.points[i-1],route.points[i],g.map),JSON.stringify(route)).toBe(true);
   expect(walkSegment(route.points[i],route.points[i-1],g.map)).toBe(true);
  }
  expect(pathfind(route.points.at(-1)!,flag,g.map).length).toBeGreaterThan(0);
 }
 for(const ramp of g.map.terrain!.ramps.filter(r=>r.low===1.5)){
  const a={x:ramp.x-ramp.w/2,z:ramp.z},b={x:ramp.x+ramp.w/2,z:ramp.z};
  expect(walkSegment(a,b,g.map)).toBe(true);expect(walkSegment(b,a,g.map)).toBe(true);
 }
 const pieces=g.map.boxes.filter(b=>b.landmark==="C");expect(pieces.length).toBeGreaterThanOrEqual(12);
 for(const b of pieces.filter(b=>b.id!=="relay-mast"))expect(b.h+(b.baseY??0)-groundHeight(b.x,b.z,g.map)).toBeLessThan(1.1);
 for(const x of [-2,0,2])for(const z of [-2,0,2])expect(blocked(x,z,.6,g.map)).toBe(false);
});

test.each(["blue","red"] as const)("%s can capture and score the middle flag from the clearing",team=>{
 const g=new Game(new TestCollision(verdunMap),false,1000,41,undefined,{map:verdunMap,ambientArtillery:false});
 const flag=g.sectors.find(s=>s.id==="C")!,p=g.players[0];
 Object.assign(p,{team,x:flag.x,z:flag.z,y:groundHeight(flag.x,flag.z,g.map),protectedUntil:0});
 expect(flagContains(g,p,flag)).toBe(true);
 for(let i=0;i<dominationRules.captureTicks+dominationRules.scoreInterval+2;i++)g.step(idle());
 expect(flag.owner).toBe(team);expect(g.scores[team]).toBeGreaterThan(0);
});

test("relay equipment is detailed and destructible; the collapsed roof loses its supports cleanly",()=>{
 const g=new Game(new TestCollision(verdunMap),false,1000,41,undefined,{map:verdunMap,ambientArtillery:false});
 for(const id of ["relay-mast","relay-radio"]){
  const b=g.map.destruction!.objects[id].original;
  const detail=farmPropParts(b,b.h);expect(detail.length).toBeGreaterThan(4);
  expect(detail.every(p=>[...p.at,...p.size].every(Number.isFinite))).toBe(true);
 }
 const at={x:0,z:-4.3,y:groundHeight(0,-4.3,g.map)+.4};
 for(let i=0;i<3;i++)g.explode(at,-1,null,{...artilleryExplosionProfile,damage:0,craterRadius:0,terrainReach:0});
 const mast=g.map.destruction!.objects["relay-mast"].original;
 // The roof can screen a blast from the pit; test an unobstructed mast hit too.
 for(let i=0;i<2;i++)g.explode({x:mast.x-.6,z:mast.z,y:mast.baseY!+.3},-1,null,{...artilleryExplosionProfile,damage:0,craterRadius:0,terrainReach:0});
 for(const id of ["relay-roof-west","relay-roof-east","relay-collapsed-roof","relay-mast"]){
  expect(g.map.destruction!.objects[id].stage,id).toBe(2);
  expect(g.map.boxes.some(b=>b.id===id)).toBe(false);
 }
 expect(blocked(0,0,.6,g.map)).toBe(false);
});

test("actual destructible presentation builds the mast, wires and telephone, then removes damaged pieces",()=>{
 const device=new pc.NullGraphicsDevice(),root=new pc.Entity("relay test"),made:pc.Entity[]=[];
 const r=Object.assign(Object.create(Renderer.prototype),{app:{root,graphicsDevice:device},map:runtimeMap(verdunMap),mapRoot:root,materials:new Map(),textures:new Map(),objectVisuals:new Map(),objectStates:new Map(),coverBatch:4,batchGroup:4});
 r.cube=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,_tint:string,_solid:boolean,parent:pc.Entity)=>{
  const e=new pc.Entity(name);parent.addChild(e);e.setLocalPosition(x,y,z);e.setLocalScale(w,h,d);
  Object.assign(e,{render:{enabled:true,type:"box",material:undefined}});made.push(e);return e;
 };
 for(const id of ["relay-mast","relay-radio"]){
  const object=r.map.destruction.objects[id];r.buildDestructible(object);
  const visual=r.objectVisuals.get(id);
  expect(visual.findByName(id==="relay-mast"?"splintered signal mast":"telephone handset")).toBeTruthy();
  if(id==="relay-mast"){
   expect(visual.findByName("severed telephone wire")).toBeTruthy();
   expect(visual.findByName("splintered signal mast").render.material.diffuseMap).toBeDefined();
   object.stage=1;r.buildDestructible(object);
   expect(r.objectVisuals.get(id).findByName("splintered signal mast").getLocalScale().y).toBeCloseTo(object.original.h*.6);
  }
  object.stage=2;r.buildDestructible(object);expect(r.objectVisuals.has(id)).toBe(false);
 }
 for(const texture of r.textures.values())texture.destroy();
 for(const material of r.materials.values())material.destroy();root.destroy();device.destroy();
});
