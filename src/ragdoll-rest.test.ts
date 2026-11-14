import {expect, test, vi} from "vitest";
import {Entity, Quat, Vec3} from "playcanvas";
import {RagdollPhysics, type RagdollPart} from "./ragdoll";
import {TerrainPhysics} from "./physics";
import {terrainGeometry} from "./terrain-geometry";
import {Game, TestCollision} from "./simulation";
import {industrialMap} from "./map";
import {grenadeExplosionProfile} from "./destruction";

function fixture(shelf = false) {
  const map = {...industrialMap,width:16,depth:16,boxes:shelf ? [{kind:"wood" as const,x:0,z:0,w:4,d:4,h:.5}] : []};
  const g = new Game(new TestCollision(map),false,10000,12345,undefined,{map,ambientArtillery:false});
  const terrain = new TerrainPhysics(), root = new Entity();
  const rebuild = () => { for (const key of ["-1,-1","-1,0","0,-1","0,0"]) terrain.setPatch(key,terrainGeometry(g.map,key),root); };
  rebuild();
  const owner = new RagdollPhysics(terrain.world,g.map);
  const parts:RagdollPart[]=[
    {name:"torso",mass:5,shape:"sphere",size:new Vec3(.13,.13,.13),position:new Vec3(0,1,0),rotation:new Quat()},
    {name:"head",mass:1,shape:"sphere",size:new Vec3(.1,.1,.1),position:new Vec3(0,1.25,0),rotation:new Quat(),parent:"torso",anchor:new Vec3(0,1.13,0),axis:Vec3.RIGHT,swing:30,twist:20},
  ];
  const doll = owner.create(parts,new Vec3());
  const settle = () => { for(let i=0;i<600 && !doll.frozen;i++)owner.step(1/60); expect(doll.frozen).toBe(true); };
  const destroy = () => { owner.destroy();terrain.destroy();root.destroy(); };
  return {g,terrain,owner,doll,rebuild,settle,destroy};
}

test("settled physical bodies leave the solver, retain their pose, and reactivate only for nearby blasts",()=>{
  const f=fixture();f.settle();
  expect(f.doll.joints).toHaveLength(0);
  expect(f.doll.bodies).toHaveLength(2);
  const pose=f.doll.positions.map(p=>p.clone()),version=f.doll.poseVersion;
  const step=vi.spyOn(f.terrain.world,"step");
  for(let i=0;i<20;i++){f.owner.step(1/60);f.doll.read();}
  expect(step).not.toHaveBeenCalled();expect(f.doll.poseVersion).toBe(version);
  expect(f.doll.positions).toEqual(pose);
  f.doll.blast(new Vec3(40,0,0),2,5);expect(f.doll.frozen).toBe(true);
  f.doll.blast(new Vec3(0,0,0),2,5);expect(f.doll.frozen).toBe(false);
  expect(f.doll.joints).toHaveLength(1);
  for(let i=0;i<10;i++)f.owner.step(1/60);
  f.doll.read();expect(f.doll.positions).not.toEqual(pose);
  f.settle();
  const destroyBody=vi.spyOn(f.terrain.world,"destroyBody");
  f.owner.destroy();expect(destroyBody).toHaveBeenCalledTimes(2);
  expect(f.owner.ragdolls.size).toBe(0);
  f.destroy();
});

test("excavation wakes a frozen corpse and it falls onto current terrain",()=>{
  const f=fixture();f.settle();const height=f.doll.positions[0].y;
  f.g.explode({x:0,y:.025,z:0},-1,null,{...grenadeExplosionProfile,damage:0});f.rebuild();
  f.owner.step(1/60);expect(f.doll.frozen).toBe(false);
  for(let i=0;i<120;i++)f.owner.step(1/60);
  f.doll.read();expect(f.doll.positions[0].y).toBeLessThan(height-.1);
  f.destroy();
});

test("removing supporting cover wakes a corpse even when terrain height is unchanged",()=>{
  const f=fixture(true);f.settle();const height=f.doll.positions[0].y;
  expect(height).toBeGreaterThan(.5);
  f.g.map.boxes=[];f.g.map.destruction!.revision++;
  f.owner.step(1/60);expect(f.doll.frozen).toBe(false);
  for(let i=0;i<120;i++)f.owner.step(1/60);
  f.doll.read();expect(f.doll.positions[0].y).toBeLessThan(height-.3);
  f.destroy();
});
