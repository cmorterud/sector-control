import {test,expect} from "vitest";
import {verdunMap} from "./verdun-map";
import {Game,TestCollision,pathfind,botCommand,idle} from "./simulation";
import {groundHeight, walkSegment, blocked} from "./map";
import { buildVerdunForest, woodlandDensity } from "./verdun-forest";
import { artilleryExplosionProfile, grenadeExplosionProfile } from "./destruction";
import { treeHasCrown, foliageBlocks } from "./vegetation";
import { groundField, groundSurfacePixels } from "./ground-surface";
test("Verdun initializes French and German rosters with four reachable open objectives",()=>{
 const g=new Game(new TestCollision(verdunMap),true,100,41,undefined,{map:verdunMap,ambientArtillery:false});
 expect(g.players).toHaveLength(100); expect(g.players[0].faction).toBe("french"); expect(g.players[50].faction).toBe("german");
 expect(g.sectors).toHaveLength(4);
 for(const flag of g.sectors) {
  expect(blocked(flag.x,flag.z,.4,g.map)).toBe(false);
  for (const side of [-1, 1])
   expect(pathfind({x:side*67,z:0},flag,g.map).length, `${flag.id} from ${side}`).toBeGreaterThan(0);
 }
});

test("forms irregular mixed woodland on both flanks with low undergrowth, clear objectives and no trees in the central crossing", () => {
 const trees = verdunMap.vegetation!.filter(b=>b.kind==="tree");
 expect(trees.length).toBeGreaterThanOrEqual(100);
 expect(trees.length).toBeLessThanOrEqual(130);
 expect(trees.filter(treeHasCrown).length).toBeGreaterThan(40);
 expect(new Set(trees.map(b=>b.treeStyle)).size).toBe(4);
 for(const side of [-1,1])expect(trees.filter(b=>b.z*side>28).length).toBeGreaterThan(35);
 expect(trees.some(b=>Math.abs(b.x)<24 && Math.abs(b.z)<28)).toBe(false);
 for(const b of trees) {
  expect(woodlandDensity(verdunMap.woodland!,b.x,b.z)).toBeGreaterThan(0);
  expect(b.baseY).toBeCloseTo(groundHeight(b.x,b.z,verdunMap)-.025);
  for(const s of Object.values(verdunMap.spawn))expect(Math.hypot(b.x-s.x,b.z-s.z)).toBeGreaterThanOrEqual(15);
  for(const s of verdunMap.sectors)expect(Math.hypot(b.x-s.x,b.z-s.z)).toBeGreaterThanOrEqual(5);
 }
 expect(verdunMap.vegetation!.filter(b=>b.kind==="brush").every(b=>b.h<.6)).toBe(true);
 expect(verdunMap.boxes.filter(b=>b.kind==="log").length).toBeGreaterThanOrEqual(10);
 // Regeneration is independent of game seed and does not mutate the map.
 const base={...verdunMap,boxes:verdunMap.boxes.filter(b=>!b.id?.startsWith("verdun-wood"))};
 const authored=[...verdunMap.boxes,...verdunMap.vegetation!].filter(b=>b.id?.startsWith("verdun-wood"));
 const byId=(a:typeof trees[number],b:typeof trees[number])=>a.id!.localeCompare(b.id!);
 expect(buildVerdunForest(base).sort(byId)).toEqual(authored.sort(byId));
});

test("keeps the woodland sap trenches connected, walkable and protected, with usable exits", () => {
 const g=new Game(new TestCollision(verdunMap),false,100,41,undefined,{map:verdunMap});
 for(const r of g.map.terrain!.communicationRoutes!.slice(-3)) {
  for(const p of r.points) {
   expect(groundHeight(p.x,p.z,g.map)).toBeLessThan(.1);
   expect(blocked(p.x,p.z,.6,g.map)).toBe(false);
  }
  for(let i=1;i<r.points.length;i++)expect(walkSegment(r.points[i-1],r.points[i],g.map),JSON.stringify(r)).toBe(true);
 }
 for(const ramp of g.map.terrain!.ramps.slice(-3)) {
  const a={x:ramp.x-ramp.direction*ramp.w/2,z:ramp.z};
  const b={x:ramp.x+ramp.direction*ramp.w/2,z:ramp.z};
  expect(walkSegment(a,b,g.map)).toBe(true);
  expect(walkSegment(b,a,g.map)).toBe(true);
 }
});

test("retains standing cross-field sightlines through the blasted central corridor", () => {
 const g=new Game(new TestCollision(verdunMap),false,100,41,undefined,{map:verdunMap});
 const bare=new TestCollision({...g.map,boxes:g.map.boxes.filter(b=>!b.id?.startsWith("verdun-wood"))});
 let before=0,after=0;
 for(let z=-22;z<=22;z+=2) {
  const a={x:-31,y:4.1,z},b={x:31,y:4.1,z};
  if(bare.ray(a,b)>.995){before++;if(g.collision.ray(a,b)>.995)after++;}
 }
 expect(before).toBeGreaterThan(10);
 expect(after/before).toBeGreaterThanOrEqual(.8);
});

