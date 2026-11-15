import {expect,it,vi} from "vitest";
import * as pc from "playcanvas";
import {coastalGeometry,coastalGrass,coastalRules,coastalWaterNormals} from "./coastal-scenery";
import {headlandMap} from "./headland-map";
import {coastDistance,groundHeight,industrialMap} from "./map";
import {Renderer} from "./rendering";
import {runtimeMap} from "./destruction";

it("builds deterministic finite low sea cliffs and feathered wash outside the playable edge",()=>{
  const before=JSON.stringify(headlandMap.boxes),geometry=coastalGeometry(headlandMap);
  expect(geometry).toEqual(coastalGeometry(headlandMap));
  for(const mesh of Object.values(geometry)) {
    expect(mesh.indices.length).toBeGreaterThan(100);
    expect(mesh.indices.length/3).toBeLessThan(4000);
    expect(mesh.positions.every(Number.isFinite)).toBe(true);
    expect(mesh.colors.every(n=>Number.isFinite(n)&&n>=0&&n<=1)).toBe(true);
    expect(mesh.normals).toHaveLength(mesh.positions.length);
    expect(mesh.uvs).toHaveLength(mesh.positions.length/3*2);
    expect(mesh.colors).toHaveLength(mesh.positions.length/3*4);
    expect(mesh.indices.every(i=>Number.isInteger(i)&&i>=0&&i<mesh.positions.length/3)).toBe(true);
    for(let i=0;i<mesh.positions.length;i+=3) {
      expect(Math.hypot(...mesh.normals.slice(i,i+3))).toBeCloseTo(1,5);
      expect(coastDistance(mesh.positions[i],mesh.positions[i+2],headlandMap)).toBeLessThan(1.4);
    }
    expect(pc.calculateTangents(mesh.positions,mesh.normals,mesh.uvs,mesh.indices).every(Number.isFinite)).toBe(true);
  }
  expect(new Set(geometry.foam.colors.filter((_,i)=>i%4===3))).toEqual(new Set([.75,0]));
  expect(geometry.foam.positions.filter((_,i)=>i%3===1).every(y=>y===coastalRules.seaLevel+.018)).toBe(true);
  expect(JSON.stringify(headlandMap.boxes)).toBe(before);
  expect(coastalGeometry(industrialMap).rock.indices).toEqual([]);
});

it("keeps coastal grass low, bounded, on land and away from entrances, roads and flags",()=>{
  const map=runtimeMap(headlandMap),before=JSON.stringify(map.destruction),props=coastalGrass(map);
  expect(props.length).toBeGreaterThan(80);expect(props.length).toBeLessThanOrEqual(coastalRules.maxGrass);
  expect(props).toEqual(coastalGrass(map));
  for(const p of props) {
    expect(coastDistance(p.x,p.z,map)).toBeGreaterThanOrEqual(1.8);
    expect(p.y).toBeCloseTo(groundHeight(p.x,p.z,map)+.008);
    expect(p.scale[1]).toBeLessThanOrEqual(coastalRules.grassHeight);
    expect(map.buildings!.every(b=>Math.abs(p.x-b.x)>=b.w/2+1||Math.abs(p.z-b.z)>=b.d/2+1)).toBe(true);
    expect(map.sectors.every(s=>Math.hypot(p.x-s.x,p.z-s.z)>=6)).toBe(true);
  }
  expect(JSON.stringify(map.destruction)).toBe(before);
  expect(coastalGrass(industrialMap)).toEqual([]);
  const normal=coastalWaterNormals(64);
  expect(normal).toEqual(coastalWaterNormals(64));expect(normal).toHaveLength(64*64*4);
  expect(new Set(normal).size).toBeGreaterThan(25);
  expect([...normal].filter((_,i)=>i%4===3).every(n=>n===255)).toBe(true);
});

it("uses two merged coast meshes and shared grass buffers without adding colliders or per-clump updates",()=>{
  const device=new pc.NullGraphicsDevice(),root=new pc.Entity("coast test"),made:pc.Entity[]=[],solids:boolean[]=[];
  const r=Object.create(Renderer.prototype) as any;
  Object.assign(r,{app:{root,graphicsDevice:device},map:runtimeMap(headlandMap),mapRoot:root,materials:new Map(),textures:new Map(),kitMeshes:new Map(),groundDecor:[],boardBatch:3,batchGroup:7,fallingTrees:[],fragments:[]});
  r.cube=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,_tint:string,solid=false,parent=root)=>{
    const e=new pc.Entity(name);parent.addChild(e);e.setLocalPosition(x,y,z);e.setLocalScale(w,h,d);
    Object.assign(e,{render:{meshInstances:[],enabled:true}});made.push(e);solids.push(solid);return e;
  };
  r.buildCoast();
  expect(solids.every(s=>!s)).toBe(true);expect(r.batchGroup).toBe(7);
  expect(r.kitMeshes.size).toBe(6); // rock, wash and four shared grass variants
  expect(made.filter(e=>e.name==="coastal rock")).toHaveLength(1);
  expect(made.filter(e=>e.name==="coastal foam")).toHaveLength(1);
  expect(r.groundDecor).toHaveLength(coastalGrass(r.map).length);
  expect(r.groundDecor.every((p:any)=>p.batched&&p.radius===.6)).toBe(true);
  expect(r.textures.get("coastal ripples").width).toBe(256);
  const water=r.materials.get("coastal water"),foam=r.materials.get("coastal foam");
  const waterUpdate=vi.spyOn(water,"update"),foamUpdate=vi.spyOn(foam,"update");
  for(let i=0;i<60;i++)r.drawEnvironmentEffects(1/60);
  expect(waterUpdate.mock.calls.length).toBeGreaterThan(0);expect(waterUpdate.mock.calls.length).toBeLessThanOrEqual(10);
  expect(foamUpdate.mock.calls.length).toBe(waterUpdate.mock.calls.length);
  expect(water.normalMapOffset.x).toBeGreaterThan(0);expect(foam.opacity).toBeLessThanOrEqual(.3);
  for(const e of made)for(const m of e.render!.meshInstances)m.destroy();
  for(const m of r.kitMeshes.values())m.destroy();for(const m of r.materials.values())m.destroy();
  for(const t of r.textures.values())t.destroy();root.destroy();device.destroy();
});
