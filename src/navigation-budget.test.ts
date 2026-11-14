import {expect,test} from "vitest";
import {Game,TestCollision,prepareNavigation,advanceNavigation,navigationChecksPerTick,pathfind,botCommand} from "./simulation";
import {industrialMap,walkSegment} from "./map";
import {artilleryExplosionProfile} from "./destruction";
import {evadeArtillery} from "./artillery";
import {battlePerformance} from "./battle-performance";

const source={...industrialMap,width:64,depth:64,navSpacing:2,boxes:[{kind:"wood" as const,x:0,z:0,w:2,d:24,h:3}]};
test("overlapping destruction coalesces into bounded slices, preserves distant routes and eventually publishes fresh paths",()=>{
 const g=new Game(new TestCollision(source),false,10000,12345,undefined,{map:source,ambientArtillery:false});
 prepareNavigation(g.map);
 const p=g.players[0];Object.assign(p,{x:-20,y:0,z:-20});p.path=[{x:-10,z:-20}];const original=p.path;
 battlePerformance.enabled=true;battlePerformance.reset();
 try {
  g.explode({x:-2,y:.05,z:0},-1,null,{...artilleryExplosionProfile,damage:0});
  expect(p.path).toBe(original);
  advanceNavigation(g.map,[p],1);
  g.explode({x:-2,y:.05,z:2},-1,null,{...artilleryExplosionProfile,damage:0});
  let ticks=0;
  while(!battlePerformance.summary().counters.navigationPublishes && ticks++<100) {
   const before=battlePerformance.summary().counters.navigationChecks??0;
   advanceNavigation(g.map,[p]);
   expect((battlePerformance.summary().counters.navigationChecks??0)-before).toBeLessThanOrEqual(navigationChecksPerTick);
  }
  expect(ticks).toBeGreaterThan(1);expect(ticks).toBeLessThan(100);
  expect(battlePerformance.summary().counters.navigationRestarts).toBe(1);
  const a={x:-15,z:0},b={x:15,z:0};
  const ready=pathfind(a,b,g.map,true);expect(ready.length).toBeGreaterThan(0);
  expect(ready).toEqual(pathfind(a,b,g.map));
  let last=a;for(const point of ready){expect(walkSegment(last,point,g.map)).toBe(true);last=point;}
 } finally {battlePerformance.enabled=false;battlePerformance.reset();}
});

test("a bot rejects a stale graph segment against current physical walkability",()=>{
 const g=new Game(new TestCollision(source),true,10000,12345,undefined,{map:source,ambientArtillery:false});
 prepareNavigation(g.map);const p=g.players[1];
 Object.assign(p,{x:-4,y:0,z:0,nextThink:100,target:-1,spawnProtectedUntil:0});p.path=[{x:4,z:0}];
 expect(walkSegment(p,p.path[0],g.map)).toBe(false);
 botCommand(g,p);expect(p.path).toEqual([]);expect(p.nextThink).toBeLessThan(10);
});

test("artillery evasion uses the available graph without draining a pending rebuild",()=>{
 const g=new Game(new TestCollision(source),false,10000,12345,undefined,{map:source,ambientArtillery:false});
 prepareNavigation(g.map);const p=g.players[0];Object.assign(p,{x:-15,y:0,z:0,nextThink:0});
 g.explode({x:-20,y:.05,z:20},-1,null,{...artilleryExplosionProfile,damage:0});
 p.path=[];p.artilleryEvade={mission:1,until:999,destination:{x:15,z:0},checkedAt:0,lastPosition:{x:p.x,z:p.z}};
 battlePerformance.enabled=true;battlePerformance.reset();
 try {
  expect(evadeArtillery(g,p)).not.toBeNull();expect(p.path.length).toBeGreaterThan(0);
  expect(battlePerformance.summary().counters.navigationChecks??0).toBe(0);
 } finally {battlePerformance.enabled=false;battlePerformance.reset();}
});