test("strips crowns and topples real forest trunks into low physical timber, clearing the standing sightline", () => {
 const source=verdunMap.vegetation!.find(b=>b.treeStyle==="pine")!;
 const map={...verdunMap,boxes:[],vegetation:[source]};
 const g=new Game(new TestCollision(map),false,100,41,undefined,{map});
 const tree=g.map.destruction!.objects[source.id!],base=tree.original.baseY!;
 const a={x:source.x-3,y:base+source.h*.7,z:source.z+.3},b={x:source.x+3,y:a.y,z:a.z};
 expect(foliageBlocks(g.map,a,b)).toBe(true);
 const at={x:source.x+source.w/2+.2,y:base+.7,z:source.z};
 g.explode(at,-1,null,{...grenadeExplosionProfile,damage:0,craterRadius:0,terrainReach:0});
 expect(tree.stage).toBe(1);
 expect(foliageBlocks(g.map,a,b)).toBe(false);
 const rayA={x:source.x-2,y:base+2.5,z:source.z},rayB={x:source.x+2,y:rayA.y,z:source.z};
 expect(g.collision.ray(rayA,rayB)).toBeLessThan(1);
 g.explode(at,-1,null,{...artilleryExplosionProfile,damage:0,craterRadius:0,terrainReach:0});
 expect(tree.stage).toBe(2);
 expect(g.map.boxes.some(b=>b.id===source.id)).toBe(false);
 const remains=g.map.boxes.filter(b=>b.id?.endsWith(source.id!));
 expect(remains.some(b=>b.kind==="stump")).toBe(true);
 expect(remains.some(b=>b.kind==="log")).toBe(true);
 expect(remains.every(b=>b.h<=1.15 && Number.isFinite(b.baseY))).toBe(true);
 expect(g.collision.ray(rayA,rayB)).toBe(1);
 const log=remains.find(b=>b.kind==="log")!;
 expect(blocked(log.x,log.z,.4,g.map)).toBe(true);
});

test("bakes worn woodland paths and mottled leaf litter into the deformable ground material", () => {
 expect(groundField(verdunMap,-34,48).litter).toBeGreaterThan(.5);
 expect(groundField(verdunMap,0,0).litter).toBe(0);
 for(const track of verdunMap.woodland!.tracks)
  for(const p of track.points)expect(groundField(verdunMap,p.x,p.z).wear).toBeGreaterThanOrEqual(.35);
 const withForest=groundSurfacePixels(verdunMap,64);
 const without=groundSurfacePixels({...verdunMap,terrain:{...verdunMap.terrain!},woodland:undefined},64);
 expect(withForest.diffuse).not.toEqual(without.diffuse);
 expect(withForest.gloss).not.toEqual(without.gloss);
});

test("keeps a full 100-soldier forest battle moving, fighting and capturing after destruction", () => {
 const g=new Game(new TestCollision(verdunMap),true,2700,12345,undefined,{map:verdunMap,humanPlayerIds:[]});
 let shots=0,lateShots=0,captures=0,impacts=0;
 for(let i=0;i<2700;i++) {
  g.step(g.players[0].hp>0?botCommand(g,g.players[0]):idle());
  for(const e of g.events){if(e.type==="fire"){shots++;if(i>1800)lateShots++;}if(e.type==="capture")captures++;if(e.type==="artilleryImpact")impacts++;}
 }
 expect(g.phase).toBe("ended");
 expect(g.players).toHaveLength(100);
 expect(g.players.every(p=>Number.isFinite(p.x+p.y+p.z+p.hp))).toBe(true);
 expect(shots).toBeGreaterThan(300);
 expect(lateShots).toBeGreaterThan(50);
 expect(captures).toBeGreaterThan(0);
 expect(impacts).toBeGreaterThan(0);
 expect(Object.values(g.map.destruction!.objects).some(o=>o.id.startsWith("verdun-wood")&&o.stage===2)).toBe(true);
},20000);
test("rear ramps are walkable and trench floors protect below the banks",()=>{
 const t=verdunMap.terrain!;
 expect(t.shelterBays).toHaveLength(6); expect(t.communicationRoutes!.length).toBeGreaterThan(6);
 for(const team of ["blue","red"] as const){
  const side=team==="blue"?-1:1;
  expect(groundHeight(side*51,0,verdunMap)).toBeLessThan(.1);
  expect(groundHeight(side*48,15,verdunMap)).toBeGreaterThan(2);
  expect(walkSegment({x:side*60,z:0},{x:side*51,z:0},verdunMap)).toBe(true);
 }
});
