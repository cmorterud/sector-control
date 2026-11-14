import { expect, it } from "vitest";
import { villageMap } from "./village-map";
import { bodyBlocked, groundHeight, supportHeight, walkSegment } from "./map";
import { Game, TestCollision, idle, pathfind } from "./simulation";
import { flagContains } from "./domination";
import { artilleryExplosionProfile } from "./destruction";
const scene=()=>new Game(new TestCollision(villageMap),false,6000,12345,undefined,{map:villageMap,ambientArtillery:false});
const localBlast={...artilleryExplosionProfile,damage:0,structuralDamage:2000,structuralRadius:1,craterRadius:0,craterDepth:0,terrainReach:0};
it("authors nine distinct standing buildings around four accessible corner flags and the central manor flag",()=>{
  expect(villageMap.buildings).toHaveLength(9);
  expect(villageMap.buildings!.filter(b=>b.stories===2).map(b=>b.id)).toEqual(["manor"]);
  expect(villageMap.sectors.map(s=>s.id)).toEqual(["A","B","C","D","E"]);
  for(const b of villageMap.buildings!) {
    const parts=villageMap.boxes.filter(p=>p.architecture?.building===b.id);
    expect(parts.filter(p=>p.architecture!.part==="roof").length).toBeGreaterThan(10);
    expect(parts.filter(p=>p.architecture!.bearing).length).toBeGreaterThan(10);
    expect(parts.filter(p=>p.supports).every(p=>p.supports!.length>0),parts.filter(p=>p.supports&&!p.supports.length).map(p=>p.id).join(",")).toBe(true);
  }
  for(const s of villageMap.sectors)expect(bodyBlocked(s.x,s.z,groundHeight(s.x,s.z,villageMap),.6,villageMap)).toBe(false);
});
it("keeps downstairs and upstairs support separate and lets a soldier walk up both stairways",()=>{
  for(const side of [-1,1]) {
    const g=scene(),p=g.players[0];p.x=side*10.5;p.z=-9.3;p.y=2.4;p.protectedUntil=Infinity;
    for(let i=0;i<120;i++)g.step({...idle(),z:1});
    expect(p.z).toBeGreaterThan(6);
    expect(p.y).toBeCloseTo(5.8);
    expect(p.fall).toBeNull();
    for(let i=0;i<30;i++)g.step(idle());
    expect(p.y).toBeCloseTo(5.8);
  }
  expect(supportHeight(0,0,villageMap,2.63)).toBeCloseTo(2.4);
  expect(supportHeight(0,0,villageMap,6)).toBeCloseTo(5.8);
  expect(walkSegment({x:0,z:0,y:2.4},{x:0,z:0,y:5.8},villageMap)).toBe(false);
});
it("routes to a genuine upper-floor position through stairs, without a floor teleport",()=>{
  const g=scene();const start={x:0,z:-16,y:groundHeight(0,-16,g.map)};
  const target={x:0,z:6,y:5.8};
  const route=pathfind(start,target,g.map);
  expect(route.length).toBeGreaterThan(3);
  expect(route.some(p=>p.y!==undefined&&p.y>2.7&&p.y<5.5)).toBe(true);
  let p=start;
  for(const next of route){expect(walkSegment(p,next,g.map),JSON.stringify([p,next])).toBe(true);p={...next,y:next.y??groundHeight(next.x,next.z,g.map)};}
});
it("blasts a local floor hole, drops its occupant and preserves neighboring support",()=>{
  const g=scene(),p=g.players[0];p.x=0;p.z=6;p.y=5.8;p.protectedUntil=Infinity;
  const floor=g.map.boxes.find(b=>b.architecture?.part==="floor" && Math.abs(b.x-p.x)<b.w/2 && Math.abs(b.z-p.z)<b.d/2)!;
  expect(floor).toBeDefined();
  g.explode({x:floor.x,y:floor.baseY!-.05,z:floor.z},-1,null,localBlast);
  expect(g.map.destruction!.objects[floor.id!].stage).toBe(2);
  expect(g.map.boxes.some(b=>b.architecture?.part==="floor")).toBe(true);
  expect(p.fall).not.toBeNull();
  for(let i=0;i<50;i++)g.step(idle());
  expect(p.y).toBeLessThan(3.2);expect(p.fall).toBeNull();
});
it("breaks individual wall panels and collapses a building only after enough bearing support is lost",()=>{
  const g=scene();
  const walls=Object.values(g.map.destruction!.objects).filter(o=>o.original.architecture?.building==="school"&&o.original.architecture.bearing);
  const wall=walls[0].original;
  g.explode({x:wall.x,y:wall.baseY!+.4,z:wall.z-.3},-1,null,localBlast);
  expect(g.map.boxes.some(b=>b.architecture?.building==="school"&&b.architecture.part==="roof")).toBe(true);
  for(const o of walls) {
    const b=o.original;
    for(let n=0;n<2;n++)g.explode({x:b.x,y:b.baseY!+.2,z:b.z-.3},-1,null,{...localBlast,structuralRadius:2});
  }
  expect(g.map.boxes.filter(b=>b.architecture?.building==="school")).toHaveLength(0);
  expect(g.map.boxes.some(b=>b.id?.startsWith("village-rubble-school"))).toBe(true);
  expect(villageMap.boxes.some(b=>b.id===wall.id)).toBe(true);
  const flag=g.sectors[0];expect(bodyBlocked(flag.x,flag.z,groundHeight(flag.x,flag.z,g.map),.6,g.map)).toBe(false);
});

it("makes real window holes and roof surfaces block only where their geometry exists",()=>{
  const g=scene();
  // The school has north-facing openings at even bays; a sill protects the body.
  const wall=g.map.boxes.find(b=>b.id==="village-school-north-0-2-0")!;
  const ray=(y:number)=>g.collision.ray({x:wall.x,y,z:wall.z-2},{x:wall.x,y,z:wall.z+2});
  expect(ray(3.05)).toBeLessThan(1);expect(ray(4)).toBe(1);
  const roof=g.map.boxes.find(b=>b.architecture?.building==="manor"&&b.architecture.part==="roof"&&b.architecture.roofPitch)!;
  const from={x:roof.x,y:14,z:roof.z},to={...from,y:6};
  const before=g.collision.ray(from,to);expect(before).toBeLessThan(1);
  const hitY=from.y+(to.y-from.y)*before;
  expect(hitY).toBeCloseTo(roof.baseY!+roof.h/2+roof.h/(2*Math.cos(roof.architecture!.roofPitch!)),3);
  g.explode({x:roof.x,y:hitY+.05,z:roof.z},-1,null,localBlast);
  expect(g.map.destruction!.objects[roof.id!].stage).toBe(2);
  expect(g.collision.ray(from,to)).toBeGreaterThan(before);
});

it("captures central C in the manor hall, without capturing through its upstairs floor",()=>{
  const g=scene(),c=g.sectors.find(s=>s.id==="C")!;
  expect(c.x).toBe(0);expect(c.home).toBeUndefined();
  expect(flagContains(g,{...c,y:2.4},c)).toBe(true);
  expect(flagContains(g,{...c,y:5.8},c)).toBe(false);
});
