import { expect, it } from "vitest";
import * as pc from "playcanvas";
import { forestGeometry, type ForestShape } from "./forest-geometry";
import { forestFloorProps } from "./forest-floor";
import { verdunMap } from "./verdun-map";
import { industrialMap, groundHeight } from "./map";
import { runtimeMap } from "./destruction";
import { Renderer } from "./rendering";

it("builds bounded finite forest meshes with tapered trunks, irregular crowns, valid UVs and lighting",()=>{
 for(const shape of ["trunk","limbs","deadLimbs","pine","crown","fern","grass","branch","root","litter"] as ForestShape[])
  for(let variant=0;variant<4;variant++) {
   const m=forestGeometry(shape,variant);
   expect(m).toEqual(forestGeometry(shape,variant));
   expect(m.indices.length).toBeGreaterThan(60);
   expect(m.indices.length/3).toBeLessThan(1400);
   expect(m.positions.every(Number.isFinite)).toBe(true);
   expect(m.indices.every(i=>Number.isInteger(i)&&i>=0&&i<m.positions.length/3)).toBe(true);
   expect(m.normals.length).toBe(m.positions.length);
   expect(m.uvs.length).toBe(m.positions.length/3*2);
   for(let i=0;i<m.normals.length;i+=3)expect(Math.hypot(...m.normals.slice(i,i+3))).toBeCloseTo(1,5);
   expect(pc.calculateTangents(m.positions,m.normals,m.uvs,m.indices).every(Number.isFinite)).toBe(true);
  }
 const trunk=forestGeometry("trunk"),radius=(min:number,max:number)=>Math.max(...trunk.positions.flatMap((_,i)=>i%3===0&&trunk.positions[i+1]>=min&&trunk.positions[i+1]<=max?[Math.hypot(trunk.positions[i],trunk.positions[i+2])]:[]));
 expect(radius(.9,1.1)).toBeLessThan(radius(0,.1)*.35);
 expect(forestGeometry("pine",0).positions).not.toEqual(forestGeometry("pine",1).positions);
});

it("shares actual GPU-facing forest buffers and bark materials while stripping the crown at damage stage one",()=>{
 const device=new pc.NullGraphicsDevice(),root=new pc.Entity("forest test"),made:pc.Entity[]=[];
 const r=Object.create(Renderer.prototype);
 Object.assign(r,{app:{root,graphicsDevice:device},map:runtimeMap(verdunMap),mapRoot:root,materials:new Map(),textures:new Map(),kitMeshes:new Map(),objectVisuals:new Map(),objectStates:new Map(),coverBatch:4,batchGroup:4});
 r.cube=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,_tint:string,_solid:boolean,parent:pc.Entity)=>{
  const e=new pc.Entity(name);parent.addChild(e);e.setLocalPosition(x,y,z);e.setLocalScale(w,h,d);Object.assign(e,{render:{meshInstances:[],enabled:true}});made.push(e);return e;
 };
 const a=r.forestPart("a","trunk",1,0,0,0,.8,8,.8,"#665746",root),b=r.forestPart("b","trunk",5,2,0,0,.6,6,.6,"#665746",root);
 expect(a.render.meshInstances[0].mesh).toBe(b.render.meshInstances[0].mesh);
 expect(a.render.meshInstances[0].material).toBe(b.render.meshInstances[0].material);
 expect(a.render.meshInstances[0].material.normalMap).toBeDefined();
 const object=Object.values(r.map.destruction.objects).find((o:any)=>o.original.treeStyle==="pine") as any;
 r.buildDestructible(object);
 expect(r.objectVisuals.get(object.id).findByName("ragged woodland crown")).toBeTruthy();
 object.stage=1;r.buildDestructible(object);
 expect(r.objectVisuals.get(object.id).findByName("ragged woodland crown")).toBeNull();
 expect(r.objectVisuals.get(object.id).findByName("tapered bark trunk")).toBeTruthy();
 for(const e of made)for(const m of e.render!.meshInstances)m.destroy();
 for(const mesh of r.kitMeshes.values())mesh.destroy();
 for(const material of r.materials.values())material.destroy();
 for(const texture of r.textures.values())texture.destroy();root.destroy();device.destroy();
});

it("spreads bounded knee-low floor dressing over the woods without changing cover or placing it on trench slopes",()=>{
 const map=runtimeMap(verdunMap),before=JSON.stringify(map.destruction),boxes=map.boxes.length;
 const props=forestFloorProps(map);
 expect(props.length).toBeGreaterThan(100);expect(props.length).toBeLessThanOrEqual(180);
 expect(new Set(props.map(p=>p.shape)).size).toBe(4);
 expect(props.some(p=>Math.abs(p.x)<24&&Math.abs(p.z)<22)).toBe(true);
 for(const p of props){expect(p.y).toBeCloseTo(groundHeight(p.x,p.z,map)+.008);expect(p.scale.every(Number.isFinite)).toBe(true);if(p.shape==="fern")expect(p.scale[1]).toBeLessThan(.5);}
 expect(forestFloorProps(map)).toEqual(props);
 expect(JSON.stringify(map.destruction)).toBe(before);expect(map.boxes).toHaveLength(boxes);
 expect(forestFloorProps(industrialMap)).toEqual([]);
});
