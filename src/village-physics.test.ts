import { expect, it } from "vitest";
import { Entity, Vec3, Quat, BODYGROUP_STATIC, BODYMASK_ALL } from "playcanvas";
import { villageMap } from "./village-map";
import { createPhysicsWorld } from "./physics";
import { Game, TestCollision } from "./simulation";
import { pitchedBoxRay } from "./box-geometry";
import { RagdollPhysics } from "./ragdoll";
import { industrialMap, type MapDefinition } from "./map";
import { artilleryExplosionProfile } from "./destruction";

it("matches pitched roof panel rays against native Ammo geometry",()=>{
  const box=villageMap.boxes.find(b=>b.architecture?.part==="roof" && b.architecture.roofPitch)!;
  const world=createPhysicsWorld(),entity=new Entity("roof");
  const shape=world.createShape({type:"box",halfExtents:new Vec3(box.w/2,box.h/2,box.d/2)});
  const body=world.createBody({type:"static",mass:0,shape,entity,
    position:new Vec3(box.x,box.baseY!+box.h/2,box.z),rotation:new Quat().setFromEulerAngles(0,0,box.architecture!.roofPitch!*180/Math.PI)});
  world.addBody(body,BODYGROUP_STATIC,BODYMASK_ALL);
  try {
    for(const dx of [-.8,0,.8])for(const dz of [-.6,0,.6]) {
      const from={x:box.x+dx,y:14,z:box.z+dz},to={...from,y:2};
      const native=world.raycastFirst(new Vec3(from.x,from.y,from.z),new Vec3(to.x,to.y,to.z));
      expect(native?.hitFraction).toBeCloseTo(pitchedBoxRay(from,to,box),4);
    }
  } finally {world.removeBody(body);world.destroyBody(body);world.destroyShape(shape);world.destroy();entity.destroy();}
});

it("rests a physical corpse on an upper floor and wakes it after floor destruction",()=>{
  const map:MapDefinition={...industrialMap,width:16,depth:16,sectors:[],boxes:[
    {id:"ground",x:0,z:0,w:16,d:16,h:.2,baseY:-.2,kind:"building"},
    {id:"floor",x:0,z:0,w:5,d:5,h:.2,baseY:3,kind:"wood",walkable:true,architecture:{building:"test",part:"floor",level:1}},
  ],buildings:[{id:"test",name:"Test house",x:0,z:0,w:5,d:5,stories:2,baseY:0,posts:[]}]};
  const g=new Game(new TestCollision(map),false,10000,1,undefined,{map,ambientArtillery:false});
  const world=createPhysicsWorld(),owner=new RagdollPhysics(world,g.map);
  const doll=owner.create([{name:"torso",mass:2,shape:"sphere",size:new Vec3(.15,.15,.15),position:new Vec3(0,4,0),rotation:new Quat()}],new Vec3());
  try {
    for(let i=0;i<600&&!doll.frozen;i++)owner.step(1/60);
    expect(doll.frozen).toBe(true);expect(doll.positions[0].y).toBeCloseTo(3.35,1);
    g.explode({x:0,y:3.25,z:0},-1,null,{...artilleryExplosionProfile,damage:0,structuralDamage:2000,structuralRadius:2,craterRadius:0,craterDepth:0,terrainReach:0});
    expect(g.map.boxes.some(b=>b.id==="floor")).toBe(false);
    for(let i=0;i<180;i++)owner.step(1/60);
    doll.read();expect(doll.positions[0].y).toBeLessThan(.4);
  } finally {owner.destroy();world.destroy();}
});
