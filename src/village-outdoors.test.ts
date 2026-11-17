import {expect,it} from "vitest";
import * as pc from "playcanvas";
import {villageMap} from "./village-map";
import {villageYards,villageYardSurface,villageStreetClearance,villageGardenProps,yardPaths} from "./village-outdoors";
import {groundHeight,industrialMap,walkSegment} from "./map";
import {Game,TestCollision,idle,pathfind} from "./simulation";
import {artilleryExplosionProfile,grenadeExplosionProfile} from "./destruction";
import {farmPropParts} from "./farm-props";
import {footSurface} from "./battlefield";
import {groundField,groundSurfacePixels,villageRoad} from "./ground-surface";
import {Renderer} from "./rendering";

const props=villageMap.boxes.filter(b=>b.id?.startsWith("village-outdoor-"));
const scene=()=>new Game(new TestCollision(villageMap),false,6000,1,undefined,{map:villageMap,ambientArtillery:false});
it("gives nine buildings distinct outdoor rooms and low destructible cover while preserving roads and doorway approaches",()=>{
  expect(villageMap.buildings).toHaveLength(9);expect(villageMap.sectors).toHaveLength(5);
  // Ten yards, plus the two side yards beside the smaller kit manor.
  expect(villageYards).toHaveLength(12);expect(new Set(villageYards.map(y=>y.name)).size).toBe(12);
  // Includes the four side-yard props beside the smaller kit manor.
  expect(props.length).toBeGreaterThanOrEqual(40);expect(props.length).toBeLessThanOrEqual(70);
  expect(villageMap.boxes.length).toBeLessThan(3000);
  expect(new Set(props.map(b=>b.id)).size).toBe(props.length);
  for(const b of props) {
    expect(b.h).toBeLessThan(1);expect(["wood","masonry"]).toContain(b.kind);
    expect(villageStreetClearance(villageMap,b.x,b.z)).toBeGreaterThanOrEqual(Math.hypot(b.w,b.d)/2+.35);
    expect(villageMap.buildings!.every(a=>Math.abs(a.x-b.x)>=(a.w+b.w)/2+1.6||Math.abs(a.z-b.z)>=(a.d+b.d)/2+1.6)).toBe(true);
  }
  const trees=villageMap.vegetation!.filter(b=>b.id?.startsWith("tree-village-yard-"));
  expect(trees.length).toBeGreaterThanOrEqual(8);expect(trees.length).toBeLessThanOrEqual(12);
  expect(trees.every(b=>b.h<=4.2&&b.treeStyle==="sparse")).toBe(true);
  // Four sides of each of the eight older buildings, plus the kit manor's three real doors.
  expect(yardPaths(villageMap)).toHaveLength(35);
  for(const lane of yardPaths(villageMap)) {
    // This checks the newly added cover, independent of pre-existing garden walls.
    expect(walkSegment(lane.a,lane.b,{...villageMap,boxes:props,vegetation:[]})).toBe(true);
  }
});

it("bounds the geometry of timber, troughs and trestles and removes all visible detail with the parent collider",()=>{
  const device=new pc.NullGraphicsDevice(),root=new pc.Entity("yard test"),made:pc.Entity[]=[];
  const g=scene(),r=Object.create(Renderer.prototype) as any;
  Object.assign(r,{app:{root,graphicsDevice:device},map:g.map,mapRoot:root,materials:new Map(),textures:new Map(),kitMeshes:new Map(),objectVisuals:new Map(),objectStates:new Map(),coverBatch:4,batchGroup:4});
  r.cube=(name:string,x:number,y:number,z:number,w:number,h:number,d:number,_tint:string,solid:boolean,parent:pc.Entity)=>{
    const e=new pc.Entity(name);parent.addChild(e);e.setLocalPosition(x,y,z);e.setLocalScale(w,h,d);
    Object.assign(e,{render:{meshInstances:[],enabled:true},testSolid:solid});made.push(e);return e;
  };
  for(const style of ["timber","worktable","trough","barrels"] as const) {
    const b=props.find(b=>b.farmProp===style)!;expect(b,style).toBeDefined();
    const parts=farmPropParts(b,b.h);expect(parts.length).toBeGreaterThan(5);expect(parts.length).toBeLessThanOrEqual(20);
    for(const p of parts) {
      expect([...p.at,...p.size].every(Number.isFinite)).toBe(true);expect(p.size.every(n=>n>0)).toBe(true);
      const transform=new pc.Mat4().setTRS(new pc.Vec3(...p.at),new pc.Quat().setFromEulerAngles(...(p.rotation??[0,0,0])),new pc.Vec3(...p.size));
      const bounds=new pc.BoundingBox();bounds.setFromTransformedAabb(new pc.BoundingBox(new pc.Vec3(),new pc.Vec3(.5,.5,.5)),transform);
      expect(Math.abs(bounds.center.x)+bounds.halfExtents.x).toBeLessThanOrEqual(b.w/2+.02);
      expect(Math.abs(bounds.center.z)+bounds.halfExtents.z).toBeLessThanOrEqual(b.d/2+.02);
      expect(bounds.center.y+bounds.halfExtents.y).toBeLessThanOrEqual(b.h+.02);
    }
    const object=g.map.destruction!.objects[b.id!]!;r.buildDestructible(object);
    const group=r.objectVisuals.get(object.id);expect(group.children).toHaveLength(parts.length+1);
    expect(group.children.filter((e:any)=>e.testSolid)).toHaveLength(1);
    object.stage=2;r.buildDestructible(object);expect(r.objectVisuals.has(object.id)).toBe(false);expect(root.findByName(object.id)).toBeNull();
  }
  for(const e of made)for(const m of e.render!.meshInstances)m.destroy();
  for(const m of r.kitMeshes.values())m.destroy();for(const m of r.materials.values())m.destroy();
  for(const t of r.textures.values())t.destroy();root.destroy();device.destroy();
});

