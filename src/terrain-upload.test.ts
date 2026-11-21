import {expect, test} from "vitest";
import * as pc from "playcanvas";
import {Renderer} from "./rendering";
import {VisualWorkQueue} from "./visual-work";
import {Game, TestCollision} from "./simulation";
import {industrialMap, groundHeight} from "./map";
import {TerrainPhysics} from "./physics";
import {artilleryExplosionProfile} from "./destruction";
import {terrainGeometry} from "./terrain-geometry";

test("terrain colliders change immediately while coalesced uploads reuse the entity, mesh and buffers", () => {
  const g = new Game(new TestCollision(industrialMap),false,10000,12345,undefined,{map:industrialMap,ambientArtillery:false});
  const device = new pc.NullGraphicsDevice(), root = new pc.Entity(), physics = new TerrainPhysics();
  const r = Object.assign(Object.create(Renderer.prototype), {
    map:g.map, app:{graphicsDevice:device}, mapRoot:root,
    terrainPhysics:physics, terrainPatches:new Map(), visualWork:new VisualWorkQueue(),
    material:()=>new pc.StandardMaterial(),
    joint:(name:string, parent:pc.Entity)=>{
      const entity = new pc.Entity(name); parent.addChild(entity);
      entity.addComponent = ((_type:string, options:any)=> {
        Object.assign(entity,{render:options}); return options;
      }) as any;
      return entity;
    },
  });
  const key="0,0";
  r.rebuildTerrainPatch(key);
  const patch = r.terrainPatches.get(key), instance = patch.entity.render.meshInstances[0];
  for (let i=0;i<2;i++) {
    g.explode({x:3+i*.25,y:.02,z:3},-1,null,{...artilleryExplosionProfile,damage:0});
    for (const event of g.events) if(event.type === "destruction") r.terrainGeometryCache.invalidate(event.change);
    g.events=[];
    r.rebuildTerrainPatch(key,true);
    const hit = physics.ray({x:3,y:3,z:3},{x:3,y:-4,z:3});
    expect(3-hit*7).toBeCloseTo(groundHeight(3,3,g.map),3);
  }
  expect(r.visualWork.size).toBe(1);
  expect(patch.entity.render.meshInstances[0]).toBe(instance);
  const old:number[]=[];patch.mesh.getPositions(old);
  expect(old).not.toEqual(terrainGeometry(g.map,key).positions);
  r.visualWork.flush();
  const current:number[]=[];patch.mesh.getPositions(current);
  expect(current).toEqual(terrainGeometry(g.map,key).positions.map(Math.fround));
  const buffer=patch.mesh.vertexBuffer, index=patch.mesh.indexBuffer[0];
  r.rebuildTerrainPatch(key,true);r.visualWork.flush();
  expect(r.terrainPatches.get(key)).toBe(patch);
  expect(patch.mesh.vertexBuffer).toBe(buffer);
  expect(patch.mesh.indexBuffer[0]).toBe(index);
  instance.destroy();root.destroy();physics.destroy();device.destroy();
});

test("blast-reshaped terrain patches rebuild nearest the camera first, at least one per frame", () => {
  const g = new Game(new TestCollision(industrialMap),false,10000,12345,undefined,{map:industrialMap,ambientArtillery:false});
  const device = new pc.NullGraphicsDevice(), root = new pc.Entity(), physics = new TerrainPhysics();
  const camera = new pc.Entity();camera.setPosition(20,2,20);
  const r = Object.assign(Object.create(Renderer.prototype), {
    map:g.map, app:{graphicsDevice:device}, mapRoot:root, camera,
    terrainPhysics:physics, terrainPatches:new Map(), visualWork:new VisualWorkQueue(), terrainWork:new Set<string>(),
    fallingTrees:[], boardVisuals:[], groundDecor:[], objectVisuals:new Map(),
    material:()=>new pc.StandardMaterial(),
    joint:(name:string, parent:pc.Entity)=>{
      const entity = new pc.Entity(name); parent.addChild(entity);
      entity.addComponent = ((_type:string, options:any)=> {
        Object.assign(entity,{render:options}); return options;
      }) as any;
      return entity;
    },
  });
  const at = {x:8,z:8}, ground = () => 3 - physics.ray({x:at.x,y:3,z:at.z},{x:at.x,y:-4,z:at.z}) * 7;
  for (const key of ["0,0","0,1","1,0","1,1","2,2"]) r.rebuildTerrainPatch(key);
  const before = ground();
  g.explode({x:at.x,y:groundHeight(at.x,at.z,g.map)+.02,z:at.z},-1,null,{...artilleryExplosionProfile,damage:0});
  const change = g.events.find(e => e.type === "destruction")!.change;
  g.events = [];
  expect(change.patches.length).toBeGreaterThan(1);
  expect(groundHeight(at.x,at.z,g.map)).toBeLessThan(before - .1);
  r.applyWorldChange(change);
  // Nothing rebuilt yet: collision still has the old ground.
  expect(r.terrainWork.size).toBe(change.patches.length);
  expect(ground()).toBeCloseTo(before, 3);
  // With no time left, each frame still rebuilds exactly one patch, the
  // nearest to the camera first.
  const order: string[] = [], rebuild = r.rebuildTerrainPatch;
  r.rebuildTerrainPatch = function (key: string) { order.push(key); return rebuild.call(this, key); };
  let clock = 0;
  while (r.terrainWork.size) { expect(r.flushTerrainWork(0, () => clock++)).toBe(1); }
  const away = (key: string) => { const [x, z] = key.split(",").map(Number); return Math.hypot((x+.5)*8-20, (z+.5)*8-20); };
  expect(order).toEqual([...change.patches].sort((a, b) => away(a) - away(b)));
  expect(ground()).toBeCloseTo(groundHeight(at.x,at.z,g.map),3);
  // A generous budget clears several patches in one frame.
  r.applyWorldChange(change);
  expect(r.flushTerrainWork(1000)).toBe(change.patches.length);
  for (const patch of r.terrainPatches.values()) patch.entity.render?.meshInstances[0].destroy();
  root.destroy();physics.destroy();device.destroy();
});
