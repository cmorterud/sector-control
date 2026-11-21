import { expect, it } from "vitest";
import * as pc from "playcanvas";
import { architectureGeometry, architectureKey, architecturePieces, floorboardLift } from "./architecture-geometry";
import { architecturalTextures, architecturePixels } from "./architecture-surfaces";
import { villageMap } from "./village-map";
import { Renderer } from "./rendering";
import { runtimeMap, artilleryExplosionProfile } from "./destruction";
import { Game, TestCollision, idle } from "./simulation";

it("builds finite lit geometry for each house, material and furnishing without changing collision", () => {
  const examples=new Map<string,(typeof villageMap.boxes)[number]>();
  for(const b of villageMap.boxes)if(b.architecture) {
    const a=b.architecture,key=[a.building,a.part,a.feature,a.opening,a.corner].join(":");
    if(!examples.has(key))examples.set(key,b);
  }
  const before=JSON.stringify(villageMap.boxes);
  for(const b of [...examples.values(),{id:"village-rubble-manor-1",x:0,z:0,w:1.25,h:.56,d:1.05,kind:"rubble" as const}])for(const stage of [0,1]) {
    const meshes=architectureGeometry(b,stage);
    expect(meshes.length).toBeLessThanOrEqual(5);
    for(const m of meshes) {
      expect(m.positions.every(Number.isFinite)).toBe(true);
      expect(m.colors.every(v=>Number.isFinite(v)&&v>=0&&v<=1)).toBe(true);
      expect(m.indices.every(i=>Number.isInteger(i)&&i>=0&&i<m.positions.length/3)).toBe(true);
      expect(m.indices.length/3).toBeLessThan(2500);
      expect(m.uvs).toHaveLength(m.positions.length/3*2);
      for(let i=0;i<m.normals.length;i+=3)expect(Math.hypot(...m.normals.slice(i,i+3))).toBeCloseTo(1,5);
      expect(pc.calculateTangents(m.positions,m.normals,m.uvs,m.indices).every(Number.isFinite)).toBe(true);
    }
  }
  expect(JSON.stringify(villageMap.boxes)).toBe(before);
});

it("draws upper floorboards above the tops of the walls below, so doorways do not flicker", () => {
  const boxes=villageMap.boxes.filter(b=>b.architecture);
  const top=(b:(typeof boxes)[number])=>(b.baseY??0)+b.h;
  const overlaps=(a:(typeof boxes)[number],b:(typeof boxes)[number])=>Math.abs(a.x-b.x)<(a.w+b.w)/2-.01&&Math.abs(a.z-b.z)<(a.d+b.d)/2-.01;
  const floors=boxes.filter(b=>b.architecture!.part==="floor"&&b.architecture!.level);
  const walls=boxes.filter(b=>b.architecture!.part==="wall");
  let shared=0;
  for(const floor of floors) {
    const boards=architecturePieces(floor,0).find(p=>p.name==="floor")!;
    const boardsTop=(floor.baseY??0)+floor.h/2+boards.at[1]+boards.size[1]/2;
    expect(boardsTop-top(floor)).toBeCloseTo(floorboardLift,6);
    for(const wall of walls)if(overlaps(floor,wall)&&Math.abs(top(wall)-top(floor))<.001) {
      shared++;
      expect(boardsTop-top(wall),floor.id+" over "+wall.id).toBeGreaterThan(.004);
    }
  }
  // Every upstairs doorway sits over the top of a wall below it.
  expect(shared).toBeGreaterThan(20);
});

it("gives every village building a finished ceiling and a recognizable room use", () => {
  const expected={manor:"bookcase",school:"bed",farm:"hearth",inn:"counter",hall:"counter",stable:"stall",bakery:"oven",smithy:"workbench",cottage:"table"};
  for(const [id,feature] of Object.entries(expected)) {
    const parts=villageMap.boxes.filter(b=>b.architecture?.building===id);
    expect(parts.some(b=>b.architecture!.feature===feature),id).toBe(true);
    expect(parts.some(b=>b.architecture!.sign),id).toBe(true);
    const ceilings=parts.filter(b=>b.architecture!.part==="ceiling");
    // Kit buildings hang one ceiling from each pair of 2.5 m roof bays.
    expect(ceilings.length,id).toBeGreaterThan(villageMap.buildings!.find(b=>b.id===id)!.kit?5:10);
    for(const ceiling of ceilings)expect(parts.some(b=>b.id===ceiling.supports?.[0]&&b.architecture!.part==="roof")).toBe(true);
  }
  expect(villageMap.boxes.length).toBeLessThan(3000);
  const floor=villageMap.boxes.find(b=>b.architecture?.part==="floor"&&b.kind==="wood")!;
  expect(architecturePieces(floor,0).some(p=>p.name==="exposed floor joist")).toBe(true);
  const window=villageMap.boxes.find(b=>b.architecture?.opening==="window")!;
  expect(architecturePieces(window,0).some(p=>p.name==="painted window jamb")).toBe(true);
  expect(architecturePieces(window,1).some(p=>p.name==="chipped plaster exposes brick")).toBe(true);
});

