import {test,expect,vi} from "vitest";
import {Renderer} from "./rendering";
import type {DestructionChange} from "./destruction";
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