it("makes flank and manor crossing cover useful crouched while keeping standing fire lanes open",()=>{
  const stops=props.filter(b=>b.id!.includes("flank-supply")||b.id!.includes("manor-crossing"));expect(stops).toHaveLength(8);
  for(const b of stops) {
    const collision=new TestCollision({...villageMap,boxes:[b],vegetation:[]});
    const from={x:b.x-b.w/2-1,z:b.z,y:(b.baseY??0)+.6},to={...from,x:b.x+b.w/2+1};
    expect(collision.ray(from,to)).toBeLessThan(1);
    expect(collision.ray({...from,y:from.y+1.05},{...to,y:to.y+1.05})).toBe(1);
  }
});

it("breaches outdoor cover under a direct blast and removes its movement collision",()=>{
  for(const style of ["timber","worktable","trough","planter","bench","crate","cart","barrels"] as const) {
    const g=scene(),b=props.find(b=>b.farmProp===style)!;
    g.explode({x:b.x+b.w/2+.1,z:b.z,y:(b.baseY??0)+b.h*.5},-1,null,{...(style==="trough"?artilleryExplosionProfile:grenadeExplosionProfile),damage:0,craterRadius:0,terrainReach:0});
    expect(g.map.destruction!.objects[b.id!].stage,style).toBe(2);expect(g.map.boxes.some(p=>p.id===b.id)).toBe(false);
  }
});

it("bakes distinct yard surfaces, connects them to the real doors and exposes dirt after excavation",()=>{
  expect(villageYardSurface(industrialMap,0,0)).toEqual({paving:0,gravel:0,garden:0,path:0});
  expect(villageYardSurface(villageMap,4,-11).paving).toBe(1);
  expect(villageYardSurface(villageMap,6,-33).gravel).toBe(1);
  expect(villageYardSurface(villageMap,-8,10.5).garden).toBe(1);
  expect(groundField(villageMap,6,-33).grass).toBe(0);
  expect(groundField(villageMap,-8,10.5).garden).toBe(1);
  expect(villageRoad(villageMap,4,-11)).toBe(1);expect(footSurface({x:4,z:-11},villageMap)).toBe("concrete");
  const g=scene(),before=groundSurfacePixels(g.map,64),at={x:4,z:-11,y:groundHeight(4,-11,g.map)+.02};
  g.explode(at,-1,null,{...artilleryExplosionProfile,damage:0});
  expect(groundHeight(at.x,at.z,g.map)).toBeLessThan(at.y-.3);
  expect(footSurface(at,g.map)).toBe("mud");
  expect(groundSurfacePixels(g.map,64)).toEqual(before); // fresh-earth shader mask owns the live cut
});

it("keeps small garden planting bounded and removes planting from fresh craters",()=>{
  const g=scene(),plants=villageGardenProps(g.map),before=JSON.stringify(g.map.destruction);
  expect(plants.length).toBeGreaterThan(40);expect(plants.length).toBeLessThanOrEqual(150);
  expect(plants).toEqual(villageGardenProps(g.map));expect(villageGardenProps(industrialMap)).toEqual([]);
  for(const yard of villageYards.filter(y=>y.surface==="garden"))expect(plants.some(p=>Math.abs(p.x-yard.x)<yard.w/2&&Math.abs(p.z-yard.z)<yard.d/2),yard.id).toBe(true);
  for(const p of plants){expect(p.scale[1]).toBeLessThan(.3);expect(p.y).toBeCloseTo(groundHeight(p.x,p.z,g.map)+.008);}
  expect(JSON.stringify(g.map.destruction)).toBe(before);
  const p=plants[0];g.explode({...p,y:p.y+.02},-1,null,{...artilleryExplosionProfile,damage:0,structuralDamage:0});
  expect(villageGardenProps(g.map).some(q=>q.x===p.x&&q.z===p.z)).toBe(false);
});

it("walks actual soldiers from both deployments to all five flags after the outdoor pass",()=>{
  for(const team of ["blue","red"] as const)for(const flag of villageMap.sectors) {
    const g=scene(),p=g.players[0],start=villageMap.spawn[team];
    Object.assign(p,{...start,y:groundHeight(start.x,start.z,g.map),protectedUntil:Infinity});
    const path=pathfind(p,flag,g.map);expect(path.length).toBeGreaterThan(0);let i=0;
    for(let tick=0;tick<1600&&i<path.length;tick++) {
      const next=path[i],dx=next.x-p.x,dz=next.z-p.z,d=Math.hypot(dx,dz);
      if(d<.45&&Math.abs(p.y-(next.y??groundHeight(next.x,next.z,g.map)))<.24){i++;continue;}
      g.step({...idle(),x:dx/Math.max(1,d),z:dz/Math.max(1,d),sprint:true});
    }
    expect(i,`${team} to ${flag.id}`).toBe(path.length);expect(Math.hypot(p.x-flag.x,p.z-flag.z)).toBeLessThan(.6);
    expect(g.tick/30).toBeLessThan(25);
  }
},60000);