it("meets adjacent gable faces along a continuous pitched outline inside their collision envelopes",()=>{
  for(const building of villageMap.buildings!)for(const side of [-1,1]) {
    const panels=villageMap.boxes.filter(b=>b.architecture?.building===building.id&&b.architecture.gableSlope!==undefined&&b.z===building.z+side*building.d/2).sort((a,b)=>a.x-b.x);
    // Kit buildings use one gable strip per 2.5 m bay; the older generator two.
    expect(panels.length).toBeGreaterThanOrEqual(building.kit?4:9);
    const edges=panels.map(b=>{
      const m=architectureGeometry(b,0).find(m=>m.surface==="limewash")!;
      const top=(x:number)=>Math.max(...m.positions.filter((_,i)=>i%3===1&&Math.abs(m.positions[i-1]-x)<.0001));
      expect(Math.max(...m.positions.filter((_,i)=>i%3===1))).toBeLessThanOrEqual(b.h/2+.0001);
      return [top(-b.w/2)+b.h/2+b.baseY!,top(b.w/2)+b.h/2+b.baseY!];
    });
    for(let i=1;i<edges.length;i++)expect(edges[i][0],building.id).toBeCloseTo(edges[i-1][1],5);
    expect(edges[0][0]).toBeCloseTo(edges.at(-1)![1],5);
    expect(Math.max(...edges.flat())-edges[0][0]).toBeGreaterThan(1.5);
  }
});

it("keeps capture-building signs and lanterns visible below their porch canopies",()=>{
  for(const building of villageMap.buildings!.filter(b=>b.flag)) {
    const lintel=villageMap.boxes.find(b=>b.architecture?.building===building.id&&b.architecture.sign)!;
    const porch=villageMap.boxes.find(b=>b.architecture?.building===building.id&&b.architecture.part==="roof"&&b.id!.endsWith("-porch"))!;
    for(const name of ["painted entrance sign","entrance lantern frame"]) {
      const piece=architecturePieces(lintel,0).find(p=>p.name===name)!;
      expect(piece,building.id).toBeDefined();
      const top=lintel.baseY!+lintel.h/2+piece.at[1]+piece.size[1]/2;
      expect(top,building.id).toBeLessThan(porch.baseY!);
    }
  }
});

it("reads asymmetric sign glyphs correctly from either exterior axis and both faces",()=>{
  for(const alongX of [true,false])for(const side of [-1,1] as const)for(const doubleSided of [false,true]) {
    const b={x:0,z:0,w:alongX?2.5:.44,d:alongX?.44:2.5,h:1.15,kind:"masonry" as const,
      architecture:{building:"school",part:"wall" as const,level:0,sign:"F",signBothSides:doubleSided,exterior:side}};
    const ink=architecturePieces(b,0).filter(p=>p.name==="painted sign lettering"&&p.at[alongX?2:0]*side>0);
    // Project into a camera looking straight at the outward face, Y up.
    const points=ink.map(p=>({x:alongX?p.at[0]*side:-p.at[2]*side,y:p.at[1]}));
    const xs=[...new Set(points.map(p=>p.x))].sort((a,b)=>a-b),ys=[...new Set(points.map(p=>p.y))].sort((a,b)=>b-a);
    const rows=ys.map(y=>xs.map(x=>points.some(p=>p.x===x&&p.y===y)?"1":"0").join(""));
    expect(rows).toEqual(["111","100","110","100","100"]);
  }
});

