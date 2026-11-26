import {test,expect} from "vitest";
import {verdunMap} from "./verdun-map";
import {Game,TestCollision,pathfind,botCommand,idle} from "./simulation";
import {groundHeight, walkSegment, blocked} from "./map";
import { buildVerdunForest, woodlandDensity, verdunFlankX } from "./verdun-forest";
import { artilleryExplosionProfile, grenadeExplosionProfile } from "./destruction";
import { treeHasCrown, foliageBlocks } from "./vegetation";
import { groundField, groundSurfacePixels } from "./ground-surface";
test("Verdun initializes French and German rosters with five reachable open objectives",()=>{
 const g=new Game(new TestCollision(verdunMap),true,100,41,undefined,{map:verdunMap,ambientArtillery:false});
 expect(g.players).toHaveLength(100); expect(g.players[0].faction).toBe("french"); expect(g.players[50].faction).toBe("german");
 expect(g.sectors.map(s=>s.id)).toEqual(["A","B","C","D","E"]);
 expect(g.map.playArea).toEqual({width:208,depth:128});
 expect([g.map.width,g.map.depth]).toEqual([240,160]);
 expect(g.sectors.filter(s=>s.home==="blue")).toHaveLength(2);
 expect(g.sectors.filter(s=>s.home==="red")).toHaveLength(2);
 for(const flag of g.sectors) {
  expect(blocked(flag.x,flag.z,.4,g.map)).toBe(false);
  for (const side of [-1, 1])
   expect(pathfind(g.map.spawn[side<0?"blue":"red"],flag,g.map).length, `${flag.id} from ${side}`).toBeGreaterThan(0);
 }
});

test("forms dense broken woods on both sides of the relay with low undergrowth and clear objectives", () => {
 const trees = verdunMap.vegetation!.filter(b=>b.kind==="tree");
 expect(trees.length).toBeGreaterThanOrEqual(300);
 expect(trees.length).toBeLessThanOrEqual(330);
 // June 1916: most crowns between the front lines are shelled away, more
 // survive toward each side's line, and behind the lines the woods stand.
 const between = trees.filter(b=>Math.abs(b.x)<59), behind = trees.filter(b=>Math.abs(b.x)>=59);
 expect(between.filter(treeHasCrown).length / between.length).toBeLessThan(.35);
 expect(behind.filter(treeHasCrown).length / behind.length).toBeGreaterThan(.45);
 expect(trees.filter(treeHasCrown).length).toBeGreaterThan(80);
 expect(new Set(trees.map(b=>b.treeStyle)).size).toBe(4);
 for(const side of [-1,1])expect(trees.filter(b=>b.z*side>28).length).toBeGreaterThan(90);
 const central = trees.filter(b=>b.id!.startsWith("verdun-wood-central"));
 expect(central.length).toBeGreaterThanOrEqual(125);
 expect(central.length).toBeLessThanOrEqual(136);
 for (let i=0;i<8;i++)expect(central.filter(b=>b.id!.startsWith(`verdun-wood-central-${i}-`)).length).toBeGreaterThanOrEqual(12);
 for (const side of [-1,1]) {
  expect(central.some(b=>b.x*side>0)).toBe(true);
  expect(central.some(b=>b.z*side>0)).toBe(true);
 }
 expect(central.every(b=>Math.abs(b.x)<33 && Math.abs(b.z)<46)).toBe(true);
 // Fill the formerly bare bands beside C, including their outer extensions.
 for(const side of [-1,1]) for(const end of [-1,1]) {
  expect(central.filter(b=>b.x*side>0&&b.z*end>0&&Math.abs(b.z)<22).length).toBeGreaterThanOrEqual(10);
  expect(central.filter(b=>b.x*side>0&&b.z*end>26).length).toBeGreaterThanOrEqual(10);
 }
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

test("keeps broad cross-field breaks between central tree clusters instead of a continuous screen", () => {
 const g=new Game(new TestCollision(verdunMap),false,100,41,undefined,{map:verdunMap});
 const bare=new TestCollision({...g.map,boxes:g.map.boxes.filter(b=>!b.id?.startsWith("verdun-wood"))});
 let before=0,after=0;
 for(let z=-22;z<=22;z+=2) {
  const a={x:-31,y:4.1,z},b={x:31,y:4.1,z};
  if(bare.ray(a,b)>.995){before++;if(g.collision.ray(a,b)>.995)after++;}
 }
 expect(before).toBeGreaterThan(10);
 // Denser groves add real cover, while at least two thirds of standing lines
 // and all three deliberately broad breaks remain open.
 expect(after/before).toBeGreaterThanOrEqual(2/3);
 for (const z of [-20,1,22]) {
  expect(g.collision.ray({x:-31,y:4.1,z},{x:31,y:4.1,z})).toBe(1);
  // The center now has a sunken relay with dogleg entries (tested below).
  if (z !== 1) expect(pathfind({x:-12,z},{x:12,z},g.map).length).toBeGreaterThan(0);
 }
});

test.each(["flank","central"])("strips crowns and topples %s forest trunks into low physical timber, clearing the standing sightline", (area) => {
 const source=verdunMap.vegetation!.find(b=>b.treeStyle==="pine" && b.id!.startsWith("verdun-wood-central") === (area==="central"))!;
 expect(source).toBeDefined();
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
 // Squad bots fight from cover with far fewer close scrums than the
 // individual bots this floor was first set for (docs/AI_PROPOSAL.md).
 expect(shots).toBeGreaterThan(200);
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
  expect(groundHeight(verdunFlankX(side*51),0,verdunMap)).toBeLessThan(.1);
  expect(groundHeight(verdunFlankX(side*48),15,verdunMap)).toBeGreaterThan(2);
  expect(walkSegment({x:verdunFlankX(side*60),z:0},{x:verdunFlankX(side*51),z:0},verdunMap)).toBe(true);
 }
});
