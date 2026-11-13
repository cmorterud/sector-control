import {test,expect,vi} from "vitest";
import {Renderer} from "./rendering";
import type {DestructionChange} from "./destruction";
import {SceneryBatches} from "./scenery-batches";
import * as pc from "playcanvas";
// Several impacts may be processed in one render interval. Mesh/collider work
// must finish synchronously, while each scenery batch is regenerated once.
test("updates every impacted patch immediately and coalesces scenery batches before rendering",()=>{
 const rebuilt:string[]=[],build=vi.fn(()=>true),generate=vi.fn();
 const r=Object.create(Renderer.prototype);
 Object.assign(r,{app:{batcher:{generate}},map:{destruction:{objects:{wood:{id:'wood',original:{kind:'wood'}}}}},fallingTrees:[],boardVisuals:[],groundDecor:[],coverBatch:4,boardBatch:5,rebuildTerrainPatch:(key:string)=>rebuilt.push(key),buildDestructible:build});
 const impact=(key:string)=>({at:{x:0,y:0,z:0},objects:[{id:'wood',stage:1}],patches:[key],crater:null}) as unknown as DestructionChange;
 r.updateWorld(impact('0,0'));r.updateWorld(impact('0,1'));expect(rebuilt).toEqual(['0,0','0,1']);expect(generate).not.toHaveBeenCalled();
 r.flushWorldBatches();expect(generate.mock.calls).toEqual([[[4]]]);r.flushWorldBatches();expect(generate).toHaveBeenCalledTimes(1);
});
test("real static batch meshes remove local destroyed pieces while retaining distant mesh buffers",()=>{
 const device=new pc.NullGraphicsDevice(),root=new pc.Entity('world'),scene=new pc.Scene(device);
 scene.layers=new pc.LayerComposition();scene.layers.pushOpaque(new pc.Layer({id:pc.LAYERID_WORLD}));
 const batcher=new pc.BatchManager(device,root,scene),groups=new SceneryBatches(batcher);
 const batches=(id:number)=>(batcher as any).getBatches(id) as {origMeshInstances:pc.MeshInstance[];meshInstance:pc.MeshInstance}[];
 const mesh=pc.Mesh.fromGeometry(device,new pc.BoxGeometry()),material=new pc.StandardMaterial();
 mesh.incRefCount();
 const pieces=[1,2,65,66].map(x=>{
  const node=new pc.Entity('cover');root.addChild(node);node.setPosition(x,0,1);
  const instance=new pc.MeshInstance(mesh,material,node),id=groups.group(4,x,1);
  Object.assign(node,{render:{batchGroupId:id,meshInstances:[instance],removeFromLayers:()=>{}}});
  batcher.insert('render',id,node);
  return {node,instance,id};
 });
 batcher.generate(groups.ids());
 const far=batches(pieces[2].id)[0],farMesh=far.meshInstance.mesh!;
 expect(far.origMeshInstances).toHaveLength(2);
 batcher.remove('render',pieces[0].id,pieces[0].node);
 batcher.generate([pieces[0].id]);
 expect(batches(pieces[0].id)[0].origMeshInstances).toEqual([pieces[1].instance]);
 expect(batches(pieces[2].id)[0]).toBe(far);
 expect(far.meshInstance!.mesh).toBe(farMesh);
 expect(farMesh.vertexBuffer.numVertices).toBe(mesh.vertexBuffer.numVertices*2);
 groups.clear();expect(batches(pieces[2].id)).toEqual([]);
 for(const p of pieces)p.instance.destroy();
 mesh.destroy();material.destroy();root.destroy();batcher.destroy();scene.destroy();device.destroy();
});
test("rebatches only changed scenery regions, including removal and blasts spanning a region boundary",()=>{
 let next=20;
 const addGroup=vi.fn(()=>({id:next++})),removeGroup=vi.fn(),generate=vi.fn();
 const groups=new SceneryBatches({addGroup,removeGroup} as any);
 const near=groups.group(4,31,0),neighbor=groups.group(4,33,0),distant=groups.group(4,-60,60);
 const decorGroup=groups.group(5,31,0);
 expect(groups.group(4,30,1)).toBe(near);
 expect(new Set([near,neighbor,distant,decorGroup]).size).toBe(4);
 const rebuilt:string[]=[],close={enabled:true},far={enabled:true};
 const r=Object.assign(Object.create(Renderer.prototype),{app:{batcher:{generate}},sceneryBatches:groups,map:{destruction:{objects:{
  a:{original:{kind:'wood',x:31,z:0}},b:{original:{kind:'wood',x:33,z:0}},c:{original:{kind:'wood',x:-60,z:60}},
 }}},fallingTrees:[],boardVisuals:[],groundDecor:[{root:close,x:31,z:0,radius:.8,batched:true},{root:far,x:-60,z:60,radius:.8,batched:true}],coverBatch:4,boardBatch:5,
 rebuildTerrainPatch:(key:string)=>rebuilt.push(key),buildDestructible:vi.fn(()=>true)});
 const change={at:{x:31,y:0,z:0},terrain:[],objects:[{id:'a',stage:1},{id:'b',stage:2}],patches:['3,0','4,0'],crater:{radius:2}} as unknown as DestructionChange;
 r.updateWorld(change);r.updateWorld({...change,objects:[{id:'a',stage:2}],patches:['3,0']});
 expect(rebuilt).toEqual(['3,0','4,0','3,0']);
 expect(close.enabled).toBe(false);expect(far.enabled).toBe(true);
 expect(generate).not.toHaveBeenCalled();r.flushWorldBatches();
 expect(generate.mock.calls).toEqual([[[near,neighbor,decorGroup]]]);
 expect(generate.mock.calls[0][0]).not.toContain(distant);
 r.flushWorldBatches();expect(generate).toHaveBeenCalledTimes(1);
 const ids=groups.ids();groups.clear();expect(removeGroup.mock.calls.map(([id])=>id)).toEqual(ids);expect(groups.ids()).toEqual([]);
 expect(groups.group(4,31,0)).not.toBe(near);
});
test("removes blasted forest floor details and rebuilds their static batch once",()=>{
 const generate=vi.fn(),near={enabled:true},far={enabled:true};
 const r=Object.create(Renderer.prototype);
 Object.assign(r,{app:{batcher:{generate}},map:{destruction:{objects:{}}},fallingTrees:[],boardVisuals:[],groundDecor:[{root:near,x:0,z:0,radius:.8,batched:true},{root:far,x:20,z:20,radius:.8,batched:true}],coverBatch:4,boardBatch:5});
 r.updateWorld({at:{x:0,y:0,z:0},objects:[],patches:[],crater:{radius:2}} as unknown as DestructionChange);
 expect(near.enabled).toBe(false);expect(far.enabled).toBe(true);expect(generate).not.toHaveBeenCalled();
 r.flushWorldBatches();expect(generate.mock.calls).toEqual([[[5]]]);
});