it("uploads detailed meshes with shared materials, then removes every visible piece with its panel", () => {
  const device=new pc.NullGraphicsDevice(),root=new pc.Entity("architecture test"),made:pc.Entity[]=[];
  const r=Object.create(Renderer.prototype) as any;
  Object.assign(r,{app:{root,graphicsDevice:device},map:runtimeMap(villageMap),mapRoot:root,materials:new Map(),textures:new Map(),kitMeshes:new Map(),objectVisuals:new Map(),objectStates:new Map(),coverBatch:4,batchGroup:4});
  r.cube=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,_tint:string,_solid:boolean,parent:pc.Entity,rotation=0)=>{
    const e=new pc.Entity(name);parent.addChild(e);e.setLocalPosition(x,y,z);e.setLocalScale(w,h,d);e.setLocalEulerAngles(0,0,rotation);
    Object.assign(e,{render:{meshInstances:[],enabled:true}});made.push(e);return e;
  };
  const object=Object.values(r.map.destruction.objects).find((o:any)=>o.original.architecture?.part==="floor"&&o.original.kind==="wood") as any;
  const clone={...object,id:object.id+"4444",original:{...object.original,id:object.original.id+"4444",x:object.original.x+10}};
  expect(architectureKey(object.original,0)).toBe(architectureKey(clone.original,0));
  r.buildDestructible(object);r.buildDestructible(clone);
  const first=r.objectVisuals.get(object.id).findByName("architectural floorboards") as pc.Entity;
  const second=r.objectVisuals.get(clone.id).findByName("architectural floorboards") as pc.Entity;
  // Kit-building pieces bake their own room light (src/room-light.ts), so
  // identical shapes in different places get their own meshes.
  expect(first.render!.meshInstances[0].mesh).not.toBe(second.render!.meshInstances[0].mesh);
  expect(first.render!.meshInstances[0].material).toBe(second.render!.meshInstances[0].material);
  expect((first.render!.meshInstances[0].material as pc.StandardMaterial).normalMap).toBeDefined();
  expect(r.objectVisuals.get(object.id).children.length).toBeLessThanOrEqual(5);
  for(const select of [
    (a:any)=>a.part==="wall"&&a.opening==="window"&&a.level===1,
    (a:any)=>a.part==="roof"&&a.feature==="bell",
    (a:any)=>a.feature==="bed",(a:any)=>a.feature==="oven",
  ]) {
    const part=Object.values(r.map.destruction.objects).find((o:any)=>o.original.architecture&&select(o.original.architecture)) as any;
    r.buildDestructible({...part,stage:1});
  }
  expect(r.textures.get("stone-diffuse").width).toBe(256);
  expect(r.textures.get("slate-diffuse")?.srgb??r.textures.get("tiles-diffuse").srgb).toBe(true);
  object.stage=1;r.buildDestructible(object);object.stage=2;r.buildDestructible(object);
  expect(r.objectVisuals.has(object.id)).toBe(false);
  for(const e of made)for(const m of e.render!.meshInstances)m.destroy();
  for(const m of r.kitMeshes.values())m.destroy();
  for(const m of r.materials.values())m.destroy();
  for(const t of r.textures.values())t.destroy();root.destroy();device.destroy();
});

it("destroys a ceiling when its local roof supports are breached without collapsing the whole school", () => {
  const g=new Game(new TestCollision(villageMap),false,6000,1,undefined,{map:villageMap,ambientArtillery:false});
  const roof=g.map.boxes.find(b=>b.id==="kit-school-roof-0-0")!;
  const ceiling=g.map.boxes.find(b=>b.supports?.[0]===roof.id&&b.architecture?.part==="ceiling")!;
  for(const id of ceiling.supports!) {
    const support=g.map.destruction!.objects[id].original,angle=support.architecture!.roofPitch??0;
    g.explode({x:support.x,y:support.baseY!+support.h/2+support.h/(2*Math.cos(angle))+.05,z:support.z},-1,null,
      {...artilleryExplosionProfile,damage:0,structuralRadius:.4,structuralDamage:2000,craterRadius:0,craterDepth:0,terrainReach:0});
  }
  expect(g.map.destruction!.objects[roof.id!].stage).toBe(2);
  // Kit pieces fall a moment after losing their support.
  for(let i=0;i<60;i++)g.step(idle());
  expect(g.map.destruction!.objects[ceiling.id!].stage).toBe(2);
  expect(g.map.boxes.some(b=>b.architecture?.building==="school"&&b.architecture.part==="roof")).toBe(true);
});

it("authors shared masonry, roof and furnishing maps with real relief and restrained gloss", () => {
  for(const kind of architecturalTextures) {
    const maps=architecturePixels(kind,64);
    expect(maps.diffuse).toEqual(architecturePixels(kind,64).diffuse);
    expect(new Set(maps.diffuse).size).toBeGreaterThan(20);
    expect(new Set(maps.normal).size).toBeGreaterThan(8);
    expect(maps.gloss[0]).toBeLessThan(100);
    expect(maps.diffuse).toHaveLength(64*64*4);
  }
});
